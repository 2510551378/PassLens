#include "PassLens/PassLensInstrumentation.h"

#include "mlir/IR/BuiltinAttributes.h"
#include "mlir/IR/Operation.h"
#include "mlir/IR/OperationSupport.h"
#include "mlir/IR/SymbolTable.h"
#include "mlir/Pass/Pass.h"
#include "mlir/Pass/PassManager.h"
#include "llvm/Support/FileSystem.h"
#include "llvm/Support/raw_ostream.h"

#include <chrono>
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

using Clock = std::chrono::steady_clock;

namespace passlens {
namespace {

struct Metrics {
  int64_t lines = 0;
  int64_t ops = 0;
  std::map<std::string, int64_t> opCounts;
};

struct ActivePass {
  int64_t index = 0;
  std::string passName;
  std::string scope;
  std::string irBefore;
  Metrics metricsBefore;
  Clock::time_point startedAt;
};

struct Stage {
  int64_t index = 0;
  std::string passName;
  std::string scope;
  bool changed = false;
  double durationMs = 0.0;
  std::string verifier = "ok";
  Metrics metricsBefore;
  Metrics metricsAfter;
  std::string irBefore;
  std::string irAfter;
};

std::string makeKey(mlir::Pass *pass, mlir::Operation *op) {
  std::ostringstream os;
  os << reinterpret_cast<std::uintptr_t>(pass) << ":"
     << reinterpret_cast<std::uintptr_t>(op);
  return os.str();
}

std::string escapeJson(llvm::StringRef value) {
  std::string out;
  out.reserve(value.size() + 16);
  for (char ch : value) {
    switch (ch) {
    case '\\':
      out += "\\\\";
      break;
    case '"':
      out += "\\\"";
      break;
    case '\b':
      out += "\\b";
      break;
    case '\f':
      out += "\\f";
      break;
    case '\n':
      out += "\\n";
      break;
    case '\r':
      out += "\\r";
      break;
    case '\t':
      out += "\\t";
      break;
    default:
      if (static_cast<unsigned char>(ch) < 0x20) {
        char buffer[7];
        std::snprintf(buffer, sizeof(buffer), "\\u%04x", ch);
        out += buffer;
      } else {
        out += ch;
      }
      break;
    }
  }
  return out;
}

std::string jsonString(llvm::StringRef value) {
  return "\"" + escapeJson(value) + "\"";
}

std::string printOperation(mlir::Operation *op) {
  std::string text;
  llvm::raw_string_ostream os(text);
  op->print(os);
  return os.str();
}

int64_t countLines(llvm::StringRef text) {
  if (text.empty())
    return 0;

  int64_t lines = 0;
  bool sawNonWhitespace = false;
  for (char ch : text) {
    if (ch == '\n') {
      if (sawNonWhitespace)
        ++lines;
      sawNonWhitespace = false;
      continue;
    }
    if (!std::isspace(static_cast<unsigned char>(ch)))
      sawNonWhitespace = true;
  }
  if (sawNonWhitespace)
    ++lines;
  return lines;
}

Metrics collectMetrics(mlir::Operation *root, llvm::StringRef printedIr) {
  Metrics metrics;
  metrics.lines = countLines(printedIr);
  root->walk([&](mlir::Operation *op) {
    ++metrics.ops;
    std::string name = op->getName().getStringRef().str();
    ++metrics.opCounts[name];
  });
  return metrics;
}

std::string getScope(mlir::Operation *op) {
  std::string scope = op->getName().getStringRef().str();
  if (auto symbolName = mlir::SymbolTable::getSymbolName(op)) {
    scope += " @";
    scope += symbolName.getValue().str();
  }
  return scope;
}

std::string getPassName(mlir::Pass *pass) {
  llvm::StringRef name = pass->getName();
  return name.empty() ? "<anonymous-pass>" : name.str();
}

void writeMetrics(llvm::raw_ostream &os, const Metrics &metrics,
                  unsigned indent) {
  std::string pad(indent, ' ');
  os << "{\n";
  os << pad << "  \"lines\": " << metrics.lines << ",\n";
  os << pad << "  \"ops\": " << metrics.ops;
  for (const auto &entry : metrics.opCounts) {
    os << ",\n" << pad << "  " << jsonString(entry.first) << ": "
       << entry.second;
  }
  os << "\n" << pad << "}";
}

void writeStage(llvm::raw_ostream &os, const Stage &stage,
                bool includeIr, unsigned indent) {
  std::string pad(indent, ' ');
  os << pad << "{\n";
  os << pad << "  \"index\": " << stage.index << ",\n";
  os << pad << "  \"pass\": " << jsonString(stage.passName) << ",\n";
  os << pad << "  \"scope\": " << jsonString(stage.scope) << ",\n";
  os << pad << "  \"changed\": " << (stage.changed ? "true" : "false")
     << ",\n";
  os << pad << "  \"durationMs\": " << stage.durationMs << ",\n";
  os << pad << "  \"verifier\": " << jsonString(stage.verifier) << ",\n";
  os << pad << "  \"metricsBefore\": ";
  writeMetrics(os, stage.metricsBefore, indent + 2);
  os << ",\n";
  os << pad << "  \"metricsAfter\": ";
  writeMetrics(os, stage.metricsAfter, indent + 2);
  if (includeIr) {
    os << ",\n";
    os << pad << "  \"irBefore\": " << jsonString(stage.irBefore) << ",\n";
    os << pad << "  \"irAfter\": " << jsonString(stage.irAfter) << "\n";
  } else {
    os << "\n";
  }
  os << pad << "}";
}

double elapsedMs(Clock::time_point startedAt) {
  auto elapsed = std::chrono::duration<double, std::milli>(
      Clock::now() - startedAt);
  return elapsed.count();
}

} // namespace

struct PassLensInstrumentation::Impl {
  explicit Impl(PassLensOptions options) : options(std::move(options)) {}

  PassLensOptions options;
  std::mutex mutex;
  int64_t nextIndex = 0;
  std::map<std::string, ActivePass> active;
  std::vector<Stage> stages;
  bool wroteTrace = false;
};

PassLensInstrumentation::PassLensInstrumentation(PassLensOptions options)
    : impl(std::make_unique<Impl>(std::move(options))) {}

PassLensInstrumentation::~PassLensInstrumentation() { writeTrace(); }

void PassLensInstrumentation::runBeforePass(mlir::Pass *pass,
                                            mlir::Operation *op) {
  std::lock_guard<std::mutex> lock(impl->mutex);
  std::string ir = impl->options.includeIr ? printOperation(op) : "";
  ActivePass active;
  active.index = impl->nextIndex++;
  active.passName = getPassName(pass);
  active.scope = getScope(op);
  active.irBefore = ir;
  active.metricsBefore = collectMetrics(op, ir);
  active.startedAt = Clock::now();
  impl->active[makeKey(pass, op)] = std::move(active);
}

void PassLensInstrumentation::runAfterPass(mlir::Pass *pass,
                                           mlir::Operation *op) {
  std::lock_guard<std::mutex> lock(impl->mutex);
  auto key = makeKey(pass, op);
  auto it = impl->active.find(key);
  if (it == impl->active.end())
    return;

  std::string irAfter = impl->options.includeIr ? printOperation(op) : "";
  Stage stage;
  stage.index = it->second.index;
  stage.passName = it->second.passName;
  stage.scope = it->second.scope;
  stage.durationMs = elapsedMs(it->second.startedAt);
  stage.verifier = "ok";
  stage.metricsBefore = std::move(it->second.metricsBefore);
  stage.metricsAfter = collectMetrics(op, irAfter);
  stage.irBefore = std::move(it->second.irBefore);
  stage.irAfter = std::move(irAfter);
  stage.changed = stage.irBefore != stage.irAfter;
  impl->stages.push_back(std::move(stage));
  impl->active.erase(it);
}

void PassLensInstrumentation::runAfterPassFailed(mlir::Pass *pass,
                                                 mlir::Operation *op) {
  std::lock_guard<std::mutex> lock(impl->mutex);
  auto key = makeKey(pass, op);
  auto it = impl->active.find(key);
  if (it == impl->active.end())
    return;

  std::string irAfter = impl->options.includeIr ? printOperation(op) : "";
  Stage stage;
  stage.index = it->second.index;
  stage.passName = it->second.passName;
  stage.scope = it->second.scope;
  stage.durationMs = elapsedMs(it->second.startedAt);
  stage.verifier = "failed";
  stage.metricsBefore = std::move(it->second.metricsBefore);
  stage.metricsAfter = collectMetrics(op, irAfter);
  stage.irBefore = std::move(it->second.irBefore);
  stage.irAfter = std::move(irAfter);
  stage.changed = stage.irBefore != stage.irAfter;
  impl->stages.push_back(std::move(stage));
  impl->active.erase(it);
}

void PassLensInstrumentation::writeTrace() {
  std::lock_guard<std::mutex> lock(impl->mutex);
  if (impl->wroteTrace || impl->options.outputPath.empty())
    return;
  impl->wroteTrace = true;

  std::error_code ec;
  llvm::raw_fd_ostream os(impl->options.outputPath, ec,
                         llvm::sys::fs::OF_Text);
  if (ec) {
    llvm::errs() << "pass-lens: could not write trace to "
                 << impl->options.outputPath << ": " << ec.message() << "\n";
    return;
  }

  os << "{\n";
  os << "  \"schemaVersion\": 1,\n";
  os << "  \"tool\": " << jsonString(impl->options.tool) << ",\n";
  if (!impl->options.input.empty())
    os << "  \"input\": " << jsonString(impl->options.input) << ",\n";
  if (!impl->options.pipeline.empty())
    os << "  \"pipeline\": " << jsonString(impl->options.pipeline) << ",\n";
  os << "  \"stages\": [\n";
  for (size_t i = 0; i < impl->stages.size(); ++i) {
    writeStage(os, impl->stages[i], impl->options.includeIr, 4);
    if (i + 1 != impl->stages.size())
      os << ",";
    os << "\n";
  }
  os << "  ]\n";
  os << "}\n";
}

void addPassLensInstrumentation(mlir::PassManager &pm,
                                PassLensOptions options) {
  pm.addInstrumentation(
      std::make_unique<PassLensInstrumentation>(std::move(options)));
}

} // namespace passlens

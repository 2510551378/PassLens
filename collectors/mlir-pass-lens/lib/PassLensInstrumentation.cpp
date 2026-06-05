#include "PassLens/PassLensInstrumentation.h"

#include "mlir/IR/BuiltinAttributes.h"
#include "mlir/IR/Location.h"
#include "mlir/IR/Operation.h"
#include "mlir/IR/OperationSupport.h"
#include "mlir/IR/SymbolTable.h"
#include "mlir/Pass/Pass.h"
#include "mlir/Pass/PassManager.h"
#include "llvm/ADT/SmallString.h"
#include "llvm/Support/FileSystem.h"
#include "llvm/Support/Path.h"
#include "llvm/Support/raw_ostream.h"

#include <algorithm>
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
  std::string argument;
  std::string opName;
  std::string symbol;
  std::string scope;
  std::string location;
  std::string irBefore;
  Metrics metricsBefore;
  Clock::time_point startedAt;
};

struct Stage {
  int64_t index = 0;
  std::string passName;
  std::string argument;
  std::string opName;
  std::string symbol;
  std::string scope;
  std::string status = "ok";
  bool changed = false;
  double durationMs = 0.0;
  std::string verifier = "ok";
  std::string location;
  std::string diagnostics;
  Metrics metricsBefore;
  Metrics metricsAfter;
  std::string irBefore;
  std::string irAfter;
  std::string beforeArtifactPath;
  std::string afterArtifactPath;
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

std::string artifactFilename(int64_t stageIndex, llvm::StringRef suffix) {
  char buffer[64];
  std::snprintf(buffer, sizeof(buffer), "stage-%06lld.%s.mlir",
                static_cast<long long>(stageIndex), suffix.str().c_str());
  return buffer;
}

std::string joinJsonPath(llvm::StringRef dir, llvm::StringRef filename) {
  if (dir.empty())
    return filename.str();
  std::string result = dir.str();
  if (!result.empty() && result.back() != '/' && result.back() != '\\')
    result += "/";
  result += filename.str();
  return result;
}

std::string resolveArtifactDirForWrite(const PassLensOptions &options) {
  if (options.artifactDir.empty())
    return "";
  if (llvm::sys::path::is_absolute(options.artifactDir))
    return options.artifactDir;

  llvm::SmallString<256> base(options.outputPath);
  llvm::sys::path::remove_filename(base);
  if (base.empty())
    return options.artifactDir;
  llvm::sys::path::append(base, options.artifactDir);
  return base.str().str();
}

bool writeArtifactFile(llvm::StringRef filePath, llvm::StringRef text) {
  std::error_code ec;
  llvm::raw_fd_ostream os(filePath, ec, llvm::sys::fs::OF_Text);
  if (ec) {
    llvm::errs() << "pass-lens: could not write artifact " << filePath
                 << ": " << ec.message() << "\n";
    return false;
  }
  os << text;
  return true;
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

Metrics collectMetrics(mlir::Operation *root, llvm::StringRef printedIr,
                       const PassLensOptions &options) {
  Metrics metrics;
  metrics.lines = countLines(printedIr);
  root->walk([&](mlir::Operation *op) {
    ++metrics.ops;
    std::string name = op->getName().getStringRef().str();
    ++metrics.opCounts[name];
  });
  if (options.metricsHook)
    options.metricsHook(root, metrics.opCounts);
  return metrics;
}

std::string collectDiagnostics(mlir::Pass *pass, mlir::Operation *op,
                               const PassLensOptions &options) {
  if (!options.diagnosticsHook)
    return "";
  return options.diagnosticsHook(pass, op);
}

std::string getScope(mlir::Operation *op) {
  std::string scope = op->getName().getStringRef().str();
  if (auto symbolName = mlir::SymbolTable::getSymbolName(op)) {
    scope += " @";
    scope += symbolName.getValue().str();
  }
  return scope;
}

std::string getSymbol(mlir::Operation *op) {
  if (auto symbolName = mlir::SymbolTable::getSymbolName(op)) {
    std::string symbol = "@";
    symbol += symbolName.getValue().str();
    return symbol;
  }
  return "";
}

std::string getOperationName(mlir::Operation *op) {
  return op->getName().getStringRef().str();
}

std::string getLocation(mlir::Operation *op) {
  std::string text;
  llvm::raw_string_ostream os(text);
  op->getLoc().print(os);
  return os.str();
}

std::string getPassName(mlir::Pass *pass) {
  llvm::StringRef name = pass->getName();
  return name.empty() ? "<anonymous-pass>" : name.str();
}

std::string getPassArgument(mlir::Pass *pass) {
  llvm::StringRef argument = pass->getArgument();
  return argument.empty() ? getPassName(pass) : argument.str();
}

bool shouldRecordPass(mlir::Pass *pass) {
  return getPassArgument(pass) != "mlir::detail::OpToOpPassAdaptor";
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

void writeArtifacts(llvm::raw_ostream &os, const Stage &stage,
                    unsigned indent) {
  std::string pad(indent, ' ');
  os << "{\n";
  os << pad << "  \"beforePath\": " << jsonString(stage.beforeArtifactPath)
     << ",\n";
  os << pad << "  \"afterPath\": " << jsonString(stage.afterArtifactPath)
     << "\n";
  os << pad << "}";
}

void writeStage(llvm::raw_ostream &os, const Stage &stage,
                bool includeInlineIr, bool includeArtifactIr,
                unsigned indent) {
  std::string pad(indent, ' ');
  os << pad << "{\n";
  os << pad << "  \"index\": " << stage.index << ",\n";
  os << pad << "  \"pass\": " << jsonString(stage.passName) << ",\n";
  os << pad << "  \"argument\": " << jsonString(stage.argument) << ",\n";
  os << pad << "  \"opName\": " << jsonString(stage.opName) << ",\n";
  if (!stage.symbol.empty())
    os << pad << "  \"symbol\": " << jsonString(stage.symbol) << ",\n";
  os << pad << "  \"scope\": " << jsonString(stage.scope) << ",\n";
  os << pad << "  \"status\": " << jsonString(stage.status) << ",\n";
  os << pad << "  \"changed\": " << (stage.changed ? "true" : "false")
     << ",\n";
  os << pad << "  \"durationMs\": " << stage.durationMs << ",\n";
  os << pad << "  \"verifier\": " << jsonString(stage.verifier) << ",\n";
  os << pad << "  \"location\": " << jsonString(stage.location) << ",\n";
  if (!stage.diagnostics.empty())
    os << pad << "  \"diagnostics\": " << jsonString(stage.diagnostics)
       << ",\n";
  os << pad << "  \"metricsBefore\": ";
  writeMetrics(os, stage.metricsBefore, indent + 2);
  os << ",\n";
  os << pad << "  \"metricsAfter\": ";
  writeMetrics(os, stage.metricsAfter, indent + 2);
  if (includeArtifactIr && !stage.beforeArtifactPath.empty() &&
      !stage.afterArtifactPath.empty()) {
    os << ",\n";
    os << pad << "  \"artifacts\": ";
    writeArtifacts(os, stage, indent + 2);
    os << "\n";
  } else if (includeInlineIr) {
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

void materializeStageArtifacts(Stage &stage, const PassLensOptions &options) {
  if (!options.includeIr || options.artifactDir.empty())
    return;

  const std::string writeDir = resolveArtifactDirForWrite(options);
  std::error_code ec = llvm::sys::fs::create_directories(writeDir);
  if (ec) {
    llvm::errs() << "pass-lens: could not create artifact directory "
                 << writeDir << ": " << ec.message() << "\n";
    return;
  }

  const std::string beforeName = artifactFilename(stage.index, "before");
  const std::string afterName = artifactFilename(stage.index, "after");

  llvm::SmallString<256> beforePath(writeDir);
  llvm::sys::path::append(beforePath, beforeName);
  llvm::SmallString<256> afterPath(writeDir);
  llvm::sys::path::append(afterPath, afterName);

  if (!writeArtifactFile(beforePath, stage.irBefore) ||
      !writeArtifactFile(afterPath, stage.irAfter))
    return;

  stage.beforeArtifactPath = joinJsonPath(options.artifactDir, beforeName);
  stage.afterArtifactPath = joinJsonPath(options.artifactDir, afterName);
  stage.irBefore.clear();
  stage.irAfter.clear();
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
  if (!shouldRecordPass(pass))
    return;

  std::lock_guard<std::mutex> lock(impl->mutex);
  std::string ir = impl->options.includeIr ? printOperation(op) : "";
  ActivePass active;
  active.index = impl->nextIndex++;
  active.passName = getPassName(pass);
  active.argument = getPassArgument(pass);
  active.opName = getOperationName(op);
  active.symbol = getSymbol(op);
  active.scope = getScope(op);
  active.location = getLocation(op);
  active.irBefore = ir;
  active.metricsBefore = collectMetrics(op, ir, impl->options);
  active.startedAt = Clock::now();
  impl->active[makeKey(pass, op)] = std::move(active);
}

void PassLensInstrumentation::runAfterPass(mlir::Pass *pass,
                                           mlir::Operation *op) {
  if (!shouldRecordPass(pass))
    return;

  std::lock_guard<std::mutex> lock(impl->mutex);
  auto key = makeKey(pass, op);
  auto it = impl->active.find(key);
  if (it == impl->active.end())
    return;

  std::string irAfter = impl->options.includeIr ? printOperation(op) : "";
  Stage stage;
  stage.index = it->second.index;
  stage.passName = it->second.passName;
  stage.argument = it->second.argument;
  stage.opName = it->second.opName;
  stage.symbol = it->second.symbol;
  stage.scope = it->second.scope;
  stage.durationMs = elapsedMs(it->second.startedAt);
  stage.verifier = "ok";
  stage.location = it->second.location;
  stage.diagnostics = collectDiagnostics(pass, op, impl->options);
  stage.metricsBefore = std::move(it->second.metricsBefore);
  stage.metricsAfter = collectMetrics(op, irAfter, impl->options);
  stage.irBefore = std::move(it->second.irBefore);
  stage.irAfter = std::move(irAfter);
  stage.changed = stage.irBefore != stage.irAfter;
  stage.status = stage.changed ? "changed" : "ok";
  materializeStageArtifacts(stage, impl->options);
  impl->stages.push_back(std::move(stage));
  impl->active.erase(it);
}

void PassLensInstrumentation::runAfterPassFailed(mlir::Pass *pass,
                                                 mlir::Operation *op) {
  if (!shouldRecordPass(pass))
    return;

  std::lock_guard<std::mutex> lock(impl->mutex);
  auto key = makeKey(pass, op);
  auto it = impl->active.find(key);
  if (it == impl->active.end())
    return;

  std::string irAfter = impl->options.includeIr ? printOperation(op) : "";
  Stage stage;
  stage.index = it->second.index;
  stage.passName = it->second.passName;
  stage.argument = it->second.argument;
  stage.opName = it->second.opName;
  stage.symbol = it->second.symbol;
  stage.scope = it->second.scope;
  stage.durationMs = elapsedMs(it->second.startedAt);
  stage.status = "pass_failed";
  stage.verifier = "failed";
  stage.location = it->second.location;
  stage.diagnostics = collectDiagnostics(pass, op, impl->options);
  stage.metricsBefore = std::move(it->second.metricsBefore);
  stage.metricsAfter = collectMetrics(op, irAfter, impl->options);
  stage.irBefore = std::move(it->second.irBefore);
  stage.irAfter = std::move(irAfter);
  stage.changed = stage.irBefore != stage.irAfter;
  materializeStageArtifacts(stage, impl->options);
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

  std::sort(impl->stages.begin(), impl->stages.end(),
            [](const Stage &lhs, const Stage &rhs) {
              return lhs.index < rhs.index;
            });

  os << "{\n";
  os << "  \"schemaVersion\": 1,\n";
  os << "  \"collectorVersion\": "
     << jsonString(kPassLensCollectorVersion) << ",\n";
  os << "  \"tool\": " << jsonString(impl->options.tool) << ",\n";
  os << "  \"capture\": {\n";
  const bool artifactIr =
      impl->options.includeIr && !impl->options.artifactDir.empty();
  os << "    \"ir\": "
     << jsonString(impl->options.includeIr
                       ? (artifactIr ? "artifact" : "inline")
                       : "omitted")
     << ",\n";
  os << "    \"metrics\": true,\n";
  os << "    \"timing\": true\n";
  os << "  },\n";
  if (!impl->options.input.empty())
    os << "  \"input\": " << jsonString(impl->options.input) << ",\n";
  if (!impl->options.pipeline.empty())
    os << "  \"pipeline\": " << jsonString(impl->options.pipeline) << ",\n";
  os << "  \"stages\": [\n";
  for (size_t i = 0; i < impl->stages.size(); ++i) {
    writeStage(os, impl->stages[i], impl->options.includeIr, artifactIr, 4);
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

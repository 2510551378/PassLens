#include "PassLens/PassLensInstrumentation.h"

#include "mlir/IR/AsmState.h"
#include "mlir/IR/BuiltinOps.h"
#include "mlir/IR/Diagnostics.h"
#include "mlir/IR/DialectRegistry.h"
#include "mlir/IR/MLIRContext.h"
#include "mlir/InitAllDialects.h"
#include "mlir/InitAllPasses.h"
#include "mlir/Parser/Parser.h"
#include "mlir/Pass/PassManager.h"
#include "mlir/Pass/PassRegistry.h"
#include "mlir/Support/FileUtilities.h"
#include "mlir/Support/LogicalResult.h"
#include "llvm/Support/CommandLine.h"
#include "llvm/Support/InitLLVM.h"
#include "llvm/Support/MemoryBuffer.h"
#include "llvm/Support/SourceMgr.h"
#include "llvm/Support/ToolOutputFile.h"
#include "llvm/Support/raw_ostream.h"

#include <memory>
#include <string>
#include <utility>

namespace cl = llvm::cl;

static cl::opt<std::string>
    inputFilename(cl::Positional, cl::desc("<input mlir file>"),
                  cl::init("-"));

static cl::opt<std::string>
    outputFilename("o", cl::desc("Output MLIR file"),
                   cl::value_desc("filename"), cl::init("-"));

static cl::opt<std::string>
    passPipeline("pass-pipeline",
                 cl::desc("MLIR textual pass pipeline to run"),
                 cl::value_desc("pipeline"), cl::Required);

static cl::opt<std::string>
    traceFilename("pass-lens-trace",
                  cl::desc("Write Pass Lens JSON trace to this file"),
                  cl::value_desc("filename"), cl::Required);

static cl::opt<bool>
    omitIr("pass-lens-no-ir",
           cl::desc("Record metrics only; omit before/after IR snapshots"),
           cl::init(false));

static cl::opt<std::string>
    artifactDir("pass-lens-artifact-dir",
                cl::desc("Write before/after IR snapshots to this directory "
                         "and store artifact paths in the trace"),
                cl::value_desc("directory"), cl::init(""));

static cl::opt<bool>
    allowUnregisteredDialects("allow-unregistered-dialect",
                              cl::desc("Allow parsing unregistered dialects"),
                              cl::init(false));

static cl::opt<bool>
    disableThreading("pass-lens-disable-threading",
                     cl::desc("Disable MLIR threading for deterministic traces"),
                     cl::init(true));

static std::string quoteArg(llvm::StringRef value) {
  if (value.find(' ') == llvm::StringRef::npos)
    return value.str();
  return "\"" + value.str() + "\"";
}

int main(int argc, char **argv) {
  llvm::InitLLVM initLLVM(argc, argv);
  mlir::registerAllPasses();

  cl::ParseCommandLineOptions(
      argc, argv,
      "pass-lens-mlir-opt: run an MLIR pass pipeline and emit a Pass Lens trace\n");

  mlir::DialectRegistry registry;
  mlir::registerAllDialects(registry);

  mlir::MLIRContext context(registry);
  if (allowUnregisteredDialects)
    context.allowUnregisteredDialects();
  if (disableThreading)
    context.disableMultithreading();

  std::string errorMessage;
  std::unique_ptr<llvm::MemoryBuffer> input =
      mlir::openInputFile(inputFilename, &errorMessage);
  if (!input) {
    llvm::errs() << errorMessage << "\n";
    return 1;
  }

  llvm::SourceMgr sourceMgr;
  sourceMgr.AddNewSourceBuffer(std::move(input), llvm::SMLoc());
  mlir::SourceMgrDiagnosticHandler sourceMgrHandler(sourceMgr, &context);
  mlir::OwningOpRef<mlir::ModuleOp> module =
      mlir::parseSourceFile<mlir::ModuleOp>(sourceMgr, &context);
  if (!module) {
    llvm::errs() << "pass-lens: failed to parse input MLIR\n";
    return 1;
  }

  passlens::PassLensOptions traceOptions;
  traceOptions.outputPath = traceFilename;
  traceOptions.tool = "pass-lens-mlir-opt";
  traceOptions.input = inputFilename;
  traceOptions.pipeline = passPipeline;
  traceOptions.artifactDir = artifactDir;
  traceOptions.includeIr = !omitIr;
  traceOptions.command = "pass-lens-mlir-opt " + quoteArg(inputFilename) +
                        " --pass-pipeline=" + quoteArg(passPipeline) +
                        " --pass-lens-trace=" + quoteArg(traceFilename) +
                        " -o " + quoteArg(outputFilename);
  if (disableThreading)
    traceOptions.command += " --pass-lens-disable-threading";
  if (omitIr)
    traceOptions.command += " --pass-lens-no-ir";
  if (!artifactDir.empty())
    traceOptions.command +=
        " --pass-lens-artifact-dir=" + quoteArg(artifactDir);
  traceOptions.compilerName = "pass-lens-mlir-opt";

  mlir::PassManager pm(&context, mlir::ModuleOp::getOperationName());

  mlir::FailureOr<mlir::OpPassManager> rootPipeline =
      mlir::parsePassPipeline(passPipeline, llvm::nulls());
  if (succeeded(rootPipeline) &&
      rootPipeline->getOpAnchorName() == mlir::ModuleOp::getOperationName()) {
    static_cast<mlir::OpPassManager &>(pm) = std::move(*rootPipeline);
  } else if (failed(mlir::parsePassPipeline(passPipeline, pm))) {
    llvm::errs() << "pass-lens: failed to parse pass pipeline\n";
    return 1;
  }

  pm.enableVerifier(true);
  auto traceInstrumentation =
      std::make_unique<passlens::PassLensInstrumentation>(std::move(traceOptions));
  auto *traceInstrumentationPtr = traceInstrumentation.get();
  pm.addInstrumentation(std::move(traceInstrumentation));

  if (failed(pm.run(module.get()))) {
    traceInstrumentationPtr->setExitCode(1);
    llvm::errs() << "pass-lens: pass pipeline failed\n";
    return 1;
  }
  traceInstrumentationPtr->setExitCode(0);

  std::unique_ptr<llvm::ToolOutputFile> output =
      mlir::openOutputFile(outputFilename, &errorMessage);
  if (!output) {
    llvm::errs() << errorMessage << "\n";
    return 1;
  }

  module->print(output->os());
  output->keep();
  return 0;
}

#ifndef PASS_LENS_INSTRUMENTATION_H
#define PASS_LENS_INSTRUMENTATION_H

#include "mlir/Pass/PassInstrumentation.h"
#include "llvm/ADT/StringRef.h"

#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <string>

namespace mlir {
class Operation;
class Pass;
class PassManager;
} // namespace mlir

namespace passlens {

inline constexpr const char *kPassLensCollectorVersion = "0.1.0";

using PassLensMetricMap = std::map<std::string, int64_t>;
using PassLensMetricsHook =
    std::function<void(mlir::Operation *op, PassLensMetricMap &metrics)>;
using PassLensDiagnosticsHook =
    std::function<std::string(mlir::Pass *pass, mlir::Operation *op)>;

struct PassLensProvenance {
  std::string kind;
  std::string description;
  std::string source;
  std::string generatedBy;
  std::string capturedAt;
};

struct PassLensOptions {
  std::string outputPath;
  std::string tool = "pass-lens-mlir";
  std::string input;
  std::string pipeline;
  std::string command;
  std::optional<PassLensProvenance> provenance;
  std::string artifactDir;
  bool includeIr = true;
  std::optional<int> exitCode;
  std::string diagnostics;
  std::string compilerName;
  std::string compilerVersion;
  std::string compilerGitSha;
  std::string targetBackend;
  std::string targetPlatform;
  std::string targetTriple;
  PassLensMetricsHook metricsHook;
  PassLensDiagnosticsHook diagnosticsHook;
};

class PassLensInstrumentation : public mlir::PassInstrumentation {
public:
  explicit PassLensInstrumentation(PassLensOptions options);
  ~PassLensInstrumentation() override;

  void runBeforePass(mlir::Pass *pass, mlir::Operation *op) override;
  void runAfterPass(mlir::Pass *pass, mlir::Operation *op) override;
  void runAfterPassFailed(mlir::Pass *pass, mlir::Operation *op) override;

  void writeTrace();
  void setExitCode(int exitCode);

private:
  struct Impl;
  std::unique_ptr<Impl> impl;
};

void addPassLensInstrumentation(mlir::PassManager &pm,
                                PassLensOptions options);

} // namespace passlens

#endif // PASS_LENS_INSTRUMENTATION_H

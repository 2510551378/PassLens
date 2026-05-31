#ifndef PASS_LENS_INSTRUMENTATION_H
#define PASS_LENS_INSTRUMENTATION_H

#include "mlir/Pass/PassInstrumentation.h"
#include "llvm/ADT/StringRef.h"

#include <memory>
#include <string>

namespace mlir {
class Operation;
class Pass;
class PassManager;
} // namespace mlir

namespace passlens {

inline constexpr const char *kPassLensCollectorVersion = "0.1.0";

struct PassLensOptions {
  std::string outputPath;
  std::string tool = "pass-lens-mlir";
  std::string input;
  std::string pipeline;
  bool includeIr = true;
};

class PassLensInstrumentation : public mlir::PassInstrumentation {
public:
  explicit PassLensInstrumentation(PassLensOptions options);
  ~PassLensInstrumentation() override;

  void runBeforePass(mlir::Pass *pass, mlir::Operation *op) override;
  void runAfterPass(mlir::Pass *pass, mlir::Operation *op) override;
  void runAfterPassFailed(mlir::Pass *pass, mlir::Operation *op) override;

  void writeTrace();

private:
  struct Impl;
  std::unique_ptr<Impl> impl;
};

void addPassLensInstrumentation(mlir::PassManager &pm,
                                PassLensOptions options);

} // namespace passlens

#endif // PASS_LENS_INSTRUMENTATION_H

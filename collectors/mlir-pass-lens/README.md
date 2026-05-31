# Pass Lens MLIR Collector

This is the scaffold for the structured MLIR trace collector. It provides an
MLIR `PassInstrumentation` implementation that records pass-before/pass-after
IR snapshots, coarse metrics, duration, and verifier failure status into the
same JSON schema consumed by the VSCode extension.

## Important Boundary

MLIR pass plugins register passes. They do not automatically inject
instrumentation into arbitrary `mlir-opt` invocations. Pass Lens therefore uses
an instrumentation library that must be added to a `PassManager` by a custom
driver or by the compiler tool being instrumented:

```cpp
#include "PassLens/PassLensInstrumentation.h"

mlir::PassManager pm(&context);
passlens::PassLensOptions options;
options.outputPath = "trace.pass-lens.json";
options.tool = "my-mlir-driver";
options.input = "input.mlir";
options.pipeline = pipelineText;
options.includeIr = true;
passlens::addPassLensInstrumentation(pm, std::move(options));
```

## Build Sketch

Point CMake at an LLVM/MLIR build or install tree:

```powershell
cmake -S collectors/mlir-pass-lens -B build/pass-lens-mlir `
  -DMLIR_DIR=C:\path\to\llvm-build\lib\cmake\mlir `
  -DLLVM_DIR=C:\path\to\llvm-build\lib\cmake\llvm
cmake --build build/pass-lens-mlir --config Release
```

Or use the repository helper from the extension root:

```powershell
$env:MLIR_DIR="C:\path\to\llvm-build\lib\cmake\mlir"
$env:LLVM_DIR="C:\path\to\llvm-build\lib\cmake\llvm"
npm run check:mlir-collector
```

The helper prints `ENVIRONMENT_MISSING` when the local LLVM/MLIR environment is
missing or misconfigured. A direct PowerShell invocation exits with code `2` in
that case; `npm run` may normalize the process failure. That is distinct from a
collector source compile failure.

## Run Sketch

The scaffold includes a minimal `pass-lens-mlir-opt` driver:

```powershell
pass-lens-mlir-opt input.mlir `
  --pass-pipeline="builtin.module(func.func(canonicalize,cse))" `
  --pass-lens-trace=input.pass-lens.json `
  -o output.mlir
```

Open `input.pass-lens.json` with `Pass Lens: Open Trace File`.

## Current Trade-Offs

- The scaffold is meant to be integrated into a custom MLIR driver first.
- It records operation text snapshots, so traces can be large.
- For deterministic stage ordering, start with MLIR threading disabled in the
  driver while validating the integration.
- The metrics are intentionally simple: non-empty line count, total operation
  count, and per-operation counts.

## Why This Exists

The extension already has a text-dump parser for quick prototyping. This
collector is the path toward reliable structured data: exact pass callbacks,
duration, failure status, and operation-level metrics without reverse-parsing
terminal output.

The text-dump parser should be treated as a fallback. It cannot provide
reliable per-pass timing because MLIR IR dump markers do not encode duration.

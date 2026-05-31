# Custom Driver Integration Notes

The included `pass-lens-mlir-opt.cpp` is the first driver scaffold. A downstream
compiler can either use it directly or copy the same integration pattern:

1. create `MLIRContext`;
2. register the dialects needed by the target pipeline;
3. parse the input module;
4. create a `PassManager`;
5. call `passlens::addPassLensInstrumentation(pm, options)`;
6. parse the user pass pipeline into `pm`;
7. run the pass manager;
8. let the instrumentation destructor write the trace, or call `writeTrace()`.

This keeps Pass Lens independent from any one downstream compiler while still
using MLIR's structured pass lifecycle callbacks.

Example:

```powershell
pass-lens-mlir-opt input.mlir `
  --pass-pipeline="builtin.module(func.func(canonicalize,cse))" `
  --pass-lens-trace=input.pass-lens.json `
  -o output.mlir
```

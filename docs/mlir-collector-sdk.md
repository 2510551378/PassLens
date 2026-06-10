# MLIR Collector SDK Surface

Pass Lens exposes a small C++ surface for MLIR-based drivers that already own
their `MLIRContext`, dialect registration, input parsing, and pass pipeline.
The goal is to add trace capture without tying a downstream compiler to the
reference `pass-lens-mlir-opt` binary.

## Contract

The SDK surface is:

- `passlens::PassLensOptions`
- `passlens::PassLensInstrumentation`
- `passlens::addPassLensInstrumentation`

Include it from:

```cpp
#include "PassLens/PassLensInstrumentation.h"
```

## Lifecycle

Add the instrumentation after creating the `PassManager` and before running the
pipeline:

```cpp
mlir::PassManager pm(&context);

passlens::PassLensOptions options;
options.outputPath = "trace.pass-lens.json";
options.tool = "my-mlir-driver";
options.input = inputPath;
options.pipeline = pipelineText;
options.artifactDir = "trace-artifacts";
options.includeIr = true;

passlens::addPassLensInstrumentation(pm, std::move(options));

if (failed(pm.run(module.get())))
  return 1;
```

`PassLensInstrumentation` writes the trace from its destructor. A driver may
also call `writeTrace()` explicitly when it owns the instrumentation object.
The writer is idempotent: only the first write emits the JSON file.

## Stage Semantics

Each recorded stage corresponds to one MLIR pass callback pair:

- `runBeforePass` records pass identity, operation scope, optional before IR,
  and before metrics.
- `runAfterPass` records after IR, after metrics, duration, verifier status
  `ok`, and status `ok` or `changed`.
- `runAfterPassFailed` records `verifier: "failed"` and prefers `status:
  verifier_failed` when verifier evidence is detected (diagnostic markers and
  post-failure IR validity checks). If verifier evidence is not detected, it
  records `status: pass_failed`.

The collector skips MLIR's internal `OpToOpPassAdaptor` wrapper so the trace
focuses on user-visible pass invocations.

For deterministic stage order while validating a new integration, disable MLIR
threading in the driver. The collector sorts stages by callback order before
writing.

## Artifact Path Policy

Use artifact-backed IR for real pipelines:

```cpp
options.artifactDir = "trace-artifacts";
options.includeIr = true;
```

The collector writes sidecar files next to `options.outputPath` when
`artifactDir` is relative, and stores the same relative path in the JSON trace.
This keeps repro bundles movable as a directory.

Use inline IR only for tiny examples. Use `includeIr = false` for metrics-only
traces; the emitted capture mode becomes `ir = "omitted"` so the viewer does not
warn about missing IR snapshots.

## Metrics Hook

The default metrics are:

- non-empty printed IR lines;
- total operation count;
- per-operation counts keyed by operation name.

Downstream drivers can add finite integer metrics without changing the schema:

```cpp
options.metricsHook = [](mlir::Operation *op,
                         passlens::PassLensMetricMap &metrics) {
  metrics["my_backend.buffer_bytes"] = estimateBufferBytes(op);
};
```

The hook runs for both before and after snapshots. Keep metric names stable and
use dotted names for backend-specific counters.

## Diagnostics Hook

Use `diagnosticsHook` for pass-local summaries that are not already emitted by
MLIR as structured verifier failure status:

```cpp
options.diagnosticsHook = [](mlir::Pass *pass, mlir::Operation *op) {
  if (!hasBackendFallback(op))
    return std::string();
  return std::string("backend fallback remained after ") +
         pass->getArgument().str();
};
```

The returned string is written to the stage `diagnostics` field. Return an empty
string when there is no stage-local diagnostic. Use top-level diagnostics for
driver setup failures or command-level stderr instead.

## Validation

Validate emitted traces before publishing them:

```powershell
npm run validate:trace -- --strict-only --check-artifacts trace.pass-lens.json
```

For a CI artifact or issue attachment, prefer a directory layout containing the
trace, input, pipeline text, artifacts, and rerun scripts. See
[`collector-author-guide.md`](collector-author-guide.md) for the full producer
checklist.

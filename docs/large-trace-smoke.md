# Large Trace Smoke

Pass Lens uses artifact-backed IR and on-demand hydration so large compiler
pipelines do not require loading every before/after snapshot when a trace is
opened. The large trace smoke makes that claim reproducible for the core
non-UI path.

Run:

```powershell
npm run smoke:large-trace
```

Optional controls:

```powershell
$env:PASS_LENS_LARGE_TRACE_STAGES = "5000"
$env:PASS_LENS_LARGE_TRACE_ARTIFACT_LINES = "200"
$env:PASS_LENS_LARGE_TRACE_DIR = "C:\tmp\passlens-large-trace"
npm run smoke:large-trace
```

When using `npm run`, this repository also accepts positional fallback
arguments in the order `stages artifact-lines output`:

```powershell
npm run smoke:large-trace -- 5000 200 C:\tmp\passlens-large-trace
```

Direct `node` invocation after `npm run compile` also accepts explicit flags:

```powershell
node scripts/large-trace-smoke.js --stages 5000 --artifact-lines 200 --output C:\tmp\passlens-large-trace
```

## What It Checks

The script generates a synthetic artifact-backed trace and then checks:

- strict schema validation;
- viewer-level validation has no errors;
- trace size summary reports artifact payload instead of inline IR payload;
- selected-stage artifact hydration loads only the requested stage;
- anomaly computation completes on the large stage list;
- agent context remains bounded and omits unselected stages.

The generated directory contains:

```text
.pass-lens-large-trace-smoke/
  trace.json
  summary.json
  artifacts/
    stage-000000.before.mlir
    stage-000000.after.mlir
    ...
```

## Current Baseline

Default local settings:

| Setting | Value |
| --- | ---: |
| Stages | 2000 |
| Artifact lines per before/after file | 120 |
| Artifact files per stage | 2 |

The smoke writes `summary.json` with measured timings for load/normalize,
strict validation, viewer validation, size summary, selected-stage hydration,
anomaly computation, and agent context creation.

## Interpretation

Evidence:

- This validates the core trace processing path used by the extension.
- It verifies that artifact-backed traces keep inline IR bytes at zero until a
  stage is selected.
- It verifies that agent context export remains bounded for a large stage list.

Limits:

- This is synthetic data, not a downstream compiler workload.
- This is not a browser/webview frame-time benchmark.
- Real downstream traces may have larger diagnostics, deeper nesting, and
  project-specific artifact layouts.

Next step:

- Pair this smoke with one real downstream compiler case study and a VS Code
  screenshot or demo recording once the Marketplace preview path is ready.

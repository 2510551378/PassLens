# Pass Lens Sample Provenance

Pass Lens samples are intentionally labeled by origin. This keeps demo traces
useful without implying that every bundled sample came from a live compiler
collector run.

| Sample | Provenance | Notes |
| --- | --- | --- |
| `mlir-live-pass-instrumentation.json` | `live-pass-instrumentation` | Real L20 `pass-lens-mlir-opt` structured collector run for `canonicalize,cse`, with artifact-backed IR. |
| `real-triton-npu-dual-rmsnorm.json` | `real-artifact-capture` | Real local `npuir2ascendc` artifact capture from TTAdapter IR to generated AscendC files; not live PassInstrumentation output. |
| `mlir-toy.json` | `hand-authored` | Minimal MLIR-style trace for viewer smoke testing. |
| `mlir-long-pipeline.json` | `hand-authored` | Longer MLIR-style trace for scanning, filtering, and slow-pass UX. |
| `mlir-verifier-failure.json` | `hand-authored` | Verifier-failure trace for first-signal and issue-summary UX. |
| `mlir-artifacts.json` | `hand-authored` | Artifact-backed trace for sidecar IR loading. |
| `triton-npu-ub-budget-overflow.json` | `hand-authored` | Hardware-backend case study for metric-budget anomaly triage. |
| `triton-npu-strict-fallback.json` | `hand-authored` | Hardware-backend case study for strict-mode legality failure triage. |
| `mlir-live-pass-instrumentation-arith-canonicalize.json` | `live-pass-instrumentation` | Real LLVM/MLIR Arith canonicalize pipeline sample with artifact-backed IR (source: LLVM MLIR tests). |
| `mlir-live-pass-instrumentation-memref-canonicalize.json` | `live-pass-instrumentation` | Real LLVM/MLIR MemRef canonicalize pipeline sample with artifact-backed IR (source: LLVM MLIR tests). |

## Provenance Kinds

- `live-pass-instrumentation`: produced by a real structured collector using
  PassInstrumentation or an equivalent pass-event hook.
- `converted-dump`: converted from textual dumps or logs rather than collected
  directly from structured pass callbacks.
- `hand-authored`: written or adapted by hand to demonstrate a workflow.
- `real-artifact-capture`: generated from a real compiler/tool run, but not
  necessarily from live PassInstrumentation events.

Every bundled sample trace must declare `provenance.kind` and
`provenance.description`. Strict validation allows provenance as part of schema
v1 so downstream collectors can label their own traces without ad hoc fields.

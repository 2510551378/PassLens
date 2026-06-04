# Triton NPU / AscendC Case Studies

The first two traces are hand-authored case studies shaped like debugging
questions that show up in a Triton-to-AscendC lowering pipeline. The dual
RMSNorm trace is a real local artifact capture from `npuir2ascendc`, but not
live PassInstrumentation output. They are meant to demonstrate Pass Lens as a
postmortem debugger rather than a generic timeline viewer.

## UB Budget Overflow

Trace: `sample-traces/triton-npu-ub-budget-overflow.json`

The pipeline starts from a gather-style TTIR module and reaches an AC IR
lowering plan. The key pass is:

```text
#1 ttnpu-plan-scratch-queues
```

Pass Lens should report domain anomalies from the built-in `ascendc` metric
profile:

```text
ub.live.slots.max: 3 -> 5, exceeds budget 4
queue.depth: 3 -> 5, exceeds budget 4
```

This is the kind of signal that is hard to see from textual IR alone. The IR
does change, but the important fact is that the pass introduced a resource plan
that violates the target budget before codegen.

## Strict Fallback Violation

Trace: `sample-traces/triton-npu-strict-fallback.json`

The pipeline proves tile shapes, lowers a fixed pipeline overlap, then runs a
strict AC verifier. The first failing stage is:

```text
#2 ttnpu-verify-strict-ac
```

The root-cause pass is the previous lowering pass:

```text
#1 ttnpu-lower-fixed-pipeline-overlap
```

Pass Lens should highlight that this pass introduced contract-style metrics:

```text
fallback.count: 0 -> 1
strict.violations: 0 -> 1
unproven.tile_size: 0 -> 1
```

The viewer should open on the verifier failure, while the anomaly card points
back to the pass that introduced the suspicious evidence. This is the intended
debugging loop: first locate the failure, then inspect the earlier pass that
created the illegal state.

## Why These Metrics Matter

The built-in `ascendc` profile treats the following metrics as contract signals:

- `strict.violations`: strict-mode legality failures.
- `fallback.count`: silent fallback or unplanned fallback paths.
- `unproven.tile_size`: missing evidence for lowering legality.
- `ub.live.slots.max`: UB live-slot resource budget.
- `queue.depth`: queue planning budget.

These are triage signals. They do not prove a pass is wrong by themselves, but
they identify where a compiler developer should inspect first.

## Real Local Dual RMSNorm Trace

Trace: `sample-traces/real-triton-npu-dual-rmsnorm.json`

This trace is generated from the local `npuir2ascendc` workspace:

```powershell
python generate.py `
  --input samples\rmsnorm_residual_cast\case_001\raw\fused_dual_residual_rmsnorm_kernel.ttadapter.mlir `
  --out sample-traces\artifacts\real-triton-npu-dual-rmsnorm
```

It records a real captured TTAdapter IR input and the generated AscendC kernel
artifact for:

```text
fused_dual_residual_rmsnorm_kernel
```

The trace uses artifact-backed IR:

```text
captured.ttadapter.mlir -> selected_function.ttadapter.mlir -> kernel.cpp
```

This is not a synthetic failure case. It is included to show how Pass Lens can
hold a real downstream compiler conversion path even when the collector is not
yet integrated into that compiler as a live `PassInstrumentation` hook.

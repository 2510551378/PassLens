# Triton NPU / AscendC Case Studies

These sample traces are synthetic but shaped like the debugging questions that
show up in a Triton-to-AscendC lowering pipeline. They are meant to demonstrate
Pass Lens as a postmortem debugger rather than a generic timeline viewer.

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

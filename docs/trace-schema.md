# Pass Lens Trace Schema

Machine-readable schema: [`pass-lens.schema.json`](pass-lens.schema.json).
Valid examples for collector authors:
[`schema-examples.md`](schema-examples.md).

Pass Lens uses two validation levels:

- strict validation checks raw collector output against schema v1 and should be
  used by collector tests and CI;
- loose validation runs after viewer normalization and reports non-blocking
  quality diagnostics in the webview.

Pass Lens consumes a JSON object with a top-level `stages` array. The schema is
intentionally small so collectors can be implemented by compiler drivers,
instrumentation callbacks, or temporary wrappers.

The JSON trace schema is a public compatibility contract. Collector authors
should not add ad hoc top-level or stage-level fields. Put domain-specific data
in numeric metrics, diagnostics, target metadata, or artifact sidecars so traces
remain portable across MLIR, LLVM, hardware backends, and other compiler stacks.

```json
{
  "schemaVersion": 1,
  "collectorVersion": "0.1.0",
  "compiler": {
    "name": "mlir-opt",
    "version": "21.0.0",
    "gitSha": "..."
  },
  "target": {
    "backend": "ascendc",
    "platform": "ascend-910b2"
  },
  "provenance": {
    "kind": "live-pass-instrumentation",
    "description": "Collected from a real PassInstrumentation run."
  },
  "inputHash": "sha256:...",
  "capture": {
    "ir": "inline",
    "metrics": true,
    "timing": true
  },
  "metricProfiles": {
    "ascendc": {
      "critical": [
        "strict.violations",
        "fallback.count",
        "unproven.tile_size"
      ],
      "budgets": {
        "ub.live.slots.max": 4,
        "queue.depth": 4
      }
    }
  },
  "tool": "mlir-opt",
  "input": "input.mlir",
  "pipeline": "builtin.module(func.func(canonicalize,cse))",
  "command": "mlir-opt input.mlir ...",
  "exitCode": 0,
  "diagnostics": "optional stderr/stdout excerpt",
  "stages": [
    {
      "index": 0,
      "pass": "canonicalize",
      "argument": "canonicalize",
      "opName": "func.func",
      "symbol": "@main",
      "nestingDepth": 2,
      "scope": "func.func @main",
      "changed": true,
      "status": "changed",
      "durationMs": 1.25,
      "verifier": "ok",
      "diagnostics": "",
      "location": "input.mlir:12:3",
      "artifacts": {
        "beforePath": "artifacts/0-before.mlir",
        "afterPath": "artifacts/0-after.mlir"
      },
      "metricsBefore": {
        "lines": 12,
        "ops": 9,
        "arith.constant": 3
      },
      "metricsAfter": {
        "lines": 10,
        "ops": 7,
        "arith.constant": 2
      },
      "irBefore": "module { ... }",
      "irAfter": "module { ... }"
    }
  ]
}
```

## Field Semantics

- `schemaVersion`: currently `1`.
- `collectorVersion`: collector implementation version.
- `compiler`: compiler binary name, version, and source revision when known.
- `target`: backend/platform/triple metadata for downstream compiler pipelines.
- `provenance`: trace origin. `kind` is one of
  `live-pass-instrumentation`, `converted-dump`, `hand-authored`, or
  `real-artifact-capture`; optional text fields can name the source,
  generator, capture date, or caveat.
- `inputHash`: stable hash of the input module or source.
- `capture`: trace-level capture mode. `ir` is `inline`, `artifact`, or
  `omitted`; `metrics` and `timing` describe whether those signals are
  intentionally recorded.
- `metricProfiles`: optional domain-specific anomaly profile. Profiles can mark
  metrics as `critical` or set numeric `budgets`; matching profile names are
  selected from `target.backend`, with `default` as a fallback. Pass Lens also
  includes a conservative built-in `ascendc` profile for strict violations,
  fallback counts, unproven tile evidence, UB live slot budget, and queue depth.
- `tool`: collector or driver name.
- `input`: user-facing input name.
- `pipeline`: pass pipeline string when available.
- `command`: repro command, if the collector can provide one.
- `exitCode`: process exit code for wrapper collectors.
- `diagnostics`: bounded diagnostic text for failures or warnings.
- `stages`: ordered pass events.

## Compatibility Rules

- `schemaVersion = 1` is the only stable version today.
- Unknown fields are rejected by strict validation.
- Relative artifact paths are resolved relative to the trace JSON file.
- Backend-specific evidence should live in `target`, `metricProfiles`,
  `metricsBefore` / `metricsAfter`, `diagnostics`, or artifact files.
- Sample traces should set `provenance` so users can distinguish live collector
  output from converted dumps and hand-authored examples.
- If timing, metrics, or IR are intentionally unavailable, declare that through
  `capture` instead of leaving readers to guess.
- Prefer additive schema evolution through a future `schemaVersion` bump rather
  than collector-specific extension fields.

## Stage Semantics

- `index`: execution order.
- `pass`: pass name, preferably the stable MLIR/LLVM pass argument.
- `argument`: stable pass argument if different from the display name.
- `opName`: operation type the pass ran on.
- `symbol`: symbol name for function/module-like scopes.
- `nestingDepth`: depth in nested pass managers.
- `scope`: operation/function/module scope where the pass ran.
- `changed`: whether the recorded IR payload changed.
- `status`: `ok`, `changed`, `verifier_failed`, `pass_failed`, or `skipped`.
- `durationMs`: wall-clock pass duration in milliseconds.
- `verifier`: `ok`, `failed`, or a collector-specific status string.
- `diagnostics`: stage-local diagnostic text.
- `location`: source or IR location associated with the stage.
- `artifacts`: paths to external before/after/diagnostic artifacts. Relative
  paths are resolved against the trace JSON file location.
- `metricsBefore` / `metricsAfter`: numeric scalar metrics only.
- `irBefore` / `irAfter`: optional textual IR snapshots.

Collectors may omit expensive fields such as IR snapshots. The viewer should
degrade gracefully when fields are absent.

## Validation

Pass Lens treats validation as non-blocking diagnostics. A trace can still open
when validation finds issues, but the viewer will show a warning panel.

Current validation checks include:

- unsupported `schemaVersion`;
- empty `stages`;
- unstable or missing pass names;
- duplicate or non-position stage indexes;
- unknown `status` values;
- negative durations;
- non-finite metrics;
- very large inline IR snapshots that should use `artifacts`;
- stages with neither inline IR nor artifact references, unless
  `capture.ir = "omitted"`.

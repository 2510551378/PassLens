# Pass Lens Trace Schema

Pass Lens consumes a JSON object with a top-level `stages` array. The schema is
intentionally small so collectors can be implemented by compiler drivers,
instrumentation callbacks, or temporary wrappers.

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
  "inputHash": "sha256:...",
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
- `inputHash`: stable hash of the input module or source.
- `tool`: collector or driver name.
- `input`: user-facing input name.
- `pipeline`: pass pipeline string when available.
- `command`: repro command, if the collector can provide one.
- `exitCode`: process exit code for wrapper collectors.
- `diagnostics`: bounded diagnostic text for failures or warnings.
- `stages`: ordered pass events.

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
- `artifacts`: paths to external before/after/diagnostic artifacts.
- `metricsBefore` / `metricsAfter`: numeric scalar metrics only.
- `irBefore` / `irAfter`: optional textual IR snapshots.

Collectors may omit expensive fields such as IR snapshots. The viewer should
degrade gracefully when fields are absent.

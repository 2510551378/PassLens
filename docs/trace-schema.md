# Pass Lens Trace Schema

Pass Lens consumes a JSON object with a top-level `stages` array. The schema is
intentionally small so collectors can be implemented by compiler drivers,
instrumentation callbacks, or temporary wrappers.

```json
{
  "schemaVersion": 1,
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
      "scope": "func.func @main",
      "changed": true,
      "durationMs": 1.25,
      "verifier": "ok",
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
- `scope`: operation/function/module scope where the pass ran.
- `changed`: whether the recorded IR payload changed.
- `durationMs`: wall-clock pass duration in milliseconds.
- `verifier`: `ok`, `failed`, or a collector-specific status string.
- `metricsBefore` / `metricsAfter`: numeric scalar metrics only.
- `irBefore` / `irAfter`: optional textual IR snapshots.

Collectors may omit expensive fields such as IR snapshots. The viewer should
degrade gracefully when fields are absent.


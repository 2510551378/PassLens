# Pass Lens

Pass Lens is a VSCode extension for inspecting compiler pass traces. It helps
compiler developers understand where an IR changes, which pass failed
verification, and which passes dominate the pipeline timeline.

## Features

- Open structured JSON pass traces.
- Run `mlir-opt` with trace-friendly dump flags and save a trace.
- Run the structured `pass-lens-mlir-opt` collector driver when available.
- Inspect a pass-by-pass timeline with changed/unchanged/failure status.
- Scan a visual pipeline map where taller colored segments mean larger impact.
- Filter long pipelines by pass name, scope, metric name, or changed-only.
- Jump directly to first signal, previous/next changed pass, or slowest pass.
- Compare metric deltas before and after each pass.
- View side-by-side IR diffs.
- Copy the generated repro command from the viewer.
- Use a sample gallery with toy, long-pipeline, and verifier-failure traces.

## Development

```powershell
npm install
npm run compile
code .
```

Press `F5` in VSCode, then run one of:

- `Pass Lens: Open Sample Trace`
- `Pass Lens: Open Trace File`
- `Pass Lens: Run mlir-opt Trace`
- `Pass Lens: Run Structured MLIR Trace`
- `Pass Lens: Check MLIR Collector Setup`

Package a local VSIX:

```powershell
npm run package
```

## Collector Paths

`Run mlir-opt Trace` asks for an MLIR input file and a pass pipeline such as:

```text
builtin.module(func.func(canonicalize,cse))
```

It writes `<input>.pass-lens.json` next to the input file and opens the viewer.
Set `passLens.mlirOptPath` if `mlir-opt` is not on `PATH`.

`Run Structured MLIR Trace` uses the C++ collector driver
`pass-lens-mlir-opt` instead of parsing textual `mlir-opt` dumps. Set
`passLens.mlirDriverPath` if the driver is not on `PATH`.

`Check MLIR Collector Setup` runs `scripts/check-mlir-collector.ps1` and shows
the result in the `Pass Lens Collector Setup` output channel.

## Sample Gallery

`Pass Lens: Open Sample Trace` opens a QuickPick with:

- `Toy MLIR pipeline`: small trace for checking the basic viewer layout.
- `Long lowering pipeline`: longer trace for validating the pipeline map,
  changed-only filter, and slowest-pass navigation.
- `Verifier failure`: failure-focused trace that opens directly at the first
  failing pass.

## Trace Schema

See `docs/trace-schema.md` for the full viewer contract.

```json
{
  "schemaVersion": 1,
  "tool": "mlir-opt",
  "input": "example.mlir",
  "pipeline": "builtin.module(func.func(canonicalize,cse))",
  "command": "mlir-opt example.mlir ...",
  "stages": [
    {
      "index": 0,
      "pass": "canonicalize",
      "scope": "func.func",
      "changed": true,
      "durationMs": 1.7,
      "verifier": "ok",
      "metricsBefore": {
        "ops": 9
      },
      "metricsAfter": {
        "ops": 7
      },
      "irBefore": "...",
      "irAfter": "..."
    }
  ]
}
```

## MLIR Collector

The initial TypeScript collector parses MLIR IR dump markers from `mlir-opt`.
The structured collector path is in `collectors/mlir-pass-lens`. It provides a
C++ `PassInstrumentation` library and a `pass-lens-mlir-opt` driver scaffold
for custom MLIR drivers or downstream compiler tools that can call
`PassManager::addInstrumentation`.

To check the C++ collector on a machine with LLVM/MLIR development files:

```powershell
$env:MLIR_DIR="C:\path\to\llvm-build\lib\cmake\mlir"
$env:LLVM_DIR="C:\path\to\llvm-build\lib\cmake\llvm"
npm run check:mlir-collector
```

The helper prints `ENVIRONMENT_MISSING` when the local LLVM/MLIR build
environment is missing or misconfigured. A direct PowerShell invocation exits
with code `2` in that case; `npm run` may normalize the process failure.
Other failures are configure/build failures worth inspecting.

## License

MIT

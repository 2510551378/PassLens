# Pass Lens

Pass Lens is a postmortem debugger for compiler pass pipelines. It helps
compiler developers identify where an IR first changes, which pass introduced
invalid IR, which metrics changed abnormally, and which passes dominate the
pipeline timeline.

![Pass Lens first bad pass view](docs/images/pass-lens-first-bad-pass.png)

Animated focus view: [`docs/images/pass-lens-first-bad-pass.gif`](docs/images/pass-lens-first-bad-pass.gif)

## Quick Start

Install the local VSIX:

```powershell
code --install-extension pass-lens-0.1.0.vsix
```

Open VSCode and run:

```text
Pass Lens: Open Sample Trace
```

Choose `Triton NPU strict fallback` or `Real Triton NPU dual RMSNorm` to see a
complete pass debugging view with first signal, metric anomalies, and IR diff.

For a local trace file:

```text
Pass Lens: Open Trace File
```

Select any JSON trace that follows `docs/pass-lens.schema.json`.

## Features

- Open structured JSON pass traces.
- Run `mlir-opt` with trace-friendly dump flags and save a trace.
- Run the structured `pass-lens-mlir-opt` collector driver when available.
- Inspect a pass-by-pass timeline with changed/unchanged/failure status.
- Scan a visual pipeline map where taller colored segments mean larger impact.
- Filter long pipelines by pass name, scope, metric name, or changed-only.
- Jump directly to first signal, previous/next changed pass, or slowest pass.
- Jump directly to suspicious metric anomalies such as zero-to-positive
  allocations, large relative op-count changes, or domain budget violations.
- Compare metric deltas before and after each pass.
- View side-by-side IR diffs, including source markers for inline IR versus
  external artifact files.
- Open before/after IR artifacts and diagnostics sidecars directly from the
  diff view.
- Copy the generated repro command from the viewer.
- Export a Markdown repro bundle with trace summary, selected-pass IR,
  diagnostics, validation issues, and top metric anomalies.
- Show non-blocking trace validation diagnostics for suspicious traces.
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

## Producing a Trace

There are three supported paths.

### 1. Structured MLIR Collector

Use `Pass Lens: Run Structured MLIR Trace` when `pass-lens-mlir-opt` is built
and available on `PATH`:

```powershell
pass-lens-mlir-opt input.mlir `
  --pass-pipeline="builtin.module(func.func(canonicalize,cse))" `
  --pass-lens-trace=input.pass-lens.json `
  --pass-lens-artifact-dir=input.pass-lens-artifacts `
  -o output.mlir
```

This is the preferred path for timing, verifier failure attribution, pass
identity, and artifact-backed IR snapshots.

### 2. `mlir-opt` Dump Fallback

Use `Pass Lens: Run mlir-opt Trace` for quick experiments when only `mlir-opt`
is available. This path reverse-parses textual dump markers and does not
provide reliable per-pass duration.

### 3. Downstream Compiler Integration

Downstream compilers can emit the JSON schema directly. At minimum, provide:

```json
{
  "schemaVersion": 1,
  "tool": "my-compiler",
  "capture": {
    "ir": "artifact",
    "metrics": true,
    "timing": true
  },
  "stages": [
    {
      "index": 0,
      "pass": "my-pass",
      "status": "changed",
      "changed": true,
      "artifacts": {
        "beforePath": "artifacts/0-before.mlir",
        "afterPath": "artifacts/0-after.mlir"
      },
      "metricsBefore": {
        "ops": 10
      },
      "metricsAfter": {
        "ops": 7
      }
    }
  ]
}
```

Run `npm test` to validate the built-in samples and strict schema checks.

## Collector Paths

`Run mlir-opt Trace` asks for an MLIR input file and a pass pipeline such as:

```text
builtin.module(func.func(canonicalize,cse))
```

It writes `<input>.pass-lens.json` next to the input file and opens the viewer.
Set `passLens.mlirOptPath` if `mlir-opt` is not on `PATH`.
This fallback path does not provide reliable per-pass duration because MLIR
textual IR dumps do not encode timing.

`Run Structured MLIR Trace` uses the C++ collector driver
`pass-lens-mlir-opt` instead of parsing textual `mlir-opt` dumps. Set
`passLens.mlirDriverPath` if the driver is not on `PATH`.
Use this path when timing, verifier failure attribution, or structured metrics
matter.
The driver also supports `--pass-lens-artifact-dir=<dir>` for sidecar IR
snapshots when trace JSON size matters.

`Check MLIR Collector Setup` runs `scripts/check-mlir-collector.ps1` and shows
the result in the `Pass Lens Collector Setup` output channel.

## Sample Gallery

`Pass Lens: Open Sample Trace` opens a QuickPick with:

- `Toy MLIR pipeline`: small trace for checking the basic viewer layout.
- `Long lowering pipeline`: longer trace for validating the pipeline map,
  changed-only filter, and slowest-pass navigation.
- `Verifier failure`: failure-focused trace that opens directly at the first
  failing pass.
- `External IR artifacts`: trace that loads before/after IR and diagnostics
  from sidecar files.
- `Triton NPU UB budget overflow`: AscendC resource-budget anomaly case study.
- `Triton NPU strict fallback`: strict-mode legality and fallback case study.
- `Real Triton NPU dual RMSNorm`: real local `npuir2ascendc` trace from
  captured TTAdapter IR to generated AscendC kernel artifact.

See `docs/examples/triton-npu.md` for the intended debugging story behind the
Triton NPU / AscendC samples.

## Trace Schema

See `docs/trace-schema.md` for the full viewer contract.

```json
{
  "schemaVersion": 1,
  "collectorVersion": "0.1.0",
  "tool": "mlir-opt",
  "compiler": {
    "name": "mlir-opt",
    "version": "21.0.0",
    "gitSha": "..."
  },
  "target": {
    "backend": "mlir",
    "platform": "host"
  },
  "inputHash": "sha256:...",
  "input": "example.mlir",
  "pipeline": "builtin.module(func.func(canonicalize,cse))",
  "command": "mlir-opt example.mlir ...",
  "stages": [
    {
      "index": 0,
      "pass": "canonicalize",
      "argument": "canonicalize",
      "opName": "func.func",
      "scope": "func.func",
      "status": "changed",
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

The helper is cross-platform and prints `ENVIRONMENT_MISSING` when the local
LLVM/MLIR build environment is missing or misconfigured. It exits with code `2`
in that case. Other failures are configure/build failures worth inspecting.

## Roadmap

- Export directory-style repro bundles with standalone `trace.json`, IR
  artifacts, diagnostics, and repro scripts.
- Add metric trend charts and root-cause candidate summaries.
- Run the structured collector in a real downstream MLIR/Triton NPU pipeline.
- Publish VSCode Marketplace releases after the local VSIX workflow is stable.

## Known Limitations

- The `mlir-opt` dump fallback is best-effort and cannot produce reliable
  per-pass timing.
- The structured collector currently targets MLIR-based drivers. LLVM New Pass
  Manager support is future work.
- Metric anomalies are triage hints. They identify suspicious deltas and domain
  contract violations, but they do not prove a pass is incorrect.
- The included Triton NPU failure traces are case-study samples. The real dual
  RMSNorm trace is generated from a local `npuir2ascendc` run, but it is not yet
  produced by live `PassInstrumentation` inside that compiler.

## License

MIT

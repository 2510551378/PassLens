# Pass Lens

**English** | [中文](README.zh-CN.md)

[![CI](https://github.com/2510551378/PassLens/actions/workflows/ci.yml/badge.svg)](https://github.com/2510551378/PassLens/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.90-007ACC)
![Status](https://img.shields.io/badge/status-preview-orange)
![License](https://img.shields.io/badge/license-MIT-green)

Pass Lens is an evidence-driven postmortem debugger for MLIR/LLVM pass
pipelines. It is a pass pipeline observability and debugging workbench that
turns structured traces into a focused investigation view: first signal, IR
diff, diagnostics, metric anomalies, repro context, and artifact paths in one
place.

![Pass Lens first bad pass view](docs/images/pass-lens-first-bad-pass.png)

[Animated demo](docs/images/pass-lens-first-bad-pass.gif)

## Why Pass Lens

Compiler failures are rarely local to the final crash. Invalid IR, legality
breakage, resource-budget violations, or suspicious metric jumps often appear
several passes earlier.

Pass Lens is built for that postmortem loop:

- Find the first failing or suspicious pass.
- Compare before/after IR without opening scattered dump files.
- See metric deltas and anomaly hints next to the selected pass.
- Open before/after artifacts and diagnostics directly from the diff view.
- Export a compact Markdown repro bundle for bug reports and code review.

## Highlights

- Pass-by-pass timeline with changed, unchanged, and failed states.
- Visual pipeline map for quick navigation through long lowering pipelines.
- First-signal navigation for verifier failures and first IR changes.
- Metric anomaly detection for zero-to-positive jumps, large relative changes,
  and domain-specific budget violations.
- Side-by-side IR diff with inline or artifact-backed snapshots.
- Artifact open actions for before IR, after IR, and diagnostics sidecars.
- In-view suspicious-pass explanation with evidence, next checks, confidence,
  guardrails, export, and copy actions.
- Bounded JSON / Markdown agent context export for trace-grounded debugging
  agents, with copy-to-clipboard support for quick handoff.
- AI-facing exports are trace-grounded and tool-mediated: Pass Lens packages
  cited evidence and repro context, rather than offering a generic chat surface.
- Keyboard navigation: `j` / `k`, arrow keys, `/`, `c`, `f`, `a`, `s`.
- Structured JSON schema for downstream compiler integrations.
- MLIR paths for both quick `mlir-opt` dump parsing and structured
  `PassInstrumentation` collection.
- Sample gallery, including Triton NPU / AscendC case studies.

## Quick Start

Download `pass-lens-0.1.0.vsix` from the
[v0.1.0 release](https://github.com/2510551378/PassLens/releases/tag/v0.1.0),
or build it locally.

Install the VSIX:

```powershell
code --install-extension pass-lens-0.1.0.vsix
```

Open VSCode and run:

```text
Pass Lens: Open Sample Trace
```

Start with one of these samples:

- `Triton NPU strict fallback`
- `Real Triton NPU dual RMSNorm`
- `Verifier failure`

To open your own trace:

```text
Pass Lens: Open Trace File
```

Select a JSON trace that follows
[`docs/pass-lens.schema.json`](docs/pass-lens.schema.json).
Agent context exports follow
[`docs/pass-lens-agent-context.schema.json`](docs/pass-lens-agent-context.schema.json).

## Core Workflow

1. Open a trace from the sample gallery or a local JSON file.
2. Inspect the summary cards: changed passes, first signal, anomalies, slowest
   pass.
3. Use the left timeline to select a pass.
4. Read the selected-pass card first. It tells you why the pass is interesting.
5. Check metric anomalies and metric deltas.
6. Read the suspicious-pass explanation as a candidate, not proof.
7. Compare the side-by-side IR diff.
8. Open artifacts or diagnostics when the trace uses sidecar files.
9. Export a repro bundle or agent context when the trace should become a bug
   report or AI-assisted investigation.

Useful shortcuts:

| Shortcut | Action |
| --- | --- |
| `j` / `Down` | Next visible pass |
| `k` / `Up` | Previous visible pass |
| `/` | Focus search |
| `c` | Toggle changed-only |
| `f` | Jump to first signal |
| `a` | Jump to first anomaly |
| `s` | Jump to slowest pass |

## Trace Producers

Pass Lens supports three trace-producing paths.

### Structured MLIR Collector

Use this path when you can build `pass-lens-mlir-opt` or integrate the
collector into a downstream MLIR driver.

```powershell
pass-lens-mlir-opt input.mlir `
  --pass-pipeline="builtin.module(func.func(canonicalize,cse))" `
  --pass-lens-trace=input.pass-lens.json `
  --pass-lens-artifact-dir=input.pass-lens-artifacts `
  -o output.mlir
```

This is the preferred path for timing, verifier failure attribution, pass
identity, and artifact-backed IR snapshots.

### `mlir-opt` Dump Fallback

Use `Pass Lens: Run mlir-opt Trace` when only `mlir-opt` is available. This
path reverse-parses textual dump markers, so it is useful for quick
experiments but cannot provide reliable per-pass duration.

Example pass pipeline:

```text
builtin.module(func.func(canonicalize,cse))
```

Set `passLens.mlirOptPath` if `mlir-opt` is not on `PATH`.

### Downstream Compiler JSON

Downstream compilers can emit the schema directly. A minimal artifact-backed
trace looks like:

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
        "afterPath": "artifacts/0-after.mlir",
        "diagnosticsPath": "artifacts/0-diag.txt"
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

See [docs/trace-schema.md](docs/trace-schema.md) for the full viewer contract.

## Sample Gallery

`Pass Lens: Open Sample Trace` includes:

- `Toy MLIR pipeline`: small trace for checking the basic viewer layout.
- `Long lowering pipeline`: longer trace for filters and slowest-pass
  navigation.
- `Verifier failure`: failure-focused trace that opens at the first failing
  pass.
- `External IR artifacts`: before/after IR and diagnostics loaded from
  sidecar files.
- `Triton NPU UB budget overflow`: AscendC resource-budget anomaly case study.
- `Triton NPU strict fallback`: strict-mode legality and fallback case study.
- `Real Triton NPU dual RMSNorm`: real local `npuir2ascendc` trace from
  captured TTAdapter IR to generated AscendC kernel artifacts.

See [docs/examples/triton-npu.md](docs/examples/triton-npu.md) for the intended
debugging story behind the Triton NPU / AscendC samples.

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

Run tests:

```powershell
npm test
```

Package a local VSIX:

```powershell
npm run package
```

## MLIR Collector

The structured collector lives in
[`collectors/mlir-pass-lens`](collectors/mlir-pass-lens). It provides a C++
`PassInstrumentation` library and a `pass-lens-mlir-opt` driver scaffold for
custom MLIR drivers or downstream compiler tools that can call
`PassManager::addInstrumentation`.

To check the C++ collector on a machine with LLVM/MLIR development files:

```powershell
$env:MLIR_DIR="C:\path\to\llvm-build\lib\cmake\mlir"
$env:LLVM_DIR="C:\path\to\llvm-build\lib\cmake\llvm"
npm run check:mlir-collector
```

The helper prints `ENVIRONMENT_MISSING` when LLVM/MLIR development files are
not configured locally. It exits with code `2` in that case. Other failures are
configure or build failures worth inspecting.

## Project Status

Pass Lens is a preview extension. The trace viewer, sample gallery, schema
validation, repro bundle export, artifact opening, and MLIR collector scaffold
are usable today. The current focus is making real downstream compiler
integrations more convincing and reducing the time from "compiler failed" to
"this pass is the likely cause."

## Roadmap

See [docs/expert-roadmap-todo.md](docs/expert-roadmap-todo.md) for the
expert-guided execution checklist.

- Directory-style repro bundles with standalone `trace.json`, IR artifacts,
  diagnostics, and repro scripts.
- Metric trend charts and root-cause candidate summaries.
- Live structured collector runs in real downstream MLIR / Triton NPU
  pipelines.
- VSCode Marketplace publishing after the local VSIX workflow is stable.

## Known Limitations

- The `mlir-opt` dump fallback is best-effort and cannot produce reliable
  per-pass timing.
- The structured collector currently targets MLIR-based drivers. LLVM New Pass
  Manager support is future work.
- Metric anomalies are triage hints. They identify suspicious deltas and domain
  contract violations, but they do not prove a pass is incorrect.
- The included Triton NPU failure traces are case-study samples. The real dual
  RMSNorm trace is generated from a local `npuir2ascendc` run, but it is not
  yet produced by live `PassInstrumentation` inside that compiler.

## License

MIT

<p align="center">
  <img src="docs/images/pass-lens-logo.png" width="132" alt="Pass Lens logo">
</p>

<h1 align="center">Pass Lens</h1>

<p align="center">
  <strong>Evidence-driven postmortem debugger for MLIR / LLVM pass pipelines.</strong>
</p>

<p align="center">
  Turn compiler pass traces into a focused investigation: first signal, IR diff,
  diagnostics, metric anomalies, trace quality, repro context, and artifact paths.
</p>

<p align="center">
  <a href="README.zh-CN.md">中文</a>
  ·
  <a href="docs/trace-schema.md">Trace Schema</a>
  ·
  <a href="docs/expert-roadmap-todo.md">Roadmap</a>
  ·
  <a href="collectors/mlir-pass-lens">MLIR Collector</a>
</p>

<p align="center">
  <a href="https://github.com/2510551378/PassLens/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/2510551378/PassLens/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-blue">
  <img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-%5E1.90-007ACC">
  <img alt="Status" src="https://img.shields.io/badge/status-preview-orange">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

![Pass Lens hero](docs/images/pass-lens-hero.png)

![Pass Lens first bad pass view](docs/images/pass-lens-first-bad-pass.png)

## Why Pass Lens

Compiler failures are rarely born at the final crash. Invalid IR, legality
breakage, resource-budget overflow, or suspicious metric jumps often appear
several passes earlier.

Pass Lens gives compiler engineers a trace-grounded workflow:

| Step | What Pass Lens surfaces |
| --- | --- |
| Signal | First verifier failure, first IR change, first anomaly, slowest pass |
| Evidence | Before/after IR, diagnostics, metric deltas, validation issues |
| Repro | Markdown repro, directory repro bundle, commands, artifacts |
| Agent handoff | Bounded JSON/Markdown context with evidence IDs and guardrails |

## Highlights

- Pass-by-pass timeline with changed, unchanged, failed, anomalous, and slow
  stages.
- First-signal navigation for verifier failures, first IR changes, anomaly
  spikes, and slowest passes.
- Side-by-side IR diff with inline or artifact-backed snapshots.
- Metric anomaly detection for zero-to-positive jumps, large relative changes,
  and domain-specific budget violations.
- Trace quality score for collector credibility: pass identity, timing,
  verifier status, artifact coverage, and index consistency.
- Trace size report with quick fixes for traces that should switch from inline
  IR to artifact-backed capture.
- Directory-style repro bundle with `trace.json`, artifacts, diagnostics,
  `run.ps1`, `run.sh`, `manifest.json`, agent context, and an agent tool
  manifest.
- Deterministic issue summaries and suspicious-pass explanations before any
  model call.
- Trace-grounded AI exports: cited evidence and bounded context, not a generic
  chat surface.
- Agent-ready deterministic tool contracts for queries, reports, exports, and
  local rerun/bisect workflows.
- MLIR support through both `mlir-opt` dump fallback and structured
  `PassInstrumentation` collection.

## Quick Start

Download `pass-lens-0.1.0.vsix` from the
[v0.1.0 release](https://github.com/2510551378/PassLens/releases/tag/v0.1.0),
or build it locally:

```powershell
npm install
npm run package
code --install-extension pass-lens-0.1.0.vsix
```

Open VS Code and run:

```text
Pass Lens: Open Sample Trace
```

Good first samples:

- `Verifier failure`
- `External IR artifacts`
- `Toy MLIR pipeline`
- `Long lowering pipeline`

Open your own trace with:

```text
Pass Lens: Open Trace File
```

The trace should follow [`docs/pass-lens.schema.json`](docs/pass-lens.schema.json).
Agent exports follow
[`docs/pass-lens-agent-context.schema.json`](docs/pass-lens-agent-context.schema.json).
Agent tool manifests follow
[`docs/pass-lens-agent-tools.schema.json`](docs/pass-lens-agent-tools.schema.json).
See [`docs/agent-tools.md`](docs/agent-tools.md) for the agent-facing contract.
Collector examples live in [`docs/schema-examples.md`](docs/schema-examples.md).

## Core Workflow

1. Open a sample or local JSON trace.
2. Read the summary cards: changed passes, first signal, anomalies, trace
   quality, trace size, and slowest pass.
3. Select a pass in the timeline.
4. Inspect why the selected pass is interesting.
5. Compare before/after IR and metric deltas.
6. Open artifact sidecars or diagnostics when needed.
7. Export a repro bundle, issue summary, suspicious-pass explanation, or agent
   context.
8. Use prefix bisection when you need a minimal failing pass prefix.

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

This is the preferred path for timing, verifier attribution, pass identity, and
artifact-backed IR snapshots.

### `mlir-opt` Dump Fallback

Use `Pass Lens: Run mlir-opt Trace` when only `mlir-opt` is available. This path
reverse-parses textual dump markers, so it is useful for quick experiments but
cannot provide reliable per-pass duration.

### Downstream Compiler JSON

Downstream compilers can emit the schema directly:

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
- `Long lowering pipeline`: longer trace for filters, changed-only view, and
  slowest-pass navigation.
- `Verifier failure`: opens directly at the first failing pass.
- `External IR artifacts`: before/after IR and diagnostics loaded from sidecar
  files.
- `Triton NPU UB budget overflow`: optional hardware-backend metric anomaly
  case study.
- `Triton NPU strict fallback`: optional strict-mode legality and fallback case
  study.
- `Real Triton NPU dual RMSNorm`: optional real local `npuir2ascendc` trace from
  captured TTAdapter IR to generated AscendC kernel artifacts.

The Triton NPU / AscendC samples are not part of the core product contract.
They are kept as optional case studies showing that the same schema can carry
hardware-backend evidence.

## Commands

| Command | Purpose |
| --- | --- |
| `Pass Lens: Open Sample Trace` | Explore built-in examples |
| `Pass Lens: Open Trace File` | Open a local Pass Lens JSON trace |
| `Pass Lens: Run mlir-opt Trace` | Collect a best-effort trace from dump output |
| `Pass Lens: Run Structured MLIR Trace` | Run the structured MLIR collector driver |
| `Pass Lens: Query Current Trace` | Generate deterministic reports and summaries |
| `Pass Lens: Run Prefix Bisect` | Find a minimal failing MLIR pass prefix |
| `Pass Lens: Check MLIR Collector Setup` | Check local LLVM/MLIR collector build setup |

## Development

```powershell
npm install
npm run compile
npm test
npm run package
```

Press `F5` in VS Code to launch an Extension Development Host.

The structured collector lives in
[`collectors/mlir-pass-lens`](collectors/mlir-pass-lens). On a machine with
LLVM/MLIR development files:

```powershell
$env:MLIR_DIR="C:\path\to\llvm-build\lib\cmake\mlir"
$env:LLVM_DIR="C:\path\to\llvm-build\lib\cmake\llvm"
npm run check:mlir-collector
```

## Project Status

Pass Lens is a preview extension. The viewer, schema validation, sample gallery,
artifact opening, trace quality and size reports, repro bundle export, agent
context export, agent tool manifests, prefix bisection, and MLIR collector
scaffold are usable today.

Current focus:

- real downstream compiler collector workflows across MLIR, LLVM, IREE,
  torch-mlir, Triton, XLA, TVM, and hardware backends;
- lazy artifact loading and large-trace UX;
- stronger schema docs for external collector authors;
- stable agent-facing deterministic tool contracts;
- marketplace-ready packaging and demos.

See [docs/expert-roadmap-todo.md](docs/expert-roadmap-todo.md) for the
expert-guided execution checklist.

## Known Limitations

- The `mlir-opt` dump fallback is best-effort and cannot produce reliable
  per-pass timing.
- The structured collector currently targets MLIR-based drivers. LLVM New Pass
  Manager support is future work.
- Metric anomalies and suspicious-pass explanations are triage hints. They do
  not prove a pass is incorrect.
- The included Triton NPU failure traces are case-study samples. The real dual
  RMSNorm trace is generated from a local `npuir2ascendc` run, but it is not yet
  produced by live `PassInstrumentation` inside that compiler.

## License

MIT

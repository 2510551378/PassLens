# Collector Author Guide

Pass Lens is built around a public trace contract:

```text
Pass Lens Trace Schema = the shared debugging evidence format
VS Code extension       = one viewer
MLIR collector          = one reference producer
Other compilers         = independent producers
```

Use this guide when adding Pass Lens output to an MLIR driver, LLVM pass
pipeline, downstream compiler, hardware backend, or CI job.

## 1. What To Emit

A Pass Lens trace is a JSON object with `schemaVersion = 1` and a `stages`
array. Each stage represents one pass invocation or one compiler pipeline step.

Minimal valid trace:

```json
{
  "schemaVersion": 1,
  "tool": "my-compiler",
  "command": "my-compiler input.mlir --pass-pipeline=...",
  "input": "kernel.mlir",
  "pipeline": "builtin.module(func.func(canonicalize,cse))",
  "exitCode": 1,
  "compiler": {
    "name": "my-compiler",
    "version": "git:..."
  },
  "provenance": {
    "kind": "live-pass-instrumentation",
    "description": "Collected from the compiler pass instrumentation hook."
  },
  "stages": [
    {
      "index": 0,
      "pass": "canonicalize"
    }
  ]
}
```

Prefer starting from the examples in
[`docs/schema-examples/`](schema-examples/) and validating with:

```powershell
npm run validate:trace -- docs/schema-examples/mlir-structured.json
```

For MLIR drivers that can attach `PassInstrumentation`, use the C++ SDK surface
in [`mlir-collector-sdk.md`](mlir-collector-sdk.md). It documents the
instrumentation lifecycle, artifact path policy, metrics hook, diagnostics hook,
and validation checklist.

## 2. Map The Pipeline

Use stable pass identifiers. A good `pass` value should remain recognizable
across machines and builds:

```json
{
  "index": 3,
  "pass": "cse",
  "argument": "cse",
  "opName": "func.func",
  "nestingDepth": 1,
  "scope": "builtin.module/func.func"
}
```

Guidelines:

- `index` should be monotonic and match execution order.
- `pass` should not be a generated placeholder such as `pass-3`.
- `argument` should match the textual pass-pipeline name when available.
- `scope`, `opName`, and `nestingDepth` are optional but valuable for nested
  MLIR pass managers.

## 3. Record Producer Metadata

For reproducibility, include at least these top-level fields when available:

- `command`: canonical reproduction command.
- `exitCode`: process exit status from the run.
- `compiler`: `{ name, version, gitSha }` as available.
- `target`: `{ backend, platform, triple }` if relevant.
- `diagnostics`: command-level diagnostics not tied to one stage.

This makes downstream users clear about how a trace was produced before they
inspect stage-level evidence.

## 4. Record Before/After IR

For real compiler pipelines, prefer artifact-backed IR:

```json
{
  "capture": {
    "ir": "artifact",
    "metrics": true,
    "timing": true
  },
  "stages": [
    {
      "index": 0,
      "pass": "canonicalize",
      "artifacts": {
        "beforePath": "artifacts/stage-000000.before.mlir",
        "afterPath": "artifacts/stage-000000.after.mlir",
        "diagnosticsPath": "artifacts/stage-000000.diagnostics.txt"
      }
    }
  ]
}
```

Inline `irBefore` / `irAfter` is fine for tiny examples, but large inline IR
hurts editor startup, GitHub diffs, CI uploads, and agent context size. If a
trace may contain real functions/modules, default to sidecar files.

## 5. Record Diagnostics

Use stage-local diagnostics when a pass or verifier produced evidence tied to a
specific stage:

```json
{
  "index": 4,
  "pass": "legalize-vector-ops",
  "status": "verifier_failed",
  "verifier": "failed",
  "diagnostics": "error: expected legal vector.transfer_read"
}
```

Use top-level `diagnostics` only for command-level stderr, driver setup errors,
or messages that cannot be attributed to one stage.

## 6. Record Metrics

Metrics must be finite numbers:

```json
{
  "metricsBefore": {
    "ops": 42,
    "vector.transfer_read": 3
  },
  "metricsAfter": {
    "ops": 38,
    "vector.transfer_read": 0
  }
}
```

Metric names are intentionally compiler-defined. Keep backend-specific evidence
inside metrics, diagnostics, target metadata, or artifacts instead of adding new
top-level fields.

Use `metricProfiles` when a backend has important budgets:

```json
{
  "metricProfiles": {
    "my-backend": {
      "critical": ["fallback.count"],
      "budgets": {
        "shared_memory_bytes": 49152
      }
    }
  }
}
```

## 7. Record Status And Timing

Recommended `status` values:

| Status | Meaning |
| --- | --- |
| `ok` | Pass completed and did not change IR |
| `changed` | Pass completed and changed IR |
| `verifier_failed` | Pass completed but verifier failed |
| `pass_failed` | Pass itself failed or crashed |
| `skipped` | Pass was skipped by the driver |

Use `durationMs` for per-stage wall time when the instrumentation source can
measure it reliably. If the collector is a textual dump fallback and timing is
not available, set:

```json
{
  "capture": {
    "timing": false
  }
}
```

## 8. Set Provenance

Every bundled or shared trace should tell users how it was produced:

| `provenance.kind` | Use when |
| --- | --- |
| `live-pass-instrumentation` | Captured from a pass instrumentation hook |
| `converted-dump` | Converted from textual dumps or logs |
| `hand-authored` | Written as a schema example or small teaching sample |
| `real-artifact-capture` | Captured from a real run but not directly from live pass instrumentation |

This is a credibility label. It helps users distinguish a real collector trace
from a shape-only example.

## 9. Validate In CI

Add trace validation before uploading or publishing trace artifacts:

```yaml
- name: Validate Pass Lens trace
  run: npm run validate:trace -- --strict-only --check-artifacts path/to/trace.json
```

Pass a directory when you want the CLI to discover trace JSON files
recursively. Non-trace artifact JSON files are skipped unless you pass them as
explicit file arguments:

```yaml
- name: Validate Pass Lens samples and schema examples
  run: npm run validate:trace:all
```

Use `--strict-only` when you only want to enforce the public schema contract.
Use `--check-artifacts` when CI should fail if `beforePath`, `afterPath`, or
`diagnosticsPath` points to a missing sidecar file. This is recommended for
published samples, repro bundles, and CI artifacts. Schema examples can be
validated with `--strict-only` alone when their artifact paths are illustrative
producer templates rather than checked-in sidecars.
Use `--warnings-as-errors` when CI should reject viewer-level warnings such as
unstable pass names, duplicate stage indexes, or large inline IR.

## 10. Upload Repro Evidence

A useful CI artifact usually contains:

```text
pass-lens-repro/
  trace.json
  input.mlir
  pipeline.txt
  artifacts/
  diagnostics.txt
  run.sh
  run.ps1
  manifest.json
  agent-context.json
  agent-tools.json
```

The important property is not the exact directory name. The important property
is that a maintainer can open `trace.json` in Pass Lens and rerun or inspect the
same evidence without reconstructing context from scattered logs.

## 11. Common Mistakes

- Adding backend-specific top-level fields instead of using metrics,
  diagnostics, target metadata, or artifacts.
- Emitting generated pass names that are not stable across runs.
- Embedding multi-megabyte IR strings inline.
- Marking converted textual dumps as `live-pass-instrumentation`.
- Mixing relative artifact paths from different working directories.
- Emitting non-numeric metric values such as `"42"` or `"unknown"`.
- Treating suspicious-pass reports as proven root causes without rerun,
  verifier, prefix-bisect, or source-level evidence.

## 12. References

- [Trace schema](trace-schema.md)
- [JSON schema](pass-lens.schema.json)
- [Schema examples](schema-examples.md)
- [Sample provenance](sample-provenance.md)
- [Agent tool contract](agent-tools.md)

# From IR Dumps to Compiler Observability with Pass Lens

Many compiler pipelines still start with `mlir-opt`-style textual logs before any
structured collector is available. This guide shows a safe path from raw IR dumps
to a trace workflow that is closer to production observability.

## 1) Start from deterministic text input

Collect a simple baseline first, without requiring any collector changes in the
downstream compiler:

```bash
pass-lens-mlir-opt input.mlir -o /tmp/out.mlir \
  --pass-pipeline="builtin.module(func.func(canonicalize,cse))"
```

If your compiler only exposes textual dump output (or for quick local repros),
run traces through the built-in fallback:

```text
Pass Lens: Run mlir-opt Trace
```

The fallback route is useful for triage, and Pass Lens marks it as
`capture.timing = false` so users are aware of its limits.

## 2) Turn textual checkpoints into a stable artifact protocol

For observability to scale, prefer sidecar-backed evidence:

- Put per-stage before/after IR into files:
  `artifacts/<stage>-before.mlir`, `artifacts/<stage>-after.mlir`.
- Keep large diagnostics in sidecar files:
  `artifacts/<stage>-diagnostics.txt`.
- Emit stable `pass` identifiers and optional `argument`, `opName`,
  `scope`, `nestingDepth`.
- Always emit monotonic `index` values.

Then describe captures with:

```json
{
  "schemaVersion": 1,
  "tool": "downstream-compiler",
  "command": "downstream-driver input.mlir --pass-pipeline=...",
  "pipeline": "builtin.module(func.func(canonicalize,cse))",
  "provenance": {
    "kind": "real-artifact-capture",
    "description": "Converted textual dump migration; IR sidecars preserved."
  },
  "capture": {
    "ir": "artifact",
    "timing": false,
    "metrics": true
  }
}
```

This keeps the format stable even if some stages are still text-derived.

## 3) Validate before sharing

Use the same CI check as sample authors:

```powershell
npm run validate:trace -- --strict-only path\to\trace.json
```

If sidecars are shipped, add artifact checks:

```powershell
npm run validate:trace -- --strict-only --check-artifacts path\to\trace.json
```

For public sample sets and repo traces, artifact checks should usually be on.

## 4) Improve evidence quality in place

Once the baseline migration works, close the loop step-by-step:

1. Add missing `metricsBefore` / `metricsAfter` deltas for important passes.
2. Add `durationMs` once timing becomes available.
3. Switch collector output from converted dumps to direct structured
   PassInstrumentation when supported.
4. Preserve the same `trace.json` schema and field names; do not fork format
   by internal codebase.

This allows users to consume new traces without changing tooling.

## 5) Use the same output in issue + agent workflows

Downstream teams can now use one reproducible package shape for both human and
agent handoff:

- `trace.json` as evidence source.
- `artifacts/` for IR and diagnostics context.
- `trace size` and trace quality reports as quick trust signals.
- `Export repro directory` for a rerun-ready bundle (`run.sh`/`run.ps1`,
  `manifest.json`, `agent-context.json`, `agent-tools.json`).

That shape is intentionally generic and works for MLIR, LLVM New Pass Manager
inspirations, and non-MLIR pass pipelines.

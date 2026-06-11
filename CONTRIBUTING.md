# Contributing to Pass Lens

Welcome, and thank you for helping improve Pass Lens!

Pass Lens is an open-source compiler debugging workbench with a small, stable
`pass-lens.schema.json` contract. The extension, traces, and collector examples
are intentionally independent so that projects can add their own producers.

## Repository Setup

- Install dependencies: `npm install`
- Build once: `npm run compile`
- Run tests: `npm test`
- Run the release smoke gate: `npm run release:smoke`
- Run release readiness checks: `npm run release:check`

## Code Standards

- Keep changes minimal and focused on the public contract surfaces in
  [`docs/trace-schema.md`](docs/trace-schema.md).
- Preserve existing architecture boundaries (collector, UI, process, validation,
  tests).
- Prefer deterministic outputs and avoid non-reproducible behavior in tests and
  scripts.
- Include tests for functional changes:
  - `npm test` for code paths.
  - `node scripts/release-readiness.js` for public onboarding and release
    entry-point checks.

## Documentation Standards

- Keep user-facing docs concise, evidence-first, and command-verifiable.
- Keep `README.md` as the fastest onboarding path.
- Move deeper workflow material into `docs/`.
- Use links that keep traces, schema, and sample provenance discoverable.

## Trace Sample Contribution

If you contribute or update a trace in `sample-traces/`, please include:

- `provenance.kind`:
  - `live-pass-instrumentation`
  - `converted-dump`
  - `real-artifact-capture`
  - `hand-authored`
- `provenance.description` with redaction and acquisition notes.
- Prefer artifact-backed stages for non-trivial pipelines:
  - `capture.ir = "artifact"`
  - `artifacts.beforePath`, `artifacts.afterPath`, optional
    `artifacts.diagnosticsPath`.
- `schemaVersion = 1` and compatible top-level fields.

Before committing, run:

```powershell
npm run validate:trace -- --strict-only --check-artifacts sample-traces/your-trace.json
```

If the sample is a real downstream collector output, please also document it in
[`docs/sample-provenance.md`](docs/sample-provenance.md). This repo runs a strict
provenance sync check to prevent stale trace catalog entries.

## Collector Contributions

We welcome collectors for MLIR, LLVM New Pass Manager, and hardware/backend
pipelines.

Please:

- follow [`docs/collector-author-guide.md`](docs/collector-author-guide.md)
  and the schema contract.
- validate before sharing: `npm run validate:trace -- --strict-only --check-artifacts
  <trace.json>`.
- add CI-facing docs (`.github/workflows` and issue templates are welcome for
  new producer workflows).
- avoid breaking `mlir.json` and schema v1 public examples.

## Reporting Issues

When opening issues, include:

- reproduction command (and environment, if relevant),
- trace evidence (`trace.json`, producer, sample source),
- artifacts / diagnostics summaries,
- and a clear observed-vs-expected signal (first signal, anomaly, verifier, etc.).

Use the issue templates in `.github/ISSUE_TEMPLATE/` and keep reports scoped to
actual observable behavior.

## Code of Conduct

This project uses constructive, evidence-driven discussion. No flame, no blame,
clear reproducible steps, and actionable follow-up are the expectation.

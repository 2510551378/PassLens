# Downstream Structured Integration Workflow

This document defines the acceptance path for a real downstream MLIR compiler
that emits Pass Lens traces through structured instrumentation.

## Goal

Given a downstream compiler driver, prove it can reliably produce a Pass Lens
trace that passes public validation and is safe for community sharing.

## Step 1: Prepare a reproducible driver invocation

- Identify the driver command that already runs your pass pipeline.
- Ensure it can accept:
  - `--pass-lens-trace=<path>`
  - `--pass-lens-artifact-dir=<dir>`
  - `-o <output.mlir>`
- Keep other downstream flags unchanged where possible, and pass additional
  compiler flags with `--driver-arg` in the smoke runner.

## Step 2: Run the case-study smoke harness

IREE:

```powershell
$env:PASS_LENS_IREE_DRIVER="/path/to/downstream-pass-lens-driver"
cd /path/to/PassLens
npm run smoke:iree-case-study
```

Torch-MLIR:

```bash
export PASS_LENS_TORCH_MLIR_DRIVER="/path/to/downstream-pass-lens-driver"
cd /path/to/PassLens
npm run smoke:torch-mlir-case-study
```

## Step 3: Validate signal quality gates

- At minimum, the generated summary should satisfy:
  - `summary.errors.length === 0`
  - `summary.stageCount >= 1`
  - `summary.provenanceKind === "live-pass-instrumentation"`
  - strict schema and viewer checks are clean (already enforced by smoke scripts).
- Optional artifact check:
  - if `--pass-lens-artifact-dir` is used, run the driver smoke with default
    artifact checks enabled.
  - keep `--no-check-artifacts` only for early integration attempts.

## Step 4: External evidence command

Re-run strict+artifact validation directly for the generated trace:

```bash
npm run validate:trace -- --strict-only --check-artifacts <trace.json>
```

## Step 5: Promote a redacted sample (optional, recommended)

After the trace is validated and stable, promote it into the local sample
catalog:

```bash
npm run compile
npm run promote:downstream-sample -- \
  --source <trace.json> \
  --sample-dir sample-traces \
  --sample-name iree-structured-downstream \
  --redact-input \
  --redact-command
```

The promotion helper:

- validates trace strictness and viewer constraints;
- validates artifact references by default;
- copies referenced artifacts into the target sample directory;
- writes a summary JSON as `<sample-name>.downstream-promote-summary.json`.

If you want to ship a metadata-only sample first, pass `--no-copy-artifacts`
and keep `--redact-command`/`--redact-input` enabled.

## Step 6: Publish a redacted sample (optional, recommended)

Once the trace is verified and safe, add a redacted sample to `sample-traces/`
and record its provenance in `docs/sample-provenance.md`:

- `provenance.kind`: `live-pass-instrumentation`
- `provenance.description`: include compiler backend and flag profile.

Then run:

```bash
npm run validate:trace:all
npm test
```

When these pass, the integration is considered usable as an external reference point
for downstream users.

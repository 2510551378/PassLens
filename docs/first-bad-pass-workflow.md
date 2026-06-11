# Finding the First Bad MLIR Pass with Pass Lens

This guide uses a concrete workflow: from a failing pipeline run to a short,
reproducible evidence package suitable for local triage and CI issue filing.

## 0) Prepare a structured trace

Prefer structured collection whenever possible:

```bash
pass-lens-mlir-opt input.mlir \
  --pass-pipeline="builtin.module(func.func(canonicalize,cse))" \
  --pass-lens-trace=trace.pass-lens.json \
  --pass-lens-artifact-dir=artifacts \
  -o lowered.mlir
```

Then open in VS Code:

- `Pass Lens: Open Trace File`
- Select `trace.pass-lens.json`

If structured collection is not available, use fallback:

- `Pass Lens: Run mlir-opt Trace`

Pass Lens labels fallback capture mode explicitly in trace provenance.

## 1) Read the summary first

When the trace opens, read the summary cards in this order:

- `First signal`: earliest verifier/legality anomaly.
- `Trace quality`: schema/collector risk checks.
- `Anomalies`: suspicious metric jumps and budget violations.
- `Trace size`: inline vs artifact guidance.

For most failures, the `First signal` card is the fastest way to jump to the
likely root area.

## 2) Locate the first bad pass

Use keyboard shortcut:

- `f` → jump to first signal

Then inspect:

- IR before/after diff (artifact-backed or inline);
- diagnostics text;
- timing and metric deltas;
- warning tags from quality and issue checks.

If the first signal is a verifier change, check whether it is:

- explicit verifier failure,
- pass execution failure,
- or status derived from a later verifier check.

## 3) Verify candidate evidence before action

Before editing source, capture bounded evidence:

- `Export Repro Directory` (includes `trace.json`, artifacts, scripts)
- `Copy Agent Context` or `Copy suspicious-pass explanation`

Evidence to review before patching:

- stage index and pass name;
- whether stage has concrete diagnostics;
- metric evidence IDs;
- first failure/quality checks IDs.

Use the generated directory package as a deterministic handoff artifact for CI or
discussion.

## 4) Narrow search with prefix bisect (optional)

If suspect stage is not confident:

- `Pass Lens: Run Prefix Bisect`
- Keep the same base pipeline/input pair.

The bisect report records:

- candidate full shortest failing prefix,
- command attempts,
- diagnostics for each rerun,
- trace artifacts for each attempt.

If no structured collector is available in this environment, still collect
commands and outputs from fallback traces for reproducibility.

## 5) Create a CI-ready issue draft

From the opened trace:

- `Pass Lens: Query Current Trace`
- Select `Generate GitHub issue description`

Paste directly into issue text. The generated report already separates signal,
trace context, metrics, and validation notes.

## 6) Handoff template

When filing:

- Attach `pass-lens-repro.zip`-style directory bundle
  (`trace.json`, artifacts, `run.sh`, `run.ps1`, manifest).
- Include first-signal index and evidence IDs.
- Mention capture mode (`artifact` vs `inline`) and known limitations.

This keeps every failure review consistent and reduces “missing context” back-and-forth.

# Issue-Style Demo Playbook (IREE / torch-mlir / Triton)

This playbook defines a reproducible, evidence-grounded workflow for creating a
GitHub-style issue draft from a real compiler pipeline trace.

## Goal

For a real downstream compiler:

- collect a **real Pass Lens trace** (prefer `live-pass-instrumentation`)
- open and validate it
- produce the top signal summary + suspicious candidates
- export a reproducible bundle for teammates/agents
- publish a high-signal issue draft with direct evidence references

The same workflow should work for MLIR pipelines with only collector flag/name
adaptations.

## 0. Preflight

Before each run, verify:

- tools built or available:
  - `PASS_LENS_*` driver, e.g. `PASS_LENS_IREE_DRIVER` or `PASS_LENS_TORCH_MLIR_DRIVER`
  - Pass Lens repo checked out and compiled
- repository smoke path is clean (`npm run release:smoke` or at least `npm run test`)
- output directory has enough space and write permission

Example:

```powershell
npm run test
```

## 1) Collect a real structured trace

### IREE

```powershell
$env:PASS_LENS_IREE_DRIVER = "path\to\iree-pass-lens-driver"
npm run smoke:iree-case-study

# Or run directly:
node scripts/iree-case-study-smoke.js --driver "path\to\iree-pass-lens-driver" --pipeline "builtin.module(func.func(canonicalize))"
```

### torch-mlir

```powershell
$env:PASS_LENS_TORCH_MLIR_DRIVER = "path\to\torch-mlir-pass-lens-driver"
npm run smoke:torch-mlir-case-study

# Or run directly:
node scripts/torch-mlir-case-study-smoke.js --driver "path\to\torch-mlir-pass-lens-driver" --pipeline "builtin.module(func.func(canonicalize))"
```

### Custom pipeline (e.g., Triton)

If your Triton tooling has structured Pass Lens output, run it through your own
downstream collector command in the same pattern as above:

```powershell
node path\to\your-triton-downstream-script --trace-out .\artifacts\triton.trace.json
```

Acceptance:

- `npm run validate:trace -- --strict-only --check-artifacts <trace>.json`
- no strict errors
- stage count `>= 1`
- provenance kind is `live-pass-instrumentation`
- quality score above your team threshold

## 2) Open and inspect in VS Code

In VS Code:

1. `Pass Lens: Open Trace File`
2. choose the generated trace JSON
3. verify quick cards:
   - First signal
   - Anomalies
   - Trace quality
   - Trace size
   - Origin
4. click the first suspicious/failing stage
   - inspect before/after diff
   - check diagnostics
   - read suspicious pass explanation
   - check provenance / artifact links

## 3) Generate candidate issue-ready output

Use query/report paths:

- `Pass Lens: Query Current Trace` then `Generate GitHub issue description`
- `Pass Lens: Query Current Trace` then `Generate top suspicious passes`
- `Pass Lens: Export Directory Repro Bundle`

For a minimal issue draft:

1. generate GitHub issue description and copy as markdown
2. generate "Top 3 suspicious passes" for regression lead-in
3. generate directory repro bundle and verify `run.sh` / `run.ps1` can reproduce
4. attach:
   - `trace.json`
   - `agent-context.json`
   - `agent-tools.json`
   - `summary.md`
   - `regression-test-sketch.md`

## 4) Validate reproducibility locally

```powershell
cd <repro-dir>
./run.sh    # or ./run.ps1 on Windows
```

Then compare:

- produced trace passes strict validation
- rerun trace exhibits the same first-signal behavior (failure stage and diagnostics)
- bundle manifest records trace+artifact provenance

## 5) Issue template fields

Use this minimal template when opening upstream tickets:

```md
## Repro
- command:
- compiler input:
- Pass Lens trace path:
- stage index:
- first signal:
- evidence references:

## Observations
- IR change:
- diagnostics:
- metric anomaly:
- trace quality:
- missing evidence / risk:

## Repro bundle
- export path:
- notes:
```

Keep the tone factual; explicitly mark what is hypothesis vs evidence.

## 6) Cross-project pattern

For each downstream project keep one `docs/<project>-case-study.md` that:

- records exact driver flags
- records acceptance outputs
- records limitations and follow-up tasks
- records provenance kind + sample location in `docs/sample-provenance.md`

Keep these aligned with:

- `docs/collector-author-guide.md`
- `docs/trace-schema.md`
- `docs/sample-provenance.md`

## Done criteria (for this playbook itself)

- this doc is linked from `README.md`
- `docs/expert-roadmap-todo.md` marks issue-style demo work as complete
- each run produces an issue draft that references trace evidence IDs

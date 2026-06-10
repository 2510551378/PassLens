# IREE Downstream Structured Integration Case Study

This case study validates that Pass Lens can consume traces from a downstream MLIR
compiler through a structured collector integration, not through textual IR dump
conversion.

Current implementation status:

- The script is ready and validated against the Pass Lens schema and artifact
  contracts.
- A user-provided downstream driver must emit:
  - `--pass-lens-trace=<path>`
  - `--pass-lens-artifact-dir=<dir>`
- This smoke runner verifies:
  - process exit code;
  - strict schema checks;
  - viewer checks;
  - artifact path existence checks (when enabled).

## Run

Set up a structured driver that supports the Pass Lens trace flags, then run:

```bash
$env:PASS_LENS_IREE_DRIVER = "/path/to/downstream-pass-lens-driver"   # or just "downstream-pass-lens-driver" on PATH
# The runner resolves either a full executable path or a command name from PATH.
npm run smoke:iree-case-study
```

### Minimal real-driver verification

For external contributors, the following is the required minimum signal before
declaring a successful real downstream structured case:

1. A trace JSON is produced and validates with:
   `npm run validate:trace -- --strict-only --check-artifacts <summary.trace>`.
2. `summary.errors` is empty.
3. `summary.stageCount >= 1`.
4. `summary.provenanceKind === "live-pass-instrumentation"`.
5. `summary.qualityScore >= 80` (or the threshold passed via `--min-quality`).
6. The per-stage artifact references are readable in trace root (or are intentionally
   omitted for inline captures).

For a complete acceptance workflow checklist and optional redacted sample publication
steps, see [`docs/downstream-structured-integration-workflow.md`](downstream-structured-integration-workflow.md).

If your compiler wraps or renames pipeline flags, keep the smoke runner defaults and
pass your own flag through `--driver-arg`, for example:

```bash
node scripts/iree-case-study-smoke.js \
  --driver /path/to/downstream-pass-lens-driver \
  --pipeline builtin.module(func.func(canonicalize,cse)) \
  --driver-arg --my-pass-pipeline-flag \
  --driver-arg builtin.module(func.func(canonicalize,cse))
```

### Optional driver arguments

Commonly useful options:

- `--driver-arg` can be repeated for project-specific options.
- `--no-check-artifacts` is useful on first bring-up if artifact paths are
  intentionally deferred.

Optional:

```bash
$env:PASS_LENS_IREE_PIPELINE = "builtin.module(func.func(canonicalize,cse))"
$env:PASS_LENS_IREE_INPUT = "/path/to/input.mlir"
$env:PASS_LENS_IREE_CASE_DIR = "C:\\tmp\\passlens-iree-case"
$env:PASS_LENS_IREE_TIMEOUT_MS = "180000"
$env:PASS_LENS_IREE_WORKDIR = "/path/to/iree-tree"
```

Direct invocation after `npm run compile`:

```bash
node scripts/iree-case-study-smoke.js --driver /path/to/downstream-pass-lens-driver --input /path/to/input.mlir --pipeline builtin.module(func.func(canonicalize,cse)) --workdir /path/to/iree-tree
```

## Outputs

```text
.pass-lens-iree-case-study/
  iree-downstream-lowering.trace.json
  iree-downstream-lowering.output.mlir
  iree-downstream-lowering-artifacts/
  iree-downstream-lowering.stdout.txt
  iree-downstream-lowering.stderr.txt
  summary.json
```

## Smoke Checks

The runner checks:

- driver exit code is zero;
- strict schema validation has no errors;
- viewer validation has no errors;
- trace artifacts exist and are readable (if `--pass-lens-artifact-dir` is used);
- trace has at least one stage;
- provenance is `live-pass-instrumentation`;
- trace quality summary exists and passes minimum threshold (`qualityScore`, `qualitySummary`).

## Limitations

- This runner does not know your compiler-specific flags. Use `--driver-arg` to
  pass compiler/project-specific options.
- Some downstreams may use custom pipeline argument names; pass `--pipeline` only
  when that flag is recognized.

If you want to provide a redacted real trace to upstream later, prefer adding a
fixture under `sample-traces/` and mark it as `live-pass-instrumentation` in
`docs/sample-provenance.md`.

## Next Step

Once you confirm one real structured case, we can add a redacted trace artifact
to `sample-traces/` and link it from:

- `docs/sample-provenance.md`
- `docs/large-trace-smoke.md`
- `docs/expert-roadmap-todo.md`
- this case study's `summary.json` can be attached to issue/discussion posts.

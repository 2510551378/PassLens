# Torch-MLIR Downstream Structured Integration Case Study

Torch-mlir users can validate a real downstream integration with the same
structured collector contract as the rest of Pass Lens.

## Current Status

- Case study scaffold is available as a smoke harness.
- This still requires a user-provided `torch-mlir` or custom MLIR driver that
  emits Pass Lens structured traces (`--pass-lens-trace` +
  `--pass-lens-artifact-dir`) before this repository can ship a real sample.
- It is intentionally parallel to the IREE case study path so pipeline differences
  stay localized in driver arguments and `PASS_LENS_*` environment variables.

## Run

Set up a structured driver first:

```bash
export PASS_LENS_TORCH_MLIR_DRIVER="/path/to/downstream-pass-lens-driver"
npm run smoke:torch-mlir-case-study
```

### Minimal real-driver verification

For successful downstream integration, confirm these minimum signals:

1. `npm run validate:trace -- --strict-only --check-artifacts <summary.trace>` passes.
2. `summary.errors` is empty.
3. `summary.stageCount >= 1`.
4. `summary.provenanceKind === "live-pass-instrumentation"`.

If torch-mlir uses non-standard pipeline flags, keep a minimal runner command and
forward custom options with `--driver-arg`:

```bash
node scripts/torch-mlir-case-study-smoke.js \
  --driver /path/to/downstream-pass-lens-driver \
  --input /path/to/input.mlir \
  --driver-arg --my-pass-pipeline-flag \
  --driver-arg func.func(canonicalize,cse)
```

### Optional driver arguments

- `--driver-arg` is repeatable and preserved as raw driver arguments.
- `--no-check-artifacts` can be used temporarily if artifact path materialization is
  still in progress.

Optional:

```bash
export PASS_LENS_TORCH_MLIR_PIPELINE="builtin.module(func.func(canonicalize,cse))"
export PASS_LENS_TORCH_MLIR_INPUT="/path/to/input.mlir"
export PASS_LENS_TORCH_MLIR_CASE_DIR="/tmp/pass-lens-torch-mlir"
export PASS_LENS_TORCH_MLIR_WORKDIR="/path/to/torch-mlir-tree"
```

Direct invocation:

```bash
node scripts/torch-mlir-case-study-smoke.js \
  --driver /path/to/downstream-pass-lens-driver \
  --input /path/to/input.mlir \
  --pipeline builtin.module(func.func(canonicalize,cse)) \
  --driver-arg --my-extra-flag
```

## Validation

The runner checks:

- driver launch and exit code;
- strict schema validation;
- viewer-level validation;
- optional artifact path existence check (`--no-check-artifacts` to skip);
- at least one stage;
- `provenance.kind === live-pass-instrumentation`.

When a real redacted driver output exists, add it under `sample-traces/` with
`provenance.kind = "live-pass-instrumentation"`, then call out in
`docs/sample-provenance.md`.

## Next Step

Once you confirm a real torch-mlir structured case:

- add a redacted trace sample under `sample-traces/`,
- add it to the provenance catalog,
- and link it from `docs/sample-provenance.md` and `docs/expert-roadmap-todo.md`.

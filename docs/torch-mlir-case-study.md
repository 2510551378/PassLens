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

## Next Step

Once you confirm a real torch-mlir structured case:

- add a redacted trace sample under `sample-traces/`,
- add it to the provenance catalog,
- and link it from `docs/sample-provenance.md` and `docs/expert-roadmap-todo.md`.

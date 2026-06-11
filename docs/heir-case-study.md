# HEIR Downstream Case Study

This case study checks that Pass Lens can consume a real downstream MLIR
compiler pipeline through the textual dump fallback path.

It uses HEIR's `heir-opt` driver on a CKKS dot-product lowering pipeline:

```text
tests/Transforms/mlir_to_openfhe_ckks/dot_product_float.mlir
  --mlir-to-ckks=ciphertext-degree=8
  --scheme-to-openfhe=entry-function=dot_product
```

The resulting Pass Lens trace is labeled as `converted-dump`, not
`live-pass-instrumentation`, because it is reconstructed from
`--mlir-print-ir-before-all` and `--mlir-print-ir-after-all` textual output.

## Run

Build HEIR first so `bazel-bin/tools/heir-opt` exists, then run:

```powershell
$env:PASS_LENS_HEIR_ROOT = "/path/to/heir"
npm run smoke:heir-case-study
```

Optional controls:

```powershell
$env:PASS_LENS_HEIR_OPT = "/path/to/heir/bazel-bin/tools/heir-opt"
$env:PASS_LENS_HEIR_CASE_DIR = "C:\tmp\passlens-heir-case"
$env:PASS_LENS_HEIR_TIMEOUT_MS = "120000"
npm run smoke:heir-case-study
```

Direct invocation after `npm run compile`:

```powershell
node scripts/heir-case-study-smoke.js `
  --heir-root /path/to/heir `
  --heir-opt /path/to/heir/bazel-bin/tools/heir-opt `
  --output C:\tmp\passlens-heir-case
```

## Outputs

```text
.pass-lens-heir-case-study/
  mlir-to-openfhe-dot-product.trace.json
  mlir-to-openfhe-dot-product.output.mlir
  mlir-to-openfhe-dot-product.stderr.txt
  mlir-to-openfhe-dot-product.stdout.txt
  summary.json
```

The smoke validates:

- `heir-opt` exits successfully;
- textual dumps produce multiple Pass Lens stages;
- strict schema validation has no errors;
- viewer-level validation has no errors.

## L20 Result

Environment:

- HEIR root: `/home/ahc/fhe_ckks_pilot/heir-main`
- Driver: `/home/ahc/fhe_ckks_pilot/heir-main/bazel-bin/tools/heir-opt`
- Provenance: `converted-dump`

Observed result:

| Case | Status | Stages | Notes |
| --- | --- | ---: | --- |
| `mlir-to-openfhe-dot-product` | ok | 145 | 44 changed stages; strict schema + viewer validation passed |

Generated artifacts on L20:

- trace JSON: 1.9 MiB;
- final HEIR output MLIR: 7.1 KiB;
- `heir-opt` elapsed time: 2276.59 ms.

## Interpretation

Evidence:

- The input and passes come from HEIR, a real downstream MLIR/FHE compiler.
- Pass Lens can turn HEIR textual IR dumps into a trace with pass stages,
  before/after IR, metric deltas, provenance, and diagnostics.

Limits:

- This is not a structured `PassInstrumentation` integration.
- Per-pass timing remains unavailable and is marked as `capture.timing = false`.
- Inline IR is acceptable for this small case study, but larger HEIR pipelines
  should move to structured artifact-backed capture.

Next step:

- Integrate `passlens::addPassLensInstrumentation` into a downstream MLIR
  driver or HEIR fork so Pass Lens can capture live pass events, timing,
  verifier status, and artifact-backed IR directly.

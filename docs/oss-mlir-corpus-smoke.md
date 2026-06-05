# OSS MLIR Corpus Smoke

This smoke test checks Pass Lens against real open-source MLIR inputs from the
LLVM project instead of hand-authored local examples.

## Objective

Verify the full path:

```text
LLVM open-source MLIR input
  -> pass-lens-mlir-opt structured collector
  -> trace.json + artifact-backed IR sidecars
  -> Pass Lens trace validation with artifact checks
```

## How To Run

Build or locate `pass-lens-mlir-opt`, then run:

```bash
PASS_LENS_MLIR_OPT=/path/to/pass-lens-mlir-opt npm run smoke:oss-mlir
```

Optional environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `PASS_LENS_MLIR_OPT` | Structured collector executable | `pass-lens-mlir-opt` |
| `PASS_LENS_OSS_LLVM_TAG` | LLVM source tag to download | `llvmorg-20.1.2` |
| `PASS_LENS_OSS_SMOKE_DIR` | Output directory for inputs/traces/artifacts | OS temp dir |

The script downloads selected files from:

- `https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-20.1.2/mlir/test/Dialect/Arith/canonicalize.mlir`
- `https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-20.1.2/mlir/test/Dialect/MemRef/canonicalize.mlir`

It runs:

```text
builtin.module(canonicalize,cse)
```

with `--allow-unregistered-dialect`, because LLVM lit tests may contain
`test.*` operations used as rewrite fixtures.

## L20 Result

Environment:

- Machine: `L20`
- Collector: `/home/ahc/PassLens/build/pass-lens-mlir/pass-lens-mlir-opt`
- Collector LLVM version: `Ubuntu LLVM version 20.1.2`
- Pass Lens validation source: current repository branch

Observed result:

| Case | Source | Status | Stages | Artifact files | Validation |
| --- | --- | --- | ---: | ---: | --- |
| `arith-canonicalize` | LLVM `Dialect/Arith/canonicalize.mlir` | ok | 2 | 4 | strict schema + artifact check passed |
| `memref-canonicalize` | LLVM `Dialect/MemRef/canonicalize.mlir` | ok | 2 | 4 | strict schema + artifact check passed |

Validation command:

```bash
npm run validate:trace -- --strict-only --check-artifacts \
  /tmp/passlens-oss-mlir-smoke-allow-unregistered/traces/arith-canonicalize.json \
  /tmp/passlens-oss-mlir-smoke-allow-unregistered/traces/memref-canonicalize.json
```

Both traces passed with no issues.

## Negative Findings

Several LLVM lit files are not directly usable as one-shot compiler inputs
without additional splitting or test-dialect registration:

| Candidate | Failure mode |
| --- | --- |
| `Dialect/SCF/canonicalize.mlir` | duplicate affine map alias inside the combined test file |
| `Dialect/Tensor/canonicalize.mlir` | requires the MLIR test dialect for `test.destination_style_op` |
| `Transforms/canonicalize.mlir` | duplicate symbol in the combined test file |

These are not Pass Lens trace validation failures. They show that LLVM lit test
files are often collections of fixtures, expected diagnostics, or test-dialect
cases. A broader OSS corpus runner should either split lit files by test
sections or use a collector build that registers the MLIR test dialect.

## Interpretation

Evidence:

- Pass Lens can ingest real LLVM-project MLIR files through the structured MLIR
  collector.
- The generated traces use artifact-backed IR and pass strict schema validation.
- The artifact sidecars referenced by the traces exist and are CI-checkable.

Remaining risk:

- This smoke is intentionally small. It validates plumbing and artifact
  integrity, not broad dialect coverage.
- Larger LLVM/IREE/torch-mlir corpora should be added as separate milestones
  once the runner can handle lit splitting and project-specific dialect setup.

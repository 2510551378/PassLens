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

Optional local source override:

```bash
PASS_LENS_OSS_SOURCE_ROOT=/path/to/llvm-project/mlir/test \
npm run smoke:oss-mlir
```

or

```bash
npm run smoke:oss-mlir -- --source-root /path/to/llvm-project/mlir/test
```

Optional environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `PASS_LENS_MLIR_OPT` | Structured collector executable | `pass-lens-mlir-opt` |
| `PASS_LENS_OSS_LLVM_TAG` | LLVM source tag to download | `llvmorg-20.1.2` |
| `PASS_LENS_OSS_SMOKE_DIR` | Output directory for inputs/traces/artifacts | OS temp dir |
| `PASS_LENS_OSS_SOURCE_ROOT` | Optional local `mlir/test` input root; skips network fetches when set | unset |

The script downloads selected files from:

- `https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-20.1.2/mlir/test/Dialect/Arith/canonicalize.mlir`
- `https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-20.1.2/mlir/test/Dialect/MemRef/canonicalize.mlir`
- `https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-20.1.2/mlir/test/Dialect/SCF/canonicalize.mlir`
- `https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-20.1.2/mlir/test/Transforms/canonicalize.mlir`

It runs:

```text
builtin.module(canonicalize,cse)
```

with `--allow-unregistered-dialect`, because LLVM lit tests may contain
`test.*` operations used as rewrite fixtures.

For LLVM lit files that contain many independent fixtures, the runner splits on
`// -----`, skips `expected-error` chunks, and requires a minimum number of
successful chunks per source file. Unsupported chunks are recorded in
`results.json` but do not fail the smoke as long as the source-level coverage
requirement is met.

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
| `scf-canonicalize-sections` | LLVM `Dialect/SCF/canonicalize.mlir` | ok, 3/2 required chunks | 2 per chunk | 4 per chunk | strict schema + artifact check passed |
| `transforms-canonicalize-sections` | LLVM `Transforms/canonicalize.mlir` | ok, 3/2 required chunks | 2 per chunk | 4 per chunk | strict schema + artifact check passed |

Validation command:

```bash
PASS_LENS_MLIR_OPT=/home/ahc/PassLens/build/pass-lens-mlir/pass-lens-mlir-opt \
PASS_LENS_OSS_SMOKE_DIR=/tmp/passlens-oss-script-smoke-v2 \
npm run smoke:oss-mlir
```

All generated traces passed with no issues.

## Negative Findings

Several LLVM lit files are not directly usable as one-shot compiler inputs
without additional splitting or test-dialect registration. The current runner
handles splitting for selected SCF and Transform fixtures, but some files still
need project-specific dialect setup:

| Candidate | Failure mode |
| --- | --- |
| `Dialect/Tensor/canonicalize.mlir` | requires the MLIR test dialect for `test.destination_style_op` |

These are not Pass Lens trace validation failures. They show that LLVM lit test
files are often collections of fixtures, expected diagnostics, or test-dialect
cases. A broader OSS corpus runner should continue expanding lit splitting and
use a collector build that registers the MLIR test dialect when needed.

## Interpretation

Evidence:

- Pass Lens can ingest real LLVM-project MLIR files through the structured MLIR
  collector.
- The generated traces use artifact-backed IR and pass strict schema validation.
- The artifact sidecars referenced by the traces exist and are CI-checkable.

Remaining risk:

- This smoke is intentionally small. It validates plumbing, lit-section
  handling, and artifact integrity, not broad dialect coverage.
- Larger LLVM/IREE/torch-mlir corpora should be added as separate milestones
  once the runner can handle lit splitting and project-specific dialect setup.

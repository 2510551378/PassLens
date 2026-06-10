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
- provenance is `live-pass-instrumentation`.

## Limitations

- This runner does not know your compiler-specific flags. Use `--driver-arg` to
  pass compiler/project-specific options.
- Some downstreams may use custom pipeline argument names; pass `--pipeline` only
  when that flag is recognized.

## Next Step

Once you confirm one real structured case, we can add a redacted trace artifact
to `sample-traces/` and link it from:

- `docs/sample-provenance.md`
- `docs/large-trace-smoke.md`
- `docs/expert-roadmap-todo.md`
- this case study's `summary.json` can be attached to issue/discussion posts.

# Pass Lens Design Notes

## Scope

This prototype intentionally starts with the viewer contract instead of the
compiler integration. The trace file is the boundary between collector and UI.
That keeps the VSCode extension useful while LLVM/MLIR-specific collectors are
iterated independently.

## Responsibilities

- `src/extension.ts`: command registration, trace loading, schema normalization,
  and webview rendering.
- `src/mlirCollector.ts`: `mlir-opt` wrapper that enables MLIR pass IR dumps,
  parses dump blocks, derives simple metrics, and writes the trace schema.
- `collectors/mlir-pass-lens`: C++ MLIR `PassInstrumentation` scaffold for
  structured traces from a custom MLIR driver.
- `docs/trace-schema.md`: the JSON contract shared by the viewer and collectors.
- `scripts/check-mlir-collector.ps1`: Windows-first configure/build check for
  the C++ collector when `MLIR_DIR` and `LLVM_DIR` are available.

## Collector Paths

- `Run mlir-opt Trace`: pragmatic wrapper around `mlir-opt` textual IR dumps.
- `Run Structured MLIR Trace`: calls `pass-lens-mlir-opt`, the C++ driver that
  uses `PassInstrumentation` and emits structured trace JSON directly.
- `Check MLIR Collector Setup`: invokes the PowerShell build check and routes
  its output to a VSCode output channel.

## Positioning

Pass Lens should be treated as a compiler pass pipeline observability tool, not
only a trace viewer. The core workflow is postmortem debugging: find the first
meaningful IR change, first invalid IR, suspicious metric delta, slowest pass,
and repro command.

## Validation

Trace validation is intentionally non-blocking. Collectors under development
often emit partial traces, so Pass Lens should surface quality problems without
preventing inspection. Errors mean the trace is structurally suspicious;
warnings identify likely collector or scale issues; info messages point out
missing optional context.
- `sample-traces/mlir-toy.json`: small MLIR-like trace used for smoke testing.
- `sample-traces/mlir-long-pipeline.json`: long mixed-impact trace for UI
  validation.
- `sample-traces/mlir-verifier-failure.json`: first-signal failure trace.
- The webview: timeline navigation, metric delta table, and side-by-side IR diff.
- The visual hierarchy is summary first, pipeline map second, selected-pass
  details third. This keeps the default workflow focused on "where should I
  look first?" instead of raw trace browsing.
- Summary cards and pass cockpit buttons are navigational controls. They encode
  the common debug loop: first signal, adjacent changed pass, slowest pass,
  copied repro command.

## Invariants

- `stages` is ordered by execution order.
- `changed` means the pass changed its IR payload. If omitted, the extension
  derives it from `irBefore !== irAfter`.
- Metric values are numeric scalars. Non-numeric fields are ignored.
- The viewer handles missing IR and missing metrics without failing.
- Collector output is best-effort when based on textual MLIR dumps. It should
  remain a replaceable adapter.
- Impact bars are heuristics derived from metric deltas. They are navigation
  aids, not semantic proof that a pass is important.
- The default selected pass is the verifier failure if present, otherwise the
  first changed pass. This makes sample and real traces open on the likely
  first debug target.

## Next Collector Options

1. Build an MLIR `PassInstrumentation` plugin that writes trace JSON directly.
2. Add first-failure localization by rerunning prefixes with `--verify-each`.
3. Add an LLVM New Pass Manager plugin for LLVM IR after the MLIR path is stable.

Option 1 is cleaner long-term because it can record pass identity, scope,
timing, verifier status, and metrics without reverse-parsing terminal output.

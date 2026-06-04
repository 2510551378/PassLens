# Pass Lens Schema Examples

Machine-readable schema: [`pass-lens.schema.json`](pass-lens.schema.json).

This directory contains minimal, valid trace examples for external collector
authors. They are intentionally compiler-agnostic and avoid Pass Lens UI-only
fields. Each example should pass strict schema validation.

## Examples

| Example | Purpose |
| --- | --- |
| [`schema-examples/mlir-structured.json`](schema-examples/mlir-structured.json) | MLIR `PassInstrumentation` style collector with artifact-backed IR. |
| [`schema-examples/llvm-new-pass-manager.json`](schema-examples/llvm-new-pass-manager.json) | LLVM New Pass Manager style pass pipeline with LLVM-flavored metrics. |
| [`schema-examples/hardware-backend-metrics.json`](schema-examples/hardware-backend-metrics.json) | Hardware/backend lowering trace with metric budgets and critical metrics. |

## Authoring Rules

- Always set `schemaVersion` to `1`.
- Use stable pass identifiers in `stage.pass` and `stage.argument`.
- Keep metrics numeric. Put text in `diagnostics`, artifacts, or external files.
- Prefer `capture.ir = "artifact"` and `artifacts.beforePath/afterPath` for real
  compiler pipelines.
- Use `capture.timing = false` if timing is intentionally unavailable.
- Use `metricProfiles` only for domain-specific budgets or critical metrics.
- Keep backend-specific fields in metric names, `target`, diagnostics, or
  artifacts; do not add new top-level fields.

## Mapping Guidance

MLIR collectors should map nested pass manager data into `opName`, `symbol`,
`nestingDepth`, and `scope` when available.

LLVM New Pass Manager collectors can use `opName` values such as
`llvm.module`, `llvm.function`, `llvm.loop`, or `llvm.cgscc`; these are plain
strings and do not require a special schema extension.

Hardware backends should use metric names that remain meaningful outside one
implementation, for example `scratchpad.bytes`, `dma.queue.depth`,
`register.pressure.max`, `fallback.count`, or `legality.violations`.

When a backend needs richer evidence, attach it as artifact files and reference
them with `artifacts.diagnosticsPath` or before/after artifact paths.

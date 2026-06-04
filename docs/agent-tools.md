# Pass Lens Agent Tool Contract

Machine-readable schema: [`pass-lens-agent-tools.schema.json`](pass-lens-agent-tools.schema.json).

Pass Lens exposes agent-facing capabilities as deterministic tool contracts, not
as a generic chat API. The intent is to let an AI agent or automation wrapper
ask for bounded, trace-grounded operations while preserving evidence IDs,
uncertainty, and rerun requirements.

## Contract Shape

Directory repro bundles include:

```text
agent-context.json
agent-tools.json
```

- `agent-context.json` is bounded evidence for a selected trace/stage.
- `agent-tools.json` declares which deterministic Pass Lens operations are
  available for the trace.

Each tool descriptor includes:

- `id`: stable tool identifier such as `pass-lens.query.firstFailure`.
- `category`: `query`, `report`, `export`, or `rerun`.
- `inputSchema`: JSON-schema-like input contract.
- `output.format`: `json`, `markdown`, or `directory`.
- `requires`: optional local requirements such as filesystem or compiler driver
  access.

## Guardrails

Agents consuming this contract should follow the same rules as Pass Lens:

- cite evidence IDs or concrete trace fields for claims;
- treat suspicious-pass and root-cause outputs as candidates;
- do not auto-edit compiler source without rerun, prefix bisection, verifier
  output, or source inspection;
- prefer artifact-backed IR and bounded context for large traces.

## Current Tool Families

- Query tools: first failure, first changed stage, metric jumps, metric budgets,
  slowest passes, and text search.
- Report tools: GitHub issue draft, suspicious-pass summary, first-signal
  explanation, candidate root causes, trace quality, and trace size.
- Export tools: agent context, Markdown repro bundle, and directory repro
  bundle.
- Rerun tools: preview contract for local prefix bisection.

The contract is compiler-agnostic. Triton, IREE, torch-mlir, LLVM, XLA, TVM, and
hardware backends should all map their pass pipeline evidence into the same trace
schema instead of relying on backend-specific agent behavior.

## DeepSeek Smoke Test

For live model checks, Pass Lens includes an optional DeepSeek smoke script. It
sends a synthetic compiler trace plus `agent-tools` manifest to an
OpenAI-compatible DeepSeek Chat Completions endpoint, asks the model to choose a
single deterministic Pass Lens tool, then validates the returned JSON locally.

```powershell
$env:DEEPSEEK_API_PASS_LENS = [Environment]::GetEnvironmentVariable("DEEPSEEK_API_PASS_LENS", "User")
npm run smoke:deepseek-agent -- --model deepseek-v4-flash
npm run smoke:deepseek-agent -- --model deepseek-v4-pro
```

The script does not print the API key. A successful run prints a compact JSON
object containing `selectedToolId`, validated arguments, cited evidence IDs, and
the next action proposed by the model.

Validated on 2026-06-04:

- `deepseek-v4-flash` selected `pass-lens.query.firstFailure` with no arguments
  and cited `stages[2].status`.
- `deepseek-v4-pro` selected `pass-lens.query.firstFailure` with no arguments
  and cited `stages[2].status`.

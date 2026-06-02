# Pass Lens Expert Roadmap TODO

This TODO captures the expert guidance pasted on 2026-06-02 and turns it into
an execution checklist. The guiding principle is:

> Pass Lens is a trace-grounded debugging workbench for compiler pass
> pipelines, with optional AI agents for evidence-based root-cause triage and
> repro generation.

## Positioning

- [ ] Update public positioning from "trace viewer" to "pass pipeline
  observability / debugging workbench".
- [ ] Use the tagline: "evidence-driven postmortem debugger for MLIR/LLVM pass
  pipelines".
- [ ] Emphasize evidence chains: first signal, IR diff, diagnostics, metric
  anomalies, repro context, and artifact paths.
- [ ] Avoid positioning AI as a generic chat feature; keep AI trace-grounded
  and tool-mediated.

## P0: Trace-Grounded AI Foundation

- [x] Export bounded agent context as JSON / Markdown.
  - Commit: `f4ab855 Add agent context export`.
  - Evidence included: selected stage, neighboring stage summaries, metric
    deltas, anomalies, validation issues, diagnostics, repro command, artifact
    references, and investigation questions.
- [x] Export suspicious-pass explanation without model calls.
  - Commit: `a61c149 Add suspicious pass explanation export`.
  - Output includes likely issue, evidence, next checks, confidence, guardrails,
    and repro command.
- [x] Add an in-view "Explain suspicious pass" preview panel before export.
  - Commit: `ced3a5d Preview suspicious pass explanations`.
  - Preview renders likely issue, evidence, recommended checks, confidence, and
    guardrails in the selected-stage details view.
- [x] Add copy-to-clipboard actions for agent context and explanation.
  - Commit: this change.
  - `Copy explanation` copies Markdown; `Copy agent context` copies structured
    JSON generated from the selected stage.
- [x] Define a stable `pass-lens-agent-context` JSON schema.
  - Commit: this change.
  - Schema lives at `docs/pass-lens-agent-context.schema.json` and is covered by
    `tests/agent-context.test.js`.
- [x] Add context size accounting: selected IR chars, diagnostics chars,
  artifact-only references, and omitted stages.
  - Commit: this change.
  - `contextSize` is part of the agent-context JSON schema and Markdown export.
- [x] Add evidence IDs so explanations can cite specific fields such as
  `stages[17].metricsAfter["fallback.count"]`.
  - Commit: this change.
  - Stage summaries and metric deltas now expose `evidenceIds`; suspicious-pass
    explanations cite those IDs inline.

## P1: Natural-Language Trace Query

- [x] Implement deterministic trace query primitives first:
  - [x] Find first failure stage.
  - [x] Find first changed stage.
  - [x] Find first metric jump for a metric name.
  - [x] Find stages over a metric budget.
  - [x] List slowest N passes.
  - [x] Search pass names, scopes, diagnostics, and IR text.
  - Commit: this change.
  - Implemented in `src/traceQuery.ts` with unit coverage.
- [x] Add query results as structured objects before adding any LLM mapping.
  - Commit: this change.
  - `TraceQueryResult` and `TraceQueryMatch` carry labels, reasons, metrics,
    snippets, and evidence IDs.
- [x] Add command palette entry: `Pass Lens: Query Current Trace`.
  - Commit: this change.
  - The command runs deterministic queries against the current opened trace and
    renders a Markdown result document.
- [x] Support issue-ready summaries:
  - [x] "Generate GitHub issue description".
  - [x] "Summarize top 3 suspicious passes".
  - [x] "Explain first fallback / legality breakage / budget overflow".
  - Commit: this change.
  - Implemented deterministic Markdown generators in `src/issueSummary.ts` and
    exposed them through `Pass Lens: Query Current Trace`.
- [ ] Only later map natural language to deterministic query primitives.

## P2: Agentic Rerun / Prefix Bisection

- [ ] Design a rerun abstraction:
  - [x] `run_pipeline(prefix)`.
  - [x] `run_prefix_bisect()`.
  - [x] `run_with_verify_each()`.
  - [ ] `export_repro_bundle()`.
  - Commit: this change.
  - `src/rerun.ts` defines a runner interface plus deterministic prefix and
    verify-each orchestration.
- [x] Add prefix bisection for MLIR textual pipelines.
  - Commit: this change.
  - MLIR textual pipeline wrappers are preserved while constructing prefixes.
- [x] Confirm behavior on L20 with `pass-lens-mlir-opt`.
  - Commit: this change.
  - Verified `/home/ahc/PassLens/build/pass-lens-mlir/pass-lens-mlir-opt`
    on L20 with prefix pipelines for `canonicalize` and `canonicalize,cse`;
    traces contained 1 and 2 stages respectively.
  - The current driver rejects `--verify-each`, so the VS Code runner does not
    pass that flag.
- [x] Record bisect attempts and results into a repro artifact.
  - Commit: this change.
  - `createMinimalFailingPrefixReport` renders attempts, command lines, traces,
    and diagnostics as Markdown.
- [x] Add UI command: `Run Prefix Bisect`.
  - Commit: this change.
  - `Pass Lens: Run Prefix Bisect` prompts for an MLIR input and textual
    pipeline, then opens a minimal failing prefix report.
- [x] Generate a minimal failing prefix report:
  - [x] Full pipeline.
  - [x] Shortest failing prefix.
  - [x] First verifier failure.
  - [x] Command lines used.
  - [x] Diagnostics and trace paths.
  - Commit: this change.

## P3: Patch Suggestion / Test Generation

- [ ] Keep patch suggestions explicitly framed as candidates, not proven root
  causes.
- [ ] Add "candidate root causes" format:
  - [ ] Candidate.
  - [ ] Evidence.
  - [ ] Counter-evidence / uncertainty.
  - [ ] Next experiment.
- [ ] Generate regression test sketches from repro bundles.
- [ ] Suggest legality checks or rewrite guards only when diagnostics / IR diff
  provide concrete evidence.
- [ ] Do not auto-edit compiler source until rerun/bisect evidence is available.

## v0.2 Collector Credibility

- [ ] Run the structured MLIR collector inside one real downstream compiler
  pipeline.
  - [ ] Candidate: Triton -> TTIR / TTGIR -> NPU / AscendC.
  - [ ] Candidate: IREE lowering pipeline.
  - [ ] Candidate: torch-mlir lowering pipeline.
- [ ] Replace or supplement synthetic samples with 2-3 real trace cases.
- [ ] Document which samples are live `PassInstrumentation` output versus
  hand-authored / converted examples.
- [ ] Add collector trace quality checks:
  - [ ] Missing pass identity.
  - [ ] Missing timing.
  - [ ] Missing verifier status.
  - [ ] Missing artifacts for large IR.
  - [ ] Duplicate or non-monotonic stage indexes.
- [ ] Keep TypeScript `mlir-opt` dump parser as fallback, with clear timing
  limitations.

## Directory-Style Repro Bundle

- [ ] Add directory export alongside the existing Markdown repro bundle.
- [ ] Target structure:

```text
repro/
  trace.json
  pipeline.txt
  input.mlir
  artifacts/
    000-before.mlir
    000-after.mlir
  diagnostics.txt
  run.ps1
  run.sh
  summary.md
  agent-context.json
```

- [ ] Preserve artifact references and optionally copy artifacts into the bundle.
- [ ] Generate platform-specific rerun scripts.
- [ ] Add bundle manifest with tool versions and capture mode.
- [ ] Make bundle suitable for CI artifact upload and AI-agent tool input.

## Performance And Large Trace Support

- [ ] Lazy-load artifact IR on stage selection instead of hydrating every stage
  eagerly.
- [ ] Add virtualized timeline/list rendering for large traces.
- [ ] Add bounded / on-demand diff computation.
- [ ] Add trace-level size summary:
  - [ ] inline IR bytes.
  - [ ] artifact bytes.
  - [ ] number of stages.
  - [ ] diagnostics bytes.
- [ ] Add warnings and quick fixes for traces that should switch from inline IR
  to artifact IR.

## Schema And Collector Ecosystem

- [ ] Treat the JSON trace schema as a core public contract.
- [ ] Publish stable schema docs for external collector authors.
- [ ] Add schema examples for:
  - [ ] MLIR.
  - [ ] LLVM New Pass Manager.
  - [ ] Triton / hardware backend metrics.
- [ ] Build a small MLIR collector SDK surface around `PassInstrumentation`.
- [ ] Keep the schema compiler-agnostic enough for non-MLIR compilers.
- [ ] Investigate LLVM New Pass Manager integration.
- [ ] Investigate LLVM optimization remarks ingestion as complementary evidence.

## Marketplace And Ecosystem

- [ ] Publish VS Code Marketplace preview.
- [ ] Publish Open VSX preview.
- [ ] Add 30-second demo GIF to README.
- [ ] Write "Finding the First Bad MLIR Pass with Pass Lens".
- [ ] Write "From IR Dumps to Compiler Observability".
- [ ] Prepare an MLIR discourse post with a concrete real trace demo.
- [ ] Consider Triton / IREE / torch-mlir issue-style demos.

## Six-Month Execution Plan

### Month 0-1: Credible MVP

- [ ] Publish Marketplace preview.
- [ ] Add directory-style repro bundle.
- [ ] Add at least 3 trace cases, with provenance labels.
- [ ] Add demo GIF and workflow-focused README.
- [ ] Add trace quality score.

### Month 1-3: Real Collector Workflow

- [ ] Integrate structured collector into one real downstream compiler.
- [ ] Add artifact lazy loading.
- [ ] Add prefix bisection.
- [ ] Add first-failure localization report.
- [ ] Validate large trace UX and performance.

### Month 3-6: AI Agent Layer

- [x] Export agent context.
- [x] Export deterministic suspicious-pass explanation.
- [ ] Add deterministic trace query tools.
- [ ] Add issue generator.
- [ ] Add rerun / bisect agent tools.
- [ ] Defer patch suggestion until evidence and rerun tools are mature.

## Risks To Revisit

- [ ] Narrow audience: focus on MLIR/LLVM/Triton/IREE/XLA/TVM/torch-mlir and
  hardware backend teams.
- [ ] Adoption risk: prioritize real cases over UI polish.
- [ ] Hallucination risk: agent outputs must cite trace evidence and express
  uncertainty.
- [ ] Collector trust risk: structured collector quality matters more than
  feature count.
- [ ] Large trace risk: artifact and lazy loading path must be the default for
  real compiler pipelines.

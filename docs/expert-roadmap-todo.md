# Pass Lens Expert Roadmap TODO

This TODO captures the expert guidance pasted on 2026-06-02 and turns it into
an execution checklist. The guiding principle is:

> Pass Lens is a public pass-pipeline debugging evidence format, a reference
> VS Code workbench, a reference MLIR collector, and an optional trace-grounded
> agent handoff layer.

Release-level milestones are tracked in
[`docs/release-milestones.md`](release-milestones.md). This file remains the
more detailed execution checklist.

The 2026-06-06 subagent review follow-up is tracked in
[`docs/subagent-review-action-plan.md`](subagent-review-action-plan.md). Use
that document for the next implementation sequence when choosing between
collector credibility, large-trace performance, release surface, and extension
maintainability work.

## Positioning

- [x] Update public positioning from "trace viewer" to "pass pipeline
  observability / debugging workbench".
- [x] Use the tagline: "evidence-driven postmortem debugger for MLIR/LLVM pass
  pipelines".
- [x] Emphasize evidence chains: first signal, IR diff, diagnostics, metric
  anomalies, repro context, and artifact paths.
- [x] Avoid positioning AI as a generic chat feature; keep AI trace-grounded
  and tool-mediated.
  - Commit: this change.
  - Public README/package positioning now frames Pass Lens as a pass pipeline
    observability/debugging workbench and describes AI exports as
    trace-grounded, evidence-cited handoff artifacts rather than generic chat.
- [x] Keep public positioning compiler-agnostic instead of Triton/NPU-specific.
  - Commit: this change.
  - README sample ordering now leads with generic MLIR/verifier/artifact
    examples, package keywords no longer mention AscendC, and Triton/NPU traces
    are documented as optional case studies rather than the product contract.
- [x] Clarify that the trace schema is the public contract, the VS Code
  extension is one viewer, and collectors are independent producers.
  - Commit: this change.
  - README now links the collector author guide and release milestones, and
    public docs state that downstream compilers can implement their own
    producers.

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
- [x] Add an agent-facing deterministic tool manifest.
  - Commit: this change.
  - Directory repro bundles now include `agent-tools.json`, generated from
    `src/agentToolManifest.ts`, with a public schema at
    `docs/pass-lens-agent-tools.schema.json` and docs at
    `docs/agent-tools.md`.
- [x] Smoke-test agent tool selection with external LLMs through the manifest.
  - Commit: this change.
  - `scripts/deepseek-agent-smoke.js` validates that DeepSeek V4 Flash/Pro can
    read `agent-context` plus `agent-tools`, choose a legal deterministic tool,
    cite evidence IDs, and avoid source-edit guardrail violations.

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
- [x] Only later map natural language to deterministic query primitives.
  - Commit: this change.
  - Added `src/traceQueryPlanner.ts`, which maps clear English/Chinese requests
    to existing `TraceQuery` primitives and returns `ambiguous` / `unsupported`
    instead of guessing.
  - Exposed the preview planner as `pass-lens.query.planNaturalLanguage` in the
    agent tool manifest.

## P2: Agentic Rerun / Prefix Bisection

- [ ] Design a rerun abstraction:
  - [x] `run_pipeline(prefix)`.
  - [x] `run_prefix_bisect()`.
  - [x] `run_with_verify_each()`.
  - [x] `export_repro_bundle()`.
  - Commit: this change.
  - `src/rerun.ts` defines a runner interface plus deterministic prefix and
    verify-each orchestration; directory repro export is implemented in
    `src/directoryReproBundle.ts`.
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

- [x] Keep patch suggestions explicitly framed as candidates, not proven root
  causes.
  - Commit: this change.
  - The query workflow now generates candidate-root-cause reports that state
    candidates are not proven root causes or patch instructions.
- [x] Add "candidate root causes" format:
  - [x] Candidate.
  - [x] Evidence.
  - [x] Counter-evidence / uncertainty.
  - [x] Next experiment.
  - Commit: this change.
  - Implemented in `src/issueSummary.ts` and exposed through
    `Pass Lens: Query Current Trace`.
- [x] Generate regression test sketches from repro bundles.
  - Commit: this change.
  - `createRegressionTestSketch` generates a conservative MLIR/FileCheck-style
    test draft from trace evidence, and directory repro bundles now include
    `regression-test-sketch.md`.
- [x] Suggest legality checks or rewrite guards only when diagnostics / IR diff
  provide concrete evidence.
  - Commit: this change.
  - Candidate reports only mention legality/rewrite guard inspection when the
    selected stage has concrete legality, verifier, invalid, rewrite,
    diagnostic, or IR evidence; otherwise they explicitly defer patch ideas.
- [x] Do not auto-edit compiler source until rerun/bisect evidence is available.
  - Commit: this change.
  - Regression sketches and candidate-root-cause reports explicitly frame source
    edits as post-confirmation work after rerun, prefix bisection, or verifier
    evidence.

## v0.2 Collector Credibility

- [ ] Run the structured MLIR collector inside one real downstream compiler
  pipeline.
  - [ ] Candidate: Triton -> TTIR / TTGIR -> NPU / AscendC.
  - [ ] Candidate: IREE lowering pipeline.
  - [ ] Candidate: torch-mlir lowering pipeline.
  - [x] Torch-MLIR case-study harness and docs are in place (`smoke:torch-mlir-case-study`, `docs/torch-mlir-case-study.md`).
  - `scripts/iree-case-study-smoke.js` and
    [`docs/iree-case-study.md`](docs/iree-case-study.md) are ready as a reusable
    entry point for the IREE structured case-study smoke, once a driver with
    Pass Lens flags is available.
- [x] Run a real downstream MLIR compiler through the textual dump fallback.
  - `npm run smoke:heir-case-study` runs HEIR `heir-opt` on a CKKS
    dot-product lowering to OpenFHE, converts textual before/after IR dumps
    into a Pass Lens trace, and validates strict schema plus viewer checks.
  - Result and limitations are documented in `docs/heir-case-study.md`.
- [x] Replace or supplement synthetic samples with 2-3 real trace cases.
  - Commit: this change.
  - Added two additional real structured MLIR traces from OSS `mlir-opt` corpus runs:
    `mlir-live-pass-instrumentation-arith-canonicalize.json` and
    `mlir-live-pass-instrumentation-memref-canonicalize.json`, each with
    artifact-backed stages and explicit `live-pass-instrumentation` provenance.
- [x] Document which samples are live `PassInstrumentation` output versus
  hand-authored / converted examples.
  - Commit: this change.
  - Added `provenance` to schema v1 and every bundled sample trace, plus
    `docs/sample-provenance.md`. A new `mlir-live-pass-instrumentation.json`
    sample is real L20 `pass-lens-mlir-opt` structured collector output.
  - The VS Code sample gallery now gets its provenance labels from
    `src/sampleTraces.ts`, and `tests/sample-traces.test.js` checks that each
    catalog entry still matches the trace file's `provenance.kind`.
- [x] Smoke-test the structured collector on real open-source LLVM MLIR inputs.
  - Commit: this change.
  - `npm run smoke:oss-mlir` downloads selected LLVM-project MLIR files,
    collects artifact-backed traces with `pass-lens-mlir-opt`, and validates
    them with `--strict-only --check-artifacts`.
  - The runner supports `// -----` lit-section splitting and L20 currently
    validates Arith, MemRef, SCF sections, and Transform sections. Result is
    documented in `docs/oss-mlir-corpus-smoke.md`.
- [x] Add collector trace quality checks:
  - [x] Missing pass identity.
  - [x] Missing timing.
  - [x] Missing verifier status.
  - [x] Missing artifacts for large IR.
  - [x] Duplicate or non-monotonic stage indexes.
  - Commit: this change.
  - Implemented by `src/trace/quality.ts` and exposed through
    `Pass Lens: Query Current Trace` as a trace quality report.
  - L20 verified: real `pass-lens-mlir-opt` trace for
    `canonicalize,cse` scored 100/100 with no collector quality issues.
- [x] Keep TypeScript `mlir-opt` dump parser as fallback, with clear timing
  limitations.
  - Commit: this change.
  - The fallback collector now records
    `collectorVersion = "typescript-mlir-dump-fallback/0.1.0"` and
    `capture.timing = false`; trace quality reports this as a single
    `timing-unavailable` limitation instead of per-stage missing timing noise.

## Directory-Style Repro Bundle

- [x] Add directory export alongside the existing Markdown repro bundle.
  - Commit: this change.
  - Trace panels now expose `Export repro directory`, backed by
    `exportDirectoryReproBundle`.
- [x] Target structure:

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
  regression-test-sketch.md
  agent-context.json
  agent-tools.json
```

  - Commit: this change.
  - Implemented by `exportDirectoryReproBundle` and L20-verified via `run.sh`.

- [x] Preserve artifact references and optionally copy artifacts into the bundle.
  - Commit: this change.
  - Copied artifact mappings are recorded in `manifest.json`.
- [x] Generate platform-specific rerun scripts.
  - Commit: this change.
  - Bundles include `run.ps1` and `run.sh`.
- [x] Add bundle manifest with tool versions and capture mode.
  - Commit: this change.
  - `manifest.json` records tool, collector version, capture mode, files, input
    source, and copied artifact mappings.
- [x] Make bundle suitable for CI artifact upload and AI-agent tool input.
  - Commit: this change.
  - Bundles include `summary.md`, `agent-context.json`, `agent-tools.json`,
    `trace.json`, rerun scripts, diagnostics, and manifest metadata.
  - L20 verified: generated a real structured trace with
    `/home/ahc/PassLens/build/pass-lens-mlir/pass-lens-mlir-opt`, exported a
    directory bundle, then reran `run.sh` to produce `trace.rerun.json`.

## Performance And Large Trace Support

- [x] Lazy-load artifact IR on stage selection instead of hydrating every stage
  eagerly.
  - Commit: this change.
  - Opening a trace no longer reads every before/after artifact. The webview
    requests artifact IR for the selected stage, and export/copy actions hydrate
    only the selected stage before generating context.
- [x] Add virtualized timeline/list rendering for large traces.
  - Commit: this change.
  - The webview now renders only the visible timeline window with overscan,
    preserves scroll height with spacers, buckets dense overview segments, and
    caches metric-impact scores to avoid O(n^2) long-trace rendering.
  - Covered by a 2000-stage webview smoke test.
- [x] Add bounded / on-demand diff computation.
  - Commit: this change.
  - Diff rows are computed only for the selected stage and rendered through a
    hard row cap, with explicit omitted-row chips for large IR.
- [x] Add trace-level size summary:
  - [x] inline IR bytes.
  - [x] artifact bytes.
  - [x] number of stages.
  - [x] diagnostics bytes.
  - Commit: this change.
  - Implemented by `src/trace/size.ts`, exposed in the webview summary as
    `Trace size`, and available through `Pass Lens: Query Current Trace` as a
    trace size report.
- [x] Add warnings and quick fixes for traces that should switch from inline IR
  to artifact IR.
  - Commit: this change.
  - `TraceSizeSummary` now includes size warnings with explicit quick fixes,
    including artifact-backed recapture via `--pass-lens-artifact-dir <dir>`
    and repro directory export for missing artifact references.
- [x] Validate large-trace core processing and artifact hydration path.
  - `npm run smoke:large-trace` generates a synthetic artifact-backed trace and
    checks strict validation, trace size accounting, selected-stage hydration,
    anomaly computation, and bounded agent context export.
  - Results and scope are documented in `docs/large-trace-smoke.md`.

## Schema And Collector Ecosystem

- [x] Treat the JSON trace schema as a core public contract.
  - Commit: this change.
  - `docs/trace-schema.md` now states compatibility rules for schema v1:
    strict validation rejects unknown fields, backend-specific data should live
    in metrics/diagnostics/target/artifacts, and future extension should use a
    schema version bump.
- [x] Publish stable schema docs for external collector authors.
  - Commit: this change.
  - Added `docs/schema-examples.md` with collector authoring rules and mapping
    guidance for MLIR, LLVM New Pass Manager, and hardware backends.
- [x] Add a full collector author guide.
  - Commit: this change.
  - `docs/collector-author-guide.md` documents minimal traces, pass mapping,
    artifact-backed IR, diagnostics, metrics, status/timing, provenance, CI
    validation, repro artifacts, and common mistakes.
- [x] Add a trace validation CLI suitable for CI and collector authors.
  - Commit: this change.
  - `npm run validate:trace -- trace.json` reuses strict schema validation and
    viewer-level validation, with `--strict-only`, `--warnings-as-errors`, and
    `--json` modes.
  - The CLI also accepts directories, recursively discovers Pass Lens trace
    JSON files, skips non-trace artifact metadata JSON, and exposes
    `npm run validate:trace:all` for bundled samples and schema examples.
  - `--check-artifacts` verifies that referenced before/after/diagnostics
    sidecar files exist, so CI can reject incomplete artifact-backed sample
    traces while keeping schema-example artifact paths as unchecked producer
    templates.
- [x] Add schema examples for:
  - [x] MLIR.
  - [x] LLVM New Pass Manager.
  - [x] Generic hardware backend metrics.
  - Commit: this change.
  - Strict-valid examples live under `docs/schema-examples/` and are covered by
    `tests/trace-strict-validation.test.js`.
- [x] Build a small MLIR collector SDK surface around `PassInstrumentation`.
  - `PassLensOptions` now exposes metrics and diagnostics hooks, and
    `docs/mlir-collector-sdk.md` documents lifecycle, stage semantics, artifact
    path policy, validation, and downstream driver integration.
- [x] Keep the schema compiler-agnostic enough for non-MLIR compilers.
  - Commit: this change.
  - Public docs and agent contracts now describe Pass Lens as a generic compiler
    pass evidence schema; backend-specific samples are optional examples, and
    agent tools avoid Triton/NPU-specific inputs.
- [x] Investigate LLVM New Pass Manager integration.
  - Added schema-friendly extension envelope for New Pass Manager metadata and
    optimization-remark evidence.
  - Added `docs/schema-examples/llvm-optimization-remarks.json` and linked it
    from schema examples.
- [x] Investigate LLVM optimization remarks ingestion as complementary evidence.
  - Added `extensions` guidance in schema and collector author docs, with a
    concrete example carrying stage-local `llvmRemarks` payloads.

## Marketplace And Ecosystem

- [ ] Publish VS Code Marketplace preview.
- [ ] Publish Open VSX preview.
- [x] Add 30-second demo GIF to README.
- [x] Add an executable release readiness check before publishing.
  - `npm run release:check` validates public entry-point docs, Marketplace
    metadata, release milestone coverage, and sample trace provenance coverage.
  - `docs/release-readiness.md` documents the pre-publish command sequence and
    keeps Marketplace/Open VSX credentials outside the automated check.
- [x] Add a minimal CI demo for trace validation and evidence artifact upload.
  - Commit: this change.
  - `.github/workflows/pass-lens-demo.yml` validates public trace artifacts and
    uploads a small `pass-lens-demo-evidence` bundle containing `trace.json` and
    artifact-backed IR sidecars.
- [x] Write "Finding the First Bad MLIR Pass with Pass Lens".
  - Commit: this change.
  - Added `docs/first-bad-pass-workflow.md` and linked it from README.
- [x] Write "From IR Dumps to Compiler Observability".
  - Commit: this change.
  - Added `docs/from-ir-dumps-to-observability.md` and linked it from README.
- [x] Prepare an MLIR discourse post with a concrete real trace demo.
  - Added `docs/mlir-discourse-post-draft.md` with a ready-to-post draft and reproducible steps.
- [ ] Consider Triton / IREE / torch-mlir issue-style demos.

## Six-Month Execution Plan

### Month 0-1: Credible MVP

- [ ] Publish Marketplace preview.
- [ ] Add directory-style repro bundle.
- [x] Add at least 3 trace cases, with provenance labels.
  - Commit: this change.
  - All bundled sample traces now declare `provenance.kind` and
    `provenance.description`; tests enforce this for future samples.
- [ ] Add demo GIF and workflow-focused README.
- [x] Add trace quality score.
  - Commit: this change.
  - The webview summary now displays `Trace quality` from
    `evaluateTraceQuality(trace)`, and the query command can render the full
    quality report.

### Month 1-3: Real Collector Workflow

- [ ] Integrate structured collector into one real downstream compiler.
- [x] Add artifact lazy loading.
  - Commit: this change.
  - Stage artifact IR is loaded on selection through a webview request instead
    of eager trace-wide hydration.
- [x] Add prefix bisection.
  - `Pass Lens: Run Prefix Bisect` is available and now reports shortest
    failing-prefix diagnostics.
- [x] Add first-failure localization report.
  - `Query Current Trace` now includes `Generate first failure localization
    report` and exports the same report through the agent tool registry.
- [x] Validate large-trace core processing path.
  - `npm run smoke:large-trace` covers the non-UI path; a real webview demo or
    Marketplace recording remains separate presentation work.

### Month 3-6: AI Agent Layer

- [x] Export agent context.
- [x] Export deterministic suspicious-pass explanation.
- [x] Add deterministic trace query tools.
- [x] Add issue generator.
  - `Pass Lens: Generate Issue Draft` exports a GitHub issue-ready draft from
    the active trace and is available as a command.
- [x] Add rerun / bisect agent tools.
  - Commit: this change.
  - `pass-lens.rerun.prefixBisect` is declared as a preview local tool contract
    requiring filesystem and compiler-driver access.
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
- [ ] Extension maintainability risk: keep peeling command, process, webview,
  and export responsibilities out of `src/extension.ts` as features grow.
  - `src/process.ts` now owns process execution, command formatting, and bounded
    output trimming, with focused tests in `tests/process.test.js`.
  - `src/sampleTraces.ts` now owns sample gallery metadata and provenance labels,
    with catalog-to-trace drift checks in `tests/sample-traces.test.js`.

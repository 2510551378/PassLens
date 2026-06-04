# Release Milestones

Pass Lens is an open-source compiler debugging infrastructure project, not a
generic AI chat product. The release plan is organized around progressively
stronger evidence capture, reproducibility, and ecosystem adoption.

## v0.2: Real Collector Workflow

Goal: prove that Pass Lens can capture and explain a real pass pipeline, not
only open hand-authored examples.

Success criteria:

- At least one live `PassInstrumentation` trace from a real or realistic MLIR
  pipeline.
- Artifact-backed IR capture works by default for that trace.
- Trace provenance is visible and documented.
- `npm run validate:trace -- trace.json` validates public trace artifacts.
- Collector author guide gives external projects a 30-minute integration path.
- Large trace opening avoids eager artifact hydration.

Non-goals:

- Generic AI chat.
- Automatic compiler source patching.
- Binding Pass Lens to one downstream backend.

## v0.3: Large Trace Workbench

Goal: make real compiler traces comfortable to inspect.

Success criteria:

- Virtualized timeline/list rendering for large traces.
- Summary-first opening path for traces with many stages or large artifacts.
- Clear trace size warnings and artifact capture migration advice.
- Stress tests for long pipelines and large artifact-backed IR.
- Documentation that recommends artifact capture for real compiler pipelines.

## v0.4: CI And Repro Workflow

Goal: make Pass Lens useful when compiler failures happen in CI.

Success criteria:

- Minimal GitHub Actions demo validates a trace and uploads Pass Lens evidence.
- Repro bundle format is documented as a CI artifact shape.
- Issue templates explain how to attach `trace.json`, artifacts, and repro
  commands.
- `CONTRIBUTING.md` explains sample trace and collector contribution rules.
- Example issue text shows first signal, first anomaly, slowest pass, and rerun
  command.

## v0.5: Agent Contract Stabilization

Goal: keep agent integration evidence-grounded and optional.

Success criteria:

- Agent context schema and tool manifest are versioned and documented.
- Natural-language query planning stays a deterministic mapper to trace tools.
- Agent outputs cite evidence IDs and state uncertainty.
- Rerun and prefix-bisect tool contracts are clear about local filesystem and
  compiler-driver requirements.
- Patch suggestions remain candidate investigations unless backed by rerun,
  verifier, bisect, or source inspection evidence.

## Ongoing Open-Source Hygiene

- Publish VS Code Marketplace and Open VSX previews.
- Keep README focused on the 30-second path; move detailed guides into docs.
- Add a short demo GIF once the real collector workflow is polished.
- Maintain GitHub topics, About description, issue templates, and good first
  issues.
- Prefer real traces and credible provenance over synthetic feature demos.

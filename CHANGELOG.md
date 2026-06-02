# Changelog

## 0.1.0

- Added artifact-backed IR traces and sidecar artifact hydration.
- Split the trace panel CSS and JavaScript into media assets.
- Added strict trace schema validation and a JSON Schema document.
- Added domain metric profiles for AscendC budget and contract anomalies.
- Added Markdown repro bundle export.
- Added Triton NPU / AscendC case-study sample traces, including a real local
  `npuir2ascendc` dual RMSNorm trace.
- Added artifact open actions for before/after IR and diagnostics sidecars.
- Added CI checks for compile, tests, and VSIX packaging.
- Added Marketplace metadata, icon, and README visual assets.

## 0.0.1

- Initial VSCode extension prototype.
- Added pass trace viewer with timeline, pipeline map, metric deltas, and IR diff.
- Added sample trace gallery.
- Added `mlir-opt` dump-based collector path.
- Added structured MLIR collector scaffold using `PassInstrumentation`.
- Added `pass-lens-mlir-opt` driver scaffold and setup check script.

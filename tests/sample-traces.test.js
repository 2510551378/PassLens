const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const { sampleTraces, provenanceLabel } = require('../out/sampleTraces.js');
const { hydrateTraceArtifacts } = require('../out/trace/artifacts.js');
const { normalizeTrace } = require('../out/trace/schema.js');
const { validateTraceStrict } = require('../out/trace/strictValidation.js');
const { validateTrace } = require('../out/trace/validation.js');

test('sample traces normalize, hydrate artifacts, and validate without errors', async () => {
  const sampleDir = path.join(process.cwd(), 'sample-traces');
  const files = (await fs.readdir(sampleDir))
    .filter((file) => file.endsWith('.json'))
    .sort();

  assert.ok(files.includes('mlir-artifacts.json'));
  assert.ok(files.includes('mlir-live-pass-instrumentation.json'));

  const provenanceKinds = new Set();

  for (const file of files) {
    const tracePath = path.join(sampleDir, file);
    const raw = JSON.parse(await fs.readFile(tracePath, 'utf8'));
    assert.deepEqual(validateTraceStrict(raw), [], file);
    assert.equal(typeof raw.provenance?.kind, 'string', `${file} must declare provenance.kind`);
    assert.equal(typeof raw.provenance?.description, 'string', `${file} must describe provenance`);
    provenanceKinds.add(raw.provenance.kind);

    const trace = normalizeTrace(raw);
    const artifactIssues = await hydrateTraceArtifacts(trace, tracePath);
    const issues = [...validateTrace(trace), ...artifactIssues];

    assert.deepEqual(issues.filter((entry) => entry.severity === 'error'), [], file);
    assert.deepEqual(artifactIssues, [], file);
  }

  assert.ok(provenanceKinds.has('live-pass-instrumentation'));
  assert.ok(provenanceKinds.has('real-artifact-capture'));
  assert.ok(provenanceKinds.has('hand-authored'));
});

test('sample trace catalog has stable provenance labels', () => {
  assert.equal(provenanceLabel('live-pass-instrumentation'), 'Live PassInstrumentation');
  assert.equal(provenanceLabel('converted-dump'), 'Converted dump fallback');
  assert.equal(provenanceLabel('hand-authored'), 'Hand-authored schema example');
  assert.equal(provenanceLabel('real-artifact-capture'), 'Real artifact capture');
});

test('sample trace catalog points to existing traces with matching provenance', async () => {
  const seen = new Set();
  const sampleDir = path.join(process.cwd(), 'sample-traces');

  for (const entry of sampleTraces) {
    assert.equal(seen.has(entry.file), false, `duplicate sample trace entry: ${entry.file}`);
    seen.add(entry.file);

    const tracePath = path.join(sampleDir, entry.file);
    const raw = JSON.parse(await fs.readFile(tracePath, 'utf8'));
    assert.equal(raw.provenance?.kind, entry.provenanceKind, `${entry.file} provenance drifted from catalog`);
    assert.equal(entry.description, provenanceLabel(entry.provenanceKind));
  }
});

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

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

  for (const file of files) {
    const tracePath = path.join(sampleDir, file);
    const raw = JSON.parse(await fs.readFile(tracePath, 'utf8'));
    assert.deepEqual(validateTraceStrict(raw), [], file);

    const trace = normalizeTrace(raw);
    const artifactIssues = await hydrateTraceArtifacts(trace, tracePath);
    const issues = [...validateTrace(trace), ...artifactIssues];

    assert.deepEqual(issues.filter((entry) => entry.severity === 'error'), [], file);
    assert.deepEqual(artifactIssues, [], file);
  }
});

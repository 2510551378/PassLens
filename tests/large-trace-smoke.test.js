const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  generateLargeTraceFixture,
  parseArgs
} = require('../scripts/large-trace-smoke.js');

test('generateLargeTraceFixture emits artifact-backed stages without inline IR', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'pass-lens-large-smoke-'));
  const { tracePath } = generateLargeTraceFixture(root, {
    stageCount: 3,
    artifactLines: 2
  });
  const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));

  assert.equal(trace.capture.ir, 'artifact');
  assert.equal(trace.stages.length, 3);
  assert.equal(trace.stages[0].irBefore, undefined);
  assert.equal(trace.stages[0].artifacts.beforePath, 'artifacts/stage-000000.before.mlir');
  assert.ok(fs.existsSync(path.join(root, trace.stages[0].artifacts.beforePath)));
  assert.ok(fs.existsSync(path.join(root, trace.stages[0].artifacts.afterPath)));
});

test('parseArgs accepts explicit large trace smoke options', () => {
  const options = parseArgs([
    '--stages',
    '42',
    '--artifact-lines',
    '9',
    '--output',
    'tmp-large-smoke'
  ]);

  assert.equal(options.stageCount, 42);
  assert.equal(options.artifactLines, 9);
  assert.equal(options.outputRoot, 'tmp-large-smoke');
});

test('parseArgs accepts npm-forwarded positional fallback', () => {
  const options = parseArgs(['42', '9', 'tmp-large-smoke']);

  assert.equal(options.stageCount, 42);
  assert.equal(options.artifactLines, 9);
  assert.equal(options.outputRoot, 'tmp-large-smoke');
});

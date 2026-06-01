const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { hydrateTraceArtifacts } = require('../out/trace/artifacts.js');
const { normalizeTrace } = require('../out/trace/schema.js');

test('hydrateTraceArtifacts reads relative before, after, and diagnostics artifacts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-artifacts-'));
  const artifacts = path.join(root, 'artifacts');
  await fs.mkdir(artifacts);
  await fs.writeFile(path.join(artifacts, '0-before.mlir'), 'module { func.func @kernel() }', 'utf8');
  await fs.writeFile(path.join(artifacts, '0-after.mlir'), 'module { ac.launch @kernel }', 'utf8');
  await fs.writeFile(path.join(artifacts, '0-diag.txt'), 'verifier ok', 'utf8');

  const trace = normalizeTrace({
    capture: { ir: 'artifact' },
    stages: [
      {
        index: 0,
        pass: 'convert-to-ac',
        status: 'ok',
        artifacts: {
          beforePath: 'artifacts/0-before.mlir',
          afterPath: 'artifacts/0-after.mlir',
          diagnosticsPath: 'artifacts/0-diag.txt'
        }
      }
    ]
  });

  const issues = await hydrateTraceArtifacts(trace, path.join(root, 'trace.json'));

  assert.deepEqual(issues, []);
  assert.equal(trace.stages[0].irBefore, 'module { func.func @kernel() }');
  assert.equal(trace.stages[0].irAfter, 'module { ac.launch @kernel }');
  assert.equal(trace.stages[0].diagnostics, 'verifier ok');
  assert.equal(trace.stages[0].changed, true);
  assert.equal(trace.stages[0].status, 'changed');
});

test('hydrateTraceArtifacts reports missing artifacts as non-blocking issues', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-artifacts-'));
  const trace = normalizeTrace({
    capture: { ir: 'artifact' },
    stages: [
      {
        index: 3,
        pass: 'missing',
        artifacts: {
          beforePath: 'artifacts/missing-before.mlir'
        }
      }
    ]
  });

  const issues = await hydrateTraceArtifacts(trace, path.join(root, 'trace.json'));

  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'warning');
  assert.equal(issues[0].stageIndex, 3);
  assert.match(issues[0].message, /Could not read before artifact/);
});

test('hydrateTraceArtifacts recomputes changed for mixed inline and artifact IR', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-artifacts-'));
  await fs.writeFile(path.join(root, '0-after.mlir'), 'module { func.func @kernel() }', 'utf8');

  const trace = normalizeTrace({
    capture: { ir: 'artifact' },
    stages: [
      {
        index: 0,
        pass: 'mixed',
        irBefore: 'module { func.func @kernel() }',
        artifacts: {
          afterPath: '0-after.mlir'
        }
      }
    ]
  });

  assert.equal(trace.stages[0].changed, true);

  const issues = await hydrateTraceArtifacts(trace, path.join(root, 'trace.json'));

  assert.deepEqual(issues, []);
  assert.equal(trace.stages[0].irAfter, 'module { func.func @kernel() }');
  assert.equal(trace.stages[0].changed, false);
  assert.equal(trace.stages[0].status, 'ok');
});

test('hydrateTraceArtifacts bounds large artifact reads', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-artifacts-'));
  await fs.writeFile(path.join(root, 'large.mlir'), '0123456789', 'utf8');
  const trace = normalizeTrace({
    capture: { ir: 'artifact' },
    stages: [
      {
        index: 0,
        pass: 'large',
        artifacts: {
          beforePath: 'large.mlir'
        }
      }
    ]
  });

  const issues = await hydrateTraceArtifacts(trace, path.join(root, 'trace.json'), {
    maxArtifactBytes: 4
  });

  assert.deepEqual(issues, []);
  assert.match(trace.stages[0].irBefore, /^0123/);
  assert.match(trace.stages[0].irBefore, /Pass Lens truncated artifact: 6 bytes omitted/);
});

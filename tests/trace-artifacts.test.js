const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  hydrateTraceArtifacts,
  hydrateTraceStageArtifacts
} = require('../out/trace/artifacts.js');
const { resolveArtifactPathWithinTraceRoot } = require('../out/trace/artifactPaths.js');
const { normalizeTrace } = require('../out/trace/schema.js');

test('resolveArtifactPathWithinTraceRoot rejects absolute and escaping paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-artifact-paths-'));

  assert.equal(resolveArtifactPathWithinTraceRoot(root, 'artifacts/0-before.mlir').ok, true);
  assert.equal(resolveArtifactPathWithinTraceRoot(root, '../outside.mlir').ok, false);
  assert.equal(resolveArtifactPathWithinTraceRoot(root, path.resolve(root, 'artifact.mlir')).ok, false);
});

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
  assert.equal(issues[0].field, 'artifacts.beforePath');
  assert.match(issues[0].message, /Could not read before artifact/);
});

test('hydrateTraceArtifacts rejects artifact paths outside the trace directory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-artifacts-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-artifacts-outside-'));
  await fs.writeFile(path.join(outside, 'secret.mlir'), 'module { secret }', 'utf8');

  const trace = normalizeTrace({
    capture: { ir: 'artifact' },
    stages: [
      {
        index: 4,
        pass: 'escape',
        artifacts: {
          beforePath: path.relative(root, path.join(outside, 'secret.mlir'))
        }
      }
    ]
  });

  const issues = await hydrateTraceArtifacts(trace, path.join(root, 'trace.json'));

  assert.equal(issues.length, 1);
  assert.equal(issues[0].stageIndex, 4);
  assert.equal(issues[0].field, 'artifacts.beforePath');
  assert.match(issues[0].message, /rejected/);
  assert.equal(trace.stages[0].irBefore, '');
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

test('hydrateTraceStageArtifacts reads only the selected stage artifacts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-artifacts-'));
  await fs.writeFile(path.join(root, '0-before.mlir'), 'module { func.func @a() }', 'utf8');
  await fs.writeFile(path.join(root, '0-after.mlir'), 'module { func.func @a() }', 'utf8');
  await fs.writeFile(path.join(root, '1-before.mlir'), 'module { func.func @b() }', 'utf8');
  await fs.writeFile(path.join(root, '1-after.mlir'), 'module { func.func @b() { ac.launch } }', 'utf8');

  const trace = normalizeTrace({
    capture: { ir: 'artifact' },
    stages: [
      {
        index: 0,
        pass: 'first',
        artifacts: {
          beforePath: '0-before.mlir',
          afterPath: '0-after.mlir'
        }
      },
      {
        index: 1,
        pass: 'second',
        status: 'ok',
        artifacts: {
          beforePath: '1-before.mlir',
          afterPath: '1-after.mlir'
        }
      }
    ]
  });

  const issues = await hydrateTraceStageArtifacts(trace, path.join(root, 'trace.json'), 1);

  assert.deepEqual(issues, []);
  assert.equal(trace.stages[0].irBefore, '');
  assert.equal(trace.stages[0].irAfter, '');
  assert.equal(trace.stages[1].irBefore, 'module { func.func @b() }');
  assert.equal(trace.stages[1].irAfter, 'module { func.func @b() { ac.launch } }');
  assert.equal(trace.stages[1].changed, true);
  assert.equal(trace.stages[1].status, 'changed');
});

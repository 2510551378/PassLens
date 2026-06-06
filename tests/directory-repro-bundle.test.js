const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { exportDirectoryReproBundle } = require('../out/directoryReproBundle.js');

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

test('exportDirectoryReproBundle writes repro directory with manifest and agent context', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-directory-repro-'));
  const source = path.join(root, 'source');
  const target = path.join(root, 'repro');
  await fs.mkdir(path.join(source, 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(source, 'kernel.mlir'), 'module { func.func @main() { return } }\n', 'utf8');
  await fs.writeFile(path.join(source, 'artifacts', '1-before.mlir'), 'module { func.func @main() }\n', 'utf8');
  await fs.writeFile(path.join(source, 'artifacts', '1-after.mlir'), 'module { ac.launch @main }\n', 'utf8');
  await fs.writeFile(path.join(source, 'trace.json'), '{}\n', 'utf8');

  const manifest = await exportDirectoryReproBundle(
    {
      schemaVersion: 1,
      tool: 'pass-lens-mlir-opt',
      collectorVersion: '0.1.0',
      input: 'kernel.mlir',
      pipeline: 'builtin.module(func.func(canonicalize,convert-to-ac))',
      command: 'pass-lens-mlir-opt kernel.mlir --pass-pipeline=...',
      diagnostics: 'trace diagnostics',
      capture: {
        ir: 'artifact'
      },
      stages: [
        {
          index: 0,
          pass: 'canonicalize',
          changed: false,
          status: 'ok'
        },
        {
          index: 1,
          pass: 'convert-to-ac',
          changed: true,
          status: 'changed',
          irBefore: 'inline before should not win over artifact',
          irAfter: 'inline after should not win over artifact',
          artifacts: {
            beforePath: 'artifacts/1-before.mlir',
            afterPath: 'artifacts/1-after.mlir'
          },
          metricsBefore: {
            ops: 1
          },
          metricsAfter: {
            ops: 2
          }
        }
      ]
    },
    [],
    [
      {
        severity: 'warning',
        stageIndex: 1,
        pass: 'convert-to-ac',
        metric: 'ops',
        before: 1,
        after: 2,
        delta: 1,
        message: 'ops increased'
      }
    ],
    {
      targetDir: target,
      sourceTracePath: path.join(source, 'trace.json'),
      selectedStageIndex: 1,
      createdAt: '2026-06-02T00:00:00.000Z'
    }
  );

  assert.equal(manifest.kind, 'pass-lens-directory-repro');
  assert.equal(manifest.inputSource, 'copied');
  assert.equal(manifest.copiedArtifacts.length, 2);
  assert.deepEqual(Object.keys(manifest.files).sort(), [
    'agentContext',
    'agentTools',
    'artifacts',
    'diagnostics',
    'input',
    'manifest',
    'pipeline',
    'regressionTestSketch',
    'runPs1',
    'runSh',
    'summary',
    'trace'
  ]);
  assert.equal(await exists(path.join(target, 'trace.json')), true);
  assert.equal(await exists(path.join(target, 'pipeline.txt')), true);
  assert.equal(await exists(path.join(target, 'input.mlir')), true);
  assert.equal(await exists(path.join(target, 'run.ps1')), true);
  assert.equal(await exists(path.join(target, 'run.sh')), true);
  assert.equal(await exists(path.join(target, 'summary.md')), true);
  assert.equal(await exists(path.join(target, 'regression-test-sketch.md')), true);
  assert.equal(await exists(path.join(target, 'agent-context.json')), true);
  assert.equal(await exists(path.join(target, 'agent-tools.json')), true);
  assert.equal(await fs.readFile(path.join(target, 'artifacts', '001-after.mlir'), 'utf8'), 'module { ac.launch @main }\n');

  const manifestJson = JSON.parse(await fs.readFile(path.join(target, 'manifest.json'), 'utf8'));
  assert.equal(manifestJson.createdAt, '2026-06-02T00:00:00.000Z');
  assert.equal(manifestJson.files.regressionTestSketch, 'regression-test-sketch.md');
  assert.equal(manifestJson.files.agentTools, 'agent-tools.json');
  assert.match(await fs.readFile(path.join(target, 'regression-test-sketch.md'), 'utf8'), /Pass Lens Regression Test Sketch/);
  const agentContext = JSON.parse(await fs.readFile(path.join(target, 'agent-context.json'), 'utf8'));
  assert.equal(agentContext.kind, 'pass-lens-agent-context');
  const agentTools = JSON.parse(await fs.readFile(path.join(target, 'agent-tools.json'), 'utf8'));
  assert.equal(agentTools.kind, 'pass-lens-agent-tools');
  assert.ok(agentTools.tools.some((tool) => tool.id === 'pass-lens.query.firstFailure'));
});

test('exportDirectoryReproBundle falls back to first stage IR when input file is missing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-directory-repro-missing-input-'));
  const target = path.join(root, 'repro');

  const manifest = await exportDirectoryReproBundle(
    {
      schemaVersion: 1,
      input: 'missing.mlir',
      pipeline: 'builtin.module(canonicalize)',
      stages: [
        {
          index: 0,
          pass: 'canonicalize',
          changed: true,
          irBefore: 'module { func.func @fallback() }',
          irAfter: 'module { func.func @fallback() }'
        }
      ]
    },
    [],
    [],
    {
      targetDir: target,
      sourceTracePath: path.join(root, 'trace.json'),
      createdAt: '2026-06-02T00:00:00.000Z'
    }
  );

  assert.equal(manifest.inputSource, 'first-stage-ir');
  assert.match(await fs.readFile(path.join(target, 'input.mlir'), 'utf8'), /@fallback/);
});

test('exportDirectoryReproBundle does not copy artifacts outside the trace directory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-directory-repro-contained-'));
  const source = path.join(root, 'source');
  const outside = path.join(root, 'outside');
  const target = path.join(root, 'repro');
  await fs.mkdir(source, { recursive: true });
  await fs.mkdir(outside, { recursive: true });
  await fs.writeFile(path.join(source, 'trace.json'), '{}\n', 'utf8');
  await fs.writeFile(path.join(outside, 'before.mlir'), 'module { should_not_copy }', 'utf8');

  const manifest = await exportDirectoryReproBundle(
    {
      schemaVersion: 1,
      capture: { ir: 'artifact' },
      stages: [
        {
          index: 0,
          pass: 'contained',
          changed: false,
          artifacts: {
            beforePath: '../outside/before.mlir'
          }
        }
      ]
    },
    [],
    [],
    {
      targetDir: target,
      sourceTracePath: path.join(source, 'trace.json'),
      createdAt: '2026-06-02T00:00:00.000Z'
    }
  );

  assert.equal(manifest.copiedArtifacts.length, 0);
  assert.equal(await exists(path.join(target, 'artifacts', '000-before.mlir')), false);
});

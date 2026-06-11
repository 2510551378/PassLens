const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  applyRedactions,
  collectArtifactRefs,
  isRelativePath,
  parseArgs,
  sanitizeSampleName
} = require('../scripts/promote-downstream-trace-sample.js');
const script = require('../scripts/promote-downstream-trace-sample.js');

test('parseArgs handles source/sample options and redaction flags', () => {
  const parsed = parseArgs([
    '--source', '/tmp/in.trace.json',
    '--sample-dir', '/tmp/sample',
    '--sample-name', 'demo',
    '--redact-input',
    '--redact-command',
    '--no-copy-artifacts',
    '--overwrite'
  ]);
  assert.equal(parsed.sourceTrace, '/tmp/in.trace.json');
  assert.equal(parsed.sampleDir, '/tmp/sample');
  assert.equal(parsed.sampleName, 'demo');
  assert.equal(parsed.redactInput, true);
  assert.equal(parsed.redactCommand, true);
  assert.equal(parsed.copyArtifacts, false);
  assert.equal(parsed.overwrite, true);
});

test('collectArtifactRefs captures all artifact fields', () => {
  const refs = collectArtifactRefs({
    stages: [
      {
        index: 0,
        artifacts: {
          beforePath: 'a/before.mlir',
          afterPath: 'a/after.mlir',
          diagnosticsPath: 'a/diag.txt'
        }
      },
      {
        index: 1,
        artifacts: {
          beforePath: '   ',
          afterPath: 'b/after.mlir',
          diagnosticsPath: ''
        }
      }
    ]
  });

  assert.deepEqual(refs.map((entry) => entry.path), [
    'a/before.mlir',
    'a/after.mlir',
    'a/diag.txt',
    'b/after.mlir'
  ]);
});

test('isRelativePath rejects absolute paths', () => {
  assert.equal(isRelativePath('artifacts/foo.mlir'), true);
  assert.equal(isRelativePath(path.join('..', 'escape.mlir')), false);
  assert.equal(isRelativePath(path.resolve('artifacts', 'foo.mlir')), false);
});

test('applyRedactions replaces requested top-level fields', () => {
  const trace = {
    input: 'inputs/input.mlir',
    command: 'custom-driver --pass-lens-trace=x',
    stages: []
  };
  const summary = { redactedFields: [] };
  applyRedactions(trace, true, true, summary);
  assert.equal(trace.input, '<redacted-input>');
  assert.equal(trace.command, '<redacted-command>');
  assert.deepEqual(summary.redactedFields, ['input', 'command']);
});

test('promote script copies valid strict sample and artifacts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-promote-sample-'));
  const sourceDir = path.join(root, 'source');
  const sampleDir = path.join(root, 'sample');
  const sourceTrace = path.join(sourceDir, 'downstream.trace.json');
  const sourceArtifactDir = path.join(sourceDir, 'case-artifacts');
  const artifacts = [
    ['case-artifacts/stage-0.before.mlir', 'before'],
    ['case-artifacts/stage-0.after.mlir', 'after'],
    ['case-artifacts/stage-0-diag.txt', 'diag']
  ];
  try {
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(sourceArtifactDir, { recursive: true });
    for (const [file, content] of artifacts) {
      fs.writeFileSync(path.join(sourceDir, file), content, 'utf8');
    }

      const sourceTraceData = {
        schemaVersion: 1,
        collectorVersion: '0.1.0',
        tool: 'downstream-pass-lens-driver',
        input: 'input.mlir',
        provenance: {
          kind: 'live-pass-instrumentation',
          description: 'unit fixture'
        },
      command: 'downstream-driver',
      capture: {
        ir: 'artifact',
        metrics: true,
        timing: true
      },
      stages: [
        {
          index: 0,
          pass: 'canonicalize',
          status: 'changed',
          changed: true,
          durationMs: 1.23,
          verifier: 'ok',
          metricsBefore: { ops: 2 },
          metricsAfter: { ops: 3 },
          artifacts: {
            beforePath: 'case-artifacts/stage-0.before.mlir',
            afterPath: 'case-artifacts/stage-0.after.mlir',
            diagnosticsPath: 'case-artifacts/stage-0-diag.txt'
          }
        }
      ]
    };

    fs.writeFileSync(sourceTrace, JSON.stringify(sourceTraceData, null, 2), 'utf8');

    const result = await script.main([
      '--source', sourceTrace,
      '--sample-dir', sampleDir,
      '--sample-name', 'iree-lower',
      '--redact-input',
      '--redact-command'
    ]);

    assert.equal(result, undefined);
    const exported = path.join(sampleDir, 'iree-lower.json');
    const exportedSummary = path.join(sampleDir, 'iree-lower.downstream-promote-summary.json');

    const trace = JSON.parse(fs.readFileSync(exported, 'utf8'));
    const summary = JSON.parse(fs.readFileSync(exportedSummary, 'utf8'));

    assert.equal(summary.sampleTraceName, 'iree-lower');
    assert.equal(trace.input, '<redacted-input>');
    assert.equal(trace.command, '<redacted-command>');
    assert.equal(trace.stages[0].artifacts.beforePath, 'case-artifacts/stage-0.before.mlir');
    assert.ok(summary.copiedArtifactCount >= 3);

    assert.ok(fs.existsSync(path.join(sampleDir, 'case-artifacts/stage-0.before.mlir')));
    assert.ok(fs.existsSync(path.join(sampleDir, 'case-artifacts/stage-0.after.mlir')));
    assert.ok(fs.existsSync(path.join(sampleDir, 'case-artifacts/stage-0-diag.txt')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

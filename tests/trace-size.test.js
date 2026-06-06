const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  evaluateTraceSize,
  formatBytes,
  renderTraceSizeMarkdown
} = require('../out/trace/size.js');

test('evaluateTraceSize counts inline IR diagnostics and stages', async () => {
  const summary = await evaluateTraceSize({
    schemaVersion: 1,
    diagnostics: 'root',
    stages: [
      {
        index: 0,
        pass: 'canonicalize',
        irBefore: 'before',
        irAfter: 'after',
        diagnostics: 'diag'
      },
      {
        index: 1,
        pass: 'cse',
        irBefore: '',
        irAfter: 'module {}'
      }
    ]
  });

  assert.equal(summary.stageCount, 2);
  assert.equal(summary.inlineIrBytes, Buffer.byteLength('beforeaftermodule {}', 'utf8'));
  assert.equal(summary.diagnosticsBytes, Buffer.byteLength('rootdiag', 'utf8'));
  assert.equal(summary.artifactBytes, 0);
  assert.equal(summary.artifactCount, 0);
  assert.equal(summary.largestInlineStage.stageIndex, 0);
  assert.deepEqual(summary.warnings, []);
});

test('evaluateTraceSize stats relative artifacts and reports missing artifacts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-size-'));
  const artifactDir = path.join(root, 'artifacts');
  await fs.mkdir(artifactDir);
  await fs.writeFile(path.join(artifactDir, 'before.mlir'), 'before artifact', 'utf8');
  await fs.writeFile(path.join(artifactDir, 'after.mlir'), 'after artifact payload', 'utf8');

  const summary = await evaluateTraceSize({
    schemaVersion: 1,
    capture: { ir: 'artifact' },
    stages: [
      {
        index: 3,
        pass: 'lower',
        artifacts: {
          beforePath: 'artifacts/before.mlir',
          afterPath: 'artifacts/after.mlir',
          diagnosticsPath: 'artifacts/missing.txt'
        }
      }
    ]
  }, path.join(root, 'trace.json'));

  assert.equal(summary.artifactCount, 2);
  assert.equal(summary.artifactBytes, Buffer.byteLength('before artifactafter artifact payload', 'utf8'));
  assert.equal(summary.missingArtifactCount, 1);
  assert.equal(summary.largestArtifact.stageIndex, 3);
  assert.equal(summary.largestArtifact.kind, 'after');
  assert.ok(summary.warnings.some((entry) => entry.id === 'missing-artifact-size-data'));
});

test('evaluateTraceSize does not double-count hydrated artifact IR as inline payload', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-size-'));
  await fs.writeFile(path.join(root, 'before.mlir'), 'before artifact', 'utf8');
  await fs.writeFile(path.join(root, 'after.mlir'), 'after artifact', 'utf8');

  const summary = await evaluateTraceSize({
    schemaVersion: 1,
    capture: { ir: 'artifact' },
    stages: [
      {
        index: 0,
        pass: 'hydrated',
        irBefore: 'before artifact',
        irAfter: 'after artifact',
        artifacts: {
          beforePath: 'before.mlir',
          afterPath: 'after.mlir'
        }
      }
    ]
  }, path.join(root, 'trace.json'));

  assert.equal(summary.inlineIrBytes, 0);
  assert.equal(summary.artifactBytes, Buffer.byteLength('before artifactafter artifact', 'utf8'));
  assert.equal(summary.totalKnownBytes, summary.artifactBytes);
  assert.deepEqual(summary.warnings, []);
});

test('evaluateTraceSize treats escaping artifact paths as missing size data', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-size-contained-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'pass-lens-size-outside-'));
  await fs.writeFile(path.join(outside, 'before.mlir'), 'outside artifact', 'utf8');

  const summary = await evaluateTraceSize({
    schemaVersion: 1,
    capture: { ir: 'artifact' },
    stages: [
      {
        index: 0,
        pass: 'escape',
        artifacts: {
          beforePath: path.relative(root, path.join(outside, 'before.mlir'))
        }
      }
    ]
  }, path.join(root, 'trace.json'));

  assert.equal(summary.artifactCount, 0);
  assert.equal(summary.missingArtifactCount, 1);
  assert.ok(summary.warnings.some((entry) => entry.id === 'missing-artifact-size-data'));
});

test('evaluateTraceSize warns and suggests artifact capture for large inline IR', async () => {
  const largeIr = 'x'.repeat(700 * 1024);
  const summary = await evaluateTraceSize({
    schemaVersion: 1,
    capture: { ir: 'inline' },
    stages: [
      {
        index: 7,
        pass: 'large-inline',
        irBefore: largeIr,
        irAfter: largeIr
      }
    ]
  });
  const ids = summary.warnings.map((entry) => entry.id);

  assert.ok(ids.includes('large-inline-ir'));
  assert.ok(ids.includes('large-inline-stage'));
  assert.ok(summary.warnings.some((entry) => /--pass-lens-artifact-dir/.test(entry.quickFix)));
});

test('renderTraceSizeMarkdown renders size accounting fields', async () => {
  const summary = await evaluateTraceSize({
    schemaVersion: 1,
    stages: [
      {
        index: 0,
        pass: 'canonicalize',
        irBefore: 'a',
        irAfter: 'bb'
      }
    ]
  });
  const markdown = renderTraceSizeMarkdown(summary);

  assert.match(markdown, /# Pass Lens Trace Size Report/);
  assert.match(markdown, /Stages: 1/);
  assert.match(markdown, /Inline IR: 3 B/);
  assert.match(markdown, /Total known payload: 3 B/);
  assert.match(markdown, /Warnings And Quick Fixes/);
  assert.match(markdown, /No trace size warnings recorded/);
});

test('formatBytes uses binary units', () => {
  assert.equal(formatBytes(17), '17 B');
  assert.equal(formatBytes(2048), '2.0 KiB');
  assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MiB');
});

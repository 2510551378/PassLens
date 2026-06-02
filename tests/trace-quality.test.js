const assert = require('node:assert/strict');
const test = require('node:test');

const {
  evaluateTraceQuality,
  renderTraceQualityMarkdown
} = require('../out/trace/quality.js');

test('evaluateTraceQuality accepts a fully attributed structured trace', () => {
  const report = evaluateTraceQuality({
    schemaVersion: 1,
    tool: 'pass-lens-mlir-opt',
    collectorVersion: '0.1.0',
    capture: {
      ir: 'artifact',
      timing: true
    },
    stages: [
      {
        index: 0,
        pass: 'canonicalize',
        status: 'ok',
        verifier: 'ok',
        durationMs: 1.5,
        artifacts: {
          beforePath: 'artifacts/000-before.mlir',
          afterPath: 'artifacts/000-after.mlir'
        }
      }
    ]
  });

  assert.equal(report.score, 100);
  assert.equal(report.summary, 'no collector quality issues');
  assert.deepEqual(report.checks, []);
});

test('evaluateTraceQuality reports missing identity timing verifier and artifacts', () => {
  const largeIr = 'x'.repeat(600 * 1024);
  const report = evaluateTraceQuality({
    schemaVersion: 1,
    capture: {
      ir: 'artifact'
    },
    stages: [
      {
        index: 1,
        pass: 'pass-1',
        changed: true,
        irBefore: largeIr,
        irAfter: largeIr
      }
    ]
  });
  const ids = report.checks.map((entry) => entry.id);

  assert.ok(ids.includes('missing-tool'));
  assert.ok(ids.includes('missing-collector-version'));
  assert.ok(ids.includes('missing-pass-identity'));
  assert.ok(ids.includes('missing-timing'));
  assert.ok(ids.includes('missing-verifier-status'));
  assert.ok(ids.includes('missing-artifacts-for-large-ir'));
  assert.ok(ids.includes('stage-index-position-drift'));
  assert.ok(report.score < 100);
});

test('evaluateTraceQuality reports duplicate and non-monotonic stage indexes', () => {
  const report = evaluateTraceQuality({
    schemaVersion: 1,
    tool: 'pass-lens-mlir-opt',
    collectorVersion: '0.1.0',
    stages: [
      {
        index: 2,
        pass: 'late',
        status: 'ok',
        durationMs: 1
      },
      {
        index: 2,
        pass: 'duplicate',
        status: 'ok',
        durationMs: 1
      },
      {
        index: 1,
        pass: 'earlier',
        status: 'ok',
        durationMs: 1
      }
    ]
  });
  const ids = report.checks.map((entry) => entry.id);

  assert.ok(ids.includes('duplicate-stage-index'));
  assert.ok(ids.includes('non-monotonic-stage-index'));
});

test('renderTraceQualityMarkdown renders score and checks', () => {
  const report = evaluateTraceQuality({
    schemaVersion: 1,
    stages: [
      {
        index: 0,
        pass: 'pass-0'
      }
    ]
  });
  const markdown = renderTraceQualityMarkdown(report);

  assert.match(markdown, /# Pass Lens Trace Quality Report/);
  assert.match(markdown, /Score:/);
  assert.match(markdown, /missing-pass-identity/);
});

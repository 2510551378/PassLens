const assert = require('node:assert/strict');
const test = require('node:test');

const {
  firstSignalIndex,
  initialSelectedIndex,
  normalizeTrace
} = require('../out/trace/schema.js');

test('normalizeTrace fills defaults and preserves extension metadata', () => {
  const trace = normalizeTrace({
    collectorVersion: '0.1.0',
    compiler: {
      name: 'mlir-opt',
      version: '21.0.0',
      gitSha: 'abc123'
    },
    target: {
      backend: 'ascendc',
      platform: 'ascend-910b2'
    },
    provenance: {
      kind: 'live-pass-instrumentation',
      description: 'Collected from a real structured collector run.',
      source: 'collectors/mlir-pass-lens',
      generatedBy: 'pass-lens-mlir-opt',
      capturedAt: '2026-06-04'
    },
    capture: {
      ir: 'omitted',
      metrics: true,
      timing: true
    },
    metricProfiles: {
      ascendc: {
        critical: ['fallback.count'],
        budgets: {
          'ub.live.slots.max': 4
        }
      }
    },
    inputHash: 'sha256:deadbeef',
    stages: []
  });

  assert.equal(trace.schemaVersion, 1);
  assert.equal(trace.collectorVersion, '0.1.0');
  assert.deepEqual(trace.compiler, {
    name: 'mlir-opt',
    version: '21.0.0',
    gitSha: 'abc123'
  });
  assert.deepEqual(trace.target, {
    backend: 'ascendc',
    platform: 'ascend-910b2'
  });
  assert.deepEqual(trace.provenance, {
    kind: 'live-pass-instrumentation',
    description: 'Collected from a real structured collector run.',
    source: 'collectors/mlir-pass-lens',
    generatedBy: 'pass-lens-mlir-opt',
    capturedAt: '2026-06-04'
  });
  assert.deepEqual(trace.capture, {
    ir: 'omitted',
    metrics: true,
    timing: true
  });
  assert.deepEqual(trace.metricProfiles, {
    ascendc: {
      critical: ['fallback.count'],
      budgets: {
        'ub.live.slots.max': 4
      }
    }
  });
  assert.equal(trace.inputHash, 'sha256:deadbeef');
});

test('normalizeTrace infers changed and status from IR snapshots', () => {
  const trace = normalizeTrace({
    stages: [
      {
        pass: 'canonicalize',
        irBefore: 'module { %0 = arith.constant 0 : i32 }',
        irAfter: 'module { %0 = arith.constant 1 : i32 }'
      }
    ]
  });

  assert.equal(trace.stages[0].changed, true);
  assert.equal(trace.stages[0].status, 'changed');
});

test('normalizeTrace ignores non-numeric metrics', () => {
  const trace = normalizeTrace({
    stages: [
      {
        pass: 'cse',
        metricsBefore: {
          ops: 10,
          note: 'not numeric',
          bad: Number.NaN
        },
        metricsAfter: {
          ops: 9,
          valid: 1
        }
      }
    ]
  });

  assert.deepEqual(trace.stages[0].metricsBefore, { ops: 10 });
  assert.deepEqual(trace.stages[0].metricsAfter, { ops: 9, valid: 1 });
});

test('firstSignalIndex prefers verifier failure over earlier IR changes', () => {
  const trace = normalizeTrace({
    stages: [
      {
        pass: 'canonicalize',
        changed: true
      },
      {
        pass: 'convert-func-to-llvm',
        changed: true,
        verifier: 'failed'
      }
    ]
  });

  assert.equal(firstSignalIndex(trace), 1);
  assert.equal(initialSelectedIndex(trace), 1);
});

test('normalizeTrace preserves stage artifact references', () => {
  const trace = normalizeTrace({
    stages: [
      {
        pass: 'lower',
        argument: 'convert-scf-to-cf',
        opName: 'builtin.module',
        symbol: '@kernel',
        nestingDepth: 1,
        status: 'ok',
        artifacts: {
          beforePath: 'artifacts/0-before.mlir',
          afterPath: 'artifacts/0-after.mlir'
        }
      }
    ]
  });

  assert.equal(trace.stages[0].argument, 'convert-scf-to-cf');
  assert.equal(trace.stages[0].opName, 'builtin.module');
  assert.equal(trace.stages[0].symbol, '@kernel');
  assert.equal(trace.stages[0].nestingDepth, 1);
  assert.deepEqual(trace.stages[0].artifacts, {
    beforePath: 'artifacts/0-before.mlir',
    afterPath: 'artifacts/0-after.mlir'
  });
});

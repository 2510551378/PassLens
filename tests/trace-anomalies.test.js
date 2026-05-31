const assert = require('node:assert/strict');
const test = require('node:test');

const {
  computeStageAnomalies,
  computeTraceAnomalies
} = require('../out/trace/anomalies.js');

test('computeStageAnomalies detects zero-to-positive metric jumps', () => {
  const anomalies = computeStageAnomalies({
    index: 4,
    pass: 'convert-to-ac',
    changed: true,
    metricsBefore: {
      'ac.queue.create': 0
    },
    metricsAfter: {
      'ac.queue.create': 5
    }
  });

  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].severity, 'warning');
  assert.equal(anomalies[0].stageIndex, 4);
  assert.equal(anomalies[0].metric, 'ac.queue.create');
});

test('computeStageAnomalies detects large relative changes', () => {
  const anomalies = computeStageAnomalies({
    index: 1,
    pass: 'canonicalize',
    changed: true,
    metricsBefore: {
      ops: 10
    },
    metricsAfter: {
      ops: 25
    }
  });

  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].delta, 15);
  assert.equal(anomalies[0].ratio, 2.5);
});

test('computeStageAnomalies ignores small metric changes', () => {
  const anomalies = computeStageAnomalies({
    index: 2,
    pass: 'cse',
    changed: true,
    metricsBefore: {
      ops: 100
    },
    metricsAfter: {
      ops: 101
    }
  });

  assert.deepEqual(anomalies, []);
});

test('computeTraceAnomalies sorts warnings before info', () => {
  const anomalies = computeTraceAnomalies({
    schemaVersion: 1,
    stages: [
      {
        index: 0,
        pass: 'minor-fold',
        changed: true,
        metricsBefore: { ops: 1000 },
        metricsAfter: { ops: 990 }
      },
      {
        index: 1,
        pass: 'explode',
        changed: true,
        metricsBefore: { ops: 2 },
        metricsAfter: { ops: 8 }
      }
    ]
  });

  assert.equal(anomalies.length, 2);
  assert.equal(anomalies[0].severity, 'warning');
  assert.equal(anomalies[0].stageIndex, 1);
  assert.equal(anomalies[1].severity, 'info');
});

test('computeTraceAnomalies applies built-in AscendC budget profile', () => {
  const anomalies = computeTraceAnomalies({
    schemaVersion: 1,
    target: {
      backend: 'ascendc'
    },
    stages: [
      {
        index: 7,
        pass: 'plan-scratch-queue',
        changed: true,
        metricsBefore: {
          'ub.live.slots.max': 3
        },
        metricsAfter: {
          'ub.live.slots.max': 5
        }
      }
    ]
  });

  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].kind, 'budget');
  assert.equal(anomalies[0].budget, 4);
  assert.match(anomalies[0].message, /exceeding budget 4/);
});

test('computeTraceAnomalies applies custom metric profile overrides', () => {
  const anomalies = computeTraceAnomalies({
    schemaVersion: 1,
    target: {
      backend: 'ascendc'
    },
    metricProfiles: {
      ascendc: {
        budgets: {
          'ub.live.slots.max': 8
        },
        critical: [
          'ac.local.alloc'
        ]
      }
    },
    stages: [
      {
        index: 8,
        pass: 'lower-to-ac',
        changed: true,
        metricsBefore: {
          'ub.live.slots.max': 3,
          'ac.local.alloc': 0
        },
        metricsAfter: {
          'ub.live.slots.max': 5,
          'ac.local.alloc': 1
        }
      }
    ]
  });

  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].kind, 'critical');
  assert.equal(anomalies[0].metric, 'ac.local.alloc');
});

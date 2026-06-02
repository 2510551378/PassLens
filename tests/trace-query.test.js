const assert = require('node:assert/strict');
const test = require('node:test');

const {
  renderTraceQueryResultMarkdown,
  runTraceQuery
} = require('../out/traceQuery.js');

function makeTrace() {
  return {
    schemaVersion: 1,
    stages: [
      {
        index: 0,
        pass: 'canonicalize',
        argument: 'canonicalize',
        changed: false,
        status: 'ok',
        durationMs: 2,
        metricsBefore: {
          ops: 10,
          'fallback.count': 0
        },
        metricsAfter: {
          ops: 10,
          'fallback.count': 0
        }
      },
      {
        index: 1,
        pass: 'convert-to-ac',
        argument: 'convert-to-ac',
        opName: 'func.func',
        changed: true,
        status: 'changed',
        durationMs: 7,
        diagnostics: 'introduced fallback lowering path',
        metricsBefore: {
          ops: 10,
          'fallback.count': 0,
          ubBytes: 128
        },
        metricsAfter: {
          ops: 18,
          'fallback.count': 2,
          ubBytes: 384
        },
        irAfter: 'module { ac.fallback }'
      },
      {
        index: 2,
        pass: 'verify-ac',
        changed: false,
        status: 'verifier_failed',
        verifier: 'failed',
        durationMs: 5,
        metricsBefore: {
          ubBytes: 384
        },
        metricsAfter: {
          ubBytes: 512
        }
      }
    ]
  };
}

test('trace query finds first failure and first changed stages', () => {
  const trace = makeTrace();

  const firstFailure = runTraceQuery(trace, { kind: 'firstFailure' });
  assert.equal(firstFailure.matches[0].stageIndex, 2);
  assert.match(firstFailure.summary, /#2/);
  assert.ok(firstFailure.matches[0].evidenceIds.includes('stages[2].verifier'));

  const firstChanged = runTraceQuery(trace, { kind: 'firstChanged' });
  assert.equal(firstChanged.matches[0].stageIndex, 1);
  assert.match(firstChanged.matches[0].reason, /changed=true/);
});

test('trace query finds metric jumps and budget overflow with evidence IDs', () => {
  const trace = makeTrace();

  const jump = runTraceQuery(trace, {
    kind: 'firstMetricJump',
    metric: 'fallback.count'
  });
  assert.equal(jump.matches[0].stageIndex, 1);
  assert.equal(jump.matches[0].before, 0);
  assert.equal(jump.matches[0].after, 2);
  assert.deepEqual(jump.matches[0].evidenceIds, [
    'stages[1].metricsBefore["fallback.count"]',
    'stages[1].metricsAfter["fallback.count"]'
  ]);

  const budget = runTraceQuery(trace, {
    kind: 'metricBudget',
    metric: 'ubBytes',
    budget: 256
  });
  assert.deepEqual(budget.matches.map((match) => match.stageIndex), [1, 2]);
  assert.match(budget.summary, /2 stage/);
});

test('trace query lists slowest passes and searches trace text', () => {
  const trace = makeTrace();

  const slowest = runTraceQuery(trace, { kind: 'slowest', count: 2 });
  assert.deepEqual(slowest.matches.map((match) => match.stageIndex), [1, 2]);
  assert.equal(slowest.matches[0].durationMs, 7);

  const search = runTraceQuery(trace, { kind: 'search', text: 'fallback' });
  assert.equal(search.matches[0].stageIndex, 1);
  assert.ok(search.matches[0].evidenceIds.includes('stages[1].diagnostics'));
  assert.ok(search.matches[0].snippets.some((snippet) => snippet.includes('fallback')));
});

test('trace query result renders as issue-ready markdown fragment', () => {
  const result = runTraceQuery(makeTrace(), {
    kind: 'firstMetricJump',
    metric: 'fallback.count'
  });
  const markdown = renderTraceQueryResultMarkdown(result);

  assert.match(markdown, /# Pass Lens Query: First Metric Jump/);
  assert.match(markdown, /stages\[1\]\.metricsAfter\["fallback\.count"\]/);
});

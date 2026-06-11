const assert = require('node:assert/strict');
const test = require('node:test');

const {
  planTraceQueryFromText,
  traceQueryToToolCall
} = require('../out/traceQueryPlanner.js');
const { PASS_LENS_TOOL_IDS } = require('../out/passLensTools.js');

function makeTrace() {
  return {
    schemaVersion: 1,
    stages: [
      {
        index: 0,
        pass: 'canonicalize',
        metricsBefore: {
          ops: 10,
          'fallback.count': 0,
          ubBytes: 128
        },
        metricsAfter: {
          ops: 10,
          'fallback.count': 0,
          ubBytes: 128
        }
      },
      {
        index: 1,
        pass: 'convert-generic',
        changed: true,
        metricsBefore: {
          ops: 10,
          'fallback.count': 0,
          ubBytes: 128
        },
        metricsAfter: {
          ops: 18,
          'fallback.count': 2,
          ubBytes: 384
        }
      }
    ]
  };
}

test('natural-language planner maps failure requests to firstFailure', () => {
  const english = planTraceQueryFromText('Where does the first verifier failure happen?', makeTrace());
  assert.equal(english.status, 'planned');
  assert.deepEqual(english.query, { kind: 'firstFailure' });
  assert.equal(english.toolId, PASS_LENS_TOOL_IDS.query.firstFailure);
  assert.deepEqual(english.arguments, {});

  const chinese = planTraceQueryFromText('帮我找第一个失败的 pass', makeTrace());
  assert.equal(chinese.status, 'planned');
  assert.deepEqual(chinese.query, { kind: 'firstFailure' });
});

test('natural-language planner maps metric jump and budget requests', () => {
  const jump = planTraceQueryFromText('where does fallback.count jump first?', makeTrace());
  assert.equal(jump.status, 'planned');
  assert.deepEqual(jump.query, {
    kind: 'firstMetricJump',
    metric: 'fallback.count'
  });
  assert.equal(jump.toolId, PASS_LENS_TOOL_IDS.query.firstMetricJump);
  assert.deepEqual(jump.arguments, {
    metric: 'fallback.count'
  });

  const budget = planTraceQueryFromText('which pass has ubBytes > 256?', makeTrace());
  assert.equal(budget.status, 'planned');
  assert.deepEqual(budget.query, {
    kind: 'metricBudget',
    metric: 'ubBytes',
    budget: 256
  });
  assert.deepEqual(budget.arguments, {
    metric: 'ubBytes',
    budget: 256
  });
});

test('natural-language planner maps slowest and explicit search requests', () => {
  const slowest = planTraceQueryFromText('show top 2 slowest passes', makeTrace());
  assert.equal(slowest.status, 'planned');
  assert.deepEqual(slowest.query, {
    kind: 'slowest',
    count: 2
  });

  const search = planTraceQueryFromText('search fallback lowering path', makeTrace());
  assert.equal(search.status, 'planned');
  assert.deepEqual(search.query, {
    kind: 'search',
    text: 'fallback lowering path'
  });
});

test('natural-language planner refuses unclear metric requests', () => {
  const ambiguous = planTraceQueryFromText('find the metric jump');
  assert.equal(ambiguous.status, 'unsupported');
  assert.equal(ambiguous.query, undefined);
  assert.equal(ambiguous.toolId, undefined);

  const multiIntent = planTraceQueryFromText('find first change and first failure', makeTrace());
  assert.equal(multiIntent.status, 'ambiguous');
  assert.ok(multiIntent.candidates.length >= 2);
});

test('traceQueryToToolCall returns deterministic tool arguments', () => {
  assert.deepEqual(traceQueryToToolCall({
    kind: 'metricBudget',
    metric: 'ubBytes',
    budget: 256
  }), {
    toolId: PASS_LENS_TOOL_IDS.query.metricBudget,
    arguments: {
      metric: 'ubBytes',
      budget: 256
    }
  });
});

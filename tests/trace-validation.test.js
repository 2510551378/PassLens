const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeTrace } = require('../out/trace/schema.js');
const { summarizeTraceIssues, validateTrace } = require('../out/trace/validation.js');

test('validateTrace reports empty traces as errors', () => {
  const trace = normalizeTrace({ stages: [] });
  const issues = validateTrace(trace);

  assert.equal(issues[0].severity, 'error');
  assert.match(issues[0].message, /no stages/i);
});

test('validateTrace reports unknown statuses and duplicate indexes', () => {
  const trace = normalizeTrace({
    stages: [
      { index: 0, pass: 'a', status: 'ok' },
      { index: 0, pass: 'b', status: 'mystery' }
    ]
  });
  const issues = validateTrace(trace);

  assert.ok(issues.some((entry) => entry.message.includes('Duplicate stage index')));
  assert.ok(issues.some((entry) => entry.message.includes('not a known Pass Lens status')));
});

test('validateTrace warns about large inline IR snapshots', () => {
  const largeIr = 'x'.repeat(600 * 1024);
  const trace = normalizeTrace({
    stages: [
      {
        pass: 'large',
        irBefore: largeIr,
        irAfter: largeIr
      }
    ]
  });
  const issues = validateTrace(trace);

  assert.ok(issues.some((entry) => entry.message.includes('Prefer artifacts.beforePath/afterPath')));
});

test('summarizeTraceIssues creates compact counts', () => {
  const summary = summarizeTraceIssues([
    { severity: 'error', message: 'bad' },
    { severity: 'warning', message: 'warn' },
    { severity: 'warning', message: 'warn 2' },
    { severity: 'info', message: 'note' }
  ]);

  assert.equal(summary, '1 error, 2 warnings, 1 info');
});

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const {
  assertTraceStrict,
  validateTraceStrict
} = require('../out/trace/strictValidation.js');

test('validateTraceStrict accepts a minimal schema-v1 trace', () => {
  const issues = validateTraceStrict({
    schemaVersion: 1,
    stages: [
      {
        index: 0,
        pass: 'canonicalize'
      }
    ]
  });

  assert.deepEqual(issues, []);
});

test('validateTraceStrict rejects malformed collector output', () => {
  const issues = validateTraceStrict({
    schemaVersion: 2,
    collectorVersion: 1,
    capture: {
      ir: 'sidecar'
    },
    stages: [
      {
        index: '0',
        pass: '',
        status: 'mystery',
        durationMs: -1,
        metricsBefore: {
          ops: 'many'
        },
        artifacts: {
          beforePath: 42,
          extra: true
        },
        extraStageField: true
      }
    ],
    extraRootField: true
  });

  assert.ok(issues.some((entry) => entry.field === '$.schemaVersion'));
  assert.ok(issues.some((entry) => entry.field === '$.collectorVersion'));
  assert.ok(issues.some((entry) => entry.field === '$.capture.ir'));
  assert.ok(issues.some((entry) => entry.field === '$.stages[0].index'));
  assert.ok(issues.some((entry) => entry.field === '$.stages[0].pass'));
  assert.ok(issues.some((entry) => entry.field === '$.stages[0].status'));
  assert.ok(issues.some((entry) => entry.field === '$.stages[0].durationMs'));
  assert.ok(issues.some((entry) => entry.field === '$.stages[0].metricsBefore.ops'));
  assert.ok(issues.some((entry) => entry.field === '$.stages[0].artifacts.beforePath'));
  assert.ok(issues.some((entry) => entry.field === '$.stages[0].artifacts.extra'));
  assert.ok(issues.some((entry) => entry.field === '$.stages[0].extraStageField'));
  assert.ok(issues.some((entry) => entry.field === '$.extraRootField'));
});

test('assertTraceStrict throws a collector-facing error summary', () => {
  assert.throws(
    () => assertTraceStrict({ stages: [] }),
    /schemaVersion/
  );
});

test('pass-lens JSON Schema document is valid JSON and declares v1', async () => {
  const schemaPath = path.join(process.cwd(), 'docs', 'pass-lens.schema.json');
  const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));

  assert.equal(schema.title, 'Pass Lens Trace Schema v1');
  assert.deepEqual(schema.required, ['schemaVersion', 'stages']);
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.deepEqual(schema.$defs.stage.required, ['index', 'pass']);
});

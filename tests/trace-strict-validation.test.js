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
    provenance: {
      kind: 'live-pass-instrumentation',
      description: 'Collected from a real structured collector run.'
    },
    stages: [
      {
        index: 0,
        pass: 'canonicalize'
      }
    ]
  });

  assert.deepEqual(issues, []);
});

test('validateTraceStrict allows optional trace extensions', () => {
  const issues = validateTraceStrict({
    schemaVersion: 1,
    provenance: {
      kind: 'live-pass-instrumentation',
      description: 'trace extension smoke test'
    },
    extensions: {
      llvmRemarks: {
        remarks: []
      }
    },
    stages: [
      {
        index: 0,
        pass: 'canonicalize',
        extensions: {
          llvm: {
            stageRemark: 'ok'
          }
        }
      }
    ]
  });

  assert.deepEqual(issues, []);
});

test('validateTraceStrict rejects non-object trace extensions', () => {
  const issues = validateTraceStrict({
    schemaVersion: 1,
    provenance: {
      kind: 'live-pass-instrumentation',
      description: 'bad trace extension'
    },
    extensions: ['invalid'],
    stages: [
      {
        index: 0,
        pass: 'canonicalize',
        extensions: 12
      }
    ]
  });

  const traceExtensionIssue = issues.find((issue) => issue.field === '$.extensions');
  const stageExtensionIssue = issues.find((issue) => issue.field === '$.stages[0].extensions');

  assert.ok(traceExtensionIssue);
  assert.ok(stageExtensionIssue);
});

test('validateTraceStrict rejects malformed collector output', () => {
  const issues = validateTraceStrict({
    schemaVersion: 2,
    collectorVersion: 1,
    provenance: {
      kind: 'imagined',
      description: 42,
      extra: true
    },
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
  assert.ok(issues.some((entry) => entry.field === '$.provenance.kind'));
  assert.ok(issues.some((entry) => entry.field === '$.provenance.description'));
  assert.ok(issues.some((entry) => entry.field === '$.provenance.extra'));
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

test('schema examples are strict-valid public collector contracts', async () => {
  const examplesDir = path.join(process.cwd(), 'docs', 'schema-examples');
  const files = (await fs.readdir(examplesDir))
    .filter((entry) => entry.endsWith('.json'))
    .sort();

  assert.deepEqual(files, [
    'hardware-backend-metrics.json',
    'llvm-new-pass-manager.json',
    'llvm-optimization-remarks.json',
    'mlir-structured.json'
  ]);

  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(path.join(examplesDir, file), 'utf8'));
    const issues = validateTraceStrict(raw);
    assert.deepEqual(issues, [], `${file} should pass strict schema validation`);
  }
});

test('schema examples documentation references existing files', async () => {
  const docsDir = path.join(process.cwd(), 'docs');
  const markdown = await fs.readFile(path.join(docsDir, 'schema-examples.md'), 'utf8');
  const links = Array.from(markdown.matchAll(/\]\((schema-examples\/[^)]+\.json)\)/g))
    .map((match) => match[1]);

  assert.equal(links.length, 4);
  for (const link of links) {
    await fs.access(path.join(docsDir, link));
  }
});

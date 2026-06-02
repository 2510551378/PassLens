const assert = require('node:assert/strict');
const test = require('node:test');

const { createRegressionTestSketch } = require('../out/regressionTestSketch.js');

test('createRegressionTestSketch renders a conservative MLIR FileCheck sketch', () => {
  const sketch = createRegressionTestSketch(
    {
      schemaVersion: 1,
      tool: 'pass-lens-mlir-opt',
      input: 'kernel.mlir',
      pipeline: 'builtin.module(func.func(convert-to-ac,verify-ac))',
      command: 'pass-lens-mlir-opt kernel.mlir --pass-pipeline=...',
      stages: [
        {
          index: 1,
          pass: 'convert-to-ac',
          changed: true,
          status: 'changed',
          irBefore: 'module { func.func @main() { return } }',
          irAfter: 'module { ac.launch @main }',
          metricsBefore: {
            'fallback.count': 0
          },
          metricsAfter: {
            'fallback.count': 2
          }
        },
        {
          index: 2,
          pass: 'verify-ac',
          changed: false,
          status: 'verifier_failed',
          verifier: 'failed',
          diagnostics: 'verifier rejected illegal ac.launch attributes'
        }
      ]
    },
    [
      {
        severity: 'warning',
        stageIndex: 2,
        field: 'diagnostics',
        message: 'verifier diagnostics are present'
      }
    ],
    [
      {
        severity: 'warning',
        stageIndex: 1,
        pass: 'convert-to-ac',
        metric: 'fallback.count',
        before: 0,
        after: 2,
        delta: 2,
        message: 'fallback.count increased from zero to 2.'
      }
    ],
    {
      sourcePath: 'C:\\tmp\\trace.json',
      selectedStageIndex: 2
    }
  );

  assert.match(sketch, /# Pass Lens Regression Test Sketch/);
  assert.match(sketch, /\/\/ RUN: pass-lens-mlir-opt %s "--pass-pipeline=builtin\.module/);
  assert.match(sketch, /\/\/ CHECK: verifier rejected illegal ac\.launch attributes/);
  assert.match(sketch, /Stage #2 verify-ac/);
  assert.match(sketch, /Do not edit compiler source from this sketch alone/);
});

test('createRegressionTestSketch falls back to TODO input when no IR is embedded', () => {
  const sketch = createRegressionTestSketch({
    schemaVersion: 1,
    pipeline: 'builtin.module(canonicalize)',
    stages: [
      {
        index: 0,
        pass: 'canonicalize',
        changed: false
      }
    ]
  }, [], []);

  assert.match(sketch, /TODO: paste the minimized input/);
  assert.match(sketch, /CHECK-LABEL: module/);
});

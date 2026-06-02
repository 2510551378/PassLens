const assert = require('node:assert/strict');
const test = require('node:test');

const { createTraceExplanation } = require('../out/traceExplanation.js');

test('createTraceExplanation explains failed selected pass with grounded evidence', () => {
  const explanation = createTraceExplanation(
    {
      schemaVersion: 1,
      tool: 'pass-lens-mlir-opt',
      pipeline: 'builtin.module(func.func(canonicalize,convert-to-ac))',
      command: 'pass-lens-mlir-opt input.mlir --pass-pipeline=...',
      capture: {
        ir: 'artifact'
      },
      stages: [
        {
          index: 0,
          pass: 'canonicalize',
          changed: true,
          status: 'changed'
        },
        {
          index: 1,
          pass: 'convert-to-ac',
          argument: 'convert-to-ac',
          opName: 'func.func',
          changed: true,
          status: 'verifier_failed',
          verifier: 'failed',
          metricsBefore: {
            'fallback.count': 0,
            ops: 12
          },
          metricsAfter: {
            'fallback.count': 3,
            ops: 22
          },
          diagnostics: 'expected legal ac.launch attributes',
          artifacts: {
            beforePath: 'artifacts/stage-000001.before.mlir',
            afterPath: 'artifacts/stage-000001.after.mlir'
          }
        }
      ]
    },
    [],
    [
      {
        severity: 'warning',
        stageIndex: 1,
        pass: 'convert-to-ac',
        metric: 'fallback.count',
        before: 0,
        after: 3,
        delta: 3,
        message: 'fallback.count increased from zero to 3.'
      }
    ],
    {
      selectedStageIndex: 1
    }
  );

  assert.match(explanation, /# Pass Lens Suspicious Pass Explanation/);
  assert.match(explanation, /root-cause candidate/);
  assert.match(explanation, /Metric `fallback\.count` changed from 0 to 3 \(\+3\)/);
  assert.match(explanation, /Artifacts referenced: before=artifacts\/stage-000001\.before\.mlir/);
  assert.match(explanation, /high: failure status\/verifier evidence/);
  assert.match(explanation, /Treat root-cause statements as candidates/);
});

test('createTraceExplanation labels unchanged selected pass as low confidence', () => {
  const explanation = createTraceExplanation(
    {
      schemaVersion: 1,
      stages: [
        {
          index: 0,
          pass: 'cse',
          changed: false,
          status: 'ok',
          verifier: 'ok'
        }
      ]
    },
    [],
    [],
    {
      selectedStageIndex: 0
    }
  );

  assert.match(explanation, /did not change the recorded IR/);
  assert.match(explanation, /low: the selected stage has no recorded IR change/);
});

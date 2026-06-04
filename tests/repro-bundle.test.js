const assert = require('node:assert/strict');
const test = require('node:test');

const { createReproBundle } = require('../out/reproBundle.js');

test('createReproBundle includes selected pass, anomaly, and command context', () => {
  const bundle = createReproBundle(
    {
      schemaVersion: 1,
      tool: 'pass-lens-mlir-opt',
      input: 'kernel.mlir',
      pipeline: 'builtin.module(convert-to-ac)',
      command: 'pass-lens-mlir-opt kernel.mlir --pass-lens-output trace.json',
      stages: [
        {
          index: 0,
          pass: 'canonicalize',
          changed: true,
          status: 'changed'
        },
        {
          index: 3,
          pass: 'convert-to-ac',
          changed: true,
          status: 'changed',
          verifier: 'ok',
          metricsBefore: {
            ops: 10
          },
          metricsAfter: {
            ops: 25
          },
          irBefore: 'module { func.func @kernel() }',
          irAfter: 'module { ac.launch @kernel }'
        }
      ]
    },
    [],
    [
      {
        severity: 'warning',
        stageIndex: 3,
        pass: 'convert-to-ac',
        metric: 'ops',
        before: 10,
        after: 25,
        delta: 15,
        ratio: 2.5,
        message: 'ops increased by +15 (150% relative to 10).'
      }
    ],
    {
      sourcePath: 'C:\\tmp\\trace.json',
      selectedStageIndex: 3
    }
  );

  assert.match(bundle, /# Pass Lens Repro Bundle/);
  assert.match(bundle, /- Pass: convert-to-ac/);
  assert.match(bundle, /\[warning\] #3 convert-to-ac: ops increased/);
  assert.match(bundle, /pass-lens-mlir-opt kernel\.mlir/);
  assert.match(bundle, /module \{ ac\.launch @kernel \}/);
  assert.match(bundle, /## Regression Test Sketch/);
  assert.match(bundle, /# Pass Lens Regression Test Sketch/);
});

test('createReproBundle truncates large inline trace JSON', () => {
  const bundle = createReproBundle(
    {
      schemaVersion: 1,
      diagnostics: 'x'.repeat(100),
      stages: [
        {
          index: 0,
          pass: 'big',
          changed: true,
          irBefore: 'a'.repeat(100),
          irAfter: 'b'.repeat(100)
        }
      ]
    },
    [],
    [],
    {
      maxInlineChars: 20
    }
  );

  assert.match(bundle, /Pass Lens truncated/);
});

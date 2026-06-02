const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createAgentContext,
  createAgentContextMarkdown
} = require('../out/agentContext.js');

function makeContext() {
  return createAgentContext(
    {
      schemaVersion: 1,
      tool: 'pass-lens-mlir-opt',
      collectorVersion: '0.1.0',
      input: 'kernel.mlir',
      pipeline: 'builtin.module(func.func(canonicalize,cse))',
      command: 'pass-lens-mlir-opt kernel.mlir --pass-pipeline=...',
      capture: {
        ir: 'artifact',
        metrics: true,
        timing: true
      },
      stages: [
        {
          index: 0,
          pass: 'canonicalize',
          argument: 'canonicalize',
          opName: 'func.func',
          changed: false,
          status: 'ok'
        },
        {
          index: 1,
          pass: 'cse',
          argument: 'cse',
          opName: 'func.func',
          changed: true,
          status: 'changed',
          verifier: 'ok',
          metricsBefore: {
            ops: 20,
            allocs: 0
          },
          metricsAfter: {
            ops: 12,
            allocs: 4
          },
          irBefore: 'before\n'.repeat(20),
          irAfter: 'after\n'.repeat(20),
          artifacts: {
            beforePath: 'artifacts/stage-000001.before.mlir',
            afterPath: 'artifacts/stage-000001.after.mlir'
          }
        },
        {
          index: 2,
          pass: 'lower-to-llvm',
          argument: 'convert-to-llvm',
          opName: 'builtin.module',
          changed: true,
          status: 'pass_failed',
          verifier: 'failed',
          irBefore: 'neighbor before should not be copied',
          irAfter: 'neighbor after should not be copied'
        }
      ]
    },
    [
      {
        severity: 'warning',
        stageIndex: 1,
        field: 'metricsAfter.allocs',
        message: 'allocs jumped'
      }
    ],
    [
      {
        severity: 'warning',
        stageIndex: 1,
        pass: 'cse',
        metric: 'allocs',
        before: 0,
        after: 4,
        delta: 4,
        message: 'allocs increased from zero to 4.'
      }
    ],
    {
      sourcePath: 'C:\\tmp\\kernel.pass-lens.json',
      selectedStageIndex: 1,
      maxIrChars: 16
    }
  );
}

test('createAgentContext captures selected stage evidence and bounded IR', () => {
  const context = makeContext();

  assert.equal(context.kind, 'pass-lens-agent-context');
  assert.equal(context.summary.stageCount, 3);
  assert.equal(context.summary.selectedStageIndex, 1);
  assert.equal(context.summary.firstFailureStageIndex, 2);
  assert.equal(context.selectedStage.pass, 'cse');
  assert.deepEqual(context.selectedStage.metricDeltas, [
    {
      metric: 'ops',
      before: 20,
      after: 12,
      delta: -8
    },
    {
      metric: 'allocs',
      before: 0,
      after: 4,
      delta: 4
    }
  ]);
  assert.equal(context.selectedStage.irBefore.truncated, true);
  assert.equal(context.selectedStage.irBefore.text.length, 16);
  assert.equal(context.neighborStages.length, 2);
  assert.equal(Object.hasOwn(context.neighborStages[1], 'irBefore'), false);
  assert.match(context.investigationQuestions.join('\n'), /artifact paths/);
});

test('agent context JSON schema declares the exported contract', () => {
  const schemaPath = path.resolve(__dirname, '..', 'docs', 'pass-lens-agent-context.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const context = makeContext();

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.equal(schema.properties.kind.const, 'pass-lens-agent-context');
  assert.deepEqual(schema.required, [
    'schemaVersion',
    'kind',
    'objective',
    'source',
    'summary',
    'neighborStages',
    'topAnomalies',
    'validationIssues',
    'investigationQuestions'
  ]);

  for (const key of Object.keys(context)) {
    assert.ok(schema.properties[key], `schema covers top-level field ${key}`);
  }
  for (const key of Object.keys(context.selectedStage)) {
    assert.ok(schema.$defs.stageContext.properties[key], `schema covers selected stage field ${key}`);
  }
  for (const key of Object.keys(context.neighborStages[0])) {
    assert.ok(schema.$defs.stageSummary.properties[key], `schema covers neighbor stage field ${key}`);
  }
});

test('createAgentContextMarkdown renders selected pass and questions', () => {
  const markdown = createAgentContextMarkdown(createAgentContext(
    {
      schemaVersion: 1,
      tool: 'pass-lens-mlir-opt',
      stages: [
        {
          index: 0,
          pass: 'convert-to-ac',
          changed: true,
          status: 'verifier_failed',
          verifier: 'failed',
          irBefore: 'module { func.func @kernel() }',
          irAfter: 'module { ac.launch @kernel }'
        }
      ]
    },
    [],
    []
  ));

  assert.match(markdown, /# Pass Lens Agent Context/);
  assert.match(markdown, /- Pass: convert-to-ac/);
  assert.match(markdown, /Which verifier invariant/);
  assert.match(markdown, /module \{ ac\.launch @kernel \}/);
});

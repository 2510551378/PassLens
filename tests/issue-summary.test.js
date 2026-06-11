const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createCandidateRootCauses,
  createCandidateRootCausesMarkdown,
  createGithubIssueDescription,
  createFirstFailureLocalizationMarkdown,
  createSuspiciousPassesMarkdown,
  explainFirstSignal,
  renderFirstSignalExplanation,
  summarizeTopSuspiciousPasses
} = require('../out/issueSummary.js');

function makeTrace() {
  return {
    schemaVersion: 1,
    tool: 'pass-lens-mlir-opt',
    input: 'kernel.mlir',
    pipeline: 'builtin.module(func.func(convert-to-ac,verify-ac))',
    command: 'pass-lens-mlir-opt kernel.mlir --pass-pipeline=...',
    exitCode: 1,
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
        changed: true,
        status: 'changed',
        diagnostics: 'introduced fallback path before legality check',
        metricsBefore: {
          'fallback.count': 0,
          ubBytes: 128
        },
        metricsAfter: {
          'fallback.count': 2,
          ubBytes: 512
        },
        irAfter: 'module { ac.fallback }'
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
  };
}

function makeIssues() {
  return [
    {
      severity: 'warning',
      stageIndex: 2,
      field: 'diagnostics',
      message: 'verifier diagnostics are present'
    }
  ];
}

function makeAnomalies() {
  return [
    {
      severity: 'warning',
      kind: 'budget',
      stageIndex: 1,
      pass: 'convert-to-ac',
      metric: 'ubBytes',
      before: 128,
      after: 512,
      delta: 384,
      budget: 256,
      message: 'ubBytes is 512, exceeding budget 256.'
    },
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
  ];
}

test('summarizeTopSuspiciousPasses ranks failed and anomalous stages with evidence IDs', () => {
  const summaries = summarizeTopSuspiciousPasses(makeTrace(), makeIssues(), makeAnomalies(), 3);

  assert.equal(summaries[0].stageIndex, 2);
  assert.match(summaries[0].reasons.join('\n'), /failed status/);
  assert.equal(summaries[1].stageIndex, 1);
  assert.match(summaries[1].reasons.join('\n'), /fallback\.count/);
  assert.ok(summaries[1].evidenceIds.includes('stages[1].metricsAfter["fallback.count"]'));
});

test('createGithubIssueDescription renders trace context, evidence, and guardrails', () => {
  const issue = createGithubIssueDescription(makeTrace(), makeIssues(), makeAnomalies(), 'C:\\tmp\\kernel.pass-lens.json');

  assert.match(issue, /# Compiler Pass Trace Failure/);
  assert.match(issue, /First failure at stage #2|first failure at stage #2/i);
  assert.match(issue, /Top Suspicious Passes/);
  assert.match(issue, /stages\[1\]\.metricsAfter\["ubBytes"\]/);
  assert.match(issue, /Treat suspicious passes as candidates/);
});

test('issue summary markdown reports top suspicious passes', () => {
  const markdown = createSuspiciousPassesMarkdown(makeTrace(), makeIssues(), makeAnomalies(), 2);

  assert.match(markdown, /# Pass Lens Top Suspicious Passes/);
  assert.match(markdown, /#1 convert-to-ac/);
  assert.match(markdown, /score/);
});

test('candidate root causes separate evidence, uncertainty, and next experiments', () => {
  const candidates = createCandidateRootCauses(makeTrace(), makeIssues(), makeAnomalies(), 2);
  assert.equal(candidates[0].stageIndex, 2);
  assert.match(candidates[0].candidate, /candidate/i);
  assert.ok(candidates[0].evidence.some((entry) => /failed status|verifier/i.test(entry)));
  assert.ok(candidates[0].counterEvidence.some((entry) => /No rerun|prefix/i.test(entry)));
  assert.ok(candidates[0].nextExperiments.some((entry) => /prefix bisection/i.test(entry)));

  const markdown = createCandidateRootCausesMarkdown(makeTrace(), makeIssues(), makeAnomalies(), 2);
  assert.match(markdown, /# Pass Lens Candidate Root Causes/);
  assert.match(markdown, /\*\*Candidate:\*\*/);
  assert.match(markdown, /\*\*Evidence:\*\*/);
  assert.match(markdown, /\*\*Counter-evidence \/ uncertainty:\*\*/);
  assert.match(markdown, /\*\*Next experiment:\*\*/);
  assert.match(markdown, /not proven root causes or patch instructions/i);
  assert.match(markdown, /Do not propose legality-check or rewrite-guard patches yet|inspect candidate legality checks or rewrite guards/);
});

test('explainFirstSignal covers fallback, legality, and budget signals', () => {
  const trace = makeTrace();
  const issues = makeIssues();
  const anomalies = makeAnomalies();

  const fallback = explainFirstSignal(trace, issues, anomalies, 'fallback');
  assert.equal(fallback.stage.stageIndex, 1);
  assert.match(renderFirstSignalExplanation(fallback), /First Fallback Signal/);

  const legality = explainFirstSignal(trace, issues, anomalies, 'legality');
  assert.equal(legality.stage.stageIndex, 1);
  assert.match(legality.summary, /legality/);

  const budget = explainFirstSignal(trace, issues, anomalies, 'budget');
  assert.equal(budget.stage.stageIndex, 1);
  assert.match(budget.summary, /budget/);
});

test('first failure localization report summarizes candidate window and checks', () => {
  const localization = createFirstFailureLocalizationMarkdown(makeTrace(), makeIssues(), makeAnomalies());

  assert.match(localization, /Pass Lens First Failure Localization/);
  assert.match(localization, /Localization Window/);
  assert.match(localization, /stage 2/);
  assert.match(localization, /Recommended Checks/);
  assert.match(localization, /guardrails/i);
});

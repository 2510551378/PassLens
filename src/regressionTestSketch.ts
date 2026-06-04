import type { MetricAnomaly, PassTrace, TraceIssue, TraceStage } from './types';

export interface RegressionTestSketchOptions {
  sourcePath?: string;
  selectedStageIndex?: number;
  maxInputChars?: number;
}

export function createRegressionTestSketch(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  options: RegressionTestSketchOptions = {}
): string {
  const selectedStage = findSelectedStage(trace, options.selectedStageIndex);
  const firstFailure = trace.stages.find(isFailedStage);
  const input = selectInputPayload(trace, selectedStage, options.maxInputChars ?? 12000);
  const checks = buildCheckLines(trace, selectedStage, issues, anomalies);

  return `${[
    '# Pass Lens Regression Test Sketch',
    '',
    'This is a candidate test sketch generated from trace evidence. It is not a proven fix, and it may need dialect-specific CHECK lines before landing in a compiler test suite.',
    '',
    '## Test Intent',
    '',
    `- Source trace: ${options.sourcePath ?? 'unknown'}`,
    `- Tool: ${trace.tool ?? 'unknown'}`,
    `- Pipeline: ${trace.pipeline ?? 'unknown'}`,
    `- Selected stage: ${selectedStage ? `#${selectedStage.index} ${selectedStage.pass}` : 'none recorded'}`,
    `- First failure: ${firstFailure ? `#${firstFailure.index} ${firstFailure.pass}` : 'none recorded'}`,
    `- Expected behavior: preserve the recorded signal while turning this sketch into a stable regression test.`,
    '',
    '## Suggested MLIR Test',
    '',
    fenced('mlir', [
      renderRunLine(trace),
      ...checks,
      '',
      input
    ].join('\n').trimEnd()),
    '',
    '## Evidence To Preserve',
    '',
    renderEvidence(selectedStage, issues, anomalies),
    '',
    '## Uncertainty',
    '',
    '- The generated CHECK lines are intentionally conservative and may be too weak for upstream review.',
    '- If this trace came from a directory repro bundle, prefer the bundled `input.mlir`, `pipeline.txt`, and artifacts over any truncated inline text below.',
    '- Do not edit compiler source from this sketch alone; confirm with rerun, prefix bisection, or verifier output first.',
    ''
  ].join('\n')}`;
}

function findSelectedStage(trace: PassTrace, selectedStageIndex: number | undefined): TraceStage | undefined {
  if (typeof selectedStageIndex === 'number') {
    const exact = trace.stages.find((stage) => stage.index === selectedStageIndex);
    if (exact) {
      return exact;
    }
  }
  return trace.stages.find(isFailedStage) ?? trace.stages.find((stage) => stage.changed) ?? trace.stages[0];
}

function renderRunLine(trace: PassTrace): string {
  const tool = trace.tool && trace.tool !== 'unknown' ? trace.tool : 'pass-lens-mlir-opt';
  const pipeline = trace.pipeline ?? '<paste pipeline from pipeline.txt>';
  return `// RUN: ${tool} %s "--pass-pipeline=${pipeline}" -o %t 2>&1 | FileCheck %s`;
}

function buildCheckLines(
  trace: PassTrace,
  selectedStage: TraceStage | undefined,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[]
): string[] {
  const lines: string[] = [];
  const diagnostic = selectedStage?.diagnostics ?? trace.diagnostics;
  const diagnosticSnippet = firstMeaningfulLine(diagnostic);
  if (diagnosticSnippet) {
    lines.push(`// CHECK: ${escapeFileCheckLiteral(diagnosticSnippet)}`);
  }

  const failed = selectedStage && isFailedStage(selectedStage);
  if (failed) {
    lines.push(`// CHECK-SAME: ${escapeFileCheckLiteral(selectedStage.pass)}`);
  }

  for (const anomaly of anomalies.filter((entry) => !selectedStage || entry.stageIndex === selectedStage.index).slice(0, 2)) {
    lines.push(`// NOTE: preserve metric signal ${anomaly.metric}: ${anomaly.before} -> ${anomaly.after} (${signed(anomaly.delta)}).`);
  }

  for (const issue of issues.filter((entry) => !selectedStage || entry.stageIndex === selectedStage.index).slice(0, 2)) {
    lines.push(`// NOTE: trace validation ${issue.severity}: ${issue.message}`);
  }

  if (!lines.length) {
    lines.push('// CHECK-LABEL: module');
    lines.push('// TODO: add dialect-specific CHECK lines from the first bad IR diff.');
  }
  return lines;
}

function selectInputPayload(trace: PassTrace, selectedStage: TraceStage | undefined, maxInputChars: number): string {
  const before = selectedStage?.irBefore ?? trace.stages.find((stage) => stage.irBefore)?.irBefore;
  if (before) {
    return truncate(before, maxInputChars);
  }
  const after = selectedStage?.irAfter ?? trace.stages.find((stage) => stage.irAfter)?.irAfter;
  if (after) {
    return [
      '// TODO: this payload is from after-IR because no before-IR/input was embedded in the trace.',
      truncate(after, maxInputChars)
    ].join('\n');
  }
  return [
    '// TODO: paste the minimized input from input.mlir in the repro bundle.',
    'module {',
    '}'
  ].join('\n');
}

function renderEvidence(
  selectedStage: TraceStage | undefined,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[]
): string {
  if (!selectedStage) {
    return '- No selected stage evidence recorded.';
  }
  const lines = [
    `- Stage #${selectedStage.index} ${selectedStage.pass}: status=${selectedStage.status ?? 'unknown'}, verifier=${selectedStage.verifier ?? 'unknown'}, changed=${selectedStage.changed ? 'yes' : 'no'}.`
  ];
  if (selectedStage.diagnostics) {
    lines.push(`- Stage diagnostics: ${firstMeaningfulLine(selectedStage.diagnostics) ?? 'present'}`);
  }
  for (const anomaly of anomalies.filter((entry) => entry.stageIndex === selectedStage.index).slice(0, 4)) {
    lines.push(`- Metric anomaly: ${anomaly.message}`);
  }
  for (const issue of issues.filter((entry) => entry.stageIndex === selectedStage.index).slice(0, 4)) {
    lines.push(`- Trace validation ${issue.severity}: ${issue.message}`);
  }
  return lines.join('\n');
}

function isFailedStage(stage: TraceStage): boolean {
  return stage.status === 'verifier_failed' ||
    stage.status === 'pass_failed' ||
    String(stage.verifier ?? '').toLowerCase() === 'failed';
}

function firstMeaningfulLine(text: string | undefined): string | undefined {
  return text?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

function escapeFileCheckLiteral(text: string): string {
  return text.replace(/[{}`]/g, '.').slice(0, 160);
}

function fenced(language: string, text: string): string {
  return `\`\`\`${language}\n${text}\n\`\`\``;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n// Pass Lens truncated ${text.length - maxChars} character(s). Prefer the directory repro bundle input.`;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

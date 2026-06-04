import type { MetricAnomaly, PassTrace, TraceIssue, TraceStage } from './types';
import { createRegressionTestSketch } from './regressionTestSketch';

export interface ReproBundleOptions {
  sourcePath?: string;
  selectedStageIndex?: number;
  maxInlineChars?: number;
}

export function createReproBundle(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  options: ReproBundleOptions = {}
): string {
  const maxInlineChars = options.maxInlineChars ?? 20000;
  const selectedStage = findSelectedStage(trace, options.selectedStageIndex);
  const failedStage = trace.stages.find(isFailedStage);
  const changedCount = trace.stages.filter((stage) => stage.changed).length;
  const lines: string[] = [
    '# Pass Lens Repro Bundle',
    '',
    '## Summary',
    '',
    `- Source trace: ${options.sourcePath ?? 'unknown'}`,
    `- Tool: ${trace.tool ?? 'unknown'}`,
    `- Collector: ${trace.collectorVersion ?? 'unknown'}`,
    `- Provenance: ${formatProvenance(trace.provenance)}`,
    `- Input: ${trace.input ?? 'unknown'}`,
    `- Pipeline: ${trace.pipeline ?? 'unknown'}`,
    `- Exit code: ${trace.exitCode ?? 'unknown'}`,
    `- Stages: ${trace.stages.length}`,
    `- Changed stages: ${changedCount}`,
    `- First failure: ${failedStage ? `#${failedStage.index} ${failedStage.pass}` : 'none recorded'}`,
    `- Metric anomalies: ${anomalies.length}`,
    '',
    '## Selected Pass',
    '',
    renderStageSummary(selectedStage, anomalies),
    '',
    '## Top Metric Anomalies',
    '',
    renderAnomalies(anomalies),
    '',
    '## Trace Validation',
    '',
    renderIssues(issues),
    '',
    '## Repro Command',
    '',
    fenced(trace.command ?? 'No repro command recorded.'),
    '',
    '## Diagnostics',
    '',
    fenced(trace.diagnostics ?? 'No diagnostics recorded.'),
    '',
    '## Selected Pass IR',
    '',
    renderSelectedIr(selectedStage, maxInlineChars),
    '',
    '## Regression Test Sketch',
    '',
    createRegressionTestSketch(trace, issues, anomalies, {
      sourcePath: options.sourcePath,
      selectedStageIndex: options.selectedStageIndex,
      maxInputChars: maxInlineChars
    }).trimEnd(),
    '',
    '## Trace JSON',
    '',
    fenced(truncate(JSON.stringify(trace, null, 2), maxInlineChars))
  ];

  return `${lines.join('\n')}\n`;
}

function formatProvenance(provenance: PassTrace['provenance']): string {
  if (!provenance?.kind) {
    return 'unknown';
  }
  return provenance.description
    ? `${provenance.kind} (${provenance.description})`
    : provenance.kind;
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

function renderStageSummary(stage: TraceStage | undefined, anomalies: MetricAnomaly[]): string {
  if (!stage) {
    return 'No selected pass recorded.';
  }
  const stageAnomalies = anomalies.filter((entry) => entry.stageIndex === stage.index);
  const metrics = topMetricDeltas(stage).slice(0, 5);
  return [
    `- Index: #${stage.index}`,
    `- Pass: ${stage.pass}`,
    `- Status: ${stage.status ?? 'unknown'}`,
    `- Scope: ${stage.scope ?? 'unknown'}`,
    `- Changed: ${stage.changed ? 'yes' : 'no'}`,
    `- Verifier: ${stage.verifier ?? 'unknown'}`,
    `- Duration: ${typeof stage.durationMs === 'number' ? `${stage.durationMs} ms` : 'unknown'}`,
    `- Anomalies on pass: ${stageAnomalies.length}`,
    '',
    metrics.length
      ? ['Metric deltas:', '', '| metric | before | after | delta |', '| --- | ---: | ---: | ---: |',
        ...metrics.map((entry) => `| ${entry.metric} | ${entry.before} | ${entry.after} | ${signed(entry.delta)} |`)].join('\n')
      : 'No metric deltas recorded for selected pass.'
  ].join('\n');
}

function renderAnomalies(anomalies: MetricAnomaly[]): string {
  if (!anomalies.length) {
    return 'No metric anomalies recorded.';
  }
  return anomalies.slice(0, 10)
    .map((entry) => `- [${entry.severity}] #${entry.stageIndex} ${entry.pass}: ${entry.message}`)
    .join('\n');
}

function renderIssues(issues: TraceIssue[]): string {
  if (!issues.length) {
    return 'No trace validation issues recorded.';
  }
  return issues
    .map((entry) => {
      const location = typeof entry.stageIndex === 'number' ? ` #${entry.stageIndex}` : '';
      const field = entry.field ? ` ${entry.field}` : '';
      return `- [${entry.severity}]${location}${field}: ${entry.message}`;
    })
    .join('\n');
}

function renderSelectedIr(stage: TraceStage | undefined, maxInlineChars: number): string {
  if (!stage) {
    return 'No selected pass recorded.';
  }
  return [
    '### Before',
    '',
    fenced(truncate(stage.irBefore ?? 'No before-IR recorded.', maxInlineChars)),
    '',
    '### After',
    '',
    fenced(truncate(stage.irAfter ?? 'No after-IR recorded.', maxInlineChars))
  ].join('\n');
}

function topMetricDeltas(stage: TraceStage): Array<{ metric: string; before: number; after: number; delta: number }> {
  const before = stage.metricsBefore ?? {};
  const after = stage.metricsAfter ?? {};
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .map((metric) => {
      const beforeValue = before[metric] ?? 0;
      const afterValue = after[metric] ?? 0;
      return {
        metric,
        before: beforeValue,
        after: afterValue,
        delta: afterValue - beforeValue
      };
    })
    .filter((entry) => entry.delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
}

function isFailedStage(stage: TraceStage): boolean {
  return stage.status === 'verifier_failed' ||
    stage.status === 'pass_failed' ||
    String(stage.verifier ?? '').toLowerCase() === 'failed';
}

function fenced(text: string): string {
  return `\`\`\`text\n${text}\n\`\`\``;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n[Pass Lens truncated ${text.length - maxChars} character(s).]`;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

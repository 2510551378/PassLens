import { metricEvidenceId, stageEvidenceId } from './agentContext';
import type { PassTrace, TraceStage } from './types';

export type TraceQuery =
  | { kind: 'firstFailure' }
  | { kind: 'firstChanged' }
  | { kind: 'firstMetricJump'; metric: string }
  | { kind: 'metricBudget'; metric: string; budget: number }
  | { kind: 'slowest'; count: number }
  | { kind: 'search'; text: string };

export interface TraceQueryResult {
  kind: TraceQuery['kind'];
  title: string;
  summary: string;
  matches: TraceQueryMatch[];
}

export interface TraceQueryMatch {
  stageIndex: number;
  pass: string;
  label: string;
  reason: string;
  evidenceIds: string[];
  metric?: string;
  before?: number;
  after?: number;
  delta?: number;
  durationMs?: number;
  snippets?: string[];
}

export function runTraceQuery(trace: PassTrace, query: TraceQuery): TraceQueryResult {
  switch (query.kind) {
    case 'firstFailure':
      return firstFailure(trace);
    case 'firstChanged':
      return firstChanged(trace);
    case 'firstMetricJump':
      return firstMetricJump(trace, query.metric);
    case 'metricBudget':
      return metricBudget(trace, query.metric, query.budget);
    case 'slowest':
      return slowest(trace, query.count);
    case 'search':
      return searchTrace(trace, query.text);
  }
}

export function renderTraceQueryResultMarkdown(result: TraceQueryResult): string {
  const lines = [
    `# ${result.title}`,
    '',
    result.summary,
    '',
    '## Matches',
    ''
  ];

  if (!result.matches.length) {
    lines.push('No matching stages found.');
    return `${lines.join('\n')}\n`;
  }

  for (const match of result.matches) {
    lines.push(`- #${match.stageIndex} ${match.pass}: ${match.reason}`);
    if (match.metric) {
      lines.push(`  - Metric: ${match.metric} before=${formatOptionalNumber(match.before)} after=${formatOptionalNumber(match.after)} delta=${formatOptionalNumber(match.delta)}`);
    }
    if (typeof match.durationMs === 'number') {
      lines.push(`  - Duration: ${match.durationMs} ms`);
    }
    if (match.snippets?.length) {
      lines.push(`  - Snippets: ${match.snippets.map((snippet) => `\`${snippet}\``).join(', ')}`);
    }
    if (match.evidenceIds.length) {
      lines.push(`  - Evidence: ${match.evidenceIds.map((id) => `\`${id}\``).join(', ')}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function firstFailure(trace: PassTrace): TraceQueryResult {
  const stage = trace.stages.find(isFailedStage);
  return {
    kind: 'firstFailure',
    title: 'Pass Lens Query: First Failure Stage',
    summary: stage
      ? `First failure is stage #${stage.index} (${stage.pass}).`
      : 'No failed stage was recorded.',
    matches: stage ? [stageMatch(stage, 'first stage with failed status or verifier result')] : []
  };
}

function firstChanged(trace: PassTrace): TraceQueryResult {
  const stage = trace.stages.find((entry) => entry.changed);
  return {
    kind: 'firstChanged',
    title: 'Pass Lens Query: First Changed Stage',
    summary: stage
      ? `First changed stage is #${stage.index} (${stage.pass}).`
      : 'No changed stage was recorded.',
    matches: stage ? [stageMatch(stage, 'first stage with changed=true')] : []
  };
}

function firstMetricJump(trace: PassTrace, metric: string): TraceQueryResult {
  const normalizedMetric = metric.trim();
  const match = trace.stages
    .map((stage) => metricMatch(stage, normalizedMetric))
    .find((entry): entry is TraceQueryMatch => entry !== undefined);

  return {
    kind: 'firstMetricJump',
    title: `Pass Lens Query: First Metric Jump (${normalizedMetric})`,
    summary: match
      ? `First ${normalizedMetric} jump is at stage #${match.stageIndex} (${match.pass}).`
      : `No ${normalizedMetric} metric jump was recorded.`,
    matches: match ? [match] : []
  };
}

function metricBudget(trace: PassTrace, metric: string, budget: number): TraceQueryResult {
  const normalizedMetric = metric.trim();
  const matches = trace.stages
    .map((stage) => {
      const after = stage.metricsAfter?.[normalizedMetric];
      if (typeof after !== 'number' || after <= budget) {
        return undefined;
      }
      const before = stage.metricsBefore?.[normalizedMetric] ?? 0;
      return metricStageMatch(
        stage,
        normalizedMetric,
        before,
        after,
        `${normalizedMetric}=${after} exceeds budget ${budget}`
      );
    })
    .filter((entry): entry is TraceQueryMatch => entry !== undefined);

  return {
    kind: 'metricBudget',
    title: `Pass Lens Query: ${normalizedMetric} Over Budget`,
    summary: matches.length
      ? `${matches.length} stage(s) exceed ${normalizedMetric} budget ${budget}.`
      : `No stage exceeds ${normalizedMetric} budget ${budget}.`,
    matches
  };
}

function slowest(trace: PassTrace, count: number): TraceQueryResult {
  const boundedCount = Math.max(1, Math.floor(count));
  const matches = trace.stages
    .filter((stage) => typeof stage.durationMs === 'number')
    .sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))
    .slice(0, boundedCount)
    .map((stage) => ({
      ...stageMatch(stage, `duration=${stage.durationMs} ms`),
      durationMs: stage.durationMs
    }));

  return {
    kind: 'slowest',
    title: `Pass Lens Query: Slowest ${boundedCount} Passes`,
    summary: matches.length
      ? `Found ${matches.length} timed stage(s), sorted by duration.`
      : 'No stage timing data was recorded.',
    matches
  };
}

function searchTrace(trace: PassTrace, text: string): TraceQueryResult {
  const needle = text.trim().toLowerCase();
  const matches = needle.length
    ? trace.stages
      .map((stage) => searchStage(stage, needle))
      .filter((entry): entry is TraceQueryMatch => entry !== undefined)
    : [];

  return {
    kind: 'search',
    title: `Pass Lens Query: Search (${text.trim()})`,
    summary: matches.length
      ? `${matches.length} stage(s) match '${text.trim()}'.`
      : `No stages match '${text.trim()}'.`,
    matches
  };
}

function metricMatch(stage: TraceStage, metric: string): TraceQueryMatch | undefined {
  const before = stage.metricsBefore?.[metric] ?? 0;
  const after = stage.metricsAfter?.[metric] ?? 0;
  if (before === after) {
    return undefined;
  }
  return metricStageMatch(stage, metric, before, after, `${metric} changed from ${before} to ${after}`);
}

function metricStageMatch(
  stage: TraceStage,
  metric: string,
  before: number,
  after: number,
  reason: string
): TraceQueryMatch {
  return {
    ...stageMatch(stage, reason),
    metric,
    before,
    after,
    delta: after - before,
    evidenceIds: [
      metricEvidenceId(stage.index, 'metricsBefore', metric),
      metricEvidenceId(stage.index, 'metricsAfter', metric)
    ]
  };
}

function searchStage(stage: TraceStage, needle: string): TraceQueryMatch | undefined {
  const fields = [
    ['pass', stage.pass],
    ['argument', stage.argument],
    ['opName', stage.opName],
    ['symbol', stage.symbol],
    ['scope', stage.scope],
    ['diagnostics', stage.diagnostics],
    ['irBefore', stage.irBefore],
    ['irAfter', stage.irAfter]
  ] as const;
  const hits = fields
    .filter(([, value]) => typeof value === 'string' && value.toLowerCase().includes(needle))
    .map(([field, value]) => ({
      field,
      snippet: makeSnippet(value, needle)
    }));

  if (!hits.length) {
    return undefined;
  }

  return {
    ...stageMatch(stage, `matched ${hits.map((hit) => hit.field).join(', ')}`),
    evidenceIds: hits.map((hit) => stageEvidenceId(stage.index, hit.field)),
    snippets: hits.map((hit) => hit.snippet)
  };
}

function stageMatch(stage: TraceStage, reason: string): TraceQueryMatch {
  return {
    stageIndex: stage.index,
    pass: stage.pass,
    label: `#${stage.index} ${stage.pass}`,
    reason,
    evidenceIds: [
      stageEvidenceId(stage.index, 'pass'),
      stageEvidenceId(stage.index, 'changed'),
      stage.status !== undefined ? stageEvidenceId(stage.index, 'status') : undefined,
      stage.verifier !== undefined ? stageEvidenceId(stage.index, 'verifier') : undefined
    ].filter((entry): entry is string => typeof entry === 'string')
  };
}

function makeSnippet(value: string | undefined, needle: string): string {
  const text = value ?? '';
  const index = text.toLowerCase().indexOf(needle);
  if (index < 0) {
    return text.slice(0, 80);
  }
  const start = Math.max(0, index - 24);
  const end = Math.min(text.length, index + needle.length + 24);
  return text.slice(start, end).replace(/\s+/g, ' ');
}

function isFailedStage(stage: TraceStage): boolean {
  return stage.status === 'verifier_failed' ||
    stage.status === 'pass_failed' ||
    String(stage.verifier ?? '').toLowerCase() === 'failed';
}

function formatOptionalNumber(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : 'unknown';
}

import type { MetricAnomaly, Metrics, PassTrace, TraceIssue, TraceStage } from './types';

export interface AgentContextOptions {
  sourcePath?: string;
  selectedStageIndex?: number;
  neighborRadius?: number;
  maxIrChars?: number;
  maxDiagnosticsChars?: number;
  maxAnomalies?: number;
  maxIssues?: number;
}

export interface AgentContext {
  schemaVersion: 1;
  kind: 'pass-lens-agent-context';
  objective: string;
  source: {
    tracePath?: string;
    tool?: string;
    collectorVersion?: string;
    input?: string;
    pipeline?: string;
    command?: string;
    exitCode?: number;
    capture?: PassTrace['capture'];
  };
  summary: {
    stageCount: number;
    changedStageCount: number;
    firstFailureStageIndex?: number;
    firstChangedStageIndex?: number;
    selectedStageIndex?: number;
  };
  selectedStage?: AgentStageContext;
  neighborStages: AgentStageSummary[];
  topAnomalies: MetricAnomaly[];
  validationIssues: TraceIssue[];
  diagnostics?: TruncatedText;
  contextSize: AgentContextSizeAccounting;
  investigationQuestions: string[];
}

export interface AgentStageContext extends AgentStageSummary {
  diagnostics?: TruncatedText;
  irBefore?: TruncatedText;
  irAfter?: TruncatedText;
}

export interface AgentStageSummary {
  index: number;
  pass: string;
  argument?: string;
  opName?: string;
  symbol?: string;
  scope?: string;
  status?: string;
  changed: boolean;
  verifier?: string;
  durationMs?: number;
  location?: string;
  artifacts?: TraceStage['artifacts'];
  metricDeltas: MetricDelta[];
}

export interface MetricDelta {
  metric: string;
  before: number;
  after: number;
  delta: number;
}

export interface TruncatedText {
  text: string;
  truncated: boolean;
  originalChars: number;
}

export interface AgentContextSizeAccounting {
  selectedIrChars: number;
  selectedIrOriginalChars: number;
  diagnosticsChars: number;
  diagnosticsOriginalChars: number;
  artifactOnlyReferenceCount: number;
  omittedStageCount: number;
}

export function createAgentContext(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  options: AgentContextOptions = {}
): AgentContext {
  const selectedStage = findSelectedStage(trace, options.selectedStageIndex);
  const selectedStageIndex = selectedStage?.index;
  const neighborRadius = options.neighborRadius ?? 2;
  const maxAnomalies = options.maxAnomalies ?? 12;
  const maxIssues = options.maxIssues ?? 20;
  const selectedStageContext = selectedStage ? summarizeStageWithIr(selectedStage, options) : undefined;
  const neighborStages = selectedStage
    ? selectNeighborStages(trace, selectedStage, neighborRadius).map(summarizeStage)
    : [];
  const diagnostics = trace.diagnostics
    ? truncateText(trace.diagnostics, options.maxDiagnosticsChars ?? 8000)
    : undefined;

  return {
    schemaVersion: 1,
    kind: 'pass-lens-agent-context',
    objective: 'Explain and debug this compiler pass trace using only the provided trace-grounded evidence.',
    source: {
      tracePath: options.sourcePath,
      tool: trace.tool,
      collectorVersion: trace.collectorVersion,
      input: trace.input,
      pipeline: trace.pipeline,
      command: trace.command,
      exitCode: trace.exitCode,
      capture: trace.capture
    },
    summary: {
      stageCount: trace.stages.length,
      changedStageCount: trace.stages.filter((stage) => stage.changed).length,
      firstFailureStageIndex: trace.stages.find(isFailedStage)?.index,
      firstChangedStageIndex: trace.stages.find((stage) => stage.changed)?.index,
      selectedStageIndex
    },
    selectedStage: selectedStageContext,
    neighborStages,
    topAnomalies: anomalies.slice(0, maxAnomalies),
    validationIssues: selectIssues(issues, selectedStageIndex, maxIssues),
    diagnostics,
    contextSize: computeContextSize(trace, selectedStageContext, neighborStages, diagnostics),
    investigationQuestions: buildInvestigationQuestions(trace, selectedStage, anomalies, issues)
  };
}

export function createAgentContextMarkdown(context: AgentContext): string {
  const lines: string[] = [
    '# Pass Lens Agent Context',
    '',
    '## Objective',
    '',
    context.objective,
    '',
    '## Trace Summary',
    '',
    `- Source trace: ${context.source.tracePath ?? 'unknown'}`,
    `- Tool: ${context.source.tool ?? 'unknown'}`,
    `- Collector: ${context.source.collectorVersion ?? 'unknown'}`,
    `- Input: ${context.source.input ?? 'unknown'}`,
    `- Pipeline: ${context.source.pipeline ?? 'unknown'}`,
    `- Exit code: ${context.source.exitCode ?? 'unknown'}`,
    `- Stages: ${context.summary.stageCount}`,
    `- Changed stages: ${context.summary.changedStageCount}`,
    `- First failure stage: ${formatOptionalIndex(context.summary.firstFailureStageIndex)}`,
    `- Selected stage: ${formatOptionalIndex(context.summary.selectedStageIndex)}`,
    '',
    '## Context Size',
    '',
    `- Selected IR chars: ${context.contextSize.selectedIrChars} included / ${context.contextSize.selectedIrOriginalChars} original`,
    `- Diagnostics chars: ${context.contextSize.diagnosticsChars} included / ${context.contextSize.diagnosticsOriginalChars} original`,
    `- Artifact-only references: ${context.contextSize.artifactOnlyReferenceCount}`,
    `- Omitted stages: ${context.contextSize.omittedStageCount}`,
    '',
    '## Selected Stage',
    '',
    renderStage(context.selectedStage),
    '',
    '## Neighbor Stages',
    '',
    renderNeighborStages(context.neighborStages),
    '',
    '## Top Anomalies',
    '',
    renderAnomalies(context.topAnomalies),
    '',
    '## Validation Issues',
    '',
    renderIssues(context.validationIssues),
    '',
    '## Investigation Questions',
    '',
    context.investigationQuestions.map((question) => `- ${question}`).join('\n'),
    '',
    '## Repro Command',
    '',
    fenced(context.source.command ?? 'No repro command recorded.')
  ];

  if (context.diagnostics) {
    lines.push('', '## Trace Diagnostics', '', fenced(renderTruncatedText(context.diagnostics)));
  }

  return `${lines.join('\n')}\n`;
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

function selectNeighborStages(trace: PassTrace, selectedStage: TraceStage, radius: number): TraceStage[] {
  const position = trace.stages.findIndex((stage) => stage.index === selectedStage.index);
  if (position < 0) {
    return [];
  }
  const start = Math.max(0, position - radius);
  const end = Math.min(trace.stages.length, position + radius + 1);
  return trace.stages.slice(start, end).filter((stage) => stage.index !== selectedStage.index);
}

function summarizeStageWithIr(stage: TraceStage, options: AgentContextOptions): AgentStageContext {
  return {
    ...summarizeStage(stage),
    diagnostics: stage.diagnostics
      ? truncateText(stage.diagnostics, options.maxDiagnosticsChars ?? 8000)
      : undefined,
    irBefore: stage.irBefore
      ? truncateText(stage.irBefore, options.maxIrChars ?? 12000)
      : undefined,
    irAfter: stage.irAfter
      ? truncateText(stage.irAfter, options.maxIrChars ?? 12000)
      : undefined
  };
}

function summarizeStage(stage: TraceStage): AgentStageSummary {
  return {
    index: stage.index,
    pass: stage.pass,
    argument: stage.argument,
    opName: stage.opName,
    symbol: stage.symbol,
    scope: stage.scope,
    status: stage.status,
    changed: stage.changed,
    verifier: stage.verifier,
    durationMs: stage.durationMs,
    location: stage.location,
    artifacts: stage.artifacts,
    metricDeltas: topMetricDeltas(stage.metricsBefore ?? {}, stage.metricsAfter ?? {}).slice(0, 10)
  };
}

function computeContextSize(
  trace: PassTrace,
  selectedStage: AgentStageContext | undefined,
  neighborStages: AgentStageSummary[],
  diagnostics: TruncatedText | undefined
): AgentContextSizeAccounting {
  const selectedIr = [selectedStage?.irBefore, selectedStage?.irAfter].filter(isTruncatedText);
  const diagnosticTexts = [selectedStage?.diagnostics, diagnostics].filter(isTruncatedText);
  const includedStageIndexes = new Set<number>();
  if (selectedStage) {
    includedStageIndexes.add(selectedStage.index);
  }
  for (const stage of neighborStages) {
    includedStageIndexes.add(stage.index);
  }

  return {
    selectedIrChars: sumTextChars(selectedIr),
    selectedIrOriginalChars: sumOriginalChars(selectedIr),
    diagnosticsChars: sumTextChars(diagnosticTexts),
    diagnosticsOriginalChars: sumOriginalChars(diagnosticTexts),
    artifactOnlyReferenceCount: countArtifactOnlyReferences([selectedStage, ...neighborStages]),
    omittedStageCount: trace.stages.filter((stage) => !includedStageIndexes.has(stage.index)).length
  };
}

function countArtifactOnlyReferences(stages: Array<AgentStageSummary | AgentStageContext | undefined>): number {
  let count = 0;
  for (const stage of stages) {
    if (!stage?.artifacts) {
      continue;
    }
    if (stage.artifacts.beforePath && !hasTruncatedText(stage, 'irBefore')) {
      count += 1;
    }
    if (stage.artifacts.afterPath && !hasTruncatedText(stage, 'irAfter')) {
      count += 1;
    }
    if (stage.artifacts.diagnosticsPath && !hasTruncatedText(stage, 'diagnostics')) {
      count += 1;
    }
  }
  return count;
}

function hasTruncatedText(stage: AgentStageSummary | AgentStageContext, field: keyof AgentStageContext): boolean {
  return isTruncatedText((stage as AgentStageContext)[field]);
}

function sumTextChars(values: TruncatedText[]): number {
  return values.reduce((total, value) => total + value.text.length, 0);
}

function sumOriginalChars(values: TruncatedText[]): number {
  return values.reduce((total, value) => total + value.originalChars, 0);
}

function isTruncatedText(value: unknown): value is TruncatedText {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as TruncatedText).text === 'string' &&
    typeof (value as TruncatedText).originalChars === 'number'
  );
}

function topMetricDeltas(before: Metrics, after: Metrics): MetricDelta[] {
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

function selectIssues(issues: TraceIssue[], selectedStageIndex: number | undefined, maxIssues: number): TraceIssue[] {
  const selected = typeof selectedStageIndex === 'number'
    ? issues.filter((issue) => issue.stageIndex === selectedStageIndex)
    : [];
  const global = issues.filter((issue) => typeof issue.stageIndex !== 'number');
  const other = issues.filter((issue) =>
    typeof issue.stageIndex === 'number' && issue.stageIndex !== selectedStageIndex
  );
  return [...selected, ...global, ...other].slice(0, maxIssues);
}

function buildInvestigationQuestions(
  trace: PassTrace,
  selectedStage: TraceStage | undefined,
  anomalies: MetricAnomaly[],
  issues: TraceIssue[]
): string[] {
  const questions = [
    'Which concrete IR change at the selected stage explains the observed status, verifier result, or metric delta?',
    'Is the selected stage the first signal, or did an earlier neighboring stage introduce the root cause?',
    'What minimal pipeline or input slice would reproduce the selected behavior?'
  ];

  if (selectedStage && isFailedStage(selectedStage)) {
    questions.unshift('Which verifier invariant appears to be violated immediately after the selected pass?');
  }
  if (anomalies.length) {
    questions.push('Do the top metric anomalies correspond to intentional lowering, unexpected expansion, or suspicious duplication?');
  }
  if (issues.some((issue) => issue.severity === 'error')) {
    questions.push('Do trace validation errors limit which conclusions can be drawn from this context?');
  }
  if (trace.capture?.ir === 'artifact') {
    questions.push('If more detail is needed, inspect the referenced artifact paths instead of inferring beyond the bounded snippets.');
  }
  return questions;
}

function renderStage(stage: AgentStageContext | undefined): string {
  if (!stage) {
    return 'No selected stage recorded.';
  }
  return [
    `- Index: #${stage.index}`,
    `- Pass: ${stage.pass}`,
    `- Argument: ${stage.argument ?? 'unknown'}`,
    `- Operation: ${stage.opName ?? 'unknown'}`,
    `- Scope: ${stage.scope ?? 'unknown'}`,
    `- Status: ${stage.status ?? 'unknown'}`,
    `- Changed: ${stage.changed ? 'yes' : 'no'}`,
    `- Verifier: ${stage.verifier ?? 'unknown'}`,
    `- Duration: ${typeof stage.durationMs === 'number' ? `${stage.durationMs} ms` : 'unknown'}`,
    '',
    'Metric deltas:',
    '',
    renderMetricDeltas(stage.metricDeltas),
    '',
    '### Before IR',
    '',
    fenced(stage.irBefore ? renderTruncatedText(stage.irBefore) : 'No before-IR recorded.'),
    '',
    '### After IR',
    '',
    fenced(stage.irAfter ? renderTruncatedText(stage.irAfter) : 'No after-IR recorded.'),
    stage.diagnostics ? ['', '### Stage Diagnostics', '', fenced(renderTruncatedText(stage.diagnostics))].join('\n') : ''
  ].filter((line) => line !== '').join('\n');
}

function renderNeighborStages(stages: AgentStageSummary[]): string {
  if (!stages.length) {
    return 'No neighboring stages recorded.';
  }
  return stages.map((stage) =>
    `- #${stage.index} ${stage.pass} [${stage.status ?? 'unknown'}] changed=${stage.changed ? 'yes' : 'no'} verifier=${stage.verifier ?? 'unknown'}`
  ).join('\n');
}

function renderAnomalies(anomalies: MetricAnomaly[]): string {
  if (!anomalies.length) {
    return 'No metric anomalies recorded.';
  }
  return anomalies.map((entry) =>
    `- [${entry.severity}] #${entry.stageIndex} ${entry.pass}: ${entry.message}`
  ).join('\n');
}

function renderIssues(issues: TraceIssue[]): string {
  if (!issues.length) {
    return 'No trace validation issues recorded.';
  }
  return issues.map((entry) => {
    const stage = typeof entry.stageIndex === 'number' ? ` #${entry.stageIndex}` : '';
    const field = entry.field ? ` ${entry.field}` : '';
    return `- [${entry.severity}]${stage}${field}: ${entry.message}`;
  }).join('\n');
}

function renderMetricDeltas(deltas: MetricDelta[]): string {
  if (!deltas.length) {
    return 'No metric deltas recorded.';
  }
  return [
    '| metric | before | after | delta |',
    '| --- | ---: | ---: | ---: |',
    ...deltas.map((entry) =>
      `| ${entry.metric} | ${entry.before} | ${entry.after} | ${signed(entry.delta)} |`
    )
  ].join('\n');
}

function truncateText(text: string, maxChars: number): TruncatedText {
  if (text.length <= maxChars) {
    return {
      text,
      truncated: false,
      originalChars: text.length
    };
  }
  return {
    text: text.slice(0, maxChars),
    truncated: true,
    originalChars: text.length
  };
}

function renderTruncatedText(value: TruncatedText): string {
  if (!value.truncated) {
    return value.text;
  }
  return `${value.text}\n\n[Pass Lens truncated ${value.originalChars - value.text.length} character(s).]`;
}

function isFailedStage(stage: TraceStage): boolean {
  return stage.status === 'verifier_failed' ||
    stage.status === 'pass_failed' ||
    String(stage.verifier ?? '').toLowerCase() === 'failed';
}

function fenced(text: string): string {
  return `\`\`\`text\n${text}\n\`\`\``;
}

function formatOptionalIndex(index: number | undefined): string {
  return typeof index === 'number' ? `#${index}` : 'none recorded';
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

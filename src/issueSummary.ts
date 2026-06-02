import { metricEvidenceId, stageEvidenceId } from './agentContext';
import type { MetricAnomaly, PassTrace, TraceIssue, TraceStage } from './types';

export interface SuspiciousPassSummary {
  stageIndex: number;
  pass: string;
  score: number;
  reasons: string[];
  evidenceIds: string[];
}

export interface CandidateRootCause {
  stageIndex: number;
  pass: string;
  candidate: string;
  evidence: string[];
  counterEvidence: string[];
  nextExperiments: string[];
  evidenceIds: string[];
}

export type FirstSignalKind = 'fallback' | 'legality' | 'budget';

export interface FirstSignalExplanation {
  kind: FirstSignalKind;
  title: string;
  summary: string;
  stage?: SuspiciousPassSummary;
}

export function summarizeTopSuspiciousPasses(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  count = 3
): SuspiciousPassSummary[] {
  return trace.stages
    .map((stage) => summarizeStageSuspicion(stage, issues, anomalies))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.stageIndex - right.stageIndex)
    .slice(0, Math.max(1, Math.floor(count)));
}

export function createSuspiciousPassesMarkdown(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  count = 3
): string {
  const summaries = summarizeTopSuspiciousPasses(trace, issues, anomalies, count);
  return [
    '# Pass Lens Top Suspicious Passes',
    '',
    summaries.length
      ? `Top ${summaries.length} suspicious pass candidate(s), ranked by trace-grounded signals.`
      : 'No suspicious pass candidates were found.',
    '',
    renderSuspiciousSummaries(summaries)
  ].join('\n');
}

export function createCandidateRootCausesMarkdown(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  count = 3
): string {
  const candidates = createCandidateRootCauses(trace, issues, anomalies, count);
  return `${[
    '# Pass Lens Candidate Root Causes',
    '',
    candidates.length
      ? `Top ${candidates.length} candidate root cause(s), derived only from recorded trace evidence.`
      : 'No candidate root causes could be derived from the recorded trace evidence.',
    '',
    'These are candidates, not proven root causes or patch instructions. Confirm with rerun, prefix bisection, verifier output, or source inspection before editing compiler code.',
    '',
    renderCandidateRootCauses(candidates)
  ].join('\n')}\n`;
}

export function createCandidateRootCauses(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  count = 3
): CandidateRootCause[] {
  const summaries = summarizeTopSuspiciousPasses(trace, issues, anomalies, count);
  return summaries.map((summary) => {
    const stage = trace.stages.find((entry) => entry.index === summary.stageIndex);
    return {
      stageIndex: summary.stageIndex,
      pass: summary.pass,
      candidate: describeCandidate(stage, summary),
      evidence: buildCandidateEvidence(stage, summary, issues, anomalies),
      counterEvidence: buildCounterEvidence(trace, stage, summary),
      nextExperiments: buildNextExperiments(trace, stage, summary, anomalies),
      evidenceIds: summary.evidenceIds
    };
  });
}

export function createGithubIssueDescription(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  sourcePath?: string
): string {
  const suspicious = summarizeTopSuspiciousPasses(trace, issues, anomalies, 3);
  const firstFailure = trace.stages.find(isFailedStage);
  const firstChanged = trace.stages.find((stage) => stage.changed);
  const warningIssues = issues.filter((issue) => issue.severity !== 'info');

  return `${[
    '# Compiler Pass Trace Failure',
    '',
    '## Summary',
    '',
    firstFailure
      ? `Pass Lens recorded the first failure at stage #${firstFailure.index} (${firstFailure.pass}).`
      : 'Pass Lens did not record a failed stage; this issue is based on anomalies, validation issues, or suspicious metric changes.',
    '',
    '## Trace Context',
    '',
    `- Trace: ${sourcePath ?? 'unknown'}`,
    `- Tool: ${trace.tool ?? 'unknown'}`,
    `- Input: ${trace.input ?? 'unknown'}`,
    `- Pipeline: ${trace.pipeline ?? 'unknown'}`,
    `- Command: ${trace.command ?? 'unknown'}`,
    `- Exit code: ${trace.exitCode ?? 'unknown'}`,
    `- Stage count: ${trace.stages.length}`,
    `- First changed stage: ${firstChanged ? `#${firstChanged.index} ${firstChanged.pass}` : 'none recorded'}`,
    `- First failure stage: ${firstFailure ? `#${firstFailure.index} ${firstFailure.pass}` : 'none recorded'}`,
    '',
    '## Top Suspicious Passes',
    '',
    renderSuspiciousSummaries(suspicious),
    '',
    '## Metric Anomalies',
    '',
    renderAnomalies(anomalies.slice(0, 8)),
    '',
    '## Trace Validation Issues',
    '',
    renderIssues(warningIssues.slice(0, 8)),
    '',
    '## Reproduction',
    '',
    '```text',
    trace.command ?? 'No repro command recorded.',
    '```',
    '',
    '## Guardrails',
    '',
    '- This issue description is generated from trace evidence only.',
    '- Treat suspicious passes as candidates until confirmed by a rerun, prefix bisection, or source-level inspection.',
    '- Do not infer dialect semantics beyond the recorded IR, diagnostics, metrics, artifacts, and verifier status.'
  ].join('\n')}\n`;
}

export function explainFirstSignal(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  kind: FirstSignalKind
): FirstSignalExplanation {
  if (kind === 'fallback') {
    return explainFirstFallback(trace, issues, anomalies);
  }
  if (kind === 'budget') {
    return explainFirstBudget(trace, issues, anomalies);
  }
  return explainFirstLegality(trace, issues, anomalies);
}

export function renderFirstSignalExplanation(explanation: FirstSignalExplanation): string {
  return `${[
    `# ${explanation.title}`,
    '',
    explanation.summary,
    '',
    explanation.stage ? renderSuspiciousSummaries([explanation.stage]) : 'No matching stage found.'
  ].join('\n')}\n`;
}

function summarizeStageSuspicion(
  stage: TraceStage,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[]
): SuspiciousPassSummary {
  const reasons: string[] = [];
  const evidenceIds: string[] = [stageEvidenceId(stage.index, 'pass')];
  let score = 0;

  if (isFailedStage(stage)) {
    score += 100;
    reasons.push(`failed status or verifier result (${stage.status ?? 'unknown'}, verifier=${stage.verifier ?? 'unknown'})`);
    evidenceIds.push(stageEvidenceId(stage.index, 'status'), stageEvidenceId(stage.index, 'verifier'));
  }
  if (stage.changed) {
    score += 10;
    reasons.push('changed the recorded IR');
    evidenceIds.push(stageEvidenceId(stage.index, 'changed'));
  }
  if (stage.diagnostics) {
    score += 8;
    reasons.push('has stage diagnostics');
    evidenceIds.push(stageEvidenceId(stage.index, 'diagnostics'));
  }

  const stageAnomalies = anomalies.filter((entry) => entry.stageIndex === stage.index);
  for (const anomaly of stageAnomalies) {
    score += anomaly.severity === 'warning' ? 30 : 12;
    reasons.push(anomaly.message);
    evidenceIds.push(
      metricEvidenceId(stage.index, 'metricsBefore', anomaly.metric),
      metricEvidenceId(stage.index, 'metricsAfter', anomaly.metric)
    );
  }

  const stageIssues = issues.filter((issue) => issue.stageIndex === stage.index && issue.severity !== 'info');
  for (const issue of stageIssues) {
    score += issue.severity === 'error' ? 40 : 15;
    reasons.push(`trace validation ${issue.severity}: ${issue.message}`);
    if (issue.field) {
      evidenceIds.push(stageEvidenceId(stage.index, issue.field));
    }
  }

  return {
    stageIndex: stage.index,
    pass: stage.pass,
    score,
    reasons: unique(reasons),
    evidenceIds: unique(evidenceIds)
  };
}

function explainFirstFallback(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[]
): FirstSignalExplanation {
  const stage = trace.stages.find((entry) =>
    stageMentions(entry, 'fallback') || metricIncreases(entry, (metric) => metric.toLowerCase().includes('fallback'))
  );
  return {
    kind: 'fallback',
    title: 'Pass Lens First Fallback Signal',
    summary: stage
      ? `First fallback-related signal appears at stage #${stage.index} (${stage.pass}).`
      : 'No fallback-related signal was found in pass names, diagnostics, IR text, or metric deltas.',
    stage: stage ? summarizeStageSuspicion(stage, issues, anomalies) : undefined
  };
}

function explainFirstLegality(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[]
): FirstSignalExplanation {
  const stage = trace.stages.find((entry) =>
    isFailedStage(entry) || stageMentions(entry, 'legal') || stageMentions(entry, 'verifier')
  );
  return {
    kind: 'legality',
    title: 'Pass Lens First Legality Signal',
    summary: stage
      ? `First legality/verifier signal appears at stage #${stage.index} (${stage.pass}).`
      : 'No legality or verifier signal was found.',
    stage: stage ? summarizeStageSuspicion(stage, issues, anomalies) : undefined
  };
}

function explainFirstBudget(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[]
): FirstSignalExplanation {
  const anomaly = anomalies.find((entry) => entry.kind === 'budget');
  const stage = anomaly
    ? trace.stages.find((entry) => entry.index === anomaly.stageIndex)
    : trace.stages.find((entry) => metricIncreases(entry, (metric) => metric.toLowerCase().includes('budget')));
  return {
    kind: 'budget',
    title: 'Pass Lens First Budget Signal',
    summary: stage
      ? `First budget-related signal appears at stage #${stage.index} (${stage.pass}).`
      : 'No budget-related signal was found.',
    stage: stage ? summarizeStageSuspicion(stage, issues, anomalies) : undefined
  };
}

function renderSuspiciousSummaries(summaries: SuspiciousPassSummary[]): string {
  if (!summaries.length) {
    return 'No suspicious pass candidates recorded.';
  }
  return summaries.map((entry, index) => [
    `${index + 1}. #${entry.stageIndex} ${entry.pass} (score ${entry.score})`,
    ...entry.reasons.map((reason) => `   - ${reason}`),
    `   - Evidence: ${entry.evidenceIds.map((id) => `\`${id}\``).join(', ')}`
  ].join('\n')).join('\n');
}

function renderCandidateRootCauses(candidates: CandidateRootCause[]): string {
  if (!candidates.length) {
    return 'No candidate root causes recorded.';
  }
  return candidates.map((entry, index) => [
    `## Candidate ${index + 1}: #${entry.stageIndex} ${entry.pass}`,
    '',
    `**Candidate:** ${entry.candidate}`,
    '',
    '**Evidence:**',
    ...renderBullets(entry.evidence),
    '',
    '**Counter-evidence / uncertainty:**',
    ...renderBullets(entry.counterEvidence),
    '',
    '**Next experiment:**',
    ...renderBullets(entry.nextExperiments),
    '',
    `**Evidence IDs:** ${entry.evidenceIds.map((id) => `\`${id}\``).join(', ')}`
  ].join('\n')).join('\n\n');
}

function describeCandidate(stage: TraceStage | undefined, summary: SuspiciousPassSummary): string {
  if (!stage) {
    return `Stage #${summary.stageIndex} (${summary.pass}) is a candidate because trace-derived ranking found suspicious signals, but the stage payload is missing.`;
  }
  if (isFailedStage(stage)) {
    return `Stage #${stage.index} (\`${stage.pass}\`) is a candidate because failure or verifier evidence is attached to this stage.`;
  }
  const reason = summary.reasons[0] ?? 'trace-derived suspicious signal';
  return `Stage #${stage.index} (\`${stage.pass}\`) is a candidate because ${reason}.`;
}

function buildCandidateEvidence(
  stage: TraceStage | undefined,
  summary: SuspiciousPassSummary,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[]
): string[] {
  const evidence = summary.reasons.map((reason) => `${reason}.`);
  if (!stage) {
    return evidence.length ? evidence : ['Trace ranking referenced this stage, but no stage payload was available.'];
  }

  const stageAnomalies = anomalies.filter((entry) => entry.stageIndex === stage.index);
  for (const anomaly of stageAnomalies.slice(0, 3)) {
    evidence.push(`Metric \`${anomaly.metric}\` moved from ${anomaly.before} to ${anomaly.after} (${signed(anomaly.delta)}).`);
  }

  const stageIssues = issues.filter((issue) => issue.stageIndex === stage.index && issue.severity !== 'info');
  for (const issue of stageIssues.slice(0, 3)) {
    evidence.push(`Trace validation ${issue.severity}: ${issue.message}.`);
  }

  if (stage.diagnostics) {
    evidence.push('Stage diagnostics are present and should be inspected before proposing a compiler change.');
  }
  if (stage.artifacts?.beforePath || stage.artifacts?.afterPath) {
    evidence.push('Before/after IR artifacts are available for source-grounded diff inspection.');
  }

  return uniqueNormalized(evidence).slice(0, 8);
}

function buildCounterEvidence(
  trace: PassTrace,
  stage: TraceStage | undefined,
  summary: SuspiciousPassSummary
): string[] {
  if (!stage) {
    return ['The stage payload is missing, so Pass Lens cannot verify status, IR change, diagnostics, or metrics for this candidate.'];
  }

  const items: string[] = [];
  const firstFailure = trace.stages.find(isFailedStage);
  const firstChanged = trace.stages.find((entry) => entry.changed);

  if (!isFailedStage(stage)) {
    items.push('This stage is not itself recorded as failed by status or verifier.');
  }
  if (!stage.changed) {
    items.push('This stage has no recorded IR change, so it may be a symptom or validator rather than the introducing pass.');
  }
  if (!stage.diagnostics) {
    items.push('No stage-local diagnostics were recorded.');
  }
  if (firstFailure && firstFailure.index !== stage.index) {
    items.push(`The first failed stage is #${firstFailure.index} (${firstFailure.pass}), so this candidate needs prefix/rerun confirmation.`);
  }
  if (firstChanged && firstChanged.index < stage.index) {
    items.push(`An earlier IR change appears at #${firstChanged.index} (${firstChanged.pass}), so the root cause may precede this stage.`);
  }
  if (!hasRerunEvidence(trace)) {
    items.push('No rerun or prefix-bisect result is embedded in this trace.');
  }
  if (!summary.evidenceIds.some((id) => id.includes('metrics') || id.includes('diagnostics') || id.includes('status') || id.includes('verifier'))) {
    items.push('Evidence is relatively weak because it does not cite metrics, diagnostics, status, or verifier fields.');
  }

  return uniqueNormalized(items).slice(0, 8);
}

function buildNextExperiments(
  trace: PassTrace,
  stage: TraceStage | undefined,
  summary: SuspiciousPassSummary,
  anomalies: MetricAnomaly[]
): string[] {
  if (!stage) {
    return ['Re-open or recapture the trace so the candidate stage payload is available.'];
  }

  const items = [
    `Run prefix bisection around stage #${stage.index} to check whether this is the shortest failing prefix.`,
    `Compare before/after IR for stage #${stage.index}; record the first concrete op, type, attribute, or region change.`,
    'Export a directory repro bundle before asking an agent or teammate to inspect compiler source.'
  ];

  const concreteLegalitySignal = hasConcreteLegalitySignal(stage, summary, anomalies);
  if (concreteLegalitySignal) {
    items.push('Only after confirming the IR diff, inspect candidate legality checks or rewrite guards related to the recorded diagnostic/IR signal.');
  } else {
    items.push('Do not propose legality-check or rewrite-guard patches yet; this trace lacks concrete legality or rewrite evidence for that step.');
  }

  if (trace.command) {
    items.push('Rerun the recorded command and compare the new trace against this report for determinism.');
  }

  return items;
}

function renderBullets(items: string[]): string[] {
  return items.length ? items.map((item) => `- ${item}`) : ['- None recorded.'];
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
    return 'No warning/error validation issues recorded.';
  }
  return issues.map((entry) => {
    const stage = typeof entry.stageIndex === 'number' ? ` #${entry.stageIndex}` : '';
    const field = entry.field ? ` ${entry.field}` : '';
    return `- [${entry.severity}]${stage}${field}: ${entry.message}`;
  }).join('\n');
}

function metricIncreases(stage: TraceStage, predicate: (metric: string) => boolean): boolean {
  return Object.keys(stage.metricsAfter ?? {}).some((metric) => {
    const before = stage.metricsBefore?.[metric] ?? 0;
    const after = stage.metricsAfter?.[metric] ?? 0;
    return predicate(metric) && after > before;
  });
}

function stageMentions(stage: TraceStage, needle: string): boolean {
  const lowerNeedle = needle.toLowerCase();
  return [
    stage.pass,
    stage.argument,
    stage.opName,
    stage.scope,
    stage.diagnostics,
    stage.irBefore,
    stage.irAfter
  ].some((value) => typeof value === 'string' && value.toLowerCase().includes(lowerNeedle));
}

function hasConcreteLegalitySignal(
  stage: TraceStage,
  summary: SuspiciousPassSummary,
  anomalies: MetricAnomaly[]
): boolean {
  const text = [
    stage.pass,
    stage.argument,
    stage.diagnostics,
    stage.irBefore,
    stage.irAfter,
    ...summary.reasons,
    ...anomalies.filter((entry) => entry.stageIndex === stage.index).map((entry) => entry.message)
  ].filter((value): value is string => typeof value === 'string').join('\n').toLowerCase();
  return ['legal', 'illegal', 'verifier', 'verify', 'rewrite', 'invalid'].some((needle) => text.includes(needle));
}

function hasRerunEvidence(trace: PassTrace): boolean {
  const text = [trace.command, trace.diagnostics, trace.tool].filter(Boolean).join('\n').toLowerCase();
  return text.includes('prefix bisect') || text.includes('minimal failing prefix') || text.includes('verify-each');
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.trim().replace(/[.。]+$/, '').toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function isFailedStage(stage: TraceStage): boolean {
  return stage.status === 'verifier_failed' ||
    stage.status === 'pass_failed' ||
    String(stage.verifier ?? '').toLowerCase() === 'failed';
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

import {
  createAgentContext,
  metricEvidenceId,
  stageArtifactEvidenceId,
  stageEvidenceId,
  type AgentContext,
  type AgentContextOptions,
  type AgentStageContext
} from './agentContext';
import type { MetricAnomaly, PassTrace, TraceIssue } from './types';

export interface TraceExplanationOptions extends AgentContextOptions {
  maxEvidenceItems?: number;
}

export function createTraceExplanation(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  options: TraceExplanationOptions = {}
): string {
  const context = createAgentContext(trace, issues, anomalies, options);
  const stage = context.selectedStage;
  const evidence = collectEvidence(context, options.maxEvidenceItems ?? 8);
  const nextChecks = buildNextChecks(context);
  const confidence = estimateConfidence(context, evidence);

  return `${[
    '# Pass Lens Suspicious Pass Explanation',
    '',
    '## Likely Issue',
    '',
    likelyIssue(context),
    '',
    '## Selected Pass',
    '',
    renderSelectedStage(stage),
    '',
    '## Evidence',
    '',
    evidence.length ? evidence.map((item) => `- ${item}`).join('\n') : '- No concrete evidence recorded for this stage.',
    '',
    '## Recommended Next Checks',
    '',
    nextChecks.map((item, index) => `${index + 1}. ${item}`).join('\n'),
    '',
    '## Confidence',
    '',
    confidence,
    '',
    '## Guardrails',
    '',
    '- This explanation is generated from trace evidence only.',
    '- Treat root-cause statements as candidates unless confirmed by a rerun, verifier output, or source-level inspection.',
    '- Do not infer dialect-specific semantics that are not visible in diagnostics, metrics, IR, or artifacts.',
    '',
    '## Repro Command',
    '',
    fenced(context.source.command ?? 'No repro command recorded.')
  ].join('\n')}\n`;
}

function likelyIssue(context: AgentContext): string {
  const stage = context.selectedStage;
  if (!stage) {
    return 'No selected stage is available, so Pass Lens cannot identify a suspicious pass.';
  }

  if (isFailedStage(stage)) {
    return `The selected pass \`${stage.pass}\` is a root-cause candidate because the trace records a failed status or failed verifier immediately after this stage.`;
  }

  const stageAnomaly = context.topAnomalies.find((entry) => entry.stageIndex === stage.index);
  if (stageAnomaly) {
    return `The selected pass \`${stage.pass}\` is suspicious because it changed trace metric \`${stageAnomaly.metric}\` with a recorded anomaly.`;
  }

  if (stage.changed) {
    return `The selected pass \`${stage.pass}\` changed the recorded IR. Inspect the before/after diff and neighboring stages before attributing root cause.`;
  }

  return `The selected pass \`${stage.pass}\` did not change the recorded IR. It is less suspicious unless diagnostics or hidden side effects point to it.`;
}

function collectEvidence(context: AgentContext, maxItems: number): string[] {
  const stage = context.selectedStage;
  if (!stage) {
    return [];
  }

  const evidence: string[] = [];
  evidence.push(`Selected stage #${stage.index}: pass=\`${stage.pass}\`, status=\`${stage.status ?? 'unknown'}\`, changed=${stage.changed ? 'yes' : 'no'}, verifier=\`${stage.verifier ?? 'unknown'}\`. ${cite(stage.evidenceIds)}`);

  if (typeof context.summary.firstFailureStageIndex === 'number') {
    const index = context.summary.firstFailureStageIndex;
    evidence.push(`First failure stage recorded by trace: #${index}. ${cite([
      stageEvidenceId(index, 'status'),
      stageEvidenceId(index, 'verifier')
    ])}`);
  }
  if (typeof context.summary.firstChangedStageIndex === 'number') {
    const index = context.summary.firstChangedStageIndex;
    evidence.push(`First changed stage recorded by trace: #${index}. ${cite([stageEvidenceId(index, 'changed')])}`);
  }

  for (const delta of stage.metricDeltas.slice(0, 4)) {
    evidence.push(`Metric \`${delta.metric}\` changed from ${delta.before} to ${delta.after} (${signed(delta.delta)}). ${cite(delta.evidenceIds)}`);
  }

  for (const anomaly of context.topAnomalies.filter((entry) => entry.stageIndex === stage.index).slice(0, 3)) {
    evidence.push(`Metric anomaly: ${anomaly.message} ${cite([
      metricEvidenceId(anomaly.stageIndex, 'metricsBefore', anomaly.metric),
      metricEvidenceId(anomaly.stageIndex, 'metricsAfter', anomaly.metric)
    ])}`);
  }

  if (stage.diagnostics?.text) {
    evidence.push(`Stage diagnostics are present (${stage.diagnostics.originalChars} character(s), truncated=${stage.diagnostics.truncated ? 'yes' : 'no'}). ${cite([stageEvidenceId(stage.index, 'diagnostics')])}`);
  }
  if (context.diagnostics?.text) {
    evidence.push(`Trace-level diagnostics are present (${context.diagnostics.originalChars} character(s), truncated=${context.diagnostics.truncated ? 'yes' : 'no'}). ${cite(['diagnostics'])}`);
  }
  if (stage.artifacts?.beforePath || stage.artifacts?.afterPath || stage.artifacts?.diagnosticsPath) {
    evidence.push(`Artifacts referenced: ${[
      stage.artifacts.beforePath ? `before=${stage.artifacts.beforePath}` : undefined,
      stage.artifacts.afterPath ? `after=${stage.artifacts.afterPath}` : undefined,
      stage.artifacts.diagnosticsPath ? `diagnostics=${stage.artifacts.diagnosticsPath}` : undefined
    ].filter(Boolean).join(', ')}. ${cite([
      stage.artifacts.beforePath ? stageArtifactEvidenceId(stage.index, 'beforePath') : undefined,
      stage.artifacts.afterPath ? stageArtifactEvidenceId(stage.index, 'afterPath') : undefined,
      stage.artifacts.diagnosticsPath ? stageArtifactEvidenceId(stage.index, 'diagnosticsPath') : undefined
    ])}`);
  }

  for (const issue of context.validationIssues.filter((entry) =>
    typeof entry.stageIndex !== 'number' || entry.stageIndex === stage.index
  ).slice(0, 3)) {
    evidence.push(`Trace validation ${issue.severity}: ${issue.message} ${cite(issueEvidenceIds(issue))}`);
  }

  return evidence.slice(0, maxItems);
}

function buildNextChecks(context: AgentContext): string[] {
  const stage = context.selectedStage;
  if (!stage) {
    return ['Open a trace with at least one stage and select the first failed or changed stage.'];
  }

  const checks = [
    `Compare before/after IR for stage #${stage.index} and identify the first concrete op, type, attribute, or region change.`,
    `Inspect neighboring stages: ${context.neighborStages.map((neighbor) => `#${neighbor.index} ${neighbor.pass}`).join(', ') || 'none recorded'}.`
  ];

  if (isFailedStage(stage)) {
    checks.push(`Rerun the pipeline prefix through stage #${stage.index} with verifier enabled to confirm this is the minimal failing prefix.`);
  } else if (stage.changed) {
    checks.push(`Check whether the changed IR at stage #${stage.index} is expected lowering or the first visible symptom of an earlier pass.`);
  } else {
    checks.push(`Prefer another stage if you need root-cause localization; this stage has no recorded IR change.`);
  }

  const anomaly = context.topAnomalies.find((entry) => entry.stageIndex === stage.index);
  if (anomaly) {
    checks.push(`Audit metric \`${anomaly.metric}\` around this stage and decide whether the delta is expected for this lowering step.`);
  }
  if (stage.artifacts?.beforePath || stage.artifacts?.afterPath) {
    checks.push('Open the referenced artifact files if the bounded context is insufficient.');
  }
  checks.push('Export a repro bundle or directory-style repro before filing an issue or asking an AI agent to propose fixes.');
  return checks;
}

function estimateConfidence(context: AgentContext, evidence: string[]): string {
  const stage = context.selectedStage;
  if (!stage) {
    return 'low: no selected stage evidence is available.';
  }
  if (isFailedStage(stage) && evidence.length >= 3) {
    return 'high: failure status/verifier evidence is directly attached to the selected stage.';
  }
  if (context.topAnomalies.some((entry) => entry.stageIndex === stage.index) && stage.changed) {
    return 'medium: the selected stage has both an IR change and metric anomaly, but root cause still needs rerun/source confirmation.';
  }
  if (stage.changed) {
    return 'medium-low: the selected stage changed IR, but no failure or anomaly directly proves root cause.';
  }
  return 'low: the selected stage has no recorded IR change or direct failure evidence.';
}

function renderSelectedStage(stage: AgentStageContext | undefined): string {
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
    `- Duration: ${typeof stage.durationMs === 'number' ? `${stage.durationMs} ms` : 'unknown'}`
  ].join('\n');
}

function isFailedStage(stage: AgentStageContext): boolean {
  return stage.status === 'verifier_failed' ||
    stage.status === 'pass_failed' ||
    String(stage.verifier ?? '').toLowerCase() === 'failed';
}

function fenced(text: string): string {
  return `\`\`\`text\n${text}\n\`\`\``;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function cite(evidenceIds: Array<string | undefined>): string {
  const ids = evidenceIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return ids.length ? `[evidence: ${ids.join(', ')}]` : '';
}

function issueEvidenceIds(issue: TraceIssue): string[] {
  if (typeof issue.stageIndex === 'number' && issue.field) {
    return [stageEvidenceId(issue.stageIndex, issue.field)];
  }
  if (issue.field) {
    return [issue.field];
  }
  return [];
}

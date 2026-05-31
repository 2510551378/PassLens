import type { Metrics, PassTrace, TraceIssue, TraceIssueSeverity, TraceStage } from '../types';

const knownStatuses = new Set(['ok', 'changed', 'verifier_failed', 'pass_failed', 'skipped']);
const largeInlineIrBytes = 512 * 1024;

export function validateTrace(trace: PassTrace): TraceIssue[] {
  const issues: TraceIssue[] = [];

  if (trace.schemaVersion !== 1) {
    issues.push(issue('warning', `Trace schemaVersion ${trace.schemaVersion} is not explicitly supported.`, undefined, 'schemaVersion'));
  }

  if (trace.stages.length === 0) {
    issues.push(issue('error', 'Trace contains no stages.', undefined, 'stages'));
    return issues;
  }

  const seenIndexes = new Set<number>();
  for (const [position, stage] of trace.stages.entries()) {
    validateStage(stage, position, trace.capture?.ir, seenIndexes, issues);
  }

  return issues;
}

export function summarizeTraceIssues(issues: TraceIssue[]): string {
  const errors = issues.filter((entry) => entry.severity === 'error').length;
  const warnings = issues.filter((entry) => entry.severity === 'warning').length;
  const infos = issues.filter((entry) => entry.severity === 'info').length;
  const parts = [];
  if (errors > 0) {
    parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
  }
  if (warnings > 0) {
    parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  }
  if (infos > 0) {
    parts.push(`${infos} info`);
  }
  return parts.length > 0 ? parts.join(', ') : 'no issues';
}

function validateStage(
  stage: TraceStage,
  position: number,
  captureIr: string | undefined,
  seenIndexes: Set<number>,
  issues: TraceIssue[]
): void {
  if (!stage.pass || stage.pass.startsWith('pass-')) {
    issues.push(issue('warning', `Stage ${position} does not provide a stable pass name.`, position, 'pass'));
  }

  if (seenIndexes.has(stage.index)) {
    issues.push(issue('warning', `Duplicate stage index ${stage.index}.`, position, 'index'));
  }
  seenIndexes.add(stage.index);

  if (stage.index !== position) {
    issues.push(issue('info', `Stage index ${stage.index} differs from array position ${position}.`, position, 'index'));
  }

  if (stage.status && !knownStatuses.has(stage.status)) {
    issues.push(issue('warning', `Stage status '${stage.status}' is not a known Pass Lens status.`, position, 'status'));
  }

  if (stage.durationMs !== undefined && stage.durationMs < 0) {
    issues.push(issue('warning', 'Stage duration is negative.', position, 'durationMs'));
  }

  validateMetrics(stage.metricsBefore, 'metricsBefore', position, issues);
  validateMetrics(stage.metricsAfter, 'metricsAfter', position, issues);

  const inlineBytes = byteLength(stage.irBefore ?? '') + byteLength(stage.irAfter ?? '');
  if (inlineBytes > largeInlineIrBytes) {
    issues.push(issue(
      'warning',
      `Stage embeds ${(inlineBytes / (1024 * 1024)).toFixed(1)} MiB of IR. Prefer artifacts.beforePath/afterPath for large traces.`,
      position,
      'irBefore'
    ));
  }

  if (captureIr !== 'omitted' && !stage.irBefore && stage.artifacts?.beforePath === undefined) {
    issues.push(issue('info', 'Stage has no before IR snapshot or before artifact.', position, 'irBefore'));
  }
  if (captureIr !== 'omitted' && !stage.irAfter && stage.artifacts?.afterPath === undefined) {
    issues.push(issue('info', 'Stage has no after IR snapshot or after artifact.', position, 'irAfter'));
  }
}

function validateMetrics(metrics: Metrics | undefined, field: string, stageIndex: number, issues: TraceIssue[]): void {
  if (!metrics) {
    return;
  }
  for (const [key, value] of Object.entries(metrics)) {
    if (!Number.isFinite(value)) {
      issues.push(issue('warning', `Metric '${key}' is not finite.`, stageIndex, field));
    }
    if (value < 0) {
      issues.push(issue('info', `Metric '${key}' is negative.`, stageIndex, field));
    }
  }
}

function issue(severity: TraceIssueSeverity, message: string, stageIndex?: number, field?: string): TraceIssue {
  return { severity, message, stageIndex, field };
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

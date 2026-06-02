import type { PassTrace, TraceStage } from '../types';

export type TraceQualitySeverity = 'error' | 'warning' | 'info';

export interface TraceQualityCheck {
  id: string;
  severity: TraceQualitySeverity;
  message: string;
  stageIndex?: number;
  field?: string;
}

export interface TraceQualityReport {
  score: number;
  summary: string;
  checks: TraceQualityCheck[];
}

const largeInlineIrBytes = 512 * 1024;

export function evaluateTraceQuality(trace: PassTrace): TraceQualityReport {
  const checks: TraceQualityCheck[] = [];
  const seenIndexes = new Set<number>();
  let previousIndex = -Infinity;

  if (!trace.tool) {
    checks.push(check('missing-tool', 'info', 'Trace does not record the producing tool.', undefined, 'tool'));
  }
  if (!trace.collectorVersion) {
    checks.push(check('missing-collector-version', 'info', 'Trace does not record collectorVersion.', undefined, 'collectorVersion'));
  }

  for (const [position, stage] of trace.stages.entries()) {
    checks.push(...evaluateStageQuality(stage, position, seenIndexes, previousIndex, trace.capture?.ir));
    previousIndex = stage.index;
  }

  return {
    score: computeQualityScore(checks),
    summary: summarizeTraceQuality(checks),
    checks
  };
}

export function renderTraceQualityMarkdown(report: TraceQualityReport): string {
  const lines = [
    '# Pass Lens Trace Quality Report',
    '',
    `- Score: ${report.score}/100`,
    `- Summary: ${report.summary}`,
    '',
    '## Checks',
    ''
  ];

  if (!report.checks.length) {
    lines.push('No collector quality issues recorded.');
    return `${lines.join('\n')}\n`;
  }

  for (const entry of report.checks) {
    const stage = typeof entry.stageIndex === 'number' ? ` #${entry.stageIndex}` : '';
    const field = entry.field ? ` ${entry.field}` : '';
    lines.push(`- [${entry.severity}]${stage}${field} ${entry.id}: ${entry.message}`);
  }
  return `${lines.join('\n')}\n`;
}

function evaluateStageQuality(
  stage: TraceStage,
  position: number,
  seenIndexes: Set<number>,
  previousIndex: number,
  captureIr: string | undefined
): TraceQualityCheck[] {
  const checks: TraceQualityCheck[] = [];

  if (!stage.pass || stage.pass.startsWith('pass-')) {
    checks.push(check('missing-pass-identity', 'warning', 'Stage does not provide a stable pass name.', stage.index, 'pass'));
  }
  if (typeof stage.durationMs !== 'number') {
    checks.push(check('missing-timing', 'info', 'Stage does not record durationMs.', stage.index, 'durationMs'));
  }
  if (!stage.verifier && !stage.status) {
    checks.push(check('missing-verifier-status', 'warning', 'Stage records neither verifier nor status.', stage.index, 'verifier'));
  }
  if (seenIndexes.has(stage.index)) {
    checks.push(check('duplicate-stage-index', 'warning', `Stage index ${stage.index} appears more than once.`, stage.index, 'index'));
  }
  if (stage.index < previousIndex) {
    checks.push(check('non-monotonic-stage-index', 'warning', `Stage index ${stage.index} is lower than the previous stage index ${previousIndex}.`, stage.index, 'index'));
  }
  seenIndexes.add(stage.index);

  const inlineBytes = byteLength(stage.irBefore ?? '') + byteLength(stage.irAfter ?? '');
  if (inlineBytes > largeInlineIrBytes && !stage.artifacts?.beforePath && !stage.artifacts?.afterPath) {
    checks.push(check(
      'missing-artifacts-for-large-ir',
      'warning',
      `Stage embeds ${(inlineBytes / (1024 * 1024)).toFixed(1)} MiB of inline IR without artifact paths.`,
      stage.index,
      'artifacts'
    ));
  }
  if (captureIr === 'artifact' && !stage.artifacts?.beforePath && !stage.irBefore) {
    checks.push(check('missing-before-artifact', 'info', 'Artifact capture trace has no before artifact or inline fallback.', stage.index, 'artifacts.beforePath'));
  }
  if (captureIr === 'artifact' && !stage.artifacts?.afterPath && !stage.irAfter) {
    checks.push(check('missing-after-artifact', 'info', 'Artifact capture trace has no after artifact or inline fallback.', stage.index, 'artifacts.afterPath'));
  }

  if (position !== stage.index) {
    checks.push(check('stage-index-position-drift', 'info', `Stage index ${stage.index} differs from array position ${position}.`, stage.index, 'index'));
  }

  return checks;
}

function computeQualityScore(checks: TraceQualityCheck[]): number {
  const penalty = checks.reduce((total, entry) => {
    if (entry.severity === 'error') {
      return total + 35;
    }
    if (entry.severity === 'warning') {
      return total + 12;
    }
    return total + 4;
  }, 0);
  return Math.max(0, 100 - penalty);
}

function summarizeTraceQuality(checks: TraceQualityCheck[]): string {
  const errors = checks.filter((entry) => entry.severity === 'error').length;
  const warnings = checks.filter((entry) => entry.severity === 'warning').length;
  const infos = checks.filter((entry) => entry.severity === 'info').length;
  const parts = [];
  if (errors) {
    parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
  }
  if (warnings) {
    parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  }
  if (infos) {
    parts.push(`${infos} info`);
  }
  return parts.length ? parts.join(', ') : 'no collector quality issues';
}

function check(
  id: string,
  severity: TraceQualitySeverity,
  message: string,
  stageIndex?: number,
  field?: string
): TraceQualityCheck {
  return {
    id,
    severity,
    message,
    stageIndex,
    field
  };
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

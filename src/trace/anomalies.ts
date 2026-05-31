import type { MetricAnomaly, PassTrace, TraceStage } from '../types';

interface AnomalyOptions {
  minAbsoluteDelta: number;
  infoAbsoluteDelta: number;
  warningRelativeDelta: number;
}

const defaultOptions: AnomalyOptions = {
  minAbsoluteDelta: 3,
  infoAbsoluteDelta: 10,
  warningRelativeDelta: 1
};

export function computeTraceAnomalies(trace: PassTrace): MetricAnomaly[] {
  return trace.stages
    .flatMap((stage) => computeStageAnomalies(stage))
    .sort(compareAnomalies);
}

export function computeStageAnomalies(
  stage: TraceStage,
  options: Partial<AnomalyOptions> = {}
): MetricAnomaly[] {
  const resolved = { ...defaultOptions, ...options };
  const before = stage.metricsBefore ?? {};
  const after = stage.metricsAfter ?? {};
  const metrics = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  return metrics
    .map((metric): MetricAnomaly | undefined => {
      const beforeValue = before[metric] ?? 0;
      const afterValue = after[metric] ?? 0;
      const delta = afterValue - beforeValue;
      const absDelta = Math.abs(delta);
      if (absDelta < resolved.minAbsoluteDelta) {
        return undefined;
      }

      const relativeDelta = beforeValue === 0
        ? (afterValue === 0 ? 0 : Number.POSITIVE_INFINITY)
        : absDelta / Math.abs(beforeValue);
      const ratio = beforeValue === 0 ? undefined : afterValue / beforeValue;
      const isWarning = relativeDelta >= resolved.warningRelativeDelta ||
        (beforeValue === 0 && afterValue !== 0);
      if (!isWarning && absDelta < resolved.infoAbsoluteDelta) {
        return undefined;
      }

      const anomaly: MetricAnomaly = {
        severity: isWarning ? 'warning' : 'info',
        stageIndex: stage.index,
        pass: stage.pass,
        metric,
        before: beforeValue,
        after: afterValue,
        delta,
        message: describeAnomaly(metric, beforeValue, afterValue, delta, relativeDelta)
      };
      if (ratio !== undefined) {
        anomaly.ratio = ratio;
      }
      return anomaly;
    })
    .filter((entry): entry is MetricAnomaly => entry !== undefined)
    .sort(compareAnomalies);
}

function describeAnomaly(
  metric: string,
  before: number,
  after: number,
  delta: number,
  relativeDelta: number
): string {
  const direction = delta > 0 ? 'increased' : 'decreased';
  const signedDelta = delta > 0 ? `+${formatNumber(delta)}` : formatNumber(delta);
  if (!Number.isFinite(relativeDelta)) {
    return `${metric} ${direction} from zero to ${formatNumber(after)} (${signedDelta}).`;
  }
  const percentage = Math.round(relativeDelta * 100);
  return `${metric} ${direction} by ${signedDelta} (${percentage}% relative to ${formatNumber(before)}).`;
}

function compareAnomalies(left: MetricAnomaly, right: MetricAnomaly): number {
  const severity = severityRank(right.severity) - severityRank(left.severity);
  if (severity !== 0) {
    return severity;
  }
  return Math.abs(right.delta) - Math.abs(left.delta);
}

function severityRank(severity: MetricAnomaly['severity']): number {
  return severity === 'warning' ? 2 : 1;
}

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

import type { MetricAnomaly, MetricProfile, PassTrace, TraceStage } from '../types';

interface AnomalyOptions {
  minAbsoluteDelta: number;
  infoAbsoluteDelta: number;
  warningRelativeDelta: number;
  metricProfile?: MetricProfile;
}

const defaultOptions: AnomalyOptions = {
  minAbsoluteDelta: 3,
  infoAbsoluteDelta: 10,
  warningRelativeDelta: 1
};

const builtinMetricProfiles: Record<string, MetricProfile> = {
  ascendc: {
    critical: [
      'strict.violations',
      'fallback.count',
      'unproven.tile_size'
    ],
    budgets: {
      'strict.violations': 0,
      'fallback.count': 0,
      'unproven.tile_size': 0,
      'ub.live.slots.max': 4,
      'queue.depth': 4
    }
  }
};

export function computeTraceAnomalies(trace: PassTrace): MetricAnomaly[] {
  const metricProfile = resolveMetricProfile(trace);
  return trace.stages
    .flatMap((stage) => computeStageAnomalies(stage, metricProfile ? { metricProfile } : {}))
    .sort(compareAnomalies);
}

export function computeStageAnomalies(
  stage: TraceStage,
  options: Partial<AnomalyOptions> = {}
): MetricAnomaly[] {
  const resolved = { ...defaultOptions, ...options };
  const criticalMetrics = new Set(resolved.metricProfile?.critical ?? []);
  const budgets = resolved.metricProfile?.budgets ?? {};
  const before = stage.metricsBefore ?? {};
  const after = stage.metricsAfter ?? {};
  const metrics = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  return metrics
    .map((metric): MetricAnomaly | undefined => {
      const beforeValue = before[metric] ?? 0;
      const afterValue = after[metric] ?? 0;
      const delta = afterValue - beforeValue;
      const absDelta = Math.abs(delta);
      const budget = budgets[metric];
      if (budget !== undefined && afterValue > budget) {
        return makeAnomaly({
          kind: 'budget',
          stage,
          metric,
          before: beforeValue,
          after: afterValue,
          delta,
          budget,
          severity: 'warning',
          message: `${metric} is ${formatNumber(afterValue)}, exceeding budget ${formatNumber(budget)}.`
        });
      }

      if (criticalMetrics.has(metric) && afterValue > beforeValue && afterValue > 0) {
        return makeAnomaly({
          kind: 'critical',
          stage,
          metric,
          before: beforeValue,
          after: afterValue,
          delta,
          severity: 'warning',
          message: `${metric} is a critical metric and increased from ${formatNumber(beforeValue)} to ${formatNumber(afterValue)}.`
        });
      }

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

      return makeAnomaly({
        kind: 'delta',
        stage,
        metric,
        before: beforeValue,
        after: afterValue,
        delta,
        ratio,
        severity: isWarning ? 'warning' : 'info',
        message: describeDeltaAnomaly(metric, beforeValue, afterValue, delta, relativeDelta)
      });
    })
    .filter((entry): entry is MetricAnomaly => entry !== undefined)
    .sort(compareAnomalies);
}

function resolveMetricProfile(trace: PassTrace): MetricProfile | undefined {
  const profileName = trace.target?.backend?.toLowerCase();
  const builtin = profileName ? builtinMetricProfiles[profileName] : undefined;
  const custom = profileName
    ? trace.metricProfiles?.[profileName] ?? trace.metricProfiles?.default
    : trace.metricProfiles?.default;
  if (!builtin) {
    return custom;
  }
  if (!custom) {
    return builtin;
  }
  return {
    critical: Array.from(new Set([...(builtin.critical ?? []), ...(custom.critical ?? [])])),
    budgets: {
      ...(builtin.budgets ?? {}),
      ...(custom.budgets ?? {})
    }
  };
}

function makeAnomaly(args: {
  kind: NonNullable<MetricAnomaly['kind']>;
  stage: TraceStage;
  metric: string;
  before: number;
  after: number;
  delta: number;
  severity: MetricAnomaly['severity'];
  message: string;
  ratio?: number;
  budget?: number;
}): MetricAnomaly {
  const anomaly: MetricAnomaly = {
    kind: args.kind,
    severity: args.severity,
    stageIndex: args.stage.index,
    pass: args.stage.pass,
    metric: args.metric,
    before: args.before,
    after: args.after,
    delta: args.delta,
    message: args.message
  };
  if (args.ratio !== undefined) {
    anomaly.ratio = args.ratio;
  }
  if (args.budget !== undefined) {
    anomaly.budget = args.budget;
  }
  return anomaly;
}

function describeDeltaAnomaly(
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

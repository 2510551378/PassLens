import type { PassTrace } from './types';
import type { TraceQuery } from './traceQuery';

export type TraceQueryPlanStatus = 'planned' | 'ambiguous' | 'unsupported';

export interface TraceQueryPlan {
  status: TraceQueryPlanStatus;
  request: string;
  normalizedRequest: string;
  query?: TraceQuery;
  toolId?: string;
  arguments?: Record<string, unknown>;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
  candidates: TraceQueryPlanCandidate[];
}

export interface TraceQueryPlanCandidate {
  query: TraceQuery;
  toolId: string;
  arguments: Record<string, unknown>;
  reason: string;
}

const toolIds: Record<TraceQuery['kind'], string> = {
  firstFailure: 'pass-lens.query.firstFailure',
  firstChanged: 'pass-lens.query.firstChanged',
  firstMetricJump: 'pass-lens.query.firstMetricJump',
  metricBudget: 'pass-lens.query.metricBudget',
  slowest: 'pass-lens.query.slowest',
  search: 'pass-lens.query.search'
};

export function planTraceQueryFromText(request: string, trace?: PassTrace): TraceQueryPlan {
  const normalizedRequest = normalizeRequest(request);
  if (!normalizedRequest) {
    return emptyPlan(request, normalizedRequest);
  }

  const candidates: TraceQueryPlanCandidate[] = [
    ...firstFailureCandidates(normalizedRequest),
    ...firstChangedCandidates(normalizedRequest),
    ...metricBudgetCandidates(normalizedRequest, trace),
    ...metricJumpCandidates(normalizedRequest, trace),
    ...slowestCandidates(normalizedRequest),
    ...searchCandidates(request, normalizedRequest)
  ];

  if (candidates.length === 1) {
    const selected = candidates[0];
    return {
      status: 'planned',
      request,
      normalizedRequest,
      query: selected.query,
      toolId: selected.toolId,
      arguments: selected.arguments,
      confidence: selected.reason.includes('metric inferred') ? 'medium' : 'high',
      rationale: selected.reason,
      candidates
    };
  }

  if (candidates.length > 1) {
    const ranked = rankCandidates(candidates);
    return {
      status: 'ambiguous',
      request,
      normalizedRequest,
      confidence: 'low',
      rationale: 'The request matches multiple deterministic query primitives. Choose one candidate explicitly.',
      candidates: ranked
    };
  }

  return {
    status: 'unsupported',
    request,
    normalizedRequest,
    confidence: 'low',
    rationale: 'No deterministic Pass Lens query primitive matched this request.',
    candidates: []
  };
}

export function traceQueryToToolCall(query: TraceQuery): { toolId: string; arguments: Record<string, unknown> } {
  switch (query.kind) {
    case 'firstFailure':
    case 'firstChanged':
      return {
        toolId: toolIds[query.kind],
        arguments: {}
      };
    case 'firstMetricJump':
      return {
        toolId: toolIds.firstMetricJump,
        arguments: {
          metric: query.metric
        }
      };
    case 'metricBudget':
      return {
        toolId: toolIds.metricBudget,
        arguments: {
          metric: query.metric,
          budget: query.budget
        }
      };
    case 'slowest':
      return {
        toolId: toolIds.slowest,
        arguments: {
          count: query.count
        }
      };
    case 'search':
      return {
        toolId: toolIds.search,
        arguments: {
          text: query.text
        }
      };
  }
}

function emptyPlan(request: string, normalizedRequest: string): TraceQueryPlan {
  return {
    status: 'unsupported',
    request,
    normalizedRequest,
    confidence: 'low',
    rationale: 'Empty request.',
    candidates: []
  };
}

function firstFailureCandidates(normalizedRequest: string): TraceQueryPlanCandidate[] {
  if (!containsAny(normalizedRequest, [
    'first failure',
    'first failing',
    'first failed',
    'first verifier',
    'verifier failure',
    'where fail',
    'where failed',
    'where does it fail',
    '第一个失败',
    '首次失败',
    '哪里失败',
    '在哪失败',
    '验证失败',
    'verifier失败'
  ])) {
    return [];
  }
  return [candidate({ kind: 'firstFailure' }, 'request asks for the first failed or verifier-failed stage')];
}

function firstChangedCandidates(normalizedRequest: string): TraceQueryPlanCandidate[] {
  if (!containsAny(normalizedRequest, [
    'first changed',
    'first change',
    'first mutation',
    'first transform',
    '第一个改变',
    '首次改变',
    '第一次变化',
    '最早改变'
  ])) {
    return [];
  }
  return [candidate({ kind: 'firstChanged' }, 'request asks for the first changed stage')];
}

function metricBudgetCandidates(normalizedRequest: string, trace?: PassTrace): TraceQueryPlanCandidate[] {
  if (!containsAny(normalizedRequest, [
    'budget',
    'over budget',
    'exceed',
    'exceeds',
    'greater than',
    'above',
    '>',
    '超过',
    '超出',
    '大于',
    '预算'
  ])) {
    return [];
  }
  const budget = extractNumber(normalizedRequest);
  const metric = extractMetric(normalizedRequest, trace);
  if (!metric || typeof budget !== 'number') {
    return [];
  }
  return [candidate({ kind: 'metricBudget', metric, budget }, 'request names a metric and numeric budget threshold')];
}

function metricJumpCandidates(normalizedRequest: string, trace?: PassTrace): TraceQueryPlanCandidate[] {
  if (!containsAny(normalizedRequest, [
    'metric jump',
    'metric change',
    'jump',
    'increase',
    'changes from',
    'changed from',
    '突增',
    '变化',
    '增长',
    '跳变',
    '指标'
  ])) {
    return [];
  }
  const metric = extractMetric(normalizedRequest, trace);
  if (!metric) {
    return [];
  }
  const reason = normalizedRequest.includes(metric.toLowerCase())
    ? 'request names a metric jump'
    : 'request asks for a metric jump; metric inferred from trace metric names';
  return [candidate({ kind: 'firstMetricJump', metric }, reason)];
}

function slowestCandidates(normalizedRequest: string): TraceQueryPlanCandidate[] {
  if (!containsAny(normalizedRequest, [
    'slowest',
    'slow passes',
    'longest',
    'duration',
    'latency',
    '耗时',
    '最慢',
    '慢的',
    '时间'
  ])) {
    return [];
  }
  return [candidate({ kind: 'slowest', count: extractCount(normalizedRequest) }, 'request asks for timed stages sorted by duration')];
}

function searchCandidates(request: string, normalizedRequest: string): TraceQueryPlanCandidate[] {
  const searchPrefix = /^(search|find text|grep|look for|查找|搜索|检索)\s+(.+)$/i;
  const match = request.trim().match(searchPrefix);
  if (!match || containsAny(normalizedRequest, ['first', '第一个', '首次', 'slowest', '最慢', 'budget', '预算'])) {
    return [];
  }
  const text = match[2].trim();
  if (!text) {
    return [];
  }
  return [candidate({ kind: 'search', text }, 'request explicitly asks to search trace text')];
}

function candidate(query: TraceQuery, reason: string): TraceQueryPlanCandidate {
  const call = traceQueryToToolCall(query);
  return {
    query,
    toolId: call.toolId,
    arguments: call.arguments,
    reason
  };
}

function rankCandidates(candidates: TraceQueryPlanCandidate[]): TraceQueryPlanCandidate[] {
  return [...candidates].sort((left, right) => priorityOf(left.query.kind) - priorityOf(right.query.kind));
}

function priorityOf(kind: TraceQuery['kind']): number {
  switch (kind) {
    case 'firstFailure':
      return 0;
    case 'metricBudget':
      return 1;
    case 'firstMetricJump':
      return 2;
    case 'firstChanged':
      return 3;
    case 'slowest':
      return 4;
    case 'search':
      return 5;
  }
}

function extractMetric(normalizedRequest: string, trace?: PassTrace): string | undefined {
  const metrics = collectMetricNames(trace).sort((left, right) => right.length - left.length);
  for (const metric of metrics) {
    if (normalizedRequest.includes(metric.toLowerCase())) {
      return metric;
    }
  }

  const quoted = normalizedRequest.match(/["'`](.+?)["'`]/)?.[1]?.trim();
  if (quoted) {
    return quoted;
  }

  const metricAfterKeyword = normalizedRequest.match(/\bmetric\s+([a-z0-9_.:-]+)\b/);
  if (metricAfterKeyword && !isReservedMetricToken(metricAfterKeyword[1])) {
    return metricAfterKeyword[1];
  }
  const compactMetric = normalizedRequest.match(/\b([a-z][a-z0-9_.:-]*\.[a-z0-9_.:-]+)\b/);
  if (compactMetric) {
    return compactMetric[1];
  }
  const camelMetric = normalizedRequest.match(/\b([a-z]+[a-z0-9]*[A-Z][A-Za-z0-9]*)\b/);
  if (camelMetric) {
    return camelMetric[1];
  }
  return undefined;
}

function isReservedMetricToken(token: string): boolean {
  return [
    'jump',
    'jumps',
    'change',
    'changes',
    'changed',
    'budget',
    'threshold',
    'increase',
    'increases'
  ].includes(token);
}

function collectMetricNames(trace?: PassTrace): string[] {
  const metrics = new Set<string>();
  for (const stage of trace?.stages ?? []) {
    for (const metric of Object.keys(stage.metricsBefore ?? {})) {
      metrics.add(metric);
    }
    for (const metric of Object.keys(stage.metricsAfter ?? {})) {
      metrics.add(metric);
    }
  }
  return [...metrics];
}

function extractNumber(normalizedRequest: string): number | undefined {
  const match = normalizedRequest.match(/(?:>|budget|exceeds?|above|greater than|超过|超出|大于|预算)\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!match) {
    return undefined;
  }
  return Number(match[1]);
}

function extractCount(normalizedRequest: string): number {
  const topMatch = normalizedRequest.match(/\btop\s+([0-9]+)\b/);
  if (topMatch) {
    return Math.max(1, Number(topMatch[1]));
  }
  const countMatch = normalizedRequest.match(/\b([0-9]+)\s+(?:slowest|slow|passes|stages)\b/);
  if (countMatch) {
    return Math.max(1, Number(countMatch[1]));
  }
  return 5;
}

function normalizeRequest(request: string): string {
  return request.trim().replace(/\s+/g, ' ').toLowerCase();
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle.toLowerCase()));
}

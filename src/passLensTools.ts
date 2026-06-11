import type { TraceQuery } from './traceQuery';

export const PASS_LENS_TOOL_IDS = {
  query: {
    planNaturalLanguage: 'pass-lens.query.planNaturalLanguage',
    firstFailure: 'pass-lens.query.firstFailure',
    firstChanged: 'pass-lens.query.firstChanged',
    firstMetricJump: 'pass-lens.query.firstMetricJump',
    metricBudget: 'pass-lens.query.metricBudget',
    slowest: 'pass-lens.query.slowest',
    search: 'pass-lens.query.search'
  },
  report: {
    githubIssue: 'pass-lens.report.githubIssue',
    topSuspicious: 'pass-lens.report.topSuspicious',
    firstSignal: 'pass-lens.report.firstSignal',
    candidateRootCauses: 'pass-lens.report.candidateRootCauses',
    firstFailureLocalization: 'pass-lens.report.firstFailureLocalization',
    traceQuality: 'pass-lens.report.traceQuality',
    traceSize: 'pass-lens.report.traceSize'
  },
  export: {
    agentContext: 'pass-lens.export.agentContext',
    reproBundle: 'pass-lens.export.reproBundle',
    directoryReproBundle: 'pass-lens.export.directoryReproBundle'
  },
  rerun: {
    prefixBisect: 'pass-lens.rerun.prefixBisect'
  }
} as const;

export type TraceQueryKind = TraceQuery['kind'];

export type TraceSummaryKind =
  | 'githubIssue'
  | 'topSuspicious'
  | 'firstSignal'
  | 'candidateRootCauses'
  | 'firstFailureLocalization'
  | 'traceQuality'
  | 'traceSize';

export interface QueryPickerItem {
  label: string;
  detail: string;
  id: string;
  queryKind?: TraceQueryKind;
  summaryKind?: TraceSummaryKind;
}

export const PASS_LENS_QUERY_PICKERS: readonly QueryPickerItem[] = [
  {
    id: PASS_LENS_TOOL_IDS.query.firstFailure,
    label: 'Find first failure stage',
    detail: 'First failed status or verifier failure.',
    queryKind: 'firstFailure'
  },
  {
    id: PASS_LENS_TOOL_IDS.query.firstChanged,
    label: 'Find first changed stage',
    detail: 'First stage with changed=true.',
    queryKind: 'firstChanged'
  },
  {
    id: PASS_LENS_TOOL_IDS.query.firstMetricJump,
    label: 'Find first metric jump',
    detail: 'Ask for a metric name such as fallback.count.',
    queryKind: 'firstMetricJump'
  },
  {
    id: PASS_LENS_TOOL_IDS.query.metricBudget,
    label: 'Find stages over a metric budget',
    detail: 'Ask for a metric name and numeric budget.',
    queryKind: 'metricBudget'
  },
  {
    id: PASS_LENS_TOOL_IDS.query.slowest,
    label: 'List slowest passes',
    detail: 'Ask for N and sort timed stages by duration.',
    queryKind: 'slowest'
  },
  {
    id: PASS_LENS_TOOL_IDS.query.search,
    label: 'Search trace text',
    detail: 'Search pass names, scopes, diagnostics, and IR text.',
    queryKind: 'search'
  },
  {
    id: PASS_LENS_TOOL_IDS.report.githubIssue,
    label: 'Generate GitHub issue description',
    detail: 'Create a trace-grounded issue draft with evidence and guardrails.',
    summaryKind: 'githubIssue'
  },
  {
    id: PASS_LENS_TOOL_IDS.report.topSuspicious,
    label: 'Summarize top 3 suspicious passes',
    detail: 'Rank suspicious pass candidates by failures, anomalies, diagnostics, and validation issues.',
    summaryKind: 'topSuspicious'
  },
  {
    id: PASS_LENS_TOOL_IDS.report.candidateRootCauses,
    label: 'Generate candidate root causes',
    detail: 'Frame candidates with evidence, uncertainty, and next experiments before patch suggestions.',
    summaryKind: 'candidateRootCauses'
  },
  {
    id: PASS_LENS_TOOL_IDS.report.firstFailureLocalization,
    label: 'Generate first failure localization report',
    detail: 'Get a bounded localization hypothesis with confidence and next checks.',
    summaryKind: 'firstFailureLocalization'
  },
  {
    id: PASS_LENS_TOOL_IDS.report.firstSignal,
    label: 'Explain first fallback / legality / budget signal',
    detail: 'Choose a signal family and generate a concise evidence summary.',
    summaryKind: 'firstSignal'
  },
  {
    id: PASS_LENS_TOOL_IDS.report.traceQuality,
    label: 'Generate trace quality report',
    detail: 'Check collector credibility: pass identity, timing, verifier, artifacts, and indexes.',
    summaryKind: 'traceQuality'
  },
  {
    id: PASS_LENS_TOOL_IDS.report.traceSize,
    label: 'Generate trace size report',
    detail: 'Summarize inline IR, artifacts, diagnostics, and stage-count payload size.',
    summaryKind: 'traceSize'
  }
] as const;

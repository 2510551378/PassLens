export type Metrics = Record<string, number>;

export interface CompilerInfo {
  name?: string;
  version?: string;
  gitSha?: string;
}

export interface TargetInfo {
  backend?: string;
  platform?: string;
  triple?: string;
}

export interface StageArtifacts {
  beforePath?: string;
  afterPath?: string;
  diagnosticsPath?: string;
}

export interface TraceStage {
  index: number;
  pass: string;
  argument?: string;
  opName?: string;
  symbol?: string;
  nestingDepth?: number;
  scope?: string;
  changed: boolean;
  status?: string;
  durationMs?: number;
  verifier?: string;
  diagnostics?: string;
  location?: string;
  artifacts?: StageArtifacts;
  metricsBefore?: Metrics;
  metricsAfter?: Metrics;
  irBefore?: string;
  irAfter?: string;
}

export interface PassTrace {
  schemaVersion: number;
  collectorVersion?: string;
  compiler?: CompilerInfo;
  target?: TargetInfo;
  inputHash?: string;
  tool?: string;
  input?: string;
  pipeline?: string;
  command?: string;
  exitCode?: number;
  diagnostics?: string;
  stages: TraceStage[];
}

export type TraceIssueSeverity = 'error' | 'warning' | 'info';

export interface TraceIssue {
  severity: TraceIssueSeverity;
  message: string;
  stageIndex?: number;
  field?: string;
}

export type MetricAnomalySeverity = 'warning' | 'info';

export interface MetricAnomaly {
  severity: MetricAnomalySeverity;
  stageIndex: number;
  pass: string;
  metric: string;
  before: number;
  after: number;
  delta: number;
  ratio?: number;
  message: string;
}

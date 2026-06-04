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

export interface CaptureInfo {
  ir?: 'inline' | 'artifact' | 'omitted';
  metrics?: boolean;
  timing?: boolean;
}

export type TraceProvenanceKind =
  | 'live-pass-instrumentation'
  | 'converted-dump'
  | 'hand-authored'
  | 'real-artifact-capture';

export interface TraceProvenance {
  kind?: TraceProvenanceKind;
  description?: string;
  source?: string;
  generatedBy?: string;
  capturedAt?: string;
}

export interface MetricProfile {
  critical?: string[];
  budgets?: Record<string, number>;
}

export type MetricProfiles = Record<string, MetricProfile>;

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
  provenance?: TraceProvenance;
  inputHash?: string;
  capture?: CaptureInfo;
  metricProfiles?: MetricProfiles;
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
  kind?: 'delta' | 'budget' | 'critical';
  stageIndex: number;
  pass: string;
  metric: string;
  before: number;
  after: number;
  delta: number;
  ratio?: number;
  budget?: number;
  message: string;
}

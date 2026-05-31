export type Metrics = Record<string, number>;

export interface TraceStage {
  index: number;
  pass: string;
  scope?: string;
  changed: boolean;
  durationMs?: number;
  verifier?: string;
  metricsBefore?: Metrics;
  metricsAfter?: Metrics;
  irBefore?: string;
  irAfter?: string;
}

export interface PassTrace {
  schemaVersion: number;
  tool?: string;
  input?: string;
  pipeline?: string;
  command?: string;
  exitCode?: number;
  diagnostics?: string;
  stages: TraceStage[];
}

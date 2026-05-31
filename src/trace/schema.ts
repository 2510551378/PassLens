import type {
  CaptureInfo,
  CompilerInfo,
  MetricProfile,
  MetricProfiles,
  Metrics,
  PassTrace,
  StageArtifacts,
  TargetInfo,
  TraceStage
} from '../types';

export function normalizeTrace(raw: unknown): PassTrace {
  if (!isRecord(raw)) {
    throw new Error('Trace root must be a JSON object.');
  }
  if (!Array.isArray(raw.stages)) {
    throw new Error('Trace must contain a stages array.');
  }

  return {
    schemaVersion: readNumber(raw.schemaVersion, 1),
    collectorVersion: readString(raw.collectorVersion),
    compiler: readCompilerInfo(raw.compiler),
    target: readTargetInfo(raw.target),
    inputHash: readString(raw.inputHash),
    capture: readCaptureInfo(raw.capture),
    metricProfiles: readMetricProfiles(raw.metricProfiles),
    tool: readString(raw.tool),
    input: readString(raw.input),
    pipeline: readString(raw.pipeline),
    command: readString(raw.command),
    exitCode: readOptionalNumber(raw.exitCode),
    diagnostics: readString(raw.diagnostics),
    stages: raw.stages.map((stage, index) => normalizeStage(stage, index))
  };
}

export function normalizeStage(raw: unknown, fallbackIndex: number): TraceStage {
  if (!isRecord(raw)) {
    throw new Error(`Stage ${fallbackIndex} must be a JSON object.`);
  }

  const irBefore = readString(raw.irBefore) ?? '';
  const irAfter = readString(raw.irAfter) ?? '';
  const verifier = readString(raw.verifier);
  const status = readString(raw.status) ?? inferStatus(raw.changed, verifier, irBefore, irAfter);

  return {
    index: readNumber(raw.index, fallbackIndex),
    pass: readString(raw.pass) ?? `pass-${fallbackIndex}`,
    argument: readString(raw.argument),
    opName: readString(raw.opName),
    symbol: readString(raw.symbol),
    nestingDepth: readOptionalNumber(raw.nestingDepth),
    scope: readString(raw.scope),
    changed: typeof raw.changed === 'boolean' ? raw.changed : irBefore !== irAfter,
    status,
    durationMs: readOptionalNumber(raw.durationMs),
    verifier,
    diagnostics: readString(raw.diagnostics),
    location: readString(raw.location),
    artifacts: readArtifacts(raw.artifacts),
    metricsBefore: readMetrics(raw.metricsBefore),
    metricsAfter: readMetrics(raw.metricsAfter),
    irBefore,
    irAfter
  };
}

export function firstSignalIndex(trace: Pick<PassTrace, 'stages'>): number {
  const failedIndex = trace.stages.findIndex((stage) =>
    stage.status === 'verifier_failed' ||
    stage.status === 'pass_failed' ||
    String(stage.verifier ?? '').toLowerCase() === 'failed'
  );
  if (failedIndex >= 0) {
    return failedIndex;
  }
  return trace.stages.findIndex((stage) => stage.changed);
}

export function initialSelectedIndex(trace: Pick<PassTrace, 'stages'>): number {
  const firstSignal = firstSignalIndex(trace);
  return firstSignal >= 0 ? firstSignal : 0;
}

function inferStatus(changedRaw: unknown, verifier: string | undefined, irBefore: string, irAfter: string): string {
  if (String(verifier ?? '').toLowerCase() === 'failed') {
    return 'verifier_failed';
  }
  const changed = typeof changedRaw === 'boolean' ? changedRaw : irBefore !== irAfter;
  return changed ? 'changed' : 'ok';
}

function readMetrics(raw: unknown): Metrics | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const metrics: Metrics = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      metrics[key] = value;
    }
  }
  return metrics;
}

function readCompilerInfo(raw: unknown): CompilerInfo | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  return compactObject({
    name: readString(raw.name),
    version: readString(raw.version),
    gitSha: readString(raw.gitSha)
  });
}

function readTargetInfo(raw: unknown): TargetInfo | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  return compactObject({
    backend: readString(raw.backend),
    platform: readString(raw.platform),
    triple: readString(raw.triple)
  });
}

function readCaptureInfo(raw: unknown): CaptureInfo | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const ir = readString(raw.ir);
  const capture: CaptureInfo = {};
  if (ir === 'inline' || ir === 'artifact' || ir === 'omitted') {
    capture.ir = ir;
  }
  if (typeof raw.metrics === 'boolean') {
    capture.metrics = raw.metrics;
  }
  if (typeof raw.timing === 'boolean') {
    capture.timing = raw.timing;
  }
  return Object.keys(capture).length > 0 ? capture : undefined;
}

function readMetricProfiles(raw: unknown): MetricProfiles | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const profiles: MetricProfiles = {};
  for (const [name, value] of Object.entries(raw)) {
    const profile = readMetricProfile(value);
    if (profile) {
      profiles[name] = profile;
    }
  }
  return Object.keys(profiles).length > 0 ? profiles : undefined;
}

function readMetricProfile(raw: unknown): MetricProfile | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const critical = Array.isArray(raw.critical)
    ? raw.critical.filter((entry): entry is string => typeof entry === 'string')
    : undefined;
  const budgets = readMetrics(raw.budgets);
  const profile: MetricProfile = {};
  if (critical && critical.length > 0) {
    profile.critical = critical;
  }
  if (budgets && Object.keys(budgets).length > 0) {
    profile.budgets = budgets;
  }
  return Object.keys(profile).length > 0 ? profile : undefined;
}

function readArtifacts(raw: unknown): StageArtifacts | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  return compactObject({
    beforePath: readString(raw.beforePath),
    afterPath: readString(raw.afterPath),
    diagnosticsPath: readString(raw.diagnosticsPath)
  });
}

function compactObject<T extends Record<string, unknown>>(object: T): T | undefined {
  const entries = Object.entries(object).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries) as T;
}

function readString(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw : undefined;
}

function readNumber(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
}

function readOptionalNumber(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

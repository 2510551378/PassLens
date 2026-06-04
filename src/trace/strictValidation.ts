import type { TraceIssue } from '../types';

const knownStatuses = new Set(['ok', 'changed', 'verifier_failed', 'pass_failed', 'skipped']);
const captureModes = new Set(['inline', 'artifact', 'omitted']);
const provenanceKinds = new Set(['live-pass-instrumentation', 'converted-dump', 'hand-authored', 'real-artifact-capture']);

export function validateTraceStrict(raw: unknown): TraceIssue[] {
  const issues: TraceIssue[] = [];
  if (!isRecord(raw)) {
    return [strictIssue('$', 'Trace root must be a JSON object.')];
  }

  requireExactNumber(raw, 'schemaVersion', '$.schemaVersion', 1, issues);
  validateOptionalObject(raw.compiler, '$.compiler', issues, validateCompilerInfo);
  validateOptionalObject(raw.target, '$.target', issues, validateTargetInfo);
  validateOptionalObject(raw.provenance, '$.provenance', issues, validateTraceProvenance);
  validateOptionalObject(raw.capture, '$.capture', issues, validateCaptureInfo);
  validateMetricProfiles(raw.metricProfiles, '$.metricProfiles', issues);
  validateOptionalString(raw.collectorVersion, '$.collectorVersion', issues);
  validateOptionalString(raw.inputHash, '$.inputHash', issues);
  validateOptionalString(raw.tool, '$.tool', issues);
  validateOptionalString(raw.input, '$.input', issues);
  validateOptionalString(raw.pipeline, '$.pipeline', issues);
  validateOptionalString(raw.command, '$.command', issues);
  validateOptionalNumber(raw.exitCode, '$.exitCode', issues);
  validateOptionalString(raw.diagnostics, '$.diagnostics', issues);
  validateAllowedProperties(raw, '$', [
    'schemaVersion',
    'collectorVersion',
    'compiler',
    'target',
    'provenance',
    'inputHash',
    'capture',
    'metricProfiles',
    'tool',
    'input',
    'pipeline',
    'command',
    'exitCode',
    'diagnostics',
    'stages'
  ], issues);

  if (!Array.isArray(raw.stages)) {
    issues.push(strictIssue('$.stages', 'Trace must contain a stages array.'));
    return issues;
  }

  raw.stages.forEach((stage, index) => {
    validateStage(stage, index, issues);
  });
  return issues;
}

export function assertTraceStrict(raw: unknown): void {
  const issues = validateTraceStrict(raw);
  if (issues.length > 0) {
    throw new Error(issues.map((entry) => `${entry.field}: ${entry.message}`).join('\n'));
  }
}

function validateStage(raw: unknown, index: number, issues: TraceIssue[]): void {
  const path = `$.stages[${index}]`;
  if (!isRecord(raw)) {
    issues.push(strictIssue(path, 'Stage must be a JSON object.', index));
    return;
  }

  validateAllowedProperties(raw, path, [
    'index',
    'pass',
    'argument',
    'opName',
    'symbol',
    'nestingDepth',
    'scope',
    'changed',
    'status',
    'durationMs',
    'verifier',
    'diagnostics',
    'location',
    'artifacts',
    'metricsBefore',
    'metricsAfter',
    'irBefore',
    'irAfter'
  ], issues, index);
  validateRequiredNumber(raw.index, `${path}.index`, issues, index);
  validateRequiredString(raw.pass, `${path}.pass`, issues, index);
  validateOptionalString(raw.argument, `${path}.argument`, issues, index);
  validateOptionalString(raw.opName, `${path}.opName`, issues, index);
  validateOptionalString(raw.symbol, `${path}.symbol`, issues, index);
  validateOptionalNumber(raw.nestingDepth, `${path}.nestingDepth`, issues, index);
  validateOptionalString(raw.scope, `${path}.scope`, issues, index);
  validateOptionalBoolean(raw.changed, `${path}.changed`, issues, index);
  validateOptionalString(raw.verifier, `${path}.verifier`, issues, index);
  validateOptionalString(raw.diagnostics, `${path}.diagnostics`, issues, index);
  validateOptionalString(raw.location, `${path}.location`, issues, index);
  validateOptionalString(raw.irBefore, `${path}.irBefore`, issues, index);
  validateOptionalString(raw.irAfter, `${path}.irAfter`, issues, index);
  validateMetrics(raw.metricsBefore, `${path}.metricsBefore`, issues, index);
  validateMetrics(raw.metricsAfter, `${path}.metricsAfter`, issues, index);
  validateArtifacts(raw.artifacts, `${path}.artifacts`, issues, index);

  if (raw.status !== undefined) {
    if (typeof raw.status !== 'string') {
      issues.push(strictIssue(`${path}.status`, 'status must be a string.', index));
    } else if (!knownStatuses.has(raw.status)) {
      issues.push(strictIssue(`${path}.status`, `status must be one of ${Array.from(knownStatuses).join(', ')}.`, index));
    }
  }
  if (typeof raw.durationMs === 'number' && raw.durationMs < 0) {
    issues.push(strictIssue(`${path}.durationMs`, 'durationMs must be non-negative.', index));
  }
}

function validateCompilerInfo(raw: Record<string, unknown>, path: string, issues: TraceIssue[]): void {
  validateAllowedProperties(raw, path, ['name', 'version', 'gitSha'], issues);
  validateOptionalString(raw.name, `${path}.name`, issues);
  validateOptionalString(raw.version, `${path}.version`, issues);
  validateOptionalString(raw.gitSha, `${path}.gitSha`, issues);
}

function validateTargetInfo(raw: Record<string, unknown>, path: string, issues: TraceIssue[]): void {
  validateAllowedProperties(raw, path, ['backend', 'platform', 'triple'], issues);
  validateOptionalString(raw.backend, `${path}.backend`, issues);
  validateOptionalString(raw.platform, `${path}.platform`, issues);
  validateOptionalString(raw.triple, `${path}.triple`, issues);
}

function validateTraceProvenance(raw: Record<string, unknown>, path: string, issues: TraceIssue[]): void {
  validateAllowedProperties(raw, path, ['kind', 'description', 'source', 'generatedBy', 'capturedAt'], issues);
  validateOptionalString(raw.description, `${path}.description`, issues);
  validateOptionalString(raw.source, `${path}.source`, issues);
  validateOptionalString(raw.generatedBy, `${path}.generatedBy`, issues);
  validateOptionalString(raw.capturedAt, `${path}.capturedAt`, issues);
  if (raw.kind !== undefined) {
    if (typeof raw.kind !== 'string') {
      issues.push(strictIssue(`${path}.kind`, 'provenance.kind must be a string.'));
    } else if (!provenanceKinds.has(raw.kind)) {
      issues.push(strictIssue(`${path}.kind`, `provenance.kind must be one of ${Array.from(provenanceKinds).join(', ')}.`));
    }
  }
}

function validateCaptureInfo(raw: Record<string, unknown>, path: string, issues: TraceIssue[]): void {
  validateAllowedProperties(raw, path, ['ir', 'metrics', 'timing'], issues);
  validateOptionalBoolean(raw.metrics, `${path}.metrics`, issues);
  validateOptionalBoolean(raw.timing, `${path}.timing`, issues);
  if (raw.ir !== undefined) {
    if (typeof raw.ir !== 'string') {
      issues.push(strictIssue(`${path}.ir`, 'capture.ir must be a string.'));
    } else if (!captureModes.has(raw.ir)) {
      issues.push(strictIssue(`${path}.ir`, 'capture.ir must be inline, artifact, or omitted.'));
    }
  }
}

function validateMetricProfiles(raw: unknown, path: string, issues: TraceIssue[]): void {
  if (raw === undefined) {
    return;
  }
  if (!isRecord(raw)) {
    issues.push(strictIssue(path, 'metricProfiles must be an object.'));
    return;
  }
  for (const [name, profile] of Object.entries(raw)) {
    validateOptionalObject(profile, `${path}.${quotePath(name)}`, issues, (value, profilePath, profileIssues) => {
      validateAllowedProperties(value, profilePath, ['critical', 'budgets'], profileIssues);
      if (value.critical !== undefined) {
        validateStringArray(value.critical, `${profilePath}.critical`, profileIssues);
      }
      validateMetrics(value.budgets, `${profilePath}.budgets`, profileIssues);
    });
  }
}

function validateArtifacts(raw: unknown, path: string, issues: TraceIssue[], stageIndex: number): void {
  if (raw === undefined) {
    return;
  }
  if (!isRecord(raw)) {
    issues.push(strictIssue(path, 'artifacts must be an object.', stageIndex));
    return;
  }
  validateAllowedProperties(raw, path, ['beforePath', 'afterPath', 'diagnosticsPath'], issues, stageIndex);
  validateOptionalString(raw.beforePath, `${path}.beforePath`, issues, stageIndex);
  validateOptionalString(raw.afterPath, `${path}.afterPath`, issues, stageIndex);
  validateOptionalString(raw.diagnosticsPath, `${path}.diagnosticsPath`, issues, stageIndex);
}

function validateMetrics(raw: unknown, path: string, issues: TraceIssue[], stageIndex?: number): void {
  if (raw === undefined) {
    return;
  }
  if (!isRecord(raw)) {
    issues.push(strictIssue(path, 'metrics must be an object.', stageIndex));
    return;
  }
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.push(strictIssue(`${path}.${quotePath(name)}`, 'metric values must be finite numbers.', stageIndex));
    }
  }
}

function validateRequiredString(raw: unknown, path: string, issues: TraceIssue[], stageIndex?: number): void {
  if (typeof raw !== 'string' || raw.length === 0) {
    issues.push(strictIssue(path, 'field is required and must be a non-empty string.', stageIndex));
  }
}

function validateRequiredNumber(raw: unknown, path: string, issues: TraceIssue[], stageIndex?: number): void {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    issues.push(strictIssue(path, 'field is required and must be a finite number.', stageIndex));
  }
}

function requireExactNumber(
  raw: Record<string, unknown>,
  key: string,
  path: string,
  expected: number,
  issues: TraceIssue[]
): void {
  if (raw[key] !== expected) {
    issues.push(strictIssue(path, `field is required and must be ${expected}.`));
  }
}

function validateOptionalObject(
  raw: unknown,
  path: string,
  issues: TraceIssue[],
  validate: (value: Record<string, unknown>, path: string, issues: TraceIssue[]) => void
): void {
  if (raw === undefined) {
    return;
  }
  if (!isRecord(raw)) {
    issues.push(strictIssue(path, 'field must be an object.'));
    return;
  }
  validate(raw, path, issues);
}

function validateOptionalString(raw: unknown, path: string, issues: TraceIssue[], stageIndex?: number): void {
  if (raw !== undefined && typeof raw !== 'string') {
    issues.push(strictIssue(path, 'field must be a string.', stageIndex));
  }
}

function validateOptionalNumber(raw: unknown, path: string, issues: TraceIssue[], stageIndex?: number): void {
  if (raw !== undefined && (typeof raw !== 'number' || !Number.isFinite(raw))) {
    issues.push(strictIssue(path, 'field must be a finite number.', stageIndex));
  }
}

function validateOptionalBoolean(raw: unknown, path: string, issues: TraceIssue[], stageIndex?: number): void {
  if (raw !== undefined && typeof raw !== 'boolean') {
    issues.push(strictIssue(path, 'field must be a boolean.', stageIndex));
  }
}

function validateStringArray(raw: unknown, path: string, issues: TraceIssue[]): void {
  if (!Array.isArray(raw)) {
    issues.push(strictIssue(path, 'field must be an array of strings.'));
    return;
  }
  raw.forEach((entry, index) => {
    if (typeof entry !== 'string') {
      issues.push(strictIssue(`${path}[${index}]`, 'array entry must be a string.'));
    }
  });
}

function validateAllowedProperties(
  raw: Record<string, unknown>,
  path: string,
  allowed: string[],
  issues: TraceIssue[],
  stageIndex?: number
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(raw)) {
    if (!allowedSet.has(key)) {
      issues.push(strictIssue(`${path}.${quotePath(key)}`, 'unknown field is not part of trace schema v1.', stageIndex));
    }
  }
}

function strictIssue(field: string, message: string, stageIndex?: number): TraceIssue {
  return {
    severity: 'error',
    message,
    stageIndex,
    field
  };
}

function quotePath(key: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(key) ? key : JSON.stringify(key);
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

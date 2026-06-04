import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PassTrace, TraceIssue, TraceStage } from '../types';

const defaultMaxArtifactBytes = 4 * 1024 * 1024;

interface HydrateTraceArtifactsOptions {
  maxArtifactBytes?: number;
}

export async function hydrateTraceArtifacts(
  trace: PassTrace,
  tracePath: string,
  options: HydrateTraceArtifactsOptions = {}
): Promise<TraceIssue[]> {
  const issues: TraceIssue[] = [];
  const baseDir = path.dirname(tracePath);
  const maxArtifactBytes = options.maxArtifactBytes ?? defaultMaxArtifactBytes;

  await Promise.all(trace.stages.map(async (stage) => {
    const hydrated = await hydrateStageArtifact(stage, baseDir, maxArtifactBytes, issues);
    if (hydrated && stage.irBefore && stage.irAfter) {
      const changed = stage.irBefore !== stage.irAfter;
      stage.changed = changed;
      if (changed && stage.status === 'ok') {
        stage.status = 'changed';
      } else if (!changed && stage.status === 'changed') {
        stage.status = 'ok';
      }
    }
  }));

  return issues;
}

export async function hydrateTraceStageArtifacts(
  trace: PassTrace,
  tracePath: string,
  stageIndex: number,
  options: HydrateTraceArtifactsOptions = {}
): Promise<TraceIssue[]> {
  const issues: TraceIssue[] = [];
  const stage = trace.stages.find((entry) => entry.index === stageIndex);
  if (!stage) {
    return [{
      severity: 'warning',
      stageIndex,
      field: 'stages',
      message: `Could not hydrate artifacts for missing stage #${stageIndex}.`
    }];
  }

  const hydrated = await hydrateStageArtifact(
    stage,
    path.dirname(tracePath),
    options.maxArtifactBytes ?? defaultMaxArtifactBytes,
    issues
  );
  if (hydrated && stage.irBefore && stage.irAfter) {
    const changed = stage.irBefore !== stage.irAfter;
    stage.changed = changed;
    if (changed && stage.status === 'ok') {
      stage.status = 'changed';
    } else if (!changed && stage.status === 'changed') {
      stage.status = 'ok';
    }
  }
  return issues;
}

async function hydrateStageArtifact(
  stage: TraceStage,
  baseDir: string,
  maxArtifactBytes: number,
  issues: TraceIssue[]
): Promise<boolean> {
  const artifacts = stage.artifacts;
  if (!artifacts) {
    return false;
  }

  const before = artifacts.beforePath && !stage.irBefore
    ? readArtifact(artifacts.beforePath, baseDir, maxArtifactBytes, stage, 'before artifact')
    : Promise.resolve(undefined);
  const after = artifacts.afterPath && !stage.irAfter
    ? readArtifact(artifacts.afterPath, baseDir, maxArtifactBytes, stage, 'after artifact')
    : Promise.resolve(undefined);
  const diagnostics = artifacts.diagnosticsPath && !stage.diagnostics
    ? readArtifact(artifacts.diagnosticsPath, baseDir, maxArtifactBytes, stage, 'diagnostics artifact')
    : Promise.resolve(undefined);

  const [beforeResult, afterResult, diagnosticsResult] = await Promise.all([before, after, diagnostics]);
  const hydratedBefore = applyArtifactResult(beforeResult, issues, (text) => { stage.irBefore = text; });
  const hydratedAfter = applyArtifactResult(afterResult, issues, (text) => { stage.irAfter = text; });
  applyArtifactResult(diagnosticsResult, issues, (text) => { stage.diagnostics = text; });
  return hydratedBefore || hydratedAfter;
}

async function readArtifact(
  artifactPath: string,
  baseDir: string,
  maxArtifactBytes: number,
  stage: TraceStage,
  label: string
): Promise<ArtifactResult> {
  const resolvedPath = resolveArtifactPath(baseDir, artifactPath);
  try {
    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) {
      return artifactIssue(stage, `${label} '${artifactPath}' is not a file.`);
    }

    const text = stat.size > maxArtifactBytes
      ? await readArtifactPrefix(resolvedPath, maxArtifactBytes, stat.size)
      : await fs.readFile(resolvedPath, 'utf8');
    return { text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return artifactIssue(stage, `Could not read ${label} '${artifactPath}': ${message}`);
  }
}

async function readArtifactPrefix(filePath: string, maxArtifactBytes: number, totalBytes: number): Promise<string> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(maxArtifactBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxArtifactBytes, 0);
    const omittedBytes = totalBytes - bytesRead;
    return `${buffer.subarray(0, bytesRead).toString('utf8')}\n\n[Pass Lens truncated artifact: ${omittedBytes} bytes omitted.]`;
  } finally {
    await handle.close();
  }
}

function resolveArtifactPath(baseDir: string, artifactPath: string): string {
  return path.normalize(path.isAbsolute(artifactPath) ? artifactPath : path.resolve(baseDir, artifactPath));
}

function artifactIssue(stage: TraceStage, message: string): ArtifactResult {
  return {
    issue: {
      severity: 'warning',
      stageIndex: stage.index,
      field: 'artifacts',
      message
    }
  };
}

function applyArtifactResult(result: ArtifactResult | undefined, issues: TraceIssue[], apply: (text: string) => void): boolean {
  if (!result) {
    return false;
  }
  if (result.issue) {
    issues.push(result.issue);
    return false;
  }
  if (result.text !== undefined) {
    apply(result.text);
    return true;
  }
  return false;
}

interface ArtifactResult {
  text?: string;
  issue?: TraceIssue;
}

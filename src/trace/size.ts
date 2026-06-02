import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PassTrace, TraceStage } from '../types';

export interface TraceSizeSummary {
  stageCount: number;
  inlineIrBytes: number;
  artifactBytes: number;
  artifactCount: number;
  missingArtifactCount: number;
  diagnosticsBytes: number;
  totalKnownBytes: number;
  largestInlineStage?: StageSizeSummary;
  largestArtifact?: ArtifactSizeSummary;
}

export interface StageSizeSummary {
  stageIndex: number;
  pass: string;
  bytes: number;
}

export interface ArtifactSizeSummary {
  stageIndex: number;
  pass: string;
  kind: 'before' | 'after' | 'diagnostics';
  path: string;
  bytes: number;
}

export async function evaluateTraceSize(
  trace: PassTrace,
  tracePath?: string
): Promise<TraceSizeSummary> {
  const summary: TraceSizeSummary = {
    stageCount: trace.stages.length,
    inlineIrBytes: 0,
    artifactBytes: 0,
    artifactCount: 0,
    missingArtifactCount: 0,
    diagnosticsBytes: byteLength(trace.diagnostics ?? ''),
    totalKnownBytes: 0
  };

  for (const stage of trace.stages) {
    const beforeBytes = stage.artifacts?.beforePath ? 0 : byteLength(stage.irBefore ?? '');
    const afterBytes = stage.artifacts?.afterPath ? 0 : byteLength(stage.irAfter ?? '');
    const inlineBytes = beforeBytes + afterBytes;
    summary.inlineIrBytes += inlineBytes;
    if (!stage.artifacts?.diagnosticsPath) {
      summary.diagnosticsBytes += byteLength(stage.diagnostics ?? '');
    }
    if (inlineBytes > (summary.largestInlineStage?.bytes ?? -1)) {
      summary.largestInlineStage = {
        stageIndex: stage.index,
        pass: stage.pass,
        bytes: inlineBytes
      };
    }
  }

  if (tracePath) {
    const artifactSummary = await evaluateArtifactSizes(trace, tracePath);
    summary.artifactBytes = artifactSummary.artifactBytes;
    summary.artifactCount = artifactSummary.artifactCount;
    summary.missingArtifactCount = artifactSummary.missingArtifactCount;
    summary.largestArtifact = artifactSummary.largestArtifact;
  }

  summary.totalKnownBytes = summary.inlineIrBytes + summary.artifactBytes + summary.diagnosticsBytes;
  return summary;
}

export function renderTraceSizeMarkdown(summary: TraceSizeSummary): string {
  const lines = [
    '# Pass Lens Trace Size Report',
    '',
    `- Stages: ${summary.stageCount}`,
    `- Inline IR: ${formatBytes(summary.inlineIrBytes)}`,
    `- Artifact files: ${summary.artifactCount}`,
    `- Artifact bytes: ${formatBytes(summary.artifactBytes)}`,
    `- Diagnostics: ${formatBytes(summary.diagnosticsBytes)}`,
    `- Total known payload: ${formatBytes(summary.totalKnownBytes)}`
  ];

  if (summary.missingArtifactCount > 0) {
    lines.push(`- Missing/unreadable artifacts: ${summary.missingArtifactCount}`);
  }
  if (summary.largestInlineStage && summary.largestInlineStage.bytes > 0) {
    lines.push(
      `- Largest inline stage: #${summary.largestInlineStage.stageIndex} ` +
      `${summary.largestInlineStage.pass} (${formatBytes(summary.largestInlineStage.bytes)})`
    );
  }
  if (summary.largestArtifact) {
    lines.push(
      `- Largest artifact: #${summary.largestArtifact.stageIndex} ` +
      `${summary.largestArtifact.pass} ${summary.largestArtifact.kind} ` +
      `${summary.largestArtifact.path} (${formatBytes(summary.largestArtifact.bytes)})`
    );
  }

  return `${lines.join('\n')}\n`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${formatNumber(bytes / 1024)} KiB`;
  }
  return `${formatNumber(bytes / (1024 * 1024))} MiB`;
}

async function evaluateArtifactSizes(
  trace: PassTrace,
  tracePath: string
): Promise<Pick<TraceSizeSummary, 'artifactBytes' | 'artifactCount' | 'missingArtifactCount' | 'largestArtifact'>> {
  const baseDir = path.dirname(tracePath);
  let artifactBytes = 0;
  let artifactCount = 0;
  let missingArtifactCount = 0;
  let largestArtifact: ArtifactSizeSummary | undefined;

  for (const stage of trace.stages) {
    for (const artifact of stageArtifacts(stage)) {
      const resolved = resolveArtifactPath(baseDir, artifact.path);
      try {
        const stat = await fs.stat(resolved);
        if (!stat.isFile()) {
          missingArtifactCount += 1;
          continue;
        }
        artifactBytes += stat.size;
        artifactCount += 1;
        if (stat.size > (largestArtifact?.bytes ?? -1)) {
          largestArtifact = {
            stageIndex: stage.index,
            pass: stage.pass,
            kind: artifact.kind,
            path: artifact.path,
            bytes: stat.size
          };
        }
      } catch {
        missingArtifactCount += 1;
      }
    }
  }

  return {
    artifactBytes,
    artifactCount,
    missingArtifactCount,
    largestArtifact
  };
}

function stageArtifacts(stage: TraceStage): Array<{ kind: ArtifactSizeSummary['kind']; path: string }> {
  const artifacts = stage.artifacts;
  if (!artifacts) {
    return [];
  }
  return [
    artifacts.beforePath ? { kind: 'before', path: artifacts.beforePath } : undefined,
    artifacts.afterPath ? { kind: 'after', path: artifacts.afterPath } : undefined,
    artifacts.diagnosticsPath ? { kind: 'diagnostics', path: artifacts.diagnosticsPath } : undefined
  ].filter((entry): entry is { kind: ArtifactSizeSummary['kind']; path: string } => Boolean(entry));
}

function resolveArtifactPath(baseDir: string, artifactPath: string): string {
  return path.normalize(path.isAbsolute(artifactPath) ? artifactPath : path.resolve(baseDir, artifactPath));
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

function formatNumber(value: number): string {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

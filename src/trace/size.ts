import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PassTrace, TraceStage } from '../types';
import { resolveArtifactPathWithinTraceRoot } from './artifactPaths';

export interface TraceSizeSummary {
  stageCount: number;
  inlineIrBytes: number;
  artifactBytes: number;
  artifactCount: number;
  missingArtifactCount: number;
  diagnosticsBytes: number;
  totalKnownBytes: number;
  artifactStatsAvailable: boolean;
  warnings: TraceSizeWarning[];
  largestInlineStage?: StageSizeSummary;
  largestArtifact?: ArtifactSizeSummary;
}

export interface TraceSizeOptions {
  includeArtifactStats?: boolean;
}

export interface TraceSizeWarning {
  id: string;
  severity: 'warning' | 'info';
  message: string;
  quickFix: string;
  stageIndex?: number;
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
  tracePath?: string,
  options: TraceSizeOptions = {}
): Promise<TraceSizeSummary> {
  const includeArtifactStats = options.includeArtifactStats ?? true;
  const hasArtifactRefs = trace.stages.some((stage) => Boolean(
    stage.artifacts?.beforePath ||
    stage.artifacts?.afterPath ||
    stage.artifacts?.diagnosticsPath
  ));
  const shouldScanArtifacts = Boolean(tracePath) && includeArtifactStats;

  const summary: TraceSizeSummary = {
    stageCount: trace.stages.length,
    inlineIrBytes: 0,
    artifactBytes: 0,
    artifactCount: 0,
    missingArtifactCount: 0,
    diagnosticsBytes: byteLength(trace.diagnostics ?? ''),
    totalKnownBytes: 0,
    artifactStatsAvailable: shouldScanArtifacts,
    warnings: []
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

  const traceSizeWarnings: TraceSizeWarning[] = [];

  if (shouldScanArtifacts && tracePath) {
    const artifactSummary = await evaluateArtifactSizes(trace, tracePath);
    summary.artifactBytes = artifactSummary.artifactBytes;
    summary.artifactCount = artifactSummary.artifactCount;
    summary.missingArtifactCount = artifactSummary.missingArtifactCount;
    summary.largestArtifact = artifactSummary.largestArtifact;
  } else if (hasArtifactRefs) {
    traceSizeWarnings.push({
      id: 'artifact-size-deferred',
      severity: 'info',
      message: tracePath
        ? 'Artifact size accounting was skipped on open to keep trace load fast.'
        : 'Artifact size accounting was skipped because the trace file path was not provided.',
      quickFix: 'Use "Generate trace size report" to compute artifact-backed size details.'
    });
  }

  summary.totalKnownBytes = summary.inlineIrBytes + summary.artifactBytes + summary.diagnosticsBytes;
  summary.warnings = [...traceSizeWarnings, ...createSizeWarnings(summary, trace)];
  return summary;
}

export function renderTraceSizeMarkdown(summary: TraceSizeSummary): string {
  const artifactBytesLabel = summary.artifactStatsAvailable
    ? formatBytes(summary.artifactBytes)
    : 'unknown (deferred)';
  const artifactCountLabel = summary.artifactStatsAvailable
    ? `${summary.artifactCount}`
    : 'unknown (deferred)';
  const missingArtifactLabel = summary.artifactStatsAvailable
    ? `${summary.missingArtifactCount}`
    : 'unknown (deferred)';

  const lines = [
    '# Pass Lens Trace Size Report',
    '',
    `- Stages: ${summary.stageCount}`,
    `- Inline IR: ${formatBytes(summary.inlineIrBytes)}`,
    `- Artifact files: ${artifactCountLabel}`,
    `- Artifact bytes: ${artifactBytesLabel}`,
    `- Diagnostics: ${formatBytes(summary.diagnosticsBytes)}`,
    `- Total known payload: ${formatBytes(summary.totalKnownBytes)}`
  ];

  if (summary.artifactStatsAvailable && summary.missingArtifactCount > 0) {
    lines.push(`- Missing/unreadable artifacts: ${missingArtifactLabel}`);
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

  lines.push('', '## Warnings And Quick Fixes', '');
  if (!summary.warnings.length) {
    lines.push('No trace size warnings recorded.');
    return `${lines.join('\n')}\n`;
  }
  for (const warning of summary.warnings) {
    const stage = typeof warning.stageIndex === 'number' ? ` #${warning.stageIndex}` : '';
    lines.push(`- [${warning.severity}]${stage} ${warning.id}: ${warning.message}`);
    lines.push(`  - Quick fix: ${warning.quickFix}`);
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
      const resolved = resolveArtifactPathWithinTraceRoot(baseDir, artifact.path);
      if (!resolved.ok || !resolved.resolvedPath) {
        missingArtifactCount += 1;
        continue;
      }
      try {
        const stat = await fs.stat(resolved.resolvedPath);
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

function createSizeWarnings(summary: TraceSizeSummary, trace: PassTrace): TraceSizeWarning[] {
  const warnings: TraceSizeWarning[] = [];
  const isArtifactCapture = trace.capture?.ir === 'artifact';

  if (summary.inlineIrBytes > 1024 * 1024) {
    warnings.push({
      id: 'large-inline-ir',
      severity: 'warning',
      message: `Trace embeds ${formatBytes(summary.inlineIrBytes)} of inline IR.`,
      quickFix: 'Recapture the trace with artifact-backed IR, for example with --pass-lens-artifact-dir <dir>.'
    });
  } else if (!isArtifactCapture && summary.inlineIrBytes > 256 * 1024) {
    warnings.push({
      id: 'inline-ir-near-large-trace-threshold',
      severity: 'info',
      message: `Trace embeds ${formatBytes(summary.inlineIrBytes)} of inline IR and may become expensive on longer pipelines.`,
      quickFix: 'Prefer artifact-backed capture before scaling this workflow to real downstream compiler pipelines.'
    });
  }

  if (summary.largestInlineStage && summary.largestInlineStage.bytes > 512 * 1024) {
    warnings.push({
      id: 'large-inline-stage',
      severity: 'warning',
      stageIndex: summary.largestInlineStage.stageIndex,
      message: `Stage ${summary.largestInlineStage.pass} embeds ${formatBytes(summary.largestInlineStage.bytes)} of inline IR.`,
      quickFix: 'Store this stage IR as beforePath/afterPath artifacts and keep only artifact references in trace.json.'
    });
  }

  if (summary.missingArtifactCount > 0) {
    warnings.push({
      id: 'missing-artifact-size-data',
      severity: 'warning',
      message: `${summary.missingArtifactCount} artifact reference(s) could not be sized.`,
      quickFix: 'Keep trace.json beside its artifact directory or export a repro directory bundle that copies artifacts.'
    });
  }

  if (isArtifactCapture && summary.artifactCount === 0 && summary.stageCount > 0) {
    warnings.push({
      id: 'artifact-capture-without-artifacts',
      severity: 'warning',
      message: 'Trace declares artifact IR capture but no artifact files were found.',
      quickFix: 'Check collector output paths and verify beforePath/afterPath are relative to trace.json.'
    });
  }

  return warnings;
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

function formatNumber(value: number): string {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

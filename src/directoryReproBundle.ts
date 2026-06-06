import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createAgentContext } from './agentContext';
import { createAgentToolManifest } from './agentToolManifest';
import { createRegressionTestSketch } from './regressionTestSketch';
import { createReproBundle } from './reproBundle';
import { resolveArtifactPathWithinTraceRoot } from './trace/artifactPaths';
import type { MetricAnomaly, PassTrace, TraceIssue, TraceStage } from './types';

export interface DirectoryReproBundleOptions {
  targetDir: string;
  sourceTracePath?: string;
  inputPath?: string;
  selectedStageIndex?: number;
  copyArtifacts?: boolean;
  createdAt?: string;
}

export interface DirectoryReproBundleManifest {
  schemaVersion: 1;
  kind: 'pass-lens-directory-repro';
  createdAt: string;
  sourceTracePath?: string;
  files: Record<string, string>;
  inputSource: 'copied' | 'first-stage-ir' | 'missing';
  copiedArtifacts: Array<{
    stageIndex: number;
    kind: 'before' | 'after' | 'diagnostics';
    originalPath?: string;
    bundledPath: string;
  }>;
  tool?: string;
  collectorVersion?: string;
  provenance?: PassTrace['provenance'];
  capture?: PassTrace['capture'];
}

export async function exportDirectoryReproBundle(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  options: DirectoryReproBundleOptions
): Promise<DirectoryReproBundleManifest> {
  const targetDir = path.resolve(options.targetDir);
  const artifactsDir = path.join(targetDir, 'artifacts');
  const copyArtifacts = options.copyArtifacts ?? true;
  const sourceDir = options.sourceTracePath ? path.dirname(options.sourceTracePath) : undefined;

  await fs.mkdir(artifactsDir, { recursive: true });

  const files: Record<string, string> = {};
  const copiedArtifacts: DirectoryReproBundleManifest['copiedArtifacts'] = [];

  await writeJson(path.join(targetDir, 'trace.json'), trace);
  files.trace = 'trace.json';

  await writeText(path.join(targetDir, 'pipeline.txt'), `${trace.pipeline ?? ''}\n`);
  files.pipeline = 'pipeline.txt';

  const inputSource = await writeInputFile(trace, targetDir, sourceDir, options.inputPath);
  if (inputSource !== 'missing') {
    files.input = 'input.mlir';
  }

  await writeText(path.join(targetDir, 'diagnostics.txt'), `${trace.diagnostics ?? ''}\n`);
  files.diagnostics = 'diagnostics.txt';

  await writeText(path.join(targetDir, 'run.ps1'), createPowerShellRunScript());
  files.runPs1 = 'run.ps1';
  await writeText(path.join(targetDir, 'run.sh'), createShellRunScript());
  files.runSh = 'run.sh';

  await writeText(path.join(targetDir, 'summary.md'), createReproBundle(trace, issues, anomalies, {
    sourcePath: options.sourceTracePath,
    selectedStageIndex: options.selectedStageIndex
  }));
  files.summary = 'summary.md';

  await writeText(path.join(targetDir, 'regression-test-sketch.md'), createRegressionTestSketch(trace, issues, anomalies, {
    sourcePath: options.sourceTracePath,
    selectedStageIndex: options.selectedStageIndex
  }));
  files.regressionTestSketch = 'regression-test-sketch.md';

  await writeJson(path.join(targetDir, 'agent-context.json'), createAgentContext(trace, issues, anomalies, {
    sourcePath: options.sourceTracePath,
    selectedStageIndex: options.selectedStageIndex
  }));
  files.agentContext = 'agent-context.json';

  await writeJson(path.join(targetDir, 'agent-tools.json'), createAgentToolManifest(trace, {
    sourcePath: options.sourceTracePath
  }));
  files.agentTools = 'agent-tools.json';

  if (copyArtifacts) {
    for (const stage of trace.stages) {
      await copyOrWriteStageArtifact(stage, 'before', stage.artifacts?.beforePath, stage.irBefore, sourceDir, artifactsDir, copiedArtifacts);
      await copyOrWriteStageArtifact(stage, 'after', stage.artifacts?.afterPath, stage.irAfter, sourceDir, artifactsDir, copiedArtifacts);
      await copyOrWriteStageArtifact(stage, 'diagnostics', stage.artifacts?.diagnosticsPath, stage.diagnostics, sourceDir, artifactsDir, copiedArtifacts);
    }
    if (copiedArtifacts.length) {
      files.artifacts = 'artifacts/';
    }
  }

  files.manifest = 'manifest.json';
  const manifest: DirectoryReproBundleManifest = {
    schemaVersion: 1,
    kind: 'pass-lens-directory-repro',
    createdAt: options.createdAt ?? new Date().toISOString(),
    sourceTracePath: options.sourceTracePath,
    files,
    inputSource,
    copiedArtifacts,
    tool: trace.tool,
    collectorVersion: trace.collectorVersion,
    provenance: trace.provenance,
    capture: trace.capture
  };

  await writeJson(path.join(targetDir, 'manifest.json'), manifest);
  return manifest;
}

async function writeInputFile(
  trace: PassTrace,
  targetDir: string,
  sourceDir: string | undefined,
  explicitInputPath: string | undefined
): Promise<DirectoryReproBundleManifest['inputSource']> {
  const candidates = [
    explicitInputPath,
    trace.input && sourceDir ? path.resolve(sourceDir, trace.input) : undefined,
    trace.input
  ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      await fs.copyFile(candidate, path.join(targetDir, 'input.mlir'));
      return 'copied';
    }
  }

  const firstIr = trace.stages.find((stage) => typeof stage.irBefore === 'string')?.irBefore;
  if (firstIr) {
    await writeText(path.join(targetDir, 'input.mlir'), firstIr.endsWith('\n') ? firstIr : `${firstIr}\n`);
    return 'first-stage-ir';
  }

  return 'missing';
}

async function copyOrWriteStageArtifact(
  stage: TraceStage,
  kind: 'before' | 'after' | 'diagnostics',
  artifactPath: string | undefined,
  inlineText: string | undefined,
  sourceDir: string | undefined,
  artifactsDir: string,
  copiedArtifacts: DirectoryReproBundleManifest['copiedArtifacts']
): Promise<void> {
  const extension = kind === 'diagnostics' ? 'txt' : 'mlir';
  const bundledPath = `artifacts/${padStageIndex(stage.index)}-${kind}.${extension}`;
  const targetPath = path.join(artifactsDir, path.basename(bundledPath));
  const resolvedArtifact = artifactPath && sourceDir
    ? resolveArtifactPathWithinTraceRoot(sourceDir, artifactPath)
    : undefined;

  if (resolvedArtifact?.ok && resolvedArtifact.resolvedPath && await pathExists(resolvedArtifact.resolvedPath)) {
    await fs.copyFile(resolvedArtifact.resolvedPath, targetPath);
    copiedArtifacts.push({
      stageIndex: stage.index,
      kind,
      originalPath: artifactPath,
      bundledPath
    });
    return;
  }

  if (inlineText) {
    await writeText(targetPath, inlineText.endsWith('\n') ? inlineText : `${inlineText}\n`);
    copiedArtifacts.push({
      stageIndex: stage.index,
      kind,
      originalPath: artifactPath,
      bundledPath
    });
  }
}

function createPowerShellRunScript(): string {
  return [
    '$ErrorActionPreference = "Stop"',
    '$driver = $env:PASS_LENS_MLIR_OPT',
    'if (-not $driver) { $driver = "pass-lens-mlir-opt" }',
    '$pipeline = (Get-Content -LiteralPath "pipeline.txt" -Raw).Trim()',
    '& $driver "input.mlir" "--pass-pipeline=$pipeline" "--pass-lens-trace=trace.rerun.json" -o "output.mlir"',
    ''
  ].join('\r\n');
}

function createShellRunScript(): string {
  return [
    '#!/usr/bin/env sh',
    'set -eu',
    'driver="${PASS_LENS_MLIR_OPT:-pass-lens-mlir-opt}"',
    'pipeline="$(cat pipeline.txt)"',
    'pipeline="$(printf "%s" "$pipeline" | tr -d "\\r" | sed "s/[[:space:]]*$//")"',
    'exec "$driver" input.mlir "--pass-pipeline=$pipeline" "--pass-lens-trace=trace.rerun.json" -o output.mlir',
    ''
  ].join('\n');
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function padStageIndex(index: number): string {
  return String(index).padStart(3, '0');
}

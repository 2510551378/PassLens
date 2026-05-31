import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { Metrics, PassTrace, TraceStage } from './types';

export interface CollectMlirOptions {
  mlirOptPath: string;
  inputPath: string;
  pipeline: string;
  extraArgs?: string[];
}

interface DumpBlock {
  phase: 'Before' | 'After';
  pass: string;
  ir: string;
}

export async function collectMlirTrace(options: CollectMlirOptions): Promise<PassTrace> {
  const inputText = await fs.readFile(options.inputPath, 'utf8');
  const outputPath = path.join(os.tmpdir(), `pass-lens-${Date.now()}-${Math.random().toString(16).slice(2)}.mlir`);
  const args = [
    options.inputPath,
    `--pass-pipeline=${options.pipeline}`,
    '--mlir-disable-threading',
    '--mlir-print-ir-before-all',
    '--mlir-print-ir-after-all',
    '--verify-each',
    '-o',
    outputPath,
    ...(options.extraArgs ?? [])
  ];

  const startedAt = performance.now();
  const result = await runProcess(options.mlirOptPath, args);
  const elapsedMs = performance.now() - startedAt;
  await fs.rm(outputPath, { force: true }).catch(() => undefined);

  const dumps = parseMlirDumps(`${result.stderr}\n${result.stdout}`);
  const stages = buildStages(dumps, inputText);

  if (stages.length === 0) {
    stages.push({
      index: 0,
      pass: 'mlir-opt',
      scope: 'unknown',
      changed: false,
      durationMs: elapsedMs,
      verifier: result.exitCode === 0 ? 'ok' : 'failed',
      metricsBefore: computeMetrics(inputText),
      metricsAfter: computeMetrics(inputText),
      irBefore: inputText,
      irAfter: inputText
    });
  }

  if (stages.length > 0) {
    stages[stages.length - 1].durationMs = stages[stages.length - 1].durationMs ?? elapsedMs;
  }

  return {
    schemaVersion: 1,
    tool: 'mlir-opt',
    input: path.basename(options.inputPath),
    pipeline: options.pipeline,
    command: formatCommand(options.mlirOptPath, args),
    exitCode: result.exitCode,
    diagnostics: result.exitCode === 0 ? trimDiagnostics(result.stderr) : trimDiagnostics(`${result.stderr}\n${result.stdout}`),
    stages
  };
}

function buildStages(dumps: DumpBlock[], inputText: string): TraceStage[] {
  const stages: TraceStage[] = [];
  let pendingBefore: DumpBlock | undefined;

  for (const dump of dumps) {
    if (dump.phase === 'Before') {
      pendingBefore = dump;
      continue;
    }

    const before = pendingBefore?.ir ?? (stages.length > 0 ? stages[stages.length - 1].irAfter ?? '' : inputText);
    const beforePass = pendingBefore?.pass ?? dump.pass;
    const passName = normalizePassName(dump.pass || beforePass);
    const irAfter = dump.ir;

    stages.push({
      index: stages.length,
      pass: passName,
      scope: inferScope(passName),
      changed: before !== irAfter,
      verifier: 'ok',
      metricsBefore: computeMetrics(before),
      metricsAfter: computeMetrics(irAfter),
      irBefore: before,
      irAfter
    });

    pendingBefore = undefined;
  }

  return stages;
}

export function parseMlirDumps(text: string): DumpBlock[] {
  const marker = /^\/\/ -----\/\/ IR Dump (Before|After) (.+?) \/\/----- \/\/\s*$/;
  const lines = text.split(/\r?\n/);
  const blocks: DumpBlock[] = [];
  let current: { phase: 'Before' | 'After'; pass: string; lines: string[] } | undefined;

  for (const line of lines) {
    const match = marker.exec(line);
    if (match) {
      if (current) {
        blocks.push({
          phase: current.phase,
          pass: current.pass,
          ir: trimIr(current.lines.join('\n'))
        });
      }
      current = {
        phase: match[1] as 'Before' | 'After',
        pass: match[2],
        lines: []
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    blocks.push({
      phase: current.phase,
      pass: current.pass,
      ir: trimIr(current.lines.join('\n'))
    });
  }

  return blocks;
}

export function computeMetrics(ir: string): Metrics {
  const metrics: Metrics = {
    lines: countNonEmptyLines(ir),
    ops: 0
  };
  const opPattern = /(?:^|\s)([A-Za-z_][\w$-]*\.[A-Za-z_][\w$-]*)\b/gm;
  let match: RegExpExecArray | null;

  while ((match = opPattern.exec(ir)) !== null) {
    const op = match[1];
    if (op.startsWith('loc.')) {
      continue;
    }
    metrics.ops += 1;
    metrics[op] = (metrics[op] ?? 0) + 1;
  }

  const functions = ir.match(/\b(?:func\.func|llvm\.func)\b/g);
  if (functions) {
    metrics.functions = functions.length;
  }

  return metrics;
}

function countNonEmptyLines(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function normalizePassName(raw: string): string {
  const parenthesized = /\(([^()]+)\)\s*$/.exec(raw);
  return parenthesized?.[1] ?? raw.trim();
}

function inferScope(passName: string): string {
  if (passName.includes('func')) {
    return 'func.func';
  }
  if (passName.includes('module')) {
    return 'builtin.module';
  }
  return 'unknown';
}

function trimIr(text: string): string {
  return text.replace(/^\s*\n/, '').replace(/\s+$/, '');
}

function trimDiagnostics(text: string): string | undefined {
  const trimmed = text
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('// -----// IR Dump '))
    .join('\n')
    .trim();
  return trimmed.length > 0 ? trimmed.slice(0, 8000) : undefined;
}

function runProcess(command: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      });
    });
  });
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteArg).join(' ');
}

function quoteArg(arg: string): string {
  return /[\s"']/u.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

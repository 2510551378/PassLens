import type { PassTrace } from './types';

export interface MlirPipelineParts {
  wrappers: string[];
  passes: string[];
}

export interface PipelineRunRequest {
  pipeline: string;
  passCount: number;
  verifyEach: boolean;
}

export interface PipelineRunResult {
  pipeline: string;
  passCount: number;
  verifyEach: boolean;
  exitCode: number;
  failed: boolean;
  commandLine?: string;
  diagnostics?: string;
  tracePath?: string;
}

export interface PipelineRunner {
  runPipeline(request: PipelineRunRequest): Promise<PipelineRunResult>;
}

export interface PrefixBisectResult {
  fullPipeline: string;
  shortestFailingPrefix?: string;
  shortestFailingPassCount?: number;
  firstVerifierFailure?: PipelineRunResult;
  attempts: PipelineRunResult[];
}

export interface VerifyEachResult {
  fullPipeline: string;
  firstFailure?: PipelineRunResult;
  attempts: PipelineRunResult[];
}

export function parseMlirTextualPipeline(pipeline: string): MlirPipelineParts {
  const trimmed = pipeline.trim();
  if (!trimmed) {
    return { wrappers: [], passes: [] };
  }

  const wrappers: string[] = [];
  let current = trimmed;
  while (true) {
    const outer = unwrapSingleWrapper(current);
    if (!outer) {
      break;
    }
    wrappers.push(outer.name);
    current = outer.inner.trim();
  }

  return {
    wrappers,
    passes: splitTopLevel(current).map((entry) => entry.trim()).filter((entry) => entry.length > 0)
  };
}

export function buildMlirPipelinePrefix(pipeline: string, passCount: number): string {
  const parsed = parseMlirTextualPipeline(pipeline);
  const boundedCount = Math.max(0, Math.min(parsed.passes.length, Math.floor(passCount)));
  const inner = parsed.passes.slice(0, boundedCount).join(',');
  return wrapPipeline(parsed.wrappers, inner);
}

export async function runPipelinePrefix(
  pipeline: string,
  passCount: number,
  runner: PipelineRunner,
  verifyEach = true
): Promise<PipelineRunResult> {
  const parts = parseMlirTextualPipeline(pipeline);
  const boundedPassCount = Math.max(0, Math.min(parts.passes.length, Math.floor(passCount)));
  return runner.runPipeline({
    pipeline: buildMlirPipelinePrefix(pipeline, boundedPassCount),
    passCount: boundedPassCount,
    verifyEach
  });
}

export async function runWithVerifyEach(
  pipeline: string,
  runner: PipelineRunner
): Promise<VerifyEachResult> {
  const parts = parseMlirTextualPipeline(pipeline);
  const attempts: PipelineRunResult[] = [];
  for (let count = 1; count <= parts.passes.length; count += 1) {
    const result = await runPipelinePrefix(pipeline, count, runner, true);
    attempts.push(result);
    if (result.failed) {
      return {
        fullPipeline: pipeline,
        firstFailure: result,
        attempts
      };
    }
  }
  return {
    fullPipeline: pipeline,
    attempts
  };
}

export async function runPrefixBisect(
  pipeline: string,
  runner: PipelineRunner
): Promise<PrefixBisectResult> {
  const parts = parseMlirTextualPipeline(pipeline);
  const attempts: PipelineRunResult[] = [];
  let low = 1;
  let high = parts.passes.length;
  let best: PipelineRunResult | undefined;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const result = await runPipelinePrefix(pipeline, mid, runner, true);
    attempts.push(result);
    if (result.failed) {
      best = result;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return {
    fullPipeline: pipeline,
    shortestFailingPrefix: best?.pipeline,
    shortestFailingPassCount: best?.passCount,
    firstVerifierFailure: best,
    attempts
  };
}

export function createMinimalFailingPrefixReport(
  result: PrefixBisectResult,
  trace?: PassTrace
): string {
  const lines = [
    '# Pass Lens Minimal Failing Prefix Report',
    '',
    '## Summary',
    '',
    `- Full pipeline: ${result.fullPipeline}`,
    `- Shortest failing prefix: ${result.shortestFailingPrefix ?? 'none found'}`,
    `- Shortest failing pass count: ${result.shortestFailingPassCount ?? 'none found'}`,
    `- First verifier failure: ${result.firstVerifierFailure ? `pass count ${result.firstVerifierFailure.passCount}` : 'none found'}`,
    `- Attempts: ${result.attempts.length}`,
    '',
    '## Trace Context',
    '',
    `- Tool: ${trace?.tool ?? 'unknown'}`,
    `- Input: ${trace?.input ?? 'unknown'}`,
    `- Existing trace pipeline: ${trace?.pipeline ?? 'unknown'}`,
    `- Existing trace command: ${trace?.command ?? 'unknown'}`,
    '',
    '## Attempts',
    '',
    renderAttempts(result.attempts),
    '',
    '## Diagnostics',
    '',
    fenced(result.firstVerifierFailure?.diagnostics ?? 'No failing diagnostics recorded.')
  ];

  return `${lines.join('\n')}\n`;
}

function unwrapSingleWrapper(text: string): { name: string; inner: string } | undefined {
  const openIndex = text.indexOf('(');
  if (openIndex <= 0 || !text.endsWith(')')) {
    return undefined;
  }

  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0 && index !== text.length - 1) {
        return undefined;
      }
    }
  }
  if (depth !== 0) {
    return undefined;
  }

  return {
    name: text.slice(0, openIndex).trim(),
    inner: text.slice(openIndex + 1, -1)
  };
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let quote: string | undefined;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index - 1] !== '\\') {
        quote = undefined;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') {
      parenDepth += 1;
    } else if (char === ')') {
      parenDepth -= 1;
    } else if (char === '{') {
      braceDepth += 1;
    } else if (char === '}') {
      braceDepth -= 1;
    } else if (char === '[') {
      bracketDepth += 1;
    } else if (char === ']') {
      bracketDepth -= 1;
    } else if (char === ',' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(text.slice(start));
  return parts;
}

function wrapPipeline(wrappers: string[], inner: string): string {
  return wrappers.reduceRight((body, wrapper) => `${wrapper}(${body})`, inner);
}

function renderAttempts(attempts: PipelineRunResult[]): string {
  if (!attempts.length) {
    return 'No rerun attempts recorded.';
  }
  return attempts.map((attempt) => [
    `- pass count ${attempt.passCount}: ${attempt.failed ? 'failed' : 'passed'} (exit ${attempt.exitCode})`,
    `  - Pipeline: ${attempt.pipeline}`,
    attempt.commandLine ? `  - Command: ${attempt.commandLine}` : undefined,
    attempt.tracePath ? `  - Trace: ${attempt.tracePath}` : undefined
  ].filter((line): line is string => typeof line === 'string').join('\n')).join('\n');
}

function fenced(text: string): string {
  return `\`\`\`text\n${text}\n\`\`\``;
}

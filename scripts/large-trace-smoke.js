#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const { createAgentContext } = require('../out/agentContext.js');
const { computeTraceAnomalies } = require('../out/trace/anomalies.js');
const { hydrateTraceStageArtifacts } = require('../out/trace/artifacts.js');
const { normalizeTrace } = require('../out/trace/schema.js');
const { evaluateTraceSize } = require('../out/trace/size.js');
const { validateTraceStrict } = require('../out/trace/strictValidation.js');
const { validateTrace } = require('../out/trace/validation.js');

const defaultOutputRoot = path.join(process.cwd(), '.pass-lens-large-trace-smoke');
const defaultStageCount = 2000;
const defaultArtifactLines = 120;

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return;
  }

  const outputRoot = path.resolve(options.outputRoot);
  resetDirectory(outputRoot);
  const generated = generateLargeTraceFixture(outputRoot, {
    stageCount: options.stageCount,
    artifactLines: options.artifactLines
  });

  const loadResult = measure('load+normalize', () => {
    const raw = JSON.parse(fs.readFileSync(generated.tracePath, 'utf8'));
    return normalizeTrace(raw);
  });
  const trace = loadResult.value;

  const strictResult = measure('strict-validation', () => validateTraceStrict(JSON.parse(fs.readFileSync(generated.tracePath, 'utf8'))));
  const viewerResult = measure('viewer-validation', () => validateTrace(trace));
  const sizeResult = await measureAsync('size-summary', () => evaluateTraceSize(trace, generated.tracePath));

  const selectedStageIndex = Math.floor(options.stageCount / 2);
  const hydrateResult = await measureAsync('hydrate-selected-stage', () =>
    hydrateTraceStageArtifacts(trace, generated.tracePath, selectedStageIndex)
  );
  const selectedStage = trace.stages.find((stage) => stage.index === selectedStageIndex);
  const anomaliesResult = measure('anomalies', () => computeTraceAnomalies(trace));
  const contextResult = measure('agent-context', () => createAgentContext(
    trace,
    [...viewerResult.value, ...hydrateResult.value],
    anomaliesResult.value,
    {
      sourcePath: generated.tracePath,
      selectedStageIndex,
      maxIrChars: 4096,
      maxDiagnosticsChars: 2048
    }
  ));

  const checks = [
    strictResult.value.length === 0 ? undefined : `strict validation reported ${strictResult.value.length} issue(s)`,
    viewerResult.value.some((issue) => issue.severity === 'error') ? 'viewer validation reported errors' : undefined,
    hydrateResult.value.length === 0 ? undefined : `selected-stage hydration reported ${hydrateResult.value.length} issue(s)`,
    selectedStage?.irBefore && selectedStage?.irAfter ? undefined : 'selected stage IR was not hydrated',
    sizeResult.value.stageCount === options.stageCount ? undefined : `expected ${options.stageCount} stages, got ${sizeResult.value.stageCount}`,
    sizeResult.value.inlineIrBytes === 0 ? undefined : `expected artifact-backed trace to have 0 inline IR bytes, got ${sizeResult.value.inlineIrBytes}`,
    contextResult.value.contextSize.omittedStageCount > 0 ? undefined : 'agent context did not omit unselected stages'
  ].filter(Boolean);

  const summary = {
    outputRoot,
    tracePath: generated.tracePath,
    stageCount: options.stageCount,
    artifactLines: options.artifactLines,
    artifactCount: sizeResult.value.artifactCount,
    artifactBytes: sizeResult.value.artifactBytes,
    inlineIrBytes: sizeResult.value.inlineIrBytes,
    selectedStageIndex,
    hydratedSelectedIrChars: (selectedStage?.irBefore?.length ?? 0) + (selectedStage?.irAfter?.length ?? 0),
    agentContext: contextResult.value.contextSize,
    timingsMs: Object.fromEntries([
      loadResult,
      strictResult,
      viewerResult,
      sizeResult,
      hydrateResult,
      anomaliesResult,
      contextResult
    ].map((entry) => [entry.name, round(entry.ms)])),
    checks
  };

  fs.writeFileSync(path.join(outputRoot, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  printSummary(summary);
  if (checks.length > 0) {
    process.exit(1);
  }
}

function parseArgs(argv) {
  const options = {
    artifactLines: readPositiveInt(process.env.PASS_LENS_LARGE_TRACE_ARTIFACT_LINES, defaultArtifactLines),
    help: false,
    outputRoot: process.env.PASS_LENS_LARGE_TRACE_DIR || defaultOutputRoot,
    stageCount: readPositiveInt(process.env.PASS_LENS_LARGE_TRACE_STAGES, defaultStageCount)
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--stages') {
      options.stageCount = readPositiveInt(argv[++index], options.stageCount);
    } else if (arg.startsWith('--stages=')) {
      options.stageCount = readPositiveInt(arg.slice('--stages='.length), options.stageCount);
    } else if (arg === '--artifact-lines') {
      options.artifactLines = readPositiveInt(argv[++index], options.artifactLines);
    } else if (arg.startsWith('--artifact-lines=')) {
      options.artifactLines = readPositiveInt(arg.slice('--artifact-lines='.length), options.artifactLines);
    } else if (arg === '--output') {
      options.outputRoot = argv[++index] || options.outputRoot;
    } else if (arg.startsWith('--output=')) {
      options.outputRoot = arg.slice('--output='.length) || options.outputRoot;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (positional.length > 0) {
    options.stageCount = readPositiveInt(positional[0], options.stageCount);
  }
  if (positional.length > 1) {
    options.artifactLines = readPositiveInt(positional[1], options.artifactLines);
  }
  if (positional.length > 2) {
    options.outputRoot = positional[2];
  }
  if (positional.length > 3) {
    throw new Error(`Too many positional arguments: ${positional.slice(3).join(' ')}`);
  }

  return options;
}

function generateLargeTraceFixture(outputRoot, options) {
  const artifactDir = path.join(outputRoot, 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const stages = [];

  for (let index = 0; index < options.stageCount; index += 1) {
    const passName = `pass-${String(index).padStart(5, '0')}`;
    const beforeName = `stage-${String(index).padStart(6, '0')}.before.mlir`;
    const afterName = `stage-${String(index).padStart(6, '0')}.after.mlir`;
    const changed = index % 17 === 0;
    fs.writeFileSync(path.join(artifactDir, beforeName), makeIr(index, 'before', options.artifactLines), 'utf8');
    fs.writeFileSync(path.join(artifactDir, afterName), makeIr(index, changed ? 'after-changed' : 'before', options.artifactLines), 'utf8');
    stages.push({
      index,
      pass: passName,
      argument: passName,
      opName: 'builtin.module',
      scope: 'builtin.module',
      status: changed ? 'changed' : 'ok',
      changed,
      verifier: 'ok',
      durationMs: round(0.05 + (index % 23) * 0.01),
      metricsBefore: {
        ops: options.artifactLines,
        lines: options.artifactLines + 2
      },
      metricsAfter: {
        ops: options.artifactLines + (changed ? 1 : 0),
        lines: options.artifactLines + 2 + (changed ? 1 : 0)
      },
      artifacts: {
        beforePath: `artifacts/${beforeName}`,
        afterPath: `artifacts/${afterName}`
      }
    });
  }

  const trace = {
    schemaVersion: 1,
    collectorVersion: 'large-trace-smoke/0.1.0',
    tool: 'pass-lens-large-trace-smoke',
    input: 'synthetic-large.mlir',
    pipeline: `builtin.module(${options.stageCount} synthetic passes)`,
    provenance: {
      kind: 'hand-authored',
      description: 'Synthetic artifact-backed large trace generated by scripts/large-trace-smoke.js.'
    },
    capture: {
      ir: 'artifact',
      metrics: true,
      timing: true
    },
    stages
  };

  const tracePath = path.join(outputRoot, 'trace.json');
  fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2), 'utf8');
  return { tracePath };
}

function makeIr(index, variant, lines) {
  const body = Array.from({ length: lines }, (_, line) =>
    `    "synthetic.op_${line % 11}"() {stage = ${index}, variant = "${variant}"} : () -> ()`
  );
  return [
    'module {',
    `  func.func @stage_${index}_${variant.replace(/[^a-z0-9]+/g, '_')}() {`,
    ...body,
    '    return',
    '  }',
    '}',
    ''
  ].join('\n');
}

function measure(name, fn) {
  const startedAt = performance.now();
  const value = fn();
  return { name, ms: performance.now() - startedAt, value };
}

async function measureAsync(name, fn) {
  const startedAt = performance.now();
  const value = await fn();
  return { name, ms: performance.now() - startedAt, value };
}

function printSummary(summary) {
  console.log(`Large trace smoke output: ${summary.outputRoot}`);
  console.log(`stages\t${summary.stageCount}`);
  console.log(`artifacts\t${summary.artifactCount}`);
  console.log(`artifactBytes\t${summary.artifactBytes}`);
  console.log(`inlineIrBytes\t${summary.inlineIrBytes}`);
  console.log(`selectedStage\t${summary.selectedStageIndex}`);
  console.log(`hydratedSelectedIrChars\t${summary.hydratedSelectedIrChars}`);
  console.log(`omittedAgentStages\t${summary.agentContext.omittedStageCount}`);
  console.log('\ntimingsMs');
  for (const [name, ms] of Object.entries(summary.timingsMs)) {
    console.log(`${name}\t${ms}`);
  }
  if (summary.checks.length > 0) {
    console.log('\nfailedChecks');
    for (const check of summary.checks) {
      console.log(`- ${check}`);
    }
  } else {
    console.log('\nchecks\tok');
  }
}

function printUsage() {
  console.log(`Usage: node scripts/large-trace-smoke.js [options]

Options:
  --stages <n>           Number of synthetic stages. Default: ${defaultStageCount}
  --artifact-lines <n>   IR body lines per before/after artifact. Default: ${defaultArtifactLines}
  --output <path>        Output directory. Default: ${defaultOutputRoot}
  -h, --help             Show this help.

Environment:
  PASS_LENS_LARGE_TRACE_STAGES
  PASS_LENS_LARGE_TRACE_ARTIFACT_LINES
  PASS_LENS_LARGE_TRACE_DIR

npm positional fallback:
  npm run smoke:large-trace -- <stages> <artifact-lines> <output>
`);
}

function resetDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
}

function readPositiveInt(raw, fallback) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

module.exports = {
  generateLargeTraceFixture,
  parseArgs
};

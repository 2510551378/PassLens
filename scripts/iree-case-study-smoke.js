#!/usr/bin/env node

const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { normalizeTrace } = require('../out/trace/schema.js');
const { resolveArtifactPathWithinTraceRoot } = require('../out/trace/artifactPaths.js');
const { validateTraceStrict } = require('../out/trace/strictValidation.js');
const { validateTrace } = require('../out/trace/validation.js');

const defaultCase = {
  name: 'iree-downstream-lowering',
  inputText:
`module {
  func.func @main(%arg0: i32, %arg1: i32) -> i32 {
    %0 = arith.addi %arg0, %arg1 : i32
    return %0 : i32
  }
}`
};

const defaultOutputRoot = path.join(process.cwd(), '.pass-lens-iree-case-study');
const defaultTimeoutMs = 180000;

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

  const driver = resolveDriverPath(options.driver);
  const outputRoot = path.resolve(options.outputRoot);
  const caseName = options.caseName || defaultCase.name;
  const inputPath = path.resolve(options.inputPath || path.join(outputRoot, `${caseName}.mlir`));
  const tracePath = path.join(outputRoot, `${caseName}.trace.json`);
  const artifactDir = `${caseName}-artifacts`;
  const outputMlir = path.join(outputRoot, `${caseName}.output.mlir`);
  const stdoutPath = path.join(outputRoot, `${caseName}.stdout.txt`);
  const stderrPath = path.join(outputRoot, `${caseName}.stderr.txt`);
  const summaryPath = path.join(outputRoot, 'summary.json');

  resetDirectory(outputRoot);
  if (!options.inputPath) {
    fs.writeFileSync(inputPath, defaultCase.inputText, 'utf8');
  } else if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }
  const startedAt = performance.now();
  const args = buildDriverArgs({
    driverArgs: options.driverArgs,
    inputPath,
    pipeline: options.pipeline,
    outputMlir,
    tracePath,
    artifactDir
  });
  const runResult = runProcess(driver, args, {
    cwd: options.workdir || process.cwd(),
    timeoutMs: options.timeoutMs
  });
  const elapsedMs = performance.now() - startedAt;
  fs.writeFileSync(stdoutPath, runResult.stdout, 'utf8');
  fs.writeFileSync(stderrPath, runResult.stderr, 'utf8');

  const validation = validateTraceOutputs({
    tracePath,
    checkArtifacts: options.checkArtifacts
  });

  const errors = [
    runResult.error ? `driver launch failed: ${runResult.error}` : undefined,
    runResult.exitCode === 0 ? undefined : `driver exited with ${runResult.exitCode}`,
    validation.fileMissing ? 'trace file was not produced' : undefined,
    validation.validationError ? validation.validationError : undefined,
    validation.stageCount <= 0 ? `expected at least one stage, got ${validation.stageCount}` : undefined,
    validation.provenanceKind === 'live-pass-instrumentation' ? undefined : 'provenance.kind is not live-pass-instrumentation'
  ].filter(Boolean);

  const summary = {
    case: caseName,
    driver,
    pipeline: options.pipeline,
    workdir: options.workdir || process.cwd(),
    inputPath,
    outputRoot,
    outputMlir,
    artifactDir,
    tracePath,
    stdoutPath,
    stderrPath,
    summaryPath,
    exitCode: runResult.exitCode,
    elapsedMs: round(elapsedMs),
    stageCount: validation.stageCount,
    artifactCount: validation.artifactCount,
    missingArtifactCount: validation.missingArtifactCount,
    strictIssueCount: validation.strictIssueCount,
    viewerIssueCount: validation.viewerIssueCount,
    artifactIssueCount: validation.artifactIssueCount,
    provenanceKind: validation.provenanceKind,
    checkArtifacts: options.checkArtifacts,
    errors
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  printSummary(summary);

  if (errors.length > 0) {
    process.exit(1);
  }
}

function parseArgs(argv) {
  const options = {
    caseName: undefined,
    checkArtifacts: true,
    driver: process.env.PASS_LENS_IREE_DRIVER,
    driverArgs: [],
    help: false,
    inputPath: process.env.PASS_LENS_IREE_INPUT,
    outputRoot: process.env.PASS_LENS_IREE_CASE_DIR || defaultOutputRoot,
    pipeline: process.env.PASS_LENS_IREE_PIPELINE || '',
    timeoutMs: readPositiveInt(process.env.PASS_LENS_IREE_TIMEOUT_MS, defaultTimeoutMs),
    workdir: process.env.PASS_LENS_IREE_WORKDIR
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--driver') {
      options.driver = argv[index + 1] || options.driver;
      index += 1;
    } else if (arg.startsWith('--driver=')) {
      options.driver = arg.slice('--driver='.length);
    } else if (arg === '--input') {
      options.inputPath = argv[index + 1] || options.inputPath;
      index += 1;
    } else if (arg.startsWith('--input=')) {
      options.inputPath = arg.slice('--input='.length);
    } else if (arg === '--pipeline') {
      options.pipeline = argv[index + 1] || options.pipeline;
      index += 1;
    } else if (arg.startsWith('--pipeline=')) {
      options.pipeline = arg.slice('--pipeline='.length);
    } else if (arg === '--case-name') {
      options.caseName = argv[index + 1] || options.caseName;
      index += 1;
    } else if (arg.startsWith('--case-name=')) {
      options.caseName = arg.slice('--case-name='.length);
    } else if (arg === '--output') {
      options.outputRoot = argv[index + 1] || options.outputRoot;
      index += 1;
    } else if (arg.startsWith('--output=')) {
      options.outputRoot = arg.slice('--output='.length);
    } else if (arg === '--workdir') {
      options.workdir = argv[index + 1] || options.workdir;
      index += 1;
    } else if (arg.startsWith('--workdir=')) {
      options.workdir = arg.slice('--workdir='.length);
    } else if (arg === '--driver-arg') {
      if (argv[index + 1]) {
        options.driverArgs.push(argv[index + 1]);
        index += 1;
      }
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = readPositiveInt(argv[index + 1], options.timeoutMs);
      index += 1;
    } else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = readPositiveInt(arg.slice('--timeout-ms='.length), options.timeoutMs);
    } else if (arg === '--no-check-artifacts') {
      options.checkArtifacts = false;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolveDriverPath(rawDriver) {
  const command = String(rawDriver || '').trim();
  if (!command) {
    throw new Error('PASS_LENS_IREE_DRIVER or --driver is required.');
  }

  const hasPathLike = command.includes(path.sep) || command.includes(path.posix.sep);
  if (hasPathLike) {
    const absolute = path.isAbsolute(command) ? command : path.resolve(command);
    if (!fs.existsSync(absolute)) {
      throw new Error(`Structured collector driver was not found: ${absolute}`);
    }
    return absolute;
  }

  const pathExts = process.platform === 'win32'
    ? process.env.PATHEXT?.split(path.delimiter).map((ext) => ext.toLowerCase()) ?? ['.exe', '.cmd', '.bat', '.com']
    : [''];

  const searchPaths = process.env.PATH || '';
  for (const directory of searchPaths.split(path.delimiter)) {
    for (const extension of pathExts) {
      const candidate = path.join(directory, `${command}${extension}`);
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch {
        continue;
      }
    }
  }

  throw new Error(`Structured collector driver was not found on PATH: ${command}`);
}

function buildDriverArgs(params) {
  const args = [
    ...params.driverArgs,
    params.inputPath
  ];
  if (params.pipeline && params.pipeline.trim().length > 0) {
    args.push(`--pass-pipeline=${params.pipeline}`);
  }
  args.push(`--pass-lens-trace=${params.tracePath}`);
  args.push(`--pass-lens-artifact-dir=${params.artifactDir}`);
  args.push('-o', params.outputMlir);
  return args;
}

function runProcess(command, args, options) {
  const child = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeoutMs,
    maxBuffer: 64 * 1024 * 1024
  });
  if (child.error) {
    return {
      exitCode: -1,
      stdout: '',
      stderr: '',
      error: child.error.message
    };
  }
  return {
    exitCode: child.status ?? -1,
    stdout: child.stdout || '',
    stderr: child.stderr || '',
    error: undefined
  };
}

function validateTraceOutputs({ tracePath, checkArtifacts }) {
  if (!fs.existsSync(tracePath)) {
    return {
      fileMissing: true,
      validationError: 'missing trace output file',
      stageCount: 0,
      artifactCount: 0,
      missingArtifactCount: 0,
      strictIssueCount: 0,
      viewerIssueCount: 0,
      artifactIssueCount: 0,
      provenanceKind: undefined
    };
  }

  const rawText = fs.readFileSync(tracePath, 'utf8');
  let raw;
  try {
    raw = JSON.parse(rawText);
  } catch (error) {
    return {
      fileMissing: false,
      validationError: `trace JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      stageCount: 0,
      artifactCount: 0,
      missingArtifactCount: 0,
      strictIssueCount: 0,
      viewerIssueCount: 0,
      artifactIssueCount: 0,
      provenanceKind: undefined
    };
  }

  const strictIssues = validateTraceStrict(raw);
  const strictError = strictIssues.find((issue) => issue.severity === 'error');
  const normalized = strictError ? undefined : normalizeTrace(raw);
  const viewerIssues = normalized ? validateTrace(normalized) : [];
  const artifactIssues = (normalized && checkArtifacts) ? validateArtifactReferences(normalized, tracePath) : [];
  const summary = {
    fileMissing: false,
    validationError: strictIssueText(strictIssues, viewerIssues, artifactIssues),
    stageCount: Array.isArray(raw.stages) ? raw.stages.length : 0,
    artifactCount: Array.isArray(raw.stages)
      ? raw.stages.reduce((count, stage) => count + [
        stage?.artifacts?.beforePath ? 1 : 0,
        stage?.artifacts?.afterPath ? 1 : 0,
        stage?.artifacts?.diagnosticsPath ? 1 : 0
      ].reduce((sum, entry) => sum + entry, 0), 0)
      : 0,
    missingArtifactCount: artifactIssueCount(artifactIssues),
    strictIssueCount: strictIssues.length,
    viewerIssueCount: viewerIssues.length,
    artifactIssueCount: artifactIssues.length,
    provenanceKind: raw.provenance?.kind
  };

  return summary;
}

function strictIssueText(strictIssues, viewerIssues, artifactIssues) {
  if (strictIssues.some((issue) => issue.severity === 'error')) {
    return 'strict validation reported errors';
  }
  if (viewerIssues.some((issue) => issue.severity === 'error')) {
    return 'viewer validation reported errors';
  }
  if (artifactIssues.some((issue) => issue.severity === 'error')) {
    return 'artifact validation reported missing artifacts';
  }
  return undefined;
}

function validateArtifactReferences(trace, tracePath) {
  const issues = [];
  for (const stage of trace.stages) {
    const artifactEntries = [
      { field: 'artifacts.beforePath', label: 'before artifact', path: stage?.artifacts?.beforePath },
      { field: 'artifacts.afterPath', label: 'after artifact', path: stage?.artifacts?.afterPath },
      { field: 'artifacts.diagnosticsPath', label: 'diagnostics artifact', path: stage?.artifacts?.diagnosticsPath }
    ];
    for (const entry of artifactEntries) {
      if (!entry.path) {
        continue;
      }
      const resolved = resolveArtifactPathWithinTraceRoot(path.dirname(tracePath), entry.path);
      if (!resolved.ok || !resolved.resolvedPath) {
        issues.push({
          severity: 'error',
          stageIndex: stage.index,
          field: entry.field,
          message: `${entry.label} path is invalid: ${entry.path} (${resolved.message ?? 'invalid artifact path'})`
        });
        continue;
      }
      try {
        const stat = fs.statSync(resolved.resolvedPath);
        if (!stat.isFile()) {
          issues.push({
            severity: 'error',
            stageIndex: stage.index,
            field: entry.field,
            message: `${entry.label} is not a file: ${entry.path}`
          });
        }
      } catch {
        issues.push({
          severity: 'error',
          stageIndex: stage.index,
          field: entry.field,
          message: `${entry.label} is missing or unreadable: ${entry.path}`
        });
      }
    }
  }
  return issues;
}

function artifactIssueCount(issues) {
  const artifactIndex = new Set();
  for (const issue of issues) {
    if (typeof issue.stageIndex === 'number' && typeof issue.field === 'string') {
      artifactIndex.add(`${issue.stageIndex}:${issue.field}`);
    }
  }
  return artifactIndex.size;
}

function printSummary(summary) {
  console.log(`IREE case study output: ${summary.outputRoot}`);
  console.log(`case\t${summary.case}`);
  console.log(`driver\t${summary.driver}`);
  console.log(`pipeline\t${summary.pipeline || '(default)'}`);
  console.log(`exitCode\t${summary.exitCode}`);
  console.log(`elapsedMs\t${summary.elapsedMs}`);
  console.log(`stages\t${summary.stageCount}`);
  console.log(`artifacts\t${summary.artifactCount}`);
  console.log(`missingArtifacts\t${summary.missingArtifactCount}`);
  console.log(`strictIssues\t${summary.strictIssueCount}`);
  console.log(`viewerIssues\t${summary.viewerIssueCount}`);
  console.log(`artifactIssues\t${summary.artifactIssueCount}`);
  console.log(`provenanceKind\t${summary.provenanceKind || '(missing)'}`);
  if (summary.errors.length > 0) {
    console.log('\nerrors');
    for (const error of summary.errors) {
      console.log(`- ${error}`);
    }
  } else {
    console.log('\nchecks\tok');
  }
}

function printUsage() {
  console.log(`Usage: node scripts/iree-case-study-smoke.js --driver <path> [options]

Options:
  --driver <path>           Structured-pass-driver executable with Pass Lens JSON output.
  --input <path>            MLIR/IR input. Default: fallback sample generated at <output>/<case-name>.mlir
  --pipeline <name>         Optional pass pipeline argument.
  --case-name <name>        Case identifier for output naming.
  --output <path>           Output directory. Default: ${defaultOutputRoot}
  --workdir <path>          Optional working directory for the driver.
  --driver-arg <arg>        Additional raw args to pass to the driver. Repeatable.
  --timeout-ms <ms>         Driver timeout. Default: 180000
  --no-check-artifacts       Skip artifact path validation.
  -h, --help                Show this help.

Environment:
  PASS_LENS_IREE_DRIVER
  PASS_LENS_IREE_INPUT
  PASS_LENS_IREE_PIPELINE
  PASS_LENS_IREE_CASE_DIR
  PASS_LENS_IREE_TIMEOUT_MS
  PASS_LENS_IREE_WORKDIR

Expected conventions:
  The driver should accept:
    --pass-lens-trace=<path>
    --pass-lens-artifact-dir=<dir>
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
  parseArgs,
  buildDriverArgs,
  resolveDriverPath
};

#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const { createMlirDumpTrace } = require('../out/mlirCollector.js');
const { normalizeTrace } = require('../out/trace/schema.js');
const { validateTraceStrict } = require('../out/trace/strictValidation.js');
const { validateTrace } = require('../out/trace/validation.js');

const defaultCase = {
  name: 'mlir-to-openfhe-dot-product',
  input: 'tests/Transforms/mlir_to_openfhe_ckks/dot_product_float.mlir',
  args: [
    '--mlir-to-ckks=ciphertext-degree=8',
    '--scheme-to-openfhe=entry-function=dot_product'
  ],
  description: 'HEIR CKKS dot-product lowering to OpenFHE.'
};

const defaultOutputRoot = path.join(process.cwd(), '.pass-lens-heir-case-study');

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
  if (!options.heirRoot) {
    throw new Error('PASS_LENS_HEIR_ROOT or --heir-root is required.');
  }

  const heirRoot = path.resolve(options.heirRoot);
  const heirOpt = path.resolve(options.heirOpt || path.join(heirRoot, 'bazel-bin/tools/heir-opt'));
  const outputRoot = path.resolve(options.outputRoot);
  const outputMlir = path.join(outputRoot, `${defaultCase.name}.output.mlir`);
  const tracePath = path.join(outputRoot, `${defaultCase.name}.trace.json`);
  const stdoutPath = path.join(outputRoot, `${defaultCase.name}.stdout.txt`);
  const stderrPath = path.join(outputRoot, `${defaultCase.name}.stderr.txt`);

  resetDirectory(outputRoot);
  const inputPath = path.join(heirRoot, defaultCase.input);
  if (!fs.existsSync(heirOpt)) {
    throw new Error(`heir-opt not found: ${heirOpt}`);
  }
  if (!fs.existsSync(inputPath)) {
    throw new Error(`HEIR input not found: ${inputPath}`);
  }

  const args = [
    defaultCase.input,
    '--mlir-disable-threading',
    '--mlir-print-ir-before-all',
    '--mlir-print-ir-after-all',
    ...defaultCase.args,
    '-o',
    outputMlir
  ];
  const startedAt = performance.now();
  const result = await runProcess(heirOpt, args, heirRoot, options.timeoutMs);
  const elapsedMs = performance.now() - startedAt;
  fs.writeFileSync(stdoutPath, result.stdout, 'utf8');
  fs.writeFileSync(stderrPath, result.stderr, 'utf8');

  const inputText = fs.readFileSync(inputPath, 'utf8');
  const trace = createMlirDumpTrace({
    inputText,
    dumpText: `${result.stderr}\n${result.stdout}`,
    tool: 'heir-opt',
    input: defaultCase.input,
    pipeline: defaultCase.args.join(' '),
    command: formatCommand(heirOpt, args),
    exitCode: result.exitCode,
    elapsedMs,
    diagnostics: trimDiagnostics(result.exitCode === 0 ? result.stderr : `${result.stderr}\n${result.stdout}`),
    collectorVersion: 'typescript-heir-dump-fallback/0.1.0',
    provenance: {
      kind: 'converted-dump',
      description: `${defaultCase.description} Converted from textual HEIR MLIR IR dumps emitted by heir-opt.`,
      source: 'HEIR heir-opt textual IR dumps',
      generatedBy: 'scripts/heir-case-study-smoke.js'
    }
  });

  fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2), 'utf8');
  const strictIssues = validateTraceStrict(JSON.parse(fs.readFileSync(tracePath, 'utf8')));
  const normalized = normalizeTrace(JSON.parse(fs.readFileSync(tracePath, 'utf8')));
  const viewerIssues = validateTrace(normalized);
  const errors = [
    result.exitCode === 0 ? undefined : `heir-opt exited with ${result.exitCode}`,
    trace.stages.length > 1 ? undefined : `expected multiple HEIR pass stages, got ${trace.stages.length}`,
    strictIssues.some((issue) => issue.severity === 'error') ? 'strict validation reported errors' : undefined,
    viewerIssues.some((issue) => issue.severity === 'error') ? 'viewer validation reported errors' : undefined
  ].filter(Boolean);

  const summary = {
    case: defaultCase.name,
    heirRoot,
    heirOpt,
    outputRoot,
    tracePath,
    outputMlir,
    stdoutPath,
    stderrPath,
    exitCode: result.exitCode,
    elapsedMs: round(elapsedMs),
    stageCount: trace.stages.length,
    changedStageCount: trace.stages.filter((stage) => stage.changed).length,
    strictIssueCount: strictIssues.length,
    viewerIssueCount: viewerIssues.length,
    errors
  };
  fs.writeFileSync(path.join(outputRoot, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  printSummary(summary);
  if (errors.length > 0) {
    process.exit(1);
  }
}

function parseArgs(argv) {
  const options = {
    heirOpt: process.env.PASS_LENS_HEIR_OPT,
    heirRoot: process.env.PASS_LENS_HEIR_ROOT,
    help: false,
    outputRoot: process.env.PASS_LENS_HEIR_CASE_DIR || defaultOutputRoot,
    timeoutMs: readPositiveInt(process.env.PASS_LENS_HEIR_TIMEOUT_MS, 120000)
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--heir-root') {
      options.heirRoot = argv[++index] || options.heirRoot;
    } else if (arg.startsWith('--heir-root=')) {
      options.heirRoot = arg.slice('--heir-root='.length) || options.heirRoot;
    } else if (arg === '--heir-opt') {
      options.heirOpt = argv[++index] || options.heirOpt;
    } else if (arg.startsWith('--heir-opt=')) {
      options.heirOpt = arg.slice('--heir-opt='.length) || options.heirOpt;
    } else if (arg === '--output') {
      options.outputRoot = argv[++index] || options.outputRoot;
    } else if (arg.startsWith('--output=')) {
      options.outputRoot = arg.slice('--output='.length) || options.outputRoot;
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = readPositiveInt(argv[++index], options.timeoutMs);
    } else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = readPositiveInt(arg.slice('--timeout-ms='.length), options.timeoutMs);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function runProcess(command, args, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);
    const stdout = [];
    const stderr = [];

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode: signal ? -1 : code ?? -1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      });
    });
  });
}

function printSummary(summary) {
  console.log(`HEIR case study output: ${summary.outputRoot}`);
  console.log(`case\t${summary.case}`);
  console.log(`exitCode\t${summary.exitCode}`);
  console.log(`elapsedMs\t${summary.elapsedMs}`);
  console.log(`stages\t${summary.stageCount}`);
  console.log(`changedStages\t${summary.changedStageCount}`);
  console.log(`strictIssues\t${summary.strictIssueCount}`);
  console.log(`viewerIssues\t${summary.viewerIssueCount}`);
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
  console.log(`Usage: node scripts/heir-case-study-smoke.js --heir-root <path> [options]

Options:
  --heir-root <path>   HEIR repository root containing bazel-bin/tools/heir-opt.
  --heir-opt <path>    Optional explicit heir-opt path.
  --output <path>      Output directory. Default: ${defaultOutputRoot}
  --timeout-ms <n>     heir-opt timeout. Default: 120000
  -h, --help           Show this help.

Environment:
  PASS_LENS_HEIR_ROOT
  PASS_LENS_HEIR_OPT
  PASS_LENS_HEIR_CASE_DIR
  PASS_LENS_HEIR_TIMEOUT_MS
`);
}

function trimDiagnostics(text) {
  const filtered = text
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('// -----// IR Dump '))
    .join('\n')
    .trim();
  return filtered.length > 0 ? filtered.slice(0, 8000) : undefined;
}

function resetDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
}

function formatCommand(command, args) {
  return [command, ...args].map(quoteArg).join(' ');
}

function quoteArg(arg) {
  return /[\s"']/u.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function readPositiveInt(raw, fallback) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

module.exports = {
  parseArgs
};

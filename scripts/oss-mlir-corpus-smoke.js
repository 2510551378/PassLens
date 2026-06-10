#!/usr/bin/env node

const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const defaultLlvmTag = 'llvmorg-20.1.2';
const llvmTag = process.env.PASS_LENS_OSS_LLVM_TAG || defaultLlvmTag;
const collector = process.env.PASS_LENS_MLIR_OPT || process.env.PASS_LENS_MLIR_DRIVER || 'pass-lens-mlir-opt';
const outputRoot = path.resolve(process.env.PASS_LENS_OSS_SMOKE_DIR || path.join(os.tmpdir(), 'passlens-oss-mlir-smoke'));
const sourceRoot = process.env.PASS_LENS_OSS_SOURCE_ROOT ? path.resolve(process.env.PASS_LENS_OSS_SOURCE_ROOT) : undefined;
const baseUrl = `https://raw.githubusercontent.com/llvm/llvm-project/${llvmTag}/mlir/test`;

const cases = [
  {
    name: 'arith-canonicalize',
    source: 'Dialect/Arith/canonicalize.mlir',
    mode: 'file',
    pipeline: 'builtin.module(canonicalize,cse)',
    args: ['--allow-unregistered-dialect']
  },
  {
    name: 'memref-canonicalize',
    source: 'Dialect/MemRef/canonicalize.mlir',
    mode: 'file',
    pipeline: 'builtin.module(canonicalize,cse)',
    args: ['--allow-unregistered-dialect']
  },
  {
    name: 'scf-canonicalize-sections',
    source: 'Dialect/SCF/canonicalize.mlir',
    mode: 'litSections',
    pipeline: 'builtin.module(canonicalize,cse)',
    args: ['--allow-unregistered-dialect'],
    minSuccessfulChunks: 2,
    maxSuccessfulChunks: 3,
    maxSections: 40
  },
  {
    name: 'transforms-canonicalize-sections',
    source: 'Transforms/canonicalize.mlir',
    mode: 'litSections',
    pipeline: 'builtin.module(canonicalize,cse)',
    args: ['--allow-unregistered-dialect'],
    minSuccessfulChunks: 2,
    maxSuccessfulChunks: 3,
    maxSections: 40
  }
];

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  const effectiveSourceRoot = options.sourceRoot ? path.resolve(options.sourceRoot) : sourceRoot;

  resetDirectory(outputRoot);
  fs.mkdirSync(path.join(outputRoot, 'inputs'), { recursive: true });
  fs.mkdirSync(path.join(outputRoot, 'traces'), { recursive: true });

  const results = [];
  const caseSummaries = [];
  for (const entry of cases) {
    if (entry.mode === 'litSections') {
      const sectionResult = await runLitSectionCase(entry, effectiveSourceRoot);
      results.push(...sectionResult.results);
      caseSummaries.push(sectionResult.summary);
    } else {
      const result = await runCase(entry, effectiveSourceRoot);
      results.push(result);
      caseSummaries.push({
        name: entry.name,
        successfulChunks: result.status === 'ok' ? 1 : 0,
        minSuccessfulChunks: 1
      });
    }
  }

  const tracePaths = results
    .filter((entry) => entry.status === 'ok')
    .map((entry) => entry.tracePath);
  const validation = validateTraces(tracePaths);
  const failed = results.filter((entry) => entry.status !== 'ok' && !entry.status.startsWith('unsupported:'));

  fs.writeFileSync(path.join(outputRoot, 'results.json'), JSON.stringify({
    llvmTag,
    collector,
    outputRoot,
    caseSummaries,
    results,
    validationExitCode: validation.status
  }, null, 2), 'utf8');

  printSummary(results, caseSummaries, validation);
  const missingRequiredCoverage = caseSummaries.some((entry) => entry.successfulChunks < entry.minSuccessfulChunks);
  if (failed.length > 0 || missingRequiredCoverage || validation.status !== 0) {
    process.exit(1);
  }
}

async function runCase(entry, effectiveSourceRoot) {
  const source = resolveCaseSource(entry, effectiveSourceRoot);
  const inputPath = path.join(outputRoot, 'inputs', `${entry.name}.mlir`);
  if (source.kind === 'local') {
    fs.copyFileSync(source.sourcePath, inputPath);
  } else {
    await download(source.sourceUrl, inputPath);
  }
  return runInput(entry, inputPath, source.sourceUrl);
}

async function runLitSectionCase(entry, effectiveSourceRoot) {
  const source = resolveCaseSource(entry, effectiveSourceRoot);
  const sourcePath = path.join(outputRoot, 'inputs', `${entry.name}.source.mlir`);
  if (source.kind === 'local') {
    fs.copyFileSync(source.sourcePath, sourcePath);
  } else {
    await download(source.sourceUrl, sourcePath);
  }
  const sections = splitLitSections(fs.readFileSync(sourcePath, 'utf8'))
    .slice(0, entry.maxSections ?? Number.POSITIVE_INFINITY);
  const results = [];
  let successfulChunks = 0;

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    if (successfulChunks >= (entry.maxSuccessfulChunks ?? Number.POSITIVE_INFINITY)) {
      break;
    }
    const chunkName = `${entry.name}-part-${String(sectionIndex).padStart(3, '0')}`;
    const inputPath = path.join(outputRoot, 'inputs', `${chunkName}.mlir`);
    fs.writeFileSync(inputPath, sections[sectionIndex], 'utf8');
    const result = await runInput({
      ...entry,
      name: chunkName
    }, inputPath, `${source.sourceUrl}#section-${sectionIndex}`);
    if (result.status === 'ok') {
      successfulChunks += 1;
      results.push(result);
    } else {
      results.push({
        ...result,
        status: `unsupported:${result.status}`
      });
    }
  }

  return {
    results,
    summary: {
      name: entry.name,
      successfulChunks,
      minSuccessfulChunks: entry.minSuccessfulChunks ?? 1,
      attemptedChunks: results.length,
      availableChunks: sections.length
    }
  };
}

async function runInput(entry, inputPath, sourceUrl) {
  const tracePath = path.join(outputRoot, 'traces', `${entry.name}.json`);
  const artifactDir = path.join(outputRoot, 'traces', `${entry.name}-artifacts`);
  const stdoutPath = path.join(outputRoot, 'traces', `${entry.name}.stdout.txt`);
  const stderrPath = path.join(outputRoot, 'traces', `${entry.name}.stderr.txt`);
  fs.mkdirSync(artifactDir, { recursive: true });

  const args = [
    ...entry.args,
    inputPath,
    `--pass-pipeline=${entry.pipeline}`,
    `--pass-lens-trace=${tracePath}`,
    `--pass-lens-artifact-dir=${artifactDir}`,
    '-o',
    path.join(outputRoot, 'traces', `${entry.name}.out.mlir`)
  ];
  const proc = spawnSync(collector, args, { encoding: 'utf8' });
  fs.writeFileSync(stdoutPath, proc.stdout || '', 'utf8');
  fs.writeFileSync(stderrPath, proc.stderr || '', 'utf8');

  if (proc.error || proc.status !== 0 || !fs.existsSync(tracePath)) {
    return {
      name: entry.name,
      sourceUrl,
      pipeline: entry.pipeline,
      status: proc.error ? `error: ${proc.error.message}` : `failed: ${proc.status}`,
      tracePath,
      artifactDir,
      stageCount: 0,
      artifactCount: countFiles(artifactDir),
      stderrPath
    };
  }

  const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
  return {
    name: entry.name,
    sourceUrl,
    pipeline: entry.pipeline,
    status: 'ok',
    tracePath,
    artifactDir,
    stageCount: Array.isArray(trace.stages) ? trace.stages.length : 0,
    artifactCount: countFiles(artifactDir),
    stderrPath
  };
}

function parseArgs(argv) {
  const options = {
    sourceRoot,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--source-root') {
      options.sourceRoot = argv[index + 1] || options.sourceRoot;
      index += 1;
    } else if (arg.startsWith('--source-root=')) {
      options.sourceRoot = arg.slice('--source-root='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function validateTraces(tracePaths) {
  if (tracePaths.length === 0) {
    return { status: 1, stdout: '', stderr: 'No traces generated.' };
  }
  const result = spawnSync(process.execPath, [
    path.join(__dirname, 'validate-trace.js'),
    '--strict-only',
    '--check-artifacts',
    ...tracePaths
  ], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8'
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function printSummary(results, caseSummaries, validation) {
  console.log(`OSS MLIR corpus smoke output: ${outputRoot}`);
  console.log('case\tstatus\tstages\tartifacts\tsource');
  for (const entry of results) {
    console.log([
      entry.name,
      entry.status,
      entry.stageCount,
      entry.artifactCount,
      entry.sourceUrl
    ].join('\t'));
  }
  console.log('\ncoverage');
  for (const entry of caseSummaries) {
    const attempted = entry.attemptedChunks === undefined ? '' : ` attempted=${entry.attemptedChunks}`;
    const available = entry.availableChunks === undefined ? '' : ` available=${entry.availableChunks}`;
    console.log(`${entry.name}\t${entry.successfulChunks}/${entry.minSuccessfulChunks} required${attempted}${available}`);
  }
  if (validation.stdout.trim()) {
    console.log('\nvalidation');
    console.log(validation.stdout.trim());
  }
  if (validation.stderr.trim()) {
    console.error(validation.stderr.trim());
  }
}

function printUsage() {
  console.log(`Usage: npm run smoke:oss-mlir -- [--source-root <path>]

Collect Pass Lens traces for open-source LLVM MLIR files.

Options:
  --source-root <path>     Optional directory containing llvm/mlir/test files.
                          If set, entries use local files for:
                          Dialect/Arith/canonicalize.mlir, etc.
  --help, -h              Show this help.

Environment:
  PASS_LENS_OSS_SOURCE_ROOT
  PASS_LENS_OSS_SMOKE_DIR
  PASS_LENS_OSS_LLVM_TAG
  PASS_LENS_MLIR_OPT
`);
}

function splitLitSections(text) {
  return text
    .split(/^\/\/ -----\s*$/mu)
    .map((section) => section.trim())
    .filter((section) => section.length > 0 && !section.includes('expected-error'));
}

function resolveCaseSource(entry, effectiveSourceRoot) {
  const defaultSourceUrl = entry.sourceUrl || `${baseUrl}/${entry.source}`;
  if (!effectiveSourceRoot || !entry.source) {
    return { kind: 'remote', sourceUrl: defaultSourceUrl };
  }
  const localPath = path.join(effectiveSourceRoot, entry.source);
  if (fs.existsSync(localPath)) {
    return { kind: 'local', sourcePath: localPath, sourceUrl: `file://${localPath}` };
  }
  return { kind: 'remote', sourceUrl: defaultSourceUrl };
}

function resetDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
}

function countFiles(directory) {
  if (!fs.existsSync(directory)) {
    return 0;
  }
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(fullPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

function download(url, targetPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(response.headers.location, targetPath).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Could not download ${url}: HTTP ${response.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(targetPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
      file.on('error', reject);
    });
    request.on('error', reject);
  });
}

module.exports = {
  splitLitSections,
  parseArgs,
  resolveCaseSource
};

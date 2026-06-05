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
  resetDirectory(outputRoot);
  fs.mkdirSync(path.join(outputRoot, 'inputs'), { recursive: true });
  fs.mkdirSync(path.join(outputRoot, 'traces'), { recursive: true });

  const results = [];
  const caseSummaries = [];
  for (const entry of cases) {
    if (entry.mode === 'litSections') {
      const sectionResult = await runLitSectionCase(entry);
      results.push(...sectionResult.results);
      caseSummaries.push(sectionResult.summary);
    } else {
      const result = await runCase(entry);
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

async function runCase(entry) {
  const sourceUrl = entry.sourceUrl || `${baseUrl}/${entry.source}`;
  const inputPath = path.join(outputRoot, 'inputs', `${entry.name}.mlir`);
  await download(sourceUrl, inputPath);
  return runInput(entry, inputPath, sourceUrl);
}

async function runLitSectionCase(entry) {
  const sourceUrl = `${baseUrl}/${entry.source}`;
  const sourcePath = path.join(outputRoot, 'inputs', `${entry.name}.source.mlir`);
  await download(sourceUrl, sourcePath);
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
    }, inputPath, `${sourceUrl}#section-${sectionIndex}`);
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

function splitLitSections(text) {
  return text
    .split(/^\/\/ -----\s*$/mu)
    .map((section) => section.trim())
    .filter((section) => section.length > 0 && !section.includes('expected-error'));
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
  splitLitSections
};

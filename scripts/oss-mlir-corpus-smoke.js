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
    pipeline: 'builtin.module(canonicalize,cse)',
    args: ['--allow-unregistered-dialect']
  },
  {
    name: 'memref-canonicalize',
    source: 'Dialect/MemRef/canonicalize.mlir',
    pipeline: 'builtin.module(canonicalize,cse)',
    args: ['--allow-unregistered-dialect']
  }
];

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  resetDirectory(outputRoot);
  fs.mkdirSync(path.join(outputRoot, 'inputs'), { recursive: true });
  fs.mkdirSync(path.join(outputRoot, 'traces'), { recursive: true });

  const results = [];
  for (const entry of cases) {
    results.push(await runCase(entry));
  }

  const tracePaths = results
    .filter((entry) => entry.status === 'ok')
    .map((entry) => entry.tracePath);
  const validation = validateTraces(tracePaths);
  const failed = results.filter((entry) => entry.status !== 'ok');

  fs.writeFileSync(path.join(outputRoot, 'results.json'), JSON.stringify({
    llvmTag,
    collector,
    outputRoot,
    results,
    validationExitCode: validation.status
  }, null, 2), 'utf8');

  printSummary(results, validation);
  if (failed.length > 0 || validation.status !== 0) {
    process.exit(1);
  }
}

async function runCase(entry) {
  const sourceUrl = `${baseUrl}/${entry.source}`;
  const inputPath = path.join(outputRoot, 'inputs', `${entry.name}.mlir`);
  const tracePath = path.join(outputRoot, 'traces', `${entry.name}.json`);
  const artifactDir = path.join(outputRoot, 'traces', `${entry.name}-artifacts`);
  const stdoutPath = path.join(outputRoot, 'traces', `${entry.name}.stdout.txt`);
  const stderrPath = path.join(outputRoot, 'traces', `${entry.name}.stderr.txt`);
  fs.mkdirSync(artifactDir, { recursive: true });
  await download(sourceUrl, inputPath);

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

function printSummary(results, validation) {
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
  if (validation.stdout.trim()) {
    console.log('\nvalidation');
    console.log(validation.stdout.trim());
  }
  if (validation.stderr.trim()) {
    console.error(validation.stderr.trim());
  }
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

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const { buildDriverArgs, parseArgs, resolveDriverPath } = require('../scripts/iree-case-study-smoke.js');

test('parseArgs accepts IREE case study smoke flags', () => {
  const previousDriver = process.env.PASS_LENS_IREE_DRIVER;
  const previousPipeline = process.env.PASS_LENS_IREE_PIPELINE;
  const previousCaseDir = process.env.PASS_LENS_IREE_CASE_DIR;
  const previousTimeout = process.env.PASS_LENS_IREE_TIMEOUT_MS;
  try {
    process.env.PASS_LENS_IREE_DRIVER = '/opt/iree/bin/driver';
    process.env.PASS_LENS_IREE_PIPELINE = 'builtin.module(func.func(canonicalize))';
    process.env.PASS_LENS_IREE_CASE_DIR = '/tmp/iree';
    process.env.PASS_LENS_IREE_TIMEOUT_MS = '42000';
    const parsed = parseArgs([
      '--driver', '/tmp/override-driver',
      '--input', '/tmp/input.mlir',
      '--pipeline', 'builtin.module(func.func(cse))',
      '--case-name', 'custom',
      '--output', '/tmp/case',
      '--timeout-ms', '15000',
      '--driver-arg', '--foo',
      '--driver-arg', '--bar',
      '--min-quality', '82'
    ]);
    assert.equal(parsed.driver, '/tmp/override-driver');
    assert.equal(parsed.inputPath, '/tmp/input.mlir');
    assert.equal(parsed.pipeline, 'builtin.module(func.func(cse))');
    assert.equal(parsed.caseName, 'custom');
    assert.equal(parsed.outputRoot, '/tmp/case');
    assert.equal(parsed.timeoutMs, 15000);
    assert.deepEqual(parsed.driverArgs, ['--foo', '--bar']);
    assert.equal(parsed.minQuality, 82);
  } finally {
    if (previousDriver === undefined) {
      delete process.env.PASS_LENS_IREE_DRIVER;
    } else {
      process.env.PASS_LENS_IREE_DRIVER = previousDriver;
    }
    if (previousPipeline === undefined) {
      delete process.env.PASS_LENS_IREE_PIPELINE;
    } else {
      process.env.PASS_LENS_IREE_PIPELINE = previousPipeline;
    }
    if (previousCaseDir === undefined) {
      delete process.env.PASS_LENS_IREE_CASE_DIR;
    } else {
      process.env.PASS_LENS_IREE_CASE_DIR = previousCaseDir;
    }
    if (previousTimeout === undefined) {
      delete process.env.PASS_LENS_IREE_TIMEOUT_MS;
    } else {
      process.env.PASS_LENS_IREE_TIMEOUT_MS = previousTimeout;
    }
  }
});

test('buildDriverArgs emits Pass Lens flags', () => {
  const args = buildDriverArgs({
    driverArgs: ['--foo', '--bar'],
    inputPath: '/tmp/input.mlir',
    pipeline: 'builtin.module(func.func(canonicalize,cse))',
    outputMlir: '/tmp/out.mlir',
    tracePath: '/tmp/trace.json',
    artifactDir: '/tmp/artifacts'
  });
  assert.deepEqual(args, [
    '--foo',
    '--bar',
    '/tmp/input.mlir',
    '--pass-pipeline=builtin.module(func.func(canonicalize,cse))',
    '--pass-lens-trace=/tmp/trace.json',
    '--pass-lens-artifact-dir=/tmp/artifacts',
    '-o',
    '/tmp/out.mlir'
  ]);
});

test('buildDriverArgs omits empty pipeline flag when not provided', () => {
  const args = buildDriverArgs({
    driverArgs: ['--keep'],
    inputPath: path.join(os.tmpdir(), 'input.mlir'),
    pipeline: '   ',
    outputMlir: path.join(os.tmpdir(), 'out.mlir'),
    tracePath: path.join(os.tmpdir(), 'trace.json'),
    artifactDir: path.join(os.tmpdir(), 'artifacts')
  });
  assert.equal(args.some((entry) => entry.startsWith('--pass-pipeline=')), false);
  assert.equal(args[0], '--keep');
  assert.equal(args[1], path.join(os.tmpdir(), 'input.mlir'));
});

test('resolveDriverPath resolves explicit executable paths', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'iree-driver-explicit-'));
  try {
    const driver = path.join(tmpRoot, 'iree-case-driver');
    fs.writeFileSync(driver, 'exit 0', 'utf8');
    const found = resolveDriverPath(driver);
    assert.equal(found, driver);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('resolveDriverPath finds driver from PATH', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'iree-driver-path-'));
  const originalPath = process.env.PATH;
  const originalPathExt = process.env.PATHEXT;
  try {
    const command = 'iree-pass-lens-driver';
    const driverName = process.platform === 'win32'
      ? `${command}.exe`
      : command;
    const driver = path.join(tmpRoot, driverName);
    fs.writeFileSync(driver, 'exit 0', 'utf8');

    process.env.PATH = `${tmpRoot}${path.delimiter}${originalPath}`;
    if (process.platform === 'win32') {
      process.env.PATHEXT = '.exe;.cmd;.bat;.com';
    }

    const found = resolveDriverPath(command);
    assert.equal(found, driver);
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalPathExt === undefined) {
      delete process.env.PATHEXT;
    } else {
      process.env.PATHEXT = originalPathExt;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('smoke script validates a structured downstream driver fixture', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-iree-mock-'));
  try {
    const inputPath = path.join(root, 'input.mlir');
    const outputRoot = path.join(root, 'case-dir');
    const mockDriverPath = path.join(root, 'mock-pass-lens-driver.js');
    const caseName = 'mock-downstream';

    fs.mkdirSync(outputRoot, { recursive: true });
    fs.writeFileSync(inputPath, 'module { func.func @main() { return } }', 'utf8');
const mockDriverContent = `
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
let tracePath = '';
let artifactDir = '';
let outputMlir = '';

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg.startsWith('--pass-lens-trace=')) {
    tracePath = arg.slice('--pass-lens-trace='.length);
  } else if (arg.startsWith('--pass-lens-artifact-dir=')) {
    artifactDir = arg.slice('--pass-lens-artifact-dir='.length);
  } else if (arg === '-o' && args[i + 1]) {
    outputMlir = args[i + 1];
    i += 1;
  }
}

if (!tracePath) {
  process.exit(1);
}

const traceDirectory = path.dirname(tracePath);
const artifactRelDir = artifactDir || 'mock-artifacts';
const resolvedArtifactDir = path.isAbsolute(artifactRelDir)
  ? artifactRelDir
  : path.join(traceDirectory, artifactRelDir);
const trace = {
  schemaVersion: 1,
  tool: 'mock-downstream-driver',
  command: 'mock-downstream-driver',
  provenance: { kind: 'live-pass-instrumentation', description: 'mocked downstream run' },
  capture: { ir: 'artifact', metrics: true, timing: true },
  input: '${path.toNamespacedPath(inputPath)}',
  pipeline: 'builtin.module(func.func(canonicalize,cse))',
  stages: [
    {
      index: 0,
      pass: 'canonicalize',
      status: 'changed',
      changed: true,
      durationMs: 1.0,
      verifier: 'ok',
      opName: 'builtin.module',
      argument: 'canonicalize',
      metricsBefore: { ops: 7 },
      metricsAfter: { ops: 9 },
      artifacts: {
        beforePath: artifactRelDir + '/stage-000000.before.mlir',
        afterPath: artifactRelDir + '/stage-000000.after.mlir'
      }
    }
  ]
};

fs.mkdirSync(path.dirname(tracePath), { recursive: true });
if (artifactDir) {
  fs.mkdirSync(resolvedArtifactDir, { recursive: true });
  fs.writeFileSync(path.join(resolvedArtifactDir, 'stage-000000.before.mlir'), '(before)', 'utf8');
  fs.writeFileSync(path.join(resolvedArtifactDir, 'stage-000000.after.mlir'), '(after)', 'utf8');
}

fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2), 'utf8');
if (outputMlir) {
  fs.writeFileSync(outputMlir, 'module {}', 'utf8');
}
process.exit(0);
`;
    fs.writeFileSync(mockDriverPath, mockDriverContent, 'utf8');

    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), 'scripts', 'iree-case-study-smoke.js'),
      '--driver', process.execPath,
      '--driver-arg', mockDriverPath,
      '--input', inputPath,
      '--pipeline', 'builtin.module(func.func(canonicalize,cse))',
      '--case-name', caseName,
      '--output', outputRoot
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, `expected script success, got: ${result.stdout}\\n${result.stderr}`);
    const summaryPath = path.join(outputRoot, 'summary.json');
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    assert.equal(summary.case, caseName);
    assert.equal(summary.driver, process.execPath);
    assert.equal(summary.exitCode, 0);
    assert.equal(summary.stageCount, 1);
    assert.equal(summary.provenanceKind, 'live-pass-instrumentation');
    assert.equal(summary.errors.length, 0);
    assert.equal(typeof summary.qualityScore, 'number');

    const outputTrace = path.join(outputRoot, `${caseName}.trace.json`);
    assert.ok(fs.existsSync(outputTrace));
    const trace = JSON.parse(fs.readFileSync(outputTrace, 'utf8'));
    assert.equal(trace.stages.length, 1);
    assert.equal(trace.stages[0].artifacts.beforePath, `${caseName}-artifacts/stage-000000.before.mlir`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

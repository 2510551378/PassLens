const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildDriverArgs, parseArgs } = require('../scripts/iree-case-study-smoke.js');

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
      '--driver-arg', '--bar'
    ]);
    assert.equal(parsed.driver, '/tmp/override-driver');
    assert.equal(parsed.inputPath, '/tmp/input.mlir');
    assert.equal(parsed.pipeline, 'builtin.module(func.func(cse))');
    assert.equal(parsed.caseName, 'custom');
    assert.equal(parsed.outputRoot, '/tmp/case');
    assert.equal(parsed.timeoutMs, 15000);
    assert.deepEqual(parsed.driverArgs, ['--foo', '--bar']);
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

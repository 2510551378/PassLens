const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseArgs,
  resolveTargets
} = require('../scripts/downstream-case-studies-smoke.js');

test('parseArgs handles iree flag', () => {
  const options = parseArgs(['--iree']);
  assert.equal(options.all, false);
  assert.equal(options.forceIree, true);
  assert.equal(options.forceTorch, false);
  assert.equal(options.failFast, false);
});

test('parseArgs handles fail-fast flag', () => {
  const options = parseArgs(['--torch', '--fail-fast']);
  assert.equal(options.forceTorch, true);
  assert.equal(options.failFast, true);
  assert.equal(options.all, false);
});

test('resolveTargets respects forced selection without driver env', () => {
  const previousTorchDriver = process.env.PASS_LENS_TORCH_MLIR_DRIVER;
  const previousIreeDriver = process.env.PASS_LENS_IREE_DRIVER;
  try {
    delete process.env.PASS_LENS_TORCH_MLIR_DRIVER;
    delete process.env.PASS_LENS_IREE_DRIVER;
    const targets = resolveTargets(parseArgs(['--iree']));
    assert.equal(targets.length, 0);
  } finally {
    if (previousTorchDriver === undefined) {
      delete process.env.PASS_LENS_TORCH_MLIR_DRIVER;
    } else {
      process.env.PASS_LENS_TORCH_MLIR_DRIVER = previousTorchDriver;
    }
    if (previousIreeDriver === undefined) {
      delete process.env.PASS_LENS_IREE_DRIVER;
    } else {
      process.env.PASS_LENS_IREE_DRIVER = previousIreeDriver;
    }
  }
});

test('resolveTargets selects both when env is present', () => {
  const previousTorchDriver = process.env.PASS_LENS_TORCH_MLIR_DRIVER;
  const previousIreeDriver = process.env.PASS_LENS_IREE_DRIVER;
  try {
    process.env.PASS_LENS_TORCH_MLIR_DRIVER = '/tmp/torch-driver';
    process.env.PASS_LENS_IREE_DRIVER = '/tmp/iree-driver';
    const targets = resolveTargets(parseArgs([]));
    assert.equal(targets.length, 2);
    assert.equal(targets[0].key, 'iree');
    assert.equal(targets[1].key, 'torch');
  } finally {
    if (previousTorchDriver === undefined) {
      delete process.env.PASS_LENS_TORCH_MLIR_DRIVER;
    } else {
      process.env.PASS_LENS_TORCH_MLIR_DRIVER = previousTorchDriver;
    }
    if (previousIreeDriver === undefined) {
      delete process.env.PASS_LENS_IREE_DRIVER;
    } else {
      process.env.PASS_LENS_IREE_DRIVER = previousIreeDriver;
    }
  }
});

test('parseArgs rejects unknown option', () => {
  assert.throws(
    () => parseArgs(['--unknown']),
    /Unknown argument/
  );
});


const assert = require('node:assert/strict');
const test = require('node:test');

const { parseArgs } = require('../scripts/heir-case-study-smoke.js');

test('parseArgs accepts HEIR case study smoke options', () => {
  const options = parseArgs([
    '--heir-root',
    '/tmp/heir',
    '--heir-opt',
    '/tmp/heir/bazel-bin/tools/heir-opt',
    '--output',
    '/tmp/passlens-heir',
    '--timeout-ms',
    '3000'
  ]);

  assert.equal(options.heirRoot, '/tmp/heir');
  assert.equal(options.heirOpt, '/tmp/heir/bazel-bin/tools/heir-opt');
  assert.equal(options.outputRoot, '/tmp/passlens-heir');
  assert.equal(options.timeoutMs, 3000);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const node = process.execPath;
const cli = path.join(process.cwd(), 'scripts', 'validate-trace.js');

test('validate-trace CLI accepts a bundled live collector sample', () => {
  const result = spawnSync(node, [
    cli,
    '--strict-only',
    path.join('sample-traces', 'mlir-live-pass-instrumentation.json')
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ok:/);
});

test('validate-trace CLI rejects malformed trace JSON', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-cli-'));
  const tracePath = path.join(tempDir, 'bad-trace.json');
  fs.writeFileSync(tracePath, JSON.stringify({ schemaVersion: 2, stages: [] }), 'utf8');

  const result = spawnSync(node, [cli, tracePath], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /failed:/);
  assert.match(result.stdout, /\$\.schemaVersion/);
});

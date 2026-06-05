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

test('validate-trace CLI discovers trace JSON files in directories and skips artifact metadata', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-cli-dir-'));
  const tracePath = path.join(tempDir, 'trace.json');
  const artifactsDir = path.join(tempDir, 'artifacts');
  fs.mkdirSync(artifactsDir);
  fs.writeFileSync(tracePath, JSON.stringify({
    schemaVersion: 1,
    provenance: {
      kind: 'hand-authored',
      description: 'directory discovery test'
    },
    stages: [
      {
        index: 0,
        pass: 'canonicalize'
      }
    ]
  }), 'utf8');
  fs.writeFileSync(path.join(artifactsDir, 'metadata.json'), JSON.stringify({
    generatedBy: 'not-a-pass-lens-trace'
  }), 'utf8');

  const result = spawnSync(node, [cli, '--strict-only', tempDir], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ok:/);
  assert.match(result.stdout, /trace\.json/);
  assert.doesNotMatch(result.stdout, /metadata\.json/);
});

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
  parseArgs,
  TARGETS
} = require('../scripts/release-publish.js');

test('parseArgs parses default dry-run marketplace target', () => {
  const options = parseArgs(['marketplace']);
  assert.equal(options.target, 'marketplace');
  assert.equal(options.dryRun, true);
  assert.equal(options.root, process.cwd());
  assert.equal(TARGETS[options.target].command, 'vsce');
});

test('parseArgs supports explicit --target and --execute', () => {
  const options = parseArgs(['--target', 'open-vsx', '--execute', '--root', 'repo']);

  assert.equal(options.target, 'open-vsx');
  assert.equal(options.dryRun, false);
  assert.equal(options.root, 'repo');
});

test('parseArgs supports explicit --dry-run', () => {
  const options = parseArgs(['--target', 'marketplace', '--dry-run', '--root', 'repo']);

  assert.equal(options.target, 'marketplace');
  assert.equal(options.dryRun, true);
  assert.equal(options.root, 'repo');
});

test('parseArgs rejects unknown target', () => {
  assert.throws(() => {
    parseArgs(['bad-target']);
  }, /Invalid target 'bad-target'/);
});

test('release publish fails in dry-run when the VSIX package is missing', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-release-missing-vsix-'));
  const packageJson = {
    name: 'pass-lens',
    version: '0.0.1'
  };
  const packagePath = path.join(tempDir, 'package.json');
  fs.writeFileSync(packagePath, JSON.stringify(packageJson), 'utf8');

  try {
    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), 'scripts', 'release-publish.js'),
      'marketplace',
      '--root',
      tempDir
    ], {
      encoding: 'utf8'
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr + result.stdout, /Release package missing: pass-lens-0\.0\.1\.vsix/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('release publish supports dry-run and execute token gating', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-release-token-'));
  const vsixName = 'pass-lens-0.0.1.vsix';
  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
    name: 'pass-lens',
    version: '0.0.1'
  }), 'utf8');
  fs.writeFileSync(path.join(tempDir, vsixName), 'binary', 'utf8');

  try {
    const dryRun = spawnSync(process.execPath, [
      path.join(process.cwd(), 'scripts', 'release-publish.js'),
      'marketplace',
      '--root',
      tempDir
    ], {
      encoding: 'utf8'
    });
    assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
    assert.match(dryRun.stderr + dryRun.stdout, /\[dry-run\] release publish plan/);

    const execute = spawnSync(process.execPath, [
      path.join(process.cwd(), 'scripts', 'release-publish.js'),
      'open-vsx',
      '--root',
      tempDir,
      '--execute'
    ], {
      encoding: 'utf8',
      env: { ...process.env }
    });
    assert.equal(execute.status, 1, execute.stderr || execute.stdout);
    assert.match(execute.stderr + execute.stdout, /Missing OVSX_PAT/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

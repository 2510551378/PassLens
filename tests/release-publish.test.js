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

test('parseArgs supports --json and --output', () => {
  const options = parseArgs(['open-vsx', '--json', '--output', 'artifacts/publish.json']);

  assert.equal(options.target, 'open-vsx');
  assert.equal(options.dryRun, true);
  assert.equal(options.json, true);
  assert.equal(options.output, 'artifacts/publish.json');
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

test('release publish dry-run supports json output', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-release-json-'));
  const vsixName = 'pass-lens-0.0.1.vsix';
  const outputPath = path.join(tempDir, 'publish-plan.json');

  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
    name: 'pass-lens',
    version: '0.0.1'
  }), 'utf8');
  fs.writeFileSync(path.join(tempDir, vsixName), 'binary', 'utf8');

  const commandName = process.platform === 'win32' ? 'vsce.cmd' : 'vsce';
  const fakePathDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-fake-vsce-'));
  const fakeCommandPath = path.join(fakePathDir, commandName);
  fs.writeFileSync(
    fakeCommandPath,
    process.platform === 'win32'
      ? '@echo off\r\nexit /b 0\r\n'
      : '#!/bin/sh\necho publish ok\n',
    'utf8'
  );
  if (process.platform !== 'win32') {
    fs.chmodSync(fakeCommandPath, 0o755);
  }

  try {
    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), 'scripts', 'release-publish.js'),
      '--target',
      'marketplace',
      '--root',
      tempDir,
      '--json',
      '--output',
      outputPath
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        VSCE_PAT: 'token-for-json',
        PATH: `${fakePathDir}${path.delimiter}${process.env.PATH ?? ''}`
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payloadText = fs.readFileSync(outputPath, 'utf8');
    const payload = JSON.parse(payloadText);
    assert.equal(payload.mode, 'dry-run');
    assert.equal(payload.target, 'marketplace');
    assert.equal(payload.requiredEnv, 'VSCE_PAT');
    assert.equal(payload.tokenAvailable, true);
    assert.equal(payload.ok, true);
    assert.equal(payload.vsix, path.join(tempDir, 'pass-lens-0.0.1.vsix'));
    assert.ok(Array.isArray(payload.args));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(fakePathDir, { recursive: true, force: true });
  }
});

test('release publish supports dry-run and execute token gating', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-release-token-'));
  const vsixName = 'pass-lens-0.0.1.vsix';
  const pathDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-release-fake-command-'));

  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
    name: 'pass-lens',
    version: '0.0.1'
  }), 'utf8');
  fs.writeFileSync(path.join(tempDir, vsixName), 'binary', 'utf8');

  try {
    const commandLines = process.platform === 'win32'
      ? ['ovsx.cmd', 'vsce.cmd']
      : ['ovsx', 'vsce'];
    for (const commandName of commandLines) {
      const fakeCommandPath = path.join(pathDir, commandName);
      fs.writeFileSync(
        fakeCommandPath,
        process.platform === 'win32'
          ? '@echo off\nexit /b 0\n'
          : '#!/bin/sh\necho publish ok\n',
        'utf8'
      );
      if (process.platform !== 'win32') {
        fs.chmodSync(fakeCommandPath, 0o755);
      }
    }

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
      env: {
        ...process.env,
        OVSX_PAT: '',
        PATH: `${pathDir}${path.delimiter}${process.env.PATH ?? ''}`
      }
    });
    assert.equal(execute.status, 1, execute.stderr || execute.stdout);
    assert.match(execute.stderr + execute.stdout, /Missing OVSX_PAT/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(pathDir, { recursive: true, force: true });
  }
});

test('release publish execute requires publish command on PATH', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-release-command-'));
  const vsixName = 'pass-lens-0.0.1.vsix';
  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
    name: 'pass-lens',
    version: '0.0.1'
  }), 'utf8');
  fs.writeFileSync(path.join(tempDir, vsixName), 'binary', 'utf8');

  try {
    const executeWithoutPath = spawnSync(process.execPath, [
      path.join(process.cwd(), 'scripts', 'release-publish.js'),
      'marketplace',
      '--root',
      tempDir,
      '--execute'
    ], {
      encoding: 'utf8',
      env: { ...process.env, VSCE_PAT: 'test-token', PATH: '' }
    });
    assert.equal(executeWithoutPath.status, 1, executeWithoutPath.stderr || executeWithoutPath.stdout);
    assert.match(executeWithoutPath.stderr + executeWithoutPath.stdout, /Publish command 'vsce' was not found on PATH/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

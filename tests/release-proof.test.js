const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { buildReleaseProof, parseArgs } = require('../scripts/release-proof');
const cli = path.join(process.cwd(), 'scripts', 'release-proof.js');

test('parseArgs accepts root and json/output options', () => {
  const options = parseArgs([
    '--root',
    '/tmp/pass-lens',
    '--json',
    '--output',
    'artifacts/release-proof.json'
  ]);

  assert.equal(options.root, '/tmp/pass-lens');
  assert.equal(options.json, true);
  assert.equal(options.output, 'artifacts/release-proof.json');
});

test('parseArgs tolerates npm-style -- separator', () => {
  const options = parseArgs(['--', '--root', '/tmp/pass-lens', '--json', '--output', 'artifacts/release-proof.json']);

  assert.equal(options.root, '/tmp/pass-lens');
  assert.equal(options.json, true);
  assert.equal(options.output, 'artifacts/release-proof.json');
});

test('parseArgs treats single positional path as output when --json is active', () => {
  const options = parseArgs(['--root', '.', '--json', 'artifacts/release-proof-positional.json']);

  assert.equal(options.root, '.');
  assert.equal(options.json, true);
  assert.equal(options.output, 'artifacts/release-proof-positional.json');
  assert.equal(options.requireTokens, false);
});

test('parseArgs accepts require-tokens flag', () => {
  const options = parseArgs(['--root', '.', '--json', '--require-tokens']);

  assert.equal(options.root, '.');
  assert.equal(options.json, true);
  assert.equal(options.requireTokens, true);
});

test('release proof CLI fails when publish readiness requires tokens but tokens are missing', () => {
  const result = spawnSync(process.execPath, [
    cli,
    '--json',
    '--require-tokens'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Publish readiness check failed/);
});

test('release proof CLI succeeds with require-tokens when all target prerequisites exist', () => {
  const fakeCommandDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-proof-ready-'));
  const fakeCommandName = process.platform === 'win32' ? 'vsce.cmd' : 'vsce';
  const fakeOpenVsxName = process.platform === 'win32' ? 'ovsx.cmd' : 'ovsx';
  const fakeVsce = path.join(fakeCommandDir, fakeCommandName);
  const fakeOvsx = path.join(fakeCommandDir, fakeOpenVsxName);
  const scriptContent = process.platform === 'win32'
    ? '@echo off\r\nexit /b 0\r\n'
    : '#!/bin/sh\necho release publish fake ok\nexit 0\n';

  fs.writeFileSync(fakeVsce, scriptContent, 'utf8');
  fs.writeFileSync(fakeOvsx, scriptContent, 'utf8');
  if (process.platform !== 'win32') {
    fs.chmodSync(fakeVsce, 0o755);
    fs.chmodSync(fakeOvsx, 0o755);
  }

  try {
    const result = spawnSync(process.execPath, [
      cli,
      '--json',
      '--require-tokens',
      '--root',
      process.cwd()
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeCommandDir}${path.delimiter}${process.env.PATH ?? ''}`,
        VSCE_PAT: 'token',
        OVSX_PAT: 'token'
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.publishReady, true);
    assert.equal(report.blockers, 0);
    assert.equal(report.summary.readyTargets, 2);
  } finally {
    fs.rmSync(fakeCommandDir, { recursive: true, force: true });
  }
});

test('buildReleaseProof returns publish readiness payload for repository context', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const fakeCommandDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-proof-cmd-'));
  const outputPath = path.join(os.tmpdir(), 'release-proof.json');

  const commandName = process.platform === 'win32' ? 'vsce.cmd' : 'vsce';
  const ovsxName = process.platform === 'win32' ? 'ovsx.cmd' : 'ovsx';
  const vscePath = path.join(fakeCommandDir, commandName);
  const ovsxPath = path.join(fakeCommandDir, ovsxName);

  fs.writeFileSync(
    vscePath,
    process.platform === 'win32' ? '@echo off\r\nexit /b 0\r\n' : '#!/bin/sh\necho publish ok\n',
    'utf8'
  );
  fs.writeFileSync(
    ovsxPath,
    process.platform === 'win32' ? '@echo off\r\nexit /b 0\r\n' : '#!/bin/sh\necho publish ok\n',
    'utf8'
  );

  if (process.platform !== 'win32') {
    fs.chmodSync(vscePath, 0o755);
    fs.chmodSync(ovsxPath, 0o755);
  }

  const originalPath = process.env.PATH;
  const originalVscePat = process.env.VSCE_PAT;
  const originalOvsxPat = process.env.OVSX_PAT;

  try {
    process.env.PATH = `${fakeCommandDir}${path.delimiter}${process.env.PATH ?? ''}`;
    process.env.VSCE_PAT = '';
    process.env.OVSX_PAT = '';

    const proof = buildReleaseProof(repoRoot);
    assert.equal(proof.package.name, packageJson.name);
    assert.equal(proof.package.version, packageJson.version);
    assert.equal(proof.vsix.path, path.join(repoRoot, `${packageJson.name}-${packageJson.version}.vsix`));
    assert.equal(proof.vsix.exists, true);
    assert.equal(proof.releaseCheck.ok, true);
    assert.equal(proof.publishPlans.length, 2);
    assert.equal(proof.publishPlans[0].target, 'marketplace');
    assert.equal(proof.publishPlans[1].target, 'open-vsx');
    assert.equal(proof.publishPlans[0].blocked, false);
    assert.equal(proof.publishPlans[1].blocked, false);
    assert.equal(proof.publishPlans[0].canExecute, false);
    assert.equal(proof.publishPlans[1].canExecute, false);

    const payload = {
      ...proof,
      summary: proof.publishPlans.length
    };
    fs.writeFileSync(outputPath, JSON.stringify(payload), 'utf8');
    const roundtrip = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(roundtrip.summary, 2);
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalVscePat === undefined) {
      delete process.env.VSCE_PAT;
    } else {
      process.env.VSCE_PAT = originalVscePat;
    }
    if (originalOvsxPat === undefined) {
      delete process.env.OVSX_PAT;
    } else {
      process.env.OVSX_PAT = originalOvsxPat;
    }
    fs.rmSync(outputPath, { force: true });
    fs.rmSync(fakeCommandDir, { recursive: true, force: true });
  }
});

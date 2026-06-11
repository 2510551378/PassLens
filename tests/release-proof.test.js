const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildReleaseProof, parseArgs } = require('../scripts/release-proof');

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

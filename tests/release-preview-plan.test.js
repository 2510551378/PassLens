const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { buildPublishPlan, listPublishPlans } = require('../scripts/release-publish');
const { isExecutable, parseArgs } = require('../scripts/release-preview-plan');

test('parseArgs parses json and output options', () => {
  const tempOutput = path.join(os.tmpdir(), 'pass-lens-release-preview-plan.json');
  const options = parseArgs(['--json', '--root', 'repo', '--output', tempOutput]);
  assert.equal(options.json, true);
  assert.equal(options.root, 'repo');
  assert.equal(options.output, tempOutput);
});

test('parseArgs tolerates npm-style -- separator', () => {
  const tempOutput = path.join(os.tmpdir(), 'pass-lens-release-preview-plan-sep.json');
  const options = parseArgs(['--', '--output', tempOutput, '--json']);
  assert.equal(options.json, true);
  assert.equal(options.output, tempOutput);
});

test('parseArgs treats single positional path as output when --json is active', () => {
  const tempOutput = path.join(os.tmpdir(), 'pass-lens-release-preview-plan-positional.json');
  const options = parseArgs(['--json', tempOutput]);
  assert.equal(options.json, true);
  assert.equal(options.output, tempOutput);
});

test('isExecutable reflects required environment token availability', () => {
  const plan = {
    target: 'marketplace',
    requiredEnv: 'VSCE_PAT',
    command: 'vsce',
    args: [],
    vsix: '/tmp/pass-lens.vsix'
  };
  const previous = process.env.VSCE_PAT;
  try {
    process.env.VSCE_PAT = 'token';
    assert.equal(isExecutable(plan, process.cwd()), true);
    delete process.env.VSCE_PAT;
    assert.equal(isExecutable(plan, process.cwd()), false);
  } finally {
    if (previous === undefined) {
      delete process.env.VSCE_PAT;
    } else {
      process.env.VSCE_PAT = previous;
    }
  }
});

test('release preview plan command returns json and includes both targets', () => {
  const root = process.cwd();
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'release-preview-plan.js'),
    '--json'
  ], {
    cwd: root,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const stdout = result.stderr + result.stdout;
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.plans.length, 2);
  assert.equal(parsed.plans[0].target !== undefined, true);
  assert.equal(parsed.plans.every((item) => item.target && (item.command || item.error)), true);
  assert.match(stdout, /marketplace/);
  assert.match(stdout, /open-vsx/);

  const hasVsceToken = Boolean(process.env.VSCE_PAT);
  const hasOpenVsxToken = Boolean(process.env.OVSX_PAT);
  for (const plan of parsed.plans) {
    if (plan.error) {
      assert.equal(plan.canExecute, false, `${plan.target} should not be executable when plan has an error`);
      continue;
    }
    if (plan.target === 'marketplace') {
      assert.equal(plan.canExecute, hasVsceToken, 'marketplace plan should reflect VSCE_PAT presence');
    }
    if (plan.target === 'open-vsx') {
      assert.equal(plan.canExecute, hasOpenVsxToken, 'open-vsx plan should reflect OVSX_PAT presence');
    }
  }
});

test('release preview plan command writes json summary to output path', () => {
  const root = process.cwd();
  const output = path.join(os.tmpdir(), `pass-lens-preview-plan-${Date.now()}.json`);

  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'release-preview-plan.js'),
    '--json',
    '--output',
    output
  ], {
    cwd: root,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(output), true);
  const text = fs.readFileSync(output, 'utf8');
  const parsed = JSON.parse(text);
  assert.equal(Array.isArray(parsed.plans), true);
  assert.equal(parsed.plans.length, 2);
  fs.unlinkSync(output);
});

test('release preview plan creates missing output directories', () => {
  const root = process.cwd();
  const output = path.join(
    os.tmpdir(),
    'pass-lens-release-preview',
    'nested',
    `plan-${Date.now()}.json`
  );

  try {
    const result = spawnSync(process.execPath, [
      path.join(root, 'scripts', 'release-preview-plan.js'),
      '--json',
      '--output',
      output
    ], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(fs.existsSync(output), true);
  } finally {
    const nestedDir = path.join(os.tmpdir(), 'pass-lens-release-preview');
    if (fs.existsSync(nestedDir)) {
      fs.rmSync(nestedDir, { recursive: true, force: true });
    }
  }
});

test('buildPublishPlan requires package artifact before returning command', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-release-preview-'));
  const previousDir = process.cwd();
  try {
    process.chdir(tempDir);
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'pass-lens', version: '0.0.1' }),
      'utf8'
    );
    assert.throws(
      () => buildPublishPlan({ target: 'marketplace', root: tempDir }),
      /Release package missing/
    );
    assert.equal(listPublishPlans(tempDir).length, 2);
  } finally {
    process.chdir(previousDir);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

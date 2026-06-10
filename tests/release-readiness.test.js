const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const {
  checkReleaseReadiness,
  parseArgs
} = require('../scripts/release-readiness.js');

const node = process.execPath;
const cli = path.join(process.cwd(), 'scripts', 'release-readiness.js');

test('release readiness passes for the repository public entry points', () => {
  const report = checkReleaseReadiness(process.cwd());

  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.errors.length, 0);
  assert.ok(report.warnings.some((warning) => warning.includes('Marketplace preview')));
  assert.ok(report.checks.some((check) => check.id === 'package:scripts.release:check'));
  assert.ok(report.checks.some((check) => check.id === 'package:scripts.release:smoke'));
  assert.ok(report.checks.some((check) => check.id === 'package:scripts.release:preview:plan'));
  assert.ok(report.checks.some((check) => check.id === 'package:scripts.release:preflight'));
  assert.ok(report.checks.some((check) => check.id === 'package:scripts.release:publish:marketplace'));
  assert.ok(report.checks.some((check) => check.id === 'package:scripts.release:publish:open-vsx'));
  assert.ok(report.checks.some((check) => check.id === 'sample-provenance:live-pass-instrumentation'));
  assert.ok(report.checks.some((check) => check.id === 'release:provenance-doc-sync'));
  assert.ok(report.checks.some((check) => check.id === 'release-doc:Open VSX'));
});

test('release readiness strict mode treats roadmap blockers as hard failures', () => {
  const report = checkReleaseReadiness(process.cwd(), { strict: true });
  assert.equal(report.ok, false);
  assert.equal(report.strict, true);
  assert.equal(report.errors.length > 0, true);
  assert.ok(report.errors.some((error) => error.includes('release blocker')));
  assert.ok(report.checks.some((check) => check.id === 'release-blocker:marketplace-preview'));
  assert.ok(report.checks.some((check) => check.id === 'release-blocker:open-vsx-preview'));
  assert.ok(report.checks.some((check) => check.id === 'release-blocker:demo-gif'));
});

test('release readiness CLI emits machine-readable JSON', () => {
  const result = spawnSync(node, [cli, '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.packageVersion, '0.1.0');
});

test('parseArgs accepts explicit root and JSON mode', () => {
  const options = parseArgs(['--json', '--root', 'repo']);

  assert.deepEqual(options, {
    json: true,
    strict: false,
    root: 'repo'
  });
});

test('parseArgs accepts strict release mode', () => {
  const options = parseArgs(['--strict-release']);

  assert.deepEqual(options, {
    json: false,
    strict: true,
    root: process.cwd()
  });
});

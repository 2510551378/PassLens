const assert = require('node:assert/strict');
const path = require('node:path');
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

test('parseArgs rejects unknown target', () => {
  assert.throws(() => {
    parseArgs(['bad-target']);
  }, /Invalid target 'bad-target'/);
});

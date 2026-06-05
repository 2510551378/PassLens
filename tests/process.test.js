const assert = require('node:assert/strict');
const test = require('node:test');

const {
  formatCommand,
  runProcess,
  trimOutput
} = require('../out/process.js');

test('formatCommand quotes arguments with whitespace or quotes', () => {
  const command = formatCommand('tool', ['plain', 'two words', 'say "hi"']);

  assert.equal(command, 'tool plain "two words" "say \\"hi\\""');
});

test('trimOutput trims empty output and bounds long diagnostics', () => {
  assert.equal(trimOutput('   \n  '), undefined);
  assert.equal(trimOutput('  hello\n'), 'hello');
  assert.equal(trimOutput('x'.repeat(9000))?.length, 8000);
});

test('runProcess captures stdout stderr and exit code', async () => {
  const script = [
    'process.stdout.write("out");',
    'process.stderr.write("err");',
    'process.exit(3);'
  ].join('');
  const result = await runProcess(process.execPath, ['-e', script]);

  assert.equal(result.exitCode, 3);
  assert.equal(result.stdout, 'out');
  assert.equal(result.stderr, 'err');
});

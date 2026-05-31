const assert = require('node:assert/strict');
const test = require('node:test');

const { computeMetrics, parseMlirDumps } = require('../out/mlirCollector.js');

test('parseMlirDumps extracts before and after dump blocks', () => {
  const stderr = [
    'note: diagnostic before dump',
    '// -----// IR Dump Before Canonicalizer (canonicalize) //----- //',
    'module {',
    '  func.func @main() {',
    '    return',
    '  }',
    '}',
    '// -----// IR Dump After Canonicalizer (canonicalize) //----- //',
    'module {',
    '  func.func @main() {',
    '    return',
    '  }',
    '}'
  ].join('\n');

  const blocks = parseMlirDumps(stderr);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].phase, 'Before');
  assert.equal(blocks[0].pass, 'Canonicalizer (canonicalize)');
  assert.equal(blocks[1].phase, 'After');
  assert.match(blocks[1].ir, /func\.func @main/);
});

test('computeMetrics counts MLIR-like operation names and ignores locations', () => {
  const metrics = computeMetrics([
    'module {',
    '  func.func @main() {',
    '    %0 = arith.constant 0 : i32 loc("x")',
    '    %1 = arith.addi %0, %0 : i32',
    '    return',
    '  }',
    '}'
  ].join('\n'));

  assert.equal(metrics.lines, 7);
  assert.equal(metrics.ops, 3);
  assert.equal(metrics['func.func'], 1);
  assert.equal(metrics['arith.constant'], 1);
  assert.equal(metrics['arith.addi'], 1);
  assert.equal(metrics['loc."x"'], undefined);
  assert.equal(metrics.functions, 1);
});

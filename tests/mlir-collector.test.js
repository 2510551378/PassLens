const assert = require('node:assert/strict');
const test = require('node:test');

const { computeMetrics, createMlirDumpTrace, parseMlirDumps } = require('../out/mlirCollector.js');

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

test('createMlirDumpTrace preserves converted-dump provenance and builds stages', () => {
  const dumpText = [
    '// -----// IR Dump Before HEIR Lowering: mlir-to-ckks //----- //',
    'module {',
    '  func.func @main() { return }',
    '}',
    '// -----// IR Dump After HEIR Lowering: mlir-to-ckks //----- //',
    'module {',
    '  func.func @main() {',
    '    "ckks.rotate"() : () -> ()',
    '    return',
    '  }',
    '}'
  ].join('\n');
  const trace = createMlirDumpTrace({
    inputText: 'module {}',
    dumpText,
    tool: 'heir-opt',
    input: 'input.mlir',
    pipeline: '--mlir-to-ckks',
    command: 'heir-opt input.mlir --mlir-to-ckks',
    exitCode: 0,
    provenance: {
      kind: 'converted-dump',
      description: 'unit test'
    }
  });

  assert.equal(trace.tool, 'heir-opt');
  assert.equal(trace.provenance.kind, 'converted-dump');
  assert.equal(trace.capture.ir, 'inline');
  assert.equal(trace.capture.timing, false);
  assert.equal(trace.stages.length, 1);
  assert.equal(trace.stages[0].pass, 'mlir-to-ckks');
  assert.equal(trace.stages[0].changed, true);
  assert.equal(trace.stages[0].metricsAfter['ckks.rotate'], 1);
  assert.match(trace.diagnostics, /Textual MLIR dump collection/);
});

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildMlirPipelinePrefix,
  createMinimalFailingPrefixReport,
  parseMlirTextualPipeline,
  runPrefixBisect,
  runWithVerifyEach
} = require('../out/rerun.js');

function makeRunner(failingPassCount) {
  const attempts = [];
  return {
    attempts,
    async runPipeline(request) {
      attempts.push(request);
      const failed = request.passCount >= failingPassCount;
      return {
        pipeline: request.pipeline,
        passCount: request.passCount,
        verifyEach: request.verifyEach,
        exitCode: failed ? 1 : 0,
        failed,
        commandLine: `pass-lens-mlir-opt input.mlir --pass-pipeline=${request.pipeline}`,
        diagnostics: failed ? `failed at prefix ${request.passCount}` : undefined,
        tracePath: `trace-${request.passCount}.json`
      };
    }
  };
}

test('parseMlirTextualPipeline extracts wrapper chain and pass list', () => {
  const parsed = parseMlirTextualPipeline('builtin.module(func.func(canonicalize,cse,convert-to-llvm{index-bitwidth=64}))');

  assert.deepEqual(parsed.wrappers, ['builtin.module', 'func.func']);
  assert.deepEqual(parsed.passes, [
    'canonicalize',
    'cse',
    'convert-to-llvm{index-bitwidth=64}'
  ]);
});

test('buildMlirPipelinePrefix preserves textual wrappers', () => {
  const pipeline = 'builtin.module(func.func(canonicalize,cse,convert-to-llvm))';

  assert.equal(buildMlirPipelinePrefix(pipeline, 1), 'builtin.module(func.func(canonicalize))');
  assert.equal(buildMlirPipelinePrefix(pipeline, 2), 'builtin.module(func.func(canonicalize,cse))');
  assert.equal(buildMlirPipelinePrefix(pipeline, 99), pipeline);
});

test('runWithVerifyEach stops at the first failing prefix', async () => {
  const runner = makeRunner(3);
  const result = await runWithVerifyEach(
    'builtin.module(func.func(canonicalize,cse,convert-to-ac,verify-ac))',
    runner
  );

  assert.equal(result.firstFailure.passCount, 3);
  assert.deepEqual(runner.attempts.map((attempt) => attempt.passCount), [1, 2, 3]);
  assert.ok(result.firstFailure.pipeline.includes('convert-to-ac'));
});

test('runPrefixBisect finds the shortest failing prefix', async () => {
  const runner = makeRunner(4);
  const result = await runPrefixBisect(
    'builtin.module(func.func(p0,p1,p2,p3,p4,p5))',
    runner
  );

  assert.equal(result.shortestFailingPassCount, 4);
  assert.equal(result.shortestFailingPrefix, 'builtin.module(func.func(p0,p1,p2,p3))');
  assert.ok(result.attempts.length < 6);
});

test('createMinimalFailingPrefixReport records attempts and diagnostics', async () => {
  const runner = makeRunner(2);
  const result = await runPrefixBisect('builtin.module(func.func(canonicalize,verify-ac,cse))', runner);
  const report = createMinimalFailingPrefixReport(result, {
    schemaVersion: 1,
    tool: 'pass-lens-mlir-opt',
    input: 'kernel.mlir',
    pipeline: 'builtin.module(func.func(canonicalize,verify-ac,cse))',
    command: 'pass-lens-mlir-opt kernel.mlir --pass-pipeline=...',
    stages: []
  });

  assert.match(report, /# Pass Lens Minimal Failing Prefix Report/);
  assert.match(report, /Shortest failing prefix: builtin\.module\(func\.func\(canonicalize,verify-ac\)\)/);
  assert.match(report, /pass count 2: failed/);
  assert.match(report, /failed at prefix 2/);
});

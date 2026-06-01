const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const { computeTraceAnomalies } = require('../out/trace/anomalies.js');
const { hydrateTraceArtifacts } = require('../out/trace/artifacts.js');
const { normalizeTrace } = require('../out/trace/schema.js');

async function loadSample(file) {
  const tracePath = path.join(process.cwd(), 'sample-traces', file);
  return normalizeTrace(JSON.parse(await fs.readFile(tracePath, 'utf8')));
}

async function loadSampleWithPath(file) {
  const tracePath = path.join(process.cwd(), 'sample-traces', file);
  const trace = normalizeTrace(JSON.parse(await fs.readFile(tracePath, 'utf8')));
  return { trace, tracePath };
}

test('Triton NPU UB budget sample reports AscendC resource budget anomalies', async () => {
  const trace = await loadSample('triton-npu-ub-budget-overflow.json');
  const anomalies = computeTraceAnomalies(trace);

  assert.ok(anomalies.some((entry) =>
    entry.kind === 'budget' &&
    entry.metric === 'ub.live.slots.max' &&
    entry.stageIndex === 1 &&
    entry.budget === 4
  ));
  assert.ok(anomalies.some((entry) =>
    entry.kind === 'budget' &&
    entry.metric === 'queue.depth' &&
    entry.stageIndex === 1 &&
    entry.budget === 4
  ));
});

test('Triton NPU strict fallback sample reports contract anomalies before verifier failure', async () => {
  const trace = await loadSample('triton-npu-strict-fallback.json');
  const anomalies = computeTraceAnomalies(trace);

  assert.equal(trace.stages[2].status, 'verifier_failed');
  assert.ok(anomalies.some((entry) =>
    entry.metric === 'fallback.count' &&
    entry.stageIndex === 1 &&
    entry.kind === 'budget'
  ));
  assert.ok(anomalies.some((entry) =>
    entry.metric === 'strict.violations' &&
    entry.stageIndex === 1 &&
    entry.kind === 'budget'
  ));
  assert.ok(anomalies.some((entry) =>
    entry.metric === 'unproven.tile_size' &&
    entry.stageIndex === 1 &&
    entry.kind === 'budget'
  ));
});

test('real Triton NPU dual RMSNorm sample hydrates generated artifacts', async () => {
  const { trace, tracePath } = await loadSampleWithPath('real-triton-npu-dual-rmsnorm.json');
  const artifactIssues = await hydrateTraceArtifacts(trace, tracePath);

  assert.deepEqual(artifactIssues, []);
  assert.equal(trace.input, 'samples/rmsnorm_residual_cast/case_001/raw/fused_dual_residual_rmsnorm_kernel.ttadapter.mlir');
  assert.equal(trace.stages[2].pass, 'generate-ascendc-artifacts');
  assert.match(trace.stages[2].irAfter, /fused_dual_residual_rmsnorm_kernel_rmsnorm_residual_cast/);
  assert.equal(trace.stages[2].metricsAfter['tensor.count'], 7);
});

const assert = require('node:assert/strict');
const test = require('node:test');

const { parseTracePanelMessage } = require('../out/webview/messages.js');

test('parseTracePanelMessage accepts copy messages with string text', () => {
  assert.deepEqual(parseTracePanelMessage({
    type: 'copy',
    text: 'mlir-opt input.mlir'
  }), {
    type: 'copy',
    text: 'mlir-opt input.mlir'
  });
});

test('parseTracePanelMessage accepts open trace messages', () => {
  assert.deepEqual(parseTracePanelMessage({
    type: 'openTrace'
  }), {
    type: 'openTrace'
  });
});

test('parseTracePanelMessage accepts export bundle messages with optional selected stage', () => {
  assert.deepEqual(parseTracePanelMessage({
    type: 'exportBundle',
    selectedStageIndex: 7
  }), {
    type: 'exportBundle',
    selectedStageIndex: 7
  });

  assert.deepEqual(parseTracePanelMessage({
    type: 'exportBundle'
  }), {
    type: 'exportBundle'
  });
});

test('parseTracePanelMessage accepts export directory bundle messages with optional selected stage', () => {
  assert.deepEqual(parseTracePanelMessage({
    type: 'exportDirectoryBundle',
    selectedStageIndex: 8
  }), {
    type: 'exportDirectoryBundle',
    selectedStageIndex: 8
  });
  assert.deepEqual(parseTracePanelMessage({
    type: 'exportDirectoryBundle'
  }), {
    type: 'exportDirectoryBundle'
  });
});

test('parseTracePanelMessage accepts export agent context messages with optional selected stage', () => {
  assert.deepEqual(parseTracePanelMessage({
    type: 'exportAgentContext',
    selectedStageIndex: 9
  }), {
    type: 'exportAgentContext',
    selectedStageIndex: 9
  });

  assert.deepEqual(parseTracePanelMessage({
    type: 'exportAgentContext'
  }), {
    type: 'exportAgentContext'
  });
});

test('parseTracePanelMessage accepts export explanation messages with optional selected stage', () => {
  assert.deepEqual(parseTracePanelMessage({
    type: 'exportExplanation',
    selectedStageIndex: 11
  }), {
    type: 'exportExplanation',
    selectedStageIndex: 11
  });

  assert.deepEqual(parseTracePanelMessage({
    type: 'exportExplanation'
  }), {
    type: 'exportExplanation'
  });
});

test('parseTracePanelMessage accepts copy agent context messages with optional selected stage', () => {
  assert.deepEqual(parseTracePanelMessage({
    type: 'copyAgentContext',
    selectedStageIndex: 13
  }), {
    type: 'copyAgentContext',
    selectedStageIndex: 13
  });

  assert.deepEqual(parseTracePanelMessage({
    type: 'copyAgentContext'
  }), {
    type: 'copyAgentContext'
  });
});

test('parseTracePanelMessage accepts copy explanation messages with optional selected stage', () => {
  assert.deepEqual(parseTracePanelMessage({
    type: 'copyExplanation',
    selectedStageIndex: 15
  }), {
    type: 'copyExplanation',
    selectedStageIndex: 15
  });

  assert.deepEqual(parseTracePanelMessage({
    type: 'copyExplanation'
  }), {
    type: 'copyExplanation'
  });
});

test('parseTracePanelMessage accepts artifact open messages', () => {
  assert.deepEqual(parseTracePanelMessage({
    type: 'openArtifact',
    path: 'artifacts/0-before.mlir'
  }), {
    type: 'openArtifact',
    path: 'artifacts/0-before.mlir'
  });
});

test('parseTracePanelMessage accepts stage artifact hydration requests', () => {
  assert.deepEqual(parseTracePanelMessage({
    type: 'requestStageArtifacts',
    stageIndex: 7
  }), {
    type: 'requestStageArtifacts',
    stageIndex: 7
  });
});

test('parseTracePanelMessage rejects malformed or unknown messages', () => {
  assert.equal(parseTracePanelMessage(undefined), undefined);
  assert.equal(parseTracePanelMessage([]), undefined);
  assert.equal(parseTracePanelMessage({ type: 'copy' }), undefined);
  assert.equal(parseTracePanelMessage({ type: 'copy', text: 42 }), undefined);
  assert.equal(parseTracePanelMessage({ type: 'openArtifact' }), undefined);
  assert.equal(parseTracePanelMessage({ type: 'openArtifact', path: '' }), undefined);
  assert.equal(parseTracePanelMessage({ type: 'requestStageArtifacts' }), undefined);
  assert.equal(parseTracePanelMessage({ type: 'requestStageArtifacts', stageIndex: '7' }), undefined);
  assert.equal(parseTracePanelMessage({ type: 'unknown' }), undefined);
});

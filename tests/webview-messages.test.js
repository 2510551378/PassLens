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

test('parseTracePanelMessage rejects malformed or unknown messages', () => {
  assert.equal(parseTracePanelMessage(undefined), undefined);
  assert.equal(parseTracePanelMessage([]), undefined);
  assert.equal(parseTracePanelMessage({ type: 'copy' }), undefined);
  assert.equal(parseTracePanelMessage({ type: 'copy', text: 42 }), undefined);
  assert.equal(parseTracePanelMessage({ type: 'unknown' }), undefined);
});

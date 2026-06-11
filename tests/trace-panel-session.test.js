const assert = require('node:assert/strict');
const test = require('node:test');

const { createTracePanelSessionManager } = require('../out/tracePanelSession.js');

test('registers sessions and tracks active panel', () => {
  const manager = createTracePanelSessionManager();
  const panelA = {};
  const panelB = {};
  const sessionA = {
    loaded: { trace: { input: 'trace-a' } },
    sourceUri: { fsPath: 'C:/tmp/a.pass-lens.json' }
  };
  const sessionB = {
    loaded: { trace: { input: 'trace-b' } },
    sourceUri: { fsPath: 'C:/tmp/b.pass-lens.json' }
  };

  assert.equal(manager.getActiveSession(), undefined);
  manager.register(panelA, sessionA);
  assert.equal(manager.getActiveSession(), sessionA);
  manager.setActivePanel(panelA);
  assert.equal(manager.getActiveSession(), sessionA);
  manager.setActivePanel(panelB);
  assert.equal(manager.getActiveSession(), sessionA);
  manager.register(panelB, sessionB);
  assert.equal(manager.getActiveSession(), sessionB);
  assert.equal(manager.getSession(panelA), sessionA);
  assert.equal(manager.getSession(panelB), sessionB);
});

test('clears active session on panel disposal', () => {
  const manager = createTracePanelSessionManager();
  const panelA = {};
  const panelB = {};
  const sessionA = {
    loaded: { trace: { input: 'trace-a' } },
    sourceUri: { fsPath: 'C:/tmp/a.pass-lens.json' }
  };
  const sessionB = {
    loaded: { trace: { input: 'trace-b' } },
    sourceUri: { fsPath: 'C:/tmp/b.pass-lens.json' }
  };

  manager.register(panelA, sessionA);
  manager.register(panelB, sessionB);
  manager.setActivePanel(panelA);
  assert.equal(manager.getActiveSession(), sessionA);
  manager.unregister(panelA);
  assert.equal(manager.getActiveSession(), undefined);
  assert.equal(manager.getSession(panelA), undefined);
  manager.setActivePanel(panelB);
  assert.equal(manager.getActiveSession(), sessionB);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('trace panel bounds large rendered diffs', () => {
  const elements = createElementsMap();
  const data = {
    trace: {
      schemaVersion: 1,
      tool: 'smoke',
      provenance: {
        kind: 'hand-authored',
        description: 'unit test fixture'
      },
      stages: [
        {
          index: 0,
          pass: 'large-diff',
          changed: true,
          status: 'changed',
          irBefore: Array.from({ length: 1200 }, (_, index) => `before_${index}`).join('\n'),
          irAfter: Array.from({ length: 1200 }, (_, index) => `after_${index}`).join('\n')
        }
      ]
    },
    traceIssues: [],
    traceAnomalies: [],
    traceIssueSummary: 'no issues',
    traceQuality: { score: 100 },
    traceSize: { totalKnownBytes: 1, inlineIrBytes: 1, warnings: [] },
    sourcePath: 'smoke.json'
  };

  elements.get('pass-lens-data').textContent = JSON.stringify(data);
  elements.get('search').value = '';
  elements.get('changed-only').checked = false;

  runTracePanelScript(elements, {});

  assert.match(elements.get('details').innerHTML, /omitted by render cap/);
  assert.match(elements.get('details').innerHTML, /diff-chip warning/);
});

test('trace panel virtualizes long timeline rendering', () => {
  const elements = createElementsMap();
  const data = {
    trace: {
      schemaVersion: 1,
      tool: 'smoke',
      provenance: {
        kind: 'hand-authored',
        description: 'unit test fixture'
      },
      stages: Array.from({ length: 2000 }, (_, index) => ({
        index,
        pass: `pass-${index}`,
        changed: index % 25 === 0,
        status: index % 25 === 0 ? 'changed' : 'ok',
        durationMs: index
      }))
    },
    traceIssues: [],
    traceAnomalies: [],
    traceIssueSummary: 'no issues',
    traceQuality: { score: 100 },
    traceSize: { totalKnownBytes: 1, inlineIrBytes: 1, warnings: [] },
    sourcePath: 'long.json'
  };

  elements.get('pass-lens-data').textContent = JSON.stringify(data);
  elements.get('search').value = '';
  elements.get('changed-only').checked = false;
  elements.get('timeline').clientHeight = 600;

  runTracePanelScript(elements, {});

  const timelineHtml = elements.get('timeline').innerHTML;
  const renderedCards = (timelineHtml.match(/class="stage-card/g) ?? []).length;
  assert.ok(renderedCards < 80, `expected virtualized cards, got ${renderedCards}`);
  assert.match(timelineHtml, /Showing passes 1-\d+ of 2000 visible/);
  assert.doesNotMatch(timelineHtml, /pass-1999/);
  assert.ok((elements.get('overview').innerHTML.match(/overview-segment/g) ?? []).length <= 600);
});

test('trace panel memoizes visible entries on repeated navigation', () => {
  const elements = createElementsMap();
  const debug = { visibleStageEntriesCalls: 0 };
  const data = {
    trace: {
      schemaVersion: 1,
      tool: 'smoke',
      provenance: {
        kind: 'hand-authored',
        description: 'unit test fixture'
      },
      stages: Array.from({ length: 2000 }, (_, index) => ({
        index,
        pass: `pass-${index}`,
        changed: index % 25 === 0,
        status: index % 25 === 0 ? 'changed' : 'ok',
        durationMs: index
      }))
    },
    traceIssues: [],
    traceAnomalies: [{ stageIndex: 150 }, { stageIndex: 175 }, { stageIndex: 180 }],
    traceIssueSummary: 'no issues',
    traceQuality: { score: 100 },
    traceSize: { totalKnownBytes: 1, inlineIrBytes: 1, warnings: [] },
    sourcePath: 'long.json'
  };

  elements.get('pass-lens-data').textContent = JSON.stringify(data);
  elements.get('search').value = '';
  elements.get('changed-only').checked = false;
  elements.get('timeline').clientHeight = 600;

  const { documentListeners } = runTracePanelScript(elements, debug);
  const keydownHandlers = documentListeners.get('keydown') ?? [];
  assert.ok(keydownHandlers.length > 0, 'expected keydown listener registered');

  const baselineCalls = debug.visibleStageEntriesCalls;
  for (let step = 0; step < 40; step++) {
    keydownHandlers[0]?.({
      key: 'j',
      defaultPrevented: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: {},
      preventDefault: () => undefined
    });
  }
  assert.ok(
    debug.visibleStageEntriesCalls <= baselineCalls + 1,
    `cached visible entries expected; got ${debug.visibleStageEntriesCalls} calls after navigation`
  );

  elements.get('changed-only').checked = true;
  const changedHandlers = elements.get('changed-only')._listeners.get('change') ?? [];
  assert.ok(changedHandlers.length > 0, 'expected changed-only change listener registered');
  changedHandlers.forEach((handler) => {
    handler();
  });
  assert.ok(debug.visibleStageEntriesCalls >= baselineCalls + 1);

  const afterChangeFilter = debug.visibleStageEntriesCalls;
  elements.get('search').value = 'pass-1';
  const searchHandlers = elements.get('search')._listeners.get('input') ?? [];
  searchHandlers.forEach((handler) => {
    handler();
  });
  assert.ok(debug.visibleStageEntriesCalls > afterChangeFilter);
});

function runTracePanelScript(elements, debug) {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const context = {
    console,
    window: {
      __passLensTracePanelDebug: debug,
      addEventListener: (type, handler) => {
        const handlers = windowListeners.get(type) ?? [];
        handlers.push(handler);
        windowListeners.set(type, handlers);
      },
      requestAnimationFrame: (handler) => handler()
    },
    acquireVsCodeApi: () => ({ postMessage: () => undefined }),
    HTMLInputElement: class HTMLInputElement {},
    HTMLTextAreaElement: class HTMLTextAreaElement {},
    requestAnimationFrame: (handler) => handler(),
    document: {
      getElementById: (id) => elements.get(id),
      addEventListener: (type, handler) => {
        const handlers = documentListeners.get(type) ?? [];
        handlers.push(handler);
        documentListeners.set(type, handlers);
      }
    }
  };
  context.window.acquireVsCodeApi = context.acquireVsCodeApi;
  vm.createContext(context);

  const script = fs.readFileSync(path.join(process.cwd(), 'media', 'tracePanel.js'), 'utf8');
  vm.runInContext(script, context, { filename: 'tracePanel.js' });

  return {
    documentListeners,
    windowListeners
  };
}

function createElementsMap() {
  const elements = new Map();
  const ids = [
    'pass-lens-data',
    'tool',
    'provenance',
    'pipeline',
    'source',
    'summary',
    'issue-panel',
    'timeline',
    'details',
    'overview',
    'search',
    'changed-only',
    'stage-count',
    'changed-count'
  ];
  for (const id of ids) {
    elements.set(id, createElement());
  }
  return elements;
}

function createElement() {
  const listeners = new Map();
  return {
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    dataset: {},
    scrollTop: 0,
    clientHeight: 600,
    offsetTop: 0,
    classList: {
      add: () => undefined,
      remove: () => undefined,
      toggle: () => undefined
    },
    addEventListener: (type, handler) => {
      const handlers = listeners.get(type) ?? [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    focus: () => undefined,
    querySelector: () => undefined,
    querySelectorAll: () => [],
    scrollIntoView: () => undefined,
    _listeners: listeners,
    trigger: () => undefined
  };
}

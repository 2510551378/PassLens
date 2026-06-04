const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('trace panel bounds large rendered diffs', () => {
  const elements = new Map();
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

  for (const id of [
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
  ]) {
    elements.set(id, createElement());
  }
  elements.get('pass-lens-data').textContent = JSON.stringify(data);
  elements.get('search').value = '';
  elements.get('changed-only').checked = false;

  const context = {
    console,
    window: {},
    acquireVsCodeApi: () => ({ postMessage: () => undefined }),
    HTMLInputElement: class HTMLInputElement {},
    HTMLTextAreaElement: class HTMLTextAreaElement {},
    document: {
      getElementById: (id) => elements.get(id),
      addEventListener: () => undefined
    }
  };
  context.window.acquireVsCodeApi = context.acquireVsCodeApi;
  vm.createContext(context);

  const script = fs.readFileSync(path.join(process.cwd(), 'media', 'tracePanel.js'), 'utf8');
  vm.runInContext(script, context, { filename: 'tracePanel.js' });

  assert.match(elements.get('details').innerHTML, /omitted by render cap/);
  assert.match(elements.get('details').innerHTML, /diff-chip warning/);
});

test('trace panel virtualizes long timeline rendering', () => {
  const elements = new Map();
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

  for (const id of [
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
  ]) {
    elements.set(id, createElement());
  }
  elements.get('pass-lens-data').textContent = JSON.stringify(data);
  elements.get('search').value = '';
  elements.get('changed-only').checked = false;
  elements.get('timeline').clientHeight = 600;

  const context = {
    console,
    window: {},
    acquireVsCodeApi: () => ({ postMessage: () => undefined }),
    HTMLInputElement: class HTMLInputElement {},
    HTMLTextAreaElement: class HTMLTextAreaElement {},
    document: {
      getElementById: (id) => elements.get(id),
      addEventListener: () => undefined
    }
  };
  context.window.acquireVsCodeApi = context.acquireVsCodeApi;
  vm.createContext(context);

  const script = fs.readFileSync(path.join(process.cwd(), 'media', 'tracePanel.js'), 'utf8');
  vm.runInContext(script, context, { filename: 'tracePanel.js' });

  const timelineHtml = elements.get('timeline').innerHTML;
  const renderedCards = (timelineHtml.match(/class="stage-card/g) ?? []).length;
  assert.ok(renderedCards < 80, `expected virtualized cards, got ${renderedCards}`);
  assert.match(timelineHtml, /Showing passes 1-\d+ of 2000 visible/);
  assert.doesNotMatch(timelineHtml, /pass-1999/);
  assert.ok((elements.get('overview').innerHTML.match(/overview-segment/g) ?? []).length <= 600);
});

function createElement() {
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
    addEventListener: () => undefined,
    focus: () => undefined,
    querySelector: () => undefined,
    querySelectorAll: () => [],
    scrollIntoView: () => undefined
  };
}

import { evaluateTraceQuality } from './trace/quality';
import { evaluateTraceSize, type TraceSizeSummary } from './trace/size';
import { summarizeTraceIssues } from './trace/validation';
import type { MetricAnomaly, PassTrace, TraceIssue } from './types';
import * as vscode from 'vscode';

interface TracePanelHtmlParams {
  trace: PassTrace;
  issues: TraceIssue[];
  anomalies: MetricAnomaly[];
  sizeSummary: TraceSizeSummary;
  sourcePath: string;
  styleUri: vscode.Uri;
  scriptUri: vscode.Uri;
  cspSource: string;
}

export function getWebviewHtml(params: TracePanelHtmlParams): string {
  const encodedData = JSON.stringify({
    trace: params.trace,
    traceIssues: params.issues,
    traceAnomalies: params.anomalies,
    traceIssueSummary: summarizeTraceIssues(params.issues),
    traceQuality: evaluateTraceQuality(params.trace),
    traceSize: params.sizeSummary,
    sourcePath: params.sourcePath
  }).replace(/</g, '\\u003c');
  const title = escapeHtml(params.trace.input ?? 'Pass Trace');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${escapeHtml(params.cspSource)} 'unsafe-inline'; script-src ${escapeHtml(params.cspSource)};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pass Lens</title>
  <link rel="stylesheet" href="${escapeHtml(params.styleUri.toString())}">
</head>
<body>
  <header>
    <h1>${title}</h1>
    <div class="meta">
      <span id="tool"></span>
      <span id="provenance"></span>
      <span id="pipeline"></span>
      <span id="source"></span>
    </div>
    <div id="summary" class="summary"></div>
    <div id="issue-panel" class="issue-panel"></div>
  </header>
  <main>
    <aside>
      <div class="toolbar">
        <input id="search" class="search" type="search" placeholder="Filter passes, scopes, metrics">
        <label class="toggle"><input id="changed-only" type="checkbox"> changed only</label>
        <span id="stage-count"></span>
        <span id="changed-count"></span>
      </div>
      <div id="overview" class="overview"></div>
      <div id="timeline"></div>
    </aside>
    <section>
      <div id="details" class="details"></div>
    </section>
  </main>
  <template id="pass-lens-data">${escapeHtml(encodedData)}</template>
  <script src="${escapeHtml(params.scriptUri.toString())}"></script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

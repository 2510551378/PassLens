import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { collectMlirTrace } from './mlirCollector';
import { createReproBundle } from './reproBundle';
import { computeTraceAnomalies } from './trace/anomalies';
import { hydrateTraceArtifacts } from './trace/artifacts';
import { normalizeTrace } from './trace/schema';
import { summarizeTraceIssues, validateTrace } from './trace/validation';
import type { MetricAnomaly, PassTrace, TraceIssue } from './types';
import { parseTracePanelMessage } from './webview/messages';

interface SampleTraceEntry {
  label: string;
  description: string;
  detail: string;
  file: string;
}

const sampleTraces: SampleTraceEntry[] = [
  {
    label: 'Toy MLIR pipeline',
    description: '3 passes, simple IR diff',
    detail: 'Small trace for checking the basic viewer layout.',
    file: 'mlir-toy.json'
  },
  {
    label: 'Long lowering pipeline',
    description: '14 passes, mixed impact',
    detail: 'Longer pipeline for scanning changed/unchanged passes and slow passes.',
    file: 'mlir-long-pipeline.json'
  },
  {
    label: 'Verifier failure',
    description: 'First-signal failure case',
    detail: 'Trace with a verifier failure after a lowering pass.',
    file: 'mlir-verifier-failure.json'
  },
  {
    label: 'External IR artifacts',
    description: '2 passes, IR stored in sidecar files',
    detail: 'Trace that resolves before/after IR and diagnostics from artifact paths.',
    file: 'mlir-artifacts.json'
  }
];

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('passLens.openSampleTrace', async () => {
      const picked = await vscode.window.showQuickPick(sampleTraces, {
        title: 'Open Pass Lens sample trace',
        placeHolder: 'Choose a scenario to inspect'
      });
      if (!picked) {
        return;
      }

      const sampleUri = vscode.Uri.joinPath(context.extensionUri, 'sample-traces', picked.file);
      const loaded = await readTrace(sampleUri);
      openTracePanel(context, loaded, sampleUri);
    }),
    vscode.commands.registerCommand('passLens.openTraceFile', async () => {
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'Pass Lens trace': ['json'],
          'All files': ['*']
        },
        title: 'Open Pass Lens trace'
      });
      if (!selected?.[0]) {
        return;
      }

      const loaded = await readTrace(selected[0]);
      openTracePanel(context, loaded, selected[0]);
    }),
    vscode.commands.registerCommand('passLens.runMlirOptTrace', async () => {
      await runMlirOptTraceCommand(context);
    }),
    vscode.commands.registerCommand('passLens.runStructuredMlirTrace', async () => {
      await runStructuredMlirTraceCommand(context);
    }),
    vscode.commands.registerCommand('passLens.checkMlirCollectorSetup', async () => {
      await checkMlirCollectorSetupCommand(context);
    })
  );
}

export function deactivate(): void {
  // Nothing to dispose. Commands are owned by the extension context.
}

async function runMlirOptTraceCommand(context: vscode.ExtensionContext): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'MLIR files': ['mlir'],
      'All files': ['*']
    },
    title: 'Select MLIR input'
  });
  if (!selected?.[0]) {
    return;
  }

  const pipeline = await vscode.window.showInputBox({
    title: 'MLIR pass pipeline',
    prompt: 'Example: builtin.module(func.func(canonicalize,cse))',
    value: 'builtin.module(func.func(canonicalize,cse))',
    ignoreFocusOut: true,
    validateInput: (value) => value.trim().length > 0 ? undefined : 'Pipeline is required.'
  });
  if (!pipeline) {
    return;
  }

  const configuration = vscode.workspace.getConfiguration('passLens');
  const mlirOptPath = configuration.get<string>('mlirOptPath') || 'mlir-opt';
  const inputPath = selected[0].fsPath;
  const outputUri = getDefaultTraceUri(selected[0]);

  try {
    const trace = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Pass Lens: collecting MLIR pass trace',
        cancellable: false
      },
      async (progress) => {
        progress.report({ message: `running ${mlirOptPath}` });
        return collectMlirTrace({
          mlirOptPath,
          inputPath,
          pipeline: pipeline.trim()
        });
      }
    );

    await fs.writeFile(outputUri.fsPath, `${JSON.stringify(trace, null, 2)}\n`, 'utf8');
    vscode.window.showInformationMessage(`Pass Lens trace saved: ${outputUri.fsPath}`);
    openTracePanel(context, toLoadedTrace(trace), outputUri);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const action = await vscode.window.showErrorMessage(
      `Could not collect MLIR trace. ${message}`,
      'Set mlir-opt Path',
      'Open Sample Trace'
    );
    if (action === 'Set mlir-opt Path') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'passLens.mlirOptPath');
    } else if (action === 'Open Sample Trace') {
      await vscode.commands.executeCommand('passLens.openSampleTrace');
    }
  }
}

async function runStructuredMlirTraceCommand(context: vscode.ExtensionContext): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'MLIR files': ['mlir'],
      'All files': ['*']
    },
    title: 'Select MLIR input for structured Pass Lens trace'
  });
  if (!selected?.[0]) {
    return;
  }

  const pipeline = await vscode.window.showInputBox({
    title: 'MLIR pass pipeline',
    prompt: 'Example: builtin.module(func.func(canonicalize,cse))',
    value: 'builtin.module(func.func(canonicalize,cse))',
    ignoreFocusOut: true,
    validateInput: (value) => value.trim().length > 0 ? undefined : 'Pipeline is required.'
  });
  if (!pipeline) {
    return;
  }

  const configuration = vscode.workspace.getConfiguration('passLens');
  const driverPath = configuration.get<string>('mlirDriverPath') || 'pass-lens-mlir-opt';
  const inputPath = selected[0].fsPath;
  const traceUri = getDefaultTraceUri(selected[0]);
  const outputPath = path.join(os.tmpdir(), `pass-lens-${Date.now()}-${Math.random().toString(16).slice(2)}.mlir`);
  const args = [
    inputPath,
    `--pass-pipeline=${pipeline.trim()}`,
    `--pass-lens-trace=${traceUri.fsPath}`,
    '-o',
    outputPath
  ];
  const command = formatCommand(driverPath, args);

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Pass Lens: running structured MLIR collector',
        cancellable: false
      },
      async (progress) => {
        progress.report({ message: driverPath });
        return runProcess(driverPath, args, path.dirname(inputPath));
      }
    );

    await fs.rm(outputPath, { force: true }).catch(() => undefined);
    if (result.exitCode !== 0) {
      if (await pathExists(traceUri.fsPath)) {
        const loaded = await readTrace(traceUri);
        loaded.trace.command = loaded.trace.command ?? command;
        loaded.trace.exitCode = loaded.trace.exitCode ?? result.exitCode;
        loaded.trace.diagnostics = loaded.trace.diagnostics ?? trimOutput(`${result.stderr}\n${result.stdout}`);
        openTracePanel(context, toLoadedTrace(loaded.trace), traceUri);
      }
      throw new Error(trimOutput(result.stderr || result.stdout || `collector exited with code ${result.exitCode}`));
    }

    const loaded = await readTrace(traceUri);
    loaded.trace.command = loaded.trace.command ?? command;
    loaded.trace.exitCode = loaded.trace.exitCode ?? result.exitCode;
    loaded.trace.diagnostics = loaded.trace.diagnostics ?? trimOutput(result.stderr);
    vscode.window.showInformationMessage(`Pass Lens structured trace saved: ${traceUri.fsPath}`);
    openTracePanel(context, toLoadedTrace(loaded.trace), traceUri);
  } catch (error) {
    await fs.rm(outputPath, { force: true }).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    const action = await vscode.window.showErrorMessage(
      `Could not run structured MLIR collector. ${message}`,
      'Set Driver Path',
      'Check Setup',
      'Fallback: mlir-opt Dump'
    );
    if (action === 'Set Driver Path') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'passLens.mlirDriverPath');
    } else if (action === 'Check Setup') {
      await vscode.commands.executeCommand('passLens.checkMlirCollectorSetup');
    } else if (action === 'Fallback: mlir-opt Dump') {
      await vscode.commands.executeCommand('passLens.runMlirOptTrace');
    }
  }
}

async function checkMlirCollectorSetupCommand(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Pass Lens Collector Setup');
  output.show(true);

  const scriptPath = vscode.Uri.joinPath(context.extensionUri, 'scripts', 'check-mlir-collector.ps1').fsPath;
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Pass Lens: checking MLIR collector setup',
      cancellable: false
    },
    async () => runProcess(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      context.extensionUri.fsPath
    )
  );

  output.appendLine(`Command: ${formatCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath])}`);
  output.appendLine(`Exit code: ${result.exitCode}`);
  if (result.stdout.trim()) {
    output.appendLine('');
    output.appendLine(result.stdout.trimEnd());
  }
  if (result.stderr.trim()) {
    output.appendLine('');
    output.appendLine(result.stderr.trimEnd());
  }

  if (result.exitCode === 0) {
    vscode.window.showInformationMessage('Pass Lens MLIR collector setup looks valid.');
  } else if (`${result.stdout}\n${result.stderr}`.includes('ENVIRONMENT_MISSING')) {
    vscode.window.showWarningMessage('Pass Lens MLIR collector environment is missing. See output for MLIR_DIR / LLVM_DIR setup.');
  } else {
    vscode.window.showErrorMessage('Pass Lens MLIR collector setup failed. See output for details.');
  }
}

function getDefaultTraceUri(inputUri: vscode.Uri): vscode.Uri {
  const parsed = path.parse(inputUri.fsPath);
  return vscode.Uri.file(path.join(parsed.dir, `${parsed.name}.pass-lens.json`));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

interface LoadedTrace {
  trace: PassTrace;
  issues: TraceIssue[];
  anomalies: MetricAnomaly[];
}

async function readTrace(uri: vscode.Uri): Promise<LoadedTrace> {
  try {
    const content = await fs.readFile(uri.fsPath, 'utf8');
    const trace = normalizeTrace(JSON.parse(content));
    const artifactIssues = await hydrateTraceArtifacts(trace, uri.fsPath);
    return {
      trace,
      issues: [...validateTrace(trace), ...artifactIssues],
      anomalies: computeTraceAnomalies(trace)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read Pass Lens trace ${uri.fsPath}: ${message}`);
  }
}

function toLoadedTrace(trace: PassTrace): LoadedTrace {
  return {
    trace,
    issues: validateTrace(trace),
    anomalies: computeTraceAnomalies(trace)
  };
}

function runProcess(command: string, args: string[], cwd?: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      });
    });
  });
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteArg).join(' ');
}

function quoteArg(arg: string): string {
  return /[\s"']/u.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function trimOutput(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 8000) : undefined;
}

function openTracePanel(context: vscode.ExtensionContext, loaded: LoadedTrace, sourceUri: vscode.Uri): void {
  const { trace, issues, anomalies } = loaded;
  const panel = vscode.window.createWebviewPanel(
    'passLens.trace',
    `Pass Lens: ${trace.input ?? sourceUri.path.split('/').pop() ?? 'trace'}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [context.extensionUri]
    }
  );

  panel.webview.onDidReceiveMessage(async (message: unknown) => {
    const parsed = parseTracePanelMessage(message);
    if (!parsed) {
      return;
    }
    if (parsed.type === 'copy') {
      await vscode.env.clipboard.writeText(parsed.text);
      vscode.window.showInformationMessage('Pass Lens copied repro command.');
    }
    if (parsed.type === 'openTrace') {
      await vscode.window.showTextDocument(sourceUri, { preview: false });
    }
    if (parsed.type === 'exportBundle') {
      await exportReproBundle(sourceUri, trace, issues, anomalies, parsed.selectedStageIndex);
    }
  });

  const styleUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'tracePanel.css'));
  panel.webview.html = getWebviewHtml(trace, issues, anomalies, sourceUri.fsPath, styleUri, panel.webview.cspSource, getNonce());
}

async function exportReproBundle(
  sourceUri: vscode.Uri,
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  selectedStageIndex: unknown
): Promise<void> {
  const parsed = path.parse(sourceUri.fsPath);
  const defaultUri = vscode.Uri.file(path.join(parsed.dir, `${parsed.name}.pass-lens-repro.md`));
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: {
      Markdown: ['md'],
      'All files': ['*']
    },
    saveLabel: 'Export Repro Bundle',
    title: 'Export Pass Lens repro bundle'
  });
  if (!target) {
    return;
  }

  const content = createReproBundle(trace, issues, anomalies, {
    sourcePath: sourceUri.fsPath,
    selectedStageIndex: typeof selectedStageIndex === 'number' ? selectedStageIndex : undefined
  });
  await fs.writeFile(target.fsPath, content, 'utf8');
  const open = await vscode.window.showInformationMessage('Pass Lens exported repro bundle.', 'Open');
  if (open === 'Open') {
    await vscode.window.showTextDocument(target, { preview: false });
  }
}

function getWebviewHtml(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  sourcePath: string,
  styleUri: vscode.Uri,
  cspSource: string,
  nonce: string
): string {
  const encodedTrace = JSON.stringify(trace).replace(/</g, '\\u003c');
  const encodedIssues = JSON.stringify(issues).replace(/</g, '\\u003c');
  const encodedAnomalies = JSON.stringify(anomalies).replace(/</g, '\\u003c');
  const encodedIssueSummary = JSON.stringify(summarizeTraceIssues(issues)).replace(/</g, '\\u003c');
  const encodedSourcePath = JSON.stringify(sourcePath).replace(/</g, '\\u003c');
  const title = escapeHtml(trace.input ?? 'Pass Trace');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${escapeHtml(cspSource)} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pass Lens</title>
  <link rel="stylesheet" href="${escapeHtml(styleUri.toString())}">
</head>
<body>
  <header>
    <h1>${title}</h1>
    <div class="meta">
      <span id="tool"></span>
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
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const trace = ${encodedTrace};
    const traceIssues = ${encodedIssues};
    const traceAnomalies = ${encodedAnomalies};
    const traceIssueSummary = ${encodedIssueSummary};
    const sourcePath = ${encodedSourcePath};
    let selectedIndex = initialSelectedIndex();
    let filterText = '';
    let showChangedOnly = false;

    const timeline = document.getElementById('timeline');
    const details = document.getElementById('details');
    const overview = document.getElementById('overview');
    const search = document.getElementById('search');
    const changedOnly = document.getElementById('changed-only');

    document.getElementById('tool').textContent = trace.tool ? 'tool: ' + trace.tool : 'tool: unknown';
    document.getElementById('pipeline').textContent = trace.pipeline ? 'pipeline: ' + trace.pipeline : 'pipeline: unknown';
    document.getElementById('source').textContent = 'trace: ' + sourcePath;
    renderSummary();
    renderIssuePanel();

    document.getElementById('summary').addEventListener('click', (event) => {
      const card = event.target.closest('[data-jump]');
      if (!card) {
        return;
      }
      jumpTo(card.dataset.jump);
    });

    details.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) {
        return;
      }
      handleAction(button.dataset.action);
    });

    search.addEventListener('input', () => {
      filterText = search.value.trim().toLowerCase();
      renderTimeline();
    });
    changedOnly.addEventListener('change', () => {
      showChangedOnly = changedOnly.checked;
      renderTimeline();
    });

    function escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function fmtNumber(value) {
      return typeof value === 'number' && Number.isFinite(value)
        ? Math.round(value * 100) / 100
        : '';
    }

    function initialSelectedIndex() {
      const failedIndex = trace.stages.findIndex((stage) => isFailedStage(stage));
      if (failedIndex >= 0) {
        return failedIndex;
      }
      const firstChanged = trace.stages.findIndex((stage) => stage.changed);
      return firstChanged >= 0 ? firstChanged : 0;
    }

    function stageAccent(stage) {
      if (isFailedStage(stage)) {
        return 'var(--failed)';
      }
      if (stage.changed) {
        return 'var(--changed)';
      }
      return 'var(--unchanged)';
    }

    function metricImpact(stage) {
      const before = stage.metricsBefore ?? {};
      const after = stage.metricsAfter ?? {};
      return topMetricDeltas(before, after)
        .reduce((sum, item) => sum + Math.abs(item.delta), 0);
    }

    function impactPercent(stage) {
      const impacts = trace.stages.map(metricImpact);
      const maxImpact = Math.max(1, ...impacts);
      const base = stage.changed ? 18 : 6;
      return Math.min(100, base + Math.round((metricImpact(stage) / maxImpact) * 82));
    }

    function firstSignalIndex() {
      const failedIndex = trace.stages.findIndex((stage) => isFailedStage(stage));
      if (failedIndex >= 0) {
        return failedIndex;
      }
      return trace.stages.findIndex((stage) => stage.changed);
    }

    function isFailedStage(stage) {
      return stage.status === 'verifier_failed' ||
        stage.status === 'pass_failed' ||
        String(stage.verifier ?? '').toLowerCase() === 'failed';
    }

    function slowestIndex() {
      let bestIndex = -1;
      let bestDuration = -1;
      trace.stages.forEach((stage, index) => {
        if (typeof stage.durationMs === 'number' && stage.durationMs > bestDuration) {
          bestDuration = stage.durationMs;
          bestIndex = index;
        }
      });
      return bestIndex;
    }

    function firstAnomalyIndex() {
      if (!traceAnomalies.length) {
        return -1;
      }
      const stageIndex = traceAnomalies[0].stageIndex;
      return trace.stages.findIndex((stage) => stage.index === stageIndex);
    }

    function anomaliesForStage(stageIndex) {
      return traceAnomalies.filter((entry) => entry.stageIndex === stageIndex);
    }

    function nextChangedIndex(direction) {
      if (!trace.stages.length) {
        return -1;
      }
      for (let step = 1; step <= trace.stages.length; step++) {
        const index = (selectedIndex + direction * step + trace.stages.length) % trace.stages.length;
        if (trace.stages[index]?.changed) {
          return index;
        }
      }
      return -1;
    }

    function selectIndex(index) {
      if (index < 0 || index >= trace.stages.length) {
        return;
      }
      selectedIndex = index;
      renderTimeline();
      renderDetails();
    }

    function jumpTo(target) {
      if (target === 'first-signal') {
        selectIndex(firstSignalIndex());
      } else if (target === 'first-anomaly') {
        selectIndex(firstAnomalyIndex());
      } else if (target === 'slowest') {
        selectIndex(slowestIndex());
      } else if (target === 'first') {
        selectIndex(0);
      }
    }

    function handleAction(action) {
      if (action === 'first-signal') {
        jumpTo('first-signal');
      } else if (action === 'prev-changed') {
        selectIndex(nextChangedIndex(-1));
      } else if (action === 'next-changed') {
        selectIndex(nextChangedIndex(1));
      } else if (action === 'slowest') {
        jumpTo('slowest');
      } else if (action === 'copy-command' && trace.command) {
        vscode.postMessage({ type: 'copy', text: trace.command });
      } else if (action === 'open-trace') {
        vscode.postMessage({ type: 'openTrace' });
      } else if (action === 'export-bundle') {
        const stage = trace.stages[selectedIndex];
        vscode.postMessage({ type: 'exportBundle', selectedStageIndex: stage?.index });
      }
    }

    function renderSummary() {
      const changed = trace.stages.filter((stage) => stage.changed);
      const failed = trace.stages.find((stage) => isFailedStage(stage));
      const slowest = trace.stages
        .filter((stage) => typeof stage.durationMs === 'number')
        .sort((a, b) => b.durationMs - a.durationMs)[0];
      const firstChanged = changed[0];
      const firstAnomaly = traceAnomalies[0];
      document.getElementById('summary').innerHTML =
        summaryCard('Stages', String(trace.stages.length), 'first') +
        summaryCard('Changed', changed.length + ' / ' + trace.stages.length, firstChanged ? 'first-signal' : undefined) +
        summaryCard('First signal', failed ? 'verifier failed at #' + failed.index : firstChanged ? 'first change at #' + firstChanged.index : 'no IR changes', failed || firstChanged ? 'first-signal' : undefined) +
        summaryCard('Anomalies', traceAnomalies.length ? traceAnomalies.length + ' suspicious metric delta(s)' : 'none', firstAnomaly ? 'first-anomaly' : undefined) +
        summaryCard('Slowest', slowest ? slowest.pass + ' (' + fmtNumber(slowest.durationMs) + ' ms)' : 'not recorded', slowest ? 'slowest' : undefined);
      document.getElementById('stage-count').textContent = trace.stages.length + ' stages';
      document.getElementById('changed-count').textContent = changed.length + ' changed';
    }

    function renderIssuePanel() {
      const panel = document.getElementById('issue-panel');
      if (!traceIssues.length) {
        panel.classList.remove('visible');
        panel.innerHTML = '';
        return;
      }
      const visibleIssues = traceIssues.slice(0, 6);
      const more = traceIssues.length > visibleIssues.length
        ? '<li>' + escapeHtml(traceIssues.length - visibleIssues.length) + ' more issue(s) omitted.</li>'
        : '';
      panel.classList.add('visible');
      panel.innerHTML =
        '<div class="issue-title">Trace validation: ' + escapeHtml(traceIssueSummary) + '</div>' +
        '<ul class="issue-list">' +
        visibleIssues.map((entry) => {
          const stage = typeof entry.stageIndex === 'number' ? ' stage #' + entry.stageIndex + ':' : '';
          return '<li><span class="issue-severity">' + escapeHtml(entry.severity) + '</span>' +
            escapeHtml(stage + ' ' + entry.message) + '</li>';
        }).join('') +
        more +
        '</ul>';
    }

    function summaryCard(label, value, jump) {
      const jumpAttr = jump ? ' data-jump="' + escapeHtml(jump) + '"' : '';
      return '<button class="summary-card"' + jumpAttr + '><div class="summary-label">' + escapeHtml(label) + '</div>' +
        '<div class="summary-value" title="' + escapeHtml(value) + '">' + escapeHtml(value) + '</div></button>';
    }

    function renderTimeline() {
      if (!trace.stages.length) {
        timeline.innerHTML = '<div class="empty">No stages in trace.</div>';
        overview.innerHTML = '';
        details.innerHTML = '';
        return;
      }

      const visibleStages = trace.stages
        .map((stage, idx) => ({ stage, idx }))
        .filter(({ stage }) => !showChangedOnly || stage.changed)
        .filter(({ stage }) => {
          if (!filterText) {
            return true;
          }
          const haystack = [
            stage.pass,
            stage.scope,
            stage.verifier,
            ...Object.keys(stage.metricsBefore ?? {}),
            ...Object.keys(stage.metricsAfter ?? {})
          ].join(' ').toLowerCase();
          return haystack.includes(filterText);
        });

      if (!visibleStages.length) {
        timeline.innerHTML = '<div class="empty">No passes match the current filter.</div>';
        renderOverview([]);
        return;
      }

      renderOverview(visibleStages);
      timeline.innerHTML = '<div class="stage-list">' +
        visibleStages.map(({ stage, idx }) => {
          const active = idx === selectedIndex ? ' active' : '';
          const failed = isFailedStage(stage);
          const statusClass = failed ? 'failed' : stage.changed ? 'changed' : 'unchanged';
          const statusText = failed ? 'failed' : stage.changed ? 'changed' : 'unchanged';
          const duration = typeof stage.durationMs === 'number' ? fmtNumber(stage.durationMs) + ' ms' : '';
          const anomalies = anomaliesForStage(stage.index);
          const anomalyText = anomalies.length ? anomalies.length + ' anomaly' + (anomalies.length === 1 ? '' : 'ies') : '';
          const impact = impactPercent(stage) + '%';
          const accent = stageAccent(stage);
          return '<button class="stage-card' + active + '" data-index="' + idx + '" style="--accent: ' + accent + '; --impact: ' + impact + '">' +
            '<div class="stage-line">' +
              '<span class="stage-index">#' + escapeHtml(stage.index) + '</span>' +
              '<span class="stage-pass">' + escapeHtml(stage.pass) + '</span>' +
              '<span class="status ' + statusClass + '">' + statusText + '</span>' +
            '</div>' +
            '<div class="stage-line">' +
              '<span></span>' +
              '<span class="scope">' + escapeHtml(stage.scope ?? '') + '</span>' +
              '<span class="duration">' + escapeHtml(anomalyText || duration) + '</span>' +
            '</div>' +
          '</button>';
        }).join('') +
        '</div>';

      timeline.querySelectorAll('button[data-index]').forEach((button) => {
        button.addEventListener('click', () => {
          selectIndex(Number(button.dataset.index));
        });
      });
    }

    function renderOverview(visibleStages) {
      overview.innerHTML = visibleStages.map(({ stage, idx }) => {
        const active = idx === selectedIndex ? ' active' : '';
        return '<button class="overview-segment' + active + '" data-index="' + idx + '" title="#' +
          escapeHtml(stage.index) + ' ' + escapeHtml(stage.pass) + '" style="--accent: ' +
          stageAccent(stage) + '; --impact: ' + impactPercent(stage) + '%"></button>';
      }).join('');
      overview.querySelectorAll('button[data-index]').forEach((button) => {
        button.addEventListener('click', () => {
          selectIndex(Number(button.dataset.index));
        });
      });
    }

    function renderDetails() {
      const stage = trace.stages[selectedIndex];
      if (!stage) {
        return;
      }

      details.innerHTML =
        renderPassHero(stage) +
        '<div class="details-grid">' +
          kv('Scope', stage.scope ?? 'unknown') +
          kv('Changed', stage.changed ? 'yes' : 'no') +
          kv('Duration', typeof stage.durationMs === 'number' ? fmtNumber(stage.durationMs) + ' ms' : 'unknown') +
          kv('Verifier', stage.verifier ?? 'unknown') +
        '</div>' +
        renderMetricAnomalies(stage.index) +
        '<h2>Metric Delta</h2>' +
        renderMetrics(stage.metricsBefore ?? {}, stage.metricsAfter ?? {}) +
        '<h2>IR Diff</h2>' +
        renderDiff(stage) +
        renderCommandAndDiagnostics(stage);
    }

    function renderPassHero(stage) {
      const failed = isFailedStage(stage);
      const statusClass = failed ? 'failed' : stage.changed ? 'changed' : '';
      const statusText = failed ? 'verifier failed' : stage.changed ? 'changed IR' : 'no IR change';
      const impact = impactPercent(stage);
      const anomalyCount = anomaliesForStage(stage.index).length;
      const irSource = stageIrSource(stage);
      return '<div class="pass-hero" style="--accent: ' + stageAccent(stage) + '">' +
        '<div>' +
          '<h2>' + escapeHtml(stage.pass) + '</h2>' +
          renderInsight(stage) +
          renderActionRow() +
        '</div>' +
        '<div class="badges">' +
          '<span class="pill ' + statusClass + '">' + escapeHtml(statusText) + '</span>' +
          '<span class="pill">impact ' + escapeHtml(impact) + '%</span>' +
          (anomalyCount ? '<span class="pill warning">' + escapeHtml(anomalyCount + ' anomaly' + (anomalyCount === 1 ? '' : 'ies')) + '</span>' : '') +
          '<span class="pill">' + escapeHtml(irSource) + '</span>' +
          '<span class="pill">#' + escapeHtml(stage.index) + '</span>' +
        '</div>' +
      '</div>';
    }

    function renderActionRow() {
      return '<div class="action-row">' +
        '<button class="action-button primary" data-action="first-signal">First signal</button>' +
        '<button class="action-button" data-action="prev-changed">Prev changed</button>' +
        '<button class="action-button" data-action="next-changed">Next changed</button>' +
        '<button class="action-button" data-action="slowest">Slowest</button>' +
        '<button class="action-button" data-action="export-bundle">Export repro bundle</button>' +
        '<button class="action-button" data-action="open-trace">Open trace JSON</button>' +
      '</div>';
    }

    function renderInsight(stage) {
      const failed = isFailedStage(stage);
      if (failed) {
        return '<div class="insight">Verifier failed after this pass. This is the first place to inspect before debugging later changes.</div>';
      }
      const top = topMetricDeltas(stage.metricsBefore ?? {}, stage.metricsAfter ?? {})[0];
      if (!stage.changed) {
        return '<div class="insight">This pass did not change the recorded IR. Use the filter to skip unchanged passes in long pipelines.</div>';
      }
      if (top) {
        const sign = top.delta > 0 ? '+' : '';
        return '<div class="insight">Main visible metric change: ' + escapeHtml(top.key) + ' ' + sign + escapeHtml(fmtNumber(top.delta)) + '.</div>';
      }
      return '<div class="insight">This pass changed the IR. The diff below shows the recorded before/after text.</div>';
    }

    function renderMetricAnomalies(stageIndex) {
      const entries = anomaliesForStage(stageIndex).slice(0, 5);
      if (!entries.length) {
        return '';
      }
      return '<h2>Metric Anomalies</h2><div class="anomaly-panel"><div class="anomaly-list">' +
        entries.map((entry) => {
          const delta = entry.delta > 0 ? '+' + fmtNumber(entry.delta) : String(fmtNumber(entry.delta));
          return '<div class="anomaly-item">' +
            '<span class="anomaly-severity">' + escapeHtml(entry.severity) + '</span>' +
            '<span class="anomaly-message" title="' + escapeHtml(entry.message) + '">' + escapeHtml(entry.message) + '</span>' +
            '<span class="anomaly-delta">' + escapeHtml(entry.metric + ' ' + delta) + '</span>' +
          '</div>';
        }).join('') +
      '</div></div>';
    }

    function kv(label, value) {
      return '<div class="kv"><div class="kv-label">' + escapeHtml(label) + '</div>' +
        '<div class="kv-value" title="' + escapeHtml(value) + '">' + escapeHtml(value) + '</div></div>';
    }

    function renderMetrics(before, after) {
      const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
      if (!keys.length) {
        return '<div class="empty">No metrics recorded for this pass.</div>';
      }

      const maxDelta = Math.max(1, ...keys.map((key) => {
        const b = typeof before[key] === 'number' ? before[key] : 0;
        const a = typeof after[key] === 'number' ? after[key] : 0;
        return Math.abs(a - b);
      }));

      return '<table class="metrics"><thead><tr><th>metric</th><th>before</th><th>after</th><th>delta</th></tr></thead><tbody>' +
        keys.map((key) => {
          const b = before[key];
          const a = after[key];
          const delta = (typeof a === 'number' ? a : 0) - (typeof b === 'number' ? b : 0);
          const deltaClass = delta > 0 ? 'metric-pos' : delta < 0 ? 'metric-neg' : '';
          const deltaLabel = delta > 0 ? '+' + fmtNumber(delta) : String(fmtNumber(delta));
          const spark = Math.round((Math.abs(delta) / maxDelta) * 100) + '%';
          const accent = delta > 0 ? 'var(--vscode-gitDecoration-addedResourceForeground)' :
            delta < 0 ? 'var(--vscode-gitDecoration-deletedResourceForeground)' :
            'var(--unchanged)';
          return '<tr><td><span class="metric-name"><span>' + escapeHtml(key) +
            '</span><span class="metric-spark"><span style="--spark: ' + spark + '; --accent: ' + accent + '"></span></span></span></td><td>' + escapeHtml(fmtNumber(b)) +
            '</td><td>' + escapeHtml(fmtNumber(a)) + '</td><td class="' + deltaClass + '">' +
            escapeHtml(deltaLabel) + '</td></tr>';
        }).join('') +
        '</tbody></table>';
    }

    function topMetricDeltas(before, after) {
      return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
        .map((key) => {
          const b = typeof before[key] === 'number' ? before[key] : 0;
          const a = typeof after[key] === 'number' ? after[key] : 0;
          return { key, delta: a - b };
        })
        .filter((item) => item.delta !== 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    }

    function renderCommandAndDiagnostics(stage) {
      const command = trace.command
        ? '<h2>Repro Command</h2><div class="action-row"><button class="action-button" data-action="copy-command">Copy command</button></div><pre class="diagnostics">' + escapeHtml(trace.command) + '</pre>'
        : '';
      const stageDiagnostics = stage.diagnostics
        ? '<h2>Stage Diagnostics</h2>' + renderSourceLine('diagnostics', stage.artifacts?.diagnosticsPath, stage.diagnostics) +
          '<pre class="diagnostics">' + escapeHtml(stage.diagnostics) + '</pre>'
        : '';
      const traceDiagnostics = trace.diagnostics ? '<h2>Trace Diagnostics</h2><pre class="diagnostics">' + escapeHtml(trace.diagnostics) + '</pre>' : '';
      return command + stageDiagnostics + traceDiagnostics;
    }

    function renderDiff(stage) {
      const beforeText = stage.irBefore ?? '';
      const afterText = stage.irAfter ?? '';
      const rows = diffLines(beforeText, afterText);
      if (!rows.length) {
        return '<div class="empty">No IR text recorded for this pass.</div>';
      }

      return '<div class="diff-head"><div><div class="diff-title">Before pass</div>' +
        renderSourceLine('before IR', stage.artifacts?.beforePath, beforeText) +
        '</div><div><div class="diff-title">After pass</div>' +
        renderSourceLine('after IR', stage.artifacts?.afterPath, afterText) +
        '</div></div>' +
        '<table class="diff"><tbody>' +
        rows.map((row) => {
          return '<tr class="' + row.kind + '">' +
            '<td class="line-no">' + escapeHtml(row.leftNo ?? '') + '</td>' +
            '<td class="code">' + escapeHtml(row.left ?? '') + '</td>' +
            '<td class="line-no">' + escapeHtml(row.rightNo ?? '') + '</td>' +
            '<td class="code">' + escapeHtml(row.right ?? '') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>';
    }

    function renderSourceLine(label, artifactPath, text) {
      const source = artifactPath
        ? 'artifact: ' + artifactPath
        : text ? 'inline ' + label : 'missing ' + label;
      return '<div class="source-line"><span class="source-path" title="' + escapeHtml(source) + '">' +
        escapeHtml(source) + '</span></div>';
    }

    function stageIrSource(stage) {
      const hasBeforeArtifact = Boolean(stage.artifacts?.beforePath);
      const hasAfterArtifact = Boolean(stage.artifacts?.afterPath);
      if (hasBeforeArtifact && hasAfterArtifact) {
        return 'artifact IR';
      }
      if (hasBeforeArtifact || hasAfterArtifact) {
        return 'mixed IR';
      }
      if (stage.irBefore || stage.irAfter) {
        return 'inline IR';
      }
      return 'IR missing';
    }

    function diffLines(beforeText, afterText) {
      if (!beforeText && !afterText) {
        return [];
      }

      const a = beforeText.split(/\\r?\\n/);
      const b = afterText.split(/\\r?\\n/);
      if (a.length * b.length > 200000) {
        return pairedDiff(a, b);
      }

      const width = b.length + 1;
      const dp = new Uint16Array((a.length + 1) * (b.length + 1));
      for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
          const pos = i * width + j;
          dp[pos] = a[i] === b[j]
            ? dp[(i + 1) * width + j + 1] + 1
            : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
        }
      }

      const rows = [];
      let i = 0;
      let j = 0;
      while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && a[i] === b[j]) {
          rows.push({ kind: 'same', leftNo: i + 1, rightNo: j + 1, left: a[i], right: b[j] });
          i++;
          j++;
        } else if (j < b.length && (i === a.length || dp[i * width + j + 1] >= dp[(i + 1) * width + j])) {
          rows.push({ kind: 'add', rightNo: j + 1, right: b[j] });
          j++;
        } else if (i < a.length) {
          rows.push({ kind: 'del', leftNo: i + 1, left: a[i] });
          i++;
        }
      }
      return rows;
    }

    function pairedDiff(a, b) {
      const rows = [];
      const count = Math.max(a.length, b.length);
      for (let i = 0; i < count; i++) {
        const left = a[i];
        const right = b[i];
        const kind = left === right ? 'same' : left === undefined ? 'add' : right === undefined ? 'del' : 'changed';
        rows.push({
          kind,
          leftNo: left === undefined ? undefined : i + 1,
          rightNo: right === undefined ? undefined : i + 1,
          left,
          right
        });
      }
      return rows;
    }

    renderTimeline();
    renderDetails();
  </script>
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

function getNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return text;
}

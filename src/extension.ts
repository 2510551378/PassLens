import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { createAgentContext, createAgentContextMarkdown } from './agentContext';
import { collectMlirTrace } from './mlirCollector';
import { createReproBundle } from './reproBundle';
import { computeTraceAnomalies } from './trace/anomalies';
import { hydrateTraceArtifacts } from './trace/artifacts';
import { createTraceExplanation } from './traceExplanation';
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

  const scriptPath = vscode.Uri.joinPath(context.extensionUri, 'scripts', 'check-mlir-collector.js').fsPath;
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Pass Lens: checking MLIR collector setup',
      cancellable: false
    },
    async () => runProcess('node', [scriptPath], context.extensionUri.fsPath)
  );

  output.appendLine(`Command: ${formatCommand('node', [scriptPath])}`);
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
    if (parsed.type === 'exportAgentContext') {
      await exportAgentContext(sourceUri, trace, issues, anomalies, parsed.selectedStageIndex);
    }
    if (parsed.type === 'exportExplanation') {
      await exportTraceExplanation(sourceUri, trace, issues, anomalies, parsed.selectedStageIndex);
    }
  });

  const styleUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'tracePanel.css'));
  const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'tracePanel.js'));
  panel.webview.html = getWebviewHtml(trace, issues, anomalies, sourceUri.fsPath, styleUri, scriptUri, panel.webview.cspSource);
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

async function exportAgentContext(
  sourceUri: vscode.Uri,
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  selectedStageIndex: unknown
): Promise<void> {
  const parsed = path.parse(sourceUri.fsPath);
  const defaultUri = vscode.Uri.file(path.join(parsed.dir, `${parsed.name}.pass-lens-agent-context.json`));
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: {
      JSON: ['json'],
      Markdown: ['md'],
      'All files': ['*']
    },
    saveLabel: 'Export Agent Context',
    title: 'Export Pass Lens agent context'
  });
  if (!target) {
    return;
  }

  const context = createAgentContext(trace, issues, anomalies, {
    sourcePath: sourceUri.fsPath,
    selectedStageIndex: typeof selectedStageIndex === 'number' ? selectedStageIndex : undefined
  });
  const content = path.extname(target.fsPath).toLowerCase() === '.md'
    ? createAgentContextMarkdown(context)
    : `${JSON.stringify(context, null, 2)}\n`;
  await fs.writeFile(target.fsPath, content, 'utf8');
  const open = await vscode.window.showInformationMessage('Pass Lens exported agent context.', 'Open');
  if (open === 'Open') {
    await vscode.window.showTextDocument(target, { preview: false });
  }
}

async function exportTraceExplanation(
  sourceUri: vscode.Uri,
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  selectedStageIndex: unknown
): Promise<void> {
  const parsed = path.parse(sourceUri.fsPath);
  const defaultUri = vscode.Uri.file(path.join(parsed.dir, `${parsed.name}.pass-lens-explanation.md`));
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: {
      Markdown: ['md'],
      'All files': ['*']
    },
    saveLabel: 'Export Explanation',
    title: 'Export Pass Lens suspicious pass explanation'
  });
  if (!target) {
    return;
  }

  const content = createTraceExplanation(trace, issues, anomalies, {
    sourcePath: sourceUri.fsPath,
    selectedStageIndex: typeof selectedStageIndex === 'number' ? selectedStageIndex : undefined
  });
  await fs.writeFile(target.fsPath, content, 'utf8');
  const open = await vscode.window.showInformationMessage('Pass Lens exported suspicious pass explanation.', 'Open');
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
  scriptUri: vscode.Uri,
  cspSource: string
): string {
  const encodedData = JSON.stringify({
    trace,
    traceIssues: issues,
    traceAnomalies: anomalies,
    traceIssueSummary: summarizeTraceIssues(issues),
    sourcePath
  }).replace(/</g, '\\u003c');
  const title = escapeHtml(trace.input ?? 'Pass Trace');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${escapeHtml(cspSource)} 'unsafe-inline'; script-src ${escapeHtml(cspSource)};">
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
  <template id="pass-lens-data">${escapeHtml(encodedData)}</template>
  <script src="${escapeHtml(scriptUri.toString())}"></script>
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

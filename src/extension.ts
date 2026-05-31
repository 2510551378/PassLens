import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { collectMlirTrace } from './mlirCollector';
import { computeTraceAnomalies } from './trace/anomalies';
import { normalizeTrace } from './trace/schema';
import { summarizeTraceIssues, validateTrace } from './trace/validation';
import type { MetricAnomaly, PassTrace, TraceIssue } from './types';

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
    return {
      trace,
      issues: validateTrace(trace),
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

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
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
    if (!isRecord(message)) {
      return;
    }
    if (message.type === 'copy' && typeof message.text === 'string') {
      await vscode.env.clipboard.writeText(message.text);
      vscode.window.showInformationMessage('Pass Lens copied repro command.');
    }
    if (message.type === 'openTrace') {
      await vscode.window.showTextDocument(sourceUri, { preview: false });
    }
  });

  panel.webview.html = getWebviewHtml(trace, issues, anomalies, sourceUri.fsPath, getNonce());
}

function getWebviewHtml(
  trace: PassTrace,
  issues: TraceIssue[],
  anomalies: MetricAnomaly[],
  sourcePath: string,
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pass Lens</title>
  <style>
    :root {
      --border: color-mix(in srgb, var(--vscode-foreground) 18%, transparent);
      --muted: color-mix(in srgb, var(--vscode-foreground) 64%, transparent);
      --changed: var(--vscode-testing-iconPassed);
      --unchanged: var(--vscode-descriptionForeground);
      --failed: var(--vscode-testing-iconFailed);
      --panel: color-mix(in srgb, var(--vscode-sideBar-background) 88%, var(--vscode-editor-background));
      --panel-strong: color-mix(in srgb, var(--vscode-sideBar-background) 74%, var(--vscode-editor-background));
      --added-bg: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 18%, transparent);
      --deleted-bg: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 18%, transparent);
      --row-hover: var(--vscode-list-hoverBackground);
      --row-active: var(--vscode-list-activeSelectionBackground);
      --code-bg: var(--vscode-editor-background);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    header {
      padding: 16px 18px 12px;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(180deg, var(--panel-strong), var(--vscode-editor-background));
    }

    h1 {
      margin: 0 0 6px;
      font-size: 20px;
      font-weight: 600;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      color: var(--muted);
      font-size: 12px;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
      margin-top: 12px;
    }

    .summary-card {
      appearance: none;
      text-align: left;
      color: inherit;
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      background: var(--panel);
      cursor: default;
      font: inherit;
    }

    .summary-card[data-jump] {
      cursor: pointer;
    }

    .summary-card[data-jump]:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--row-hover);
    }

    .summary-label {
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 4px;
    }

    .summary-value {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 17px;
      font-weight: 600;
    }

    .issue-panel {
      display: none;
      margin-top: 10px;
      border: 1px solid var(--border);
      border-left: 4px solid var(--vscode-notificationsWarningIcon-foreground, var(--vscode-editorWarning-foreground));
      border-radius: 6px;
      background: color-mix(in srgb, var(--vscode-notificationsWarningIcon-foreground, var(--vscode-editorWarning-foreground)) 8%, transparent);
      padding: 9px 10px;
    }

    .issue-panel.visible {
      display: block;
    }

    .issue-title {
      font-weight: 600;
      margin-bottom: 6px;
    }

    .issue-list {
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
    }

    .issue-list li {
      margin: 3px 0;
    }

    .issue-severity {
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    main {
      display: grid;
      grid-template-columns: minmax(320px, 34%) 1fr;
      min-height: calc(100vh - 105px);
    }

    aside {
      border-right: 1px solid var(--border);
      overflow: auto;
      min-width: 0;
    }

    section {
      min-width: 0;
      overflow: auto;
    }

    .toolbar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      color: var(--muted);
      font-size: 12px;
    }

    .toolbar span {
      align-self: center;
    }

    .search {
      width: 100%;
      min-width: 0;
      padding: 5px 7px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--border));
      font: inherit;
    }

    .toggle {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      white-space: nowrap;
    }

    .overview {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(18px, 1fr));
      gap: 4px;
      padding: 12px;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--panel) 82%, transparent);
    }

    .overview-segment {
      position: relative;
      height: 26px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: color-mix(in srgb, var(--vscode-foreground) 6%, transparent);
      cursor: pointer;
      overflow: hidden;
    }

    .overview-segment::after {
      content: '';
      position: absolute;
      inset: auto 0 0;
      height: var(--impact);
      background: var(--accent);
      opacity: 0.9;
    }

    .overview-segment.active {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }

    .stage-list {
      padding: 8px;
    }

    .stage-card {
      width: 100%;
      position: relative;
      margin: 0 0 8px;
      padding: 10px 12px 10px 14px;
      color: inherit;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      text-align: left;
      cursor: pointer;
      font: inherit;
      overflow: hidden;
    }

    .stage-card::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: var(--accent);
    }

    .stage-card::after {
      content: '';
      position: absolute;
      left: 4px;
      right: 0;
      bottom: 0;
      height: 3px;
      width: var(--impact);
      background: var(--accent);
      opacity: 0.75;
    }

    .stage-card:hover {
      background: var(--row-hover);
    }

    .stage-card.active {
      background: var(--row-active);
      color: var(--vscode-list-activeSelectionForeground);
      border-color: var(--vscode-focusBorder);
    }

    .stage-line {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: baseline;
      gap: 8px;
    }

    .stage-index,
    .duration,
    .scope,
    .status,
    .metric-delta {
      color: var(--muted);
      font-size: 12px;
    }

    .stage-pass {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .status.changed { color: var(--changed); }
    .status.unchanged { color: var(--unchanged); }

    .status.failed { color: var(--failed); }

    .details {
      padding: 16px 18px 28px;
    }

    .pass-hero {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: start;
      margin-bottom: 12px;
      border: 1px solid var(--border);
      border-left: 4px solid var(--accent);
      border-radius: 8px;
      padding: 14px;
      background: var(--panel);
    }

    .details h2 {
      margin: 18px 0 8px;
      font-size: 16px;
    }

    .details h2:first-child {
      margin-top: 0;
    }

    .insight {
      margin: 0 0 14px;
      border-left: 3px solid var(--vscode-textLink-foreground);
      padding: 8px 10px;
      background: color-mix(in srgb, var(--vscode-textLink-foreground) 8%, transparent);
      color: var(--vscode-foreground);
    }

    .badges {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
    }

    .pill {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 3px 8px;
      background: color-mix(in srgb, var(--vscode-foreground) 7%, transparent);
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }

    .pill.changed { color: var(--changed); border-color: color-mix(in srgb, var(--changed) 45%, var(--border)); }
    .pill.failed { color: var(--failed); border-color: color-mix(in srgb, var(--failed) 45%, var(--border)); }
    .pill.warning { color: var(--vscode-notificationsWarningIcon-foreground, var(--vscode-editorWarning-foreground)); }

    .action-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .action-button {
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      background: var(--vscode-button-secondaryBackground, var(--panel-strong));
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 5px 9px;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
    }

    .action-button:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--row-hover));
    }

    .action-button.primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border-color: var(--vscode-button-background);
    }

    .details-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 10px 0 14px;
    }

    .kv {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px;
      min-width: 0;
      background: color-mix(in srgb, var(--panel) 76%, transparent);
    }

    .kv-label {
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 4px;
    }

    .kv-value {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .anomaly-panel {
      border: 1px solid var(--border);
      border-left: 4px solid var(--vscode-notificationsWarningIcon-foreground, var(--vscode-editorWarning-foreground));
      border-radius: 6px;
      background: color-mix(in srgb, var(--vscode-notificationsWarningIcon-foreground, var(--vscode-editorWarning-foreground)) 8%, transparent);
      padding: 8px 10px;
      margin-bottom: 14px;
    }

    .anomaly-list {
      display: grid;
      gap: 6px;
    }

    .anomaly-item {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 8px;
      align-items: baseline;
      min-width: 0;
    }

    .anomaly-severity {
      color: var(--vscode-notificationsWarningIcon-foreground, var(--vscode-editorWarning-foreground));
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .anomaly-message {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .anomaly-delta {
      color: var(--muted);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    table.metrics {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 16px;
      font-variant-numeric: tabular-nums;
    }

    .metrics th,
    .metrics td {
      border-bottom: 1px solid var(--border);
      padding: 6px 8px;
      text-align: right;
    }

    .metrics th:first-child,
    .metrics td:first-child {
      text-align: left;
    }

    .metric-pos { color: var(--vscode-gitDecoration-addedResourceForeground); }
    .metric-neg { color: var(--vscode-gitDecoration-deletedResourceForeground); }

    .metric-name {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .metric-spark {
      flex: 1;
      min-width: 42px;
      height: 6px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
      overflow: hidden;
    }

    .metric-spark span {
      display: block;
      height: 100%;
      width: var(--spark);
      border-radius: inherit;
      background: var(--accent);
    }

    .diff-head {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 0 0 6px 48px;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .diff {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.45;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }

    .diff td {
      padding: 0 6px;
      vertical-align: top;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .diff .line-no {
      width: 48px;
      color: var(--muted);
      text-align: right;
      user-select: none;
      border-right: 1px solid var(--border);
    }

    .diff .code {
      width: calc(50% - 48px);
    }

    .diff tr.add td {
      background: var(--added-bg);
    }

    .diff tr.del td {
      background: var(--deleted-bg);
    }

    .empty {
      padding: 24px;
      color: var(--muted);
    }

    pre.diagnostics {
      margin: 0;
      max-height: 220px;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px;
      background: var(--code-bg);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }

    @media (max-width: 900px) {
      main {
        grid-template-columns: 1fr;
      }

      aside {
        border-right: 0;
        border-bottom: 1px solid var(--border);
        max-height: 42vh;
      }

      .details-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  </style>
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
        renderDiff(stage.irBefore ?? '', stage.irAfter ?? '') +
        renderCommandAndDiagnostics();
    }

    function renderPassHero(stage) {
      const failed = isFailedStage(stage);
      const statusClass = failed ? 'failed' : stage.changed ? 'changed' : '';
      const statusText = failed ? 'verifier failed' : stage.changed ? 'changed IR' : 'no IR change';
      const impact = impactPercent(stage);
      const anomalyCount = anomaliesForStage(stage.index).length;
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

    function renderCommandAndDiagnostics() {
      const command = trace.command
        ? '<h2>Repro Command</h2><div class="action-row"><button class="action-button" data-action="copy-command">Copy command</button></div><pre class="diagnostics">' + escapeHtml(trace.command) + '</pre>'
        : '';
      const diagnostics = trace.diagnostics ? '<h2>Diagnostics</h2><pre class="diagnostics">' + escapeHtml(trace.diagnostics) + '</pre>' : '';
      return command + diagnostics;
    }

    function renderDiff(beforeText, afterText) {
      const rows = diffLines(beforeText, afterText);
      if (!rows.length) {
        return '<div class="empty">No IR text recorded for this pass.</div>';
      }

      return '<div class="diff-head"><span>Before pass</span><span>After pass</span></div>' +
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

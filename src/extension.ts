import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  getDefaultMlirPipeline,
  pickMlirInputFile,
  pickMlirPipeline,
  pickTraceFile
} from './extensionInputs';
import {
  createCandidateRootCausesMarkdown,
  createGithubIssueDescription,
  createFirstFailureLocalizationMarkdown,
  createSuspiciousPassesMarkdown,
  explainFirstSignal,
  renderFirstSignalExplanation,
  type FirstSignalKind
} from './issueSummary';
import { collectMlirTrace } from './mlirCollector';
import {
  createMinimalFailingPrefixReport,
  runPrefixBisect,
  type PipelineRunRequest,
  type PipelineRunResult,
  type PipelineRunner
} from './rerun';
import { formatCommand, runProcess, trimOutput } from './process';
import { sampleTraces } from './sampleTraces';
import { computeTraceAnomalies } from './trace/anomalies';
import { evaluateTraceQuality, renderTraceQualityMarkdown } from './trace/quality';
import { evaluateTraceSize, renderTraceSizeMarkdown, type TraceSizeSummary } from './trace/size';
import { renderTraceQueryResultMarkdown, runTraceQuery, type TraceQuery } from './traceQuery';
import { PASS_LENS_QUERY_PICKERS, type QueryPickerItem, type TraceSummaryKind } from './passLensTools';
import { normalizeTrace } from './trace/schema';
import { validateTrace } from './trace/validation';
import { createTracePanelSessionManager } from './tracePanelSession';
import { getWebviewHtml } from './tracePanelHtml';
import { registerTracePanelMessageHandlers } from './tracePanelController';
import type { MetricAnomaly, PassTrace, TraceIssue } from './types';

type TraceQueryPick = vscode.QuickPickItem & QueryPickerItem;

const tracePanelSessionManager = createTracePanelSessionManager<LoadedTraceSession>();

interface LoadedTraceSession {
  loaded: LoadedTrace;
  sourceUri: vscode.Uri;
}

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
      const selected = await pickTraceFile('Open Pass Lens trace');
      if (!selected) {
        return;
      }

      const loaded = await readTrace(selected);
      openTracePanel(context, loaded, selected);
    }),
    vscode.commands.registerCommand('passLens.runMlirOptTrace', async () => {
      await runMlirOptTraceCommand(context);
    }),
    vscode.commands.registerCommand('passLens.runStructuredMlirTrace', async () => {
      await runStructuredMlirTraceCommand(context);
    }),
    vscode.commands.registerCommand('passLens.checkMlirCollectorSetup', async () => {
      await checkMlirCollectorSetupCommand(context);
    }),
    vscode.commands.registerCommand('passLens.queryCurrentTrace', async () => {
      await queryCurrentTraceCommand();
    }),
    vscode.commands.registerCommand('passLens.generateIssueDraft', async () => {
      await generateIssueDraftCommand();
    }),
    vscode.commands.registerCommand('passLens.runPrefixBisect', async () => {
      await runPrefixBisectCommand(context);
    })
  );
}

export function deactivate(): void {
  // Nothing to dispose. Commands are owned by the extension context.
}

async function runMlirOptTraceCommand(context: vscode.ExtensionContext): Promise<void> {
  const selected = await pickMlirInputFile('Select MLIR input');
  if (!selected) {
    return;
  }

  const pipeline = await pickMlirPipeline(
    'MLIR pass pipeline',
    'Example: builtin.module(func.func(canonicalize,cse))',
    getDefaultMlirPipeline()
  );
  if (!pipeline) {
    return;
  }

  const configuration = vscode.workspace.getConfiguration('passLens');
  const mlirOptPath = configuration.get<string>('mlirOptPath') || 'mlir-opt';
  const inputPath = selected.fsPath;
  const outputUri = getDefaultTraceUri(selected);

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
    openTracePanel(context, await toLoadedTrace(trace, outputUri.fsPath), outputUri);
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
  const selected = await pickMlirInputFile('Select MLIR input for structured Pass Lens trace');
  if (!selected) {
    return;
  }

  const pipeline = await pickMlirPipeline(
    'MLIR pass pipeline',
    'Example: builtin.module(func.func(canonicalize,cse))',
    getDefaultMlirPipeline()
  );
  if (!pipeline) {
    return;
  }

  const configuration = vscode.workspace.getConfiguration('passLens');
  const driverPath = configuration.get<string>('mlirDriverPath') || 'pass-lens-mlir-opt';
  const inputPath = selected.fsPath;
  const traceUri = getDefaultTraceUri(selected);
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
        openTracePanel(context, await toLoadedTrace(loaded.trace, traceUri.fsPath), traceUri);
      }
      throw new Error(trimOutput(result.stderr || result.stdout || `collector exited with code ${result.exitCode}`));
    }

    const loaded = await readTrace(traceUri);
    loaded.trace.command = loaded.trace.command ?? command;
    loaded.trace.exitCode = loaded.trace.exitCode ?? result.exitCode;
    loaded.trace.diagnostics = loaded.trace.diagnostics ?? trimOutput(result.stderr);
    vscode.window.showInformationMessage(`Pass Lens structured trace saved: ${traceUri.fsPath}`);
    openTracePanel(context, await toLoadedTrace(loaded.trace, traceUri.fsPath), traceUri);
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

async function runPrefixBisectCommand(context: vscode.ExtensionContext): Promise<void> {
  const selected = await pickMlirInputFile('Select MLIR input for prefix bisection');
  if (!selected) {
    return;
  }

  const activeSessionForDefaults = tracePanelSessionManager.getActiveSession();
  const defaultPipeline = activeSessionForDefaults?.loaded.trace.pipeline ??
    'builtin.module(func.func(canonicalize,cse))';
  const pipeline = await pickMlirPipeline(
    'MLIR pass pipeline to bisect',
    'Pass Lens will rerun textual prefixes of this pipeline with verifier enabled.',
    defaultPipeline
  );
  if (!pipeline) {
    return;
  }

  const configuration = vscode.workspace.getConfiguration('passLens');
  const driverPath = configuration.get<string>('mlirDriverPath') || 'pass-lens-mlir-opt';
  const inputPath = selected.fsPath;
  const runner = createMlirPrefixRunner(driverPath, inputPath, path.dirname(inputPath));

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Pass Lens: running prefix bisection',
        cancellable: false
      },
      async (progress) => {
        progress.report({ message: driverPath });
        return runPrefixBisect(pipeline.trim(), runner);
      }
    );
    const activeSessionForReport = tracePanelSessionManager.getActiveSession();
    await showMarkdownDocument(
      createMinimalFailingPrefixReport(result, activeSessionForReport?.loaded.trace)
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const action = await vscode.window.showErrorMessage(
      `Could not run prefix bisection. ${message}`,
      'Set Driver Path',
      'Check Setup'
    );
    if (action === 'Set Driver Path') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'passLens.mlirDriverPath');
    } else if (action === 'Check Setup') {
      await vscode.commands.executeCommand('passLens.checkMlirCollectorSetup');
    }
  }
}

function createMlirPrefixRunner(driverPath: string, inputPath: string, cwd: string): PipelineRunner {
  return {
    async runPipeline(request: PipelineRunRequest): Promise<PipelineRunResult> {
      const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const outputPath = path.join(os.tmpdir(), `pass-lens-bisect-${runId}.mlir`);
      const tracePath = path.join(os.tmpdir(), `pass-lens-bisect-${runId}.json`);
      const args = [
        inputPath,
        `--pass-pipeline=${request.pipeline}`,
        `--pass-lens-trace=${tracePath}`,
        '-o',
        outputPath
      ];
      const result = await runProcess(driverPath, args, cwd);
      await fs.rm(outputPath, { force: true }).catch(() => undefined);
      return {
        pipeline: request.pipeline,
        passCount: request.passCount,
        verifyEach: request.verifyEach,
        exitCode: result.exitCode,
        failed: result.exitCode !== 0,
        commandLine: formatCommand(driverPath, args),
        diagnostics: trimOutput(result.stderr || result.stdout),
        tracePath: await pathExists(tracePath) ? tracePath : undefined
      };
    }
  };
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

async function queryCurrentTraceCommand(): Promise<void> {
  const currentSession = tracePanelSessionManager.getActiveSession();
  if (!currentSession) {
    const action = await vscode.window.showWarningMessage(
      'Pass Lens has no current trace to query.',
      'Open Trace File',
      'Open Sample Trace'
    );
    if (action === 'Open Trace File') {
      await vscode.commands.executeCommand('passLens.openTraceFile');
    } else if (action === 'Open Sample Trace') {
      await vscode.commands.executeCommand('passLens.openSampleTrace');
    }
    return;
  }

  const picked = await vscode.window.showQuickPick<TraceQueryPick>(
    PASS_LENS_QUERY_PICKERS.map((entry) => ({
      label: entry.label,
      detail: entry.detail,
      id: entry.id,
      queryKind: entry.queryKind,
      summaryKind: entry.summaryKind
    })),
    {
      title: 'Pass Lens: Query Current Trace',
      placeHolder: 'Choose a deterministic trace query'
    }
  );
  if (!picked) {
    return;
  }

  const { loaded, sourceUri } = currentSession;
  if (picked.summaryKind) {
    const content = await resolveIssueSummary(picked.summaryKind, loaded, sourceUri);
    if (!content) {
      return;
    }
    await showMarkdownDocument(content);
    return;
  }

  const query = await resolveTraceQuery(picked);
  if (!query) {
    return;
  }

  const result = runTraceQuery(loaded.trace, query);
  const content = [
    renderTraceQueryResultMarkdown(result).trimEnd(),
    '',
    '## Source',
    '',
    `- Trace: ${sourceUri.fsPath}`,
    `- Tool: ${loaded.trace.tool ?? 'unknown'}`,
    `- Input: ${loaded.trace.input ?? 'unknown'}`
  ].join('\n');
  await showMarkdownDocument(`${content}\n`);
}

async function resolveIssueSummary(
  summaryKind: TraceSummaryKind,
  loaded: LoadedTrace,
  sourceUri: vscode.Uri
): Promise<string | undefined> {
  if (summaryKind === 'githubIssue') {
    return createGithubIssueDescription(loaded.trace, loaded.issues, loaded.anomalies, sourceUri.fsPath);
  }
  if (summaryKind === 'topSuspicious') {
    return `${createSuspiciousPassesMarkdown(loaded.trace, loaded.issues, loaded.anomalies, 3)}\n`;
  }
  if (summaryKind === 'candidateRootCauses') {
    return createCandidateRootCausesMarkdown(loaded.trace, loaded.issues, loaded.anomalies, 3);
  }
  if (summaryKind === 'firstSignal') {
    const picked = await vscode.window.showQuickPick(
      [
        { label: 'fallback', detail: 'First fallback metric, diagnostic, pass, or IR signal.' },
        { label: 'legality', detail: 'First legality, verifier, or failed-status signal.' },
        { label: 'budget', detail: 'First budget anomaly or budget-related metric signal.' }
      ],
      {
        title: 'Pass Lens: First Signal Family',
        placeHolder: 'Choose the signal family to explain'
      }
    );
    if (!picked) {
      return undefined;
    }
    return renderFirstSignalExplanation(explainFirstSignal(
      loaded.trace,
      loaded.issues,
      loaded.anomalies,
      picked.label as FirstSignalKind
    ));
  }
  if (summaryKind === 'traceQuality') {
    return renderTraceQualityMarkdown(evaluateTraceQuality(loaded.trace));
  }
  if (summaryKind === 'traceSize') {
    const fullTraceSizeSummary = await evaluateTraceSize(loaded.trace, sourceUri.fsPath, {
      includeArtifactStats: true
    });
    loaded.sizeSummary = fullTraceSizeSummary;
    return renderTraceSizeMarkdown(fullTraceSizeSummary);
  }
  if (summaryKind === 'firstFailureLocalization') {
    return createFirstFailureLocalizationMarkdown(loaded.trace, loaded.issues, loaded.anomalies);
  }
  return undefined;
}

async function generateIssueDraftCommand(): Promise<void> {
  const currentSession = tracePanelSessionManager.getActiveSession();
  if (!currentSession) {
    const action = await vscode.window.showWarningMessage(
      'Pass Lens has no current trace. Open a trace first.',
      'Open Trace File',
      'Open Sample Trace'
    );
    if (action === 'Open Trace File') {
      await vscode.commands.executeCommand('passLens.openTraceFile');
    } else if (action === 'Open Sample Trace') {
      await vscode.commands.executeCommand('passLens.openSampleTrace');
    }
    return;
  }

  const parsed = path.parse(currentSession.sourceUri.fsPath);
  const defaultUri = vscode.Uri.file(path.join(parsed.dir, `${parsed.name}.pass-lens-issue.md`));
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: {
      Markdown: ['md'],
      'All files': ['*']
    },
    saveLabel: 'Export Issue Draft',
    title: 'Export Pass Lens GitHub issue draft'
  });
  if (!target) {
    return;
  }

  const { trace, issues, anomalies } = currentSession.loaded;
  const content = createGithubIssueDescription(trace, issues, anomalies, currentSession.sourceUri.fsPath);
  await fs.writeFile(target.fsPath, content, 'utf8');
  const open = await vscode.window.showInformationMessage('Pass Lens exported issue draft.', 'Open');
  if (open === 'Open') {
    await vscode.window.showTextDocument(target, { preview: false });
  }
}

async function showMarkdownDocument(content: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content
  });
  await vscode.window.showTextDocument(document, { preview: true });
}

async function resolveTraceQuery(
  picked: TraceQueryPick
): Promise<TraceQuery | undefined> {
  if (picked.queryKind === 'firstFailure') {
    return { kind: 'firstFailure' };
  }
  if (picked.queryKind === 'firstChanged') {
    return { kind: 'firstChanged' };
  }
  if (picked.queryKind === 'firstMetricJump') {
    const metric = await askRequiredInput('Metric name', 'Example: fallback.count');
    return metric ? { kind: 'firstMetricJump', metric } : undefined;
  }
  if (picked.queryKind === 'metricBudget') {
    const metric = await askRequiredInput('Metric name', 'Example: ubBytes');
    if (!metric) {
      return undefined;
    }
    const budget = await askNumberInput('Metric budget', 'Example: 256');
    return typeof budget === 'number' ? { kind: 'metricBudget', metric, budget } : undefined;
  }
  if (picked.queryKind === 'slowest') {
    const count = await askNumberInput('Number of passes', 'Example: 5', '5');
    return typeof count === 'number' ? { kind: 'slowest', count } : undefined;
  }
  if (picked.queryKind === 'search') {
    const text = await askRequiredInput('Search text', 'Search pass names, scopes, diagnostics, and IR text');
    return text ? { kind: 'search', text } : undefined;
  }
  return undefined;
}

async function askRequiredInput(title: string, prompt: string): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title,
    prompt,
    ignoreFocusOut: true,
    validateInput: (input) => input.trim().length > 0 ? undefined : 'Value is required.'
  });
  return value?.trim();
}

async function askNumberInput(title: string, prompt: string, value?: string): Promise<number | undefined> {
  const input = await vscode.window.showInputBox({
    title,
    prompt,
    value,
    ignoreFocusOut: true,
    validateInput: (candidate) => {
      const parsed = Number(candidate);
      return Number.isFinite(parsed) ? undefined : 'Enter a finite number.';
    }
  });
  if (input === undefined) {
    return undefined;
  }
  return Number(input);
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
  sizeSummary: TraceSizeSummary;
}

async function readTrace(uri: vscode.Uri): Promise<LoadedTrace> {
  try {
    const content = await fs.readFile(uri.fsPath, 'utf8');
    const trace = normalizeTrace(JSON.parse(content));
    return {
      trace,
      issues: validateTrace(trace),
      anomalies: computeTraceAnomalies(trace),
      sizeSummary: await evaluateTraceSize(trace, uri.fsPath, { includeArtifactStats: false })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read Pass Lens trace ${uri.fsPath}: ${message}`);
  }
}

async function toLoadedTrace(trace: PassTrace, tracePath?: string): Promise<LoadedTrace> {
  return {
    trace,
    issues: validateTrace(trace),
    anomalies: computeTraceAnomalies(trace),
    sizeSummary: await evaluateTraceSize(trace, tracePath, { includeArtifactStats: false })
  };
}

function openTracePanel(context: vscode.ExtensionContext, loaded: LoadedTrace, sourceUri: vscode.Uri): void {
  const { trace, issues, anomalies, sizeSummary } = loaded;
  const panel = vscode.window.createWebviewPanel(
    'passLens.trace',
    `Pass Lens: ${trace.input ?? path.basename(sourceUri.fsPath) ?? 'trace'}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [context.extensionUri]
    }
  );

  tracePanelSessionManager.register(panel, { loaded, sourceUri });
  panel.onDidChangeViewState((event) => {
    if (event.webviewPanel.active) {
      tracePanelSessionManager.setActivePanel(event.webviewPanel);
    }
  });
  const messageHandler = registerTracePanelMessageHandlers(panel, {
    sourceUri,
    trace,
    issues,
    anomalies
  });
  panel.onDidDispose(() => {
    tracePanelSessionManager.unregister(panel);
    messageHandler.dispose();
  });

  const styleUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'tracePanel.css'));
  const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'tracePanel.js'));
  panel.webview.html = getWebviewHtml({
    trace,
    issues,
    anomalies,
    sizeSummary,
    sourcePath: sourceUri.fsPath,
    styleUri,
    scriptUri,
    cspSource: panel.webview.cspSource
  });
}

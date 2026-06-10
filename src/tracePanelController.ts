import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { createAgentContext, createAgentContextMarkdown } from './agentContext';
import { exportDirectoryReproBundle } from './directoryReproBundle';
import { createReproBundle } from './reproBundle';
import { createTraceExplanation } from './traceExplanation';
import { hydrateTraceStageArtifacts } from './trace/artifacts';
import { resolveArtifactPathWithinTraceRoot } from './trace/artifactPaths';
import { parseTracePanelMessage } from './webview/messages';
import type { MetricAnomaly, PassTrace, TraceIssue } from './types';

interface TracePanelContext {
  sourceUri: vscode.Uri;
  trace: PassTrace;
  issues: TraceIssue[];
  anomalies: MetricAnomaly[];
}

export function registerTracePanelMessageHandlers(
  panel: vscode.WebviewPanel,
  context: TracePanelContext
): vscode.Disposable {
  return panel.webview.onDidReceiveMessage(async (message: unknown) => {
    const parsed = parseTracePanelMessage(message);
    if (!parsed) {
      return;
    }

    if (parsed.type === 'copy') {
      await vscode.env.clipboard.writeText(parsed.text);
      vscode.window.showInformationMessage('Pass Lens copied repro command.');
      return;
    }

    if (parsed.type === 'openTrace') {
      await vscode.window.showTextDocument(context.sourceUri, { preview: false });
      return;
    }

    if (parsed.type === 'exportBundle') {
      await hydrateSelectedStageForExport(context, parsed.selectedStageIndex);
      await exportReproBundle(context, parsed.selectedStageIndex);
      return;
    }

    if (parsed.type === 'exportDirectoryBundle') {
      await hydrateSelectedStageForExport(context, parsed.selectedStageIndex);
      await exportReproDirectoryBundle(context, parsed.selectedStageIndex);
      return;
    }

    if (parsed.type === 'exportAgentContext') {
      await hydrateSelectedStageForExport(context, parsed.selectedStageIndex);
      await exportAgentContext(context, parsed.selectedStageIndex);
      return;
    }

    if (parsed.type === 'exportExplanation') {
      await hydrateSelectedStageForExport(context, parsed.selectedStageIndex);
      await exportTraceExplanation(context, parsed.selectedStageIndex);
      return;
    }

    if (parsed.type === 'copyAgentContext') {
      await hydrateSelectedStageForExport(context, parsed.selectedStageIndex);
      const content = createAgentContextJson(context, parsed.selectedStageIndex);
      await vscode.env.clipboard.writeText(content);
      vscode.window.showInformationMessage('Pass Lens copied agent context.');
      return;
    }

    if (parsed.type === 'copyExplanation') {
      await hydrateSelectedStageForExport(context, parsed.selectedStageIndex);
      const content = createTraceExplanation(context.trace, context.issues, context.anomalies, {
        sourcePath: context.sourceUri.fsPath,
        selectedStageIndex: typeof parsed.selectedStageIndex === 'number' ? parsed.selectedStageIndex : undefined
      });
      await vscode.env.clipboard.writeText(content);
      vscode.window.showInformationMessage('Pass Lens copied suspicious pass explanation.');
      return;
    }

    if (parsed.type === 'openArtifact') {
      await openArtifact(context.sourceUri, parsed.path);
      return;
    }

    if (parsed.type === 'requestStageArtifacts') {
      const artifactIssues = await hydrateTraceStageArtifacts(context.trace, context.sourceUri.fsPath, parsed.stageIndex);
      appendTraceIssues(context.issues, artifactIssues);
      const stage = context.trace.stages.find((entry) => entry.index === parsed.stageIndex);
      await panel.webview.postMessage({
        type: 'stageArtifacts',
        stageIndex: parsed.stageIndex,
        stage,
        issues: artifactIssues
      });
    }
  });
}

async function hydrateSelectedStageForExport(context: TracePanelContext, selectedStageIndex: unknown): Promise<void> {
  if (typeof selectedStageIndex !== 'number' || !Number.isFinite(selectedStageIndex)) {
    return;
  }
  const artifactIssues = await hydrateTraceStageArtifacts(context.trace, context.sourceUri.fsPath, selectedStageIndex);
  appendTraceIssues(context.issues, artifactIssues);
}

function appendTraceIssues(target: TraceIssue[], additions: TraceIssue[]): void {
  for (const issue of additions) {
    const exists = target.some(
      (entry) =>
        entry.severity === issue.severity &&
        entry.stageIndex === issue.stageIndex &&
        entry.field === issue.field &&
        entry.message === issue.message
    );
    if (!exists) {
      target.push(issue);
    }
  }
}

async function exportReproBundle(context: TracePanelContext, selectedStageIndex: unknown): Promise<void> {
  const parsed = path.parse(context.sourceUri.fsPath);
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

  const content = createReproBundle(context.trace, context.issues, context.anomalies, {
    sourcePath: context.sourceUri.fsPath,
    selectedStageIndex: typeof selectedStageIndex === 'number' ? selectedStageIndex : undefined
  });
  await fs.writeFile(target.fsPath, content, 'utf8');
  const open = await vscode.window.showInformationMessage('Pass Lens exported repro bundle.', 'Open');
  if (open === 'Open') {
    await vscode.window.showTextDocument(target, { preview: false });
  }
}

async function exportReproDirectoryBundle(context: TracePanelContext, selectedStageIndex: unknown): Promise<void> {
  const parsed = path.parse(context.sourceUri.fsPath);
  const target = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: vscode.Uri.file(path.join(parsed.dir, `${parsed.name}.pass-lens-repro`)),
    openLabel: 'Export Repro Directory',
    title: 'Select Pass Lens repro directory'
  });
  if (!target?.[0]) {
    return;
  }

  await exportDirectoryReproBundle(context.trace, context.issues, context.anomalies, {
    targetDir: target[0].fsPath,
    sourceTracePath: context.sourceUri.fsPath,
    selectedStageIndex: typeof selectedStageIndex === 'number' ? selectedStageIndex : undefined
  });
  const manifestUri = vscode.Uri.file(path.join(target[0].fsPath, 'manifest.json'));
  const open = await vscode.window.showInformationMessage('Pass Lens exported repro directory.', 'Open manifest');
  if (open === 'Open manifest') {
    await vscode.window.showTextDocument(manifestUri, { preview: false });
  }
}

function createAgentContextValue(context: TracePanelContext, selectedStageIndex: unknown) {
  return createAgentContext(context.trace, context.issues, context.anomalies, {
    sourcePath: context.sourceUri.fsPath,
    selectedStageIndex: typeof selectedStageIndex === 'number' ? selectedStageIndex : undefined
  });
}

function createAgentContextJson(context: TracePanelContext, selectedStageIndex: unknown): string {
  return `${JSON.stringify(createAgentContextValue(context, selectedStageIndex), null, 2)}\n`;
}

async function exportAgentContext(context: TracePanelContext, selectedStageIndex: unknown): Promise<void> {
  const parsed = path.parse(context.sourceUri.fsPath);
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

  const content = path.extname(target.fsPath).toLowerCase() === '.md'
    ? createAgentContextMarkdown(createAgentContextValue(context, selectedStageIndex))
    : createAgentContextJson(context, selectedStageIndex);
  await fs.writeFile(target.fsPath, content, 'utf8');
  const open = await vscode.window.showInformationMessage('Pass Lens exported agent context.', 'Open');
  if (open === 'Open') {
    await vscode.window.showTextDocument(target, { preview: false });
  }
}

async function exportTraceExplanation(context: TracePanelContext, selectedStageIndex: unknown): Promise<void> {
  const parsed = path.parse(context.sourceUri.fsPath);
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

  const content = createTraceExplanation(context.trace, context.issues, context.anomalies, {
    sourcePath: context.sourceUri.fsPath,
    selectedStageIndex: typeof selectedStageIndex === 'number' ? selectedStageIndex : undefined
  });
  await fs.writeFile(target.fsPath, content, 'utf8');
  const open = await vscode.window.showInformationMessage('Pass Lens exported suspicious pass explanation.', 'Open');
  if (open === 'Open') {
    await vscode.window.showTextDocument(target, { preview: false });
  }
}

async function openArtifact(sourceUri: vscode.Uri, artifactPath: string): Promise<void> {
  const resolved = resolveArtifactPathWithinTraceRoot(path.dirname(sourceUri.fsPath), artifactPath);
  if (!resolved.ok || !resolved.resolvedPath) {
    vscode.window.showWarningMessage(`Pass Lens rejected artifact path '${artifactPath}': ${resolved.message ?? 'invalid artifact path'}`);
    return;
  }
  if (!await pathExists(resolved.resolvedPath)) {
    vscode.window.showWarningMessage(`Pass Lens artifact does not exist: ${resolved.resolvedPath}`);
    return;
  }
  await vscode.window.showTextDocument(vscode.Uri.file(resolved.resolvedPath), { preview: false });
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

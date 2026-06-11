import * as vscode from 'vscode';

const MLIR_DEFAULT_PIPELINE = 'builtin.module(func.func(canonicalize,cse))';

const mlirFileFilters = {
  'MLIR files': ['mlir'],
  'All files': ['*']
};

const traceFileFilters = {
  'Pass Lens trace': ['json'],
  'All files': ['*']
};

async function pickOpenFile(
  title: string,
  options: { openFiles: boolean; filters: vscode.OpenDialogOptions['filters'] }
): Promise<vscode.Uri | undefined> {
  const items = await vscode.window.showOpenDialog({
    canSelectFiles: options.openFiles,
    canSelectFolders: false,
    canSelectMany: false,
    filters: options.filters,
    title
  });
  return items?.[0];
}

export async function pickMlirInputFile(title: string): Promise<vscode.Uri | undefined> {
  return pickOpenFile(title, { openFiles: true, filters: mlirFileFilters });
}

export async function pickTraceFile(title: string): Promise<vscode.Uri | undefined> {
  return pickOpenFile(title, { openFiles: true, filters: traceFileFilters });
}

export async function pickMlirPipeline(title: string, prompt: string, value = MLIR_DEFAULT_PIPELINE): Promise<string | undefined> {
  const pipeline = await vscode.window.showInputBox({
    title,
    prompt,
    value,
    ignoreFocusOut: true,
    validateInput: (candidate) => candidate.trim().length > 0 ? undefined : 'Pipeline is required.'
  });
  return pipeline?.trim();
}

export function getDefaultMlirPipeline(): string {
  return MLIR_DEFAULT_PIPELINE;
}

export type TracePanelMessage =
  | {
      type: 'copy';
      text: string;
    }
  | {
      type: 'openTrace';
    }
  | {
      type: 'exportBundle';
      selectedStageIndex?: number;
    }
  | {
      type: 'exportAgentContext';
      selectedStageIndex?: number;
    }
  | {
      type: 'exportExplanation';
      selectedStageIndex?: number;
    }
  | {
      type: 'copyAgentContext';
      selectedStageIndex?: number;
    }
  | {
      type: 'copyExplanation';
      selectedStageIndex?: number;
    }
  | {
      type: 'openArtifact';
      path: string;
    };

export function parseTracePanelMessage(raw: unknown): TracePanelMessage | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  if (raw.type === 'copy') {
    return typeof raw.text === 'string'
      ? {
          type: 'copy',
          text: raw.text
        }
      : undefined;
  }

  if (raw.type === 'openTrace') {
    return {
      type: 'openTrace'
    };
  }

  if (raw.type === 'exportBundle') {
    return typeof raw.selectedStageIndex === 'number' && Number.isFinite(raw.selectedStageIndex)
      ? {
          type: 'exportBundle',
          selectedStageIndex: raw.selectedStageIndex
        }
      : {
          type: 'exportBundle'
        };
  }

  if (raw.type === 'exportAgentContext') {
    return typeof raw.selectedStageIndex === 'number' && Number.isFinite(raw.selectedStageIndex)
      ? {
          type: 'exportAgentContext',
          selectedStageIndex: raw.selectedStageIndex
        }
      : {
          type: 'exportAgentContext'
        };
  }

  if (raw.type === 'exportExplanation') {
    return typeof raw.selectedStageIndex === 'number' && Number.isFinite(raw.selectedStageIndex)
      ? {
          type: 'exportExplanation',
          selectedStageIndex: raw.selectedStageIndex
        }
      : {
          type: 'exportExplanation'
        };
  }

  if (raw.type === 'copyAgentContext') {
    return typeof raw.selectedStageIndex === 'number' && Number.isFinite(raw.selectedStageIndex)
      ? {
          type: 'copyAgentContext',
          selectedStageIndex: raw.selectedStageIndex
        }
      : {
          type: 'copyAgentContext'
        };
  }

  if (raw.type === 'copyExplanation') {
    return typeof raw.selectedStageIndex === 'number' && Number.isFinite(raw.selectedStageIndex)
      ? {
          type: 'copyExplanation',
          selectedStageIndex: raw.selectedStageIndex
        }
      : {
          type: 'copyExplanation'
        };
  }

  if (raw.type === 'openArtifact') {
    return typeof raw.path === 'string' && raw.path.length > 0
      ? {
          type: 'openArtifact',
          path: raw.path
        }
      : undefined;
  }

  return undefined;
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

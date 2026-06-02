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

  return undefined;
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

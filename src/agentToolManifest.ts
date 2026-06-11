import type { PassTrace } from './types';
import { PASS_LENS_TOOL_IDS } from './passLensTools';

export interface AgentToolManifestOptions {
  sourcePath?: string;
}

export interface AgentToolManifest {
  schemaVersion: 1;
  kind: 'pass-lens-agent-tools';
  source: {
    trace?: string;
    tool?: string;
    compiler?: string;
    stageCount: number;
  };
  guardrails: string[];
  tools: AgentToolDescriptor[];
}

export interface AgentToolDescriptor {
  id: string;
  title: string;
  category: 'query' | 'report' | 'export' | 'rerun';
  stability: 'stable' | 'preview';
  description: string;
  inputSchema: Record<string, unknown>;
  output: {
    format: 'json' | 'markdown' | 'directory';
    schemaRef?: string;
  };
  requires?: string[];
}

export function createAgentToolManifest(
  trace: PassTrace,
  options: AgentToolManifestOptions = {}
): AgentToolManifest {
  return {
    schemaVersion: 1,
    kind: 'pass-lens-agent-tools',
    source: {
      trace: options.sourcePath,
      tool: trace.tool,
      compiler: trace.compiler?.name,
      stageCount: trace.stages.length
    },
    guardrails: [
      'All tool outputs are trace-grounded and must cite evidence IDs or concrete trace fields when making claims.',
      'Treat suspicious-pass and root-cause outputs as candidates until rerun, prefix bisection, verifier output, or source inspection confirms them.',
      'Do not auto-edit compiler source from these tool contracts alone.',
      'Prefer artifact-backed IR for large traces and request bounded context when using an LLM.'
    ],
    tools: [
      {
        id: PASS_LENS_TOOL_IDS.query.planNaturalLanguage,
        title: 'Plan Natural Language Query',
        category: 'query',
        stability: 'preview',
        description: 'Map a natural-language request to one deterministic Pass Lens query primitive when the intent is unambiguous.',
        inputSchema: objectSchema({
          request: stringSchema('Natural-language request to map, for example "find the first verifier failure".')
        }),
        output: {
          format: 'json'
        }
      },
      queryTool(PASS_LENS_TOOL_IDS.query.firstFailure, 'Find First Failure Stage', 'Find the first stage with failed status or verifier result.', {}),
      queryTool(PASS_LENS_TOOL_IDS.query.firstChanged, 'Find First Changed Stage', 'Find the first stage with changed=true.', {}),
      queryTool(PASS_LENS_TOOL_IDS.query.firstMetricJump, 'Find First Metric Jump', 'Find the first stage where a named metric changes.', {
        metric: stringSchema('Metric name, for example ops or fallback.count.')
      }),
      queryTool(PASS_LENS_TOOL_IDS.query.metricBudget, 'Find Metric Budget Overflow', 'List stages where a named metric exceeds a numeric budget.', {
        metric: stringSchema('Metric name, for example ops or memory.bytes.'),
        budget: numberSchema('Exclusive numeric budget threshold.')
      }),
      queryTool(PASS_LENS_TOOL_IDS.query.slowest, 'List Slowest Passes', 'List timed stages sorted by duration.', {
        count: numberSchema('Maximum number of stages to return.')
      }),
      queryTool(PASS_LENS_TOOL_IDS.query.search, 'Search Trace Text', 'Search pass names, scopes, diagnostics, and IR text.', {
        text: stringSchema('Search text.')
      }),
      reportTool(PASS_LENS_TOOL_IDS.report.githubIssue, 'Generate GitHub Issue Description', 'Generate a trace-grounded issue draft with evidence and guardrails.'),
      reportTool(PASS_LENS_TOOL_IDS.report.topSuspicious, 'Summarize Suspicious Passes', 'Rank suspicious pass candidates by deterministic trace signals.'),
      reportTool(PASS_LENS_TOOL_IDS.report.firstSignal, 'Explain First Signal', 'Explain the first fallback, legality, or budget signal.', {
        kind: enumSchema(['fallback', 'legality', 'budget'], 'Signal family.')
      }),
      reportTool(PASS_LENS_TOOL_IDS.report.candidateRootCauses, 'Generate Candidate Root Causes', 'Frame candidate root causes with evidence, uncertainty, and next experiments.'),
      reportTool(PASS_LENS_TOOL_IDS.report.firstFailureLocalization, 'Generate First Failure Localization Report', 'Generate a bounded first-failure localization hypothesis with confidence and next checks.'),
      reportTool(PASS_LENS_TOOL_IDS.report.traceQuality, 'Generate Trace Quality Report', 'Report collector credibility and trace-quality limitations.'),
      reportTool(PASS_LENS_TOOL_IDS.report.traceSize, 'Generate Trace Size Report', 'Summarize inline IR, artifacts, diagnostics, and size quick fixes.'),
      exportTool(PASS_LENS_TOOL_IDS.export.agentContext, 'Export Agent Context', 'Export bounded JSON context for tool-mediated agents.', 'json', '#/schemas/pass-lens-agent-context'),
      exportTool(PASS_LENS_TOOL_IDS.export.reproBundle, 'Export Markdown Repro Bundle', 'Export a Markdown repro bundle with summary, trace evidence, and regression test sketch.', 'markdown'),
      exportTool(PASS_LENS_TOOL_IDS.export.directoryReproBundle, 'Export Directory Repro Bundle', 'Export a directory containing trace, artifacts, scripts, manifest, agent context, and agent tools.', 'directory'),
      {
        id: PASS_LENS_TOOL_IDS.rerun.prefixBisect,
        title: 'Run Prefix Bisect',
        category: 'rerun',
        stability: 'preview',
        description: 'Run deterministic MLIR textual pipeline prefixes to identify a minimal failing prefix.',
        inputSchema: objectSchema({
          inputPath: stringSchema('Path to the MLIR input file.'),
          pipeline: stringSchema('MLIR textual pass pipeline.'),
          driverPath: stringSchema('Path to pass-lens-mlir-opt or a compatible driver.')
        }),
        output: {
          format: 'markdown'
        },
        requires: ['local-filesystem', 'compiler-driver']
      }
    ]
  };
}

function queryTool(
  id: string,
  title: string,
  description: string,
  properties: Record<string, unknown>
): AgentToolDescriptor {
  return {
    id,
    title,
    category: 'query',
    stability: 'stable',
    description,
    inputSchema: objectSchema(properties),
    output: {
      format: 'json'
    }
  };
}

function reportTool(
  id: string,
  title: string,
  description: string,
  properties: Record<string, unknown> = {}
): AgentToolDescriptor {
  return {
    id,
    title,
    category: 'report',
    stability: 'stable',
    description,
    inputSchema: objectSchema(properties),
    output: {
      format: 'markdown'
    }
  };
}

function exportTool(
  id: string,
  title: string,
  description: string,
  format: AgentToolDescriptor['output']['format'],
  schemaRef?: string
): AgentToolDescriptor {
  return {
    id,
    title,
    category: 'export',
    stability: 'stable',
    description,
    inputSchema: objectSchema({
      selectedStageIndex: {
        type: 'number',
        description: 'Optional selected stage index.'
      }
    }, []),
    output: {
      format,
      schemaRef
    }
  };
}

function objectSchema(
  properties: Record<string, unknown>,
  required = Object.keys(properties)
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required
  };
}

function stringSchema(description: string): Record<string, unknown> {
  return {
    type: 'string',
    description
  };
}

function numberSchema(description: string): Record<string, unknown> {
  return {
    type: 'number',
    description
  };
}

function enumSchema(values: string[], description: string): Record<string, unknown> {
  return {
    type: 'string',
    enum: values,
    description
  };
}

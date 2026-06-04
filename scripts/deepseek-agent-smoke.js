#!/usr/bin/env node

const { createAgentContext } = require('../out/agentContext.js');
const { createAgentToolManifest } = require('../out/agentToolManifest.js');

const defaultEndpoint = 'https://api.deepseek.com/chat/completions';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.DEEPSEEK_API_PASS_LENS;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_PASS_LENS is not set in this process environment.');
  }

  const model = args.model ?? 'deepseek-v4-flash';
  const endpoint = args.endpoint ?? defaultEndpoint;
  const timeoutMs = Number(args.timeoutMs ?? 45000);
  const trace = createSyntheticTrace();
  const context = createAgentContext(trace, [], [], {
    sourcePath: 'synthetic-agent-smoke.pass-lens.json',
    selectedStageIndex: 2
  });
  const manifest = createAgentToolManifest(trace, {
    sourcePath: 'synthetic-agent-smoke.pass-lens.json'
  });

  const response = await callDeepSeek({
    endpoint,
    apiKey,
    model,
    thinking: args.thinking ?? 'disabled',
    timeoutMs,
    context,
    manifest
  });
  const plan = parsePlan(response);
  validatePlan(plan, manifest);

  const selectedTool = manifest.tools.find((tool) => tool.id === plan.selectedToolId);
  const result = {
    ok: true,
    model,
    selectedToolId: plan.selectedToolId,
    selectedToolCategory: selectedTool.category,
    arguments: plan.arguments,
    evidenceIds: plan.evidenceIds,
    nextAction: plan.nextAction
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function callDeepSeek({ endpoint, apiKey, model, thinking, timeoutMs, context, manifest }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = {
      model,
      messages: [
        {
          role: 'system',
          content: [
            'You are testing Pass Lens agent interfaces.',
            'Return JSON only.',
            'Choose exactly one deterministic tool from agentTools.tools as the next safe action.',
            'Do not invent tool IDs.',
            'Do not propose editing compiler source.',
            'Every claim must cite evidence IDs or concrete trace fields.'
          ].join(' ')
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Select the safest next Pass Lens tool for localizing the first failure in this trace. Return json with keys: selectedToolId, arguments, rationale, evidenceIds, guardrails, nextAction.',
            expectedJsonShape: {
              selectedToolId: 'pass-lens.query.firstFailure',
              arguments: {},
              rationale: 'why this deterministic tool is the next safe action',
              evidenceIds: ['stages[2].status'],
              guardrails: ['no source edits without rerun evidence'],
              nextAction: 'what the automation wrapper should do next'
            },
            agentContext: context,
            agentTools: manifest
          })
        }
      ],
      response_format: {
        type: 'json_object'
      },
      thinking: {
        type: thinking
      },
      temperature: 0,
      max_tokens: 900
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`DeepSeek API returned HTTP ${response.status}: ${redact(text)}`);
    }
    const payload = JSON.parse(text);
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error(`DeepSeek response did not contain message.content: ${redact(text).slice(0, 500)}`);
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

function parsePlan(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`DeepSeek did not return parseable JSON: ${content.slice(0, 500)}`);
  }
}

function validatePlan(plan, manifest) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('Plan must be a JSON object.');
  }
  if (typeof plan.selectedToolId !== 'string') {
    throw new Error('Plan must include selectedToolId.');
  }
  const tool = manifest.tools.find((entry) => entry.id === plan.selectedToolId);
  if (!tool) {
    throw new Error(`Plan selected unknown tool ID: ${plan.selectedToolId}`);
  }
  if (!plan.arguments || typeof plan.arguments !== 'object' || Array.isArray(plan.arguments)) {
    throw new Error('Plan must include an arguments object.');
  }
  const properties = tool.inputSchema?.properties ?? {};
  const required = tool.inputSchema?.required ?? [];
  for (const key of required) {
    if (!(key in plan.arguments)) {
      throw new Error(`Plan is missing required argument ${key} for ${tool.id}.`);
    }
  }
  for (const key of Object.keys(plan.arguments)) {
    if (!(key in properties)) {
      throw new Error(`Plan includes unsupported argument ${key} for ${tool.id}.`);
    }
  }
  if (!Array.isArray(plan.evidenceIds) || !plan.evidenceIds.every((entry) => typeof entry === 'string')) {
    throw new Error('Plan must include evidenceIds as an array of strings.');
  }
  if (plan.evidenceIds.length === 0) {
    throw new Error('Plan must cite at least one evidence ID.');
  }
  const combinedText = JSON.stringify(plan).toLowerCase();
  const forbidden = [
    'edit compiler source',
    'modify compiler source',
    'auto-edit',
    'apply patch to compiler'
  ];
  for (const phrase of forbidden) {
    if (combinedText.includes(phrase)) {
      throw new Error(`Plan violates guardrail with phrase: ${phrase}`);
    }
  }
}

function createSyntheticTrace() {
  return {
    schemaVersion: 1,
    tool: 'generic-compiler-opt',
    compiler: {
      name: 'GenericCompiler'
    },
    input: 'synthetic.mlir',
    pipeline: 'builtin.module(func.func(canonicalize,convert-generic,verify-generic))',
    command: 'generic-compiler-opt synthetic.mlir --pass-pipeline=...',
    exitCode: 1,
    stages: [
      {
        index: 0,
        pass: 'canonicalize',
        changed: true,
        status: 'changed',
        verifier: 'ok',
        metricsBefore: {
          ops: 5
        },
        metricsAfter: {
          ops: 4
        },
        irBefore: 'module { func.func @main() { return } }',
        irAfter: 'module { func.func @main() { return } }'
      },
      {
        index: 1,
        pass: 'convert-generic',
        changed: true,
        status: 'changed',
        verifier: 'ok',
        metricsBefore: {
          ops: 4,
          'fallback.count': 0
        },
        metricsAfter: {
          ops: 7,
          'fallback.count': 2
        },
        irBefore: 'module { func.func @main() { return } }',
        irAfter: 'module { generic.fallback @main }'
      },
      {
        index: 2,
        pass: 'verify-generic',
        changed: false,
        status: 'verifier_failed',
        verifier: 'failed',
        diagnostics: 'verifier rejected generic.fallback without legality proof',
        metricsBefore: {
          ops: 7,
          'fallback.count': 2
        },
        metricsAfter: {
          ops: 7,
          'fallback.count': 2
        },
        irBefore: 'module { generic.fallback @main }',
        irAfter: 'module { generic.fallback @main }'
      }
    ]
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (entry === '--model') {
      result.model = argv[++index];
    } else if (entry === '--endpoint') {
      result.endpoint = argv[++index];
    } else if (entry === '--timeout-ms') {
      result.timeoutMs = argv[++index];
    } else if (entry === '--thinking') {
      result.thinking = argv[++index];
    } else if (entry === '--help' || entry === '-h') {
      process.stdout.write([
        'Usage: node scripts/deepseek-agent-smoke.js [--model deepseek-v4-flash] [--thinking disabled] [--endpoint URL]',
        '       node scripts/deepseek-agent-smoke.js deepseek-v4-flash 60000',
        '',
        'Requires DEEPSEEK_API_PASS_LENS in the process environment.'
      ].join('\n'));
      process.exit(0);
    } else if (!entry.startsWith('-') && !result.model) {
      result.model = entry;
    } else if (!entry.startsWith('-') && !result.timeoutMs) {
      result.timeoutMs = entry;
    } else {
      throw new Error(`Unknown argument: ${entry}`);
    }
  }
  return result;
}

function redact(text) {
  return text.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***');
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

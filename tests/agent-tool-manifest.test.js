const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createAgentToolManifest } = require('../out/agentToolManifest.js');

test('createAgentToolManifest declares generic deterministic agent tools', () => {
  const manifest = createAgentToolManifest({
    schemaVersion: 1,
    tool: 'generic-compiler',
    compiler: {
      name: 'ExampleCompiler'
    },
    stages: [
      {
        index: 0,
        pass: 'canonicalize',
        changed: true,
        status: 'ok'
      }
    ]
  }, {
    sourcePath: 'C:\\tmp\\trace.json'
  });
  const ids = manifest.tools.map((tool) => tool.id);

  assert.equal(manifest.kind, 'pass-lens-agent-tools');
  assert.equal(manifest.source.tool, 'generic-compiler');
  assert.equal(manifest.source.compiler, 'ExampleCompiler');
  assert.equal(manifest.source.stageCount, 1);
  assert.ok(ids.includes('pass-lens.query.planNaturalLanguage'));
  assert.ok(ids.includes('pass-lens.query.firstFailure'));
  assert.ok(ids.includes('pass-lens.report.candidateRootCauses'));
  assert.ok(ids.includes('pass-lens.report.firstFailureLocalization'));
  assert.ok(ids.includes('pass-lens.export.agentContext'));
  assert.ok(ids.includes('pass-lens.rerun.prefixBisect'));
  assert.ok(manifest.guardrails.some((entry) => /Do not auto-edit compiler source/.test(entry)));
  assert.equal(manifest.tools.find((tool) => tool.id === 'pass-lens.export.agentContext').output.schemaRef, '#/schemas/pass-lens-agent-context');
  assert.deepEqual(manifest.tools.find((tool) => tool.id === 'pass-lens.export.agentContext').inputSchema.required, []);
  assert.equal(manifest.tools.find((tool) => tool.id === 'pass-lens.query.planNaturalLanguage').stability, 'preview');
});

test('agent tools schema declares the public contract', () => {
  const schemaPath = path.resolve(__dirname, '..', 'docs', 'pass-lens-agent-tools.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.kind.const, 'pass-lens-agent-tools');
  assert.deepEqual(schema.required, ['schemaVersion', 'kind', 'source', 'guardrails', 'tools']);
  assert.ok(schema.$defs.tool.properties.category.enum.includes('query'));
  assert.ok(schema.$defs.tool.properties.category.enum.includes('rerun'));
});

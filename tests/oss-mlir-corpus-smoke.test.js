const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { resolveCollectorExecutable, splitLitSections, parseArgs, resolveCaseSource } = require('../scripts/oss-mlir-corpus-smoke.js');

test('splitLitSections separates lit chunks and drops expected-error fixtures', () => {
  const sections = splitLitSections(`
// RUN: mlir-opt %s
module {
  func.func @ok0() { return }
}

// -----

// expected-error@+1 {{intentional}}
"bad.op"() : () -> ()

// -----

module {
  func.func @ok1() { return }
}
`);

  assert.equal(sections.length, 2);
  assert.match(sections[0], /@ok0/);
  assert.match(sections[1], /@ok1/);
  assert.doesNotMatch(sections.join('\n'), /bad\.op/);
});

test('parseArgs resolves source-root CLI flag', () => {
  const parsed = parseArgs(['--source-root', '/tmp/offline/mlir/test']);
  assert.equal(parsed.sourceRoot, '/tmp/offline/mlir/test');
  assert.equal(parsed.help, false);
});

test('resolveCaseSource prefers local source root when file exists', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oss-smoke-local-'));
  try {
    const sourcePath = path.join(tmpRoot, 'Dialect', 'Arith', 'canonicalize.mlir');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'module { func.func @main() { return } }', 'utf8');

    const entry = {
      source: 'Dialect/Arith/canonicalize.mlir'
    };

    const local = resolveCaseSource(entry, tmpRoot);
    assert.equal(local.kind, 'local');
    assert.equal(local.sourcePath, sourcePath);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('resolveCollectorExecutable resolves explicit absolute paths', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oss-collector-explicit-'));
  try {
    const executable = path.join(tmpRoot, 'pass-lens-mlir-opt');
    fs.writeFileSync(executable, 'echo ok', 'utf8');

    const found = resolveCollectorExecutable(executable);
    assert.equal(found, executable);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('resolveCollectorExecutable finds collector from PATH', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oss-collector-path-'));
  const originalPath = process.env.PATH;
  const originalPathExt = process.env.PATHEXT;
  try {
    const command = 'pass-lens-mlir-opt';
    const executableName = process.platform === 'win32'
      ? `${command}.exe`
      : command;
    const executable = path.join(tmpRoot, executableName);
    fs.writeFileSync(executable, 'echo ok', 'utf8');

    process.env.PATH = `${tmpRoot}${path.delimiter}${originalPath}`;
    if (process.platform === 'win32') {
      process.env.PATHEXT = '.exe;.cmd;.bat;.com';
    }

    const found = resolveCollectorExecutable(command);
    assert.equal(found, executable);
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalPathExt === undefined) {
      delete process.env.PATHEXT;
    } else {
      process.env.PATHEXT = originalPathExt;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('oss-mlir smoke can run end-to-end with a local mock collector', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-oss-mock-smoke-'));
  const outputRoot = path.join(root, 'smoke');
  const sourceRoot = path.join(root, 'llvm-project', 'mlir', 'test');
  const fakeCollectorDir = path.join(root, 'mock-collector');
  const fakeCollectorScript = path.join(fakeCollectorDir, 'pass-lens-mlir-fake.js');
  const fakeCollectorCmd = path.join(fakeCollectorDir, 'pass-lens-mlir-fake.cmd');

  try {
    const caseSources = [
      { relative: 'Dialect/Arith/canonicalize.mlir', body: 'module {}' },
      { relative: 'Dialect/MemRef/canonicalize.mlir', body: 'module {}' },
      {
        relative: 'Dialect/SCF/canonicalize.mlir',
        body: 'module { func.func @ok0() { return } }\n// -----\nmodule { func.func @ok1() { return } }'
      },
      {
        relative: 'Transforms/canonicalize.mlir',
        body: 'module { func.func @ok0() { return } }\n// -----\nmodule { func.func @ok1() { return } }'
      }
    ];

    for (const { relative, body } of caseSources) {
      const sourcePath = path.join(sourceRoot, relative);
      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
      fs.writeFileSync(sourcePath, `${body}\n`, 'utf8');
    }

    fs.mkdirSync(fakeCollectorDir, { recursive: true });
    const scriptBody = `
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
function getArg(prefix, fallback) {
  const prefixed = args.find((entry) => entry.startsWith(prefix));
  if (prefixed) {
    return prefixed.slice(prefix.length);
  }
  const index = args.indexOf(prefix.replace('=', ''));
  return index >= 0 ? args[index + 1] : fallback;
}

function extractString(prefix) {
  const inline = args.find((entry) => entry.startsWith(prefix));
  if (!inline) {
    return undefined;
  }
  return inline.slice(prefix.length);
}

const tracePath = getArg('--pass-lens-trace=');
const artifactDirArg = getArg('--pass-lens-artifact-dir=');
const inputPath = args.find((entry) => !entry.startsWith('-') && entry.includes('.mlir')) || 'input.mlir';
const pipeline = extractString('--pass-pipeline=');

if (!tracePath || !artifactDirArg) {
  process.exit(1);
}

const traceDir = path.dirname(tracePath);
const artifactDir = path.join(traceDir, artifactDirArg);
fs.mkdirSync(artifactDir, { recursive: true });

const beforePath = path.join(artifactDirArg, '000-before.mlir');
const afterPath = path.join(artifactDirArg, '000-after.mlir');
const diagnosticsPath = path.join(artifactDirArg, '000-diagnostics.txt');

fs.writeFileSync(path.join(traceDir, beforePath), 'module {}', 'utf8');
fs.writeFileSync(path.join(traceDir, afterPath), 'module {}', 'utf8');
fs.writeFileSync(path.join(traceDir, diagnosticsPath), 'mock diagnostics', 'utf8');

const trace = {
  schemaVersion: 1,
  collectorVersion: 'mock-pass-lens-mlir-opt/0.1.0',
  provenance: {
    kind: 'live-pass-instrumentation',
    description: 'Local smoke fake collector trace.'
  },
  compiler: {
    name: 'pass-lens-mlir-opt',
    version: '0.0.0'
  },
  target: {
    backend: 'mock-mlir',
    platform: 'test-machine'
  },
  inputHash: 'sha256:mock',
  capture: {
    ir: 'artifact',
    metrics: true,
    timing: true
  },
  tool: 'pass-lens-mlir-opt',
  input: path.basename(inputPath),
  pipeline: pipeline || 'builtin.module(canonicalize,cse)',
  command: 'mock-pass-lens-mlir-opt ' + args.join(' '),
  exitCode: 0,
  stages: [
    {
      index: 0,
      pass: 'canonicalize',
      argument: 'canonicalize',
      opName: 'func.func',
      symbol: '@main',
      nestingDepth: 1,
      scope: 'func.func @main',
      changed: false,
      status: 'ok',
      durationMs: 0.1,
      verifier: 'ok',
      artifacts: {
        beforePath,
        afterPath,
        diagnosticsPath
      },
      metricsBefore: {
        ops: 10,
        lines: 20
      },
      metricsAfter: {
        ops: 10,
        lines: 20
      }
    }
  ]
};

fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2), 'utf8');
process.exit(0);
    `.trim();
    fs.writeFileSync(fakeCollectorScript, `${scriptBody}\n`, 'utf8');
    fs.writeFileSync(fakeCollectorCmd, `@echo off\r\nnode "${fakeCollectorScript}" %*\r\n`, 'utf8');

    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), 'scripts', 'oss-mlir-corpus-smoke.js')
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PASS_LENS_MLIR_OPT: fakeCollectorCmd,
        PASS_LENS_OSS_SOURCE_ROOT: sourceRoot,
        PASS_LENS_OSS_SMOKE_DIR: outputRoot
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const summaryPath = path.join(outputRoot, 'results.json');
    assert.equal(fs.existsSync(summaryPath), true, 'results.json should be produced');

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    assert.equal(summary.results.length >= 4, true);
    assert.equal(summary.validationExitCode, 0);
    assert.equal(summary.results.every((entry) => entry.status === 'ok'), true);
    assert.equal(summary.results.every((entry) => entry.stageCount >= 1), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

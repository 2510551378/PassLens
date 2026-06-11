const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const test = require('node:test');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  main,
  parseArgs,
  resolveTargets,
  resolveTargetsWithDiagnostics
} = require('../scripts/downstream-case-studies-smoke.js');

test('parseArgs handles iree flag', () => {
  const options = parseArgs(['--iree']);
  assert.equal(options.all, false);
  assert.equal(options.forceIree, true);
  assert.equal(options.forceTorch, false);
  assert.equal(options.failFast, false);
});

test('parseArgs handles fail-fast flag', () => {
  const options = parseArgs(['--torch', '--fail-fast']);
  assert.equal(options.forceTorch, true);
  assert.equal(options.failFast, true);
  assert.equal(options.all, false);
  assert.equal(options.minQuality, 0);
});

test('parseArgs handles min-quality flag', () => {
  const options = parseArgs(['--torch', '--min-quality', '90']);
  assert.equal(options.minQuality, 90);
});

test('parseArgs handles min-quality assignment flag', () => {
  const options = parseArgs(['--iree', '--min-quality=95']);
  assert.equal(options.minQuality, 95);
});

test('parseArgs handles invalid min-quality input', () => {
  const options = parseArgs(['--iree', '--min-quality', 'invalid', '--min-quality=88']);
  assert.equal(options.minQuality, 88);
});

test('parseArgs uses PASS_LENS_CASE_STUDY_MIN_QUALITY env as default', () => {
  const previousValue = process.env.PASS_LENS_CASE_STUDY_MIN_QUALITY;
  try {
    process.env.PASS_LENS_CASE_STUDY_MIN_QUALITY = '99';
    const options = parseArgs(['--torch']);
    assert.equal(options.minQuality, 99);
  } finally {
    if (previousValue === undefined) {
      delete process.env.PASS_LENS_CASE_STUDY_MIN_QUALITY;
    } else {
      process.env.PASS_LENS_CASE_STUDY_MIN_QUALITY = previousValue;
    }
  }
});

test('resolveTargets respects forced selection without driver env', () => {
  const previousTorchDriver = process.env.PASS_LENS_TORCH_MLIR_DRIVER;
  const previousIreeDriver = process.env.PASS_LENS_IREE_DRIVER;
  try {
    delete process.env.PASS_LENS_TORCH_MLIR_DRIVER;
    delete process.env.PASS_LENS_IREE_DRIVER;
    const targets = resolveTargets(parseArgs(['--iree']));
    assert.equal(targets.length, 0);
  } finally {
    if (previousTorchDriver === undefined) {
      delete process.env.PASS_LENS_TORCH_MLIR_DRIVER;
    } else {
      process.env.PASS_LENS_TORCH_MLIR_DRIVER = previousTorchDriver;
    }
    if (previousIreeDriver === undefined) {
      delete process.env.PASS_LENS_IREE_DRIVER;
    } else {
      process.env.PASS_LENS_IREE_DRIVER = previousIreeDriver;
    }
  }
});

test('resolveTargetsWithDiagnostics reports missing requirements for forced targets', () => {
  const previousTorchDriver = process.env.PASS_LENS_TORCH_MLIR_DRIVER;
  const previousIreeDriver = process.env.PASS_LENS_IREE_DRIVER;
  try {
    delete process.env.PASS_LENS_TORCH_MLIR_DRIVER;
    delete process.env.PASS_LENS_IREE_DRIVER;
    const result = resolveTargetsWithDiagnostics(parseArgs(['--iree']));
    assert.equal(result.targets.length, 0);
    assert.equal(result.skippedTargets.length, 1);
    assert.equal(result.skippedTargets[0].requiredEnv, 'PASS_LENS_IREE_DRIVER');
  } finally {
    if (previousTorchDriver === undefined) {
      delete process.env.PASS_LENS_TORCH_MLIR_DRIVER;
    } else {
      process.env.PASS_LENS_TORCH_MLIR_DRIVER = previousTorchDriver;
    }
    if (previousIreeDriver === undefined) {
      delete process.env.PASS_LENS_IREE_DRIVER;
    } else {
      process.env.PASS_LENS_IREE_DRIVER = previousIreeDriver;
    }
  }
});

test('main emits actionable message when no required downstream driver is available', () => {
  const previousTorchDriver = process.env.PASS_LENS_TORCH_MLIR_DRIVER;
  const previousIreeDriver = process.env.PASS_LENS_IREE_DRIVER;
  try {
    delete process.env.PASS_LENS_TORCH_MLIR_DRIVER;
    delete process.env.PASS_LENS_IREE_DRIVER;
    assert.throws(
      () => main(['--iree']),
      /No runnable downstream case study target selected|PASS_LENS_IREE_DRIVER|npm run smoke:iree-case-study/
    );
  } finally {
    if (previousTorchDriver === undefined) {
      delete process.env.PASS_LENS_TORCH_MLIR_DRIVER;
    } else {
      process.env.PASS_LENS_TORCH_MLIR_DRIVER = previousTorchDriver;
    }
    if (previousIreeDriver === undefined) {
      delete process.env.PASS_LENS_IREE_DRIVER;
    } else {
      process.env.PASS_LENS_IREE_DRIVER = previousIreeDriver;
    }
  }
});

test('resolveTargets selects both when env is present', () => {
  const previousTorchDriver = process.env.PASS_LENS_TORCH_MLIR_DRIVER;
  const previousIreeDriver = process.env.PASS_LENS_IREE_DRIVER;
  try {
    process.env.PASS_LENS_TORCH_MLIR_DRIVER = '/tmp/torch-driver';
    process.env.PASS_LENS_IREE_DRIVER = '/tmp/iree-driver';
    const targets = resolveTargets(parseArgs([]));
    assert.equal(targets.length, 2);
    assert.equal(targets[0].key, 'iree');
    assert.equal(targets[1].key, 'torch');
  } finally {
    if (previousTorchDriver === undefined) {
      delete process.env.PASS_LENS_TORCH_MLIR_DRIVER;
    } else {
      process.env.PASS_LENS_TORCH_MLIR_DRIVER = previousTorchDriver;
    }
    if (previousIreeDriver === undefined) {
      delete process.env.PASS_LENS_IREE_DRIVER;
    } else {
      process.env.PASS_LENS_IREE_DRIVER = previousIreeDriver;
    }
  }
});

test('parseArgs rejects unknown option', () => {
  assert.throws(
    () => parseArgs(['--unknown']),
    /Unknown argument/
  );
});

test('smoke script runs both available downstream case studies', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-downstream-mock-'));
  const ireeCaseRoot = path.join(root, 'iree');
  const torchCaseRoot = path.join(root, 'torch');
  const ireeDriverScript = path.join(root, 'mock-iree-driver.js');
  const torchDriverScript = path.join(root, 'mock-torch-driver.js');

  try {
    const mockDriverJs = [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      '',
      'const args = process.argv.slice(2);',
      'let tracePath = \'\';',
      'let artifactDir = \'\';',
      'let outputMlir = \'\';',
      '',
      'for (let i = 0; i < args.length; i += 1) {',
      '  const arg = args[i];',
      "  if (arg.startsWith('--pass-lens-trace=')) {",
      "    tracePath = arg.slice('--pass-lens-trace='.length);",
      "  } else if (arg.startsWith('--pass-lens-artifact-dir=')) {",
      "    artifactDir = arg.slice('--pass-lens-artifact-dir='.length);",
      "  } else if (arg === '-o' && args[i + 1]) {",
      '    outputMlir = args[i + 1];',
      '    i += 1;',
      '  }',
      '}',
      '',
      'if (!tracePath) {',
      '  process.exit(1);',
      '}',
      '',
      'const traceDirectory = path.dirname(tracePath);',
      "const artifactRelDir = artifactDir || 'mock-artifacts';",
      'const resolvedArtifactDir = path.isAbsolute(artifactRelDir)',
      '  ? artifactRelDir',
      '  : path.join(traceDirectory, artifactRelDir);',
      '',
      'const trace = {',
      '  schemaVersion: 1,',
      "  tool: 'mock-downstream-driver',",
      "  command: 'mock-downstream-driver',",
      "  provenance: { kind: 'live-pass-instrumentation', description: 'mock case study driver' },",
      "  capture: { ir: 'artifact', metrics: true, timing: true },",
      "  input: 'input.mlir',",
      "  pipeline: 'builtin.module(func.func(canonicalize,cse))',",
      '  stages: [',
      '    {',
      '      index: 0,',
      "      pass: 'canonicalize',",
      "      status: 'changed',",
      '      changed: true,',
      '      durationMs: 1.0,',
      "      verifier: 'ok',",
      "      opName: 'builtin.module',",
      "      argument: 'canonicalize',",
      '      metricsBefore: { ops: 7 },',
      '      metricsAfter: { ops: 9 },',
      '      artifacts: {',
      "        beforePath: artifactRelDir + '/stage-000000.before.mlir',",
      "        afterPath: artifactRelDir + '/stage-000000.after.mlir'",
      '      }',
      '    }',
      '  ]',
      '};',
      '',
      "fs.mkdirSync(path.dirname(tracePath), { recursive: true });",
      'if (artifactDir) {',
      '  fs.mkdirSync(resolvedArtifactDir, { recursive: true });',
      "  fs.writeFileSync(path.join(resolvedArtifactDir, 'stage-000000.before.mlir'), '(before)', 'utf8');",
      "  fs.writeFileSync(path.join(resolvedArtifactDir, 'stage-000000.after.mlir'), '(after)', 'utf8');",
      '}',
      '',
      "fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2), 'utf8');",
      'if (outputMlir) {',
      "  fs.writeFileSync(outputMlir, 'module {}', 'utf8');",
      '}',
      'process.exit(0);',
      ''
    ].join('\n');

    fs.writeFileSync(ireeDriverScript, mockDriverJs, 'utf8');
    fs.writeFileSync(torchDriverScript, mockDriverJs, 'utf8');

    const ireeDriver = path.join(root, 'mock-iree-driver.cmd');
    const torchDriver = path.join(root, 'mock-torch-driver.cmd');
    if (process.platform === 'win32') {
      fs.writeFileSync(ireeDriver, `@echo off\r\n"${process.execPath}" "${ireeDriverScript}" %*\r\n`, 'utf8');
      fs.writeFileSync(torchDriver, `@echo off\r\n"${process.execPath}" "${torchDriverScript}" %*\r\n`, 'utf8');
    } else {
      fs.writeFileSync(ireeDriver, `#!/bin/sh\n"${process.execPath}" "${ireeDriverScript}" "$@"\n`, 'utf8');
      fs.writeFileSync(torchDriver, `#!/bin/sh\n"${process.execPath}" "${torchDriverScript}" "$@"\n`, 'utf8');
      fs.chmodSync(ireeDriver, 0o755);
      fs.chmodSync(torchDriver, 0o755);
    }

    const previousIreeDriver = process.env.PASS_LENS_IREE_DRIVER;
    const previousTorchDriver = process.env.PASS_LENS_TORCH_MLIR_DRIVER;
    const previousIreeCaseDir = process.env.PASS_LENS_IREE_CASE_DIR;
    const previousTorchCaseDir = process.env.PASS_LENS_TORCH_MLIR_CASE_DIR;
    const previousIreePipeline = process.env.PASS_LENS_IREE_PIPELINE;
    const previousTorchPipeline = process.env.PASS_LENS_TORCH_MLIR_PIPELINE;
    const previousQuality = process.env.PASS_LENS_CASE_STUDY_MIN_QUALITY;
    try {
      process.env.PASS_LENS_IREE_DRIVER = ireeDriver;
      process.env.PASS_LENS_TORCH_MLIR_DRIVER = torchDriver;
      process.env.PASS_LENS_IREE_CASE_DIR = ireeCaseRoot;
      process.env.PASS_LENS_TORCH_MLIR_CASE_DIR = torchCaseRoot;
      process.env.PASS_LENS_IREE_PIPELINE = 'builtin.module(func.func(canonicalize))';
      process.env.PASS_LENS_TORCH_MLIR_PIPELINE = 'builtin.module(func.func(canonicalize))';
      process.env.PASS_LENS_CASE_STUDY_MIN_QUALITY = '90';

      const result = spawnSync(process.execPath, [
        path.join(process.cwd(), 'scripts', 'downstream-case-studies-smoke.js'),
        '--iree',
        '--torch'
      ], {
        cwd: process.cwd(),
        encoding: 'utf8'
      });

      assert.equal(result.status, 0, `downstream script failed: ${result.stdout}\n${result.stderr}`);

      const ireeSummaryPath = path.join(ireeCaseRoot, 'summary.json');
      const torchSummaryPath = path.join(torchCaseRoot, 'summary.json');
      const ireeSummary = JSON.parse(fs.readFileSync(ireeSummaryPath, 'utf8'));
      const torchSummary = JSON.parse(fs.readFileSync(torchSummaryPath, 'utf8'));

      assert.equal(ireeSummary.case, 'iree-downstream-lowering');
      assert.equal(torchSummary.case, 'torch-mlir-downstream-lowering');
      assert.equal(ireeSummary.stageCount, 1);
      assert.equal(torchSummary.stageCount, 1);
      assert.equal(ireeSummary.qualityScore >= 90, true);
      assert.equal(torchSummary.qualityScore >= 90, true);
      assert.equal(typeof ireeSummary.qualitySummary, 'string');
      assert.equal(ireeSummary.errors.length, 0);
      assert.equal(torchSummary.errors.length, 0);
      assert.equal(ireeSummary.provenanceKind, 'live-pass-instrumentation');
      assert.equal(torchSummary.provenanceKind, 'live-pass-instrumentation');

      const minQuality = Number(ireeSummary.qualityScore);
      if (!Number.isFinite(minQuality)) {
        throw new Error(`Unexpected quality score: ${ireeSummary.qualityScore}`);
      }

      const tightenedResult = spawnSync(process.execPath, [
        path.join(process.cwd(), 'scripts', 'downstream-case-studies-smoke.js'),
        '--iree',
        '--min-quality',
        String(minQuality + 1)
      ], {
        cwd: process.cwd(),
        encoding: 'utf8'
      });
      assert.equal(tightenedResult.status, 1, `script unexpectedly passed with impossible quality floor`);
      const tightenedSummary = JSON.parse(fs.readFileSync(path.join(ireeCaseRoot, 'summary.json'), 'utf8'));
      assert.equal(
        tightenedSummary.errors.some((entry) => entry.includes('quality score')),
        true
      );
    } finally {
      if (previousIreeDriver === undefined) {
        delete process.env.PASS_LENS_IREE_DRIVER;
      } else {
        process.env.PASS_LENS_IREE_DRIVER = previousIreeDriver;
      }
      if (previousTorchDriver === undefined) {
        delete process.env.PASS_LENS_TORCH_MLIR_DRIVER;
      } else {
        process.env.PASS_LENS_TORCH_MLIR_DRIVER = previousTorchDriver;
      }
      if (previousIreeCaseDir === undefined) {
        delete process.env.PASS_LENS_IREE_CASE_DIR;
      } else {
        process.env.PASS_LENS_IREE_CASE_DIR = previousIreeCaseDir;
      }
      if (previousTorchCaseDir === undefined) {
        delete process.env.PASS_LENS_TORCH_MLIR_CASE_DIR;
      } else {
        process.env.PASS_LENS_TORCH_MLIR_CASE_DIR = previousTorchCaseDir;
      }
      if (previousIreePipeline === undefined) {
        delete process.env.PASS_LENS_IREE_PIPELINE;
      } else {
        process.env.PASS_LENS_IREE_PIPELINE = previousIreePipeline;
      }
      if (previousTorchPipeline === undefined) {
        delete process.env.PASS_LENS_TORCH_MLIR_PIPELINE;
      } else {
        process.env.PASS_LENS_TORCH_MLIR_PIPELINE = previousTorchPipeline;
      }
      if (previousQuality === undefined) {
        delete process.env.PASS_LENS_CASE_STUDY_MIN_QUALITY;
      } else {
        process.env.PASS_LENS_CASE_STUDY_MIN_QUALITY = previousQuality;
      }
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
});

test('fail-fast stops after the first downstream target failure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-lens-downstream-failfast-'));
  const ireeCaseRoot = path.join(root, 'iree');
  const torchCaseRoot = path.join(root, 'torch');
  const markerDir = path.join(root, 'markers');
  const ireeCalledMarker = path.join(markerDir, 'iree-called');
  const torchCalledMarker = path.join(markerDir, 'torch-called');
  const ireeDriverScript = path.join(root, 'mock-iree-driver.js');
  const torchDriverScript = path.join(root, 'mock-torch-driver.js');

  try {
    fs.mkdirSync(markerDir, { recursive: true });

    const goodDriverJs = [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const markerPath = process.env.PASS_LENS_TEST_MARKER;",
      '',
      'if (markerPath) {',
      "  fs.mkdirSync(path.dirname(markerPath), { recursive: true });",
      "  fs.writeFileSync(markerPath, 'ok', 'utf8');",
      '}',
      '',
      'const args = process.argv.slice(2);',
      'let tracePath = \'\';',
      'let artifactDir = \'\';',
      'let outputMlir = \'\';',
      '',
      'for (let i = 0; i < args.length; i += 1) {',
      '  const arg = args[i];',
      "  if (arg.startsWith('--pass-lens-trace=')) {",
      "    tracePath = arg.slice('--pass-lens-trace='.length);",
      "  } else if (arg.startsWith('--pass-lens-artifact-dir=')) {",
      "    artifactDir = arg.slice('--pass-lens-artifact-dir='.length);",
      "  } else if (arg === '-o' && args[i + 1]) {",
      '    outputMlir = args[i + 1];',
      '    i += 1;',
      '  }',
      '}',
      '',
      'if (!tracePath) {',
      '  process.exit(1);',
      '}',
      '',
      'const traceDirectory = path.dirname(tracePath);',
      "const artifactRelDir = artifactDir || 'mock-artifacts';",
      'const resolvedArtifactDir = path.isAbsolute(artifactRelDir)',
      '  ? artifactRelDir',
      '  : path.join(traceDirectory, artifactRelDir);',
      '',
      'const trace = {',
      '  schemaVersion: 1,',
      "  tool: 'mock-downstream-driver',",
      "  command: 'mock-downstream-driver',",
      "  collectorVersion: 'mock.1',",
      "  provenance: { kind: 'live-pass-instrumentation', description: 'mock case study driver' },",
      "  capture: { ir: 'artifact', metrics: true, timing: true },",
      "  input: 'input.mlir',",
      "  pipeline: 'builtin.module(func.func(canonicalize,cse))',",
      '  stages: [',
      '    {',
      '      index: 0,',
      "      pass: 'canonicalize',",
      "      status: 'changed',",
      '      changed: true,',
      '      durationMs: 1.0,',
      "      verifier: 'ok',",
      "      opName: 'builtin.module',",
      "      argument: 'canonicalize',",
      '      metricsBefore: { ops: 7 },',
      '      metricsAfter: { ops: 9 },',
      '      artifacts: {',
      "        beforePath: artifactRelDir + '/stage-000000.before.mlir',",
      "        afterPath: artifactRelDir + '/stage-000000.after.mlir'",
      '      }',
      '    }',
      '  ]',
      '};',
      '',
      "fs.mkdirSync(path.dirname(tracePath), { recursive: true });",
      'if (artifactDir) {',
      '  fs.mkdirSync(resolvedArtifactDir, { recursive: true });',
      "  fs.writeFileSync(path.join(resolvedArtifactDir, 'stage-000000.before.mlir'), '(before)', 'utf8');",
      "  fs.writeFileSync(path.join(resolvedArtifactDir, 'stage-000000.after.mlir'), '(after)', 'utf8');",
      '}',
      "fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2), 'utf8');",
      'if (outputMlir) {',
      "  fs.writeFileSync(outputMlir, 'module {}', 'utf8');",
      '}',
      'process.exit(0);',
      ''
    ].join('\n');

    fs.writeFileSync(ireeDriverScript, goodDriverJs, 'utf8');
    fs.writeFileSync(torchDriverScript, goodDriverJs, 'utf8');

    const ireeDriver = path.join(root, 'mock-iree-driver.cmd');
    const torchDriver = path.join(root, 'mock-torch-driver.cmd');
    if (process.platform === 'win32') {
      fs.writeFileSync(
        ireeDriver,
        `@echo off\r\nset PASS_LENS_TEST_MARKER=${ireeCalledMarker}\r\n"${process.execPath}" "${ireeDriverScript}" %*\r\n`,
        'utf8'
      );
      fs.writeFileSync(
        torchDriver,
        `@echo off\r\nset PASS_LENS_TEST_MARKER=${torchCalledMarker}\r\n"${process.execPath}" "${torchDriverScript}" %*\r\n`,
        'utf8'
      );
    } else {
      fs.writeFileSync(
        ireeDriver,
        `#!/bin/sh\nexport PASS_LENS_TEST_MARKER=${ireeCalledMarker}\n"${process.execPath}" "${ireeDriverScript}" "$@"\n`,
        'utf8'
      );
      fs.writeFileSync(
        torchDriver,
        `#!/bin/sh\nexport PASS_LENS_TEST_MARKER=${torchCalledMarker}\n"${process.execPath}" "${torchDriverScript}" "$@"\n`,
        'utf8'
      );
      fs.chmodSync(ireeDriver, 0o755);
      fs.chmodSync(torchDriver, 0o755);
    }

    const previousIreeDriver = process.env.PASS_LENS_IREE_DRIVER;
    const previousTorchDriver = process.env.PASS_LENS_TORCH_MLIR_DRIVER;
    const previousIreeCaseDir = process.env.PASS_LENS_IREE_CASE_DIR;
    const previousTorchCaseDir = process.env.PASS_LENS_TORCH_MLIR_CASE_DIR;
    const previousIreePipeline = process.env.PASS_LENS_IREE_PIPELINE;
    const previousTorchPipeline = process.env.PASS_LENS_TORCH_MLIR_PIPELINE;
    const previousQuality = process.env.PASS_LENS_CASE_STUDY_MIN_QUALITY;

    try {
      process.env.PASS_LENS_IREE_DRIVER = ireeDriver;
      process.env.PASS_LENS_TORCH_MLIR_DRIVER = torchDriver;
      process.env.PASS_LENS_IREE_CASE_DIR = ireeCaseRoot;
      process.env.PASS_LENS_TORCH_MLIR_CASE_DIR = torchCaseRoot;
      process.env.PASS_LENS_IREE_PIPELINE = 'builtin.module(func.func(canonicalize))';
      process.env.PASS_LENS_TORCH_MLIR_PIPELINE = 'builtin.module(func.func(canonicalize))';

      const result = spawnSync(process.execPath, [
        path.join(process.cwd(), 'scripts', 'downstream-case-studies-smoke.js'),
        '--iree',
        '--torch',
        '--fail-fast',
        '--min-quality',
        '101'
      ], {
        cwd: process.cwd(),
        encoding: 'utf8'
      });

      assert.equal(result.status, 1);
      assert.equal(fs.existsSync(ireeCalledMarker), true);
      assert.equal(fs.existsSync(torchCalledMarker), false);

      const ireeSummaryPath = path.join(ireeCaseRoot, 'summary.json');
      const ireeSummary = JSON.parse(fs.readFileSync(ireeSummaryPath, 'utf8'));
      assert.equal(ireeSummary.errors.length > 0, true);
    } finally {
      if (previousIreeDriver === undefined) {
        delete process.env.PASS_LENS_IREE_DRIVER;
      } else {
        process.env.PASS_LENS_IREE_DRIVER = previousIreeDriver;
      }
      if (previousTorchDriver === undefined) {
        delete process.env.PASS_LENS_TORCH_MLIR_DRIVER;
      } else {
        process.env.PASS_LENS_TORCH_MLIR_DRIVER = previousTorchDriver;
      }
      if (previousIreeCaseDir === undefined) {
        delete process.env.PASS_LENS_IREE_CASE_DIR;
      } else {
        process.env.PASS_LENS_IREE_CASE_DIR = previousIreeCaseDir;
      }
      if (previousTorchCaseDir === undefined) {
        delete process.env.PASS_LENS_TORCH_MLIR_CASE_DIR;
      } else {
        process.env.PASS_LENS_TORCH_MLIR_CASE_DIR = previousTorchCaseDir;
      }
      if (previousIreePipeline === undefined) {
        delete process.env.PASS_LENS_IREE_PIPELINE;
      } else {
        process.env.PASS_LENS_IREE_PIPELINE = previousIreePipeline;
      }
      if (previousTorchPipeline === undefined) {
        delete process.env.PASS_LENS_TORCH_MLIR_PIPELINE;
      } else {
        process.env.PASS_LENS_TORCH_MLIR_PIPELINE = previousTorchPipeline;
      }
      if (previousQuality === undefined) {
        delete process.env.PASS_LENS_CASE_STUDY_MIN_QUALITY;
      } else {
        process.env.PASS_LENS_CASE_STUDY_MIN_QUALITY = previousQuality;
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

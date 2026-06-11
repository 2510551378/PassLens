#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = process.cwd();

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function main(argv) {
  const options = parseArgs(argv);
  const { targets, skippedTargets } = resolveTargetsWithDiagnostics(options);
  if (targets.length === 0) {
    throw new Error(formatNoTargetError(skippedTargets, options));
  }

  if (skippedTargets.length > 0) {
    returnLine(formatSkippedTargetsWarning(skippedTargets));
  }

  const errors = [];
  for (const target of targets) {
    const targetResult = runTarget(target, options.minQuality);
    if (targetResult.success) {
      returnLine(`ok ${target.label}: ${targetResult.summary}`);
    } else {
      errors.push(`${target.label}: ${targetResult.summary}`);
      returnLine(`FAIL ${target.label}: ${targetResult.summary}`);
      if (options.failFast) {
        process.exitCode = 1;
        break;
      }
    }
  }

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const options = {
    all: true,
    forceIree: false,
    forceTorch: false,
    failFast: false,
    ireeDriver: undefined,
    torchDriver: undefined,
    minQuality: readPositiveInt(process.env.PASS_LENS_CASE_STUDY_MIN_QUALITY, 0)
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--iree') {
      options.forceIree = true;
      options.all = false;
    } else if (arg === '--torch') {
      options.forceTorch = true;
      options.all = false;
    } else if (arg === '--iree-driver') {
      options.ireeDriver = argv[index + 1] || options.ireeDriver;
      index += 1;
    } else if (arg.startsWith('--iree-driver=')) {
      options.ireeDriver = arg.slice('--iree-driver='.length);
    } else if (arg === '--torch-driver') {
      options.torchDriver = argv[index + 1] || options.torchDriver;
      index += 1;
    } else if (arg.startsWith('--torch-driver=')) {
      options.torchDriver = arg.slice('--torch-driver='.length);
    } else if (arg === '--fail-fast') {
      options.failFast = true;
    } else if (arg === '--min-quality') {
      options.minQuality = readPositiveInt(argv[index + 1], options.minQuality);
      index += 1;
    } else if (arg.startsWith('--min-quality=')) {
      options.minQuality = readPositiveInt(arg.slice('--min-quality='.length), options.minQuality);
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolveTargets(options) {
  return resolveTargetsWithDiagnostics(options).targets;
}

function resolveTargetsWithDiagnostics(options) {
  const candidates = [];
  const skippedTargets = [];
  if (!options.all) {
    if (options.forceIree) {
      candidates.push('iree');
    }
    if (options.forceTorch) {
      candidates.push('torch');
    }
  } else {
    candidates.push('iree', 'torch');
  }

  const targets = [];
  for (const candidate of candidates) {
    if (candidate === 'iree') {
      const driver = options.ireeDriver || process.env.PASS_LENS_IREE_DRIVER;
      if (!driver) {
        skippedTargets.push({
          key: 'iree',
          label: 'IREE structured case study',
          requiredEnv: 'PASS_LENS_IREE_DRIVER',
          requiredCli: '--iree-driver',
          script: 'npm run smoke:iree-case-study',
          envExample: {
            powershell: '$env:PASS_LENS_IREE_DRIVER = "C:\\path\\to\\downstream-pass-lens-driver"',
            posix: 'export PASS_LENS_IREE_DRIVER="/path/to/downstream-pass-lens-driver"'
          }
        });
        continue;
      }
      targets.push({
        key: 'iree',
        label: 'IREE structured case study',
        script: 'scripts/iree-case-study-smoke.js',
        requiredEnv: 'PASS_LENS_IREE_DRIVER',
        driver
      });
    } else if (candidate === 'torch') {
      const driver = options.torchDriver || process.env.PASS_LENS_TORCH_MLIR_DRIVER;
      if (!driver) {
        skippedTargets.push({
          key: 'torch',
          label: 'Torch-MLIR structured case study',
          requiredEnv: 'PASS_LENS_TORCH_MLIR_DRIVER',
          requiredCli: '--torch-driver',
          script: 'npm run smoke:torch-mlir-case-study',
          envExample: {
            powershell: '$env:PASS_LENS_TORCH_MLIR_DRIVER = "C:\\path\\to\\downstream-pass-lens-driver"',
            posix: 'export PASS_LENS_TORCH_MLIR_DRIVER="/path/to/downstream-pass-lens-driver"'
          }
        });
        continue;
      }
      targets.push({
        key: 'torch',
        label: 'Torch-MLIR structured case study',
        script: 'scripts/torch-mlir-case-study-smoke.js',
        requiredEnv: 'PASS_LENS_TORCH_MLIR_DRIVER',
        driver
      });
    }
  }

  return { targets, skippedTargets };
}

function runTarget(target, minQuality) {
  const args = [path.join(root, target.script), '--min-quality', String(minQuality), '--driver', target.driver];
  const child = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PASS_LENS_CASE_STUDY_MIN_QUALITY: String(minQuality)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (child.error) {
    return {
      success: false,
      summary: `launcher error: ${child.error.message}`
    };
  }

  const output = [child.stdout, child.stderr].filter(Boolean).join('\\n').trim();
  const summary = output
    ? output.split(/\\n/).slice(-1)[0]
    : 'completed';

  return {
    success: child.status === 0,
    summary: `status=${child.status}, ${summary || 'no output'}`
  };
}

function formatNoTargetError(skippedTargets, options) {
  const requested = [];
  if (options.forceIree) {
    requested.push('IREE (--iree)');
  }
  if (options.forceTorch) {
    requested.push('Torch-MLIR (--torch)');
  }
  if (options.all || requested.length === 0) {
    requested.push('IREE/torch-mlir (default auto-detection)');
  }

  const header = `No runnable downstream case study target selected.`;
  const missingLines = skippedTargets.length > 0
    ? skippedTargets.map((target) => (
        `- ${target.label}: set ${target.requiredEnv} and run ${target.script}.`
      ))
    : ['- Set PASS_LENS_IREE_DRIVER and/or PASS_LENS_TORCH_MLIR_DRIVER.'];

  const envHints = skippedTargets
    .map((target) => `- ${target.label}: ${target.envExample.powershell} (powershell) / ${target.envExample.posix} (shell)`)
    .join('\n');

  const commandHints = [
    '- Then set one env and run:',
    '  # IREE only',
    '  npm run smoke:iree-case-study',
    '  # or:',
    '  node scripts/downstream-case-studies-smoke.js --iree --iree-driver /path/to/downstream-driver',
    '  # Torch-MLIR only',
    '  npm run smoke:torch-mlir-case-study',
    '  # or:',
    '  node scripts/downstream-case-studies-smoke.js --torch --torch-driver /path/to/downstream-driver',
    '  # Both (auto-detected)',
    '  npm run smoke:downstream-case-studies',
    '  node scripts/downstream-case-studies-smoke.js --iree-driver /path/to/iree-driver --torch-driver /path/to/torch-mlir-driver',
    '',
    `Requested scope: ${requested.join(', ')}`
  ].join('\n');

  const envHintSection = envHints.length > 0 ? `\nExamples:\n${envHints}` : '';
  return `${header}\nMissing:\n${missingLines.join('\n')}${envHintSection}\n${commandHints}`;
}

function formatSkippedTargetsWarning(skippedTargets) {
  const lines = skippedTargets.map((target) => (
    `Skipping ${target.label}: missing ${target.requiredEnv}`
  ));
  return `Warning: ${lines.join('; ')}`;
}

function printUsage() {
  console.log(`Usage: node scripts/downstream-case-studies-smoke.js [options]

Options:
  --iree       run only IREE structured case study.
  --torch      run only torch-mlir structured case study.
  --iree-driver <path>   override IREE collector path for this run.
  --torch-driver <path>  override Torch-MLIR collector path for this run.
  --fail-fast  stop on first failed target.
  --min-quality <score> minimum quality score for each case study.
  -h, --help   show this help.

Environment:
  PASS_LENS_IREE_DRIVER
  PASS_LENS_TORCH_MLIR_DRIVER
  PASS_LENS_CASE_STUDY_MIN_QUALITY

When no target flag is provided, this runner attempts both IREE and torch-mlir
case studies if their environment variable drivers are available.
`);
}

function returnLine(text) {
  console.log(text);
}

function readPositiveInt(raw, fallback) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

module.exports = {
  main,
  parseArgs,
  resolveTargets,
  resolveTargetsWithDiagnostics,
  runTarget
};


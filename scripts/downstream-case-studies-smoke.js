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
  const targets = resolveTargets(options);
  if (targets.length === 0) {
    throw new Error(
      'No downstream targets selected. Set PASS_LENS_IREE_DRIVER and/or PASS_LENS_TORCH_MLIR_DRIVER, or pass --iree/--torch.'
    );
  }

  const errors = [];
  for (const target of targets) {
    const targetResult = runTarget(target);
    if (targetResult.success) {
      returnLine(`✓ ${target.label}: ${targetResult.summary}`);
    } else {
      errors.push(`${target.label}: ${targetResult.summary}`);
      returnLine(`✗ ${target.label}: ${targetResult.summary}`);
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
    failFast: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--iree') {
      options.forceIree = true;
      options.all = false;
    } else if (arg === '--torch') {
      options.forceTorch = true;
      options.all = false;
    } else if (arg === '--fail-fast') {
      options.failFast = true;
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
  const candidates = [];
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
      const driver = process.env.PASS_LENS_IREE_DRIVER;
      if (!driver) {
        continue;
      }
      targets.push({
        key: 'iree',
        label: 'IREE structured case study',
        script: 'scripts/iree-case-study-smoke.js',
        requiredEnv: 'PASS_LENS_IREE_DRIVER'
      });
    } else if (candidate === 'torch') {
      const driver = process.env.PASS_LENS_TORCH_MLIR_DRIVER;
      if (!driver) {
        continue;
      }
      targets.push({
        key: 'torch',
        label: 'Torch-MLIR structured case study',
        script: 'scripts/torch-mlir-case-study-smoke.js',
        requiredEnv: 'PASS_LENS_TORCH_MLIR_DRIVER'
      });
    }
  }

  return targets;
}

function runTarget(target) {
  const child = spawnSync(process.execPath, [path.join(root, target.script)], {
    cwd: root,
    encoding: 'utf8',
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

function printUsage() {
  console.log(`Usage: node scripts/downstream-case-studies-smoke.js [options]

Options:
  --iree       run only IREE structured case study.
  --torch      run only torch-mlir structured case study.
  --fail-fast  stop on first failed target.
  -h, --help   show this help.

Environment:
  PASS_LENS_IREE_DRIVER
  PASS_LENS_TORCH_MLIR_DRIVER

When no target flag is provided, this runner attempts both IREE and torch-mlir
case studies if their environment variable drivers are available.
`);
}

function returnLine(text) {
  console.log(text);
}

module.exports = {
  main,
  parseArgs,
  resolveTargets,
  runTarget
};

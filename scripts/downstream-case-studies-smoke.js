#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

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
    const driver = resolveCandidateDriver(candidate, options);
    if (!driver.ok) {
      skippedTargets.push({
        key: candidate,
        label: candidate === 'iree'
          ? 'IREE structured case study'
          : 'Torch-MLIR structured case study',
        requiredEnv: candidate === 'iree'
          ? 'PASS_LENS_IREE_DRIVER'
          : 'PASS_LENS_TORCH_MLIR_DRIVER',
        requiredCli: candidate === 'iree'
          ? '--iree-driver'
          : '--torch-driver',
        script: candidate === 'iree'
          ? 'npm run smoke:iree-case-study'
          : 'npm run smoke:torch-mlir-case-study',
        reason: driver.reason,
        envExample: candidate === 'iree'
          ? {
            powershell: '$env:PASS_LENS_IREE_DRIVER = "C:\\path\\to\\downstream-pass-lens-driver"',
            posix: 'export PASS_LENS_IREE_DRIVER="/path/to/downstream-pass-lens-driver"'
          }
          : {
            powershell: '$env:PASS_LENS_TORCH_MLIR_DRIVER = "C:\\path\\to\\downstream-pass-lens-driver"',
            posix: 'export PASS_LENS_TORCH_MLIR_DRIVER="/path/to/downstream-pass-lens-driver"'
          }
      });
      continue;
    }

    if (candidate === 'iree') {
      const resolved = driver.resolvedPath;
      targets.push({
        key: 'iree',
        label: 'IREE structured case study',
        script: 'scripts/iree-case-study-smoke.js',
        requiredEnv: 'PASS_LENS_IREE_DRIVER',
        driver: resolved
      });
    } else if (candidate === 'torch') {
      const resolved = driver.resolvedPath;
      targets.push({
        key: 'torch',
        label: 'Torch-MLIR structured case study',
        script: 'scripts/torch-mlir-case-study-smoke.js',
        requiredEnv: 'PASS_LENS_TORCH_MLIR_DRIVER',
        driver: resolved
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
        `- ${target.label}: ${target.reason || `set ${target.requiredEnv} and run ${target.script}.`}`
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
    `Skipping ${target.label}: ${target.reason}`
  ));
  return `Warning: ${lines.join('; ')}`;
}

function resolveCandidateDriver(candidate, options) {
  const env = candidate === 'iree'
    ? {
      name: 'PASS_LENS_IREE_DRIVER',
      value: options.ireeDriver || process.env.PASS_LENS_IREE_DRIVER
    }
    : {
      name: 'PASS_LENS_TORCH_MLIR_DRIVER',
      value: options.torchDriver || process.env.PASS_LENS_TORCH_MLIR_DRIVER
    };

  if (!env.value) {
    return {
      ok: false,
      reason: `${env.name} is not set.`
    };
  }

  const normalized = String(env.value).trim();
  if (!normalized) {
    return {
      ok: false,
      reason: `${env.name} is empty.`
    };
  }

  const hasPathLike = normalized.includes(path.sep) || normalized.includes(path.posix.sep);
  if (hasPathLike) {
    const absolute = path.isAbsolute(normalized)
      ? normalized
      : path.resolve(normalized);
    try {
      const stat = fs.statSync(absolute);
      if (!stat.isFile()) {
        return {
          ok: false,
          reason: `${env.name} points to a non-file path: ${absolute}`
        };
      }
      if (process.platform !== 'win32' && (stat.mode & 0o111) === 0) {
        return {
          ok: false,
          reason: `${env.name} is not executable: ${absolute}`
        };
      }
      return { ok: true, resolvedPath: absolute };
    } catch (error) {
      return {
        ok: false,
        reason: `${env.name} points to invalid path: ${absolute} (${error.message})`
      };
    }
  }

  const pathExts = process.platform === 'win32'
    ? process.env.PATHEXT?.split(path.delimiter).map((ext) => ext.toLowerCase()) ?? ['.exe', '.cmd', '.bat', '.com']
    : [''];
  const searchPaths = process.env.PATH || '';
  for (const directory of searchPaths.split(path.delimiter)) {
    for (const extension of pathExts) {
      const candidatePath = path.join(directory, `${normalized}${extension}`);
      try {
        const stat = fs.statSync(candidatePath);
        if (!stat.isFile()) {
          continue;
        }
        if (process.platform !== 'win32' && (stat.mode & 0o111) === 0) {
          continue;
        }
        return { ok: true, resolvedPath: candidatePath };
      } catch {
        continue;
      }
    }
  }

  return {
    ok: false,
    reason: `Could not locate executable for ${env.name}: ${normalized}`
  };
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


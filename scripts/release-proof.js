#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const {
  checkReleaseReadiness
} = require('./release-readiness');
const {
  buildPublishPlan,
  TARGETS
} = require('./release-publish');

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const proof = buildReleaseProof(path.resolve(options.root));
    outputProof(proof, options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function buildReleaseProof(root) {
  const resolvedRoot = path.resolve(root);
  const releaseCheck = checkReleaseReadiness(resolvedRoot);
  const packageJson = readPackageJson(resolvedRoot);
  const packageName = packageJson.name ?? 'pass-lens';
  const packageVersion = packageJson.version ?? '0.0.0';
  const vsixPath = path.join(resolvedRoot, `${packageName}-${packageVersion}.vsix`);
  const vsixExists = fs.existsSync(vsixPath);

  const publishPlans = Object.keys(TARGETS).map((target) => {
    try {
      const plan = buildPublishPlan({ target, root: resolvedRoot });
      const token = process.env[plan.requiredEnv];
      return {
        target: plan.target,
        requiredEnv: plan.requiredEnv,
        command: plan.command,
        args: [...plan.args],
        vsix: plan.vsix,
        canExecute: Boolean(token),
        blocked: false,
        error: null
      };
    } catch (error) {
      return {
        target,
        requiredEnv: TARGETS[target].requiredEnv,
        command: null,
        args: null,
        vsix: vsixPath,
        canExecute: false,
        blocked: true,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    root: resolvedRoot,
    package: {
      name: packageName,
      version: packageVersion,
      publisher: packageJson.publisher ?? ''
    },
    vsix: {
      path: vsixPath,
      exists: vsixExists
    },
    releaseCheck: {
      ok: releaseCheck.ok,
      strict: false,
      errors: [...releaseCheck.errors],
      warnings: [...releaseCheck.warnings],
      checks: releaseCheck.checks
    },
    publishPlans
  };
}

function outputProof(proof, options) {
  const output = {
    ...proof,
    blockers: proof.publishPlans.filter((plan) => plan.blocked || !plan.canExecute).length,
    publishReady: proof.publishPlans.every((plan) => plan.canExecute && !plan.blocked),
    summary: {
      releaseReadiness: proof.releaseCheck.ok ? 'ok' : 'failed',
      blockerCount: proof.publishPlans.filter((plan) => plan.blocked).length,
      gatedTargets: proof.publishPlans.filter((plan) => !plan.blocked).length,
      readyTargets: proof.publishPlans.filter((plan) => plan.canExecute).length
    }
  };

  if (options.output) {
    const targetDir = path.dirname(path.resolve(options.output));
    if (targetDir && targetDir !== '.') {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(options.output, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(`release proof written to ${options.output}`);
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  const blockerRows = output.publishPlans
    .map((plan) => {
      if (plan.blocked) {
        return `${plan.target}: blocked (${plan.error})`;
      }
      return `${plan.target}: command=${plan.command} canExecute=${plan.canExecute} requiredEnv=${plan.requiredEnv}`;
    })
    .join('\n');

  console.log(`release proof (${output.generatedAt})`);
  console.log(`package: ${output.package.name}@${output.package.version}`);
  console.log(`release-check: ${output.releaseCheck.ok ? 'ok' : 'failed'}`);
  if (output.releaseCheck.warnings.length > 0) {
    for (const warning of output.releaseCheck.warnings) {
      console.log(`- warning: ${warning}`);
    }
  }
  if (output.releaseCheck.errors.length > 0) {
    for (const error of output.releaseCheck.errors) {
      console.log(`- error: ${error}`);
    }
  }
  console.log(`vsix: ${output.vsix.path} (${output.vsix.exists ? 'exists' : 'missing'})`);
  console.log('publish plans:');
  console.log(blockerRows);
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    output: undefined,
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      options.root = argv[index + 1] || options.root;
      index += 1;
    } else if (arg === '--output') {
      options.output = argv[index + 1] || options.output;
      index += 1;
    } else if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readPackageJson(root) {
  const packagePath = path.join(root, 'package.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error(`package.json not found: ${packagePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to parse package.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function printUsage() {
  process.stdout.write(`Pass Lens release proof helper

Usage:
  node scripts/release-proof.js [--root <path>] [--json] [--output <file>]

This helper collects a machine-readable proof payload for external release preparation.
By default, it prints a concise summary and includes the same publish readiness
info used by release:check and publish dry-runs.
`);
}

module.exports = {
  parseArgs,
  buildReleaseProof
};

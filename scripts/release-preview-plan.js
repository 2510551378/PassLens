#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { listPublishPlans } = require('./release-publish');

function main(argv) {
  const options = parseArgs(argv);
  const root = path.resolve(options.root);
  const plans = listPublishPlans(root).map((plan) => ({
    ...plan,
    canExecute: isExecutable(plan, root)
  }));
  const summary = {
    generatedAt: new Date().toISOString(),
    root,
    plans
  };

  if (options.output) {
    const outputDir = path.dirname(path.resolve(options.output));
    if (outputDir && outputDir !== '.') {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(options.output, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`release preview plan written to ${options.output}`);
  }

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (options.output) {
    const printed = JSON.stringify(summary, null, 2);
    console.log(printed);
    return;
  }

  for (const plan of plans) {
    if (plan.error) {
      console.log(`- ${plan.target}: blocked (${plan.error})`);
      continue;
    }
    console.log(`- ${plan.target}:`);
    console.log(`  command: ${plan.command} ${plan.args.join(' ')}`);
    console.log(`  required env: ${plan.requiredEnv} (${plan.canExecute ? 'ready' : 'missing token'})`);
    console.log(`  can execute now: ${plan.canExecute}`);
  }
}

function isExecutable(plan, root) {
  if (plan.error) {
    return false;
  }
  const token = process.env[plan.requiredEnv];
  if (!token) {
    return false;
  }
  return true;
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? [...argv] : [];
  while (args.length > 0 && args[0] === '--') {
    args.shift();
  }

  const options = {
    json: false,
    root: process.cwd(),
    output: undefined
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--root') {
      options.root = args[index + 1] ?? options.root;
      index += 1;
    } else if (arg === '--output') {
      options.output = args[index + 1] ?? options.output;
      index += 1;
    } else if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith('--') && options.output === undefined && options.json) {
      options.output = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printUsage() {
  console.log(`Usage: node scripts/release-preview-plan.js [options]

Options:
  --json         Emit a machine-readable JSON summary.
  --root <path>  Repository root (default: current working directory).
  --output <path> Save JSON summary to file.

This helper checks whether marketplace/open-vsx publish commands can be planned
from the current workspace without performing a publish.
`);
}

main(process.argv.slice(2));

module.exports = {
  isExecutable,
  parseArgs
};

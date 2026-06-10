#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TARGETS = {
  marketplace: {
    requiredEnv: 'VSCE_PAT',
    command: 'vsce',
    args: ['publish'],
    envHint: 'VSCE_PAT'
  },
  'open-vsx': {
    requiredEnv: 'OVSX_PAT',
    command: 'ovsx',
    args: ['publish'],
    envHint: 'OVSX_PAT'
  }
};

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    main(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function main(options) {
  const { target, dryRun, root } = options;
  if (!Object.keys(TARGETS).includes(target)) {
    throw new Error(
      `Unknown target '${target}'. Use --target marketplace|open-vsx or pass it as first arg.`
    );
  }

  const targetSpec = TARGETS[target];
  const packageJson = readJson(path.join(root, 'package.json'));
  const version = packageJson.version ?? '0.0.0';
  const name = packageJson.name ?? 'pass-lens';
  const vsix = path.join(root, `${name}-${version}.vsix`);

  if (!fs.existsSync(vsix)) {
    throw new Error(
      `Release package missing: ${path.basename(vsix)}. Run \`npm run release:smoke\` and \`npm run package\` first.`
    );
  }

  const token = process.env[targetSpec.requiredEnv];
  const extraArgs = ['--packagePath', vsix];
  if (target === 'open-vsx' && token) {
    extraArgs.push('--pat', token);
  }

  const plan = {
    command: targetSpec.command,
    args: [...targetSpec.args, ...extraArgs]
  };

  if (dryRun) {
    console.log('[dry-run] release publish plan');
    console.log(`target=${target}`);
    console.log(`vsix=${vsix}`);
    console.log(`${plan.command} ${plan.args.join(' ')}`);
    console.log(`required env token: ${targetSpec.envHint}`);
    return;
  }

  if (!token) {
    throw new Error(
      `Missing ${targetSpec.requiredEnv}. Set ${targetSpec.envHint} in environment and rerun with --execute.`
    );
  }

  const result = spawnSync(plan.command, plan.args, {
    stdio: 'inherit',
    cwd: root
  });
  if (result.error) {
    throw new Error(`Failed to spawn ${plan.command}: ${result.error.message}`);
  }
  process.exitCode = result.status ?? 1;
}

function parseArgs(argv) {
  const options = {
    target: undefined,
    dryRun: true,
    root: process.cwd()
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target') {
      options.target = argv[i + 1];
      i += 1;
    } else if (arg === '--execute') {
      options.dryRun = false;
    } else if (arg === '--root') {
      options.root = argv[i + 1] ?? options.root;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (!options.target) {
      options.target = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.target) {
    throw new Error(
      'Target is required. Use "marketplace" or "open-vsx", for example: node scripts/release-publish.js marketplace'
    );
  }

  if (!TARGETS[options.target]) {
    throw new Error(
      `Invalid target '${options.target}'. Supported targets: marketplace, open-vsx.`
    );
  }

  return options;
}

function printUsage() {
  process.stdout.write(`Pass Lens release publishing helper

Usage:
  node scripts/release-publish.js <target> [--execute] [--root <repo>]

Targets:
  marketplace  publish with vsce (requires VSCE_PAT).
  open-vsx     publish with ovsx (requires OVSX_PAT).

By default, this runs in dry-run mode and prints the command only.
Use --execute to run the selected publish command.
`);
}

function readJson(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(text);
}

module.exports = {
  parseArgs,
  TARGETS
};

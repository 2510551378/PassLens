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
  const plan = buildPublishPlan({ target, root });
  const token = process.env[plan.requiredEnv];

  if (dryRun) {
    console.log('[dry-run] release publish plan');
    console.log(`target=${target}`);
    console.log(`vsix=${plan.vsix}`);
    console.log(`command=${plan.command}`);
    console.log(`${plan.command} ${plan.args.join(' ')}`);
    console.log(`required env token: ${plan.requiredEnv}`);
    console.log(`token available: ${token ? 'yes' : 'no'}`);
    return;
  }

  if (!token) {
    throw new Error(
      `Missing ${plan.requiredEnv}. Set ${plan.requiredEnv} in environment and rerun with --execute.`
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

function buildPublishPlan({ target, root }) {
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
  if (target === 'marketplace' && token) {
    extraArgs.push('--pat', token);
  }
  if (target === 'open-vsx' && token) {
    extraArgs.push('--pat', token);
  }

  return {
    target,
    requiredEnv: targetSpec.requiredEnv,
    command: resolvePublishCommand(targetSpec.command),
    args: [...targetSpec.args, ...extraArgs],
    vsix
  };
}

function listPublishPlans(root) {
  return Object.keys(TARGETS).map((target) => {
    try {
      return buildPublishPlan({ target, root });
    } catch (error) {
      return {
        target,
        requiredEnv: TARGETS[target].requiredEnv,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}

function resolvePublishCommand(commandName) {
  if (path.isAbsolute(commandName)) {
    if (!fs.existsSync(commandName)) {
      throw new Error(`Publish command not found: ${commandName}`);
    }
    return commandName;
  }

  const pathExts = process.platform === 'win32'
    ? process.env.PATHEXT?.split(path.delimiter).map((entry) => entry.toLowerCase()) ?? ['.exe', '.cmd', '.bat', '.com']
    : [''];

  const searchPaths = process.env.PATH || '';
  for (const directory of searchPaths.split(path.delimiter)) {
    for (const ext of pathExts) {
      const candidate = path.join(directory, `${commandName}${ext}`);
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch {
        continue;
      }
    }
  }

  const prettyPaths = searchPaths ? `PATH=${searchPaths}` : 'PATH is empty';
  throw new Error(`Publish command '${commandName}' was not found on PATH (${prettyPaths}).`);
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
    } else if (arg === '--dry-run') {
      options.dryRun = true;
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
  node scripts/release-publish.js <target> [--dry-run] [--execute] [--root <repo>]

Targets:
  marketplace  publish with vsce (requires VSCE_PAT).
  open-vsx     publish with ovsx (requires OVSX_PAT).

By default, this runs in dry-run mode and prints the command only.
Use --dry-run (explicit) or --execute to control whether the selected publish
command is run.
`);
}

function readJson(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(text);
}

module.exports = {
  parseArgs,
  TARGETS,
  buildPublishPlan,
  listPublishPlans
};

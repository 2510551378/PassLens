#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const requiredDocs = [
  'README.md',
  'README.zh-CN.md',
  'docs/expert-roadmap-todo.md',
  'docs/release-milestones.md',
  'docs/sample-provenance.md',
  'docs/collector-author-guide.md',
  'docs/pass-lens.schema.json',
  'docs/images/pass-lens-logo.png',
  'docs/images/pass-lens-hero.png',
  'media/pass-lens-icon.png'
];

const requiredReadmeNeedles = [
  'Evidence-driven postmortem debugger',
  'Download `pass-lens-0.1.0.vsix`',
  'Pass Lens: Open Sample Trace',
  'docs/sample-provenance.md',
  'docs/collector-author-guide.md',
  'docs/release-milestones.md',
  'smoke:heir-case-study'
];

const requiredReleaseNeedles = [
  'VS Code Marketplace',
  'Open VSX',
  'demo GIF',
  'real traces',
  'credible provenance'
];

const requiredProvenanceKinds = [
  'live-pass-instrumentation',
  'hand-authored',
  'real-artifact-capture'
];

const releaseBlockers = [
  {
    id: 'marketplace-preview',
    marker: '- [ ] Publish VS Code Marketplace preview.',
    message: 'VS Code Marketplace preview is still an explicit release blocker.'
  },
  {
    id: 'open-vsx-preview',
    marker: '- [ ] Publish Open VSX preview.',
    message: 'Open VSX preview is still an explicit release blocker.'
  },
  {
    id: 'demo-gif',
    marker: '- [ ] Add 30-second demo GIF to README.',
    message: 'README demo GIF is still an explicit release blocker.'
  }
];

function main(argv) {
  const options = parseArgs(argv);
  const report = checkReleaseReadiness(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printReport(report);
  }

  process.exit(report.errors.length > 0 ? 1 : 0);
}

function parseArgs(argv) {
  const options = {
    json: false,
    strict: false,
    root: process.cwd()
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--strict' || arg === '--strict-release') {
      options.strict = true;
    } else if (arg === '--root') {
      index += 1;
      options.root = argv[index] ?? options.root;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function checkReleaseReadiness(root, override = {}) {
  const options = {
    ...(typeof root === 'string' ? { root } : root),
    ...override
  };
  const resolvedRoot = path.resolve(options.root || process.cwd());
  const strict = Boolean(options.strict);
  const errors = [];
  const warnings = [];
  const checks = [];

  checkRequiredFiles(resolvedRoot, errors, checks);
  const packageJson = checkPackageMetadata(resolvedRoot, errors, checks);
  checkReadme(resolvedRoot, errors, checks);
  checkSampleProvenanceCatalog(resolvedRoot, errors, checks);
  checkReleaseDocs(resolvedRoot, errors, warnings, checks, strict);
  checkSampleProvenance(resolvedRoot, errors, checks);

  return {
    ok: errors.length === 0,
    root: resolvedRoot,
    packageVersion: packageJson?.version,
    strict,
    errors,
    warnings,
    checks
  };
}

function checkRequiredFiles(root, errors, checks) {
  for (const relativePath of requiredDocs) {
    const exists = fs.existsSync(path.join(root, relativePath));
    checks.push({
      id: `file:${relativePath}`,
      ok: exists,
      message: exists ? `${relativePath} exists` : `${relativePath} is missing`
    });
    if (!exists) {
      errors.push(`${relativePath} is required for the public release entry point.`);
    }
  }
}

function parseSampleProvenanceTable(fileText) {
  const lines = fileText.split(/\r?\n/);
  const entries = new Map();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || trimmed.startsWith('| Sample ')) {
      continue;
    }
    if (/^\|\s*[-|]+\s*\|/.test(trimmed)) {
      continue;
    }

    const columns = trimmed
      .split('|')
      .map((column) => column.trim())
      .filter((column) => column.length > 0);
    if (columns.length < 2) {
      continue;
    }

    const file = columns[0].replace(/`/g, '');
    const kind = columns[1].replace(/`/g, '');
    if (!/\.json$/i.test(file) || !file || !kind) {
      continue;
    }

    entries.set(file, kind);
  }

  return entries;
}

function checkSampleProvenanceCatalog(root, errors, checks) {
  const sampleDir = path.join(root, 'sample-traces');
  const provenancePath = path.join(root, 'docs', 'sample-provenance.md');

  if (!fs.existsSync(sampleDir) || !fs.existsSync(provenancePath)) {
    return;
  }

  const sampleFiles = fs
    .readdirSync(sampleDir)
    .filter((file) => file.endsWith('.json'))
    .sort();
  const provenanceText = fs.readFileSync(provenancePath, 'utf8');
  const provenanceEntries = parseSampleProvenanceTable(provenanceText);

  checks.push({
    id: 'release:provenance-doc-sync',
    ok: provenanceEntries.size > 0,
    message: 'sample provenance table is parseable'
  });
  if (provenanceEntries.size === 0) {
    errors.push('docs/sample-provenance.md table is not parseable.');
    return;
  }

  for (const sample of sampleFiles) {
    const expected = provenanceEntries.get(sample);
    if (!expected) {
      checks.push({
        id: `sample-provenance-doc:${sample}`,
        ok: false,
        message: `sample-provenance.md missing entry for ${sample}`
      });
      errors.push(`docs/sample-provenance.md missing provenance entry for ${sample}`);
      continue;
    }
    checks.push({
      id: `sample-provenance-doc:${sample}`,
      ok: true,
      message: `sample-provenance.md documents ${sample}`
    });
  }

  const sampleFileSet = new Set(sampleFiles);
  for (const sample of provenanceEntries.keys()) {
    if (!sampleFileSet.has(sample)) {
      checks.push({
        id: `sample-provenance-doc:orphan:${sample}`,
        ok: false,
        message: `sample-provenance entry references missing sample ${sample}`
      });
      errors.push(`sample-provenance.md entry ${sample} does not match an existing sample file`);
    }
  }
}

function checkPackageMetadata(root, errors, checks) {
  const packagePath = path.join(root, 'package.json');
  const packageJson = readJson(packagePath, errors);
  if (!packageJson) {
    return undefined;
  }

  requireField(packageJson, 'name', errors, checks);
  requireField(packageJson, 'displayName', errors, checks);
  requireField(packageJson, 'description', errors, checks);
  requireField(packageJson, 'version', errors, checks);
  requireField(packageJson, 'publisher', errors, checks);
  requireField(packageJson, 'repository.url', errors, checks);
  requireField(packageJson, 'bugs.url', errors, checks);
  requireField(packageJson, 'homepage', errors, checks);
  requireField(packageJson, 'engines.vscode', errors, checks);
  requireField(packageJson, 'icon', errors, checks);
  requireField(packageJson, 'scripts.package', errors, checks);
  requireField(packageJson, 'scripts.release:check', errors, checks);
  requireField(packageJson, 'scripts.release:smoke', errors, checks);
  requireField(packageJson, 'scripts.release:publish:marketplace', errors, checks);
  requireField(packageJson, 'scripts.release:publish:open-vsx', errors, checks);
  requireField(packageJson, 'scripts.validate:trace:all', errors, checks);
  requireField(packageJson, 'scripts.test', errors, checks);

  const hasPreviewFlag = packageJson.preview === true;
  checks.push({
    id: 'package:preview',
    ok: hasPreviewFlag,
    message: 'package.json marks the extension as preview'
  });
  if (!hasPreviewFlag) {
    errors.push('package.json must keep preview=true until Marketplace/Open VSX preview publishing is complete.');
  }

  const hasCategories = Array.isArray(packageJson.categories) && packageJson.categories.length > 0;
  checks.push({
    id: 'package:categories',
    ok: hasCategories,
    message: 'Marketplace categories are declared'
  });
  if (!hasCategories) {
    errors.push('package.json must declare VS Code Marketplace categories.');
  }

  return packageJson;
}

function checkReadme(root, errors, checks) {
  const readme = readText(path.join(root, 'README.md'), errors);
  if (readme === undefined) {
    return;
  }

  for (const needle of requiredReadmeNeedles) {
    const ok = readme.includes(needle);
    checks.push({
      id: `readme:${needle}`,
      ok,
      message: `README mentions ${needle}`
    });
    if (!ok) {
      errors.push(`README.md should mention '${needle}' for the public onboarding path.`);
    }
  }
}

function checkReleaseDocs(root, errors, warnings, checks, strict) {
  const milestones = readText(path.join(root, 'docs', 'release-milestones.md'), errors);
  if (milestones === undefined) {
    return;
  }

  for (const needle of requiredReleaseNeedles) {
    const ok = milestones.includes(needle);
    checks.push({
      id: `release-doc:${needle}`,
      ok,
      message: `release milestones mention ${needle}`
    });
    if (!ok) {
      errors.push(`docs/release-milestones.md should mention '${needle}'.`);
    }
  }

  const roadmap = readText(path.join(root, 'docs', 'expert-roadmap-todo.md'), errors);
  if (roadmap === undefined) {
    return;
  }

  for (const blocker of releaseBlockers) {
    if (roadmap.includes(blocker.marker)) {
      checks.push({
        id: `release-blocker:${blocker.id}`,
        ok: !strict,
        message: blocker.message
      });
      if (strict) {
        errors.push(`${blocker.message} (strict-release mode)`);
      } else {
        warnings.push(blocker.message);
      }
    } else {
      checks.push({
        id: `release-blocker:${blocker.id}`,
        ok: true,
        message: `${blocker.id} blocker is marked complete`
      });
    }
  }
}

function checkSampleProvenance(root, errors, checks) {
  const sampleDir = path.join(root, 'sample-traces');
  const files = fs.existsSync(sampleDir)
    ? fs.readdirSync(sampleDir).filter((file) => file.endsWith('.json')).sort()
    : [];
  if (files.length === 0) {
    errors.push('sample-traces must contain public trace JSON files.');
  }

  const kinds = new Set();
  for (const file of files) {
    const trace = readJson(path.join(sampleDir, file), errors);
    if (trace?.provenance?.kind) {
      kinds.add(trace.provenance.kind);
    }
  }

  for (const kind of requiredProvenanceKinds) {
    const ok = kinds.has(kind);
    checks.push({
      id: `sample-provenance:${kind}`,
      ok,
      message: `sample traces include ${kind}`
    });
    if (!ok) {
      errors.push(`sample-traces must include at least one '${kind}' example.`);
    }
  }
}

function requireField(object, fieldPath, errors, checks) {
  const value = fieldPath.split('.').reduce((current, key) => current?.[key], object);
  const ok = typeof value === 'string' ? value.trim().length > 0 : value !== undefined;
  checks.push({
    id: `package:${fieldPath}`,
    ok,
    message: `package.json declares ${fieldPath}`
  });
  if (!ok) {
    errors.push(`package.json must declare '${fieldPath}'.`);
  }
}

function readJson(filePath, errors) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Could not read JSON ${filePath}: ${message}`);
    return undefined;
  }
}

function readText(filePath, errors) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Could not read ${filePath}: ${message}`);
    return undefined;
  }
}

function printReport(report) {
  const status = report.ok ? 'ok' : 'failed';
  process.stdout.write(`${status}: Pass Lens release readiness (${report.checks.length} checks)\n`);
  for (const error of report.errors) {
    process.stdout.write(`  [error] ${error}\n`);
  }
  for (const warning of report.warnings) {
    process.stdout.write(`  [warning] ${warning}\n`);
  }
}

function printUsage() {
  process.stdout.write(`Pass Lens release readiness check

  Usage:
  node scripts/release-readiness.js [--json] [--root <repo>] [--strict-release]
  --strict-release, --strict
      Treat roadmap release blockers as hard errors.

The check validates public release entry points, package metadata, release
docs, and sample trace provenance. It does not publish to Marketplace/Open VSX.
`);
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  checkReleaseReadiness,
  parseArgs
};

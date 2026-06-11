#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { normalizeTrace } = require('../out/trace/schema.js');
const { resolveArtifactPathWithinTraceRoot } = require('../out/trace/artifactPaths.js');
const { validateTraceStrict } = require('../out/trace/strictValidation.js');
const { validateTrace } = require('../out/trace/validation.js');

const defaultSampleDir = path.join(process.cwd(), 'sample-traces');

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return;
  }

  const sourceTracePath = path.resolve(options.sourceTrace);
  const sampleDir = path.resolve(options.sampleDir);
  const sampleName = sanitizeSampleName(options.sampleName || `${path.parse(sourceTracePath).name}-sample`);
  const targetTracePath = path.join(sampleDir, `${sampleName}.json`);
  const summaryPath = path.join(sampleDir, `${sampleName}.downstream-promote-summary.json`);

  validateSourceInputs(sourceTracePath, sampleDir, targetTracePath, options);
  ensureDirectory(sampleDir);

  const summary = {
    sourceTracePath,
    sampleDir,
    sampleTracePath: targetTracePath,
    sampleTraceName: sampleName,
    summaryPath,
    copiedArtifactCount: 0,
    redactedFields: [],
    errors: []
  };

  const sourceTrace = readJson(sourceTracePath);
  const strictIssues = validateTraceStrict(sourceTrace);
  if (strictIssues.some((issue) => issue.severity === 'error')) {
    const message = `strict validation reported ${strictIssues.length} error(s)`;
    summary.errors.push(message);
    printSummary(summary);
    throw new Error(message);
  }

  const normalized = normalizeTrace(sourceTrace);
  const viewerIssues = validateTrace(normalized);
  if (viewerIssues.some((issue) => issue.severity === 'error')) {
    const message = `viewer validation reported ${viewerIssues.length} error(s)`;
    summary.errors.push(message);
    printSummary(summary);
    throw new Error(message);
  }

  const artifactRefs = collectArtifactRefs(normalized);
  if (options.checkArtifacts) {
    validateArtifactRefs({
      tracePath: sourceTracePath,
      artifactRefs,
      checkPaths: true
    }, summary);
    if (summary.errors.length > 0) {
      printSummary(summary);
      throw new Error(summary.errors.join('; '));
    }
  }

  const sampleTrace = structuredClone(normalized);
  applyRedactions(sampleTrace, options.redactInput, options.redactCommand, summary);

  if (options.copyArtifacts) {
    const copiedCount = copyArtifacts({
      artifactRefs,
      sourceTracePath,
      sampleDir
    });
    summary.copiedArtifactCount = copiedCount;
  } else {
    for (const artifactRef of artifactRefs) {
      if (typeof artifactRef.path === 'string' && isRelativePath(artifactRef.path)) {
        summary.redactedFields.push(`retained artifact path (${artifactRef.field}): ${artifactRef.path}`);
      }
    }
  }

  fs.writeFileSync(targetTracePath, JSON.stringify(sampleTrace, null, 2), 'utf8');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  printSummary(summary);
}

function parseArgs(argv) {
  const options = {
    checkArtifacts: true,
    copyArtifacts: true,
    sampleDir: process.env.PASS_LENS_SAMPLE_DIR || defaultSampleDir,
    sourceTrace: process.env.PASS_LENS_SOURCE_TRACE,
    sampleName: process.env.PASS_LENS_SAMPLE_NAME,
    redactInput: false,
    redactCommand: false,
    help: false,
    overwrite: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--source') {
      options.sourceTrace = argv[index + 1] || options.sourceTrace;
      index += 1;
    } else if (arg.startsWith('--source=')) {
      options.sourceTrace = arg.slice('--source='.length);
    } else if (arg === '--sample-dir') {
      options.sampleDir = argv[index + 1] || options.sampleDir;
      index += 1;
    } else if (arg.startsWith('--sample-dir=')) {
      options.sampleDir = arg.slice('--sample-dir='.length);
    } else if (arg === '--sample-name') {
      options.sampleName = argv[index + 1] || options.sampleName;
      index += 1;
    } else if (arg.startsWith('--sample-name=')) {
      options.sampleName = arg.slice('--sample-name='.length);
    } else if (arg === '--no-check-artifacts') {
      options.checkArtifacts = false;
    } else if (arg === '--no-copy-artifacts') {
      options.copyArtifacts = false;
    } else if (arg === '--redact-input') {
      options.redactInput = true;
    } else if (arg === '--redact-command') {
      options.redactCommand = true;
    } else if (arg === '--overwrite') {
      options.overwrite = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.sourceTrace) {
    throw new Error('Source trace is required. Pass --source <path> or set PASS_LENS_SOURCE_TRACE.');
  }

  return options;
}

function validateSourceInputs(sourceTracePath, sampleDir, targetTracePath, options) {
  if (!fs.existsSync(sourceTracePath)) {
    throw new Error(`Source trace does not exist: ${sourceTracePath}`);
  }

  if (!options.overwrite && fs.existsSync(targetTracePath)) {
    throw new Error(`Target sample already exists: ${targetTracePath}. Re-run with --overwrite.`);
  }

  if (!options.overwrite && fs.existsSync(sampleDir) && fs.readdirSync(sampleDir).includes(path.basename(targetTracePath))) {
    throw new Error(`Sample name collision at: ${targetTracePath}. Re-run with --overwrite.`);
  }
}

function validateArtifactRefs({ tracePath, artifactRefs, checkPaths }, summary) {
  for (const artifactRef of artifactRefs) {
    if (!artifactRef.path) {
      continue;
    }

    const resolved = resolveArtifactPathWithinTraceRoot(path.dirname(tracePath), artifactRef.path);
    if (!resolved.ok || !resolved.resolvedPath) {
      summary.errors.push(`artifact path invalid (${artifactRef.field}): ${artifactRef.path} (${resolved.message ?? 'invalid path'})`);
      continue;
    }

    if (!checkPaths) {
      continue;
    }

    try {
      const stat = fs.statSync(resolved.resolvedPath);
      if (!stat.isFile()) {
        summary.errors.push(`artifact is not a file (${artifactRef.field}): ${artifactRef.path}`);
      }
    } catch {
      summary.errors.push(`artifact missing or unreadable (${artifactRef.field}): ${artifactRef.path}`);
    }
  }
}

function copyArtifacts({ artifactRefs, sourceTracePath, sampleDir }) {
  let copied = 0;
  const sourceRoot = path.dirname(sourceTracePath);
  const written = new Set();

  for (const artifactRef of artifactRefs) {
    if (!artifactRef.path) {
      continue;
    }

    const resolved = resolveArtifactPathWithinTraceRoot(sourceRoot, artifactRef.path);
    if (!resolved.ok || !resolved.resolvedPath) {
      continue;
    }

    const normalizedRel = path.normalize(artifactRef.path);
    const targetPath = path.join(sampleDir, normalizedRel);
    const targetDir = path.dirname(targetPath);
    fs.mkdirSync(targetDir, { recursive: true });

    const key = path.resolve(targetPath);
    if (written.has(key)) {
      continue;
    }

    fs.copyFileSync(resolved.resolvedPath, targetPath);
    copied += 1;
    written.add(key);
  }

  return copied;
}

function collectArtifactRefs(trace) {
  const refs = [];
  if (!Array.isArray(trace.stages)) {
    return refs;
  }

  for (const stage of trace.stages) {
    const stageIndex = stage?.index;
    const entries = [
      { field: 'artifacts.beforePath', path: stage?.artifacts?.beforePath },
      { field: 'artifacts.afterPath', path: stage?.artifacts?.afterPath },
      { field: 'artifacts.diagnosticsPath', path: stage?.artifacts?.diagnosticsPath }
    ];
    for (const entry of entries) {
      if (typeof entry.path === 'string' && entry.path.trim().length > 0) {
        refs.push({
          stageIndex,
          field: entry.field,
          path: entry.path
        });
      }
    }
  }

  return refs;
}

function applyRedactions(sampleTrace, redactInput, redactCommand, summary) {
  if (!redactInput && !redactCommand) {
    return;
  }

  if (redactInput && sampleTrace.input !== undefined) {
    sampleTrace.input = '<redacted-input>';
    summary.redactedFields.push('input');
  }

  if (redactCommand && sampleTrace.command !== undefined) {
    sampleTrace.command = '<redacted-command>';
    summary.redactedFields.push('command');
  }
}

function isRelativePath(value) {
  return !path.isAbsolute(value) && !value.includes('..');
}

function sanitizeSampleName(rawName) {
  const sanitized = String(rawName || '')
    .trim()
    .replace(/\\+/g, '-')
    .replace(/[/\s]+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/(^-|-$)/g, '');
  return sanitized.length > 0 ? sanitized : `downstream-sample-${Date.now()}`;
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function readJson(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse source trace JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function printSummary(summary) {
  console.log(`downstream sample export: ${summary.sampleTracePath}`);
  console.log(`errors\t${summary.errors.length}`);
  if (summary.errors.length > 0) {
    for (const error of summary.errors) {
      console.log(`- ${error}`);
    }
    return;
  }

  console.log(`sampleDir\t${summary.sampleDir}`);
  console.log(`copiedArtifacts\t${summary.copiedArtifactCount}`);
  if (summary.redactedFields.length > 0) {
    console.log(`redactedFields\t${summary.redactedFields.join(',')}`);
  }
  if (summary.summaryPath) {
    console.log(`summary\t${summary.summaryPath}`);
  }
  console.log('checks\tok');
}

function printUsage() {
  console.log(`Usage: node scripts/promote-downstream-trace-sample.js --source <path> [options]

Options:
  --source <path>            Trace JSON to promote as a public sample.
  --sample-dir <path>        Sample output directory. Default: ${defaultSampleDir}
  --sample-name <name>       Output filename without .json extension.
  --redact-input             Replace "input" with a redacted placeholder.
  --redact-command           Replace "command" with a redacted placeholder.
  --no-check-artifacts       Skip artifact existence validation.
  --no-copy-artifacts        Do not copy artifact files into the sample directory.
  --overwrite                Overwrite an existing sample filename.
  -h, --help                 Show this help.

Environment:
  PASS_LENS_SOURCE_TRACE     Equivalent to --source.
  PASS_LENS_SAMPLE_DIR       Equivalent to --sample-dir.
  PASS_LENS_SAMPLE_NAME      Equivalent to --sample-name.
`);
}

module.exports = {
  main,
  parseArgs,
  collectArtifactRefs,
  isRelativePath,
  sanitizeSampleName,
  applyRedactions,
  validateArtifactRefs
};

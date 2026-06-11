#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { normalizeTrace } = require('../out/trace/schema.js');
const { resolveArtifactPathWithinTraceRoot } = require('../out/trace/artifactPaths.js');
const { validateTraceStrict } = require('../out/trace/strictValidation.js');
const { summarizeTraceIssues, validateTrace } = require('../out/trace/validation.js');

function main(argv) {
  const options = parseArgs(argv);
  if (options.help || options.files.length === 0) {
    printUsage();
    process.exit(options.help ? 0 : 2);
  }

  const expanded = expandInputs(options.files);
  let failed = expanded.reports.some((report) => !report.ok);
  const reports = [
    ...expanded.reports,
    ...expanded.files.map((file) => validateFile(file, options))
  ];
  for (const report of reports) {
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      printReport(report, options);
    }
    if (!report.ok) {
      failed = true;
    }
  }

  process.exit(failed ? 1 : 0);
}

function parseArgs(argv) {
  const options = {
    checkArtifacts: false,
    files: [],
    help: false,
    json: false,
    strictOnly: false,
    warningsAsErrors: false
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--check-artifacts') {
      options.checkArtifacts = true;
    } else if (arg === '--strict-only') {
      options.strictOnly = true;
    } else if (arg === '--warnings-as-errors') {
      options.warningsAsErrors = true;
    } else {
      options.files.push(arg);
    }
  }

  return options;
}

function expandInputs(inputs) {
  const files = [];
  const reports = [];
  const seen = new Set();

  for (const input of inputs) {
    const resolved = path.resolve(input);
    if (!fs.existsSync(resolved)) {
      reports.push(errorReport(resolved, `Input path does not exist: ${resolved}`));
      continue;
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      const discovered = findTraceJsonFiles(resolved);
      if (discovered.length === 0) {
        reports.push(errorReport(resolved, `No Pass Lens trace JSON files found in directory: ${resolved}`));
      }
      for (const file of discovered) {
        if (!seen.has(file)) {
          files.push(file);
          seen.add(file);
        }
      }
    } else if (stat.isFile()) {
      if (!seen.has(resolved)) {
        files.push(resolved);
        seen.add(resolved);
      }
    } else {
      reports.push(errorReport(resolved, `Input path is neither a file nor a directory: ${resolved}`));
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  return { files, reports };
}

function findTraceJsonFiles(directory) {
  const results = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTraceJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json') && looksLikeTraceJson(fullPath)) {
      results.push(fullPath);
    }
  }

  return results;
}

function looksLikeTraceJson(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Boolean(raw && typeof raw === 'object' && !Array.isArray(raw) && (
      Object.prototype.hasOwnProperty.call(raw, 'schemaVersion') ||
      Object.prototype.hasOwnProperty.call(raw, 'stages')
    ));
  } catch {
    return false;
  }
}

function validateFile(file, options) {
  const resolved = path.resolve(file);
  try {
    const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    const strictIssues = validateTraceStrict(raw);
    const strictErrors = strictIssues.filter((issue) => issue.severity === 'error');
    const trace = strictErrors.length > 0 ? undefined : normalizeTrace(raw);
    const viewerIssues = options.strictOnly || strictErrors.length > 0
      ? []
      : validateTrace(trace);
    const artifactIssues = options.checkArtifacts && trace
      ? validateArtifactReferences(trace, resolved)
      : [];
    const issues = [...strictIssues, ...viewerIssues, ...artifactIssues];
    const hasError = issues.some((issue) => issue.severity === 'error');
    const hasWarning = issues.some((issue) => issue.severity === 'warning');

    return {
      file: resolved,
      ok: !hasError && !(options.warningsAsErrors && hasWarning),
      summary: summarizeTraceIssues(issues),
      strictIssueCount: strictIssues.length,
      viewerIssueCount: viewerIssues.length,
      artifactIssueCount: artifactIssues.length,
      issues
    };
  } catch (error) {
    return errorReport(resolved, error instanceof Error ? error.message : String(error));
  }
}

function errorReport(file, message) {
  return {
    file,
    ok: false,
    summary: '1 error',
    strictIssueCount: 1,
    viewerIssueCount: 0,
    artifactIssueCount: 0,
    issues: [
      {
        severity: 'error',
        field: '$',
        message
      }
    ]
  };
}

function validateArtifactReferences(trace, tracePath) {
  const baseDir = path.dirname(tracePath);
  const issues = [];
  for (const stage of trace.stages) {
    const artifacts = [
      stage.artifacts?.beforePath ? { field: 'artifacts.beforePath', label: 'before artifact', artifactPath: stage.artifacts.beforePath } : undefined,
      stage.artifacts?.afterPath ? { field: 'artifacts.afterPath', label: 'after artifact', artifactPath: stage.artifacts.afterPath } : undefined,
      stage.artifacts?.diagnosticsPath ? { field: 'artifacts.diagnosticsPath', label: 'diagnostics artifact', artifactPath: stage.artifacts.diagnosticsPath } : undefined
    ].filter(Boolean);

    for (const artifact of artifacts) {
      const resolved = resolveArtifactPathWithinTraceRoot(baseDir, artifact.artifactPath);
      if (!resolved.ok || !resolved.resolvedPath) {
        issues.push(artifactIssue(stage.index, artifact.field, `${artifact.label} path is invalid: ${artifact.artifactPath} (${resolved.message ?? 'invalid artifact path'})`));
        continue;
      }
      try {
        const stat = fs.statSync(resolved.resolvedPath);
        if (!stat.isFile()) {
          issues.push(artifactIssue(stage.index, artifact.field, `${artifact.label} is not a file: ${artifact.artifactPath}`));
        }
      } catch {
        issues.push(artifactIssue(stage.index, artifact.field, `${artifact.label} is missing or unreadable: ${artifact.artifactPath}`));
      }
    }
  }
  return issues;
}

function artifactIssue(stageIndex, field, message) {
  return {
    severity: 'error',
    stageIndex,
    field,
    message
  };
}

function printReport(report, options) {
  const status = report.ok ? 'ok' : 'failed';
  process.stdout.write(`${status}: ${report.file} (${report.summary})\n`);
  if (report.issues.length === 0) {
    return;
  }

  for (const issue of report.issues) {
    if (issue.severity === 'info' && options.warningsAsErrors) {
      continue;
    }
    const stage = issue.stageIndex === undefined ? '' : ` stage=${issue.stageIndex}`;
    const field = issue.field ? ` ${issue.field}` : '';
    process.stdout.write(`  [${issue.severity}]${stage}${field}: ${issue.message}\n`);
  }
}

function printUsage() {
  process.stdout.write(`Pass Lens trace validation

Usage:
  npm run compile
  node scripts/validate-trace.js [options] <trace.json|directory> [...]

Options:
  --check-artifacts     Fail when before/after/diagnostics artifact paths are missing.
  --strict-only          Only validate the public schema contract.
  --warnings-as-errors  Return non-zero when viewer warnings are present.
  --json                Print machine-readable reports.
  -h, --help            Show this help.

Examples:
  npm run validate:trace -- sample-traces/mlir-live-pass-instrumentation.json
  npm run validate:trace -- --strict-only --check-artifacts sample-traces
  npm run validate:trace -- --strict-only docs/schema-examples/mlir-structured.json
`);
}

main(process.argv.slice(2));

#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { normalizeTrace } = require('../out/trace/schema.js');
const { validateTraceStrict } = require('../out/trace/strictValidation.js');
const { summarizeTraceIssues, validateTrace } = require('../out/trace/validation.js');

function main(argv) {
  const options = parseArgs(argv);
  if (options.help || options.files.length === 0) {
    printUsage();
    process.exit(options.help ? 0 : 2);
  }

  let failed = false;
  const reports = options.files.map((file) => validateFile(file, options));
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

function validateFile(file, options) {
  const resolved = path.resolve(file);
  try {
    const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    const strictIssues = validateTraceStrict(raw);
    const strictErrors = strictIssues.filter((issue) => issue.severity === 'error');
    const viewerIssues = options.strictOnly || strictErrors.length > 0
      ? []
      : validateTrace(normalizeTrace(raw));
    const issues = [...strictIssues, ...viewerIssues];
    const hasError = issues.some((issue) => issue.severity === 'error');
    const hasWarning = issues.some((issue) => issue.severity === 'warning');

    return {
      file: resolved,
      ok: !hasError && !(options.warningsAsErrors && hasWarning),
      summary: summarizeTraceIssues(issues),
      strictIssueCount: strictIssues.length,
      viewerIssueCount: viewerIssues.length,
      issues
    };
  } catch (error) {
    return {
      file: resolved,
      ok: false,
      summary: '1 error',
      strictIssueCount: 1,
      viewerIssueCount: 0,
      issues: [
        {
          severity: 'error',
          field: '$',
          message: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }
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
  node scripts/validate-trace.js [options] <trace.json> [...]

Options:
  --strict-only          Only validate the public schema contract.
  --warnings-as-errors  Return non-zero when viewer warnings are present.
  --json                Print machine-readable reports.
  -h, --help            Show this help.

Examples:
  npm run validate:trace -- sample-traces/mlir-live-pass-instrumentation.json
  npm run validate:trace -- --strict-only docs/schema-examples/mlir-structured.json
`);
}

main(process.argv.slice(2));

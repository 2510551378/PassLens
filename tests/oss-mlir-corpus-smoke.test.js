const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveCollectorExecutable, splitLitSections, parseArgs, resolveCaseSource } = require('../scripts/oss-mlir-corpus-smoke.js');

test('splitLitSections separates lit chunks and drops expected-error fixtures', () => {
  const sections = splitLitSections(`
// RUN: mlir-opt %s
module {
  func.func @ok0() { return }
}

// -----

// expected-error@+1 {{intentional}}
"bad.op"() : () -> ()

// -----

module {
  func.func @ok1() { return }
}
`);

  assert.equal(sections.length, 2);
  assert.match(sections[0], /@ok0/);
  assert.match(sections[1], /@ok1/);
  assert.doesNotMatch(sections.join('\n'), /bad\.op/);
});

test('parseArgs resolves source-root CLI flag', () => {
  const parsed = parseArgs(['--source-root', '/tmp/offline/mlir/test']);
  assert.equal(parsed.sourceRoot, '/tmp/offline/mlir/test');
  assert.equal(parsed.help, false);
});

test('resolveCaseSource prefers local source root when file exists', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oss-smoke-local-'));
  try {
    const sourcePath = path.join(tmpRoot, 'Dialect', 'Arith', 'canonicalize.mlir');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'module { func.func @main() { return } }', 'utf8');

    const entry = {
      source: 'Dialect/Arith/canonicalize.mlir'
    };

    const local = resolveCaseSource(entry, tmpRoot);
    assert.equal(local.kind, 'local');
    assert.equal(local.sourcePath, sourcePath);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('resolveCollectorExecutable resolves explicit absolute paths', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oss-collector-explicit-'));
  try {
    const executable = path.join(tmpRoot, 'pass-lens-mlir-opt');
    fs.writeFileSync(executable, 'echo ok', 'utf8');

    const found = resolveCollectorExecutable(executable);
    assert.equal(found, executable);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('resolveCollectorExecutable finds collector from PATH', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oss-collector-path-'));
  const originalPath = process.env.PATH;
  const originalPathExt = process.env.PATHEXT;
  try {
    const command = 'pass-lens-mlir-opt';
    const executableName = process.platform === 'win32'
      ? `${command}.exe`
      : command;
    const executable = path.join(tmpRoot, executableName);
    fs.writeFileSync(executable, 'echo ok', 'utf8');

    process.env.PATH = `${tmpRoot}${path.delimiter}${originalPath}`;
    if (process.platform === 'win32') {
      process.env.PATHEXT = '.exe;.cmd;.bat;.com';
    }

    const found = resolveCollectorExecutable(command);
    assert.equal(found, executable);
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalPathExt === undefined) {
      delete process.env.PATHEXT;
    } else {
      process.env.PATHEXT = originalPathExt;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

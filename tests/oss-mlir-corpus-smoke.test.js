const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { splitLitSections, parseArgs, resolveCaseSource } = require('../scripts/oss-mlir-corpus-smoke.js');

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

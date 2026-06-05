const assert = require('node:assert/strict');
const test = require('node:test');

const { splitLitSections } = require('../scripts/oss-mlir-corpus-smoke.js');

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

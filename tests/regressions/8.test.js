// tests/regressions/8.test.js
// Bug #8: TDZ ReferenceError on MSG_QUEUE_KEY -- const was declared (~L27939)
//         below the first reachable call site of the hoisted rpcCall ->
//         _replayMsgQueue() function chain. Identical bug class to the
//         FEATURE_FLAGS TDZ incident fixed in v10.6.1 (AF-40 Rule 119).
// Closed: 2026-07-01 | Version fixed: v10.36.1
// Regression risk: MEDIUM
// Refs: bug_reports.id = 8 (gaw-audit D1)
//
// No jest/vitest is installed in this repo yet (its real test infra is the
// hand-rolled scripts/_*_smoke_test.mjs convention -- see tests/regressions/
// README.md for the aspirational describe/it shape this file follows).
// Minimal shim below makes this file both real describe/it syntax (so it's
// a drop-in once a runner is adopted) AND runnable standalone today via:
//   node tests/regressions/8.test.js

'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let _failures = 0;
function describe(name, fn) { console.log('\n' + name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  [PASS] ' + name); }
  catch (e) { _failures++; console.log('  [FAIL] ' + name + ' -- ' + e.message); }
}

// Any const referenced (directly or transitively) by a hoisted function
// declaration reachable from early synchronous script execution must be
// declared before this line. Chosen generously above the current hoist
// site (~L62) and far below the earliest observed early-executing IIFE
// (~L1617) -- wide enough to not be brittle, tight enough to catch a
// regression back toward the original ~L27939 declaration site.
const SAFE_DECLARATION_THRESHOLD_LINE = 100;

const MODTOOLS_PATH = path.join(__dirname, '..', '..', 'modtools.js');
const src = fs.readFileSync(MODTOOLS_PATH, 'utf8');
const lines = src.split('\n');

function findDeclarationLines(identifier) {
  const re = new RegExp('^\\s*const\\s+' + identifier + '\\s*=');
  const hits = [];
  lines.forEach((line, idx) => { if (re.test(line)) hits.push(idx + 1); });
  return hits;
}

describe('Bug #8 -- MSG_QUEUE_KEY/MSG_QUEUE_MAX TDZ hoist (same class as v10.6.1 FEATURE_FLAGS)', () => {
  it('MSG_QUEUE_KEY should have exactly one declaration site', () => {
    const hits = findDeclarationLines('MSG_QUEUE_KEY');
    assert.strictEqual(hits.length, 1, 'expected exactly 1 declaration, found ' + hits.length + ' at lines ' + hits.join(','));
  });

  it('MSG_QUEUE_MAX should have exactly one declaration site', () => {
    const hits = findDeclarationLines('MSG_QUEUE_MAX');
    assert.strictEqual(hits.length, 1, 'expected exactly 1 declaration, found ' + hits.length + ' at lines ' + hits.join(','));
  });

  it('MSG_QUEUE_KEY should be declared before line ' + SAFE_DECLARATION_THRESHOLD_LINE + ' (TDZ-safe)', () => {
    const [line] = findDeclarationLines('MSG_QUEUE_KEY');
    assert.ok(line < SAFE_DECLARATION_THRESHOLD_LINE,
      'MSG_QUEUE_KEY declared at line ' + line + ' -- must be < ' + SAFE_DECLARATION_THRESHOLD_LINE +
      ' or rpcCall()->_replayMsgQueue() (hoisted function declarations, callable from early ' +
      'synchronous script execution) can reference it before initialization. This is Bug #8 recurring.');
  });

  it('MSG_QUEUE_MAX should be declared before line ' + SAFE_DECLARATION_THRESHOLD_LINE + ' (TDZ-safe)', () => {
    const [line] = findDeclarationLines('MSG_QUEUE_MAX');
    assert.ok(line < SAFE_DECLARATION_THRESHOLD_LINE,
      'MSG_QUEUE_MAX declared at line ' + line + ' -- must be < ' + SAFE_DECLARATION_THRESHOLD_LINE);
  });

  // Belt-and-suspenders: the original v10.6.1 incident this bug's fix mirrors.
  // Guards against a *third* occurrence of the same bug class via FEATURE_FLAGS.
  it('FEATURE_FLAGS (the v10.6.1 sibling incident) should still be declared before line ' + SAFE_DECLARATION_THRESHOLD_LINE, () => {
    const hits = findDeclarationLines('FEATURE_FLAGS');
    assert.strictEqual(hits.length, 1, 'expected exactly 1 declaration, found ' + hits.length);
    assert.ok(hits[0] < SAFE_DECLARATION_THRESHOLD_LINE, 'FEATURE_FLAGS declared at line ' + hits[0] + ' -- must be < ' + SAFE_DECLARATION_THRESHOLD_LINE);
  });
});

if (_failures > 0) {
  console.log('\n' + _failures + ' failure(s).');
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
  process.exit(0);
}

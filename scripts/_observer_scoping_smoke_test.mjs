// Smoke test for v10.30 storm #7: injectAllStrips scoping.
// Slices the REAL injectAllStrips from modtools.js and proves the acceptance criterion:
// given the body observer's addedNodes, it does NOT do a full-document querySelectorAll
// (no per-mutation full-doc sweep) — it scopes to the added subtrees; while the no-arg
// path (initial load / SPA / other callers) keeps the full sweep + compactBylines.
// Run: node scripts/_observer_scoping_smoke_test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, '..', 'modtools.js'), 'utf8');

const startMarker = '  function injectAllStrips(addedNodes){';
const endMarker = '  // Close any open strip dropdown on outside click';
const s = SRC.indexOf(startMarker), e = SRC.indexOf(endMarker);
if (s < 0 || e < 0 || e <= s) { console.error('FAIL: cannot slice injectAllStrips (anchors moved).'); process.exit(2); }
const block = SRC.slice(s, e);

let pass = 0, fail = 0; const out = [];
const check = (n, c) => { if (c) { pass++; out.push('  [PASS] ' + n); } else { fail++; out.push('  [FAIL] ' + n); } };

function build() {
  const calls = { qsa: [], strip: [], byline: 0 };
  const documentStub = { querySelectorAll: (sel) => { calls.qsa.push(sel); return []; } };
  const buildActionStrip = (n) => { calls.strip.push(n); };
  const compactBylines = () => { calls.byline++; };
  const FallbackMode = false;
  // _isProfileViewNow intentionally left undeclared -> typeof !== 'function' -> not called.
  // eslint-disable-next-line no-new-func
  const factory = new Function('FallbackMode', 'buildActionStrip', 'compactBylines', 'document',
    block + '\n return injectAllStrips;');
  return { fn: factory(FallbackMode, buildActionStrip, compactBylines, documentStub), calls };
}

// 1) Scoped path (observer passes addedNodes): NO full-document sweep; strips on the added node;
//    compactBylines NOT run per-mutation (the observer debounces it once-per-burst).
{
  const { fn, calls } = build();
  const fakePost = { nodeType: 1, matches: () => true, querySelectorAll: () => [] };
  fn([fakePost]);
  check('scoped: document.querySelectorAll NOT called (no full-doc sweep per mutation)', calls.qsa.length === 0);
  check('scoped: buildActionStrip ran on the added node', calls.strip.length === 1 && calls.strip[0] === fakePost);
  check('scoped: compactBylines NOT called per-mutation (debounced by observer)', calls.byline === 0);
}

// 2) No-arg path (initial load / SPA / other callers): full-doc sweep + compactBylines, unchanged.
{
  const { fn, calls } = build();
  fn();
  check('full: document.querySelectorAll called once with .post,.comment', calls.qsa.length === 1 && /\.post,\s*\.comment/.test(calls.qsa[0]));
  check('full: compactBylines called (behavior preserved for non-observer callers)', calls.byline === 1);
}

console.log('=== injectAllStrips scoping smoke ===');
console.log(out.join('\n'));
console.log('--- ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);

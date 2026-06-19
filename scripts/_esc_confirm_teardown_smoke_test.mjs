// _esc_confirm_teardown_smoke_test.mjs
// Regression guard: the Mod Console ESC-confirm row (#mc-esc-confirm) must be
// removed by closeAllPanels() on EVERY teardown route, not only when its own
// Discard/Keep buttons resolve. Pre-fix, #mc-esc-confirm was absent from the
// closeAllPanels SEL sweep, so any close path (global ESC, backdrop click,
// programmatic close, body re-render leaving the head-sibling row) orphaned it.
// Fix: '#mc-esc-confirm' added to the SEL list (same idiom as the v9.3.x
// backdrop / .gam-preflight-wrap additions). This test static-asserts the
// wiring + simulates the sweep selector against a fake DOM set.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== esc-confirm teardown cleanup ===');

// --- slice closeAllPanels() ---
const cStart = SRC.indexOf('function closeAllPanels(){');
const cEnd = SRC.indexOf('\n  }', cStart) + 4;
if (cStart < 0 || cEnd <= 0) { console.error('FATAL: closeAllPanels markers not found'); process.exit(2); }
const fnSrc = SRC.slice(cStart, cEnd);

// --- extract the SEL array literal members ---
const selBlock = fnSrc.slice(fnSrc.indexOf('const SEL = ['), fnSrc.indexOf('].join('));
const selMembers = [...selBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);

ck('closeAllPanels defines a SEL sweep array', selMembers.length >= 5);
ck('SEL includes #mc-esc-confirm (the fix)', selMembers.includes('#mc-esc-confirm'));
ck('SEL still includes the established sweep targets', selMembers.includes('.gam-modal') && selMembers.includes('.gam-preflight-wrap'));
ck('closeAllPanels sweeps SEL via querySelectorAll(...).remove()',
   /querySelectorAll\(SEL\)/.test(fnSrc) && /e\.remove\(\)/.test(fnSrc));

// --- the ESC handler creates exactly the id the sweep removes ---
ck('ESC handler creates an element with id "mc-esc-confirm"',
   /\.id\s*=\s*'mc-esc-confirm'/.test(SRC) || /\.id\s*=\s*"mc-esc-confirm"/.test(SRC));

// --- simulate the sweep matcher against a fake DOM set ---
// Models: a visible confirm row whose parent panel is being torn down, plus a
// detached/orphaned confirm row. Both must be matched by the SEL membership.
const fakeNodes = [
  { id: 'mc-esc-confirm', cls: [], attrs: {} },              // the confirm row
  { id: 'gam-backdrop', cls: [], attrs: {} },                 // a backdrop
  { id: '', cls: ['gam-modal'], attrs: {} },                  // a modal
  { id: 'unrelated', cls: ['post'], attrs: {} },              // should NOT match
];
function matchesSEL(node) {
  return selMembers.some(sel => {
    if (sel.startsWith('#')) return node.id === sel.slice(1);
    if (sel.startsWith('.')) return node.cls.includes(sel.slice(1));
    if (sel.startsWith('[')) { const k = sel.slice(1, -1); return Object.prototype.hasOwnProperty.call(node.attrs, k); }
    return false;
  });
}
const swept = fakeNodes.filter(matchesSEL).map(n => n.id || ('.' + n.cls.join('.')));
ck('sweep matches the confirm row', swept.includes('mc-esc-confirm'));
ck('sweep matches modal + backdrop (no regression)', swept.includes('gam-backdrop') && swept.includes('.gam-modal'));
ck('sweep does NOT match unrelated page nodes', !swept.includes('unrelated'));

console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);

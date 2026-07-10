// Smoke test for v10.40.2 autoRefreshTick idle-gate fix (the "everything broke" bug).
//
// BUG: `if (!hidden && !idle) return;` reloaded ANY unfocused/background GAW tab on
// EVERY 60s tick — no time gate on the `hidden` case. Alt-tabbing away (e.g. to chat)
// made every GAW tab, including /users, reload once a minute: triage never mounted,
// state was lost, automated inspection tabs died on sight. FIX: `if (!idle) return;`
// — reload only after a full N-minute idle interval, which an unfocused tab still
// reaches (no activity events fire) so the intended "refresh idle pages" behavior holds.
//
// Slices the REAL autoRefreshTick from modtools.js and exercises it with stubs.
// Run: node scripts/_p19_autorefresh_idle_gate_smoke_test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, '..', 'modtools.js'), 'utf8');

const marker = 'function autoRefreshTick(){';
const start = SRC.indexOf(marker);
if (start < 0) { console.error('FAIL: autoRefreshTick not found (renamed/moved).'); process.exit(2); }
let depth = 0, i = SRC.indexOf('{', start), end = -1;
for (; i < SRC.length; i++) { if (SRC[i] === '{') depth++; else if (SRC[i] === '}') { depth--; if (depth === 0) { end = i; break; } } }
const fnSrc = SRC.slice(start, end + 1);

const INTERVAL_MS = 60 * 60 * 1000;
function run(scn) {
  let reloaded = false;
  const now = Date.now();
  const lastActivity = scn.idle ? now - (INTERVAL_MS + 5000) : now - 1000;
  const getSetting = (k, d) => {
    if (k === 'autoRefreshEnabled') return scn.enabled !== false;
    if (k === 'autoRefreshIntervalMin') return 60;
    return d;
  };
  const hasDirtyInput = () => !!scn.dirty;
  const documentStub = {
    hidden: !!scn.hidden,
    hasFocus: () => !scn.hidden,
    querySelector: (sel) => (sel === '.gam-preflight-wrap' && scn.preflight ? {} : null),
  };
  const location = { reload: () => { reloaded = true; } };
  const consoleStub = { log: () => {} };
  const factory = new Function('getSetting', 'hasDirtyInput', 'document', 'location', 'console', 'lastActivity',
    fnSrc + '\n return autoRefreshTick;');
  factory(getSetting, hasDirtyInput, documentStub, location, consoleStub, lastActivity)();
  return reloaded;
}

let pass = 0, fail = 0; const out = [];
const check = (name, cond) => { if (cond) { pass++; out.push('  [PASS] ' + name); } else { fail++; out.push('  [FAIL] ' + name); } };

// THE BUG: hidden/unfocused but active (not idle) must NOT reload.
check('hidden + NOT idle -> does NOT reload (the fixed bug)', run({ hidden: true, idle: false }) === false);
// Intended behavior preserved: a genuinely idle page DOES reload.
check('idle (>N min no activity) -> reloads', run({ hidden: true, idle: true }) === true);
check('focused idle page -> reloads', run({ hidden: false, idle: true }) === true);
// Focused + active -> never reload.
check('focused + active -> does NOT reload', run({ hidden: false, idle: false }) === false);
// Guards intact.
check('disabled -> never reloads', run({ hidden: true, idle: true, enabled: false }) === false);
check('idle but dirty input -> does NOT reload', run({ hidden: true, idle: true, dirty: true }) === false);
check('idle but preflight modal open -> does NOT reload', run({ hidden: true, idle: true, preflight: true }) === false);

console.log('=== autoRefreshTick idle-gate smoke ===');
console.log(out.join('\n'));
console.log('--- ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);

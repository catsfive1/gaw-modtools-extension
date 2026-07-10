// v10.44.0 WS-8 regression: keyboard-focus continuity across triage rebuilds.
// Slices the REAL _pickTriageRefocusTarget out of modtools.js (house convention),
// exercises it behaviorally, then static-asserts the capture/restore wiring.
import { readFileSync } from 'node:fs';
const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name){
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
}

// --- slice the pure helper ---
const start = SRC.indexOf('function _pickTriageRefocusTarget(');
ok(start !== -1, '_pickTriageRefocusTarget found');
const end = SRC.indexOf('function refreshTriageConsole(', start); // fromIndex guards false match
ok(end !== -1 && end > start, 'helper sits directly above refreshTriageConsole');
const fnSrc = SRC.slice(start, end);
const pick = new Function(fnSrc + '\nreturn _pickTriageRefocusTarget;')();

// --- behavior ---
const order = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
ok(pick(order, 'charlie', new Set(order)) === 'charlie',
  'row survived -> same user refocused');
ok(pick(order, 'charlie', new Set(['alpha', 'bravo', 'delta', 'echo'])) === 'delta',
  'row actioned away -> NEXT user in old order (conveyor belt)');
ok(pick(order, 'charlie', new Set(['delta', 'echo'])) === 'delta',
  'multiple predecessors gone -> still the next survivor forward');
ok(pick(order, 'echo', new Set(['alpha', 'bravo'])) === 'bravo',
  'tail row actioned -> falls back to nearest PREVIOUS survivor');
ok(pick(order, 'charlie', new Set()) === null,
  'entire list gone -> null (no focus theft)');
ok(pick(order, null, new Set(order)) === null,
  'no focused user captured -> null');
ok(pick(order, 'ghost', new Set(['alpha'])) === null,
  'focused user absent from old order -> null (defensive)');
ok(pick([], 'alpha', new Set(['alpha'])) === 'alpha',
  'user still present wins even with empty old order');

// --- wiring (static) ---
const rtcStart = SRC.indexOf('function refreshTriageConsole(');
const rtcSlice = SRC.slice(rtcStart, SRC.indexOf('IS_USERS_PAGE && !window.__gam_users_autorefresh_started', rtcStart));
ok(/container\.contains\(_ae\)/.test(rtcSlice),
  'capture only engages when focus is INSIDE the console');
ok(/_ae !== document\.body/.test(rtcSlice),
  'body focus is not treated as an in-console focus');
ok(rtcSlice.indexOf('renderTriageList(container, users);') < rtcSlice.indexOf('_pickTriageRefocusTarget(_oldRowOrder'),
  'restore runs AFTER renderTriageList');
ok(/try \{[\s\S]*?_newMap\.get\(_target\)\.focus\(\)/.test(rtcSlice),
  'focus restore is try-wrapped (must never break the render)');
// HI-1: this workstream is pure focus management -- no ban references added
ok(!/executeBan|addToDeathRow|apiBan/.test(fnSrc),
  'helper contains no ban-path references');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

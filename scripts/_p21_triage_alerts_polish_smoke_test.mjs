// v10.43.0 WS-9 regression: triage alerts polish + safety.
// Static-asserts on source (house convention: slice/grep the real file, no jsdom).
import { readFileSync } from 'node:fs';
const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name){
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
}

// --- locate renderTriageAlerts body (bounded slice) ---
const fnStart = SRC.indexOf('function renderTriageAlerts(container, users){');
ok(fnStart !== -1, 'renderTriageAlerts found');
const fnEnd = SRC.indexOf('function renderTriageToolbar(', fnStart); // fromIndex guards false match
ok(fnEnd !== -1 && fnEnd > fnStart, 'renderTriageToolbar delimiter found after it');
const body = SRC.slice(fnStart, fnEnd);

// 1) escapeHtml wraps every prefix interpolation in the burst banner
ok(body.includes('IP range ${escapeHtml(prefix)}.x.x'), 'banner text prefix escaped');
ok(body.includes('data-cluster="${escapeHtml(prefix)}"'), 'data-cluster attr escaped');
ok(body.includes('data-cluster-select="${escapeHtml(prefix)}"'), 'data-cluster-select attr escaped');
ok(body.includes('data-cluster-dr="${escapeHtml(prefix)}"'), 'data-cluster-dr attr escaped');
// and no RAW ${prefix} interpolation remains in the banner template line
const bannerLine = body.split('\n').find(l => l.includes('Burst detected:</b>')) || '';
ok(!bannerLine.includes('${prefix}'), 'no unescaped ${prefix} left in banner template');

// 2) all-clear empty state: only when nothing else rendered, ok-toned class
const acIdx = body.indexOf('gam-t-alert-ok');
ok(acIdx !== -1, 'all-clear alert class present in renderTriageAlerts');
ok(body.includes('!aEl.childElementCount'), 'all-clear gated on empty alerts region');
// gate must come AFTER the last content-adding site (drPending flush block)
const drPendingIdx = body.indexOf('gam-t-alert-flush');
ok(drPendingIdx !== -1 && acIdx > drPendingIdx, 'all-clear check placed after all alert-add sites');

// 3) all-clear CSS rule exists (ok tone, success-family color)
ok(/\.gam-t-alert-ok\{[^}]*3dd68c/.test(SRC), '.gam-t-alert-ok CSS rule present with success color');

// 4) bulk-DR instant acknowledgement: textContent swap + pointerEvents lock
//    inside the bulkdr handler, before batchDeathRow fires
const bulkIdx = body.indexOf(".gam-t-alert-bulkdr");
const bulkSlice = body.slice(bulkIdx, body.indexOf('const flushBtn', bulkIdx));
ok(bulkSlice.includes("a.style.pointerEvents='none'"), 'bulk-DR link locks against double-fire');
ok(bulkSlice.includes('Queuing'), 'bulk-DR link shows Queuing acknowledgement');
ok(bulkSlice.indexOf('Queuing') < bulkSlice.indexOf('batchDeathRow(names)'), 'acknowledgement lands BEFORE batchDeathRow');

// 5) READY alert now points at the flush control
ok(body.includes('READY. Will execute automatically —'), 'READY alert carries the flush hint');

// 6) HI-1 guard: this workstream added NO new ban path
ok(!bulkSlice.includes('executeBan'), 'bulk-DR handler still never calls executeBan directly');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

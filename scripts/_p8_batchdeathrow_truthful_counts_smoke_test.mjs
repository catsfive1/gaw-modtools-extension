// _p8_batchdeathrow_truthful_counts_smoke_test.mjs
// v10.36.12 P0 FIX: batchDeathRow() called addToDeathRow (idempotent) and
// only counted `ok` (=added). Once a cluster was already queued, every later
// "Death Row all N" click returned added=0 for everyone -> a bare
// "0 user(s) added to Death Row (72h)" toast, toned 'warn' (auto-dismisses
// ~4s). A zero-valued, self-erasing, yellow-alarm toast IS the "no feedback /
// nothing happened" trust-break Commander reported. Fixed to distinguish
// newly-queued from already-queued and never emit a bare "0 user(s)" string.
//
// Slices the real batchDeathRow() verbatim and stubs its dependencies with
// the project's established slice-and-stub convention.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P8: batchDeathRow truthful added/already/total counts (v10.36.12) ===');

const start = SRC.indexOf('async function batchDeathRow(usernames){');
if (start < 0) { console.error('FATAL: batchDeathRow marker not found'); process.exit(2); }
const end = SRC.indexOf('\n  }', start) + 4;
if (end <= 3) { console.error('FATAL: batchDeathRow closing brace not found'); process.exit(2); }
const fnSrc = SRC.slice(start, end) + '\n return batchDeathRow;';

function makeHarness(preloaded) {
  // preloaded: Set of usernames already "on Death Row" -- addToDeathRow
  // returns false for these (idempotent no-op), true for fresh ones.
  const preloadedSet = preloaded || new Set();
  const snackCalls = [];
  const statusCalls = [];
  const logCalls = [];

  function addToDeathRow(username /*, ms, reason */) {
    if (preloadedSet.has(username)) return false;
    preloadedSet.add(username);
    return true;
  }
  function rosterSetStatus(username, status) { statusCalls.push({ username, status }); }
  function logAction(rec) { logCalls.push(rec); }
  function getUsersBanReason() { return 'test-reason'; }
  function snack(msg, tone) { snackCalls.push({ msg, tone }); }
  let selectedCleared = false;
  const triageSelected = { clear() { selectedCleared = true; } };
  let refreshed = 0;
  function refreshTriageConsole() { refreshed++; }

  const factory = new Function(
    'addToDeathRow', 'rosterSetStatus', 'logAction', 'getUsersBanReason',
    'snack', 'triageSelected', 'refreshTriageConsole',
    fnSrc
  );
  const batchDeathRow = factory(
    addToDeathRow, rosterSetStatus, logAction, getUsersBanReason,
    snack, triageSelected, refreshTriageConsole
  );

  return {
    batchDeathRow, snackCalls, statusCalls, logCalls,
    get selectedCleared() { return selectedCleared; },
    get refreshed() { return refreshed; },
  };
}

// --- 29 fresh usernames -> added=29, already=0, success tone, no bare "0" ---
{
  const h = makeHarness();
  const names = Array.from({ length: 29 }, (_, i) => 'fresh' + i);
  const result = await h.batchDeathRow(names);
  ck('29 fresh users -> added=29', result.added === 29);
  ck('29 fresh users -> already=0', result.already === 0);
  ck('29 fresh users -> total=29', result.total === 29);
  const lastSnack = h.snackCalls[h.snackCalls.length - 1];
  ck('snack tone is success for all-fresh batch', lastSnack.tone === 'success');
  ck('snack message does not contain a bare "0 user(s)"', !/^0 user\(s\)/.test(lastSnack.msg));
  ck('snack message mentions the queued count', lastSnack.msg.includes('29'));
}

// --- re-run the SAME 29 -> added=0, already=29, info tone (NOT warn), mentions "already on Death Row", never bare "0" ---
{
  const names = Array.from({ length: 29 }, (_, i) => 'dup' + i);
  const h = makeHarness(new Set(names)); // pre-seed as already queued
  const result = await h.batchDeathRow(names);
  ck('re-run same 29 -> added=0', result.added === 0);
  ck('re-run same 29 -> already=29', result.already === 29);
  const lastSnack = h.snackCalls[h.snackCalls.length - 1];
  ck('snack tone is info (NOT warn) when everyone already queued', lastSnack.tone === 'info');
  ck('snack message states "already on Death Row"', lastSnack.msg.includes('already on Death Row'));
  ck('snack message is never a bare "0 user(s) added"', !/^0 user\(s\) added/.test(lastSnack.msg));
}

// --- mixed 10 fresh + 19 already -> added=10, already=19, success tone, mentions both counts ---
{
  const freshNames = Array.from({ length: 10 }, (_, i) => 'mixfresh' + i);
  const alreadyNames = Array.from({ length: 19 }, (_, i) => 'mixdup' + i);
  const h = makeHarness(new Set(alreadyNames));
  const result = await h.batchDeathRow([...freshNames, ...alreadyNames]);
  ck('mixed batch -> added=10', result.added === 10);
  ck('mixed batch -> already=19', result.already === 19);
  ck('mixed batch -> total=29', result.total === 29);
  const lastSnack = h.snackCalls[h.snackCalls.length - 1];
  ck('mixed batch snack tone is success', lastSnack.tone === 'success');
  ck('mixed batch snack mentions newly-queued count (10)', lastSnack.msg.includes('10'));
  ck('mixed batch snack mentions already-queued count (19)', lastSnack.msg.includes('19'));
}

// --- selection is cleared and console refreshed regardless of outcome (regression guard) ---
{
  const names = ['soloA', 'soloB'];
  const h = makeHarness();
  await h.batchDeathRow(names);
  ck('triageSelected.clear() still called', h.selectedCleared === true);
  ck('refreshTriageConsole() still called', h.refreshed === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

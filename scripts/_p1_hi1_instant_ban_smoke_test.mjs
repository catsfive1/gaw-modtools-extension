// _p1_hi1_instant_ban_smoke_test.mjs
// v10.36.2 P1 fix (Opus 4.8 brainstorm brief, HI-1): instantPermaBan() and
// batchBanUsers() called executeBan(...,0) directly -- a live user click
// (Triage /users shift-click on the hammer, and the batch "Ban N NOW?"
// button) reaching the raw ban executor with zero idempotency check, zero
// Death-Row queue record, and zero reaper audit trail. Per Commander's
// guarded-break-glass decision, both now route through addToDeathRow(0ms)
// + an explicit processDeathRow() reaper fire, so the choke-point still
// holds while the ban still fires immediately (no added confirm dialog --
// shift-click stays the existing no-confirm "power move").
//
// Deliberately does NOT provide executeBan/apiBan as an injectable stub --
// if either function regresses back to calling it directly, new Function()
// throws ReferenceError and the assertion below reports that as a failure.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P1: HI-1 instant-ban choke-point wiring (v10.36.2) ===');

// --- slice instantPermaBan ---
const ipbStart = SRC.indexOf('async function instantPermaBan(username){');
const ipbRet = SRC.indexOf('refreshTriageConsole();', ipbStart);
const ipbEnd = SRC.indexOf('}', ipbRet) + 1;
if (ipbStart < 0 || ipbRet < 0) { console.error('FATAL: instantPermaBan markers not found'); process.exit(2); }
const ipbSrc = SRC.slice(ipbStart, ipbEnd);

// --- slice batchBanUsers ---
const bbuStart = SRC.indexOf('async function batchBanUsers(usernames){');
const bbuRet = SRC.indexOf('await processDeathRow();', bbuStart);
const bbuEnd = SRC.indexOf('}', bbuRet) + 1;
if (bbuStart < 0 || bbuRet < 0) { console.error('FATAL: batchBanUsers markers not found'); process.exit(2); }
const bbuSrc = SRC.slice(bbuStart, bbuEnd);

// --- shared fake Death Row store + stubs ---
function makeEnv(seedDr = []) {
  let drStore = seedDr.map(e => ({ ...e }));
  const rosterCalls = [];
  const processDeathRowCalls = [];
  const snackCalls = [];

  const getDeathRow = () => drStore.map(e => ({ ...e })); // fresh copy each call, like the real lsGet
  const saveDeathRow = (dr) => { drStore = dr.map(e => ({ ...e })); };
  const addToDeathRow = (username, delayMs, reason, opts) => {
    if (drStore.find(d => d.username.toLowerCase() === username.toLowerCase())) return false;
    drStore.push({ username, reason, queuedAt: Date.now(), executeAt: Date.now() + delayMs, status: 'waiting' });
    return true;
  };
  const rosterSetStatus = (u, s) => rosterCalls.push([u, s]);
  const processDeathRow = async () => { processDeathRowCalls.push(true); };
  const snack = (msg, kind) => snackCalls.push([msg, kind]);
  const refreshTriageConsole = () => {};
  const getUsersBanReason = () => 'test-reason';

  return { getDeathRow, saveDeathRow, addToDeathRow, rosterSetStatus, processDeathRow, snack, refreshTriageConsole, getUsersBanReason, _drStore: () => drStore, _rosterCalls: rosterCalls, _processCalls: processDeathRowCalls };
}

// --- instantPermaBan: fresh user ---
{
  const env = makeEnv([]);
  const instantPermaBan = new Function(
    'snack', 'addToDeathRow', 'getUsersBanReason', 'getDeathRow', 'saveDeathRow', 'rosterSetStatus', 'processDeathRow', 'refreshTriageConsole',
    ipbSrc + '\n return instantPermaBan;'
  )(env.snack, env.addToDeathRow, env.getUsersBanReason, env.getDeathRow, env.saveDeathRow, env.rosterSetStatus, env.processDeathRow, env.refreshTriageConsole);

  await instantPermaBan('alice');
  const entry = env._drStore().find(d => d.username === 'alice');
  ck('instantPermaBan (fresh): user lands in the DR queue', !!entry);
  ck('instantPermaBan (fresh): executeAt is ~now (0ms delay), not a future timestamp', entry && Math.abs(entry.executeAt - Date.now()) < 2000);
  ck('instantPermaBan (fresh): roster status set to deathrow', env._rosterCalls.some(c => c[0] === 'alice' && c[1] === 'deathrow'));
  ck('instantPermaBan (fresh): reaper fired exactly once', env._processCalls.length === 1);
}

// --- instantPermaBan: user already on a 72h-out DR queue (edge case) ---
{
  const futureExecuteAt = Date.now() + 72 * 3600 * 1000;
  const env = makeEnv([{ username: 'bob', reason: 'earlier auto-rule', queuedAt: Date.now(), executeAt: futureExecuteAt, status: 'waiting' }]);
  const instantPermaBan = new Function(
    'snack', 'addToDeathRow', 'getUsersBanReason', 'getDeathRow', 'saveDeathRow', 'rosterSetStatus', 'processDeathRow', 'refreshTriageConsole',
    ipbSrc + '\n return instantPermaBan;'
  )(env.snack, env.addToDeathRow, env.getUsersBanReason, env.getDeathRow, env.saveDeathRow, env.rosterSetStatus, env.processDeathRow, env.refreshTriageConsole);

  await instantPermaBan('bob');
  const entry = env._drStore().find(d => d.username === 'bob');
  ck('instantPermaBan (already-queued): break-glass forces executeAt to now instead of no-op', entry && entry.executeAt < futureExecuteAt && Math.abs(entry.executeAt - Date.now()) < 2000);
  ck('instantPermaBan (already-queued): reaper still fires', env._processCalls.length === 1);
}

// --- batchBanUsers: mixed fresh + already-queued, ONE reaper fire ---
{
  const futureExecuteAt = Date.now() + 72 * 3600 * 1000;
  const env = makeEnv([{ username: 'carol', reason: 'earlier', queuedAt: Date.now(), executeAt: futureExecuteAt, status: 'waiting' }]);
  const fakeTriageSelected = { cleared: false, clear() { this.cleared = true; } };
  const batchBanUsers = new Function(
    'snack', 'addToDeathRow', 'getUsersBanReason', 'getDeathRow', 'saveDeathRow', 'rosterSetStatus', 'processDeathRow', 'refreshTriageConsole', 'triageSelected',
    bbuSrc + '\n return batchBanUsers;'
  )(env.snack, env.addToDeathRow, env.getUsersBanReason, env.getDeathRow, env.saveDeathRow, env.rosterSetStatus, env.processDeathRow, env.refreshTriageConsole, fakeTriageSelected);

  await batchBanUsers(['carol', 'dave', 'eve']);
  const store = env._drStore();
  ck('batchBanUsers: all 3 usernames land in the DR queue', ['carol', 'dave', 'eve'].every(u => store.some(d => d.username === u)));
  ck('batchBanUsers: pre-existing entry (carol) forced ready, not left at 72h', store.find(d => d.username === 'carol').executeAt < futureExecuteAt);
  ck('batchBanUsers: fresh entries (dave, eve) are ~now', ['dave', 'eve'].every(u => Math.abs(store.find(d => d.username === u).executeAt - Date.now()) < 2000));
  ck('batchBanUsers: roster status set to deathrow for all 3', ['carol', 'dave', 'eve'].every(u => env._rosterCalls.some(c => c[0] === u && c[1] === 'deathrow')));
  ck('batchBanUsers: reaper fires exactly ONCE for the whole batch (not N times)', env._processCalls.length === 1);
  ck('batchBanUsers: clears the triage selection', fakeTriageSelected.cleared);
}

// --- static: the two violations no longer reference executeBan/apiBan at all ---
// requires an identifier char right after '(' -- won't match the explanatory
// comments above, which write it as "executeBan(...,0)" (literal ellipsis).
const CALLS_EXECUTE_BAN_RE = /executeBan\s*\(\s*[a-zA-Z_$]/;
const CALLS_API_BAN_RE = /\bapiBan\s*\(\s*[a-zA-Z_$]/;
ck('instantPermaBan: no direct executeBan(...) call', !CALLS_EXECUTE_BAN_RE.test(ipbSrc));
ck('instantPermaBan: no direct apiBan(...) call', !CALLS_API_BAN_RE.test(ipbSrc));
ck('batchBanUsers: no direct executeBan(...) call', !CALLS_EXECUTE_BAN_RE.test(bbuSrc));
ck('batchBanUsers: no direct apiBan(...) call', !CALLS_API_BAN_RE.test(bbuSrc));
// [^;]* (not [^)]*) so a nested call like getUsersBanReason() inside the
// argument list doesn't prematurely terminate the match on its own ')'.
ck('instantPermaBan: routes through addToDeathRow with fromUserAction:true', /addToDeathRow\([^;]*fromUserAction:\s*true/.test(ipbSrc));
ck('batchBanUsers: routes through addToDeathRow with fromUserAction:true', /addToDeathRow\([^;]*fromUserAction:\s*true/.test(bbuSrc));
ck('instantPermaBan: fires the reaper (processDeathRow)', /processDeathRow\(\)/.test(ipbSrc));
ck('batchBanUsers: fires the reaper (processDeathRow)', /processDeathRow\(\)/.test(bbuSrc));

// --- static: the reaper + DR-flush + Mod-Console ban paths are untouched (scope check) ---
const reaperStart = SRC.indexOf('async function processDeathRow(){');
const reaperEnd = SRC.indexOf('async function openModConsole', reaperStart);
const reaperSrc = SRC.slice(reaperStart, reaperStart > 0 ? reaperStart + 2000 : 0);
ck('processDeathRow (the reaper) still calls executeBan directly -- unchanged, still the only legit path', /executeBan\(inmate\.username/.test(reaperSrc));

console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);

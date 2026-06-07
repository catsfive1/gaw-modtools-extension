// Throwaway smoke test for v10.24.0 lockout-proof L1 (401 self-heal + flag) in
// _rpcWorkerCall. NOT shipped. Run: node scripts/_lockout_l1_smoke_test.mjs
//
// Slices the REAL _rpcWorkerCall out of background.js and drives its 401 paths
// against a mock fetch (sequenced responses) + mock loadSecrets (sets what the
// reload produces). The CRITICAL assertion is the recursion guard: a persistent
// 401 must NOT loop forever (max one retry).

import { readFileSync } from 'node:fs';
const SRC = readFileSync(new URL('../background.js', import.meta.url), 'utf8');
function slice(a, b, label) {
  const i = SRC.indexOf(a), j = SRC.indexOf(b, i);
  if (i < 0 || j < 0) { console.error('FATAL: region not found: ' + label); process.exit(2); }
  return SRC.slice(i, j);
}
const fn = slice('async function _rpcWorkerCall(method, path, body, opts) {', '\nconst RPC_HANDLERS', '_rpcWorkerCall');

const prelude = `
const WORKER_BASE = 'https://w.test';
let secretCache = { workerModToken: '', leadModToken: '' };
let __reloadTo = null;
async function loadSecrets(){ if (__reloadTo) secretCache = { workerModToken: __reloadTo.w || '', leadModToken: __reloadTo.l || '' }; }
let __fetchQueue = []; let __fetchCalls = 0;
async function fetch(url, init){ __fetchCalls++; const nx = __fetchQueue.shift() || { status: 200 }; return { ok: nx.status >= 200 && nx.status < 300, status: nx.status, async text(){ return JSON.stringify({ ok: nx.status < 400 }); } }; }
class AbortController { constructor(){ this.signal = {}; } abort(){} }
const Headers = class { constructor(){ this._m = {}; } set(k,v){ this._m[k] = v; } };
const __store = {};
const chrome = {
  runtime: { getManifest: () => ({ version: '10.24.0' }) },
  storage: {
    local: { async set(o){ Object.assign(__store, o); }, async get(k){ const ks = Array.isArray(k) ? k : [k]; const o = {}; ks.forEach(x => { if (x in __store) o[x] = __store[x]; }); return o; }, async remove(k){ delete __store[k]; } },
    session: { async remove(){} }
  }
};
`;
const factory = new Function(prelude + '\n' + fn + '\n' +
  'return { _rpcWorkerCall, setCache:(w,l)=>{secretCache={workerModToken:w||"",leadModToken:l||""};}, ' +
  'getCache:()=>secretCache, setReload:(w,l)=>{__reloadTo=(w===null)?null:{w:w,l:l};}, ' +
  'queueFetch:(arr)=>{__fetchQueue=arr.slice();}, fetchCalls:()=>__fetchCalls, ' +
  'reset:()=>{__fetchCalls=0;for(const k in __store)delete __store[k];}, store:()=>__store };');
const M = factory();

let pass = 0, fail = 0; const log = [];
function check(n, c, e) { if (c) { pass++; log.push('  PASS  ' + n + (e ? '  ' + e : '')); } else { fail++; log.push('  FAIL  ' + n + (e ? '  ' + e : '')); } }

log.push('=== v10.24.0 lockout-proof L1 (_rpcWorkerCall 401 self-heal) smoke ===\n');

// [1] 200 OK -> no retry, no flag
{ M.reset(); M.setCache('T1', ''); M.setReload(null); M.queueFetch([{ status: 200 }]);
  const r = await M._rpcWorkerCall('GET', '/x');
  check('200: ok=true', r.ok === true);
  check('200: exactly 1 fetch', M.fetchCalls() === 1, 'calls=' + M.fetchCalls());
  check('200: no gam_auth_failed', !M.store().gam_auth_failed); }

// [2] 401 -> reload yields a DIFFERENT token -> retry once -> 200 (race recovered)
{ M.reset(); M.setCache('OLD', ''); M.setReload('NEW', ''); M.queueFetch([{ status: 401 }, { status: 200 }]);
  const r = await M._rpcWorkerCall('GET', '/x');
  check('401->diff: retried (2 fetches)', M.fetchCalls() === 2, 'calls=' + M.fetchCalls());
  check('401->diff: final ok=true', r.ok === true, 'status=' + r.status);
  check('401->diff: no flag (recovered)', !M.store().gam_auth_failed);
  check('401->diff: cache now NEW', M.getCache().workerModToken === 'NEW', 'cache=' + M.getCache().workerModToken); }

// [3] 401 -> reload yields the SAME token -> no retry -> flag, cache restored
{ M.reset(); M.setCache('SAME', ''); M.setReload('SAME', ''); M.queueFetch([{ status: 401 }]);
  const r = await M._rpcWorkerCall('GET', '/x');
  check('401->same: NO retry (1 fetch)', M.fetchCalls() === 1, 'calls=' + M.fetchCalls());
  check('401->same: returns 401', r.status === 401);
  check('401->same: gam_auth_failed set', !!M.store().gam_auth_failed, 'flag=' + JSON.stringify(M.store().gam_auth_failed));
  check('401->same: cache restored to SAME', M.getCache().workerModToken === 'SAME'); }

// [4] 401 -> reload yields EMPTY -> no retry -> flag + cache restored to used token
{ M.reset(); M.setCache('USED', ''); M.setReload('', ''); M.queueFetch([{ status: 401 }]);
  const r = await M._rpcWorkerCall('GET', '/x');
  check('401->empty: 1 fetch', M.fetchCalls() === 1, 'calls=' + M.fetchCalls());
  check('401->empty: flag set', !!M.store().gam_auth_failed);
  check('401->empty: cache restored to USED', M.getCache().workerModToken === 'USED'); }

// [5] no token at all -> 401 is a genuine unauthed call -> NOT handled, no flag
{ M.reset(); M.setCache('', ''); M.setReload('', ''); M.queueFetch([{ status: 401 }]);
  const r = await M._rpcWorkerCall('GET', '/x');
  check('no-token: returns 401', r.status === 401);
  check('no-token: no flag (genuine unauthed, not a lockout)', !M.store().gam_auth_failed); }

// [6] RECURSION GUARD: 401 -> diff -> retry -> retry ALSO 401 -> STOP (no 3rd fetch) + flag
{ M.reset(); M.setCache('A', ''); M.setReload('B', ''); M.queueFetch([{ status: 401 }, { status: 401 }, { status: 200 }]);
  const r = await M._rpcWorkerCall('GET', '/x');
  check('recursion-guard: EXACTLY 2 fetches (no infinite loop)', M.fetchCalls() === 2, 'calls=' + M.fetchCalls());
  check('recursion-guard: returns the 2nd 401 (3rd queued 200 unused)', r.status === 401);
  check('recursion-guard: retry-still-401 sets the flag', !!M.store().gam_auth_failed); }

log.push('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
console.log(log.join('\n'));
process.exit(fail === 0 ? 0 : 1);

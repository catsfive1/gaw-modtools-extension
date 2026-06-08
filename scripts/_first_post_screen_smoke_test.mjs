// _first_post_screen_smoke_test.mjs
// v10.26.0 first-post screening -- extract-from-source + mock-env harness.
// Slices the REAL scorePostQualityText + the REAL firstPostScreenTick out of
// modtools.js and runs them against mocked RPC/env so we exercise the shipped
// code path (not a re-implementation). Invariants under test:
//   1. non-slop title          -> ZERO network calls (cheap gate works)
//   2. slop + new account       -> modSusMark with 'NEW first-post slop' reason
//   3. slop + old account       -> cadence checked, NO SUS write
//   4. dedup (same author x2)    -> exactly ONE cadence call
//   5. feature OFF               -> ZERO calls
//   6. HI-1 sacred               -> only modUserCadence + modSusMark, never a ban path
//   7. reason <= 200 chars
//   8. _firehoseState.screened increments per hit
//   9. _newAccountCache warmed (new AND old)
//  10. garbage/empty posts       -> no throw, no calls
//  11. cadence rpc !ok           -> no SUS write, no crash
import { readFileSync } from 'node:fs';

const realSetTimeout = setTimeout;
const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

// --- slice the REAL slop scorer ---
const si = SRC.indexOf('function scorePostQualityText(title){');
const sj = SRC.indexOf('\n  function buildActionStrip(item){', si);
// --- slice the REAL first-post screening block ---
const fi = SRC.indexOf('const _fpScreenCache = new Map();');
const fj = SRC.indexOf('try { window._gamFirstPostScreenTick = firstPostScreenTick; }');
if (si < 0 || sj < 0 || fi < 0 || fj < 0) {
  console.error('FATAL: source markers not found', { si, sj, fi, fj });
  process.exit(2);
}
const scoreSrc = SRC.slice(si, sj);
const screenSrc = SRC.slice(fi, fj);

const scorePostQualityText = new Function(scoreSrc + '\n return scorePostQualityText;')();
const factory = new Function(
  'getSetting', 'scorePostQualityText', 'rpcCall', '_newAccountCache',
  '_firehoseState', 'firehoseRefreshPanel', '_susRefresh', 'setTimeout', 'console',
  screenSrc +
  '\nreturn { firstPostScreenTick: firstPostScreenTick,' +
  ' getInflight: function(){ return _fpScreenInflight; },' +
  ' getCacheSize: function(){ return _fpScreenCache.size; } };'
);

function makeEnv(opts) {
  opts = opts || {};
  const profiles = opts.profiles || {};
  const calls = { rpc: [], susMark: [] };
  const _newAccountCache = new Map();
  const _firehoseState = { screened: 0 };
  const rpcCall = async (name, args) => {
    calls.rpc.push({ name, args });
    if (name === 'modUserCadence') {
      if (opts.cadenceFail) return { ok: false, status: 0, error: 'forced' };
      const u = String(args.username).toLowerCase();
      const prof = profiles[u];
      return { ok: true, data: prof || { is_new_account: false, account_age_days: 999 } };
    }
    if (name === 'modSusMark') { calls.susMark.push(args); return { ok: true }; }
    return { ok: false, error: 'unregistered:' + name };
  };
  const getSetting = (k, d) => (k === 'firstPostScreen' ? (opts.enabled !== false) : d);
  const fastST = (fn, ms) => realSetTimeout(fn, Math.min(ms || 0, 1));
  const noop = () => {};
  const env = factory(getSetting, scorePostQualityText, rpcCall, _newAccountCache,
    _firehoseState, noop, noop, fastST, console);
  return { env, calls, _newAccountCache, _firehoseState };
}

async function drain(h) {
  for (let k = 0; k < 1000 && h.env.getInflight() > 0; k++) {
    await new Promise(r => realSetTimeout(r, 1));
  }
}

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

const SLOP_NEW = '\u{1F621}\u{1F621}\u{1F621}\u{1F621}\u{1F621}\u{1F621}\u{1F621}\u{1F621} wake up now'; // 8-emoji wall
const SLOP_2   = 'share!!!!!! now!!!!!!';                                                              // 12 marks
const SLOP_3   = '\u{1F6A8}\u{1F6A8}\u{1F6A8}\u{1F6A8}\u{1F6A8} ALERT \u{1F6A8}\u{1F6A8}\u{1F6A8}';     // 8-emoji wall
const LEGIT    = 'Trump announces new economic plan for 2026';

(async () => {
  console.log('=== first-post screening (new-account + slop -> SUS, no deploy) ===');

  // 1. non-slop title -> zero calls
  {
    const h = makeEnv({ profiles: { alice: { is_new_account: true, account_age_days: 1 } } });
    await h.env.firstPostScreenTick([{ author: 'alice', title: LEGIT }]);
    await drain(h);
    ck('legit title makes ZERO network calls (cheap gate)', h.calls.rpc.length === 0);
  }

  // 2. slop + new -> modSusMark w/ correct reason
  {
    const h = makeEnv({ profiles: { bot1: { is_new_account: true, account_age_days: 2, cadence_label: 'BURSTING' } } });
    await h.env.firstPostScreenTick([{ author: 'bot1', title: SLOP_NEW }]);
    await drain(h);
    const cad = h.calls.rpc.filter(c => c.name === 'modUserCadence');
    const sus = h.calls.susMark;
    ck('slop+new: one cadence check', cad.length === 1 && cad[0].args.username === 'bot1');
    ck('slop+new: SUS write fired for the author', sus.length === 1 && sus[0].username === 'bot1');
    ck('slop+new: reason tagged NEW first-post slop', !!sus[0] && /^NEW first-post slop:/.test(sus[0].reason));
    ck('slop+new: reason carries age', !!sus[0] && /\b2d\b/.test(sus[0].reason));
    ck('slop+new: reason carries cadence label', !!sus[0] && /BURSTING/.test(sus[0].reason));
    ck('slop+new: reason <= 200 chars', !!sus[0] && sus[0].reason.length <= 200);
    ck('slop+new: screened counter incremented', h._firehoseState.screened === 1);
    ck('slop+new: _newAccountCache warmed (is_new=true)', h._newAccountCache.get('bot1')?.is_new === true);
    // HI-1: only the two safe routes, never a ban path
    const names = h.calls.rpc.map(c => c.name);
    ck('HI-1: only modUserCadence + modSusMark used', names.every(n => n === 'modUserCadence' || n === 'modSusMark'));
    ck('HI-1: no ban/remove/delete route touched', !names.some(n => /ban|remove|delete|kick/i.test(n)));
  }

  // 3. slop + OLD account -> cadence checked, NO SUS write
  {
    const h = makeEnv({ profiles: { old1: { is_new_account: false, account_age_days: 300 } } });
    await h.env.firstPostScreenTick([{ author: 'old1', title: SLOP_2 }]);
    await drain(h);
    ck('slop+old: cadence checked', h.calls.rpc.some(c => c.name === 'modUserCadence'));
    ck('slop+old: NO SUS write', h.calls.susMark.length === 0);
    ck('slop+old: screened NOT incremented', h._firehoseState.screened === 0);
    ck('slop+old: _newAccountCache warmed (is_new=false)', h._newAccountCache.get('old1')?.is_new === false);
  }

  // 4. dedup -> same author twice in one tick = ONE cadence call
  {
    const h = makeEnv({ profiles: { dup: { is_new_account: true, account_age_days: 1 } } });
    await h.env.firstPostScreenTick([
      { author: 'dup', title: SLOP_3 },
      { author: 'dup', title: SLOP_2 },
    ]);
    await drain(h);
    const cad = h.calls.rpc.filter(c => c.name === 'modUserCadence');
    ck('dedup: repeated author -> exactly one cadence call', cad.length === 1);
    ck('dedup: repeated author -> at most one SUS write', h.calls.susMark.length <= 1);
  }

  // 5. feature OFF -> nothing
  {
    const h = makeEnv({ enabled: false, profiles: { bot1: { is_new_account: true, account_age_days: 1 } } });
    await h.env.firstPostScreenTick([{ author: 'bot1', title: SLOP_NEW }]);
    await drain(h);
    ck('feature OFF: zero calls', h.calls.rpc.length === 0);
  }

  // 6. multi-hit -> screened counts each distinct new+slop author
  {
    const h = makeEnv({ profiles: {
      n1: { is_new_account: true, account_age_days: 1 },
      n2: { is_new_account: true, account_age_days: 3 },
    } });
    await h.env.firstPostScreenTick([
      { author: 'n1', title: SLOP_NEW },
      { author: 'n2', title: SLOP_3 },
    ]);
    await drain(h);
    ck('multi-hit: screened === 2', h._firehoseState.screened === 2);
    ck('multi-hit: two SUS writes', h.calls.susMark.length === 2);
  }

  // 7. garbage/empty posts -> no throw, no calls
  {
    const h = makeEnv({});
    let threw = false;
    try {
      await h.env.firstPostScreenTick([null, { author: 'x' }, { title: 'y' }, {}, undefined]);
      await h.env.firstPostScreenTick([]);
      await h.env.firstPostScreenTick(null);
      await drain(h);
    } catch (_) { threw = true; }
    ck('garbage posts: no throw', threw === false);
    ck('garbage posts: zero calls', h.calls.rpc.length === 0);
  }

  // 8. cadence rpc returns !ok -> no SUS write, no crash
  {
    const h = makeEnv({ cadenceFail: true });
    let threw = false;
    try {
      await h.env.firstPostScreenTick([{ author: 'mystery', title: SLOP_NEW }]);
      await drain(h);
    } catch (_) { threw = true; }
    ck('cadence !ok: no throw', threw === false);
    ck('cadence !ok: cadence attempted', h.calls.rpc.some(c => c.name === 'modUserCadence'));
    ck('cadence !ok: NO SUS write', h.calls.susMark.length === 0);
  }

  console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail === 0 ? 0 : 1);
})();

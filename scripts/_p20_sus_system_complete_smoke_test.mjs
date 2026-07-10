// _p20_sus_system_complete_smoke_test.mjs
// v10.42.0 SUS-COMPLETE: verifies the SUS user-rating system satisfies the
// operator requirement END-TO-END:
//   "all mods can quickly click on a username and mark them as 'sus' and all
//    other mods can see the updated status as to the intelligence on that user."
//
// This is the acceptance test for the whole requirement, complementing _p13
// (which covers the v10.37.0 decorator/tint/helper internals). It asserts the
// four load-bearing legs:
//   1. CLICK-USERNAME -> SUS in <=2 clicks via the pinned tooltip: the tooltip
//      builds the styled SUS_REASONS picker (never a native prompt on the common
//      path) and routes through _gamMarkSusFromStrip -> modSusMark {username,reason}.
//   2. CROSS-MOD VISIBILITY: _susRefresh fetches modSusList (the cloud list, all
//      mods' flags) and populates _susState so decorations render for OTHER mods'
//      flags; the poll is armed at boot + interval + visibilitychange.
//   3. STATUS/INTEL: hover title carries WHO + WHY (+ WHEN when the row has a ts);
//      triage rows show a SUS badge; the Intel Drawer surfaces a SUS banner.
//   4. HI-1 (SACRED): every SUS write path calls ONLY modSusMark/modSusClear --
//      never executeBan / addToDeathRow / apiBan. Static scan of the real bodies.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');
const BG  = readFileSync(new URL('../background.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}
// Slice a brace-balanced region starting at `startIdx` (which must point at the
// first '{' at/after it). Used to isolate a single function body for scanning.
function sliceBalanced(src, startIdx) {
  const open = src.indexOf('{', startIdx);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  return src.slice(startIdx);
}

console.log('=== P20: SUS user-rating COMPLETE -- click-username -> all-mods-see (v10.42.0) ===');

// ---------------------------------------------------------------------------
// LEG 1: click a username -> pinned tooltip -> Mark SUS -> styled reason picker
//        -> _gamMarkSusFromStrip -> modSusMark. <=2 clicks, no native prompt on
//        the common path.
// ---------------------------------------------------------------------------
const pinStart = SRC.indexOf('function pinTooltip(username){');
ck('pinTooltip(username) exists (the click-a-username entry point)', pinStart > 0);
const pinBody = sliceBalanced(SRC, pinStart);
ck('LEG1: tooltip renders a "Mark SUS" control', /data-pin-act="sus"/.test(pinBody) && /Mark SUS/.test(pinBody));
ck('LEG1: tooltip SUS click builds the styled SUS_REASONS picker (not a native prompt on the common path)',
  /SUS_REASONS\.forEach/.test(pinBody) && /gam-strip-menu/.test(pinBody));
ck('LEG1: each preset routes through the shared _gamMarkSusFromStrip helper',
  /_gamMarkSusFromStrip\(username, reasonStr\)/.test(pinBody));
ck('LEG1: native prompt() is only the rare "Custom..." fallback, never the preset path',
  // Count real invocations only (a `prompt(` immediately followed by an arg),
  // excluding the code comment that mentions "prompt()" with empty parens.
  (pinBody.match(/prompt\(\s*[`'"]/g) || []).length === 1 && /Custom\.\.\./.test(pinBody));
ck('LEG1: already-SUS tooltip path clears via the shared helper',
  /_gamClearSusFromStrip\(username\)/.test(pinBody));

// The helper itself must POST modSusMark with {username, reason}.
const markStart = SRC.indexOf('async function _gamMarkSusFromStrip(username, reason){');
ck('_gamMarkSusFromStrip exists', markStart > 0);
const markBody = sliceBalanced(SRC, markStart);
ck('LEG1: _gamMarkSusFromStrip sends the modSusMark RPC with username+reason',
  /name:\s*'modSusMark'/.test(markBody) && /username/.test(markBody) && /reason/.test(markBody));

// Behavioral: exercise the real _gamMarkSusFromStrip body to prove it posts
// modSusMark with the exact {username, reason} and updates _susState on success.
{
  const clearStart2 = SRC.indexOf('async function _gamClearSusFromStrip(username){');
  const markFnSrc = SRC.slice(markStart, clearStart2);
  const calls = [];
  const chrome = { runtime: { sendMessage: async (m) => { calls.push(m); return { ok: true, data: { row: { username: m.args.username, reason: m.args.reason, marked_by: '(you)', comment_count_24h: 0 } } }; } } };
  const _susState = { rows: new Map() };
  const fn = new Function('chrome', '_susState', 'snack', '__makeReqId', '_susApplyDecorations', 'window', 'CustomEvent',
    markFnSrc + '\n return _gamMarkSusFromStrip;'
  )(chrome, _susState, () => {}, () => 'req', () => {}, { dispatchEvent(){} }, class { constructor(t){ this.type = t; } });
  await fn('suspect1', '[shill] manufactured doubt');
  ck('LEG1 behavior: modSusMark posted with {username, reason}',
    calls.length === 1 && calls[0].name === 'modSusMark' && calls[0].args.username === 'suspect1' && calls[0].args.reason === '[shill] manufactured doubt');
  ck('LEG1 behavior: local _susState updated on success (instant feedback)', _susState.rows.has('suspect1'));
}

// ---------------------------------------------------------------------------
// LEG 2: cross-mod visibility. _susRefresh reads modSusList (the cloud list of
//        ALL mods' flags) and populates _susState; poll armed at boot + 60s +
//        visibilitychange.
// ---------------------------------------------------------------------------
const refreshStart = SRC.indexOf('async function _susRefresh(){');
ck('_susRefresh exists', refreshStart > 0);
const refreshBody = sliceBalanced(SRC, refreshStart);
ck('LEG2: _susRefresh fetches the cloud list via modSusList RPC', /name:\s*'modSusList'/.test(refreshBody));
ck('LEG2: _susRefresh populates _susState.rows from EVERY returned row (any mod, not just self)',
  /_susState\.rows\.clear\(\)/.test(refreshBody) && /for \(const row of rows\)/.test(refreshBody) && /_susState\.rows\.set/.test(refreshBody));
ck('LEG2: refresh re-applies decorations so other mods\' flags render immediately',
  /_susApplyDecorations\(true\)/.test(refreshBody));
ck('LEG2: poll armed at boot (scheduleIdle) + 60s interval + visibilitychange',
  /scheduleIdle\(_susRefresh/.test(SRC) && /setInterval\(\(\)=>\{ if \(document\.visibilityState === 'visible'\) _susRefresh\(\);/.test(SRC) && /visibilitychange'.*_susRefresh/.test(SRC.replace(/\r?\n/g, ' ')));

// Behavioral: run the real _susRefresh body against a stubbed modSusList
// returning two OTHER mods' flags; assert both land in _susState.
{
  const rows = [
    { username: 'Alpha', reason: '[evasion] ban dodge', marked_by: 'ModA', comment_count_24h: 3 },
    { username: 'Bravo', reason: '[spam] self-promo', marked_by: 'ModB', comment_count_24h: 12 },
  ];
  const chrome = { runtime: { sendMessage: async (m) => (m.name === 'modSusList' ? { ok: true, data: { rows } } : { ok: false }) } };
  const _susState = { rows: new Map(), lastFetchedAt: 0 };
  let decorated = 0;
  const fn = new Function('chrome', '_susState', '_susApplyDecorations',
    refreshBody + '\n return _susRefresh;'
  )(chrome, _susState, () => { decorated++; });
  await fn();
  ck('LEG2 behavior: both OTHER mods\' flags populate _susState', _susState.rows.has('alpha') && _susState.rows.has('bravo'));
  ck('LEG2 behavior: decorations applied after cross-mod fetch', decorated >= 1);
  ck('LEG2 behavior: the flagging mod name is preserved for the hover intel', _susState.rows.get('bravo').marked_by === 'ModB');
}

// ---------------------------------------------------------------------------
// LEG 3: status / intelligence visibility beyond the subtle tint.
// ---------------------------------------------------------------------------
// 3a. hover title = WHO + WHY (+ WHEN)
ck('LEG3: full-doc decorator hover title carries WHO (marked_by) + WHY (reason)',
  /a\.title = '\\u\{1F6A9\} SUS by ' \+ \(row\.marked_by \|\| '\?'\) \+ ': ' \+ reason/.test(SRC));
ck('LEG3: hover title enriched with WHEN when the row has a timestamp (full-doc path)',
  /_susWhenLabel\(row\)/.test(SRC) && /function _susWhenLabel\(row\)/.test(SRC));
ck('LEG3: per-anchor decorator (_susDecorateOne) also emits WHO + WHY + self-contained WHEN',
  /var _when = '';/.test(SRC) && /a\.title = '\\u\{1F6A9\} SUS by ' \+ \(row\.marked_by \|\| '\?'\) \+ ': ' \+ reason \+ _when/.test(SRC));

// 3b. triage-row SUS badge
ck('LEG3: buildUserRecord surfaces the SUS row on triage users (u.sus)',
  /const susRow = \(typeof _susState === 'object'/.test(SRC) && /sus: susRow \|\| null,/.test(SRC));
ck('LEG3: triage row renders a SUS badge with WHO+WHY on hover',
  /gam-t-badge-sus/.test(SRC) && /if \(u\.sus\) \{/.test(SRC) && /\\u\{1F6A9\} SUS/.test(SRC));
ck('LEG3: SUS badge has its own CSS (amber default, danger when hot)',
  /\.gam-t-badge-sus\{/.test(SRC) && /\.gam-t-badge-sus-hot\{/.test(SRC));

// 3c. Intel Drawer SUS banner
{
  const drawerStart = SRC.indexOf('async function buildUserSections(opts, signal) {');
  ck('buildUserSections (User drawer adapter) exists', drawerStart > 0);
  const drawerBody = sliceBalanced(SRC, drawerStart);
  ck('LEG3: Intel Drawer surfaces a SUS banner (reads _susState for this user)',
    /_susState\.rows\)\s*\n?\s*\?\s*_susState\.rows\.get\(String\(id\)\.toLowerCase\(\)\)/.test(drawerBody.replace(/\r/g, '')) || /_susState\.rows\.get\(String\(id\)\.toLowerCase\(\)\)/.test(drawerBody));
  ck('LEG3: drawer SUS banner shows the 🚩 SUS marker + WHO + WHY',
    /\\u\{1F6A9\} SUS/.test(drawerBody) && /_susBy/.test(drawerBody) && /_susReason/.test(drawerBody));
}

// ---------------------------------------------------------------------------
// LEG 4: HI-1 SACRED INVARIANT -- every SUS write path is intelligence-only.
//        Static scan of the REAL bodies: none may reference a ban/DR RPC.
// ---------------------------------------------------------------------------
{
  const clearStart = SRC.indexOf('async function _gamClearSusFromStrip(username){');
  const clearBody = sliceBalanced(SRC, clearStart);
  const banPat = /executeBan\s*\(|addToDeathRow\s*\(|apiBan\s*\(|modAddDeathRow|modBan\b/;
  ck('HI-1: _gamMarkSusFromStrip never calls a ban/DR path', !banPat.test(markBody));
  ck('HI-1: _gamClearSusFromStrip never calls a ban/DR path', !banPat.test(clearBody));
  ck('HI-1: tooltip SUS handler (pinTooltip sus branch) marks/clears only -- no ban/DR',
    // The pinTooltip body DOES contain a separate 'dr' branch (a distinct button);
    // scope the assertion to the 'sus' action handler by slicing between markers.
    (() => {
      const susBranch = pinBody.slice(pinBody.indexOf("act === 'sus'"));
      const stop = susBranch.search(/\n\s{6}\}\s*\n\s{4}\}\);/); // end of the sus else-if block
      const scoped = stop > 0 ? susBranch.slice(0, stop) : susBranch;
      return !banPat.test(scoped);
    })());
  ck('HI-1: modSusMark handler (background.js) hits ONLY /mod/user/sus -- never a ban route',
    (() => {
      const h = BG.indexOf('modSusMark:');
      const body = sliceBalanced(BG, h);
      return /\/mod\/user\/sus/.test(body) && !/\/ban|executeBan|addToDeathRow|deathrow/i.test(body);
    })());
  ck('HI-1: the new triage-badge + drawer-banner render code is read-only (no ban/DR calls)',
    (() => {
      // triage badge region
      const t0 = SRC.indexOf('if (u.sus) {');
      const tBody = SRC.slice(t0, t0 + 700);
      // drawer banner region
      const d0 = SRC.indexOf('var _susRow = (typeof _susState');
      const dBody = SRC.slice(d0, d0 + 1600);
      return !banPat.test(tBody) && !banPat.test(dBody);
    })());
}

// ---------------------------------------------------------------------------
// Version gate.
// ---------------------------------------------------------------------------
{
  const mani = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  const [maj, min] = mani.version.split('.').map(Number);
  ck('manifest version >= 10.42.0', maj > 10 || (maj === 10 && min >= 42));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

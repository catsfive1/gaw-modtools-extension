// _p13_sus_rating_smoke_test.mjs
// v10.37.0 SUS-RATING: one-click flag + reason dropdown + subtle comment/
// username tint. ~80% of this feature already existed (modSusMark/
// modSusList/modSusClear, _susState, the twin decorators, buildActionStrip's
// dropdown idiom) -- this build made it visible + one-click, no new backend.
//
// Slices the REAL _susDecorateOne (per-anchor decorator) and the two new
// shared helpers _gamMarkSusFromStrip/_gamClearSusFromStrip verbatim from
// modtools.js and behaviorally exercises them with stubbed chrome.runtime /
// _susState / DOM. Also carries a static-guard: no new SUS code references
// executeBan/addToDeathRow (HI-1 -- the SUS list never bans).
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P13: SUS user-rating -- tint / reason dropdown / one-click flag (v10.37.0) ===');

// ---------------------------------------------------------------------------
// Slice _susDecorateOne verbatim (var-based per-anchor decorator).
// ---------------------------------------------------------------------------
const decStart = SRC.indexOf('function _susDecorateOne(a){');
if (decStart < 0) { console.error('FATAL: _susDecorateOne not found'); process.exit(2); }
const decEndMarker = SRC.indexOf('  try {\r\n    // v10.12.1 PB.3: single consolidated MutationObserver', decStart);
if (decEndMarker < 0) { console.error('FATAL: _susDecorateOne end marker not found'); process.exit(2); }
const decFnSrc = SRC.slice(decStart, decEndMarker);

ck('_susDecorateOne slice captured (non-trivial length)', decFnSrc.length > 500);
ck('_susDecorateOne contains the container class-stamp', decFnSrc.includes("classList.add('gam-sus-comment')"));
ck('_susDecorateOne contains the hot toggle', decFnSrc.includes("classList.toggle('gam-sus-comment-hot', isHot)"));
ck('_susDecorateOne contains the teardown (strip only if no other sus anchor remains)',
  decFnSrc.includes("querySelector('a[href^=\"/u/\"][data-gam-sus-decorated]')"));
ck('_susDecorateOne teardown does not unconditionally return (isNew continuation preserved)',
  /if \(!isNew\) return;/.test(decFnSrc));

function makeAnchor({ href, decorated = false, textContent = 'someuser', box = null } = {}) {
  const attrs = {};
  if (decorated) attrs['data-gam-sus-decorated'] = '1';
  return {
    _attrs: attrs,
    style: {},
    title: '',
    textContent,
    getAttribute(k) { return this._attrs[k] != null ? this._attrs[k] : (k === 'href' ? href : null); },
    setAttribute(k, v) { this._attrs[k] = v; },
    removeAttribute(k) { delete this._attrs[k]; },
    hasAttribute(k) { return this._attrs[k] != null; },
    closest(sel) { return sel === '.comment, .post' ? box : null; },
  };
}

function makeBox() {
  const classes = new Set();
  const decoratedAnchors = [];
  return {
    _decoratedAnchors: decoratedAnchors,
    attrs: {},
    classList: {
      add(c) { classes.add(c); },
      remove(...cs) { cs.forEach(c => classes.delete(c)); },
      toggle(c, on) { if (on) classes.add(c); else classes.delete(c); },
      has(c) { return classes.has(c); },
      contains(c) { return classes.has(c); },
    },
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; },
    // querySelector used by the teardown to check for OTHER remaining sus anchors
    querySelector(sel) {
      if (sel === 'a[href^="/u/"][data-gam-sus-decorated]') {
        return decoratedAnchors.find(a => a.hasAttribute('data-gam-sus-decorated')) || null;
      }
      return null;
    },
  };
}

function runDecorateOne(a, { rows = new Map(), newAccounts = new Map(), getSettingImpl } = {}) {
  const C = { WARN: '#f0a040' };
  const _susState = { rows };
  const _newAccountCache = newAccounts;
  const getSetting = getSettingImpl || ((k, fb) => fb);
  const fn = new Function(
    'C', '_susState', '_newAccountCache', 'getSetting',
    decFnSrc + '\n return _susDecorateOne;'
  )(C, _susState, _newAccountCache, getSetting);
  fn(a);
}

// --- behavior: sus user -> .gam-sus-comment added ---
{
  const box = makeBox();
  const a = makeAnchor({ href: '/u/alice', box });
  box._decoratedAnchors.push(a);
  const rows = new Map([['alice', { username: 'alice', reason: '[watch] pattern forming', marked_by: 'ModX', comment_count_24h: 2 }]]);
  runDecorateOne(a, { rows });
  ck('sus user: container gets .gam-sus-comment', box.classList.has('gam-sus-comment'));
  ck('sus user: container does NOT get -hot (not hot)', !box.classList.has('gam-sus-comment-hot'));
  ck('sus user: aria-label set with marked_by + reason', box.attrs['aria-label'] === 'Flagged SUS by ModX: [watch] pattern forming');
  ck('sus user: anchor gets data-gam-sus-decorated', a.hasAttribute('data-gam-sus-decorated'));
}

// --- behavior: hot user (>8/24h) -> -hot class ---
{
  const box = makeBox();
  const a = makeAnchor({ href: '/u/bob', box });
  box._decoratedAnchors.push(a);
  const rows = new Map([['bob', { username: 'bob', reason: '[spam] self-promo', marked_by: 'ModY', comment_count_24h: 12 }]]);
  runDecorateOne(a, { rows });
  ck('hot user: container gets .gam-sus-comment', box.classList.has('gam-sus-comment'));
  ck('hot user: container gets .gam-sus-comment-hot', box.classList.has('gam-sus-comment-hot'));
}

// --- behavior: susTint OFF -> no container stamp at all ---
{
  const box = makeBox();
  const a = makeAnchor({ href: '/u/carol', box });
  box._decoratedAnchors.push(a);
  const rows = new Map([['carol', { username: 'carol', reason: '', marked_by: 'ModZ', comment_count_24h: 1 }]]);
  runDecorateOne(a, { rows, getSettingImpl: (k, fb) => (k === 'susTint' ? false : fb) });
  ck('susTint OFF: container gets NO tint class', !box.classList.has('gam-sus-comment') && !box.classList.has('gam-sus-comment-hot'));
  ck('susTint OFF: anchor is still decorated (glyph/color unaffected)', a.hasAttribute('data-gam-sus-decorated'));
}

// --- behavior: clearing SUS removes the class only when NO other sus anchor remains ---
{
  const box = makeBox();
  const a = makeAnchor({ href: '/u/dave', decorated: true, box });
  box._decoratedAnchors.push(a);
  box.classList.add('gam-sus-comment');
  // no row anymore (cleared) -> decorate-branch strips it
  runDecorateOne(a, { rows: new Map() });
  ck('clear: sole sus anchor removed -> container tint stripped', !box.classList.has('gam-sus-comment'));
  ck('clear: aria-label removed', box.attrs['aria-label'] === undefined);
}

// --- behavior: a comment quoting a SECOND sus user keeps the tint after one clears ---
{
  const box = makeBox();
  const cleared = makeAnchor({ href: '/u/eve', decorated: true, box });
  const stillSus = makeAnchor({ href: '/u/frank', decorated: true, box });
  box._decoratedAnchors.push(cleared, stillSus); // 'frank' still has data-gam-sus-decorated
  box.classList.add('gam-sus-comment');
  runDecorateOne(cleared, { rows: new Map() }); // eve was cleared; frank's row untouched
  ck('multi-user comment: tint NOT stripped while another sus anchor remains', box.classList.has('gam-sus-comment'));
}

// ---------------------------------------------------------------------------
// Slice the shared async helpers verbatim.
// ---------------------------------------------------------------------------
const markStart = SRC.indexOf('async function _gamMarkSusFromStrip(username, reason){');
const clearStart = SRC.indexOf('async function _gamClearSusFromStrip(username){');
if (markStart < 0 || clearStart < 0) { console.error('FATAL: shared helper markers not found'); process.exit(2); }
const clearEndMarker = SRC.indexOf('  // v5.1.2 / v9.3.3 (P1-1): boundary-aware positioning.', clearStart);
if (clearEndMarker < 0) { console.error('FATAL: _gamClearSusFromStrip end marker not found'); process.exit(2); }
const markFnSrc = SRC.slice(markStart, clearStart);
const clearFnSrc = SRC.slice(clearStart, clearEndMarker);

ck('_gamMarkSusFromStrip is declared async', /^async function _gamMarkSusFromStrip/.test(markFnSrc.trim()));
ck('_gamClearSusFromStrip is declared async', /^async function _gamClearSusFromStrip/.test(clearFnSrc.trim()));

function makeRuntime(response) {
  const calls = [];
  return {
    calls,
    sendMessage: async (msg) => { calls.push(msg); return response; },
  };
}

async function runMark(username, reason, response) {
  const chrome = { runtime: makeRuntime(response) };
  const _susState = { rows: new Map() };
  const snackCalls = [];
  const snack = (msg, type) => snackCalls.push({ msg, type });
  const __makeReqId = () => 'req-1';
  const _susApplyDecorations = () => {};
  const dispatched = [];
  const window = { dispatchEvent: (e) => dispatched.push(e) };
  const fn = new Function(
    'chrome', '_susState', 'snack', '__makeReqId', '_susApplyDecorations', 'window', 'CustomEvent',
    markFnSrc + '\n return _gamMarkSusFromStrip;'
  )(chrome, _susState, snack, __makeReqId, _susApplyDecorations, window, class CustomEvent { constructor(t){ this.type = t; } });
  const r = await fn(username, reason);
  return { r, calls: chrome.runtime.calls, _susState, snackCalls, dispatched };
}

async function runClear(username, response) {
  const chrome = { runtime: makeRuntime(response) };
  const _susState = { rows: new Map([[username.toLowerCase(), { username, reason: 'x', marked_by: 'Y', comment_count_24h: 0 }]]) };
  const snackCalls = [];
  const snack = (msg, type) => snackCalls.push({ msg, type });
  const __makeReqId = () => 'req-2';
  const _susApplyDecorations = () => {};
  const dispatched = [];
  const window = { dispatchEvent: (e) => dispatched.push(e) };
  const fn = new Function(
    'chrome', '_susState', 'snack', '__makeReqId', '_susApplyDecorations', 'window', 'CustomEvent',
    clearFnSrc + '\n return _gamClearSusFromStrip;'
  )(chrome, _susState, snack, __makeReqId, _susApplyDecorations, window, class CustomEvent { constructor(t){ this.type = t; } });
  const r = await fn(username);
  return { r, calls: chrome.runtime.calls, _susState, snackCalls, dispatched };
}

// --- behavior: mark posts modSusMark with the exact reason string ---
{
  const { calls, _susState, snackCalls, dispatched } = await runMark('alice', '[shill] Concern troll / manufactured doubt',
    { ok: true, data: { row: { username: 'alice', reason: '[shill] Concern troll / manufactured doubt', marked_by: '(you)', comment_count_24h: 0 } } });
  ck('mark: posts modSusMark RPC', calls.length === 1 && calls[0].name === 'modSusMark');
  ck('mark: reason passed verbatim', calls[0].args.reason === '[shill] Concern troll / manufactured doubt');
  ck('mark: username passed', calls[0].args.username === 'alice');
  ck('mark: local _susState updated on success', _susState.rows.has('alice'));
  ck('mark: success snack fired', snackCalls.some(s => s.type === 'success'));
  ck('mark: gam-roster-change dispatched on window', dispatched.some(e => e.type === 'gam-roster-change'));
}

// --- behavior: mark with empty/optional reason still succeeds ---
{
  const { calls, r } = await runMark('bob', '', { ok: true, data: { row: { username: 'bob', reason: '', marked_by: '(you)', comment_count_24h: 0 } } });
  ck('mark: empty reason still sends (optional reason preserved)', calls[0].args.reason === '');
  ck('mark: empty-reason mark still reports ok', r.ok === true);
}

// --- behavior: mark failure does not touch _susState, surfaces error snack ---
{
  const { _susState, snackCalls } = await runMark('carol', '[spam] x', { ok: false, status: 500 });
  ck('mark failure: _susState NOT updated', !_susState.rows.has('carol'));
  ck('mark failure: error snack fired', snackCalls.some(s => s.type === 'error'));
}

// --- behavior: clear posts modSusClear and removes from local state ---
{
  const { calls, _susState, snackCalls, dispatched } = await runClear('dave', { ok: true });
  ck('clear: posts modSusClear RPC', calls.length === 1 && calls[0].name === 'modSusClear');
  ck('clear: username passed', calls[0].args.username === 'dave');
  ck('clear: local _susState row removed on success', !_susState.rows.has('dave'));
  ck('clear: success snack fired', snackCalls.some(s => s.type === 'success'));
  ck('clear: gam-roster-change dispatched on window', dispatched.some(e => e.type === 'gam-roster-change'));
}

// ---------------------------------------------------------------------------
// HI-1 static guard: no new SUS code references executeBan/addToDeathRow.
// ---------------------------------------------------------------------------
{
  const newSusRegionMarkers = [markFnSrc, clearFnSrc, decFnSrc];
  const violatesHi1 = newSusRegionMarkers.some(src => /executeBan\s*\(|addToDeathRow\s*\(/.test(src));
  ck('HI-1: new SUS helper/decorator code never calls executeBan or addToDeathRow', !violatesHi1);
}

// --- SUS_REASONS: presets exist, ASCII-clean, capped-safe, includes Custom fallback expectation ---
{
  const reasonsStart = SRC.indexOf('const SUS_REASONS = [');
  const reasonsEnd = SRC.indexOf('];', reasonsStart) + 2;
  ck('SUS_REASONS const defined near VIOLATIONS', reasonsStart > 0);
  const reasonsSrc = SRC.slice(reasonsStart, reasonsEnd);
  const SUS_REASONS = new Function(reasonsSrc + '\n return SUS_REASONS;')();
  ck('SUS_REASONS has 9 presets', Array.isArray(SUS_REASONS) && SUS_REASONS.length === 9);
  ck('SUS_REASONS entries are all <= 200 chars (schema cap)', SUS_REASONS.every(s => s.length <= 200));
  ck('SUS_REASONS entries carry a leading [tag]', SUS_REASONS.every(s => /^\[[a-z-]+\]\s/.test(s)));
  ck('SUS_REASONS includes [watch] and [evasion] (display strings only, never routed to ban)',
    SUS_REASONS.some(s => s.startsWith('[watch]')) && SUS_REASONS.some(s => s.startsWith('[evasion]')));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

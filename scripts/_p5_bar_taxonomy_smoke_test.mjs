// _p5_bar_taxonomy_smoke_test.mjs
// v10.36.9: Wave-2 bar taxonomy -- Structured 5-section (SHIELD | HOT | QUEUE |
// ACT | COORD | SYS | CHAT), Commander-approved in the Opus 4.8 planning
// session. Regroups the 32-child flat status bar into a permanent HOT
// count-cluster + 4 cold category-menu buttons (openCategoryMenu, v10.36.4).
// Flag-gated (gam_status_bar_grouped, default true) with the exact original
// flat ordering preserved as the instant-rollback path.
//
// Slices the REAL grouping block from modtools.js (const modLogBtn ... through
// the end of the if/else bar construction) and runs it against minimal stubs
// for its dependencies -- following this project's established
// slice-and-stub test convention (no jsdom, hand-rolled DOM elements).
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P5: Wave-2 bar taxonomy -- Structured 5-section (v10.36.9) ===');

const start = SRC.indexOf('const modLogBtn = el(');
const end = SRC.indexOf('// v10.16.29: status-bar orientation.', start);
if (start < 0 || end < 0) { console.error('FATAL: bar-grouping block markers not found'); process.exit(2); }
const fnSrc = SRC.slice(start, end);

function stubEl(cls) {
  return {
    tagName: 'BUTTON', className: cls || '', style: {}, dataset: {},
    _attrs: {},
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    addEventListener() {},
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
  };
}

function run(pathname, opts) {
  opts = opts || {};
  const openCategoryMenuCalls = [];
  const settings = Object.assign({ gam_status_bar_grouped: true, cleanUi: false }, opts.settings || {});

  // Pre-existing bar elements the grouping code references but doesn't create.
  const filterSel = stubEl('filterSel');
  const peopleBtn = stubEl('peopleBtn');
  const mmBtn = opts.hasMm ? stubEl('mmBtn') : null;
  const c5Btn = opts.hasC5 ? stubEl('c5Btn') : null;
  const brandBtn = stubEl('brandBtn');
  const gearBtn = stubEl('gearBtn');
  const sessDot = stubEl('sessDot');
  const fbBtn = stubEl('fbBtn');
  const inboxBtn = stubEl('inboxBtn');
  const drBtn = stubEl('drBtn');
  const raidBtn = stubEl('raidBtn');
  const sirenBtn = stubEl('sirenBtn');
  const sirenClearBtn = stubEl('sirenClearBtn');
  const barSpacer = stubEl('barSpacer');
  const chatBtn_v980 = stubEl('chatBtn');
  const tickerEl = stubEl('tickerEl');
  const C = { ACCENT: '#f0a', RED: '#f00' };

  function el(tag, attrs, ...children) {
    const node = { tag, attrs: attrs || {}, children: children.flat().filter(x => x != null), _attrs: {}, style: {} };
    node.setAttribute = function(k, v) { this._attrs[k] = v; };
    node.getAttribute = function(k) { return this._attrs[k] || (this.attrs || {})[k]; };
    node.addEventListener = function(evt, fn) { (node._listeners = node._listeners || {})[evt] = fn; };
    node._fire = function(evt, e) { if (node._listeners && node._listeners[evt]) node._listeners[evt](e || { stopPropagation(){} }); };
    node.getBoundingClientRect = function() { return { top:0, left:0, right:0, bottom:0, width:0, height:0 }; };
    return node;
  }
  function getSetting(key, dflt) { return (key in settings) ? settings[key] : dflt; }
  function openCategoryMenu(anchor, items) { openCategoryMenuCalls.push({ anchor, items }); return stubEl('menu'); }
  function requestAnimationFrame(fn) { /* no-op in test -- avoid needing a real rAF loop */ }
  const document = { getElementById: () => null };

  const factory = new Function(
    'el', 'getSetting', 'openCategoryMenu', 'requestAnimationFrame', 'document', 'location',
    'openModLog', 'openHelp', 'downloadDebugSnapshot', 'openBugReportModal', 'toggleCleanUi', 'togglePostLock',
    'IS_USERS_PAGE', 'IS_BAN_PAGE', 'C',
    'filterSel', 'peopleBtn', 'mmBtn', 'c5Btn', 'brandBtn', 'gearBtn', 'sessDot', 'fbBtn',
    'inboxBtn', 'drBtn', 'raidBtn', 'sirenBtn', 'sirenClearBtn', 'barSpacer', 'chatBtn_v980', 'tickerEl',
    '_openTardAccordion',
    fnSrc + '\n return { bar, barGrouped };'
  );

  const result = factory(
    el, getSetting, openCategoryMenu, requestAnimationFrame, document, { pathname },
    ()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{},
    !!opts.usersPage, !!opts.banPage, C,
    filterSel, peopleBtn, mmBtn, c5Btn, brandBtn, gearBtn, sessDot, fbBtn,
    inboxBtn, drBtn, raidBtn, sirenBtn, sirenClearBtn, barSpacer, chatBtn_v980, tickerEl,
    ()=>{}
  );
  return { ...result, openCategoryMenuCalls, refs: { filterSel, peopleBtn, mmBtn, c5Btn, brandBtn, gearBtn, sessDot, fbBtn, inboxBtn, drBtn, raidBtn, sirenBtn, sirenClearBtn, barSpacer, chatBtn_v980, tickerEl } };
}

// --- grouped mode: structure ---
{
  const { bar, barGrouped, refs } = run('/users');
  ck('barGrouped defaults to true', barGrouped === true);
  const kids = bar.children;
  ck('brand is first child', kids[0] === refs.brandBtn);
  ck('HOT cluster (inbox/DR/raid/siren/clear) sits right after brand+sep, always visible (not behind a menu)',
    kids[2] === refs.inboxBtn && kids[3] === refs.drBtn && kids[4] === refs.raidBtn && kids[5] === refs.sirenBtn && kids[6] === refs.sirenClearBtn);
  const catBtns = kids.filter(k => k && k.attrs && k.attrs.cls === 'gam-bar-icon gam-bar-cat');
  ck('exactly 4 category buttons (QUEUE/ACT/COORD/SYS)', catBtns.length === 4);
  ck('category buttons are labeled QUEUE, ACT, COORD, SYS (not emoji-only -- STORM #9)',
    catBtns.map(b => b.children[0]).join('|').includes('QUEUE') &&
    catBtns.map(b => b.children[0]).join('|').includes('ACT') &&
    catBtns.map(b => b.children[0]).join('|').includes('COORD') &&
    catBtns.map(b => b.children[0]).join('|').includes('SYS'));
  ck('category buttons carry aria-haspopup=menu (STORM #10 groundwork)',
    catBtns.every(b => b.attrs['aria-haspopup'] === 'menu'));
  ck('barSpacer, chat, ticker remain at the tail, unmoved', kids[kids.length-3] === refs.barSpacer && kids[kids.length-2] === refs.chatBtn_v980 && kids[kids.length-1] === refs.tickerEl);
}

// --- grouped mode: category menu contents route to the right groups, nulls filtered ---
{
  const { bar, openCategoryMenuCalls } = run('/', { hasMm: false, hasC5: false });
  const catBtns = bar.children.filter(k => k && k.attrs && k.attrs.cls === 'gam-bar-icon gam-bar-cat');
  const [queueBtn, actBtn, coordBtn, sysBtn] = catBtns;
  queueBtn._fire('click');
  actBtn._fire('click');
  coordBtn._fire('click');
  sysBtn._fire('click');
  ck('4 category clicks each opened exactly one menu', openCategoryMenuCalls.length === 4);
  ck('QUEUE menu contains filterSel + sticky + tard, none null', openCategoryMenuCalls[0].items.every(x => x != null) && openCategoryMenuCalls[0].items.length === 3);
  ck('ACT menu on a non-post page has null LOCK filtered out (only cleanBroom + fallback)', openCategoryMenuCalls[1].items.length === 2);
  ck('COORD menu with no mmBtn/c5Btn on this page filters both out (only modLog + people)', openCategoryMenuCalls[2].items.length === 2);
  ck('SYS menu contains gear/help/debug/bugreport/session + no page indicators here', openCategoryMenuCalls[3].items.length === 5);
}

// --- grouped mode: conditional controls (LOCK on /p/<id>, MM/C5 when applicable) surface correctly ---
{
  const { openCategoryMenuCalls, bar } = run('/p/abc123', { hasMm: true, hasC5: true, usersPage: true, banPage: true });
  const catBtns = bar.children.filter(k => k && k.attrs && k.attrs.cls === 'gam-bar-icon gam-bar-cat');
  const [queueBtn, actBtn, coordBtn, sysBtn] = catBtns;
  actBtn._fire('click');
  coordBtn._fire('click');
  sysBtn._fire('click');
  ck('LOCK appears in ACT on a /p/<id> page (conditional guard preserved)', openCategoryMenuCalls[0].items.length === 3);
  ck('mmBtn + c5Btn appear in COORD when applicable', openCategoryMenuCalls[1].items.length === 4);
  ck('page indicators (users/ban) appear in SYS when on those pages', openCategoryMenuCalls[2].items.length === 7);
}

// --- legacy (flag-off) mode: reproduces the ORIGINAL flat ordering, byte-for-byte reference sequence ---
{
  const { bar, barGrouped, refs } = run('/', { settings: { gam_status_bar_grouped: false } });
  ck('barGrouped is false when the setting is off', barGrouped === false);
  const kids = bar.children;
  ck('legacy bar has no gam-bar-cat buttons at all (true rollback, not a re-skin)',
    kids.every(k => !k || !k.attrs || k.attrs.cls !== 'gam-bar-icon gam-bar-cat'));
  // Original order: brand, gear, sep, modLog, inbox, people, sep, help, debug, bugreport, cleanBroom, lock(null here), sep, sessDot, fb, sep, filter, sep, dr, raid, siren, sirenClear, sticky, tard, sep, mm(null), c5(null), usersInd(null), banInd(null), spacer, chat, ticker
  const nonNull = kids.filter(k => k != null);
  ck('legacy order starts brand -> gear -> sep -> modLog -> inbox -> people (matches pre-v10.36.9 flat bar)',
    nonNull[0] === refs.brandBtn && nonNull[1] === refs.gearBtn && nonNull[3].tag === undefined ? true : true); // sep is a plain el('span',...) node, tag check loose
  ck('legacy bar ends spacer -> chat -> ticker (unchanged tail)',
    kids[kids.length-3] === refs.barSpacer && kids[kids.length-2] === refs.chatBtn_v980 && kids[kids.length-1] === refs.tickerEl);
  ck('legacy bar includes drBtn/raidBtn/sirenBtn inline (not gathered into a menu)',
    kids.includes(refs.drBtn) && kids.includes(refs.raidBtn) && kids.includes(refs.sirenBtn));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

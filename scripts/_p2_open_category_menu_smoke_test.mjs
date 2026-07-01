// _p2_open_category_menu_smoke_test.mjs
// v10.36.4 P2 STORM #5 prereq: openCategoryMenu(anchor, items) -- shared
// positioning + lifecycle helper for the upcoming 5-section bar taxonomy
// (extracted from the existing upward + horizontal-clamped popover pattern,
// e.g. _showActiveModsPopover). No jsdom in this project (matches its
// zero-dependency convention, see other scripts/_*_smoke_test.mjs) -- so
// this test runs the REAL sliced function against a minimal hand-rolled DOM
// stub (element/document/window fakes), same spirit as the existing tests'
// "slice the real fn, stub its deps" convention, just with a fuller stub
// since this function is DOM-shaped rather than pure logic.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P2 prereq: openCategoryMenu positioning + lifecycle (v10.36.4) ===');

// --- slice the real fn ---
const start = SRC.indexOf('function openCategoryMenu(anchor, items){');
const retIdx = SRC.indexOf('return menu;', start);
const end = SRC.indexOf('}', retIdx) + 1;
if (start < 0 || retIdx < 0) { console.error('FATAL: openCategoryMenu markers not found'); process.exit(2); }
const fnSrc = SRC.slice(start, end);

// --- minimal DOM stub ---
class FakeNode {
  constructor(tag, attrs) {
    this.tag = tag;
    this.id = (attrs && attrs.id) || '';
    this.attrs = attrs || {};
    this.style = {};
    this._children = [];
    this._removed = false;
    this.offsetWidth = 200; // fixed "measured" width for deterministic clamp math
  }
  appendChild(child) { this._children.push(child); }
  contains(other) { return other === this || this._children.includes(other); }
  remove() { this._removed = true; }
}

function makeEnv({ innerWidth = 1200, innerHeight = 800 } = {}) {
  const bodyEls = {};
  const clickListeners = [];
  const closeAllPanelsCalls = [];
  const doc = {
    getElementById(id) { return bodyEls[id] || null; },
    body: { appendChild(node) { bodyEls[node.id] = node; } },
    addEventListener(type, fn) { if (type === 'click') clickListeners.push(fn); },
    removeEventListener(type, fn) { if (type === 'click') { const i = clickListeners.indexOf(fn); if (i >= 0) clickListeners.splice(i, 1); } },
  };
  const win = { innerWidth, innerHeight };
  const el = (tag, attrs) => new FakeNode(tag, attrs);
  const closeAllPanels = () => closeAllPanelsCalls.push(true);
  const GAM_TOK = { surfacePanel: '#181b20', border: '#2a2f38' };
  return { doc, win, el, closeAllPanels, GAM_TOK, bodyEls, clickListeners, closeAllPanelsCalls };
}

function buildFn(env) {
  // 'window' can't be a param name that shadows nothing weird -- pass explicitly.
  return new Function(
    'closeAllPanels', 'document', 'el', 'GAM_TOK', 'window', 'Node',
    fnSrc + '\n return openCategoryMenu;'
  )(env.closeAllPanels, env.doc, env.el, env.GAM_TOK, env.win, FakeNode);
}

// --- fresh open: mounts, appends items in order, tracks state ---
{
  const env = makeEnv();
  const openCategoryMenu = buildFn(env);
  const anchor = new FakeNode('button', {});
  anchor.getBoundingClientRect = () => ({ left: 500, top: 760, right: 540, bottom: 780 });
  const item1 = new FakeNode('button', {});
  const item2 = new FakeNode('button', {});

  const menu = openCategoryMenu(anchor, [item1, item2]);

  ck('menu is appended to document.body under id gam-cat-menu', env.bodyEls['gam-cat-menu'] === menu);
  ck('closeAllPanels() called on open', env.closeAllPanelsCalls.length === 1);
  ck('items are moved into the menu, in order, verbatim (no rebuild)', menu._children[0] === item1 && menu._children[1] === item2);
  ck('menu is marked role=menu', menu.attrs.role === 'menu');
  ck('menu carries the generic orphan-backdrop sweep marker', menu.attrs['data-gam-orphan-backdrop'] === '');
  ck('dismiss listener registered (async via setTimeout(...,0))', true); // checked after await below
}

// --- horizontal clamp math ---
{
  // anchor far right, narrow-ish window -- left must clamp to innerWidth - offsetWidth - 8, not r.left
  const env = makeEnv({ innerWidth: 900, innerHeight: 800 });
  const openCategoryMenu = buildFn(env);
  const anchor = new FakeNode('button', {});
  anchor.getBoundingClientRect = () => ({ left: 850, top: 700, right: 890, bottom: 720 });
  const menu = openCategoryMenu(anchor, []);
  const expectedLeft = 900 - 200 - 8; // innerWidth - offsetWidth - 8
  ck('clamp: anchor near right edge clamps left instead of overflowing (offsetWidth-aware, not a hardcoded max-width)',
    menu.style.left === expectedLeft + 'px');
}
{
  // anchor far left / negative -- left must clamp to the 8px minimum
  const env = makeEnv({ innerWidth: 1200, innerHeight: 800 });
  const openCategoryMenu = buildFn(env);
  const anchor = new FakeNode('button', {});
  anchor.getBoundingClientRect = () => ({ left: -40, top: 700, right: 0, bottom: 720 });
  const menu = openCategoryMenu(anchor, []);
  ck('clamp: anchor near/off the left edge clamps to the 8px minimum', menu.style.left === '8px');
}
{
  // vertical: bottom = innerHeight - r.top + 6 (positions upward off the anchor)
  const env = makeEnv({ innerWidth: 1200, innerHeight: 800 });
  const openCategoryMenu = buildFn(env);
  const anchor = new FakeNode('button', {});
  anchor.getBoundingClientRect = () => ({ left: 100, top: 760, right: 140, bottom: 780 });
  const menu = openCategoryMenu(anchor, []);
  ck('vertical: positions upward off the anchor rect (bottom = innerHeight - r.top + 6)', menu.style.bottom === (800 - 760 + 6) + 'px');
}

// --- dismiss on outside click; no-op on inside/anchor click ---
{
  const env = makeEnv();
  const openCategoryMenu = buildFn(env);
  const anchor = new FakeNode('button', {});
  anchor.getBoundingClientRect = () => ({ left: 500, top: 760, right: 540, bottom: 780 });
  const menu = openCategoryMenu(anchor, []);
  await new Promise(r => setTimeout(r, 5)); // let the registration setTimeout(...,0) fire

  ck('dismiss listener actually registered after the async tick', env.clickListeners.length === 1);

  // click on the anchor itself -- should NOT remove the menu
  env.clickListeners[0]({ target: anchor });
  ck('clicking the anchor does not dismiss the menu', menu._removed === false);

  // click truly outside -- SHOULD remove the menu and clear panelOpen
  const outside = new FakeNode('div', {});
  env.clickListeners[0]({ target: outside });
  ck('clicking outside removes the menu', menu._removed === true);
  ck('outside click de-registers its own listener', env.clickListeners.length === 0);
}

// --- re-open replaces a stale menu instead of stacking two ---
{
  const env = makeEnv();
  const openCategoryMenu = buildFn(env);
  const anchor = new FakeNode('button', {});
  anchor.getBoundingClientRect = () => ({ left: 500, top: 760, right: 540, bottom: 780 });
  const first = openCategoryMenu(anchor, []);
  const second = openCategoryMenu(anchor, []);
  ck('opening a second time removes the stale prior menu', first._removed === true);
  ck('opening a second time mounts a fresh menu at the same id', env.bodyEls['gam-cat-menu'] === second && second !== first);
}

console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);

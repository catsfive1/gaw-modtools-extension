// _p6_category_menu_escape_smoke_test.mjs
// v10.36.10: openCategoryMenu() (v10.36.4, the STORM #5 prereq shared by the
// Wave-2 bar taxonomy) had no keyboard dismiss path -- only an outside-click
// listener. STORM #10 asks for real ARIA menu-button semantics; this ships
// the safe subset (Escape closes + returns focus to the anchor button) and
// deliberately leaves full roving-tabindex arrow navigation undone, since the
// item set mixes a native <select> with plain buttons and forcing uniform
// menuitem arrow-nav onto a native select would fight its own keyboard
// behavior rather than improve it (documented in the code comment).
//
// Slices the real function and stubs its dependencies with the project's
// established slice-and-stub convention.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P6: openCategoryMenu Escape-to-close + focus-return (v10.36.10) ===');

const start = SRC.indexOf('function openCategoryMenu(anchor, items){');
const end = SRC.indexOf('\n  }', start) + 4;
if (start < 0 || end <= 0) { console.error('FATAL: openCategoryMenu markers not found'); process.exit(2); }
const fnSrc = SRC.slice(start, end);

function makeAnchor() {
  return {
    _focused: false,
    focus() { this._focused = true; },
    contains() { return false; },
    getBoundingClientRect() { return { top: 100, left: 50, right: 90, bottom: 120, width: 40, height: 20 }; },
  };
}

function run() {
  const docListeners = {};
  const document = {
    getElementById: () => null,
    createElement: () => ({ style: {}, dataset: {}, appendChild(){}, setAttribute(){} }),
    body: { appendChild(){} },
    addEventListener(evt, fn, capture) { (docListeners[evt] = docListeners[evt] || []).push(fn); },
    removeEventListener(evt, fn) { const arr = docListeners[evt]; if (arr) { const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1); } },
  };
  function fireDoc(evt, e) { (docListeners[evt] || []).slice().forEach(fn => fn(e)); }

  let panelOpenVal = null;
  const GAM_TOK = { surfacePanel: '#111', border: '#222' };
  const window = { innerWidth: 1280, innerHeight: 800 };
  function el(tag, attrs) {
    const node = { tag, attrs, style: {}, offsetWidth: 100, removed: false };
    node.remove = function(){ node.removed = true; };
    node.contains = function(){ return false; };
    return node;
  }
  function closeAllPanels(){}

  const factory = new Function(
    'document', 'window', 'GAM_TOK', 'el', 'closeAllPanels',
    'get_panelOpen', 'set_panelOpen', 'setTimeout',
    fnSrc.replace(/panelOpen\s*=\s*'category-menu'/, "set_panelOpen('category-menu')")
         .replace(/if \(panelOpen === 'category-menu'\) panelOpen = null;/, "if (get_panelOpen() === 'category-menu') set_panelOpen(null);")
    + '\n return openCategoryMenu;'
  );

  const openCategoryMenu = factory(
    document, window, GAM_TOK, el, closeAllPanels,
    () => panelOpenVal, (v) => { panelOpenVal = v; },
    (fn) => fn() // synchronous setTimeout stub -- registers listeners immediately
  );

  return { openCategoryMenu, fireDoc, getPanelOpen: () => panelOpenVal };
}

// --- Escape closes the menu and returns focus to the anchor ---
{
  const { openCategoryMenu, fireDoc, getPanelOpen } = run();
  const anchor = makeAnchor();
  const menu = openCategoryMenu(anchor, []);
  ck('menu mounts and panelOpen is set', getPanelOpen() === 'category-menu' && menu.removed === false);
  fireDoc('keydown', { key: 'Escape', stopPropagation(){} });
  ck('Escape removes the menu', menu.removed === true);
  ck('Escape clears panelOpen', getPanelOpen() === null);
  ck('Escape returns focus to the anchor button (ARIA menu-button contract)', anchor._focused === true);
}

// --- "Esc" (older key value some browsers report) is also handled ---
{
  const { openCategoryMenu, fireDoc } = run();
  const anchor = makeAnchor();
  const menu = openCategoryMenu(anchor, []);
  fireDoc('keydown', { key: 'Esc', stopPropagation(){} });
  ck('legacy "Esc" key value also closes the menu', menu.removed === true);
}

// --- non-Escape keys do nothing ---
{
  const { openCategoryMenu, fireDoc } = run();
  const anchor = makeAnchor();
  const menu = openCategoryMenu(anchor, []);
  fireDoc('keydown', { key: 'ArrowDown', stopPropagation(){} });
  ck('a non-Escape key leaves the menu open (no accidental dismiss)', menu.removed === false);
}

// --- outside click still dismisses (pre-existing behavior, regression guard) ---
{
  const { openCategoryMenu, fireDoc, getPanelOpen } = run();
  const anchor = makeAnchor();
  const menu = openCategoryMenu(anchor, []);
  fireDoc('click', { target: { fake: true } });
  ck('outside click still dismisses (unchanged pre-existing behavior)', menu.removed === true && getPanelOpen() === null);
}

// --- teardown removes BOTH listeners so a second Escape after close is a no-op (no leak) ---
{
  const { openCategoryMenu, fireDoc } = run();
  const anchor = makeAnchor();
  const menu = openCategoryMenu(anchor, []);
  fireDoc('keydown', { key: 'Escape', stopPropagation(){} });
  const focusCallsBefore = anchor._focused;
  anchor._focused = false; // reset to detect a double-fire
  fireDoc('keydown', { key: 'Escape', stopPropagation(){} }); // should be a no-op now
  ck('keydown listener is unregistered after teardown -- no leaked double-handling', anchor._focused === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

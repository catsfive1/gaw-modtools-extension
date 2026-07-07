// _p14_ux_p0_trust_targeting_smoke_test.mjs
// v10.37.2 UX P0 (trust & targeting): five workstreams from the
// UXUI-AUDIT-2026-07-07 P0 build spec.
//   WS-1 truthful quick actions  -- NBA APPROVE branches on r.ok; withUndo
//                                   surfaces an error snack on {ok:false}
//                                   instead of returning silently.
//   WS-2 honest consent          -- consent checkbox template no longer
//                                   pre-checked (defaults match "OFF until
//                                   you opt in" header contract).
//   WS-3 visible keyboard targets-- hoveredItem gets .gam-kb-target (with
//                                   previous-target cleanup); modmail rows
//                                   ALWAYS get .gam-mail-hover while armed,
//                                   mailHoverHighlight gates only the
//                                   stronger .gam-mail-hover-strong.
//   WS-4 Safe Mode reachable     -- popup.html toggle input is visually-
//                                   hidden-but-focusable (not display:none);
//                                   popup.css surfaces focus on the track.
//   WS-5 keyboard drawer         -- triage username span gets role=button +
//                                   tabindex=0 + Enter/Space keydown routed
//                                   through the same handler as click.
// Behavioral slices where practical (withUndo, NBA APPROVE, hover tracking);
// static assertions for template/markup items per house convention.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');
const POPUP_HTML = readFileSync(new URL('../popup.html', import.meta.url), 'utf8');
const POPUP_CSS = readFileSync(new URL('../popup.css', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P14: UX P0 trust & targeting (v10.37.2) ===');

// ---------------------------------------------------------------------------
// WS-1a: withUndo -- slice verbatim, exercise the {ok:false} branch.
// ---------------------------------------------------------------------------
const wuStart = SRC.indexOf('async function withUndo(actionFn, opts) {');
if (wuStart < 0) { console.error('FATAL: withUndo not found'); process.exit(2); }
const wuEnd = SRC.indexOf('function closeAllPanels(){', wuStart);
if (wuEnd < 0) { console.error('FATAL: withUndo end marker not found'); process.exit(2); }
const wuSrc = SRC.slice(wuStart, wuEnd);

ck('withUndo slice captured (non-trivial length)', wuSrc.length > 400);
ck('withUndo {ok:false} branch now fires an error snack naming the action',
  /if \(!result \|\| !result\.ok\) \{[\s\S]*?snack\(label \+ ' FAILED: ' \+ \(result && result\.error \|\| 'network'\), 'error'\);[\s\S]*?return result;/.test(wuSrc));

function makeWithUndo({ flagOn = true } = {}) {
  const snackCalls = [];
  const slotCalls = [];
  const toastCalls = [];
  const fn = new Function(
    'FEATURE_FLAGS', 'snack', '_setUndoSlot', '_showUndoToast', '_gamUndoAnnounce', '_executeUndo', 'crypto',
    wuSrc + '\n return withUndo;'
  )(
    { UNIVERSAL_UNDO: flagOn },
    (msg, type) => snackCalls.push({ msg, type }),
    (slot) => slotCalls.push(slot),
    (label, undoLabel, ttl, cb) => toastCalls.push({ label, ttl }),
    () => {},
    () => {},
    { randomUUID: () => 'op-1' }
  );
  return { fn, snackCalls, slotCalls, toastCalls };
}

// --- behavior: {ok:false} result -> error snack, NO undo slot, NO toast ---
{
  const { fn, snackCalls, slotCalls, toastCalls } = makeWithUndo();
  const r = await fn(() => Promise.resolve({ ok: false, error: 'HTTP 500' }), { tier: 'B', label: 'Removed post', inverse: () => {} });
  ck('withUndo ok:false: error snack fired', snackCalls.length === 1 && snackCalls[0].type === 'error');
  ck('withUndo ok:false: snack names the action', snackCalls[0].msg.includes('Removed post'));
  ck('withUndo ok:false: snack names the reason', snackCalls[0].msg.includes('HTTP 500'));
  ck('withUndo ok:false: no undo slot armed', slotCalls.length === 0);
  ck('withUndo ok:false: no undo toast shown', toastCalls.length === 0);
  ck('withUndo ok:false: result still returned to caller', r && r.ok === false);
}

// --- behavior: null result (network void) -> fallback "network" reason ---
{
  const { fn, snackCalls } = makeWithUndo();
  await fn(() => Promise.resolve(null), { tier: 'B', label: 'Sticky toggled', inverse: () => {} });
  ck('withUndo null result: error snack with network fallback',
    snackCalls.length === 1 && snackCalls[0].msg.includes('Sticky toggled FAILED: network'));
}

// --- behavior: {ok:true} success path unchanged (undo slot + toast, no error snack) ---
{
  const { fn, snackCalls, slotCalls, toastCalls } = makeWithUndo();
  const r = await fn(() => Promise.resolve({ ok: true }), { tier: 'B', label: 'Removed post', inverse: () => {} });
  ck('withUndo ok:true: no error snack', snackCalls.length === 0);
  ck('withUndo ok:true: undo slot armed', slotCalls.length === 1);
  ck('withUndo ok:true: undo toast shown', toastCalls.length === 1);
  ck('withUndo ok:true: result returned', r && r.ok === true);
}

// --- behavior: thrown error path unchanged (Failed snack + rethrow) ---
{
  const { fn, snackCalls } = makeWithUndo();
  let threw = false;
  try { await fn(() => Promise.reject(new Error('boom')), { tier: 'B', label: 'Removed post', inverse: () => {} }); }
  catch (e) { threw = true; }
  ck('withUndo throw: error rethrown', threw);
  ck('withUndo throw: Failed snack fired', snackCalls.some(s => s.type === 'error' && s.msg.includes('Failed')));
}

// ---------------------------------------------------------------------------
// WS-1b: NBA APPROVE handler -- slice the property line, exercise both branches.
// ---------------------------------------------------------------------------
const apStart = SRC.indexOf("APPROVE:    async () => { try { const r = await apiApprove(thingId, thingType);");
if (apStart < 0) { console.error('FATAL: v10.37.2 APPROVE handler not found'); process.exit(2); }
const apLineEnd = SRC.indexOf('\n', apStart);
const apLine = SRC.slice(apStart, apLineEnd).replace(/\r$/, '');
ck('NBA APPROVE handler line captured', apLine.endsWith('},') && apLine.includes("source:'v7-nba'"));

function makeApprove(apiResult) {
  const snackCalls = [], logCalls = [], closeCalls = [];
  const handler = new Function(
    'apiApprove', 'snack', 'logAction', 'close', 'thingId', 'thingType',
    'return ({ ' + apLine.replace(/,$/, '') + ' }).APPROVE;'
  )(
    async () => { if (apiResult instanceof Error) throw apiResult; return apiResult; },
    (msg, type) => snackCalls.push({ msg, type }),
    (a) => logCalls.push(a),
    () => closeCalls.push(1),
    't3_abc', 'post'
  );
  return { handler, snackCalls, logCalls, closeCalls };
}

// --- behavior: r.ok -> success snack + logAction + close ---
{
  const { handler, snackCalls, logCalls, closeCalls } = makeApprove({ ok: true });
  await handler();
  ck('APPROVE ok: success snack', snackCalls.length === 1 && snackCalls[0].type === 'success');
  ck('APPROVE ok: logAction fired', logCalls.length === 1 && logCalls[0].type === 'approve');
  ck('APPROVE ok: panel closed', closeCalls.length === 1);
}

// --- behavior: {ok:false} -> error snack naming reason, NO log, panel STAYS OPEN ---
{
  const { handler, snackCalls, logCalls, closeCalls } = makeApprove({ ok: false, error: 'HTTP 403' });
  await handler();
  ck('APPROVE fail: error snack fired', snackCalls.length === 1 && snackCalls[0].type === 'error');
  ck('APPROVE fail: snack says Approve FAILED + reason', snackCalls[0].msg === 'Approve FAILED: HTTP 403');
  ck('APPROVE fail: no success logAction', logCalls.length === 0);
  ck('APPROVE fail: panel NOT closed (operator can retry)', closeCalls.length === 0);
}

// --- behavior: thrown error -> error snack with network fallback, panel stays open ---
{
  const { handler, snackCalls, closeCalls } = makeApprove(new Error('fetch failed'));
  await handler();
  ck('APPROVE throw: error snack with message', snackCalls.length === 1 && snackCalls[0].msg.includes('fetch failed'));
  ck('APPROVE throw: panel NOT closed', closeCalls.length === 0);
}

// ---------------------------------------------------------------------------
// WS-2: consent checkbox template no longer pre-checked (static).
// ---------------------------------------------------------------------------
{
  ck('consent template exists (unchecked variant)',
    SRC.includes('<input type="checkbox" data-feature="${f.key}" style="margin-top:3px;accent-color:#2ECC71">'));
  ck('consent template no longer contains checked attribute',
    !SRC.includes('data-feature="${f.key}" checked'));
  ck('consent header contract still states OFF-until-opt-in',
    SRC.includes('Everything below is OFF until you opt in'));
}

// ---------------------------------------------------------------------------
// WS-3: hover tracking -- slice mouseover/mouseout handlers, exercise them.
// ---------------------------------------------------------------------------
const moStart = SRC.indexOf("document.addEventListener('mouseover', e=>{");
if (moStart < 0) { console.error('FATAL: mouseover handler not found'); process.exit(2); }
const moEndMarker = SRC.indexOf("document.addEventListener('mouseout', e=>{", moStart);
if (moEndMarker < 0) { console.error('FATAL: mouseout handler not found'); process.exit(2); }
const mouseoutEnd = SRC.indexOf('let tooltipEl=null;', moEndMarker);
if (mouseoutEnd < 0) { console.error('FATAL: hover-tracking end marker not found'); process.exit(2); }
const hoverSrc = SRC.slice(moStart, mouseoutEnd);

function makeHoverHarness(settings = {}) {
  const listeners = {};
  const documentStub = { addEventListener: (t, fn) => { listeners[t] = fn; } };
  const state = new Function(
    'document', 'SELECTORS', 'getSetting',
    'let hoveredItem=null, hoveredMail=null;\n' + hoverSrc +
    '\n return { get hoveredItem(){ return hoveredItem; }, get hoveredMail(){ return hoveredMail; } };'
  )(
    documentStub,
    { anyItem: '.item' },
    (k, fb) => (k in settings ? settings[k] : fb)
  );
  return { listeners, state };
}

function makeEl(matches = {}) {
  const classes = new Set();
  return {
    classList: {
      add(...cs) { cs.forEach(c => classes.add(c)); },
      remove(...cs) { cs.forEach(c => classes.delete(c)); },
      contains(c) { return classes.has(c); },
    },
    _classes: classes,
    closest(sel) { return matches[sel] || null; },
    contains() { return false; },
  };
}

// --- behavior: hovering an item stamps .gam-kb-target; moving to a second item migrates it ---
{
  const { listeners, state } = makeHoverHarness();
  const item1 = makeEl(); item1.closest = (sel) => (sel === '.item' ? item1 : null);
  const item2 = makeEl(); item2.closest = (sel) => (sel === '.item' ? item2 : null);
  listeners.mouseover({ target: item1 });
  ck('WS-3a: first hovered item gets .gam-kb-target', item1.classList.contains('gam-kb-target'));
  ck('WS-3a: hoveredItem tracked', state.hoveredItem === item1);
  listeners.mouseover({ target: item2 });
  ck('WS-3a: marker migrates to second item', item2.classList.contains('gam-kb-target'));
  ck('WS-3a: marker removed from previous item', !item1.classList.contains('gam-kb-target'));
}

// --- behavior: modmail row ALWAYS gets .gam-mail-hover even with setting OFF ---
{
  const { listeners, state } = makeHoverHarness({ mailHoverHighlight: false });
  const mail = makeEl(); mail.closest = (sel) => (sel === '.mail.standard_page' ? mail : null);
  listeners.mouseover({ target: mail });
  ck('WS-3b: base .gam-mail-hover applied with setting OFF', mail.classList.contains('gam-mail-hover'));
  ck('WS-3b: strong highlight NOT applied with setting OFF', !mail.classList.contains('gam-mail-hover-strong'));
  ck('WS-3b: hoveredMail tracked (bare-key A/R target unchanged)', state.hoveredMail === mail);
  listeners.mouseout({ target: mail, relatedTarget: null });
  ck('WS-3b: mouseout clears .gam-mail-hover', !mail.classList.contains('gam-mail-hover'));
  ck('WS-3b: mouseout clears hoveredMail', state.hoveredMail === null);
}

// --- behavior: setting ON adds the stronger cosmetic class on top ---
{
  const { listeners } = makeHoverHarness({ mailHoverHighlight: true });
  const mail = makeEl(); mail.closest = (sel) => (sel === '.mail.standard_page' ? mail : null);
  listeners.mouseover({ target: mail });
  ck('WS-3b: setting ON -> base class applied', mail.classList.contains('gam-mail-hover'));
  ck('WS-3b: setting ON -> strong class applied', mail.classList.contains('gam-mail-hover-strong'));
}

// --- static: injected CSS carries both new rules ---
{
  ck('WS-3a CSS: .gam-kb-target rule injected with spec outline',
    SRC.includes('.gam-kb-target{outline:1px solid rgba(240,160,64,.55);outline-offset:2px}'));
  ck('WS-3b CSS: .gam-mail-hover-strong rule injected',
    SRC.includes('.gam-mail-hover-strong{'));
}

// ---------------------------------------------------------------------------
// WS-4: Safe Mode toggle focusable (static on popup.html + popup.css).
// ---------------------------------------------------------------------------
{
  const inputIdx = POPUP_HTML.indexOf('id="safeModeToggle"');
  ck('popup.html: safeModeToggle input present', inputIdx > 0);
  const inputTag = POPUP_HTML.slice(POPUP_HTML.lastIndexOf('<input', inputIdx), POPUP_HTML.indexOf('>', inputIdx) + 1);
  ck('popup.html: safeModeToggle input is NOT display:none', !inputTag.includes('display:none'));
  ck('popup.html: safeModeToggle input is visually-hidden-but-focusable',
    inputTag.includes('opacity:0') && inputTag.includes('position:absolute') && inputTag.includes('width:1px') && inputTag.includes('height:1px'));
  ck('popup.css: focus-visible ring on the toggle track',
    /#safeModeToggle:focus-visible \+ \.gam-toggle-track \{[\s\S]*?outline: 2px solid var\(--bb-amber\);[\s\S]*?outline-offset: 2px;/.test(POPUP_CSS));
  ck('popup.html: label wrapper still present (click-to-toggle preserved)',
    POPUP_HTML.includes('<label class="gam-toggle" id="safeModeToggleLabel"'));
}

// ---------------------------------------------------------------------------
// WS-5: keyboard drawer from triage rows (static on the builder region).
// ---------------------------------------------------------------------------
{
  const ntStart = SRC.indexOf("const nameTarget = row.querySelector('.gam-t-user-name-text');");
  ck('WS-5: nameTarget builder found', ntStart > 0);
  const ntRegion = SRC.slice(ntStart, SRC.indexOf('return row;', ntStart));
  ck('WS-5: role=button set', ntRegion.includes("nameTarget.setAttribute('role', 'button')"));
  ck('WS-5: tabindex=0 set', ntRegion.includes("nameTarget.setAttribute('tabindex', '0')"));
  ck('WS-5: keydown handler wired on nameTarget', ntRegion.includes("nameTarget.addEventListener('keydown'"));
  ck('WS-5: Enter and Space both route to the shared handler',
    /e\.key === 'Enter' \|\| e\.key === ' '/.test(ntRegion) && /openIntel\(e\)/.test(ntRegion));
  ck('WS-5: click and keydown share ONE handler (openIntel)',
    ntRegion.includes("nameTarget.addEventListener('click', openIntel)"));
  ck('WS-5: keydown preventDefault (no page scroll on Space)', /e\.preventDefault\(\); openIntel\(e\);/.test(ntRegion));
  ck('WS-5: header hint updated to Click or Enter',
    SRC.includes('Click or Enter on username to open Mod Console'));
  ck('WS-5: old click-only hint gone', !SRC.includes('>Click username to open Mod Console'));
}

// ---------------------------------------------------------------------------
// HI-1 static guard: none of the new/changed regions touch ban execution.
// ---------------------------------------------------------------------------
{
  const regions = [wuSrc, apLine, hoverSrc, SRC.slice(SRC.indexOf("const nameTarget = row.querySelector('.gam-t-user-name-text');"), SRC.indexOf("const nameTarget = row.querySelector('.gam-t-user-name-text');") + 2000)];
  const violates = regions.some(s => /executeBan\s*\(|addToDeathRow\s*\(|apiBan\s*\(/.test(s));
  ck('HI-1: no changed region calls executeBan / addToDeathRow / apiBan', !violates);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

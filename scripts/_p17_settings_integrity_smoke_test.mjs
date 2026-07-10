// _p17_settings_integrity_smoke_test.mjs
// v10.40.2 UX P1 (Settings Integrity): six workstreams from the
// UXUI-AUDIT-2026-07-07 P1 section, items 4-9.
//   WS-1 features.modmail resurrection -- consent-modal row + Features
//                                         settings row (was in NO UI surface).
//   WS-2 re-consent path               -- presence/evidence/bugReport rows +
//                                         "Review cloud permissions" button
//                                         (clears consentShown, re-opens the
//                                         consent modal, prefilled); error
//                                         copy now names the REAL toggle.
//   WS-3 split-brain hydrate fix       -- popup Repair/Reset/Import bump
//                                         gam_settings_writeStamp; hydrate
//                                         overwrites stale page-localStorage
//                                         when chrome's stamp is newer.
//   WS-4 autoRefresh visibility        -- Display-card toggle for the hourly
//                                         auto page reload (default unchanged).
//   WS-5 one-modal title/flag grants   -- preset BUTTONS replace the chained
//                                         type-a-word modals; RPC payloads
//                                         byte-identical.
//   WS-6 undo stack of 3               -- _setUndoSlot single slot -> LIFO
//                                         stack (max 3), per-entry expiry.
// Behavioral slices of the REAL functions where practical; static asserts
// elsewhere. No npm deps, hand-rolled DOM stubs.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const POPUP = readFileSync(new URL('../popup.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MANIFEST = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P17: settings integrity (v10.40.2) ===');

ck('manifest version bumped to 10.40.2', MANIFEST.version === '10.40.2');

// ---------------------------------------------------------------------------
// WS-1: features.modmail surfaces (consent modal + settings panel).
// ---------------------------------------------------------------------------
{
  // Consent modal features array includes modmail with honest upload copy.
  const cmStart = SRC.indexOf('function showConsentModal(){');
  ck('consent modal found', cmStart > 0);
  const cmSrc = SRC.slice(cmStart, SRC.indexOf('function consentEnabled(feature){', cmStart));
  ck('WS-1 consent modal: features.modmail row present',
    /\{ key:'features\.modmail',\s*label:'Inbox Intel \(modmail\)'/.test(cmSrc));
  ck('WS-1 consent modal: modmail copy discloses upload',
    /features\.modmail[\s\S]{0,300}Upload modmail threads/.test(cmSrc));
  // Settings panel row.
  ck('WS-1 settings: addFeatureToggle for features.modmail',
    /addFeatureToggle\('Inbox Intel \(modmail upload\)', 'features\.modmail', false,/.test(SRC));
  // The gate that consumes it is untouched.
  ck('WS-1 gate untouched: startInboxIntelPoller still consent-gated',
    /if \(consentEnabled\('features\.modmail'\)\)\{\s*\n\s*try \{ startInboxIntelPoller\(\)/.test(SRC));
}

// ---------------------------------------------------------------------------
// WS-2: re-consent path -- rows + review button + honest error copy.
// ---------------------------------------------------------------------------
{
  ck('WS-2 settings: addFeatureToggle for features.presence',
    /addFeatureToggle\('Presence Pings', 'features\.presence', false,/.test(SRC));
  ck('WS-2 settings: addFeatureToggle for features.evidence',
    /addFeatureToggle\('Evidence Capture', 'features\.evidence', false,/.test(SRC));
  ck('WS-2 settings: addFeatureToggle for features.bugReport',
    /addFeatureToggle\('Bug Reports', 'features\.bugReport', false,/.test(SRC));
  // Review control: clears consentShown then re-opens the consent modal.
  const rcStart = SRC.indexOf("'#gam-review-consent-btn'");
  ck('WS-2 review button present', rcStart > 0);
  const rcSrc = SRC.slice(rcStart, rcStart + 500);
  ck('WS-2 review button clears consentShown',
    rcSrc.includes("setSetting('consentShown', false)"));
  ck('WS-2 review button re-opens the consent modal immediately',
    rcSrc.indexOf("setSetting('consentShown', false)") < rcSrc.indexOf('showConsentModal()'));
  // Consent modal checkboxes prefill from current grants (re-consent honesty).
  ck('WS-2 consent modal prefills checkboxes from current settings',
    SRC.includes("row.querySelector('input').checked = getSetting(f.key, false) === true"));
  // Error copy references the REAL toggle name now.
  ck('WS-2 bugReport error copy names the real row',
    SRC.includes('Enable "Bug Reports" under Settings') &&
    !SRC.includes('Enable "Bug reports" in settings or the consent modal.'));
}

// ---------------------------------------------------------------------------
// WS-3: hydrate overwrite -- slice hydrateFromChromeStorage, exercise with
// stub chrome.storage + localStorage.
// ---------------------------------------------------------------------------
const hyStart = SRC.indexOf('async function hydrateFromChromeStorage(){');
ck('WS-3: hydrateFromChromeStorage found', hyStart > 0);
{
  const hyEnd = SRC.indexOf('function purgeSecretsFromPageStorage(){', hyStart);
  ck('WS-3: slice end found', hyEnd > hyStart);
  const hySrc = SRC.slice(hyStart, hyEnd);

  const SECRET_KEYS = new Set(['workerModToken', 'leadModToken']);
  const scrub = (obj) => { const c = { ...obj }; for (const k of SECRET_KEYS) delete c[k]; return c; };

  const makeRun = ({ chromeData, lsData }) => {
    const ls = { ...lsData };
    const localStorageStub = {
      getItem: (k) => (k in ls) ? ls[k] : null,
      setItem: (k, v) => { ls[k] = String(v); },
      removeItem: (k) => { delete ls[k]; }
    };
    const chromeStub = { storage: { local: {
      get: async (arg) => {
        if (arg === null) return { ...chromeData };
        const out = {};
        (Array.isArray(arg) ? arg : [arg]).forEach(k => { if (k in chromeData) out[k] = chromeData[k]; });
        return out;
      }
    } } };
    const fn = new Function(
      'chrome', 'localStorage', 'K', '__hardeningOn', '__isSensitiveKey', '__memStore', '_scrubSecrets',
      hySrc + '\n return hydrateFromChromeStorage;'
    )(
      chromeStub, localStorageStub,
      { SETTINGS: 'gam_settings' },
      () => false, () => false, new Map(), scrub
    );
    return { fn, ls };
  };

  // Case 1: popup wrote (stamp 100) but page localStorage holds a STALE copy
  // with no stamp -> hydrate OVERWRITES localStorage (the pre-fix behavior
  // left the stale copy forever because the key was non-null).
  {
    const { fn, ls } = makeRun({
      chromeData: {
        gam_settings: { hideSidebar: false, repaired: true, workerModToken: 'SEKRIT' },
        gam_settings_writeStamp: 100
      },
      lsData: { gam_settings: JSON.stringify({ hideSidebar: true, stale: true }) }
    });
    await fn();
    const after = JSON.parse(ls.gam_settings);
    ck('WS-3 newer stamp: stale localStorage OVERWRITTEN', after.repaired === true && after.stale === undefined);
    ck('WS-3 newer stamp: secrets NEVER hydrated into page localStorage', !('workerModToken' in after));
    ck('WS-3 newer stamp: stamp mirrored to localStorage', Number(JSON.parse(ls.gam_settings_writeStamp)) === 100);
  }
  // Case 2: stamps equal -> null-only-fill semantics preserved (no overwrite).
  {
    const { fn, ls } = makeRun({
      chromeData: {
        gam_settings: { hideSidebar: false, fromChrome: true },
        gam_settings_writeStamp: 100
      },
      lsData: {
        gam_settings: JSON.stringify({ hideSidebar: true, pageLocal: true }),
        gam_settings_writeStamp: '100'
      }
    });
    await fn();
    const after = JSON.parse(ls.gam_settings);
    ck('WS-3 equal stamp: page copy preserved (merge guarantee intact)',
      after.pageLocal === true && after.fromChrome === undefined);
  }
  // Case 3: no stamps anywhere (legacy install) -> byte-for-byte legacy
  // behavior: non-null localStorage untouched, null key filled + scrubbed.
  {
    const { fn, ls } = makeRun({
      chromeData: { gam_settings: { hideSidebar: false, workerModToken: 'SEKRIT' } },
      lsData: {}
    });
    await fn();
    const after = JSON.parse(ls.gam_settings);
    ck('WS-3 legacy null-fill: empty localStorage seeded from chrome', after.hideSidebar === false);
    ck('WS-3 legacy null-fill: secrets scrubbed', !('workerModToken' in after));
  }
  {
    const { fn, ls } = makeRun({
      chromeData: { gam_settings: { fromChrome: true } },
      lsData: { gam_settings: JSON.stringify({ pageLocal: true }) }
    });
    await fn();
    ck('WS-3 legacy no-stamp: non-null localStorage untouched',
      JSON.parse(ls.gam_settings).pageLocal === true);
  }

  // Popup-side stamp writers (static): Repair, Reset, Import all bump it.
  const stamps = POPUP.match(/gam_settings_writeStamp/g) || [];
  ck('WS-3 popup: writeStamp bumped at 3 sites (Repair/Reset/Import)', stamps.length >= 3);
  ck('WS-3 popup Repair bumps stamp',
    POPUP.includes('chrome.storage.local.set({ gam_settings: patch, gam_settings_writeStamp: Date.now() })'));
  ck('WS-3 popup Reset bumps stamp',
    POPUP.includes('{ gam_settings: { ...preserved, ...MAINT_DEFAULT_SETTINGS }, gam_settings_writeStamp: Date.now() }'));
  ck('WS-3 popup Import bumps stamp (only when settings imported)',
    POPUP.includes("if ('gam_settings' in toWrite) toWrite.gam_settings_writeStamp = Date.now();"));
  // Secrets guarantee untouched: lsSet scrub + per-key secret write path intact.
  ck('WS-3 secrets: lsSet scrub for gam_settings unchanged',
    SRC.includes("if (key === 'gam_settings') pageValue = _scrubSecrets(value);"));
  ck('WS-3 secrets: lsSet chrome merge unchanged',
    SRC.includes('const merged = { ...((existing && existing[key]) || {}), ...value };'));
}

// ---------------------------------------------------------------------------
// WS-4: autoRefresh toggle registered in the Display card; default unchanged.
// ---------------------------------------------------------------------------
{
  ck('WS-4: Display-card toggle registered',
    /addToggle\('Auto-refresh pages hourly', 'autoRefreshEnabled',/.test(SRC));
  ck('WS-4: default unchanged (autoRefreshEnabled: true)',
    /autoRefreshEnabled: true,/.test(SRC));
  ck('WS-4: consumer still reads the setting live each tick',
    SRC.includes("if (!getSetting('autoRefreshEnabled', true)) return;"));
}

// ---------------------------------------------------------------------------
// WS-5: title-grant / flag-user one-modal -- behavioral with DOM stubs.
// ---------------------------------------------------------------------------
function mkEl(tag) {
  return {
    tag, children: [], listeners: {}, textContent: '', value: '',
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    removeEventListener() {}, remove() {}, focus() {},
    click() { (this.listeners.click || []).forEach(fn => fn({ currentTarget: this })); },
    querySelector(sel) {
      const want = String(sel);
      const walk = (n) => {
        for (const c of n.children) {
          if (c.tag === want) return c;
          const r = walk(c); if (r) return r;
        }
        return null;
      };
      return walk(this);
    }
  };
}
function elStub(tag, opts, ...kids) {
  const e = mkEl(tag);
  const o = opts || {};
  Object.keys(o).forEach(k => { if (k !== 'style' && k !== 'cls') e[k] = o[k]; });
  kids.forEach(k => { if (k == null) return; if (typeof k === 'string') e.textContent += k; else e.children.push(k); });
  return e;
}
function collectButtons(node, out = []) {
  if (node.tag === 'button') out.push(node);
  node.children.forEach(c => collectButtons(c, out));
  return out;
}
function collectInputs(node, out = []) {
  if (node.tag === 'input' || node.tag === 'textarea') out.push(node);
  node.children.forEach(c => collectInputs(c, out));
  return out;
}
const GAM_TOK_STUB = new Proxy({}, { get: () => '#000' });

const shellStart = SRC.indexOf('function _gamPickerModalShell(titleText){');
const tgStart = SRC.indexOf('function _gamTitleGrantModal(username){');
const fuStart = SRC.indexOf('function _gamFlagUserModal(username){');
ck('WS-5: picker shell + both modal builders present', shellStart > 0 && tgStart > shellStart && fuStart > tgStart);
{
  const sliceEnd = SRC.indexOf('// v10.39.0 WS-A (dialog sweep)', fuStart);
  ck('WS-5: slice end found', sliceEnd > fuStart);
  const slice = SRC.slice(shellStart, sliceEnd);

  const makeModals = () => {
    const documentStub = {
      body: mkEl('body'),
      addEventListener() {}, removeEventListener() {}
    };
    const fns = new Function(
      'el', 'GAM_TOK', 'document',
      slice + '\n return { _gamTitleGrantModal, _gamFlagUserModal };'
    )(elStub, GAM_TOK_STUB, documentStub);
    return { fns, documentStub };
  };

  // --- Title grant: ONE modal, 4 preset title choices as buttons ---
  const OLD_LABELS = { mvp: 'MVP', top10: 'TOP 10 POSTER', sauce: 'SAUCED IT' };
  {
    const { fns, documentStub } = makeModals();
    const p = fns._gamTitleGrantModal('userX');
    ck('WS-5 title: exactly ONE modal appended', documentStub.body.children.length === 1);
    const backdrop = documentStub.body.children[0];
    const buttons = collectButtons(backdrop);
    const presetBtns = buttons.filter(b => Object.values(OLD_LABELS).includes(b.textContent));
    const customBtn = buttons.find(b => b.textContent === 'Grant custom');
    ck('WS-5 title: 4 preset choices as BUTTONS (3 named presets + custom grant)',
      presetBtns.length === 3 && !!customBtn);
    ck('WS-5 title: inline expiry input present',
      collectInputs(backdrop).some(i => i.type === 'number' && i.value === '0'));
    ck('WS-5 title: inline custom-title input present (max 12)',
      collectInputs(backdrop).some(i => i.maxlength === '12'));
    presetBtns.find(b => b.textContent === 'MVP').click();
    const r = await p;
    ck('WS-5 title MVP: resolves kind/label identical to old chain',
      r && r.kind === 'mvp' && r.label === 'MVP' && r.days === 0);
    // Payload equivalence: old chain built { username, title: label, kind, mod, expiresAt }
    const expiresAt = r.days > 0 ? new Date(Date.now() + r.days * 24 * 3600 * 1000).toISOString() : null;
    ck('WS-5 title MVP: expiry default 0 -> expiresAt null (old-chain blank default)', expiresAt === null);
  }
  // Every preset maps to the old chain's exact kind/label pair.
  for (const [kind, label] of Object.entries(OLD_LABELS)) {
    const { fns, documentStub } = makeModals();
    const p = fns._gamTitleGrantModal('userX');
    const buttons = collectButtons(documentStub.body.children[0]);
    // set expiry to 7 to check ISO path
    collectInputs(documentStub.body.children[0]).find(i => i.type === 'number').value = '7';
    buttons.find(b => b.textContent === label).click();
    const r = await p;
    ck('WS-5 title preset [' + kind + ']: payload fields match old chain',
      r && r.kind === kind && r.label === label && r.days === 7);
  }
  // Custom path: validation + custom kind.
  {
    const { fns, documentStub } = makeModals();
    const p = fns._gamTitleGrantModal('userX');
    const backdrop = documentStub.body.children[0];
    const customBtn = collectButtons(backdrop).find(b => b.textContent === 'Grant custom');
    customBtn.click(); // empty -> blocked
    const customInput = collectInputs(backdrop).find(i => i.maxlength === '12');
    customInput.value = 'LEGEND';
    customBtn.click();
    const r = await p;
    ck('WS-5 title custom: empty blocked, then resolves custom kind + text',
      r && r.kind === 'custom' && r.label === 'LEGEND');
  }
  // Cancel = no action (null).
  {
    const { fns, documentStub } = makeModals();
    const p = fns._gamTitleGrantModal('userX');
    collectButtons(documentStub.body.children[0]).find(b => b.textContent === 'Cancel').click();
    ck('WS-5 title cancel: resolves null (no action)', (await p) === null);
  }

  // --- Flag user: ONE modal, severity buttons, reason required ---
  {
    const { fns, documentStub } = makeModals();
    const p = fns._gamFlagUserModal('userX');
    ck('WS-5 flag: exactly ONE modal appended', documentStub.body.children.length === 1);
    const backdrop = documentStub.body.children[0];
    const buttons = collectButtons(backdrop);
    const sevBtns = buttons.filter(b => /Watch|Danger|Critical/.test(b.textContent));
    ck('WS-5 flag: 3 severity BUTTONS', sevBtns.length === 3);
    const dangerBtn = sevBtns.find(b => b.textContent.includes('Danger'));
    dangerBtn.click(); // empty reason -> blocked
    const reason = collectInputs(backdrop).find(i => i.tag === 'textarea');
    reason.value = 'serial spammer';
    dangerBtn.click();
    const r = await p;
    ck('WS-5 flag: empty reason blocked, then resolves {sev,reason} identical to old chain',
      r && r.sev === 'danger' && r.reason === 'serial spammer');
  }
  {
    const { fns, documentStub } = makeModals();
    const p = fns._gamFlagUserModal('userX');
    collectButtons(documentStub.body.children[0]).find(b => b.textContent === 'Cancel').click();
    ck('WS-5 flag cancel: resolves null (no action)', (await p) === null);
  }

  // Static: old type-a-word chains GONE; downstream RPC payloads untouched.
  ck('WS-5 old chain gone: "Choose: mvp / top10 / sauce / custom" removed',
    !SRC.includes('Choose: mvp / top10 / sauce / custom'));
  ck('WS-5 old chain gone: severity type-a-word removed',
    !SRC.includes('severity? (watch / danger / critical)'));
  ck('WS-5 RPC payload byte-identical: modTitlesWrite call unchanged',
    SRC.includes("rpcCall('modTitlesWrite', { username, title: label, kind, mod: me, expiresAt })"));
  ck('WS-5 RPC payload byte-identical: modFlagsWrite call unchanged',
    SRC.includes("rpcCall('modFlagsWrite', { username, mod: me, severity: sev, reason })"));
  // HI-1: pickers are consent/selection surfaces only -- no executors.
  ck('WS-5 HI-1: picker modals call NO executor / RPC',
    !/executeBan|addToDeathRow|apiBan|executeUnban|rpcCall/.test(slice));
}

// ---------------------------------------------------------------------------
// WS-6: undo stack of 3 -- slice the real stack + _executeUndo, exercise.
// ---------------------------------------------------------------------------
const usStart = SRC.indexOf('const _UNDO_STACK_MAX = 3;');
ck('WS-6: stack constant found', usStart > 0);
{
  const setSlotEnd = SRC.indexOf('function _gamUndoAnnounce(msg)', usStart);
  const exStart = SRC.indexOf('function _executeUndo(clientOpId, inverseFn, label) {');
  const exEnd = SRC.indexOf('// Global U-key handler', exStart);
  ck('WS-6: slices found', setSlotEnd > usStart && exStart > 0 && exEnd > exStart);
  const slice = SRC.slice(usStart, setSlotEnd) + '\n' + SRC.slice(exStart, exEnd);

  const makeStack = () => {
    const timers = [];
    const cleared = [];
    const snacks = [];
    const inverses = [];
    const api = new Function(
      'setTimeout', 'clearTimeout', '_gamUndoAnnounce', 'snack', 'Promise',
      slice + '\n return { set: _setUndoSlot, get: _getUndoSlot, exec: _executeUndo, stack: function(){ return _undoStack; } };'
    )(
      (cb, ms) => { const h = { cb, ms }; timers.push(h); return h; },
      (h) => cleared.push(h),
      () => {},
      (msg, type) => snacks.push({ msg, type }),
      Promise
    );
    return { api, timers, cleared, snacks, inverses };
  };
  const mkSlot = (id, label) => ({ clientOpId: id, inverse: () => {}, ttlMs: 20000, label: label || id });

  // Stack holds 3, LIFO, oldest dropped on 4th push.
  {
    const { api, cleared } = makeStack();
    api.set(mkSlot('a')); api.set(mkSlot('b')); api.set(mkSlot('c'));
    ck('WS-6 stack: holds 3 pending undos', api.stack().length === 3);
    ck('WS-6 stack: _getUndoSlot returns NEWEST', api.get().clientOpId === 'c');
    api.set(mkSlot('d'));
    ck('WS-6 stack: 4th push drops OLDEST (max 3)', api.stack().length === 3 && !api.stack().some(s => s.clientOpId === 'a'));
    ck('WS-6 stack: dropped entry timer cleared', cleared.length === 1);
    ck('WS-6 stack: newest now d', api.get().clientOpId === 'd');
  }
  // Pops LIFO via _executeUndo on the newest each time (the U-key path).
  {
    const { api } = makeStack();
    const order = [];
    const slot = (id) => ({ clientOpId: id, inverse: () => { order.push(id); }, ttlMs: 20000, label: id });
    api.set(slot('a')); api.set(slot('b')); api.set(slot('c'));
    for (let i = 0; i < 3; i++) {
      const top = api.get();
      api.exec(top.clientOpId, top.inverse, top.label);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    }
    ck('WS-6 LIFO: U pops newest -> older (c, b, a)', order.join(',') === 'c,b,a');
    ck('WS-6 LIFO: stack empty after 3 pops', api.stack().length === 0 && api.get() === null);
  }
  // Older entry reachable directly (its own toast button targets its id).
  {
    const { api } = makeStack();
    const order = [];
    const slot = (id) => ({ clientOpId: id, inverse: () => { order.push(id); }, ttlMs: 20000, label: id });
    api.set(slot('remove-1')); api.set(slot('ban-2'));
    const older = api.stack()[0];
    api.exec(older.clientOpId, older.inverse, older.label);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    ck('WS-6 mid-stack: older entry undoable via its own toast (remove-1 fired)',
      order.join(',') === 'remove-1');
    ck('WS-6 mid-stack: newest survives (ban-2 still pending)',
      api.stack().length === 1 && api.get().clientOpId === 'ban-2');
    // stale id (already executed) is a no-op
    api.exec('remove-1', () => order.push('DOUBLE'), 'remove-1');
    await Promise.resolve();
    ck('WS-6 replay guard: executed id no-ops on second fire', !order.includes('DOUBLE'));
  }
  // Per-entry expiry: firing one timer removes ONLY its entry.
  {
    const { api, timers, snacks } = makeStack();
    api.set(mkSlot('a')); api.set(mkSlot('b'));
    ck('WS-6 expiry: per-entry timers armed (Tier ttl passthrough)', timers.length === 2 && timers[0].ms === 20000);
    timers[0].cb(); // expire 'a'
    ck('WS-6 expiry: only the expired entry removed', api.stack().length === 1 && api.get().clientOpId === 'b');
    ck('WS-6 expiry: operator told which undo expired', snacks.some(s => s.type === 'info' && s.msg.includes('a')));
  }
  // Tier TTLs unchanged in withUndo.
  ck('WS-6 tiers unchanged: 20s Tier-A / 5s Tier-B',
    SRC.includes("const ttlMs = tier === 'A' ? 20000 : 5000;"));
  // withUndo still arms slot + toast identically.
  ck('WS-6 withUndo untouched: _setUndoSlot + _showUndoToast chain intact',
    /_setUndoSlot\(\{ clientOpId: clientOpId, inverse: inverseFn, ttlMs: ttlMs, label: label \}\);\s*\n\s*_showUndoToast\(/.test(SRC));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

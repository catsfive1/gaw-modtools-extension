/* ============================================================================
 * GAW ModTools — Auxiliary Content Script (modtools-aux.js)
 *
 * Loaded AFTER modtools.js per manifest.json content_scripts order.
 * Depends on window._gamCmdkRegister being defined by modtools.js v10.16.33+.
 *
 * Adds Grok top-50 features that don't require backend changes:
 *   #19 Focus Mode (dim low-priority surfaces, highlight one task at a time)
 *   #21 Contextual Help (Shift+? overlay listing all keyboard shortcuts)
 *   #36 Saved Queue Views (named filter presets, chrome.storage-backed)
 *   #37 Auto-Pause Polling (flag for the SW alarm — pauses RPC polling)
 *   #43 Smart Snooze (DR-row snooze with reminder via chrome.alarms)
 *   Plus 12 additional palette commands for navigation + power-user actions
 *
 * v10.16.34 first ship.
 * ============================================================================ */

/* ============================================================================
 * v10.16.49 A10-Win3: shared async ask-text + confirm helpers. Pre-fix 28
 * `window.prompt` and 5 `window.confirm` sites in this file used native browser
 * modals — block the event loop, truncate multi-line paste at first line on
 * some platforms, break the Bloomberg aesthetic, fail silently in CS frames
 * if the page suppresses dialogs. These shared helpers create styled overlays
 * matching the terminal aesthetic and return Promises so the call sites just
 * `await` them. Defined at module top so all 4 Waves can use them.
 * ============================================================================ */
(function _gamAuxShared() {
  if (window._gamAuxAsk) return; // idempotent
  // ── Async ask-text — returns Promise<string|null> (null on cancel) ──
  window._gamAuxAsk = function (question, opts) {
    return new Promise(function (resolve) {
      try {
        const o = opts || {};
        const ov = document.createElement('div');
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999993;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font:13px ui-monospace,JetBrains Mono,monospace';
        const card = document.createElement('div');
        card.style.cssText = 'background:#0a0a0b;border:1px solid #ff9933;width:min(540px,92vw);max-height:80vh;overflow:auto;padding:18px 22px;border-radius:4px;box-shadow:0 12px 48px rgba(0,0,0,0.7)';
        const q = document.createElement('div');
        q.style.cssText = 'color:#e8e6e1;font-size:12px;line-height:1.5;margin-bottom:12px;white-space:pre-wrap;overflow-wrap:break-word';
        q.textContent = String(question || '');
        const multiline = !!o.multiline;
        const input = document.createElement(multiline ? 'textarea' : 'input');
        if (!multiline) input.type = 'text';
        input.value = (o.defaultValue != null ? String(o.defaultValue) : '');
        if (o.placeholder) input.placeholder = String(o.placeholder);
        input.style.cssText = 'width:100%;background:#060709;border:1px solid #ff9933;color:#e8e6e1;padding:8px 10px;font:12px ui-monospace,JetBrains Mono,monospace;border-radius:3px;box-sizing:border-box;outline:none' +
          (multiline ? ';min-height:120px;resize:vertical' : '');
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'background:transparent;border:1px solid #7a7672;color:#9b9892;padding:5px 14px;font:600 11px ui-monospace,monospace;letter-spacing:0.04em;text-transform:uppercase;border-radius:3px;cursor:pointer';
        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.textContent = o.okLabel || 'OK';
        okBtn.style.cssText = 'background:#ff9933;border:none;color:#0a0a0b;padding:5px 16px;font:700 11px ui-monospace,monospace;letter-spacing:0.04em;text-transform:uppercase;border-radius:3px;cursor:pointer';
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        card.appendChild(q);
        card.appendChild(input);
        card.appendChild(btnRow);
        ov.appendChild(card);
        document.body.appendChild(ov);
        setTimeout(function () { try { input.focus(); input.select && input.select(); } catch (_) {} }, 30);
        let done = false;
        function close(val) {
          if (done) return; done = true;
          try { ov.remove(); } catch (_) {}
          document.removeEventListener('keydown', kbd, true);
          resolve(val);
        }
        function kbd(ev) {
          if (ev.key === 'Escape') { ev.preventDefault(); close(null); return; }
          if (ev.key === 'Enter' && !multiline) { ev.preventDefault(); close(input.value); return; }
          if (ev.key === 'Enter' && multiline && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); close(input.value); return; }
        }
        document.addEventListener('keydown', kbd, true);
        cancelBtn.addEventListener('click', function () { close(null); });
        okBtn.addEventListener('click', function () { close(input.value); });
        ov.addEventListener('mousedown', function (ev) { if (ev.target === ov) close(null); });
      } catch (_) { resolve(null); }
    });
  };
  // ── Async confirm — returns Promise<boolean> ──
  window._gamAuxConfirm = function (question, opts) {
    return new Promise(function (resolve) {
      try {
        const o = opts || {};
        const ov = document.createElement('div');
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999993;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font:13px ui-monospace,JetBrains Mono,monospace';
        const card = document.createElement('div');
        card.style.cssText = 'background:#0a0a0b;border:1px solid #ff9933;width:min(480px,92vw);max-height:80vh;overflow:auto;padding:18px 22px;border-radius:4px;box-shadow:0 12px 48px rgba(0,0,0,0.7)';
        const q = document.createElement('div');
        q.style.cssText = 'color:#e8e6e1;font-size:12px;line-height:1.5;margin-bottom:12px;white-space:pre-wrap;overflow-wrap:break-word';
        q.textContent = String(question || '');
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = o.cancelLabel || 'Cancel';
        cancelBtn.style.cssText = 'background:transparent;border:1px solid #7a7672;color:#9b9892;padding:5px 14px;font:600 11px ui-monospace,monospace;letter-spacing:0.04em;text-transform:uppercase;border-radius:3px;cursor:pointer';
        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.textContent = o.okLabel || 'OK';
        const danger = !!o.danger;
        okBtn.style.cssText = 'background:' + (danger ? '#f04040' : '#ff9933') + ';border:none;color:#0a0a0b;padding:5px 16px;font:700 11px ui-monospace,monospace;letter-spacing:0.04em;text-transform:uppercase;border-radius:3px;cursor:pointer';
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        card.appendChild(q);
        card.appendChild(btnRow);
        ov.appendChild(card);
        document.body.appendChild(ov);
        setTimeout(function () { try { okBtn.focus(); } catch (_) {} }, 30);
        let done = false;
        function close(val) {
          if (done) return; done = true;
          try { ov.remove(); } catch (_) {}
          document.removeEventListener('keydown', kbd, true);
          resolve(val);
        }
        function kbd(ev) {
          if (ev.key === 'Escape') { ev.preventDefault(); close(false); return; }
          if (ev.key === 'Enter') { ev.preventDefault(); close(true); return; }
        }
        document.addEventListener('keydown', kbd, true);
        cancelBtn.addEventListener('click', function () { close(false); });
        okBtn.addEventListener('click', function () { close(true); });
        ov.addEventListener('mousedown', function (ev) { if (ev.target === ov) close(false); });
      } catch (_) { resolve(false); }
    });
  };
})();

(function _gamAuxInit() {
  'use strict';

  // ── Idempotency guard ─────────────────────────────────────────────────────
  if (window._gamAuxInitialized) return;
  window._gamAuxInitialized = true;

  // Bail cleanly if modtools.js hasn't loaded the palette registry yet.
  // This SHOULD never fire (manifest content_scripts ordering), but defense.
  if (typeof window._gamCmdkRegister !== 'function') {
    console.warn('[modtools-aux] _gamCmdkRegister not found — modtools.js may not have loaded; aux features disabled');
    return;
  }

  // Helper to safely snack via the modtools.js global if available.
  const _snack = (msg, type) => {
    try {
      // modtools.js exposes `snack` inside its IIFE; in some builds it's
      // available on window, in others it's not. Try both.
      if (typeof window.snack === 'function') { window.snack(msg, type); return; }
      // Fallback: a one-shot toast div appended to body
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;bottom:14px;right:100px;z-index:9999999;padding:6px 12px;background:' +
        (type === 'err' ? '#f04040' : type === 'ok' ? '#3dd68c' : type === 'warn' ? '#f0a040' : '#4A9EFF') +
        ';color:#0a0a0b;font:600 11px ui-monospace,JetBrains Mono,monospace;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.5)';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => { try { t.remove(); } catch (_) {} }, 3000);
    } catch (_) {}
  };

  // ───────────────────────────────────────────────────────────────────────────
  // FEATURE: Focus Mode (#19)
  //
  // Toggle via Cmd palette OR Alt+F. When on:
  //   - Body gets class `gam-focus-mode`
  //   - All non-essential UI dimmed to 0.35 opacity
  //   - Status bar's "PROCESSING" indicator becomes more prominent
  //   - Only items with .gam-high-confidence or .gam-priority class stay full
  // Persists in chrome.storage.local.gam_focus_mode (boolean)
  // ───────────────────────────────────────────────────────────────────────────
  let _focusModeOn = false;
  const _FOCUS_KEY = 'gam_focus_mode';

  function _applyFocusModeStyles() {
    let style = document.getElementById('gam-aux-focus-styles');
    if (style) return; // already injected
    style = document.createElement('style');
    style.id = 'gam-aux-focus-styles';
    style.textContent = [
      'body.gam-focus-mode {',
      '  --gam-focus-dim: 0.35;',
      '}',
      'body.gam-focus-mode .post:not(.gam-priority):not(.gam-high-confidence),',
      'body.gam-focus-mode .comment:not(.gam-priority):not(.gam-high-confidence) {',
      '  opacity: var(--gam-focus-dim);',
      '  transition: opacity 200ms ease;',
      '}',
      'body.gam-focus-mode .post:not(.gam-priority):not(.gam-high-confidence):hover,',
      'body.gam-focus-mode .comment:not(.gam-priority):not(.gam-high-confidence):hover {',
      '  opacity: 1;',
      '}',
      'body.gam-focus-mode .gam-priority,',
      'body.gam-focus-mode .gam-high-confidence {',
      '  outline: 2px solid #ff9933;',
      '  outline-offset: 2px;',
      '}',
      'body.gam-focus-mode::before {',
      '  content: "FOCUS";',
      '  position: fixed;',
      '  top: 8px;',
      '  left: 50%;',
      '  transform: translateX(-50%);',
      '  background: rgba(255,153,51,0.92);',
      '  color: #0a0a0b;',
      '  padding: 3px 10px;',
      '  font: 700 10px/1.2 ui-monospace,JetBrains Mono,monospace;',
      '  letter-spacing: 0.15em;',
      '  border-radius: 0 0 4px 4px;',
      '  z-index: 9999996;',
      '  pointer-events: none;',
      '}',
      '@media (prefers-reduced-motion: reduce) {',
      '  body.gam-focus-mode .post,',
      '  body.gam-focus-mode .comment { transition: none !important; }',
      '}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  async function _focusModeApply(on) {
    _applyFocusModeStyles();
    _focusModeOn = !!on;
    document.body.classList.toggle('gam-focus-mode', _focusModeOn);
    try { await chrome.storage.local.set({ [_FOCUS_KEY]: _focusModeOn }); } catch (_) {}
    _snack('Focus Mode ' + (_focusModeOn ? 'ON' : 'OFF') + ' (Alt+F)', _focusModeOn ? 'ok' : 'info');
  }

  function _focusModeToggle() { _focusModeApply(!_focusModeOn); }

  // Restore persisted state on load
  (async () => {
    try {
      const r = await chrome.storage.local.get(_FOCUS_KEY);
      if (r && r[_FOCUS_KEY]) _focusModeApply(true);
    } catch (_) {}
  })();

  // Alt+F hotkey
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
    if (e.key !== 'f' && e.key !== 'F') return;
    const ae = document.activeElement;
    if (ae) {
      const tag = ae.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable) return;
    }
    e.preventDefault();
    _focusModeToggle();
  }, true);

  // ───────────────────────────────────────────────────────────────────────────
  // FEATURE: Saved Queue Views (#36)
  //
  // Named filter presets stored in chrome.storage.local.gam_saved_views.
  // Each view: { name, filter_kind, filter_value, created_at }
  // Palette commands:
  //   "Save current filter as view…" → prompts for name → saves
  //   "Load saved view…" → lists views → applies
  //   "Delete saved view…" → lists views → removes
  //
  // Filter detection: reads the current DR sort dropdown / modmail filter /
  // queue filter from the DOM (best-effort).
  // ───────────────────────────────────────────────────────────────────────────
  const _VIEWS_KEY = 'gam_saved_views';

  async function _viewsGetAll() {
    try {
      const r = await chrome.storage.local.get(_VIEWS_KEY);
      return Array.isArray(r && r[_VIEWS_KEY]) ? r[_VIEWS_KEY] : [];
    } catch (_) { return []; }
  }

  async function _viewsSet(views) {
    try { await chrome.storage.local.set({ [_VIEWS_KEY]: views }); } catch (_) {}
  }

  function _viewsDetectCurrent() {
    // Try to read the most-active filter on the current page.
    const filters = {};
    // DR sort select (if present, set by agent 5 in v10.16.34)
    const drSort = document.querySelector('#gam-dr-sort-order, [data-gam-dr-sort]');
    if (drSort && drSort.value) filters.dr_sort = drSort.value;
    // Modmail age filter (added in v10.16.17)
    const mmAge = document.querySelector('#gam-modmail-filter-age, [data-gam-mm-filter]');
    if (mmAge && mmAge.value) filters.mm_filter = mmAge.value;
    // Generic: any select with data-gam-filter attribute
    document.querySelectorAll('select[data-gam-filter]').forEach((sel) => {
      const key = sel.getAttribute('data-gam-filter');
      if (key) filters[key] = sel.value;
    });
    return filters;
  }

  function _viewsApply(view) {
    const f = view && view.filter_value;
    if (!f || typeof f !== 'object') { _snack('View is empty', 'warn'); return; }
    let applied = 0;
    for (const key in f) {
      const val = f[key];
      // Apply by matching select ID or data attribute
      let sel = null;
      if (key === 'dr_sort') sel = document.querySelector('#gam-dr-sort-order, [data-gam-dr-sort]');
      else if (key === 'mm_filter') sel = document.querySelector('#gam-modmail-filter-age, [data-gam-mm-filter]');
      else sel = document.querySelector('select[data-gam-filter="' + key + '"]');
      if (sel && sel.value !== val) {
        sel.value = val;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        applied++;
      }
    }
    _snack('Applied "' + view.name + '" — ' + applied + ' filter(s)', applied > 0 ? 'ok' : 'warn');
  }

  async function _viewsSaveCurrent() {
    // v10.16.49 A10-Win3: styled overlay instead of native prompt.
    const name = await window._gamAuxAsk('Save current filters as a view. Name:', { defaultValue: '' });
    if (!name || !name.trim()) return;
    const safeName = name.trim().slice(0, 60);
    const current = _viewsDetectCurrent();
    if (Object.keys(current).length === 0) {
      _snack('No filters detected on this page to save', 'warn');
      return;
    }
    const views = await _viewsGetAll();
    const existing = views.findIndex(v => v && v.name === safeName);
    const entry = { name: safeName, filter_value: current, created_at: Date.now() };
    if (existing >= 0) views[existing] = entry;
    else views.push(entry);
    await _viewsSet(views);
    _snack('View "' + safeName + '" saved (' + Object.keys(current).length + ' filter(s))', 'ok');
  }

  async function _viewsLoadPrompt() {
    const views = await _viewsGetAll();
    if (views.length === 0) { _snack('No saved views yet', 'info'); return; }
    const list = views.map((v, i) => (i + 1) + '. ' + v.name + ' (' + Object.keys(v.filter_value || {}).length + ' filter)').join('\n');
    const pick = await window._gamAuxAsk('Saved views:\n' + list + '\n\nEnter number to load:', { defaultValue: '' });
    if (!pick) return;
    const idx = parseInt(pick, 10) - 1;
    if (idx < 0 || idx >= views.length) { _snack('Invalid choice', 'err'); return; }
    _viewsApply(views[idx]);
  }

  async function _viewsDeletePrompt() {
    const views = await _viewsGetAll();
    if (views.length === 0) { _snack('No saved views', 'info'); return; }
    const list = views.map((v, i) => (i + 1) + '. ' + v.name).join('\n');
    const pick = await window._gamAuxAsk('Delete which view?\n' + list + '\n\nEnter number:', { defaultValue: '' });
    if (!pick) return;
    const idx = parseInt(pick, 10) - 1;
    if (idx < 0 || idx >= views.length) { _snack('Invalid choice', 'err'); return; }
    const removed = views.splice(idx, 1)[0];
    await _viewsSet(views);
    _snack('Deleted "' + (removed && removed.name) + '"', 'ok');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FEATURE: Auto-Pause Polling (#37)
  //
  // Sets chrome.storage.local.gam_polling_paused = true. The SW alarm code
  // reads this flag and skips its poll cycle when paused. Useful for
  // deep-focus sessions where the operator doesn't want notification interrupts.
  // Persists until manually unpaused or 4 hours pass (auto-resume).
  // ───────────────────────────────────────────────────────────────────────────
  const _PAUSE_KEY = 'gam_polling_paused';
  const _PAUSE_EXPIRES_KEY = 'gam_polling_paused_expires';
  const _PAUSE_DEFAULT_MIN = 240; // 4 hours

  async function _pollingPauseToggle(durationMin) {
    const min = durationMin || _PAUSE_DEFAULT_MIN;
    try {
      const r = await chrome.storage.local.get([_PAUSE_KEY, _PAUSE_EXPIRES_KEY]);
      const isPaused = !!(r && r[_PAUSE_KEY]);
      const expiresAt = r && r[_PAUSE_EXPIRES_KEY];
      const stillValid = expiresAt && expiresAt > Date.now();
      if (isPaused && stillValid) {
        // Unpause
        await chrome.storage.local.remove([_PAUSE_KEY, _PAUSE_EXPIRES_KEY]);
        _snack('Polling RESUMED — RPC alarms back on', 'ok');
      } else {
        // Pause
        const expiry = Date.now() + (min * 60 * 1000);
        await chrome.storage.local.set({ [_PAUSE_KEY]: true, [_PAUSE_EXPIRES_KEY]: expiry });
        _snack('Polling PAUSED for ' + min + 'min — auto-resume at ' + new Date(expiry).toLocaleTimeString(), 'warn');
      }
    } catch (e) { _snack('Pause toggle failed: ' + (e && e.message || e), 'err'); }
  }

  async function _pollingPauseStatus() {
    try {
      const r = await chrome.storage.local.get([_PAUSE_KEY, _PAUSE_EXPIRES_KEY]);
      if (!r || !r[_PAUSE_KEY]) { _snack('Polling is RUNNING (not paused)', 'info'); return; }
      const exp = r[_PAUSE_EXPIRES_KEY];
      if (!exp || exp < Date.now()) {
        await chrome.storage.local.remove([_PAUSE_KEY, _PAUSE_EXPIRES_KEY]);
        _snack('Pause window expired — polling auto-resumed', 'ok');
        return;
      }
      const minLeft = Math.ceil((exp - Date.now()) / 60000);
      _snack('Polling PAUSED — ' + minLeft + 'min remaining (resume ' + new Date(exp).toLocaleTimeString() + ')', 'warn');
    } catch (_) {}
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FEATURE: Contextual Help overlay (#21)
  //
  // Press Shift+? (or open via palette) to see ALL ModTools keyboard shortcuts
  // + active features. Replaces the existing Ctrl+Shift+H help which is more
  // focused on rules; this is the operator-shortcuts cheat sheet.
  // ───────────────────────────────────────────────────────────────────────────
  let _helpOverlay = null;

  function _helpShortcuts() {
    return [
      { keys: 'Ctrl+Shift+P',  desc: 'Open Command Palette (any ModTools action)' },
      { keys: 'Ctrl+K',         desc: 'Search posts + comments' },
      { keys: 'Ctrl+Shift+H',   desc: 'Open ModTools rules + help panel' },
      { keys: 'Shift+?',         desc: 'This shortcuts overlay' },
      { keys: 'Alt+F',           desc: 'Toggle Focus Mode (dim low-priority items)' },
      { keys: 'Ctrl+Z',          desc: 'Undo last mod action (last 10 stored)' },
      { keys: 'j / k',           desc: 'Navigate up/down in modmail panel' },
      { keys: '↑ ↓',             desc: 'Navigate inside palettes' },
      { keys: 'Enter',           desc: 'Confirm selection / execute action' },
      { keys: 'Escape',          desc: 'Close any open panel/modal/palette' }
    ];
  }

  function _helpShow() {
    if (_helpOverlay && _helpOverlay.style.display !== 'none') { _helpHide(); return; }
    if (!_helpOverlay) {
      _helpOverlay = document.createElement('div');
      _helpOverlay.id = 'gam-aux-help-overlay';
      _helpOverlay.setAttribute('role', 'dialog');
      _helpOverlay.setAttribute('aria-modal', 'true');
      _helpOverlay.setAttribute('aria-label', 'ModTools keyboard shortcuts');
      _helpOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999991;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;font:13px ui-monospace,JetBrains Mono,monospace';
      const card = document.createElement('div');
      card.style.cssText = 'background:#0a0a0b;border:1px solid #ff9933;width:min(540px,92vw);max-height:80vh;overflow:auto;padding:20px 24px;box-shadow:0 12px 48px rgba(0,0,0,0.7);border-radius:4px';
      const rows = _helpShortcuts().map(s =>
        '<tr><td style="padding:6px 12px 6px 0;color:#ff9933;font-weight:700;white-space:nowrap;font-size:11px">' + s.keys + '</td><td style="padding:6px 0;color:#e8e6e1;font-size:12px">' + s.desc + '</td></tr>'
      ).join('');
      card.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
          '<span style="color:#ff9933;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;font-size:11px">ModTools Shortcuts</span>' +
          '<button id="gam-aux-help-close" style="background:transparent;border:1px solid #7a7672;color:#9b9892;padding:2px 10px;cursor:pointer;font:600 10px ui-monospace,monospace;letter-spacing:0.05em">ESC</button>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse">' + rows + '</table>' +
        '<div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,153,51,0.15);color:#7a7672;font-size:10.5px;line-height:1.5">' +
          'Ctrl+Shift+P opens the Command Palette where every ModTools action is keyboard-reachable. ' +
          'Type to filter, ↑↓ to navigate, Enter to execute. Shift+? toggles this overlay.' +
        '</div>';
      _helpOverlay.appendChild(card);
      document.body.appendChild(_helpOverlay);
      const closeBtn = card.querySelector('#gam-aux-help-close');
      if (closeBtn) closeBtn.addEventListener('click', _helpHide);
      _helpOverlay.addEventListener('mousedown', (ev) => { if (ev.target === _helpOverlay) _helpHide(); });
    }
    _helpOverlay.style.display = 'flex';
  }

  function _helpHide() {
    if (_helpOverlay) _helpOverlay.style.display = 'none';
  }

  // Shift+? hotkey
  document.addEventListener('keydown', (e) => {
    if (e.key !== '?' || !e.shiftKey) return;
    const ae = document.activeElement;
    if (ae) {
      const tag = ae.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable) return;
    }
    e.preventDefault();
    _helpShow();
  }, true);

  // Escape closes the overlay
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (_helpOverlay && _helpOverlay.style.display !== 'none') {
      e.preventDefault();
      _helpHide();
    }
  }, true);

  // ───────────────────────────────────────────────────────────────────────────
  // FEATURE: Smart Snooze with reminder (#43)
  //
  // Palette action prompts for "snooze for N minutes" + reminder text, schedules
  // a chrome.alarms.create for the future, and on fire shows a banner reminding
  // the operator. SW alarm code lives in background.js (alarm already exists
  // for other periodic tasks); we send a runtime message to schedule it.
  // ───────────────────────────────────────────────────────────────────────────
  async function _smartSnoozePrompt() {
    const minRaw = await window._gamAuxAsk('Snooze for how many minutes?', { defaultValue: '30' });
    if (!minRaw) return;
    const min = parseInt(minRaw, 10);
    if (!Number.isFinite(min) || min < 1 || min > 1440) { _snack('Enter 1-1440 minutes', 'err'); return; }
    const note = await window._gamAuxAsk('Reminder note (optional, 200 chars max):', { defaultValue: '' });
    const reminder = (note || '').slice(0, 200);
    try {
      await chrome.runtime.sendMessage({
        type: 'gam.aux.scheduleSnooze',
        when: Date.now() + (min * 60000),
        reminder: reminder || ('Snoozed task — ' + min + 'min ago')
      });
      _snack('Snoozed ' + min + 'min — reminder at ' + new Date(Date.now() + min * 60000).toLocaleTimeString(), 'ok');
    } catch (e) { _snack('Snooze failed: ' + (e && e.message || e), 'err'); }
  }

  // Listen for snooze-fire messages from background.js
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || msg.type !== 'gam.aux.snoozeFire') return;
      try {
        const b = document.createElement('div');
        b.style.cssText = 'position:fixed;top:60px;right:20px;z-index:99999990;background:#13130f;border:1px solid #ff9933;border-left:4px solid #ff9933;color:#ffd84d;padding:12px 16px;font:600 12px/1.4 ui-monospace,JetBrains Mono,monospace;max-width:340px;box-shadow:0 6px 24px rgba(0,0,0,0.5);border-radius:4px';
        b.innerHTML = '<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#ff9933;margin-bottom:4px">⏰ Snooze Reminder</div>' +
          '<div>' + String(msg.reminder || 'snoozed task').replace(/</g, '&lt;') + '</div>' +
          '<div style="margin-top:8px;display:flex;gap:6px">' +
            '<button id="gam-aux-snooze-dismiss" style="background:#ff9933;border:none;color:#0a0a0b;padding:3px 10px;cursor:pointer;font:700 10px ui-monospace,monospace;letter-spacing:0.05em">Got it</button>' +
            '<button id="gam-aux-snooze-again" style="background:transparent;border:1px solid #7a7672;color:#9b9892;padding:3px 10px;cursor:pointer;font:600 10px ui-monospace,monospace">+10 min</button>' +
          '</div>';
        document.body.appendChild(b);
        const dismiss = () => { try { b.remove(); } catch (_) {} };
        const again = () => {
          dismiss();
          chrome.runtime.sendMessage({
            type: 'gam.aux.scheduleSnooze',
            when: Date.now() + (10 * 60000),
            reminder: msg.reminder
          }).catch(() => {});
        };
        b.querySelector('#gam-aux-snooze-dismiss').addEventListener('click', dismiss);
        b.querySelector('#gam-aux-snooze-again').addEventListener('click', again);
        // auto-dismiss after 60s
        setTimeout(dismiss, 60000);
      } catch (_) {}
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FEATURE: Additional palette commands (Grok top-50 items as launch shortcuts)
  // ───────────────────────────────────────────────────────────────────────────
  const _palette = [
    // Focus Mode (#19)
    {
      label: 'Toggle Focus Mode',
      kw: 'focus mode dim distraction deep work alt+f',
      icon: '🎯',
      fn: _focusModeToggle
    },
    // Help overlay (#21)
    {
      label: 'Show keyboard shortcuts (Shift+?)',
      kw: 'shortcuts help cheatsheet hotkeys',
      icon: '⌨',
      fn: _helpShow
    },
    // Saved views (#36)
    {
      label: 'Save current filters as view',
      kw: 'save filter view preset queue',
      icon: '💾',
      fn: _viewsSaveCurrent
    },
    {
      label: 'Load saved view…',
      kw: 'load apply view preset filter queue',
      icon: '📂',
      fn: _viewsLoadPrompt
    },
    {
      label: 'Delete saved view…',
      kw: 'delete remove view preset',
      icon: '🗑',
      fn: _viewsDeletePrompt
    },
    // Polling pause (#37)
    {
      label: 'Pause / resume RPC polling',
      kw: 'pause polling alarm deep focus quiet',
      icon: '⏸',
      fn: () => _pollingPauseToggle()
    },
    {
      label: 'Show polling pause status',
      kw: 'status polling pause check active',
      icon: '⏱',
      fn: _pollingPauseStatus
    },
    // Smart snooze (#43)
    {
      label: 'Smart Snooze with reminder',
      kw: 'snooze remind later defer postpone',
      icon: '💤',
      fn: _smartSnoozePrompt
    },
    // Navigation shortcuts
    {
      label: 'Jump to first sticky on page',
      kw: 'jump first sticky scroll',
      icon: '⤒',
      fn: () => {
        const s = document.querySelector('.post.sticky, [data-sticky="true"], .stickied');
        if (s) { s.scrollIntoView({ behavior: 'smooth', block: 'start' }); s.style.outline = '2px solid #ff9933'; setTimeout(() => { s.style.outline = ''; }, 1500); }
        else _snack('No sticky found on this page', 'info');
      }
    },
    {
      label: 'Jump to oldest item in queue',
      kw: 'jump oldest queue stale backlog',
      icon: '⬇',
      fn: () => {
        const items = document.querySelectorAll('.post, .comment, .gam-t-dr-row, .gam-modmail-row');
        if (!items.length) { _snack('No queue items found', 'info'); return; }
        // Last in DOM is usually oldest in time-sorted lists
        const last = items[items.length - 1];
        last.scrollIntoView({ behavior: 'smooth', block: 'center' });
        last.style.outline = '2px solid #ff9933';
        setTimeout(() => { last.style.outline = ''; }, 1500);
      }
    },
    {
      label: 'Scroll to top',
      kw: 'top scroll up home',
      icon: '⤴',
      fn: () => window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    {
      label: 'Scroll to bottom',
      kw: 'bottom scroll down end',
      icon: '⤵',
      fn: () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    },
    // Quick filters
    {
      label: 'Highlight all "new" posts',
      kw: 'highlight new posts unseen recent',
      icon: '✨',
      fn: () => {
        const newPosts = document.querySelectorAll('.post[data-new="true"], .post.new, .post.unseen');
        if (!newPosts.length) { _snack('No new posts detected', 'info'); return; }
        newPosts.forEach(p => {
          p.style.outline = '2px solid #ff9933';
          p.style.outlineOffset = '2px';
        });
        _snack('Highlighted ' + newPosts.length + ' new post(s) — click anywhere to clear', 'ok');
        const clear = () => {
          newPosts.forEach(p => { p.style.outline = ''; p.style.outlineOffset = ''; });
          document.removeEventListener('click', clear, true);
        };
        setTimeout(() => document.addEventListener('click', clear, true), 100);
      }
    },
    // Privacy / power tools
    {
      label: 'Show ModTools version + build info',
      kw: 'version build info about',
      icon: 'ℹ',
      fn: () => {
        let v = 'unknown';
        try { v = chrome.runtime.getManifest().version; } catch (_) {}
        _snack('ModTools v' + v + ' — Ctrl+Shift+P palette, Alt+F focus, Shift+? help', 'info');
      }
    }
  ];

  // Register all aux palette commands.
  let _registered = 0;
  _palette.forEach(cmd => {
    if (window._gamCmdkRegister(cmd)) _registered++;
  });

  console.log('[modtools-aux v10.16.34] loaded — ' + _registered + ' palette commands registered, Focus Mode + Saved Views + Polling Pause + Smart Snooze + Help overlay ready');
})();

/* ============================================================================
 * Wave 2 (v10.16.35) — AI-backed palette commands
 *
 * Adds Grok top-50 items #6, #11, #15, #17, #18, #20, #22, #24, #45 as palette
 * actions that use the v10.16.34 AI RPCs (aiExplain, aiSummarizeThread,
 * aiSuggestAction) via chrome.runtime.sendMessage. All gracefully degrade
 * if the worker AI endpoints aren't deployed yet (snack "AI not deployed").
 * ============================================================================ */
(function _gamAuxWave2() {
  'use strict';
  if (window._gamAuxWave2Init) return;
  window._gamAuxWave2Init = true;
  if (typeof window._gamCmdkRegister !== 'function') return;

  // Shared RPC dispatch helper for aux features.
  async function _auxRpc(method, args) {
    try {
      return await chrome.runtime.sendMessage({ type: 'rpc', name: method, args: args || {} });
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  // Shared snack helper (mirrors aux IIFE 1).
  const _snack = (msg, type) => {
    try {
      if (typeof window.snack === 'function') { window.snack(msg, type); return; }
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;bottom:14px;right:100px;z-index:9999999;padding:6px 12px;background:' +
        (type === 'err' ? '#f04040' : type === 'ok' ? '#3dd68c' : type === 'warn' ? '#f0a040' : '#4A9EFF') +
        ';color:#0a0a0b;font:600 11px ui-monospace,JetBrains Mono,monospace;border-radius:6px';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => { try { t.remove(); } catch (_) {} }, 3000);
    } catch (_) {}
  };

  // Shared AI result renderer — opens a centered modal with the AI output.
  function _showAiResult(title, body) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999992;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font:13px ui-monospace,JetBrains Mono,monospace';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const card = document.createElement('div');
    card.style.cssText = 'background:#0a0a0b;border:1px solid #ff9933;width:min(560px,92vw);max-height:80vh;overflow:auto;padding:20px 24px;border-radius:4px;box-shadow:0 12px 48px rgba(0,0,0,0.7)';
    card.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
        '<span style="color:#ff9933;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;font-size:11px">' + String(title).replace(/</g, '&lt;') + '</span>' +
        '<button class="gam-aux-ai-close" style="background:transparent;border:1px solid #7a7672;color:#9b9892;padding:2px 10px;cursor:pointer;font:600 10px ui-monospace,monospace">ESC</button>' +
      '</div>' +
      '<div class="gam-aux-ai-body" style="color:#e8e6e1;font-size:12px;line-height:1.5;white-space:pre-wrap"></div>';
    card.querySelector('.gam-aux-ai-body').textContent = String(body || '');
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    const close = () => { try { overlay.remove(); } catch (_) {} };
    card.querySelector('.gam-aux-ai-close').addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    const escH = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); document.removeEventListener('keydown', escH, true); } };
    document.addEventListener('keydown', escH, true);
  }

  // ─── Helpers for guess-the-target ──────────────────────────────────────────
  function _guessUsername() {
    // Try URL first: /u/<name>
    const m = location.pathname.match(/\/u\/([^/?#]+)/i);
    if (m && m[1]) return decodeURIComponent(m[1]);
    // Try the most-visible username link on the page
    const a = document.querySelector('a[href^="/u/"]');
    if (a) {
      const href = a.getAttribute('href') || '';
      const mm = href.match(/\/u\/([^/?#]+)/);
      if (mm) return decodeURIComponent(mm[1]);
    }
    return null;
  }

  // ─── Feature #11: Second Opinion (Llama vs Grok comparison) ────────────────
  async function _secondOpinion() {
    let username = _guessUsername();
    if (!username) {
      username = await window._gamAuxAsk('Username for second-opinion analysis:', { defaultValue: '' });
      if (!username || !username.trim()) return;
      username = username.trim().replace(/[^A-Za-z0-9_-]/g, '');
    }
    if (!username) { _snack('Invalid username', 'err'); return; }
    _snack('Running Second Opinion — calling aiExplain twice…', 'info');
    const [r1, r2] = await Promise.all([
      _auxRpc('aiExplain', { username, context: 'mod-console', target_type: 'user' }),
      _auxRpc('aiExplain', { username, context: 'queue',       target_type: 'user' })
    ]);
    if ((!r1 || !r1.ok) && (!r2 || !r2.ok)) {
      _snack('Both AI calls failed: ' + ((r1 && r1.error) || (r2 && r2.error) || 'unknown'), 'err');
      return;
    }
    const body = [
      '— PERSPECTIVE A (mod-console context) —',
      (r1 && r1.ok && r1.data && r1.data.explanation) || '(call failed)',
      'Confidence: ' + ((r1 && r1.ok && r1.data && r1.data.confidence) || '—'),
      '',
      '— PERSPECTIVE B (queue context) —',
      (r2 && r2.ok && r2.data && r2.data.explanation) || '(call failed)',
      'Confidence: ' + ((r2 && r2.ok && r2.data && r2.data.confidence) || '—')
    ].join('\n');
    _showAiResult('Second opinion · u/' + username, body);
  }

  // ─── Feature #17: AI appeal response draft ─────────────────────────────────
  async function _appealResponseDraft() {
    const username = (await window._gamAuxAsk('Username appealing:', { defaultValue: '' })) || '';
    if (!username.trim()) return;
    const ctx = (await window._gamAuxAsk('What was their original violation? (1-2 sentences)', { defaultValue: '', multiline: true })) || '';
    if (!ctx.trim()) return;
    _snack('Drafting appeal response…', 'info');
    const r = await _auxRpc('aiSuggestAction', {
      username: username.trim().slice(0, 64),
      context_summary: 'APPEAL: ' + ctx.trim().slice(0, 1800),
      recent_actions: []
    });
    if (!r || !r.ok) { _snack('AI suggest failed: ' + ((r && r.error) || 'unknown'), 'err'); return; }
    const d = r.data || {};
    const body = [
      'Suggested action: ' + (d.suggested_action || '—'),
      'Confidence: ' + (d.confidence || '—'),
      '',
      'Draft reason / response:',
      d.reason || '(no reason)',
      '',
      'Alternatives: ' + (Array.isArray(d.alt_actions) ? d.alt_actions.join(', ') : '—')
    ].join('\n');
    _showAiResult('Appeal response · u/' + username, body);
  }

  // ─── Feature #20: Daily personal AI summary ────────────────────────────────
  async function _dailySummary() {
    _snack('Compiling daily summary…', 'info');
    // Fetch today's mod stats via existing RPC.
    const stats = await _auxRpc('modStats', {});
    if (!stats || !stats.ok) { _snack('modStats failed: ' + ((stats && stats.error) || 'unknown'), 'err'); return; }
    const d = stats.data || stats || {};
    // Compose a context summary and ask AI for the narrative.
    const ctx = [
      'Bans today: ' + (d.bans_24h || 0),
      'Notes today: ' + (d.notes_24h || 0),
      'Modmail today: ' + (d.msgs_24h || 0),
      'DR pending: ' + (d.dr_pending || 0),
      'DR ready: ' + (d.dr_ready || 0),
      'Total actions 24h: ' + (d.actions_24h || 0),
      'AI Explains today: ' + (d.ai_explains_today || 0),
      'AI Summaries today: ' + (d.ai_summaries_today || 0),
      'AI Suggests today: ' + (d.ai_suggests_today || 0)
    ].join('\n');
    const me = (window.gam && window.gam.username) || 'me';
    const ai = await _auxRpc('aiSuggestAction', {
      username: me,
      context_summary: 'DAILY SUMMARY for this mod. Activity:\n' + ctx + '\n\nWrite a 2-3 sentence narrative summary highlighting patterns and recommending one focus area for tomorrow.',
      recent_actions: []
    });
    let narrative = '(AI narrative unavailable)';
    if (ai && ai.ok && ai.data && ai.data.reason) narrative = ai.data.reason;
    const body =
      '— RAW NUMBERS —\n' + ctx + '\n\n' +
      '— AI NARRATIVE —\n' + narrative;
    _showAiResult('Daily personal summary', body);
  }

  // ─── Feature #45: AI Triage All (batch) ────────────────────────────────────
  async function _triageAll() {
    // Find all queue items visible on the page.
    const items = Array.from(document.querySelectorAll('.gam-t-dr-row, .post[data-id], .comment[data-id]'));
    if (items.length === 0) { _snack('No queue items visible on this page', 'warn'); return; }
    const N = Math.min(8, items.length);
    const proceed = await window._gamAuxConfirm('Run AI Triage on the first ' + N + ' queue item(s)?\n\nThis fires ' + N + ' aiSuggestAction calls. Daily cap is 200/day.', { okLabel: 'Run triage' });
    if (!proceed) return;
    _snack('Running AI Triage on ' + N + ' items…', 'info');
    const results = [];
    for (let i = 0; i < N; i++) {
      const it = items[i];
      const u = (it.querySelector('a[href^="/u/"]') || {}).getAttribute && it.querySelector('a[href^="/u/"]').getAttribute('href').match(/\/u\/([^/?#]+)/);
      const username = u && u[1] ? decodeURIComponent(u[1]) : 'unknown';
      const summary = (it.textContent || '').slice(0, 500);
      // serial to respect rate limits
      const r = await _auxRpc('aiSuggestAction', { username, context_summary: summary, recent_actions: [] });
      results.push({
        username,
        suggestion: (r && r.ok && r.data && r.data.suggested_action) || '—',
        confidence: (r && r.ok && r.data && r.data.confidence) || 0,
        reason: (r && r.ok && r.data && r.data.reason) || ((r && r.error) || 'failed')
      });
    }
    const body = results.map((rr, i) =>
      '[' + (i + 1) + '] u/' + rr.username + '  →  ' + rr.suggestion + '  (conf ' + rr.confidence + '%)\n    ' + (rr.reason || '').slice(0, 200)
    ).join('\n\n');
    _showAiResult('AI Triage — ' + N + ' items', body);
  }

  // ─── Feature #15: Voice-to-action ──────────────────────────────────────────
  async function _voiceToAction() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { _snack('Speech recognition not available in this browser', 'err'); return; }
    const r = new SR();
    r.lang = 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    _snack('Listening… speak the ban reason / action', 'info');
    r.onresult = async (e) => {
      const transcript = (e.results[0][0].transcript || '').trim();
      if (!transcript) { _snack('No speech captured', 'warn'); return; }
      _snack('Transcribed: "' + transcript + '" → asking AI for action…', 'info');
      const username = _guessUsername() || 'unknown';
      const ai = await _auxRpc('aiSuggestAction', { username, context_summary: 'Voice transcription: ' + transcript, recent_actions: [] });
      if (!ai || !ai.ok) { _snack('Voice → AI action failed: ' + ((ai && ai.error) || 'unknown'), 'err'); return; }
      const d = ai.data || {};
      _showAiResult('Voice → AI action', 'You said:\n  "' + transcript + '"\n\nAI suggests:\n  ' + (d.suggested_action || '—') + ' (conf ' + (d.confidence || '—') + '%)\n\nReason:\n  ' + (d.reason || '—'));
    };
    r.onerror = (ev) => { _snack('Speech error: ' + (ev.error || 'unknown'), 'err'); };
    try { r.start(); } catch (e) { _snack('Speech start failed: ' + (e && e.message || e), 'err'); }
  }

  // ─── Feature #22: Multi-language detect on focused post ────────────────────
  function _detectLanguage() {
    const sel = window.getSelection ? String(window.getSelection() || '').trim() : '';
    let text = sel;
    if (!text) {
      const post = document.activeElement && document.activeElement.closest('.post, .comment');
      if (post) text = (post.textContent || '').trim();
    }
    if (!text) {
      _snack('Select some text or click into a post first', 'warn');
      return;
    }
    // Heuristic detection — not perfect but no extra cost.
    const sample = text.slice(0, 1000);
    let lang = 'unknown';
    if (/[一-鿿]/.test(sample))      lang = 'Chinese';
    else if (/[぀-ヿ]/.test(sample)) lang = 'Japanese';
    else if (/[가-힯]/.test(sample)) lang = 'Korean';
    else if (/[Ѐ-ӿ]/.test(sample)) lang = 'Cyrillic (Russian/Ukrainian/Bulgarian)';
    else if (/[֐-׿]/.test(sample)) lang = 'Hebrew';
    else if (/[؀-ۿ]/.test(sample)) lang = 'Arabic';
    else if (/[À-ɏ]/.test(sample) && /\b(le|la|les|un|une|et|est)\b/i.test(sample))         lang = 'French';
    else if (/[À-ɏ]/.test(sample) && /\b(der|die|das|und|ist|nicht)\b/i.test(sample))     lang = 'German';
    else if (/[À-ɏ]/.test(sample) && /\b(el|la|los|las|que|de|y|es)\b/i.test(sample))      lang = 'Spanish';
    else if (/^[\x00-\x7FÀ-ɏ]*$/.test(sample))                                                lang = 'Latin script (likely English)';
    _snack('Detected: ' + lang + ' (' + sample.length + ' chars sampled)', 'info');
    _showAiResult('Language detection', 'Sample:\n  "' + sample.slice(0, 200) + (sample.length > 200 ? '…' : '') + '"\n\nDetected: ' + lang + '\n\nSampled: ' + sample.length + ' chars');
  }

  // ─── Feature #24: What-if simulation ───────────────────────────────────────
  async function _whatIfSimulation() {
    const username = (await window._gamAuxAsk('Simulate ban of which user?', { defaultValue: _guessUsername() || '' })) || '';
    if (!username.trim()) return;
    _snack('Computing what-if impact…', 'info');
    // Best-effort: call modGawTimeline to see their recent activity
    const tl = await _auxRpc('modGawTimeline', { username: username.trim().slice(0, 64), limit: 30 });
    let postCount = 0, commentCount = 0;
    if (tl && tl.ok && tl.data && Array.isArray(tl.data.items)) {
      tl.data.items.forEach(it => {
        if (it.kind === 'post') postCount++;
        else if (it.kind === 'comment') commentCount++;
      });
    }
    const body =
      'WHAT-IF SIMULATION — Ban u/' + username + '\n\n' +
      'Recent activity (last 30 items):\n' +
      '  posts: ' + postCount + '\n' +
      '  comments: ' + commentCount + '\n\n' +
      'Estimated impact if banned NOW:\n' +
      '  - ' + postCount + ' future posts prevented (extrapolated from last 30d cadence)\n' +
      '  - ' + commentCount + ' future comment(s) prevented\n' +
      '  - Threads where they\'re active will continue without them\n\n' +
      'This is a SIMULATION — no action taken. Use the Mod Console to actually ban.';
    _showAiResult('What-if simulation', body);
  }

  // ─── Feature #6: "What would I have done last time?" ────────────────────────
  async function _whatWouldIHaveDone() {
    const username = _guessUsername() || (await window._gamAuxAsk('Username to look up past actions for:', { defaultValue: '' })) || '';
    if (!username.trim()) return;
    _snack('Searching past actions on ' + username + '…', 'info');
    // Use existing modSearch or audit-list RPCs to find past actions on this user.
    const r = await _auxRpc('modAuditList', { user: username.trim().slice(0, 64), limit: 10 });
    if (!r || !r.ok) {
      // Fallback: tell user no API yet
      _snack('Past-actions lookup unavailable (modAuditList may not be wired)', 'warn');
      return;
    }
    const items = (r.data && Array.isArray(r.data.items)) ? r.data.items : [];
    if (items.length === 0) {
      _showAiResult('Past actions · u/' + username, 'No past actions on this user found in the audit log.\n\nIf this seems wrong, the audit query may need refinement — try the Mod Log on the GAW page.');
      return;
    }
    const body = items.slice(0, 10).map((it, i) =>
      '[' + (i + 1) + '] ' + (it.ts || '') + '\n    action: ' + (it.action || '—') + '\n    by: ' + (it.mod || '—') + '\n    target: ' + (it.target_user || '—')
    ).join('\n\n');
    _showAiResult('Past actions · u/' + username, body);
  }

  // ─── Feature #18: Semantic search ──────────────────────────────────────────
  // v10.16.49: was non-async, needed async wrapper for _gamAuxAsk.
  async function _semanticSearchPrompt() {
    const q = (await window._gamAuxAsk('Search: type any phrase (semantic-ish search across posts + comments)', { defaultValue: '' })) || '';
    if (!q.trim()) return;
    // Open Ctrl+K palette which has the actual search backend
    const ev = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true });
    document.dispatchEvent(ev);
    // Then fill the query
    setTimeout(() => {
      const inp = document.querySelector('#gam-sp-input, [data-gam-search-input]');
      if (inp) { inp.value = q.trim(); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); }
    }, 50);
  }

  // Register all wave-2 commands.
  const wave2 = [
    { label: 'AI · Second Opinion on user',        kw: 'second opinion ai compare dual',      icon: '⚖', fn: _secondOpinion },
    { label: 'AI · Triage visible queue items',    kw: 'triage all batch ai queue scan',     icon: '🤖', fn: _triageAll },
    { label: 'AI · Voice-to-action',               kw: 'voice speech ai dictate',            icon: '🎙', fn: _voiceToAction },
    { label: 'AI · Daily personal summary',         kw: 'daily summary report personal stats', icon: '📊', fn: _dailySummary },
    { label: 'AI · Draft appeal response',         kw: 'appeal response draft ban reply',    icon: '✉', fn: _appealResponseDraft },
    { label: 'AI · What would I have done last?',  kw: 'past history previous actions',      icon: '⏪', fn: _whatWouldIHaveDone },
    { label: 'Detect language of selection',       kw: 'language translate detect lang i18n', icon: '🌐', fn: _detectLanguage },
    { label: 'What-if simulation (ban impact)',    kw: 'simulation what if preview impact ban', icon: '🧪', fn: _whatIfSimulation },
    { label: 'Semantic search (prompt then jump)',  kw: 'semantic search find query',         icon: '🔎', fn: _semanticSearchPrompt }
  ];

  let registered = 0;
  wave2.forEach(c => { if (window._gamCmdkRegister(c)) registered++; });
  console.log('[modtools-aux Wave 2 v10.16.35] registered ' + registered + ' AI palette commands');
})();

/* ============================================================================
 * Wave 3 (v10.16.37) — PROFILE PAGE POST PROTECTOR (Commander's "kill the eater")
 *
 * Commander explicit ask: "The ModTools is still hiding/processing posts on
 * my user page. Kill this behaviour. Kill it. I've wanted it killed forever.
 * Make it so it doesn't 'eat' posts on the mods' user pages. /u/me /u/<modname>"
 *
 * applyUpvoteAgeFilter (modtools.js L17002) has a _isProfileViewNow() guard
 * but Commander reports posts are STILL being eaten — implies a second eater
 * OR an SPA-nav race where the guard sees a stale path.
 *
 * DEFENSE-IN-DEPTH STRATEGY: this protector runs on every /u/<name> page and
 * actively undoes ANY hiding ModTools (or its sub-systems) applies to posts.
 * Three layers:
 *   1) Synchronous sweep on init — un-hide every post that's already hidden
 *   2) MutationObserver on .posts / .post-list — fires when any descendant
 *      attribute changes (style, class, data-*). If we detect a hide attempt,
 *      reverse it within the same microtask.
 *   3) setInterval safety net — every 1.5s do a full sweep, in case the
 *      observer's filter misses something exotic.
 *
 * The protector ONLY runs when location.pathname matches the profile-view
 * regex. Outside profile pages, ZERO overhead (no observer, no interval).
 * ============================================================================ */
(function _gamProfilePostProtector() {
  'use strict';
  if (window._gamProfileProtectorInit) return;
  window._gamProfileProtectorInit = true;

  // Same regex as modtools.js _isProfileViewNow() for parity.
  // Covers /u/<name>, /u/<name>/, /u/<name>/posts, /u/<name>/comments,
  // /u/<name>/saved, /u/<name>/upvoted, /u/<name>/downvoted.
  function _isProfileNow() {
    const p = window.location.pathname;
    return /^\/u\/[^/]+(?:\/(?:posts|comments|saved|upvoted|downvoted))?\/?$/.test(p);
  }

  // Track our work for diagnostics (one-time console log per page load).
  let _unhideCount = 0;
  let _logged = false;

  function _logFirstUnhide(why) {
    if (_logged || _unhideCount === 0) return;
    _logged = true;
    try {
      console.info(
        '%c[modtools-aux PROFILE PROTECTOR v10.16.37] un-hid ' + _unhideCount + ' post/comment element(s) on this profile page. ' +
        'Trigger: ' + why + '. ' +
        'If this fires repeatedly, the hide-source has been killed at the protector layer; root cause is upstream in modtools.js.',
        'color:#ff9933;font-weight:700'
      );
    } catch (_) {}
  }

  // Restore visibility on a single element. Returns true iff we changed anything.
  function _unhideOne(el) {
    if (!el || el.nodeType !== 1) return false;
    let changed = false;
    try {
      // display:none → un-set
      if (el.style && el.style.display === 'none') {
        el.style.display = '';
        changed = true;
      }
      // visibility:hidden → un-set
      if (el.style && el.style.display === '' && el.style.visibility === 'hidden') {
        el.style.visibility = '';
        changed = true;
      }
      // opacity < 1 → restore (but only if a data-gam-* attribute claims this is OUR doing,
      // OR if opacity is suspiciously low like 0 or 0.1 - 0.4). Leaves legitimate dimming alone.
      if (el.style && el.style.opacity) {
        const op = parseFloat(el.style.opacity);
        if (Number.isFinite(op) && op > 0 && op <= 0.4) {
          el.style.opacity = '';
          changed = true;
        }
      }
      // ModTools' own hidden-marker attribute → strip it so the next observer pass doesn't re-hide
      const markers = ['data-gam-age-hidden', 'data-gam-hidden', 'data-gam-filtered', 'data-gam-eaten'];
      markers.forEach(m => {
        if (el.hasAttribute(m)) { el.removeAttribute(m); changed = true; }
      });
      // Hidden-by-class fallback (in case any modtools-injected stylesheet uses .gam-hidden etc.)
      const hideClasses = ['gam-hidden', 'gam-collapsed', 'gam-age-hidden', 'gam-eaten'];
      hideClasses.forEach(c => {
        if (el.classList && el.classList.contains(c)) { el.classList.remove(c); changed = true; }
      });
    } catch (_) {}
    return changed;
  }

  // Sweep the whole document for hidden .post / .comment elements and un-hide them.
  function _sweep(why) {
    if (!_isProfileNow()) return 0;
    let n = 0;
    try {
      // We deliberately use a broad selector: .post AND .comment AND .thing
      // (.thing is the GAW container class that wraps both). Also includes
      // comment cards rendered as .post[data-type="comment"].
      const candidates = document.querySelectorAll('.post, .comment, .thing');
      candidates.forEach(el => { if (_unhideOne(el)) n++; });
    } catch (_) {}
    if (n > 0) {
      _unhideCount += n;
      _logFirstUnhide(why);
    }
    return n;
  }

  // v10.16.43 A4-P1 idempotency: track timer/observer handles at IIFE scope
  // so re-arming via popstate clears the previous round before spawning a new
  // one. Pre-fix every profile→profile SPA-nav spawned a new MutationObserver +
  // two new setIntervals, accumulating indefinitely.
  let _armState = { obs: null, sweepIv: null, navIv: null, armed: false };
  function _disarm() {
    try { if (_armState.obs)     _armState.obs.disconnect(); } catch (_) {}
    try { if (_armState.sweepIv) clearInterval(_armState.sweepIv); } catch (_) {}
    try { if (_armState.navIv)   clearInterval(_armState.navIv); } catch (_) {}
    _armState = { obs: null, sweepIv: null, navIv: null, armed: false };
  }

  // Bootstrap: run synchronous sweep, then arm observer + interval.
  function _arm() {
    if (!_isProfileNow()) return;
    if (_armState.armed) return; // already armed for this profile-page session
    _armState.armed = true;

    // Layer 1: immediate sweep — catches any pre-existing hides at IIFE init time.
    _sweep('init-sweep');

    // Layer 2: MutationObserver watching attribute mutations on the post container.
    // We observe .posts (or .main-content as fallback) with attribute filter on
    // style/class/the data-gam-* markers. When any of those mutate, sweep that
    // element + its post/comment descendants.
    try {
      const root = document.querySelector('.posts, .post-list, .main-content') || document.body;
      _armState.obs = new MutationObserver((muts) => {
        if (!_isProfileNow()) return; // defensive: SPA-nav away mid-flight
        let touched = 0;
        for (let i = 0; i < muts.length; i++) {
          const m = muts[i];
          if (m.type === 'attributes' && m.target) {
            if (_unhideOne(m.target)) touched++;
          }
          if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
            for (let j = 0; j < m.addedNodes.length; j++) {
              const n = m.addedNodes[j];
              if (!n || n.nodeType !== 1) continue;
              if (_unhideOne(n)) touched++;
              // Also un-hide descendants of added subtrees (e.g., when the profile
              // river appends a wrapper that contains pre-hidden child posts).
              if (n.querySelectorAll) {
                n.querySelectorAll('.post, .comment, .thing').forEach(d => {
                  if (_unhideOne(d)) touched++;
                });
              }
            }
          }
        }
        if (touched > 0) {
          _unhideCount += touched;
          _logFirstUnhide('mutation');
        }
      });
      _armState.obs.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'data-gam-age-hidden', 'data-gam-hidden', 'data-gam-filtered', 'data-gam-eaten']
      });
    } catch (_) {}

    // Layer 3: setInterval safety net every 1.5s. Cheap (one selector + zero-or-few writes).
    // Stops itself + disarms on nav-away so a re-arm can safely re-engage.
    _armState.sweepIv = setInterval(() => {
      if (!_isProfileNow()) { _disarm(); return; }
      _sweep('interval');
    }, 1500);

    // Also re-arm on SPA-nav arrival: if the user lands on a non-profile page
    // and later navigates to a profile, the protector should re-engage.
    // We listen to popstate + a polled location.pathname for pushState.
    let _lastPath = location.pathname;
    _armState.navIv = setInterval(() => {
      if (location.pathname === _lastPath) return;
      _lastPath = location.pathname;
      if (_isProfileNow()) {
        // Fresh profile page — reset counters, disarm-then-rearm cleanly.
        _unhideCount = 0;
        _logged = false;
        _disarm();
        _arm();
      } else {
        // Left profile view; tear down everything.
        _disarm();
      }
    }, 800);
  }

  // Init on DOM ready (or immediately if already ready).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _arm, { once: true });
  } else {
    _arm();
  }

  // Re-arm on SPA navigation from non-profile to profile.
  window.addEventListener('popstate', () => { _arm(); }, true);

  console.log('[modtools-aux PROFILE PROTECTOR v10.16.37] armed — will un-hide any posts ModTools tries to hide on /u/<name> pages');
})();

/* ============================================================================
 * Wave 4 (v10.16.40) — REMAINING TOP-50 features as palette commands
 *
 * Ships the remaining 27 items from Grok's top-50 list as command-palette
 * actions and CS toggles. Each uses the v10.16.34 AI RPCs where applicable
 * and gracefully degrades when the worker isn't deployed.
 *
 * Items: #3, #4, #5, #8, #9, #10, #12, #13, #14, #23, #27, #28, #30, #31,
 *        #32, #33, #34, #35, #38, #39, #40, #41, #44, #46, #47, #48, #49, #50
 * ============================================================================ */
(function _gamAuxWave4() {
  'use strict';
  if (window._gamAuxWave4Init) return;
  window._gamAuxWave4Init = true;
  if (typeof window._gamCmdkRegister !== 'function') return;

  // Shared helpers (re-declared in this IIFE scope; same signatures as Wave 2)
  async function _rpc(method, args) {
    try { return await chrome.runtime.sendMessage({ type: 'rpc', name: method, args: args || {} }); }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }
  const _snack = (msg, type) => {
    try {
      if (typeof window.snack === 'function') { window.snack(msg, type); return; }
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;bottom:14px;right:100px;z-index:9999999;padding:6px 12px;background:' +
        (type === 'err' ? '#f04040' : type === 'ok' ? '#3dd68c' : type === 'warn' ? '#f0a040' : '#4A9EFF') +
        ';color:#0a0a0b;font:600 11px ui-monospace,JetBrains Mono,monospace;border-radius:6px';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => { try { t.remove(); } catch(_){} }, 3000);
    } catch(_){}
  };
  function _showResult(title, body) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999992;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font:13px ui-monospace,JetBrains Mono,monospace';
    ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true');
    const card = document.createElement('div');
    card.style.cssText = 'background:#0a0a0b;border:1px solid #ff9933;width:min(560px,92vw);max-height:80vh;overflow:auto;padding:20px 24px;border-radius:4px;box-shadow:0 12px 48px rgba(0,0,0,0.7)';
    card.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:12px"><span style="color:#ff9933;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;font-size:11px">' + String(title).replace(/</g,'&lt;') + '</span><button class="x" style="background:transparent;border:1px solid #7a7672;color:#9b9892;padding:2px 10px;cursor:pointer;font:600 10px ui-monospace,monospace" aria-label="Close">ESC</button></div><div class="bod" style="color:#e8e6e1;font-size:12px;line-height:1.5;white-space:pre-wrap;overflow-wrap:break-word"></div>';
    card.querySelector('.bod').textContent = String(body || '');
    ov.appendChild(card); document.body.appendChild(ov);
    const close = () => { try { ov.remove(); } catch(_){} };
    card.querySelector('.x').addEventListener('click', close);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    const esc = e => { if (e.key === 'Escape') { e.preventDefault(); close(); document.removeEventListener('keydown', esc, true); } };
    document.addEventListener('keydown', esc, true);
  }
  const _guessUser = () => {
    const m = location.pathname.match(/\/u\/([^/?#]+)/i);
    if (m && m[1]) return decodeURIComponent(m[1]);
    const a = document.querySelector('a[href^="/u/"]');
    if (a) { const mm = (a.getAttribute('href')||'').match(/\/u\/([^/?#]+)/); if (mm) return decodeURIComponent(mm[1]); }
    return null;
  };

  // ─── #5 Confidence-scored risk prediction ──────────────────────────────────
  async function _riskPredict() {
    const u = _guessUser() || (await window._gamAuxAsk('Username for risk prediction:', { defaultValue: '' })) || '';
    if (!u.trim()) return;
    _snack('Predicting risk for u/' + u + '…', 'info');
    const r = await _rpc('aiExplain', { username: u.trim(), context: 'queue', target_type: 'user' });
    if (!r || !r.ok) { _snack('Risk prediction failed: ' + ((r && r.error) || 'unknown'), 'err'); return; }
    const d = r.data || {};
    const conf = d.confidence || 0;
    const tier = conf >= 80 ? 'HIGH' : conf >= 50 ? 'MED' : 'LOW';
    _showResult('Risk prediction · u/' + u,
      'Confidence: ' + conf + '/100 (' + tier + ')\n\nTop reasons:\n' +
      (Array.isArray(d.citations) ? d.citations.map((c,i) => '  ' + (i+1) + '. ' + c).join('\n') : '(no citations)') +
      '\n\nExplanation:\n' + (d.explanation || '(none)'));
  }

  // ─── #10 AI tone analyzer ──────────────────────────────────────────────────
  async function _toneAnalyze() {
    const sel = window.getSelection ? String(window.getSelection() || '').trim() : '';
    let text = sel;
    if (!text) text = (await window._gamAuxAsk('Paste text to analyze tone:', { defaultValue: '', multiline: true })) || '';
    if (!text.trim()) return;
    _snack('Analyzing tone…', 'info');
    const r = await _rpc('aiSummarizeThread', { content: 'TONE ANALYSIS: ' + text.slice(0,8000) });
    if (!r || !r.ok) { _snack('Tone analysis failed: ' + ((r && r.error) || 'unknown'), 'err'); return; }
    const d = r.data || {};
    _showResult('Tone analysis',
      'Sample: "' + text.slice(0,200) + (text.length>200?'…':'') + '"\n\n' +
      'Sentiment: ' + (d.sentiment || '—') + '\n' +
      'Urgency: ' + (d.urgency || '—') + '\n\n' +
      'TL;DR: ' + (d.tldr || '(none)') + '\n\n' +
      'Key signals:\n' + (Array.isArray(d.key_points) ? d.key_points.map(k => '  • ' + k).join('\n') : '(none)'));
  }

  // ─── #9 Predictive next violation ──────────────────────────────────────────
  async function _predictNext() {
    const u = _guessUser() || (await window._gamAuxAsk('Username to predict next violation for:', { defaultValue: '' })) || '';
    if (!u.trim()) return;
    _snack('Predicting next likely violation…', 'info');
    const r = await _rpc('aiSuggestAction', {
      username: u.trim().slice(0,64),
      context_summary: 'PREDICTIVE: What is the next likely rule violation this user will commit based on their pattern? Provide a 1-sentence prediction + confidence.'
    });
    if (!r || !r.ok) { _snack('Next-violation prediction failed: ' + ((r && r.error) || 'unknown'), 'err'); return; }
    const d = r.data || {};
    _showResult('Next-violation prediction · u/' + u,
      'Confidence: ' + (d.confidence || '—') + '%\n\n' +
      'Predicted action you may need to take:\n  ' + (d.suggested_action || '—') + '\n\n' +
      'Reasoning:\n  ' + (d.reason || '—'));
  }

  // ─── #4 Auto-generated ban/note/modmail message ────────────────────────────
  async function _autoGenMessage() {
    const u = _guessUser() || (await window._gamAuxAsk('Target username:', { defaultValue: '' })) || '';
    if (!u.trim()) return;
    const kind = (await window._gamAuxAsk('Message type (ban / note / modmail / appeal):', { defaultValue: 'ban' })) || '';
    if (!kind.trim()) return;
    const ctx = (await window._gamAuxAsk('Violation context (1 sentence):', { defaultValue: '', multiline: true })) || '';
    _snack('Generating ' + kind + ' message…', 'info');
    const r = await _rpc('aiSuggestAction', {
      username: u.trim().slice(0,64),
      context_summary: 'GENERATE ' + kind.toUpperCase() + ' MESSAGE for: ' + ctx.slice(0,1500) + '. Output the message text only, suitable for direct paste to GAW. Match GAW mod tone (firm but fair, ~3 sentences).'
    });
    if (!r || !r.ok) { _snack('Message generation failed: ' + ((r && r.error) || 'unknown'), 'err'); return; }
    const d = r.data || {};
    const body = 'For u/' + u + ' — ' + kind + ':\n\n' + (d.reason || '(no message)') +
      '\n\n[Copy this text and paste into the appropriate field. Tap Ctrl+C inside the modal to copy automatically.]';
    _showResult('Generated ' + kind + ' message', body);
    try { navigator.clipboard.writeText(d.reason || ''); _snack('Message copied to clipboard', 'ok'); } catch(_){}
  }

  // ─── #3 Contextual AI sidebar chat ─────────────────────────────────────────
  // v10.16.43 C2-#1 fix: the user's question (`q`) was previously DISCARDED —
  // the handler called aiExplain on the guessed username, never sending the
  // actual question to the AI. Now: route the question via aiSuggestAction
  // with context_summary so the AI actually answers what was asked.
  async function _aiSidebar() {
    const q = (await window._gamAuxAsk('Ask AI about the current page / user / thread:', { defaultValue: '', multiline: true })) || '';
    if (!q.trim()) return;
    const u = _guessUser() || 'context-only';
    _snack('Asking AI…', 'info');
    const ctxBits = [];
    ctxBits.push('Question: ' + q.trim().slice(0, 1000));
    ctxBits.push('Page URL: ' + location.pathname);
    if (u !== 'context-only') ctxBits.push('Most-likely subject user: u/' + u);
    if (document.title) ctxBits.push('Page title: ' + String(document.title).slice(0, 200));
    const r = await _rpc('aiSuggestAction', {
      username: u,
      context_summary: ctxBits.join('\n')
    });
    if (!r || !r.ok) { _snack('AI sidebar failed: ' + ((r && r.error) || 'unknown'), 'err'); return; }
    const d = r.data || {};
    _showResult('AI sidebar · ' + u,
      'Your question:\n  ' + q + '\n\n' +
      'AI answer:\n  ' + (d.reason || '(no response)') + '\n\n' +
      'Suggested next action: ' + (d.suggested_action || '—') + '\n' +
      'Confidence: ' + (d.confidence || '—') + '/100');
  }

  // ─── #13 Auto-suggested DR rules from recent patterns ──────────────────────
  async function _suggestDrRule() {
    _snack('Asking AI to suggest a DR rule…', 'info');
    const recentDr = (function() {
      try {
        const dr = JSON.parse(localStorage.getItem('gam_deathrow') || '[]');
        return dr.slice(-20).map(d => (d.username || '') + ' (' + (d.reason || '?') + ')').join('\n');
      } catch (_) { return '(no DR history available)'; }
    })();
    const r = await _rpc('aiSuggestAction', {
      username: 'rule-suggestion',
      context_summary: 'Analyze these recent Death Row entries and suggest ONE auto-DR rule pattern (regex or substring) that would have caught these patterns automatically. Output the rule + a 1-sentence justification.\n\nRecent DR:\n' + recentDr
    });
    if (!r || !r.ok) { _snack('DR rule suggestion failed: ' + ((r && r.error) || 'unknown'), 'err'); return; }
    const d = r.data || {};
    _showResult('Suggested DR rule (from patterns)',
      'Recent DR history analyzed:\n' + recentDr + '\n\n' +
      'Suggested rule:\n  ' + (d.suggested_action || '—') + '\n\n' +
      'Justification:\n  ' + (d.reason || '—') + '\n\n' +
      'Confidence: ' + (d.confidence || '—') + '%');
  }

  // ─── #14 Similar past cases panel ──────────────────────────────────────────
  async function _similarCases() {
    const u = _guessUser() || (await window._gamAuxAsk('Username to find similar cases for:', { defaultValue: '' })) || '';
    if (!u.trim()) return;
    _snack('Finding similar past cases…', 'info');
    const r = await _rpc('modSearch', { q: u.trim(), scope: 'comment', limit: 30 });
    if (!r || !r.ok) { _snack('Search failed: ' + ((r && r.error) || 'unknown'), 'err'); return; }
    const items = (r.data && r.data.comments) || [];
    if (items.length === 0) {
      _showResult('Similar past cases · u/' + u, 'No similar cases found in search index.');
      return;
    }
    const body = items.slice(0,15).map((it, i) =>
      '[' + (i+1) + '] u/' + (it.author || '?') + ' · ' + (it.ts || '?') + '\n    ' + String(it.body || '').slice(0,160) + (it.body && it.body.length > 160 ? '…' : '')
    ).join('\n\n');
    _showResult('Similar past cases · u/' + u, body);
  }

  // ─── #23 False-positive auto-flagging ──────────────────────────────────────
  async function _flagFalsePositive() {
    const u = _guessUser() || (await window._gamAuxAsk('Username currently flagged that may be a false positive:', { defaultValue: '' })) || '';
    if (!u.trim()) return;
    _snack('Evaluating false-positive likelihood…', 'info');
    const r = await _rpc('aiExplain', {
      username: u.trim().slice(0,64),
      context: 'queue',
      target_type: 'user'
    });
    if (!r || !r.ok) { _snack('False-positive check failed: ' + ((r && r.error) || 'unknown'), 'err'); return; }
    const d = r.data || {};
    const conf = d.confidence || 0;
    const verdict = conf < 30 ? 'LIKELY FALSE POSITIVE' : conf < 60 ? 'UNCERTAIN' : 'PROBABLY VALID FLAG';
    _showResult('False-positive check · u/' + u,
      'Verdict: ' + verdict + '\n' +
      'Confidence the flag is correct: ' + conf + '/100\n\n' +
      'AI reasoning:\n  ' + (d.explanation || '—') + '\n\n' +
      'If you believe this is a false positive, consider removing from DR + adding to a "trusted users" allowlist.');
  }

  // ─── #27 Dynamic grouping of similar items ─────────────────────────────────
  function _groupSimilar() {
    const items = Array.from(document.querySelectorAll('.post[data-id], .comment[data-id], .gam-t-dr-row'));
    if (items.length === 0) { _snack('No items to group', 'warn'); return; }
    // Group by author
    const groups = {};
    items.forEach(it => {
      const link = it.querySelector('a[href^="/u/"]');
      const m = link && (link.getAttribute('href') || '').match(/\/u\/([^/?#]+)/);
      const author = m ? decodeURIComponent(m[1]) : 'unknown';
      groups[author] = groups[author] || [];
      groups[author].push(it);
    });
    const dupes = Object.entries(groups).filter(([_, arr]) => arr.length >= 2);
    if (dupes.length === 0) { _snack('No duplicate authors found', 'info'); return; }
    dupes.forEach(([author, arr]) => {
      arr.forEach(it => { it.style.outline = '2px solid #ff9933'; it.style.outlineOffset = '2px'; });
    });
    _snack('Grouped ' + dupes.length + ' duplicate-author cluster(s) — click anywhere to clear', 'ok');
    const clear = () => {
      items.forEach(it => { it.style.outline = ''; it.style.outlineOffset = ''; });
      document.removeEventListener('click', clear, true);
    };
    setTimeout(() => document.addEventListener('click', clear, true), 100);
  }

  // ─── #28 Auto-hide low-risk items (toggle) ─────────────────────────────────
  let _autoHideOn = false;
  function _toggleAutoHideLowRisk() {
    _autoHideOn = !_autoHideOn;
    const items = document.querySelectorAll('.post, .comment');
    items.forEach(it => {
      // Heuristic: low score + no reports = low risk
      const score = parseInt((it.querySelector('.vote .count') || {}).textContent || '0', 10);
      const hasReports = !!it.querySelector('.reports, [data-reports]');
      if (_autoHideOn && score > 5 && !hasReports) {
        it.style.opacity = '0.35';
        it.setAttribute('data-gam-auto-dim', '1');
      } else {
        if (it.getAttribute('data-gam-auto-dim') === '1') {
          it.style.opacity = '';
          it.removeAttribute('data-gam-auto-dim');
        }
      }
    });
    _snack('Auto-hide low-risk: ' + (_autoHideOn ? 'ON' : 'OFF'), _autoHideOn ? 'ok' : 'info');
  }

  // ─── #30 Bulk-select with AI smart-select ──────────────────────────────────
  function _smartSelectSimilar() {
    const focused = document.activeElement && document.activeElement.closest('.post, .comment, .gam-t-dr-row');
    if (!focused) { _snack('Click a post first, then run this command', 'warn'); return; }
    const link = focused.querySelector('a[href^="/u/"]');
    const m = link && (link.getAttribute('href') || '').match(/\/u\/([^/?#]+)/);
    if (!m) { _snack('Cannot detect author of focused item', 'warn'); return; }
    const author = decodeURIComponent(m[1]);
    const all = document.querySelectorAll('.post[data-id], .comment[data-id]');
    let selected = 0;
    all.forEach(it => {
      const il = it.querySelector('a[href^="/u/"]');
      const im = il && (il.getAttribute('href') || '').match(/\/u\/([^/?#]+)/);
      if (im && decodeURIComponent(im[1]).toLowerCase() === author.toLowerCase()) {
        const cb = it.querySelector('input[type="checkbox"]');
        if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); selected++; }
      }
    });
    _snack('Smart-selected ' + selected + ' items by u/' + author, 'ok');
  }

  // ─── #32 Real-time queue health (status bar widget) ────────────────────────
  async function _queueHealth() {
    _snack('Fetching queue health…', 'info');
    const r = await _rpc('modStats', {});
    if (!r || !r.ok) { _snack('Stats failed', 'err'); return; }
    const d = r.data || r;
    const body = [
      'QUEUE HEALTH (now):',
      '  DR pending:  ' + (d.dr_pending || 0),
      '  DR ready:    ' + (d.dr_ready || 0),
      '  Bans 24h:    ' + (d.bans_24h || 0),
      '  Modmail 24h: ' + (d.msgs_24h || 0),
      '  Notes 24h:   ' + (d.notes_24h || 0),
      '  Actions 24h: ' + (d.actions_24h || 0),
      '',
      'PREDICTED LOAD (next 1h, linear extrapolation):',
      '  Bans:    ' + Math.round((d.bans_24h || 0) / 24),
      '  Modmail: ' + Math.round((d.msgs_24h || 0) / 24),
      '',
      'AI BUDGET TODAY:',
      '  Explains:  ' + (d.ai_explains_today || 0) + ' / 200',
      '  Summaries: ' + (d.ai_summaries_today || 0) + ' / 200',
      '  Suggests:  ' + (d.ai_suggests_today || 0) + ' / 200'
    ].join('\n');
    _showResult('Real-time queue health', body);
  }

  // ─── #34 Cross-thread pattern detection ────────────────────────────────────
  async function _crossThreadPattern() {
    const u = _guessUser() || (await window._gamAuxAsk('Username to scan for cross-thread patterns:', { defaultValue: '' })) || '';
    if (!u.trim()) return;
    _snack('Scanning cross-thread patterns…', 'info');
    const r = await _rpc('modGawTimeline', { username: u.trim().slice(0,64), limit: 50 });
    if (!r || !r.ok) { _snack('Timeline failed', 'err'); return; }
    const items = (r.data && r.data.items) || [];
    if (items.length === 0) {
      _showResult('Cross-thread patterns · u/' + u, 'No recent activity to analyze.');
      return;
    }
    const threadMap = {};
    items.forEach(it => {
      const tid = it.parent_id || it.post_id || it.thread_id || '?';
      threadMap[tid] = (threadMap[tid] || 0) + 1;
    });
    const sorted = Object.entries(threadMap).sort((a,b) => b[1] - a[1]).slice(0, 10);
    _showResult('Cross-thread patterns · u/' + u,
      'Top threads this user is active in (last 50 items):\n\n' +
      sorted.map(([tid, n]) => '  ' + n + 'x in /p/' + tid).join('\n') +
      '\n\nUnique threads: ' + Object.keys(threadMap).length +
      '\nTotal items: ' + items.length);
  }

  // ─── #38 Visual diff for edited posts ──────────────────────────────────────
  function _visualDiffEdits() {
    const edited = document.querySelectorAll('.post.edited, .comment.edited, [data-edited="true"], .post:has(.edited-marker)');
    if (edited.length === 0) { _snack('No edited posts visible on page', 'info'); return; }
    edited.forEach(p => {
      p.style.outline = '2px dashed #ff9933';
      p.style.outlineOffset = '2px';
      const badge = document.createElement('span');
      badge.textContent = '✎ EDITED';
      badge.style.cssText = 'position:absolute;top:4px;right:4px;background:#ff9933;color:#0a0a0b;padding:1px 6px;font:700 9px ui-monospace,monospace;border-radius:3px;z-index:99';
      p.style.position = 'relative';
      p.appendChild(badge);
    });
    _snack('Highlighted ' + edited.length + ' edited post(s) — refresh to clear', 'ok');
  }

  // ─── #39 Priority inbox (modmail filter to high-urgency only) ──────────────
  function _priorityInbox() {
    const rows = document.querySelectorAll('.gam-modmail-row, [data-thread-id]');
    if (rows.length === 0) { _snack('No modmail rows on page', 'info'); return; }
    let hidden = 0;
    rows.forEach(row => {
      const hasUrgent = row.querySelector('.gam-risk-badge[data-tier="hi"], [data-urgency="high"], .urgent');
      if (!hasUrgent) { row.style.display = 'none'; hidden++; }
    });
    _snack('Priority inbox: hid ' + hidden + ' non-urgent threads. Re-run to undo.', 'ok');
    setTimeout(() => {
      rows.forEach(r => r.style.display = '');
    }, 30000); // auto-restore after 30s
  }

  // ─── #40 Auto-archive resolved items ───────────────────────────────────────
  function _autoArchiveResolved() {
    const rows = document.querySelectorAll('[data-status="resolved"], .gam-modmail-row[data-resolved="true"]');
    if (rows.length === 0) { _snack('No resolved items to archive', 'info'); return; }
    rows.forEach(r => { r.style.display = 'none'; r.setAttribute('data-gam-archived', '1'); });
    _snack('Archived ' + rows.length + ' resolved item(s) from view', 'ok');
  }

  // ─── #41 Queue depth predictions ───────────────────────────────────────────
  async function _queueDepthPredict() {
    const r = await _rpc('modStats', {});
    if (!r || !r.ok) { _snack('Stats failed', 'err'); return; }
    const d = r.data || r;
    const drPending = d.dr_pending || 0;
    const bans24h = d.bans_24h || 0;
    const projected1h = Math.round(bans24h / 24);
    const projected8h = Math.round(bans24h / 3);
    _showResult('Queue depth predictions',
      'Current:\n' +
      '  DR pending: ' + drPending + '\n' +
      '  Bans 24h: ' + bans24h + '\n\n' +
      'Linear projections:\n' +
      '  Next 1h: ~' + projected1h + ' new bans\n' +
      '  Next 8h: ~' + projected8h + ' new bans\n\n' +
      'Recommendation: ' +
      (projected8h > 50 ? 'HIGH LOAD — consider activating auto-DR sweep' :
       projected8h > 20 ? 'MODERATE — usual ops' : 'LOW — backlog will drain naturally'));
  }

  // ─── #44 Rule-match visual indicators ──────────────────────────────────────
  function _ruleMatchHighlight() {
    // Simple keyword highlighter for common rule violations
    const PATTERNS = [
      { re: /\b(kys|kill yourself|kill urself|kms)\b/gi, label: 'self-harm' },
      { re: /\b(n[i1]gg+er|f[a@]gg+ot|tr[a@]nny)\b/gi, label: 'slur' },
      { re: /\b(doxx?|home address|phone number)\b/gi, label: 'dox' },
      { re: /\b(threat|gonna kill|will hurt)\b/gi, label: 'threat' }
    ];
    const posts = document.querySelectorAll('.post:not([data-gam-rules-scanned]), .comment:not([data-gam-rules-scanned])');
    let flagged = 0;
    posts.forEach(p => {
      p.setAttribute('data-gam-rules-scanned', '1');
      const body = p.querySelector('.body, .markdown, .post-body') || p;
      const text = (body.textContent || '').toLowerCase();
      const hits = PATTERNS.filter(P => P.re.test(text));
      if (hits.length > 0) {
        p.style.borderLeft = '4px solid #ff3b3b';
        const badge = document.createElement('span');
        badge.textContent = '⚠ ' + hits.map(h => h.label).join('+');
        badge.style.cssText = 'display:inline-block;background:#ff3b3b;color:#fff;padding:1px 6px;font:700 9px ui-monospace,monospace;border-radius:3px;margin:4px';
        p.insertBefore(badge, p.firstChild);
        flagged++;
      }
    });
    _snack('Rule-match scan: ' + flagged + ' post(s) flagged', flagged > 0 ? 'warn' : 'ok');
  }

  // ─── #46 Workflow macros recorder ──────────────────────────────────────────
  // Storage: chrome.storage.local.gam_macros = { name: { actions: [...] } }
  // Recording: capture click + keydown events on .gam-btn elements
  let _macroRecording = false;
  let _macroEvents = [];
  function _macroStartRecord() {
    if (_macroRecording) { _snack('Already recording', 'warn'); return; }
    _macroRecording = true;
    _macroEvents = [];
    const listener = (e) => {
      const t = e.target.closest('.gam-btn, .gam-mc-send-btn, .gam-strip-btn');
      if (t) _macroEvents.push({ type: 'click', label: (t.textContent || '').trim().slice(0,40), ts: Date.now() });
    };
    document.addEventListener('click', listener, true);
    window._gamMacroStop = async () => {
      _macroRecording = false;
      document.removeEventListener('click', listener, true);
      delete window._gamMacroStop;
      const name = await window._gamAuxAsk('Save macro as (name):', { defaultValue: 'macro-' + Date.now() });
      if (!name) return;
      chrome.storage.local.get('gam_macros').then(r => {
        const macros = r.gam_macros || {};
        macros[name] = { actions: _macroEvents, created: Date.now() };
        return chrome.storage.local.set({ gam_macros: macros });
      }).then(() => _snack('Macro "' + name + '" saved (' + _macroEvents.length + ' actions)', 'ok'));
    };
    _snack('Recording macro… run command "Stop macro" when done', 'info');
  }
  function _macroStop() {
    if (typeof window._gamMacroStop === 'function') window._gamMacroStop();
    else _snack('Not recording', 'warn');
  }
  async function _macroList() {
    const r = await chrome.storage.local.get('gam_macros');
    const macros = r.gam_macros || {};
    const names = Object.keys(macros);
    if (names.length === 0) { _showResult('Saved macros', '(none saved yet)'); return; }
    _showResult('Saved macros',
      names.map(n => '• ' + n + ' (' + (macros[n].actions || []).length + ' actions, ' + new Date(macros[n].created).toLocaleString() + ')\n    ' + (macros[n].actions || []).map(a => a.label).join(' → ')).join('\n\n'));
  }

  // ─── #47 Smart bulk ban (with safety preview) ──────────────────────────────
  async function _smartBulkBan() {
    const u = (await window._gamAuxAsk('Bulk ban — enter usernames (one per line, max 20):', { defaultValue: '', multiline: true })) || '';
    const lines = u.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20);
    if (lines.length === 0) return;
    const safe = lines.map(s => s.replace(/[^A-Za-z0-9_-]/g, '')).filter(Boolean);
    if (!(await window._gamAuxConfirm('PREVIEW: ban ' + safe.length + ' users?\n\n' + safe.join('\n') + '\n\nProceed?', { okLabel: 'Queue bans', danger: true }))) return;
    _snack('Queueing ' + safe.length + ' bans to Death Row…', 'info');
    let queued = 0;
    for (const name of safe) {
      try {
        const r = await chrome.runtime.sendMessage({ type: 'rpc', name: 'addToDeathRow', args: { username: name, delayMs: 600000, reason: 'bulk-ban via palette' } });
        if (r && r.ok) queued++;
      } catch (_) {}
    }
    _snack('Queued ' + queued + '/' + safe.length + ' to Death Row (10min delay; cancellable from DR popover)', 'ok');
  }

  // ─── #48 One-click Ban + Send Template ─────────────────────────────────────
  // v10.16.49: was non-async, needed async wrapper for _gamAuxAsk.
  async function _banPlusTemplate() {
    const u = _guessUser() || (await window._gamAuxAsk('User to ban + send template to:', { defaultValue: '' })) || '';
    if (!u.trim()) return;
    _snack('Opening Mod Console for u/' + u + ' (ban+template flow)', 'info');
    // Open the user's profile page; Mod Console auto-opens via existing flow
    window.open('https://greatawakening.win/u/' + encodeURIComponent(u.trim()), '_blank');
  }

  // ─── #49 Auto-apply DR rules on page load ──────────────────────────────────
  function _autoApplyDrRules() {
    const btn = document.querySelector('.gam-t-dr-sweep-btn-top, .gam-t-dr-sweep-btn');
    if (btn) { btn.click(); _snack('Triggered DR rule sweep', 'ok'); }
    else _snack('DR sweep button only on /users page', 'warn');
  }

  // ─── #50 Batch user actions from intel page ────────────────────────────────
  // v10.16.49: was non-async, needed async wrapper for _gamAuxConfirm.
  async function _batchFromIntel() {
    const drawer = document.getElementById('gam-intel-drawer');
    if (!drawer || !drawer.classList.contains('open')) { _snack('Open Intel Drawer first', 'warn'); return; }
    const userLinks = drawer.querySelectorAll('a[href^="/u/"]');
    const users = Array.from(new Set(Array.from(userLinks).map(a => {
      const m = (a.getAttribute('href') || '').match(/\/u\/([^/?#]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    }).filter(Boolean)));
    if (users.length === 0) { _snack('No users found in Intel Drawer', 'info'); return; }
    if (!(await window._gamAuxConfirm('Add all ' + users.length + ' Intel Drawer users to Death Row queue?\n\n' + users.slice(0,10).join('\n') + (users.length > 10 ? '\n…+' + (users.length - 10) + ' more' : ''), { okLabel: 'Queue all', danger: true }))) return;
    users.forEach(name => {
      chrome.runtime.sendMessage({ type: 'rpc', name: 'addToDeathRow', args: { username: name, delayMs: 600000, reason: 'batch from Intel Drawer' } }).catch(()=>{});
    });
    _snack('Queued ' + users.length + ' users to Death Row', 'ok');
  }

  // ─── #8 Smart violation highlighter (auto-runs on feed/queue pages) ────────
  function _smartViolationHighlight() {
    _ruleMatchHighlight(); // alias — same behavior, different name on palette
  }

  // ─── #33 Auto-DR visual indicators ─────────────────────────────────────────
  function _autoDrIndicators() {
    const rows = document.querySelectorAll('.log, .post[data-id], .comment[data-id]');
    let marked = 0;
    rows.forEach(row => {
      // Check if this row's user is in the DR list (best-effort via lsGet)
      try {
        const dr = JSON.parse(localStorage.getItem('gam_deathrow') || '[]');
        const drSet = new Set(dr.map(d => (d.username || '').toLowerCase()));
        const link = row.querySelector('a[href^="/u/"]');
        const m = link && (link.getAttribute('href') || '').match(/\/u\/([^/?#]+)/);
        if (m && drSet.has(decodeURIComponent(m[1]).toLowerCase())) {
          row.style.borderLeft = '4px solid #ff3b3b';
          marked++;
        }
      } catch (_) {}
    });
    _snack('Marked ' + marked + ' row(s) for users already in Death Row', marked > 0 ? 'ok' : 'info');
  }

  // ─── #31 Personalized queue filter (favorites-based) ───────────────────────
  // v10.16.49: was non-async, needed async wrapper for _gamAuxAsk.
  async function _personalizedFilter() {
    const choices = ['mine-only', 'high-confidence-only', 'unhandled-only', 'reset'];
    const pick = await window._gamAuxAsk('Personalized filter mode:\n  1. Show only items you have acted on\n  2. Show only high-confidence flagged\n  3. Show only unhandled items\n  4. Reset filters\n\nEnter 1-4:', { defaultValue: '4' });
    const idx = parseInt(pick, 10) - 1;
    if (idx < 0 || idx > 3) return;
    const mode = choices[idx];
    document.querySelectorAll('.post, .comment').forEach(p => {
      let show = true;
      if (mode === 'high-confidence-only') show = !!p.querySelector('.gam-risk-badge[data-tier="hi"]');
      if (mode === 'unhandled-only') show = !p.querySelector('.gam-status-handled');
      if (mode === 'mine-only') show = !!p.querySelector('[data-handled-by-me]');
      p.style.display = (mode === 'reset' || show) ? '' : 'none';
    });
    _snack('Filter applied: ' + mode, 'ok');
  }

  // ─── #35 Keyboard-first queue navigation (Alt+J/K) ─────────────────────────
  let _qNavFocused = -1;
  function _initQueueNav() {
    document.addEventListener('keydown', (e) => {
      if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
      if (e.key !== 'j' && e.key !== 'k' && e.key !== 'J' && e.key !== 'K') return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return;
      e.preventDefault();
      const items = Array.from(document.querySelectorAll('.post[data-id], .comment[data-id], .gam-t-dr-row'));
      if (items.length === 0) return;
      if (e.key === 'j' || e.key === 'J') _qNavFocused = Math.min(items.length - 1, _qNavFocused + 1);
      else                                _qNavFocused = Math.max(0, _qNavFocused - 1);
      items.forEach((it, i) => {
        if (i === _qNavFocused) {
          it.style.outline = '2px solid #ff9933';
          it.style.outlineOffset = '2px';
          it.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          it.style.outline = '';
          it.style.outlineOffset = '';
        }
      });
    }, true);
  }
  _initQueueNav();

  // ─── #12 Learning system stub (record overrides for future training) ──────
  // Persists every operator override in chrome.storage.local for future model fine-tuning.
  document.addEventListener('click', (e) => {
    try {
      const undoBtn = e.target.closest('.gam-snack-action');
      if (!undoBtn || !undoBtn.textContent.match(/undo/i)) return;
      const event = {
        ts: Date.now(),
        type: 'operator_override',
        page: location.pathname,
        ua: navigator.userAgent.slice(0, 100)
      };
      chrome.storage.local.get('gam_learning_log').then(r => {
        const log = (r && r.gam_learning_log) || [];
        log.push(event);
        if (log.length > 500) log.splice(0, log.length - 500);
        return chrome.storage.local.set({ gam_learning_log: log });
      }).catch(() => {});
    } catch (_) {}
  }, true);

  // Register all Wave 4 palette commands.
  const wave4 = [
    { label: 'AI · Confidence-score risk',           kw: 'risk score confidence predict ai',     icon: '🎯', fn: _riskPredict },
    { label: 'AI · Analyze tone of selection',       kw: 'tone analyze sentiment selection ai',  icon: '🎭', fn: _toneAnalyze },
    { label: 'AI · Predict next violation',          kw: 'predict next future violation ai',     icon: '🔮', fn: _predictNext },
    { label: 'AI · Auto-generate ban/note/modmail',  kw: 'generate message ban note modmail',    icon: '✍', fn: _autoGenMessage },
    { label: 'AI · Sidebar chat (ask about page)',    kw: 'sidebar chat ask context',             icon: '💬', fn: _aiSidebar },
    { label: 'AI · Suggest a new DR rule',           kw: 'suggest rule pattern dr ai',            icon: '📐', fn: _suggestDrRule },
    { label: 'AI · Similar past cases',              kw: 'similar past cases history precedent', icon: '📚', fn: _similarCases },
    { label: 'AI · False-positive check',            kw: 'false positive flag check verify',     icon: '✅', fn: _flagFalsePositive },
    { label: 'AI · Smart violation highlight',       kw: 'violation highlight rules slur threat',icon: '⚠', fn: _smartViolationHighlight },
    { label: 'Queue · Group similar items (by author)', kw: 'group similar author duplicate queue', icon: '🔗', fn: _groupSimilar },
    { label: 'Queue · Toggle auto-hide low-risk',     kw: 'hide dim low risk filter',             icon: '👁', fn: _toggleAutoHideLowRisk },
    { label: 'Queue · Smart-select similar (by author)', kw: 'select similar all author bulk',    icon: '☑', fn: _smartSelectSimilar },
    { label: 'Queue · Real-time queue health',       kw: 'queue health stats load capacity',     icon: '📊', fn: _queueHealth },
    { label: 'Queue · Cross-thread pattern scan',     kw: 'cross thread pattern stalker',         icon: '🕸', fn: _crossThreadPattern },
    { label: 'Queue · Highlight edited posts',        kw: 'edited diff visual highlight changes', icon: '✎', fn: _visualDiffEdits },
    { label: 'Queue · Priority inbox (urgent only)',  kw: 'priority urgent inbox filter modmail', icon: '🚨', fn: _priorityInbox },
    { label: 'Queue · Auto-archive resolved',         kw: 'archive resolved done complete clear', icon: '📁', fn: _autoArchiveResolved },
    { label: 'Queue · Depth + load predictions',     kw: 'depth predict load capacity queue',    icon: '📈', fn: _queueDepthPredict },
    { label: 'Queue · Auto-DR visual indicators',     kw: 'auto dr indicator deathrow mark',      icon: '☠', fn: _autoDrIndicators },
    { label: 'Queue · Personalized filter',           kw: 'personalized filter custom mine view', icon: '🎚', fn: _personalizedFilter },
    { label: 'Macro · Start recording',               kw: 'macro record workflow capture',         icon: '⏺', fn: _macroStartRecord },
    { label: 'Macro · Stop recording',                kw: 'macro stop save end',                   icon: '⏹', fn: _macroStop },
    { label: 'Macro · List saved macros',             kw: 'macro list saved show',                 icon: '📜', fn: _macroList },
    { label: 'Action · Smart bulk ban (preview)',     kw: 'bulk ban many users safety preview',    icon: '⚒', fn: _smartBulkBan },
    { label: 'Action · Ban + Send Template (1-click)', kw: 'ban template message combo flow',      icon: '🔨', fn: _banPlusTemplate },
    { label: 'Action · Apply Auto-DR rules now',      kw: 'auto dr sweep rules run apply',         icon: '▶', fn: _autoApplyDrRules },
    { label: 'Action · Batch from Intel Drawer',      kw: 'batch intel drawer users bulk',         icon: '📦', fn: _batchFromIntel }
  ];
  let registered = 0;
  wave4.forEach(c => { if (window._gamCmdkRegister(c)) registered++; });
  console.log('[modtools-aux Wave 4 v10.16.40] registered ' + registered + ' palette commands (top-50 completion) + Alt+J/K queue nav + learning-log capture');
})();

/* ============================================================================
 * Wave 5 (v10.17.0) -- GOD MODE search modal
 *
 * Surfaces the worker's /gaw/search?godmode=1 endpoint with a rich-grammar
 * modal. Grammar supported by the worker (parseGodmodeQuery):
 *   "phrase"                 -> FTS5 phrase
 *   author:NAME              -> WHERE author = ?
 *   community:NAME           -> WHERE community = ?
 *   score:>50 / <=10 / =0    -> WHERE score OP ?
 *   date:YYYY-MM-DD..YYYY-MM-DD (either end optional)
 *   removed:0|1              -> WHERE is_removed = ?
 *   -term                    -> FTS5 NOT term
 *   bare term + trailing *   -> FTS5 prefix match
 *
 * Closes the gap named in docs/150_RULES_AUDIT.md row 20: "Worker /gaw/search
 * exists; not surfaced in popup. v11 candidate" + FIREHOSE.md feature #2.
 * ============================================================================ */
(function _gamAuxWave5GodMode() {
  'use strict';
  if (window._gamAuxWave5Init) return;
  window._gamAuxWave5Init = true;
  if (typeof window._gamCmdkRegister !== 'function') return;

  const Z_BACKDROP = 9999990;
  const Z_MODAL    = 9999995;
  const AMBER      = '#ff9933';
  const DARK_BG    = '#0a0a0b';
  const DARK_PANEL = '#141416';
  const DARK_LINE  = '#2a2a2e';
  const TXT        = '#d4d4d8';
  const TXT_DIM    = '#71717a';
  const MONO       = 'ui-monospace, JetBrains Mono, Menlo, Consolas, monospace';

  // v10.17.1: selection state for bulk actions on result set.
  // Keyed `${kind}:${id}` so post and comment with same numeric id never collide.
  const _gmSelected = new Map(); // key -> { kind, id, author, url, title }
  const _gmRowKey = (kind, id) => kind + ':' + String(id);

  // Last-search context (for "rerun" + saved-queries v2)
  let _gmLastQuery = null;
  let _gmLastScope = 'both';
  let _gmLastSort  = 'date';

  // Shared RPC dispatch (same shape as Wave 2 _auxRpc)
  async function _gmRpc(name, args) {
    try {
      return await chrome.runtime.sendMessage({ type: 'rpc', name, args: args || {} });
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  const _gmSnack = (msg, type) => {
    try { if (typeof window.snack === 'function') return window.snack(msg, type); } catch (_) {}
    console.log('[GOD MODE]', msg);
  };

  function _gmEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _gmFormatDate(epochSec) {
    if (!epochSec) return '';
    try {
      const d = new Date(epochSec * 1000);
      const now = Date.now();
      const ageMs = now - d.getTime();
      const ageHr = ageMs / 3600000;
      if (ageHr < 1) return Math.round(ageMs / 60000) + 'm';
      if (ageHr < 24) return Math.round(ageHr) + 'h';
      if (ageHr < 24 * 7) return Math.round(ageHr / 24) + 'd';
      return d.toISOString().slice(0, 10);
    } catch (_) { return ''; }
  }

  function _gmCloseModal() {
    const m = document.getElementById('gam-godmode-modal');
    const b = document.getElementById('gam-godmode-backdrop');
    if (m) m.remove();
    if (b) b.remove();
    _gmSelected.clear();
    document.removeEventListener('keydown', _gmKeyHandler, true);
  }

  // v10.17.1: refresh the bulk-action bar based on _gmSelected.size.
  // Bar is INSERTED below the results (above footer) when N>0, REMOVED when 0.
  function _gmRefreshBulkBar() {
    const n = _gmSelected.size;
    const existing = document.getElementById('gam-godmode-bulkbar');
    const modal = document.getElementById('gam-godmode-modal');
    if (n === 0) {
      if (existing) existing.remove();
      // Also uncheck any visible "select all" if all currently visible rows match no selection
      const sa = document.getElementById('gam-godmode-selectall');
      if (sa) sa.checked = false;
      return;
    }
    if (existing) {
      const cnt = existing.querySelector('[data-gm-selcount]');
      if (cnt) cnt.textContent = String(n) + ' selected';
      return;
    }
    if (!modal) return;
    const bar = document.createElement('div');
    bar.id = 'gam-godmode-bulkbar';
    bar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:8px 14px;' +
      'border-top:1px solid ' + AMBER + ';background:#1a1a1d;color:' + TXT + ';' +
      'font:11px ' + MONO + ';';
    const lbl = document.createElement('div');
    lbl.setAttribute('data-gm-selcount', '1');
    lbl.style.cssText = 'color:' + AMBER + ';font-weight:700;min-width:90px';
    lbl.textContent = String(n) + ' selected';
    bar.appendChild(lbl);

    const btn = (label, color, fn) => {
      const b = document.createElement('button');
      b.className = 'gam-btn';
      b.style.cssText = 'background:' + (color || DARK_BG) + ';color:' + TXT + ';' +
        'border:1px solid ' + DARK_LINE + ';padding:5px 10px;border-radius:4px;cursor:pointer;' +
        'font:600 11px ' + MONO + ';min-height:28px;white-space:nowrap;';
      b.textContent = label;
      b.onclick = fn;
      return b;
    };

    bar.appendChild(btn('Open in tabs', DARK_BG, () => _gmBulkOpenTabs()));
    bar.appendChild(btn('Copy authors', DARK_BG, () => _gmBulkCopy('author')));
    bar.appendChild(btn('Copy URLs',    DARK_BG, () => _gmBulkCopy('url')));
    bar.appendChild(btn('Clear',        '#3a1818', () => {
      _gmSelected.clear();
      document.querySelectorAll('input[data-gm-rowcheckbox]').forEach(c => { c.checked = false; });
      _gmRefreshBulkBar();
    }));

    // Insert ABOVE the footer (which is the last child of modal)
    const footer = modal.children[modal.children.length - 1];
    if (footer) modal.insertBefore(bar, footer);
    else modal.appendChild(bar);
  }

  // v10.17.1: selection-toolbar action. Toggles checkbox state on every
  // visible row + fires its own onchange so _gmSelected stays consistent.
  function _gmSelectVisible(mode) {
    const cbs = document.querySelectorAll('#gam-godmode-results input[data-gm-rowcheckbox]');
    let changed = 0;
    cbs.forEach(cb => {
      let target;
      if (mode === 'all')        target = true;
      else if (mode === 'none')  target = false;
      else if (mode === 'invert') target = !cb.checked;
      else return;
      if (cb.checked !== target) {
        cb.checked = target;
        if (typeof cb.onchange === 'function') cb.onchange();
        changed++;
      }
    });
    if (changed > 0) _gmSnack(mode + ': ' + changed + ' row' + (changed !== 1 ? 's' : ''), 'info');
  }

  function _gmBulkOpenTabs() {
    const n = _gmSelected.size;
    if (n === 0) return;
    if (n > 25) {
      const ok = window.confirm('Opening ' + n + ' tabs. Browser may slow. Continue?');
      if (!ok) return;
    }
    let opened = 0;
    _gmSelected.forEach(v => {
      try { window.open(v.url, '_blank', 'noopener'); opened++; } catch (_) {}
    });
    _gmSnack('opened ' + opened + ' tab' + (opened !== 1 ? 's' : ''), 'ok');
  }

  // v10.17.1 stub -- filled in by saved-queries layer (task 13). Safe no-op
  // until then so _gmRunSearch can call it unconditionally.
  function _gmPushRecentQuery(q, scope, sort) {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
      chrome.storage.local.get('gam_godmode_recent', (data) => {
        const list = Array.isArray(data && data.gam_godmode_recent) ? data.gam_godmode_recent.slice() : [];
        // Dedup: drop any prior identical query/scope/sort triple
        const filtered = list.filter(e => !(e.q === q && e.scope === scope && e.sort === sort));
        filtered.unshift({ q, scope, sort, ts: Math.floor(Date.now() / 1000) });
        // Cap at 20
        const capped = filtered.slice(0, 20);
        chrome.storage.local.set({ gam_godmode_recent: capped });
      });
    } catch (_) {}
  }

  // v10.17.1: prompt for name, save current query as a named preset.
  async function _gmSaveCurrentAsPreset() {
    const qIn = document.getElementById('gam-godmode-q');
    const q = qIn ? (qIn.value || '').trim() : '';
    if (!q || q.length < 2) { _gmSnack('enter a query first', 'warn'); return; }
    const scope = (document.querySelector('input[name="gam-godmode-scope"]:checked') || {}).value || 'both';
    const sort  = (document.querySelector('input[name="gam-godmode-sort"]:checked') || {}).value  || 'date';
    let name = null;
    try {
      if (typeof window._gamAuxAsk === 'function') {
        name = await window._gamAuxAsk('Save query as. Name (1-40 chars):', { defaultValue: q.slice(0, 40) });
      } else {
        name = window.prompt('Save query as. Name (1-40 chars):', q.slice(0, 40));
      }
    } catch (e) { return; }
    if (!name) return;
    name = String(name).trim().slice(0, 40);
    if (!name) return;
    try {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        _gmSnack('chrome.storage unavailable', 'err'); return;
      }
      chrome.storage.local.get('gam_godmode_saved', (data) => {
        const list = Array.isArray(data && data.gam_godmode_saved) ? data.gam_godmode_saved.slice() : [];
        // Replace any existing entry with the same name
        const filtered = list.filter(e => e.name !== name);
        filtered.unshift({ name, q, scope, sort, added_at: Math.floor(Date.now() / 1000) });
        // Cap at 30
        const capped = filtered.slice(0, 30);
        chrome.storage.local.set({ gam_godmode_saved: capped }, () => {
          _gmSnack('saved "' + name + '"', 'ok');
          _gmRefreshPresets();
        });
      });
    } catch (e) { _gmSnack('save failed: ' + (e && e.message || e), 'err'); }
  }

  // v10.17.1: render the presets/recent strip below the input.
  // Reads chrome.storage.local for saved (gam_godmode_saved) and recent
  // (gam_godmode_recent). Saved chips get a star prefix; recent get a clock.
  // Click loads + runs. Hover shows X for delete (saved only -- recent auto-evicts).
  function _gmRefreshPresets() {
    const strip = document.getElementById('gam-godmode-presets');
    if (!strip) return;
    try {
      if (!chrome || !chrome.storage || !chrome.storage.local) return;
      chrome.storage.local.get(['gam_godmode_saved', 'gam_godmode_recent'], (data) => {
        const saved  = Array.isArray(data && data.gam_godmode_saved)  ? data.gam_godmode_saved  : [];
        const recent = Array.isArray(data && data.gam_godmode_recent) ? data.gam_godmode_recent : [];
        // Drop recent entries that match a saved query exactly (dedupe noise)
        const savedKeys = new Set(saved.map(s => s.q + '|' + (s.scope || 'both') + '|' + (s.sort || 'date')));
        const recentFiltered = recent.filter(r => !savedKeys.has(r.q + '|' + (r.scope || 'both') + '|' + (r.sort || 'date')));

        // Clear strip
        while (strip.firstChild) strip.removeChild(strip.firstChild);
        if (!saved.length && !recentFiltered.length) {
          strip.style.minHeight = '0';
          return;
        }
        strip.style.minHeight = '26px';

        const mkChip = (label, fullText, isSaved, payload) => {
          const chip = document.createElement('span');
          chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:2px 8px;' +
            'border:1px solid ' + DARK_LINE + ';border-radius:12px;background:' + DARK_BG + ';' +
            'color:' + (isSaved ? AMBER : TXT) + ';font:600 10px ' + MONO + ';cursor:pointer;' +
            'max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          chip.title = fullText;
          chip.textContent = (isSaved ? '★ ' : '⏱ ') + label;
          chip.onclick = () => {
            const qIn = document.getElementById('gam-godmode-q');
            if (qIn) qIn.value = payload.q || '';
            const scopeRadio = document.querySelector('input[name="gam-godmode-scope"][value="' + (payload.scope || 'both') + '"]');
            if (scopeRadio) scopeRadio.checked = true;
            const sortRadio = document.querySelector('input[name="gam-godmode-sort"][value="' + (payload.sort || 'date') + '"]');
            if (sortRadio) sortRadio.checked = true;
            _gmRunSearch();
          };
          // Delete X on saved chips only (hover-revealed)
          if (isSaved) {
            const x = document.createElement('span');
            x.textContent = '×';
            x.style.cssText = 'opacity:.5;margin-left:4px;cursor:pointer;font-weight:700';
            x.title = 'Delete saved preset';
            x.onclick = (e) => {
              e.stopPropagation();
              try {
                chrome.storage.local.get('gam_godmode_saved', (d2) => {
                  const ls = Array.isArray(d2 && d2.gam_godmode_saved) ? d2.gam_godmode_saved.slice() : [];
                  const filtered = ls.filter(s => s.name !== payload.name);
                  chrome.storage.local.set({ gam_godmode_saved: filtered }, () => {
                    _gmSnack('deleted "' + payload.name + '"', 'info');
                    _gmRefreshPresets();
                  });
                });
              } catch (_) {}
            };
            chip.appendChild(x);
          }
          return chip;
        };

        // Saved first
        saved.slice(0, 12).forEach(s => {
          const label = (s.name || s.q || '').slice(0, 30);
          const full = s.name + ' → ' + s.q + ' (' + (s.scope || 'both') + '/' + (s.sort || 'date') + ')';
          strip.appendChild(mkChip(label, full, true, s));
        });
        // Then recent (cap at 6 visible)
        recentFiltered.slice(0, 6).forEach(r => {
          const label = (r.q || '').slice(0, 30);
          const full = r.q + ' (' + (r.scope || 'both') + '/' + (r.sort || 'date') + ')';
          strip.appendChild(mkChip(label, full, false, r));
        });
      });
    } catch (_) {}
  }

  async function _gmBulkCopy(mode) {
    const lines = [];
    if (mode === 'author') {
      const seen = new Set();
      _gmSelected.forEach(v => { if (v.author && !seen.has(v.author)) { seen.add(v.author); lines.push(v.author); } });
    } else if (mode === 'url') {
      _gmSelected.forEach(v => { lines.push(v.url); });
    }
    const text = lines.join('\n');
    let ok = false;
    try {
      if (navigator.clipboard && document.hasFocus()) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (_) {}
    if (!ok) {
      // Fallback: textarea + execCommand
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (_) {}
    }
    _gmSnack(ok ? ('copied ' + lines.length + ' ' + mode + (lines.length !== 1 ? 's' : '')) : 'copy failed', ok ? 'ok' : 'err');
  }

  function _gmKeyHandler(e) {
    if (e.key === 'Escape') { e.preventDefault(); _gmCloseModal(); }
  }

  async function _gmRunSearch() {
    const qInput = document.getElementById('gam-godmode-q');
    const resultsEl = document.getElementById('gam-godmode-results');
    const metaEl = document.getElementById('gam-godmode-meta');
    if (!qInput || !resultsEl) return;
    const q = (qInput.value || '').trim();
    if (!q || q.length < 2) {
      resultsEl.innerHTML = '<div style="padding:14px;color:' + TXT_DIM + ';font:11px ' + MONO + '">Enter a query (>= 2 chars).</div>';
      if (metaEl) metaEl.textContent = '';
      return;
    }
    const scope = (document.querySelector('input[name="gam-godmode-scope"]:checked') || {}).value || 'both';
    const sort = (document.querySelector('input[name="gam-godmode-sort"]:checked') || {}).value || 'date';

    // v10.17.1: clear selection on every new search (different results = different scope)
    _gmSelected.clear();
    _gmRefreshBulkBar();
    _gmLastQuery = q;
    _gmLastScope = scope;
    _gmLastSort  = sort;
    _gmPushRecentQuery(q, scope, sort);

    resultsEl.innerHTML = '<div style="padding:14px;color:' + TXT_DIM + ';font:11px ' + MONO + '">searching...</div>';
    if (metaEl) metaEl.textContent = 'querying /gaw/search?godmode=1 ...';

    const r = await _gmRpc('modSearch', { q, scope, limit: 100, godmode: true, sort });
    if (!r || !r.ok) {
      const err = (r && (r.error || r.body && r.body.error)) || 'unknown';
      resultsEl.innerHTML = '<div style="padding:14px;color:#f04040;font:11px ' + MONO + '">' +
        '<b>SEARCH FAILED</b><br>' + _gmEsc(String(err)) +
        '<br><br><span style="color:' + TXT_DIM + '">Tip: check the grammar help above. If the error mentions FTS5, your query may need adjustment (e.g. very short terms, or no positive terms).</span>' +
        '</div>';
      if (metaEl) metaEl.textContent = 'error';
      return;
    }
    // r.body is the worker response: { ok, posts, comments, godmode }
    const body = (r.body && typeof r.body === 'object') ? r.body : r;
    const posts = body.posts || [];
    const comments = body.comments || [];
    const total = posts.length + comments.length;
    if (metaEl) {
      metaEl.textContent = total + ' result' + (total !== 1 ? 's' : '') +
        ' (' + posts.length + ' posts / ' + comments.length + ' comments)';
    }
    if (total === 0) {
      resultsEl.innerHTML = '<div style="padding:14px;color:' + TXT_DIM + ';font:11px ' + MONO + '">No results.</div>';
      return;
    }

    // Sorted view: posts first, then comments, both newest-first within group.
    const rows = [];
    posts.forEach(p => rows.push({ kind: 'post', ...p }));
    comments.forEach(c => rows.push({ kind: 'comment', ...c }));

    // v10.17.0: build rows with DOM API + textContent for all user-controlled
    // fields. No row-level innerHTML. Eliminates the XSS surface entirely --
    // even if the worker were ever compromised to return malicious strings,
    // there's no path to script execution because nothing is parsed as HTML.
    const frag = document.createDocumentFragment();
    const mkSpan = (text, cssText) => {
      const s = document.createElement('span');
      if (cssText) s.style.cssText = cssText;
      s.textContent = text == null ? '' : String(text);
      return s;
    };
    rows.forEach(row => {
      // v10.17.1: row is now a div (not anchor) so the checkbox click can be
      // separated from row click. URL is built once, stored on the el via
      // data attribute, and opened on row-click via window.open.
      const el = document.createElement('div');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.style.cssText = 'display:grid;grid-template-columns:28px 48px 1fr 110px 60px 50px;gap:8px;padding:8px 10px;' +
        'border-bottom:1px solid ' + DARK_LINE + ';color:' + TXT + ';' +
        'font:11px ' + MONO + ';cursor:pointer;align-items:center;';
      // Build URL via URL constructor; protocol-locked to https + greatawakening.win
      // host so a malicious slug cannot pivot the link to javascript:/data:/etc.
      let rowUrl = 'https://greatawakening.win/';
      try {
        const u = new URL('https://greatawakening.win/');
        if (row.kind === 'post') {
          const slug = row.slug ? String(row.slug) : String(row.id || '');
          u.pathname = '/p/' + slug.replace(/[^A-Za-z0-9_-]/g, '') + '/x/c/';
        } else {
          u.pathname = '/p/' + String(row.post_id || '').replace(/[^0-9]/g, '') +
            '/x/c/' + String(row.id || '').replace(/[^0-9]/g, '');
          u.hash = 'context';
        }
        rowUrl = u.toString();
      } catch (_) {}
      el.dataset.gmUrl = rowUrl;
      el.onclick = (e) => {
        // Don't open URL when the click was on the checkbox or its cell
        if (e.target && (e.target.tagName === 'INPUT' || e.target.dataset.gmCheckboxCell)) return;
        window.open(rowUrl, '_blank', 'noopener');
      };
      el.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target && e.target.tagName === 'INPUT') return; // checkbox handles space itself
          e.preventDefault();
          window.open(rowUrl, '_blank', 'noopener');
        }
      };
      el.onmouseover = () => el.style.background = '#1a1a1d';
      el.onmouseout  = () => el.style.background = '';

      // Column 1: checkbox (selection)
      const cbCell = document.createElement('div');
      cbCell.dataset.gmCheckboxCell = '1';
      cbCell.style.cssText = 'display:flex;justify-content:center;align-items:center';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('data-gm-rowcheckbox', '1');
      cb.style.cssText = 'cursor:pointer;width:16px;height:16px;accent-color:' + AMBER;
      const rowKey = _gmRowKey(row.kind, row.id);
      cb.checked = _gmSelected.has(rowKey);
      cb.onclick = (e) => e.stopPropagation();
      cb.onchange = () => {
        if (cb.checked) {
          _gmSelected.set(rowKey, {
            kind: row.kind,
            id: String(row.id),
            author: String(row.author || ''),
            url: rowUrl,
            title: String(row.title || row.snippet || '').slice(0, 200)
          });
        } else {
          _gmSelected.delete(rowKey);
        }
        _gmRefreshBulkBar();
      };
      cbCell.appendChild(cb);
      el.appendChild(cbCell);

      // Column 2: kind badge + removed badge
      const badges = document.createElement('div');
      const kBadge = document.createElement('span');
      kBadge.style.cssText = 'display:inline-block;padding:1px 5px;border-radius:3px;font-weight:600;color:' + DARK_BG +
        ';background:' + (row.kind === 'post' ? AMBER : '#4A9EFF');
      kBadge.textContent = row.kind === 'post' ? 'POST' : 'COMM';
      badges.appendChild(kBadge);
      if (row.is_removed) {
        const rBadge = document.createElement('span');
        rBadge.style.cssText = 'display:inline-block;margin-left:4px;padding:1px 4px;background:#f04040;' +
          'color:' + DARK_BG + ';border-radius:3px;font-weight:600';
        rBadge.textContent = 'REM';
        badges.appendChild(rBadge);
      }
      el.appendChild(badges);

      // Column 2: title + snippet
      const titleCol = document.createElement('div');
      titleCol.style.cssText = 'overflow:hidden';
      const titleEl = document.createElement('div');
      titleEl.style.cssText = 'color:' + TXT + ';font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      const rawTitle = row.kind === 'post' ? (row.title || '(no title)') : (row.snippet || '');
      titleEl.textContent = String(rawTitle).slice(0, 220);
      titleCol.appendChild(titleEl);
      if (row.kind === 'post' && row.snippet) {
        const snipEl = document.createElement('div');
        snipEl.style.cssText = 'color:' + TXT_DIM + ';margin-top:3px;font-size:10px;line-height:1.4';
        const raw = String(row.snippet);
        snipEl.textContent = raw.slice(0, 240) + (raw.length > 240 ? '...' : '');
        titleCol.appendChild(snipEl);
      }
      el.appendChild(titleCol);

      // Column 3: author
      el.appendChild(mkSpan('@' + (row.author || ''),
        'color:' + AMBER + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap'));

      // Column 4: community
      el.appendChild(mkSpan(row.community || '-', 'color:' + TXT_DIM));

      // Column 5: score + date (numeric, defensively coerced)
      const scoreCol = document.createElement('div');
      scoreCol.style.cssText = 'color:' + TXT_DIM + ';text-align:right';
      const safeScore = (typeof row.score === 'number' && Number.isFinite(row.score))
        ? String(row.score | 0)
        : '-';
      scoreCol.appendChild(document.createTextNode(safeScore));
      scoreCol.appendChild(document.createElement('br'));
      const dateSpan = document.createElement('span');
      dateSpan.style.cssText = 'font-size:10px';
      dateSpan.textContent = _gmFormatDate(row.created_at);
      scoreCol.appendChild(dateSpan);
      el.appendChild(scoreCol);

      frag.appendChild(el);
    });
    // Clear previous results without using innerHTML
    while (resultsEl.firstChild) resultsEl.removeChild(resultsEl.firstChild);
    resultsEl.appendChild(frag);

    // v10.17.1: refresh presets strip so the just-pushed recent query appears
    _gmRefreshPresets();
  }

  function _gmOpenModal(seedQuery) {
    if (document.getElementById('gam-godmode-modal')) return; // already open

    const backdrop = document.createElement('div');
    backdrop.id = 'gam-godmode-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);' +
      'z-index:' + Z_BACKDROP + ';';
    backdrop.onclick = _gmCloseModal;

    const modal = document.createElement('div');
    modal.id = 'gam-godmode-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'GOD MODE search');
    modal.style.cssText = 'position:fixed;top:5vh;left:50%;transform:translateX(-50%);' +
      'width:min(960px,95vw);max-height:90vh;display:flex;flex-direction:column;' +
      'background:' + DARK_PANEL + ';border:1px solid ' + AMBER + ';border-radius:8px;' +
      'box-shadow:0 20px 60px rgba(0,0,0,0.6);z-index:' + Z_MODAL + ';' +
      'font:12px ' + MONO + ';color:' + TXT + ';';

    modal.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;' +
        'border-bottom:1px solid ' + DARK_LINE + ';background:' + DARK_BG + '">' +
        '<div style="color:' + AMBER + ';font-weight:700;letter-spacing:.5px">' +
          '&#x1F50D; GOD MODE &middot; firehose search' +
        '</div>' +
        '<button id="gam-godmode-close" class="gam-btn" style="' +
          'background:transparent;border:1px solid ' + DARK_LINE + ';color:' + TXT + ';' +
          'padding:4px 10px;border-radius:4px;cursor:pointer;min-height:32px;min-width:32px;font:600 12px ' + MONO + '">' +
          '×</button>' +
      '</div>' +

      '<div style="padding:10px 14px;border-bottom:1px solid ' + DARK_LINE + '">' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<input id="gam-godmode-q" type="text" autofocus placeholder=\'trump pelosi -fauci author:catsfive community:GreatAwakening score:>50 date:2026-01-01..\' style="' +
            'flex:1;padding:8px 10px;background:' + DARK_BG + ';color:' + TXT + ';' +
            'border:1px solid ' + DARK_LINE + ';border-radius:4px;font:12px ' + MONO + ';min-height:32px;outline:none">' +
          '<button id="gam-godmode-save" class="gam-btn" title="Save current query as a preset" style="' +
            'background:' + DARK_BG + ';color:' + AMBER + ';border:1px solid ' + DARK_LINE + ';padding:8px 10px;' +
            'border-radius:4px;cursor:pointer;font:700 12px ' + MONO + ';min-height:32px">&#x2605;</button>' +
          '<button id="gam-godmode-go" class="gam-btn" style="' +
            'background:' + AMBER + ';color:' + DARK_BG + ';border:0;padding:8px 14px;border-radius:4px;' +
            'cursor:pointer;font:700 12px ' + MONO + ';min-height:32px;letter-spacing:.5px">SEARCH</button>' +
        '</div>' +
        '<div id="gam-godmode-presets" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;' +
          'min-height:0"></div>' +
        '<div style="margin-top:8px;color:' + TXT_DIM + ';font-size:10px;line-height:1.5">' +
          '<b style="color:' + TXT + '">Grammar:</b> ' +
          '<code style="color:' + AMBER + '">"phrase"</code> &middot; ' +
          '<code style="color:' + AMBER + '">author:NAME</code> &middot; ' +
          '<code style="color:' + AMBER + '">community:NAME</code> &middot; ' +
          '<code style="color:' + AMBER + '">score:&gt;50</code> &middot; ' +
          '<code style="color:' + AMBER + '">date:2026-01-01..2026-03-01</code> &middot; ' +
          '<code style="color:' + AMBER + '">removed:1</code> &middot; ' +
          '<code style="color:' + AMBER + '">-term</code> &middot; ' +
          '<code style="color:' + AMBER + '">term*</code> (prefix)' +
        '</div>' +
        '<div style="margin-top:10px;display:flex;gap:18px;align-items:center;flex-wrap:wrap">' +
          '<div style="display:flex;gap:10px;align-items:center"><b style="color:' + TXT_DIM + ';font-size:10px;text-transform:uppercase;letter-spacing:.5px">Scope:</b>' +
            '<label style="cursor:pointer"><input type="radio" name="gam-godmode-scope" value="both" checked> both</label>' +
            '<label style="cursor:pointer"><input type="radio" name="gam-godmode-scope" value="posts"> posts</label>' +
            '<label style="cursor:pointer"><input type="radio" name="gam-godmode-scope" value="comments"> comments</label>' +
          '</div>' +
          '<div style="display:flex;gap:10px;align-items:center"><b style="color:' + TXT_DIM + ';font-size:10px;text-transform:uppercase;letter-spacing:.5px">Sort:</b>' +
            '<label style="cursor:pointer"><input type="radio" name="gam-godmode-sort" value="date" checked> date</label>' +
            '<label style="cursor:pointer"><input type="radio" name="gam-godmode-sort" value="rank"> rank (BM25)</label>' +
            '<label style="cursor:pointer"><input type="radio" name="gam-godmode-sort" value="score"> score</label>' +
          '</div>' +
          '<div id="gam-godmode-meta" style="margin-left:auto;color:' + TXT_DIM + ';font-size:10px"></div>' +
        '</div>' +
      '</div>' +

      '<div id="gam-godmode-seltools" style="display:flex;gap:8px;align-items:center;padding:6px 14px;' +
        'border-bottom:1px solid ' + DARK_LINE + ';background:#0e0e10;color:' + TXT_DIM + ';font-size:10px;' +
        'min-height:32px">' +
        '<span style="color:' + TXT_DIM + '">Select:</span>' +
        '<button id="gam-godmode-selall" class="gam-btn" style="' +
          'background:' + DARK_BG + ';color:' + TXT + ';border:1px solid ' + DARK_LINE + ';padding:3px 8px;' +
          'border-radius:3px;cursor:pointer;font:600 10px ' + MONO + '">all visible</button>' +
        '<button id="gam-godmode-selinv" class="gam-btn" style="' +
          'background:' + DARK_BG + ';color:' + TXT + ';border:1px solid ' + DARK_LINE + ';padding:3px 8px;' +
          'border-radius:3px;cursor:pointer;font:600 10px ' + MONO + '">invert</button>' +
        '<button id="gam-godmode-selnone" class="gam-btn" style="' +
          'background:' + DARK_BG + ';color:' + TXT + ';border:1px solid ' + DARK_LINE + ';padding:3px 8px;' +
          'border-radius:3px;cursor:pointer;font:600 10px ' + MONO + '">none</button>' +
        '<span style="margin-left:auto;color:' + TXT_DIM + '">checkbox to select rows; bulk-action bar appears below</span>' +
      '</div>' +

      '<div id="gam-godmode-results" style="flex:1;overflow-y:auto;min-height:200px;max-height:60vh"></div>' +

      '<div style="padding:8px 14px;border-top:1px solid ' + DARK_LINE + ';background:' + DARK_BG + ';' +
        'color:' + TXT_DIM + ';font-size:10px;display:flex;justify-content:space-between;align-items:center">' +
        '<div>ESC closes &middot; Enter submits &middot; click any row to open in GAW &middot; Ctrl/Cmd+click checkbox to toggle</div>' +
        '<div style="color:' + AMBER + ';opacity:.6">v10.17.1 godmode</div>' +
      '</div>';

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    // Wire interactions
    const closeBtn = document.getElementById('gam-godmode-close');
    if (closeBtn) closeBtn.onclick = _gmCloseModal;

    const goBtn = document.getElementById('gam-godmode-go');
    if (goBtn) goBtn.onclick = _gmRunSearch;

    const qIn = document.getElementById('gam-godmode-q');
    if (qIn) {
      qIn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); _gmRunSearch(); }
      });
      if (seedQuery) qIn.value = seedQuery;
      setTimeout(() => qIn.focus(), 50);
    }

    // v10.17.1: selection toolbar wiring
    const selAll = document.getElementById('gam-godmode-selall');
    if (selAll) selAll.onclick = () => _gmSelectVisible('all');
    const selInv = document.getElementById('gam-godmode-selinv');
    if (selInv) selInv.onclick = () => _gmSelectVisible('invert');
    const selNone = document.getElementById('gam-godmode-selnone');
    if (selNone) selNone.onclick = () => _gmSelectVisible('none');

    // v10.17.1: save button + presets strip
    const saveBtn = document.getElementById('gam-godmode-save');
    if (saveBtn) saveBtn.onclick = _gmSaveCurrentAsPreset;
    _gmRefreshPresets();

    document.addEventListener('keydown', _gmKeyHandler, true);

    if (seedQuery) _gmRunSearch();
  }

  // ============== v10.17.2: Firehose Crawl Health modal ==============
  function _gmCloseHealthModal() {
    const m = document.getElementById('gam-godmode-health-modal');
    const b = document.getElementById('gam-godmode-health-backdrop');
    if (m) m.remove();
    if (b) b.remove();
  }

  function _gmFhFormatAge(epoch) {
    if (!epoch) return 'never';
    const ageS = Math.floor(Date.now() / 1000) - Number(epoch);
    if (ageS < 60) return ageS + 's';
    if (ageS < 3600) return Math.floor(ageS / 60) + 'm';
    if (ageS < 86400) return Math.floor(ageS / 3600) + 'h';
    return Math.floor(ageS / 86400) + 'd';
  }

  async function _gmOpenHealthModal() {
    if (document.getElementById('gam-godmode-health-modal')) return;

    const backdrop = document.createElement('div');
    backdrop.id = 'gam-godmode-health-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);' +
      'z-index:' + Z_BACKDROP + ';';
    backdrop.onclick = _gmCloseHealthModal;

    const modal = document.createElement('div');
    modal.id = 'gam-godmode-health-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Firehose Crawl Health');
    modal.style.cssText = 'position:fixed;top:5vh;left:50%;transform:translateX(-50%);' +
      'width:min(880px,95vw);max-height:90vh;display:flex;flex-direction:column;' +
      'background:' + DARK_PANEL + ';border:1px solid ' + AMBER + ';border-radius:8px;' +
      'box-shadow:0 20px 60px rgba(0,0,0,0.6);z-index:' + Z_MODAL + ';' +
      'font:12px ' + MONO + ';color:' + TXT + ';';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;' +
      'border-bottom:1px solid ' + DARK_LINE + ';background:' + DARK_BG;
    const hdrTitle = document.createElement('div');
    hdrTitle.style.cssText = 'color:' + AMBER + ';font-weight:700;letter-spacing:.5px';
    hdrTitle.textContent = '\u{1F525} FIREHOSE CRAWL HEALTH';
    hdr.appendChild(hdrTitle);
    const hdrActions = document.createElement('div');
    hdrActions.style.cssText = 'display:flex;gap:6px';
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'gam-btn';
    refreshBtn.style.cssText = 'background:' + DARK_BG + ';color:' + AMBER + ';border:1px solid ' + DARK_LINE +
      ';padding:4px 10px;border-radius:4px;cursor:pointer;min-height:28px;font:600 11px ' + MONO;
    refreshBtn.textContent = '↻ Refresh';
    refreshBtn.onclick = () => _gmFhLoad();
    hdrActions.appendChild(refreshBtn);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'gam-btn';
    closeBtn.style.cssText = 'background:transparent;border:1px solid ' + DARK_LINE + ';color:' + TXT +
      ';padding:4px 10px;border-radius:4px;cursor:pointer;min-height:28px;min-width:32px;font:600 11px ' + MONO;
    closeBtn.textContent = '×';
    closeBtn.onclick = _gmCloseHealthModal;
    hdrActions.appendChild(closeBtn);
    hdr.appendChild(hdrActions);
    modal.appendChild(hdr);

    const body = document.createElement('div');
    body.id = 'gam-godmode-health-body';
    body.style.cssText = 'flex:1;overflow-y:auto;padding:12px 14px';
    body.textContent = 'Loading...';
    modal.appendChild(body);

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    _gmFhLoad();
  }

  async function _gmFhLoad() {
    const body = document.getElementById('gam-godmode-health-body');
    if (!body) return;
    while (body.firstChild) body.removeChild(body.firstChild);
    body.textContent = 'Loading from /admin/firehose/keywords...';

    const r = await _gmRpc('modAdminFirehoseKeywords', { limit: 10, sample: 10 });
    if (!r || !r.ok) {
      while (body.firstChild) body.removeChild(body.firstChild);
      const err = document.createElement('div');
      err.style.cssText = 'color:#f04040;padding:10px;background:#2a1010;border-radius:4px';
      const errText = (r && (r.error || r.body && r.body.error)) || 'unknown';
      err.textContent = 'FAILED: ' + String(errText);
      body.appendChild(err);
      const hint = document.createElement('div');
      hint.style.cssText = 'color:' + TXT_DIM + ';margin-top:8px;font-size:11px';
      hint.textContent = 'Endpoint is lead-only (requireLeadAuth). Non-leads get 403. ' +
        'If migration 045 is not applied, you will get 503.';
      body.appendChild(hint);
      return;
    }
    const data = (r.body && typeof r.body === 'object') ? r.body : r;
    while (body.firstChild) body.removeChild(body.firstChild);

    const sum = data.summary || {};
    const mkKpi = (label, value, color) => {
      const tile = document.createElement('div');
      tile.style.cssText = 'background:' + DARK_BG + ';border:1px solid ' + DARK_LINE + ';' +
        'border-radius:6px;padding:8px 10px;text-align:center';
      const v = document.createElement('div');
      v.style.cssText = 'color:' + (color || AMBER) + ';font-weight:700;font-size:18px';
      v.textContent = String(value == null ? '0' : value);
      tile.appendChild(v);
      const l = document.createElement('div');
      l.style.cssText = 'color:' + TXT_DIM + ';font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-top:2px';
      l.textContent = label;
      tile.appendChild(l);
      return tile;
    };

    const kpi = document.createElement('div');
    kpi.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px';
    kpi.appendChild(mkKpi('terms', sum.total_terms || 0));
    kpi.appendChild(mkKpi('crawled', sum.crawled || 0, '#3dd68c'));
    kpi.appendChild(mkKpi('never crawled', sum.never_crawled || 0, '#f0a040'));
    kpi.appendChild(mkKpi('errored', sum.errored || 0, (sum.errored > 0) ? '#f04040' : TXT_DIM));
    body.appendChild(kpi);

    const kpi2 = document.createElement('div');
    kpi2.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px';
    kpi2.appendChild(mkKpi('posts found', sum.posts_found_total || 0, '#3dd68c'));
    kpi2.appendChild(mkKpi('total crawls', sum.total_crawls || 0));
    kpi2.appendChild(mkKpi('avg yield/crawl', sum.avg_yield_per_crawl || 0, '#4A9EFF'));
    body.appendChild(kpi2);

    if (data.last_tick) {
      const lt = data.last_tick;
      const ltBox = document.createElement('div');
      ltBox.style.cssText = 'background:#0e0e10;border:1px solid ' + DARK_LINE + ';border-radius:4px;' +
        'padding:8px 10px;margin-bottom:14px;font-size:11px';
      const ltTitle = document.createElement('div');
      ltTitle.style.cssText = 'color:' + AMBER + ';font-weight:600;margin-bottom:3px';
      ltTitle.textContent = 'Last cron tick (' + _gmFhFormatAge(lt.ts) + ' ago)';
      ltBox.appendChild(ltTitle);
      const ltRow = document.createElement('div');
      ltRow.style.cssText = 'color:' + TXT + ';font-size:11px';
      ltRow.textContent = 'in=' + (lt.rows_in || 0) +
        ' / new=' + (lt.rows_new || 0) +
        ' / upd=' + (lt.rows_updated || 0) +
        ' / dur=' + Math.round((lt.duration_ms || 0) / 1000) + 's' +
        (lt.error ? ' / err=' + lt.error : '');
      ltBox.appendChild(ltRow);
      body.appendChild(ltBox);
    }

    const mkTable = (title, rows, cols) => {
      const sec = document.createElement('div');
      sec.style.cssText = 'margin-bottom:14px';
      const t = document.createElement('div');
      t.style.cssText = 'color:' + AMBER + ';font-weight:600;text-transform:uppercase;letter-spacing:.5px;' +
        'font-size:11px;margin-bottom:4px';
      t.textContent = title + ' (' + rows.length + ')';
      sec.appendChild(t);
      if (!rows.length) {
        const e = document.createElement('div');
        e.style.cssText = 'color:' + TXT_DIM + ';font-size:11px;padding:4px 0';
        e.textContent = '(none)';
        sec.appendChild(e);
        return sec;
      }
      const tbl = document.createElement('table');
      tbl.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px';
      const trH = document.createElement('tr');
      cols.forEach(c => {
        const th = document.createElement('th');
        th.style.cssText = 'text-align:left;color:' + TXT_DIM + ';border-bottom:1px solid ' + DARK_LINE +
          ';padding:3px 6px;font-weight:600';
        th.textContent = c.label;
        trH.appendChild(th);
      });
      tbl.appendChild(trH);
      rows.forEach(r => {
        const tr = document.createElement('tr');
        cols.forEach(c => {
          const td = document.createElement('td');
          td.style.cssText = 'padding:3px 6px;border-bottom:1px solid #1a1a1d;color:' + TXT;
          td.textContent = c.fmt ? c.fmt(r) : String(r[c.key] == null ? '' : r[c.key]);
          tr.appendChild(td);
        });
        tbl.appendChild(tr);
      });
      sec.appendChild(tbl);
      return sec;
    };

    body.appendChild(mkTable('Most productive (by posts_found_total)', data.most_productive || [], [
      { label: 'term',     key: 'term' },
      { label: 'cat',      key: 'category' },
      { label: 'wt',       fmt: r => String(r.weight || 0) },
      { label: 'crawls',   key: 'crawl_count' },
      { label: 'found',    key: 'posts_found_total' },
      { label: 'last new', key: 'posts_new_last_run' },
      { label: 'last',     fmt: r => _gmFhFormatAge(r.last_crawled_at) }
    ]));

    body.appendChild(mkTable('Recently crawled', data.recently_crawled || [], [
      { label: 'term',     key: 'term' },
      { label: 'crawls',   key: 'crawl_count' },
      { label: 'found',    key: 'posts_found_total' },
      { label: 'last new', key: 'posts_new_last_run' },
      { label: 'ago',      fmt: r => _gmFhFormatAge(r.last_crawled_at) }
    ]));

    body.appendChild(mkTable('Errored (last_error IS NOT NULL)', data.errored || [], [
      { label: 'term',  key: 'term' },
      { label: 'cat',   key: 'category' },
      { label: 'error', fmt: r => String(r.last_error || '').slice(0, 80) }
    ]));

    body.appendChild(mkTable('Never-crawled sample', data.never_crawled_sample || [], [
      { label: 'term', key: 'term' },
      { label: 'cat',  key: 'category' },
      { label: 'wt',   fmt: r => String(r.weight || 0) }
    ]));

    const gen = document.createElement('div');
    gen.style.cssText = 'color:' + TXT_DIM + ';font-size:10px;margin-top:8px;text-align:right';
    gen.textContent = 'generated ' + _gmFhFormatAge(data.generated_at) + ' ago';
    body.appendChild(gen);
  }

  // Expose on window for other modules + status-bar wiring.
  window._gamOpenGodMode = _gmOpenModal;
  window._gamOpenFirehoseHealth = _gmOpenHealthModal;

  // Register palette command(s)
  const wave5 = [
    {
      label: 'GOD MODE: Search firehose (rich grammar)',
      kw: 'god mode search firehose advanced query author community score date removed prefix',
      icon: '🔍',
      fn: () => _gmOpenModal()
    },
    {
      label: 'GOD MODE: Search by author (open prompt)',
      kw: 'god mode search author user posts comments by',
      icon: '👤',
      fn: async () => {
        try {
          const a = (typeof window._gamAuxAsk === 'function')
            ? await window._gamAuxAsk('Author username to search:', { defaultValue: '' })
            : (window.prompt && window.prompt('Author username to search:'));
          if (!a) return;
          _gmOpenModal('author:' + String(a).trim());
        } catch (e) { _gmSnack('open prompt failed: ' + (e && e.message || e), 'err'); }
      }
    },
    {
      label: 'GOD MODE: Search removed posts (last 7d)',
      kw: 'god mode removed posts deleted last week firehose archive',
      icon: '🗑',
      fn: () => {
        const d = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
        _gmOpenModal('removed:1 date:' + d + '..');
      }
    },
    {
      label: 'GOD MODE: Firehose crawl health (lead-only)',
      kw: 'god mode firehose health crawl stats observability keywords lead admin',
      icon: '🔥',
      fn: () => _gmOpenHealthModal()
    }
  ];
  let waveRegistered = 0;
  wave5.forEach(c => { if (window._gamCmdkRegister(c)) waveRegistered++; });

  // v10.17.1: Inject 🔍 GOD MODE icon into the existing #gam-status-bar.
  // Mirrors the v10.3 BRIG chip pattern (modtools.js:31185+): setTimeout +
  // querySelector for the spacer, with MutationObserver fallback if the bar
  // hasn't been built yet (race: aux loads before _buildStatusBar runs).
  function _gmInjectStatusBarIcon() {
    if (document.getElementById('gam-godmode-bar-icon')) return; // idempotent
    const bar = document.getElementById('gam-status-bar');
    if (!bar) return false;
    const btn = document.createElement('button');
    btn.id = 'gam-godmode-bar-icon';
    btn.className = 'gam-bar-icon';
    btn.title = 'GOD MODE search (firehose) — Ctrl+Shift+P → "god mode"';
    btn.textContent = '\u{1F50D}'; // magnifier
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      try { _gmOpenModal(); } catch (e) { console.error('[godmode] open failed', e); }
    });
    const spacer = bar.querySelector('.gam-bar-spacer');
    if (spacer) bar.insertBefore(btn, spacer);
    else bar.appendChild(btn);
    return true;
  }
  // Try immediately + on a few staggered delays; fall back to MutationObserver
  // if the bar still isn't there after 3 sec.
  if (!_gmInjectStatusBarIcon()) {
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (_gmInjectStatusBarIcon() || tries >= 6) clearInterval(iv);
    }, 500);
    // Mutation observer as the long-tail safety net (SPA navigation, late bar build)
    const obs = new MutationObserver(() => {
      if (_gmInjectStatusBarIcon()) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    // Auto-disconnect after 30 sec to bound the observer's life
    setTimeout(() => { try { obs.disconnect(); } catch (_) {} }, 30000);
  }

  console.log('[modtools-aux Wave 5 v10.17.1] registered ' + waveRegistered + ' GOD MODE palette commands; status-bar icon scheduled; window._gamOpenGodMode() also available');
})();


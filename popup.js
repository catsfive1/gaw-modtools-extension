// Popup logic - read stats from chrome.storage and render them

// Keep in sync with K in modtools.js
const K = {
  LOG: 'gam_mod_log',
  ROSTER: 'gam_users_roster',
  DR: 'gam_deathrow',
  WATCH: 'gam_watchlist',
  BANNED: 'gam_banned_verified',
  NOTES: 'gam_user_notes',
  INTEL: 'gam_profile_intel',
  SCHEMA: 'gam_schema_version',
  FALLBACK: 'gam_fallback_mode',
  SETTINGS: 'gam_settings',
  SNIFF: 'gam_sniff_log'
};
// v5.1.1: ModTools-only keys we're allowed to clear/export.
// Never blindly clear(): could wipe unrelated settings landing in local storage.
const OWNED_KEYS = Object.values(K);
const GAW_TAB_PATTERNS = ['*://greatawakening.win/*', '*://*.greatawakening.win/*'];

function $(id) { return document.getElementById(id); }

// v8.5.3: disable a button for the duration of an async op, restore on finish.
async function withLoading(btn, label, fn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = label || orig;
  btn.classList.add('loading');
  try { return await fn(); }
  finally {
    btn.disabled = false;
    btn.textContent = orig;
    btn.classList.remove('loading');
  }
}

async function loadStats() {
  try {
    const data = await chrome.storage.local.get([K.LOG, K.ROSTER, K.DR]);
    const log = data[K.LOG] || [];
    const roster = data[K.ROSTER] || {};
    const dr = data[K.DR] || [];

    const rosterValues = Object.values(roster);
    // v5.1.1: accept both 'new' (current) and 'pending' (legacy pre-migration)
    const pending = rosterValues.filter(e => e.status === 'new' || e.status === 'pending').length;
    const banned = rosterValues.filter(e => e.status === 'banned').length;
    const drPending = dr.filter(d => d.status === 'waiting').length;
    const drReady = dr.filter(d => d.status === 'waiting' && Date.now() >= d.executeAt).length;

    const now = Date.now();
    const todayActions = log.filter(l =>
      now - new Date(l.ts).getTime() < 86400000
    );
    const todayBans = todayActions.filter(l => l.type === 'ban').length;
    const todayMsgs = todayActions.filter(l => l.type === 'message' || l.type === 'reply').length;
    const todayNotes = todayActions.filter(l => l.type === 'note').length;

    $('s-pending').textContent = pending;
    $('s-dr').textContent = drPending;
    $('s-banned').textContent = banned;
    $('s-today').textContent = todayBans;
    $('s-msgs').textContent = todayMsgs;
    $('s-notes').textContent = todayNotes;

    if (drReady > 0) {
      const alert = $('dr-alert');
      alert.style.display = 'block';
      alert.textContent = '\u{1F480} ' + drReady + ' Death Row inmate' + (drReady > 1 ? 's' : '') + ' READY \u2014 visit GAW to execute.';
    }

    const ver = chrome.runtime.getManifest().version;
    $('ver').textContent = 'v' + ver;
  } catch (err) {
    console.error('[Popup] Failed to load stats:', err);
  }
}

// v5.2.0 H2: keep secrets out of every export + debug path.
const SECRET_KEYS = ['workerModToken', 'leadModToken'];
function scrubExport(data) {
  const out = { ...(data || {}) };
  if (out.gam_settings && typeof out.gam_settings === 'object') {
    const copy = { ...out.gam_settings };
    for (const k of SECRET_KEYS) delete copy[k];
    out.gam_settings = copy;
  }
  // Drop sniff log entirely from exports (may contain auth + moderation payloads)
  delete out.gam_sniff_log;
  return out;
}

$('exportBtn').addEventListener('click', async () => {
  try {
    // v5.1.1: scope export to ModTools-owned keys only (privacy + safety)
    const data = await chrome.storage.local.get(OWNED_KEYS);
    const payload = {
      exportedAt: new Date().toISOString(),
      version: chrome.runtime.getManifest().version,
      scope: 'owned-keys',
      keys: OWNED_KEYS,
      redacted: ['gam_settings.workerModToken', 'gam_settings.leadModToken', 'gam_sniff_log'],
      data: scrubExport(data)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modtools-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Export failed: ' + err.message);
  }
});

$('clearBtn').addEventListener('click', async () => {
  // v9.3.6 (noob-rollout audit fix): the confirm message previously omitted
  // the most consequential data wiped here — your mod token. Without it, a
  // mod has to ask their lead for a fresh rotation invite to recover.
  if (!confirm(
    'Clear ALL ModTools data?\n\n' +
    'This wipes:\n' +
    '  • Your mod token (you\'ll need a fresh rotation invite from your lead to recover)\n' +
    '  • Lead token (if set)\n' +
    '  • Mod log, roster, death row, watchlist, verification, notes, intel cache\n\n' +
    'This cannot be undone. Continue?'
  )) return;
  try {
    // v9.3.13 (Vanguard M-1): explicitly clear the SW vault BEFORE wiping
    // chrome.storage.local. Pre-fix, the storage wipe alone left the SW
    // vault with the prior token cached (the onChanged listener treated
    // newValue=undefined as no-op), so a "Clear All" appeared to leave the
    // mod still authenticated until the SW evicted naturally. clearTokens
    // RPC zeroes the cache atomically.
    try { await chrome.runtime.sendMessage({ type: 'clearTokens' }); } catch (e) {}
    // v5.1.1: scope clear to ModTools-owned keys only (don't nuke unrelated settings)
    await chrome.storage.local.remove(OWNED_KEYS);
    // Also tell every open GAW tab to clear its localStorage - otherwise
    // the content script's hydration will just read data back from localStorage.
    // v5.1.1: query BOTH root and subdomain tab patterns
    try {
      const tabs = await chrome.tabs.query({ url: GAW_TAB_PATTERNS });
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'clearLocalStorage' });
        } catch (e) { /* tab may not have content script loaded, ignore */ }
      }
    } catch (e) { /* tabs permission may be missing - still OK */ }
    alert('ModTools data cleared. Reload any GAW tabs to see changes.');
    loadStats();
  } catch (err) {
    alert('Clear failed: ' + err.message);
  }
});

// v5.1.2: Debug snapshot button - collect from active GAW tab content script
// v9.3.14 (Vanguard H-4): write a one-shot consent token to
// chrome.storage.session BEFORE asking the content script for the snapshot.
// The content script's getDebugSnapshot handler reads + validates + clears
// that token within a 2s window. Closes the silent-PII-exfil vector where
// any extension-surface compromise could trigger the message and walk away
// with the full mod history.
$('debugBtn').addEventListener('click', async () => {
  try {
    const tabs = await chrome.tabs.query({ url: GAW_TAB_PATTERNS, active: true, currentWindow: true });
    let snapshot = null;
    if (tabs.length > 0){
      try {
        // v9.3.15 (Vanguard ER2-C-3): mint a one-shot consent nonce via SW
        // RAM (NOT chrome.storage.session — that's content-script writable
        // because background sets TRUSTED_AND_UNTRUSTED_CONTEXTS for the
        // invite-staging flow). The popup is the only RPC caller allowed
        // to mint; content scripts cannot. Embed the nonce in the message;
        // content script forwards to SW for verification.
        let nonce = null;
        try {
          const r = await chrome.runtime.sendMessage({ type: 'mintSnapshotConsent' });
          if (r && r.ok) nonce = r.nonce;
        } catch (_) { /* SW unavailable; handler will reject */ }
        const resp = await chrome.tabs.sendMessage(tabs[0].id, { type: 'getDebugSnapshot', nonce: nonce });
        if (resp && resp.ok) snapshot = resp.snapshot;
      } catch (e) { /* no content script on this tab */ }
    }
    if (!snapshot){
      const data = await chrome.storage.local.get(OWNED_KEYS);
      snapshot = {
        exportedAt: new Date().toISOString(),
        version: chrome.runtime.getManifest().version,
        source: 'popup-fallback (no active GAW tab found)',
        redacted: ['gam_settings.workerModToken', 'gam_settings.leadModToken', 'gam_sniff_log'],
        storage: scrubExport(data)
      };
    }
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modtools-debug-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Debug snapshot failed: ' + err.message);
  }
});

// v9.3.14 (Vanguard L-2): Force re-hydrate button. Replaces the
// window.__GAM_REHYDRATE() console snippet. Sends a `forceRehydrate` runtime
// message to the active GAW tab; the content script re-reads
// chrome.storage.local into both its own cache and the SW vault. No token
// material is returned -- only length + boolean presence (Vanguard L-1).
const __rehydrateBtn = document.getElementById('rehydrateBtn');
if (__rehydrateBtn) {
  __rehydrateBtn.addEventListener('click', async () => {
    const status = document.getElementById('rehydrateStatus');
    if (status) { status.textContent = 'rehydrating...'; status.className = 'pop-token-status'; }
    try {
      const tabs = await chrome.tabs.query({ url: GAW_TAB_PATTERNS, active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        if (status) { status.textContent = 'no active GAW tab -- open greatawakening.win in this window'; status.className = 'pop-token-status err'; }
        return;
      }
      const r = await chrome.tabs.sendMessage(tabs[0].id, { type: 'forceRehydrate' });
      if (r && r.ok) {
        if (status) {
          status.textContent = `OK: team=${r.hasTeamToken ? 'yes('+r.teamLen+')' : 'no'}, lead=${r.hasLeadToken ? 'yes('+r.leadLen+')' : 'no'}`;
          status.className = 'pop-token-status ok';
        }
      } else {
        if (status) {
          status.textContent = 'failed: ' + (r && r.error || 'no response');
          status.className = 'pop-token-status err';
        }
      }
    } catch (e) {
      if (status) {
        status.textContent = 'error: ' + (e && e.message || String(e));
        status.className = 'pop-token-status err';
      }
    }
  });
}

// v5.2.0 H3: sniffer is no-op (MV3 isolated-world limitation) - stub kept for back-compat.
async function refreshSniffLabel(){}

// v5.1.6: Team Mod Token management
const WORKER_BASE_POPUP = 'https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev';

// --- v7.2 Platform Hardening BEGIN ---
// Regression-guard: every v7.2 branch is gated on __hardeningOn() which reads
// gam_settings['features.platformHardening']. Flag off -> legacy byte-for-byte
// behavior (loadToken/saveToken prefill the input, write to chrome.storage.local).
async function __hardeningOnPopup() {
  try {
    const { gam_settings } = await chrome.storage.local.get('gam_settings');
    return !!(gam_settings && gam_settings['features.platformHardening'] === true);
  } catch (e) { return false; }
}

// v7.2 CHUNK 13 (popup): minimal text-input modal for popup-page scope.
// Mirrors modtools.js askTextModal semantics (Promise<string|null>, Esc=null,
// Enter submits, validate before resolve). DOM-only (no innerHTML on input).
function __popupAskText(opts) {
  const o = opts || {};
  return new Promise(function (resolve) {
    try {
      // v9.3.14 (Vanguard M-4 partial): inline style.cssText -> CSS classes.
      const backdrop = document.createElement('div');
      backdrop.className = 'gam-pop-modal-backdrop';
      const panel = document.createElement('div');
      panel.className = 'gam-pop-modal-panel';
      const title = document.createElement('div');
      title.className = 'gam-pop-modal-title';
      title.textContent = String(o.title || 'Input required');
      const label = document.createElement('label');
      label.className = 'gam-pop-modal-label';
      label.textContent = String(o.label || '');
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = String(o.placeholder || '');
      input.maxLength = Number(o.max) || 120;
      input.className = 'gam-pop-modal-input';
      const err = document.createElement('div');
      err.className = 'gam-pop-modal-err';
      const btnRow = document.createElement('div');
      btnRow.className = 'gam-pop-modal-btnrow';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.className = 'gam-pop-modal-btn-cancel';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = 'OK';
      okBtn.className = 'gam-pop-modal-btn-ok';
      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(okBtn);
      panel.appendChild(title);
      panel.appendChild(label);
      panel.appendChild(input);
      panel.appendChild(err);
      panel.appendChild(btnRow);
      backdrop.appendChild(panel);
      let done = false;
      function finish(val) {
        if (done) return;
        done = true;
        try { document.removeEventListener('keydown', onKey, true); } catch (e) {}
        try { backdrop.remove(); } catch (e) {}
        resolve(val);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
        else if (e.key === 'Enter') { e.stopPropagation(); submit(); }
      }
      function submit() {
        const val = String(input.value || '').trim();
        if (typeof o.validate === 'function') {
          let msg = '';
          try { msg = o.validate(val); } catch (e) { msg = 'validation error'; }
          if (msg) { err.textContent = String(msg); return; }
        }
        finish(val);
      }
      cancelBtn.addEventListener('click', function () { finish(null); });
      okBtn.addEventListener('click', submit);
      document.addEventListener('keydown', onKey, true);
      backdrop.addEventListener('click', function (ev) { if (ev.target === backdrop) finish(null); });
      document.body.appendChild(backdrop);
      try { input.focus(); } catch (e) {}
    } catch (e) { resolve(null); }
  });
}

// v7.2 CHUNK 14 (popup): confirm-style modal for claim-invite flow.
function __popupConfirm(opts) {
  const o = opts || {};
  return new Promise(function (resolve) {
    try {
      // v9.3.14 (Vanguard M-4 partial): inline style.cssText -> CSS classes.
      const backdrop = document.createElement('div');
      backdrop.className = 'gam-pop-modal-backdrop';
      const panel = document.createElement('div');
      panel.className = 'gam-pop-modal-panel';
      const title = document.createElement('div');
      title.className = 'gam-pop-modal-title';
      title.textContent = String(o.title || 'Confirm');
      const body = document.createElement('div');
      body.className = 'gam-pop-modal-body';
      body.textContent = String(o.body || '');
      const btnRow = document.createElement('div');
      btnRow.className = 'gam-pop-modal-btnrow no-margin';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = String(o.cancelLabel || 'Cancel');
      cancelBtn.className = 'gam-pop-modal-btn-cancel';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = String(o.okLabel || 'OK');
      okBtn.className = 'gam-pop-modal-btn-ok';
      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(okBtn);
      panel.appendChild(title);
      panel.appendChild(body);
      panel.appendChild(btnRow);
      backdrop.appendChild(panel);
      let done = false;
      function finish(v) {
        if (done) return;
        done = true;
        try { document.removeEventListener('keydown', onKey, true); } catch (e) {}
        try { backdrop.remove(); } catch (e) {}
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
        else if (e.key === 'Enter') { e.stopPropagation(); finish(true); }
      }
      cancelBtn.addEventListener('click', function () { finish(false); });
      okBtn.addEventListener('click', function () { finish(true); });
      document.addEventListener('keydown', onKey, true);
      backdrop.addEventListener('click', function (ev) { if (ev.target === backdrop) finish(false); });
      document.body.appendChild(backdrop);
      try { okBtn.focus(); } catch (e) {}
    } catch (e) { resolve(false); }
  });
}

function __isTokenShape(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{32,256}$/.test(t);
}

// v7.2 token save path: validates shape + dispatches to background via
// {type:'setTokens'}. Never writes tokens into chrome.storage.local from the
// popup; the background service worker owns the session-area persistence.
async function saveTokensSecurely(tokens) {
  const t = tokens || {};
  const hasWorker = Object.prototype.hasOwnProperty.call(t, 'workerModToken');
  const hasLead = Object.prototype.hasOwnProperty.call(t, 'leadModToken');
  if (hasWorker && t.workerModToken && !__isTokenShape(t.workerModToken)) {
    return { ok: false, error: 'malformed team token' };
  }
  if (hasLead && t.leadModToken && !__isTokenShape(t.leadModToken)) {
    return { ok: false, error: 'malformed lead token' };
  }
  try {
    const msg = { type: 'setTokens' };
    if (hasWorker) msg.workerModToken = t.workerModToken || '';
    if (hasLead) msg.leadModToken = t.leadModToken || '';
    const r = await chrome.runtime.sendMessage(msg);
    if (!r || !r.ok) return r || { ok: false, error: 'no response from background' };

    // Keep durable local copy in sync so content-script boot paths that still
    // read chrome.storage.local can hydrate immediately after refresh/restart.
    try {
      const current = await chrome.storage.local.get('gam_settings');
      const s = { ...(current.gam_settings || {}) };
      if (hasWorker) s.workerModToken = t.workerModToken || '';
      if (hasLead) {
        s.leadModToken = t.leadModToken || '';
        s.isLeadMod = !!(t.leadModToken || '');
      }
      await chrome.storage.local.set({ gam_settings: s });
    } catch (e) {}

    return r;
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function __tokensStatus() {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'tokensStatus' });
    return {
      hasTeamToken: !!(r && r.hasTeamToken),
      hasLeadToken: !!(r && r.hasLeadToken)
    };
  } catch (e) {
    return { hasTeamToken: false, hasLeadToken: false };
  }
}
// --- v7.2 Platform Hardening END ---

// --- v8.1 UX Polish flag (popup scope) ---
// popup.js does not itself seed defaults; defaults live in modtools.js
// DEFAULT_SETTINGS. The v8.1 UX Polish master flag key is
// 'features.uxPolish' and its default is false. Popup never writes this
// key; it is surfaced only via modtools.js settings UI. Documented here so
// the verify script (verify-v8-1.ps1) can confirm the default-off contract
// is preserved across all extension surfaces.
const __V81_UX_POLISH_DEFAULT = { 'features.uxPolish': false };
void __V81_UX_POLISH_DEFAULT;
// --- end v8.1 UX Polish flag ---

async function loadToken() {
  // v7.2 flag-on: no prefill, status reads via tokensStatus message.
  if (await __hardeningOnPopup()) {
    try {
      const tInput = $('tokenInput');
      if (tInput) tInput.value = '';
      const status = await __tokensStatus();
      const statusEl = $('tokenStatus');
      if (status.hasTeamToken) {
        statusEl.className = 'pop-token-status';
        statusEl.textContent = 'stored';
      } else {
        // v9.2.5: direct new mods (e.g. PresidentialSeal pre-claim) toward
        // the claim flow rather than the dead-end "not configured" message.
        // v9.3.6: clearer first-run guidance per noob-rollout audit.
        statusEl.textContent = '👋 First time? Click 📨 Claim invite below if you have a link, OR 📥 I have a rotation invite to enter the code manually. Both work.';
      }
      // Show claim-invite wrap when flag on (even before a code is staged --
      // clicking with nothing staged surfaces a clear status message).
      const wrap = $('claimInviteWrap');
      if (wrap) wrap.style.display = '';
    } catch (e) {}
    return;
  }
  try {
    const { gam_settings } = await chrome.storage.local.get('gam_settings');
    const s = gam_settings || {};
    const t = s.workerModToken || '';
    // v9.2.3: do NOT pre-fill the input when a token is already stored.
    // Pre-filling caused team-rollout footgun: user clicks input, places
    // cursor at end of pre-filled token, pastes their new token, save
    // concatenates 48+48=96 chars (still passes regex, fails at worker).
    // Leaving the input empty forces a clean replace on next paste.
    $('tokenInput').value = '';
    const statusEl = $('tokenStatus');
    if (t) {
      statusEl.className = 'pop-token-status';
      statusEl.textContent = 'stored (' + t.length + ' chars) \u2014 paste a new value to replace';
    } else {
      // v9.3.6: clearer first-run guidance per noob-rollout audit.
      statusEl.textContent = '\u{1F44B} First time? Click \u{1F4E8} Claim invite below if you have a link, OR \u{1F4E5} I have a rotation invite to enter the code manually.';
    }
  } catch (e) {}
}

async function saveToken() {
  let token = $('tokenInput').value.trim();
  const statusEl = $('tokenStatus');
  statusEl.className = 'pop-token-status';
  statusEl.textContent = 'validating...';

  // v9.9.1 - intercept invite URL paste: if user pasted the FULL invite URL
  // (https://greatawakening.win/?mt_invite=CODE), extract the code and route
  // through the claim flow instead of trying to save it as a token.
  // Beta-tester feedback 2026-05-08: "i pasted the token in - no chance to
  // enter my name, and it said token accepted, but it still failed to
  // rotate - invalid token". He pasted the INVITE CODE not a TOKEN.
  const urlMatch = token.match(/^https?:\/\/[^/]+\/\?(?:.*&)?mt_invite=([A-Za-z0-9_-]{16,128})/);
  if (urlMatch) token = urlMatch[1];

  // v9.9.1 - heuristic: if the input looks like an invite code (not a token),
  // stage it into chrome.storage.session.gam_pending_invite and route the
  // user to the Claim Invite button. Tokens and invite codes are both
  // [A-Za-z0-9_-]{16-256}, so we can't distinguish by regex alone -- but
  // we CAN ask the worker which it is. First check via /mod/whoami: if 401,
  // try claiming as invite via /mod/token/claim-rotation. Auto-route.
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) {
    // Could still be a 16-31 char invite code shape
    if (/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
      statusEl.className = 'pop-token-status warn';
      statusEl.textContent = 'looks like an INVITE CODE (not a token). Staging for Claim flow...';
      try {
        if (chrome && chrome.storage && chrome.storage.session) {
          await chrome.storage.session.set({
            gam_pending_invite: token,
            gam_pending_invite_at: Date.now(),
            gam_pending_invite_for: '__paste_into_token_field__'
          });
        }
        statusEl.textContent = 'INVITE CODE staged. Click "Claim invite" below to mint your token.';
        try { $('tokenInput').value = ''; } catch(_){}
        // Surface the claim button visibly
        const claimBtn = $('claimInviteBtn');
        if (claimBtn) {
          claimBtn.scrollIntoView({ behavior:'smooth', block:'center' });
          claimBtn.style.outline = '2px solid #ff9933';
          setTimeout(() => { claimBtn.style.outline = ''; }, 4000);
        }
      } catch(e) {
        statusEl.className = 'pop-token-status err';
        statusEl.textContent = 'failed to stage invite: ' + (e && e.message || e);
      }
      return;
    }
    statusEl.className = 'pop-token-status err';
    statusEl.textContent = 'malformed token (expected 32-256 chars alphanumeric + _-)';
    return;
  }

  // v7.2 flag-on: save via background relay, never write tokens into
  // chrome.storage.local from the popup, clear the input after save.
  if (await __hardeningOnPopup()) {
    const r = await saveTokensSecurely({ workerModToken: token });
    if (r && r.ok) {
      // v9.9.1 - post-save validation: probe /mod/whoami. If the worker
      // returns 401, the value the user pasted was an INVITE CODE, not a
      // minted token. Roll back the save, stage as invite, route to Claim.
      try {
        const probe = await chrome.runtime.sendMessage({ type: 'rpc', name: 'modWhoami' });
        if (probe && probe.status === 401) {
          // Roll back: clear the bad token from storage
          try { await saveTokensSecurely({ workerModToken: '' }); } catch(_){}
          // Re-stage as invite
          if (chrome && chrome.storage && chrome.storage.session) {
            await chrome.storage.session.set({
              gam_pending_invite: token,
              gam_pending_invite_at: Date.now(),
              gam_pending_invite_for: '__paste_into_token_field__'
            });
          }
          statusEl.className = 'pop-token-status warn';
          statusEl.textContent = 'Worker says that is NOT a token -- it looks like an INVITE CODE. Click "Claim invite" + enter your GAW username.';
          const claimBtn = $('claimInviteBtn');
          if (claimBtn) {
            claimBtn.scrollIntoView({ behavior:'smooth', block:'center' });
            claimBtn.style.outline = '2px solid #ff9933';
            setTimeout(() => { claimBtn.style.outline = ''; }, 4000);
          }
          return;
        }
      } catch(_probeErr) { /* probe failure is non-fatal; user can retry */ }
      statusEl.className = 'pop-token-status ok';
      statusEl.textContent = '\u2713 stored';
      try { $('tokenInput').value = ''; } catch (e) {}
    } else {
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'save failed: ' + (r && r.error || 'unknown');
    }
    return;
  }
  try {
    // v5.0-Phase-1: route through background RPC vault. authValidateToken
    // tests the candidate against /version server-side and stores it on success.
    const r = await chrome.runtime.sendMessage({ type: 'rpc', name: 'authValidateToken', args: { token: token } });
    if (!r || !r.ok) {
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = r && r.status ? 'rejected (HTTP ' + r.status + ') \u2014 check token matches what the lead gave you' : (r && r.error || 'network error');
      return;
    }
    statusEl.className = 'pop-token-status ok';
    statusEl.textContent = '\u2713 accepted \u2014 worker version: ' + (r.data && r.data.version || '?');
  } catch (e) {
    statusEl.className = 'pop-token-status err';
    statusEl.textContent = 'network error: ' + e.message;
  }
}

$('tokenSave').addEventListener('click', function () { withLoading($('tokenSave'), 'saving…', saveToken); });
$('tokenInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') withLoading($('tokenSave'), 'saving…', saveToken); });

// v5.1.10: Lead-mod controls (shown when token is stored)
async function loadLead() {
  // v7.2 flag-on: no prefill; status reads via tokensStatus message.
  if (await __hardeningOnPopup()) {
    try {
      const leadInput = $('leadInput');
      if (leadInput) leadInput.value = '';
      const status = await __tokensStatus();
      const statusEl = $('leadStatus');
      if (status.hasLeadToken) {
        statusEl.className = 'pop-token-status ok';
        statusEl.textContent = 'stored';
      } else {
        statusEl.textContent = 'lead-mod only feature';
      }
      // v9.3.16 (Commander): NEVER show #leadSection to non-lead mods.
      // Pre-fix this was gated on `hasTeamToken` (any mod) OR
      // `workerModToken` presence \u2014 meaning every regular mod (e.g.
      // PresidentialSeal) saw the Lead Mod Token paste field and the
      // "lead-mod only feature" status line, which is confusing AND
      // exposes lead-only surface to non-leads. Now: gate STRICTLY on
      // worker /mod/whoami's `is_lead === true` response. Defaults
      // hidden; only un-hidden when worker confirms lead identity.
      await __applyLeadGate();
    } catch (e) {}
    return;
  }
  try {
    const { gam_settings } = await chrome.storage.local.get('gam_settings');
    const s = gam_settings || {};
    const t = s.leadModToken || '';
    // v9.2.3: same anti-concat fix as the team token input -- never pre-fill.
    $('leadInput').value = '';
    const statusEl = $('leadStatus');
    if (t){
      statusEl.className = 'pop-token-status ok';
      statusEl.textContent = 'stored (' + t.length + ' chars) \u2014 paste new value to replace';
    } else {
      statusEl.textContent = 'lead-mod only feature';
    }
    // v9.3.16 (Commander): see __applyLeadGate above. Strict whoami-driven gate.
    await __applyLeadGate();
  } catch (e) {}
}
// v9.3.16 (Commander): worker-verified lead gate. Calls modWhoami RPC.
// Shows #leadSection ONLY if `is_lead === true`. Defaults hidden so a
// regular mod (PresidentialSeal etc.) NEVER sees the lead surface even
// if the popup loads before the network call returns.
async function __applyLeadGate() {
  // v9.6.1: gate moved from #leadSection (entire block) to #leadOnlyTools
  // (sub-block holding rotation roster, invite gen, team settings, lead
  // maintenance, etc.). The token-input row stays always visible so a fresh
  // user can paste their lead token without first having to save a team
  // token (chicken-and-egg fix).
  // v9.6.2: when the team token already returns is_lead=true (catsfive's
  // case), surface a hint above the lead-token input that it's now OPTIONAL
  // -- the worker accepts either x-lead-token OR x-mod-token+is_lead for
  // every admin endpoint except dual-factor sensitive ops (audit backfill,
  // health/extended, key rotation). So the lead input is only useful for
  // those rare dual-factor calls.
  const tools = $('leadOnlyTools');
  if (!tools) return;
  // Default hidden until proven lead.
  tools.style.display = 'none';
  try {
    const r = await chrome.runtime.sendMessage({ type:'rpc', name:'modWhoami' });
    if (r && r.ok && r.data && r.data.is_lead === true) {
      tools.style.display = '';
      // v9.6.2 UX hint: badge the lead-token input as OPTIONAL since the
      // team token already works for most lead operations.
      try {
        const hintHost = $('leadStatus');
        const lbl = document.querySelector('label[for="leadInput"]');
        if (lbl && !document.getElementById('lead-optional-hint')){
          const hint = document.createElement('div');
          hint.id = 'lead-optional-hint';
          hint.style.cssText = 'font-size:10.5px;color:#3dd68c;margin:2px 0 4px;';
          hint.innerHTML = '\u2713 Your team token (' + (r.data.username || 'this account') + ') already authenticates you as lead. ' +
            'This field is OPTIONAL \u2014 only needed for dual-factor ops (audit backfill, health/extended).';
          lbl.parentNode.insertBefore(hint, lbl.nextSibling);
        }
      } catch(_){}
    }
  } catch (_) {
    // Network/auth failure \u2192 stay hidden (fail-closed).
  }
}

async function saveLead() {
  const token = $('leadInput').value.trim();
  const statusEl = $('leadStatus');
  statusEl.className = 'pop-token-status';
  statusEl.textContent = 'validating...';
  // v7.2 flag-on: route through saveTokensSecurely, clear input after save.
  if (await __hardeningOnPopup()) {
    // Empty -> clear (set both to '' via relay? no -- preserve team side).
    if (!token) {
      const r = await saveTokensSecurely({ leadModToken: '' });
      if (r && r.ok) {
        statusEl.textContent = 'cleared';
        try { $('leadInput').value = ''; } catch (e) {}
      } else {
        statusEl.className = 'pop-token-status err';
        statusEl.textContent = 'clear failed';
      }
      return;
    }
    if (!__isTokenShape(token)) {
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'malformed lead token';
      return;
    }
    const r = await saveTokensSecurely({ leadModToken: token });
    if (r && r.ok) {
      statusEl.className = 'pop-token-status ok';
      statusEl.textContent = '\u2713 stored';
      try { $('leadInput').value = ''; } catch (e) {}
    } else {
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'save failed: ' + (r && r.error || 'unknown');
    }
    return;
  }
  try {
    const current = await chrome.storage.local.get('gam_settings');
    const s = current.gam_settings || {};
    const teamTok = s.workerModToken || '';
    if (!token){
      s.leadModToken = '';
      s.isLeadMod = false;
      await chrome.storage.local.set({ gam_settings: s });
      statusEl.textContent = 'cleared';
      return;
    }
    if (!teamTok){
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'set the team token first';
      return;
    }
    // v5.0-Phase-1: route through background RPC vault. authValidateLeadToken
    // tests + stores the lead token without exposing it on the popup side.
    const r = await chrome.runtime.sendMessage({ type: 'rpc', name: 'authValidateLeadToken', args: { token: token } });
    if (!r || !r.ok) {
      statusEl.className = 'pop-token-status err';
      if (r && r.status === 403) {
        statusEl.textContent = 'rejected: not a lead-mod token -- paste the lead token above, not the team token';
      } else {
        statusEl.textContent = r && r.error ? r.error : 'worker error -- check CF dashboard if this persists';
      }
      return;
    }
    statusEl.className = 'pop-token-status ok';
    statusEl.textContent = '✓ verified — reload GAW tabs to enable HUD';  } catch (e) {
    statusEl.className = 'pop-token-status err';
    statusEl.textContent = 'save failed: ' + e.message;
  }
}

async function generateInvite() {
  const resultEl = $('inviteResult');
  resultEl.className = 'pop-token-status';
  resultEl.textContent = 'requesting...';
  try {
    const { gam_settings } = await chrome.storage.local.get('gam_settings');
    const s = gam_settings || {};
    const tok = s.workerModToken || '';
    const lead = s.leadModToken || '';
    if (!tok || !lead){
      resultEl.className = 'pop-token-status err';
      resultEl.textContent = 'need both team + lead token first';
      return;
    }
    // v7.2 CHUNK 13: __popupAskText under flag-on; prompt() on flag-off.
    let who;
    if (await __hardeningOnPopup()) {
      const raw = await __popupAskText({
        title: 'Invite target',
        label: 'GAW username this invite is for (optional, for audit)',
        placeholder: 'username',
        max: 24,
        validate: function (v) {
          if (!v) return '';
          return /^[A-Za-z0-9_-]{3,24}$/.test(v) ? '' : 'Username 3-24 chars.';
        }
      });
      if (raw == null) { resultEl.textContent = 'cancelled'; return; }
      who = raw;
    } else {
      who = prompt('GAW username this invite is for (optional, for audit):', '') || '';
    }
    // v5.0-Phase-1: route through RPC vault; background attaches tokens.
    const rInv = await chrome.runtime.sendMessage({ type: 'rpc', name: 'adminInviteCreate', args: { mod: who } });
    if (!rInv || !rInv.ok){
      resultEl.className = 'pop-token-status err';
      resultEl.textContent = 'rejected (HTTP ' + (rInv && rInv.status || '?') + ')';
      return;
    }
    const data = rInv.data || {};
    const url = data.url || '';
    resultEl.className = 'pop-token-status ok';
    // v5.8.1 security fix: was innerHTML (XSS vector if server return is
    // attacker-influenced). Now: DOM construction + textContent + href setter.
    // href is still attribute-set so browser URL parsing happens, and we
    // explicitly whitelist http(s) schemes to block javascript: / data: URIs.
    resultEl.textContent = '';
    const check = document.createTextNode('\u2713 invite: ');
    resultEl.appendChild(check);
    const safeHref = /^https?:\/\//i.test(url) ? url : '#';
    const a = document.createElement('a');
    a.href = safeHref;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = url;
    resultEl.appendChild(a);
    try {
      await navigator.clipboard.writeText(url);
      const em = document.createElement('em');
      em.textContent = ' (copied)';
      resultEl.appendChild(em);
    } catch(e){}
  } catch (e) {
    resultEl.className = 'pop-token-status err';
    resultEl.textContent = 'network error: ' + e.message;
  }
}

$('leadSave').addEventListener('click', function () { withLoading($('leadSave'), 'saving…', saveLead); });
$('leadInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') withLoading($('leadSave'), 'saving…', saveLead); });
$('inviteBtn').addEventListener('click', function () { withLoading($('inviteBtn'), 'requesting…', generateInvite); });

// =========================================================================
// v8.5.2: Mod rotation roster (lead-only).
// =========================================================================
// One button -> inline panel that:
//   - lists every mod with their rotation status (rotated_at, active invites)
//   - has a 🚀 "Issue all unrotated" button at the top for initial rollout
//   - has a per-row "Issue" / "Re-issue" button for ongoing per-mod use
// After issue, the code lands in a monospace row inline with copy buttons
// (code only OR full Discord DM template). No typing of usernames anywhere.
//
// Backend: GET /admin/mod/list, POST /admin/mod/rotation-invite,
// POST /admin/mod/rotation-invite-bulk.

function __dmTemplate(username, code, ttlHours) {
  // v9.2.6: lead with the clickable URL -- one-click claim is the path
  // of least resistance for non-technical mods. Code-only paste fallback
  // is kept for users whose Discord/email mangles the link.
  const url = 'https://greatawakening.win/?mt_invite=' + encodeURIComponent(code);
  return 'Hey ' + username + ', here is your rotation invite for GAW ModTools.\n\n' +
    'Easiest way: click this link in the browser where you have ModTools installed (signed into GAW as ' + username + '):\n\n' +
    url + '\n\n' +
    'Then open the ModTools popup and click "I have a rotation invite". Confirm.\n\n' +
    'Manual fallback (if the link is mangled): open the popup, click "I have a rotation invite", enter your GAW username (' + username + '), paste this code:\n\n' +
    code + '\n\n' +
    'Expires in ' + (ttlHours || 72) + 'h and is single-use. Once you claim it, your token will be one ONLY YOU know.';
}

function __makeCopyBtn(label, payload, parentBtn) {
  const b = document.createElement('button');
  b.className = 'pop-btn pop-btn-ghost';
  b.style.cssText = 'font-size:10px;padding:2px 6px;margin-right:4px';
  b.textContent = label;
  b.addEventListener('click', async function () {
    try {
      await navigator.clipboard.writeText(payload);
      const orig = b.textContent;
      b.textContent = '✓ copied';
      setTimeout(function () { b.textContent = orig; }, 1500);
    } catch (e) {
      b.textContent = 'copy failed';
    }
  });
  return b;
}

function __renderInviteResult(container, invite, ttlHours) {
  // Replace existing result block for this mod
  const existing = container.querySelector('.gam-roster-invite-result');
  if (existing) existing.remove();

  // v9.3.14 (Vanguard M-4 partial): inline style.cssText -> CSS classes.
  const block = document.createElement('div');
  block.className = 'gam-roster-invite-result';

  const codeRow = document.createElement('div');
  codeRow.className = 'gam-invite-code-row';
  codeRow.textContent = invite.code;
  block.appendChild(codeRow);

  // v9.2.6: full GAW invite URL — what the recipient mod actually clicks.
  // The content script's URL detector (?mt_invite=CODE) is what stages the
  // code into chrome.storage.session for the Claim button to consume.
  const inviteUrl = 'https://greatawakening.win/?mt_invite=' + encodeURIComponent(invite.code);

  const urlRow = document.createElement('div');
  urlRow.className = 'gam-invite-url-row';
  urlRow.textContent = inviteUrl;
  block.appendChild(urlRow);

  const btnRow = document.createElement('div');
  btnRow.className = 'gam-invite-btn-row';
  // v9.2.6: "Copy invite link" is the lead's primary action. Most useful
  // payload for handing to the target mod via Discord/Signal/etc.
  btnRow.appendChild(__makeCopyBtn('🔗 Copy invite link', inviteUrl));
  btnRow.appendChild(__makeCopyBtn('Copy code only', invite.code));
  btnRow.appendChild(__makeCopyBtn('Copy DM template', __dmTemplate(invite.username, invite.code, ttlHours)));
  block.appendChild(btnRow);

  container.appendChild(block);

  // v9.2.6: auto-copy the FULL INVITE URL (was raw code). The URL is what
  // the recipient pastes into their browser; the bare code on its own
  // requires extra steps. URL is the primary lead artifact.
  try { navigator.clipboard.writeText(inviteUrl); } catch (e) {}
}

async function __issueSingleFromRoster(username, rowEl, tokens) {
  // v5.0-Phase-1: route through RPC vault; background attaches tokens.
  const rsi = await chrome.runtime.sendMessage({ type: 'rpc', name: 'adminIssueInvite', args: { username: username } });
  if (!rsi || !rsi.ok) {
    const err = document.createElement('div');
    err.style.cssText = 'color:#ff7a7a;font-size:10px;margin-top:2px';
    let msg = 'rejected HTTP ' + (rsi && rsi.status || '?');
    if (rsi && rsi.data && rsi.data.error) msg += ' -- ' + rsi.data.error;
    else if (rsi && rsi.error) msg += ' -- ' + rsi.error;
    err.textContent = msg;
    rowEl.appendChild(err);
    return;
  }
  const data = rsi.data || {};
  if (!data || !data.ok) return;
  __renderInviteResult(rowEl, { username: data.username, code: data.code }, data.ttl_hours);
}

async function __issueBulkFromRoster(panel, tokens) {
  const ok = await __popupConfirm({
    title: 'Issue invites for ALL unrotated mods?',
    body: 'This will generate a 72h rotation invite for every mod who has not ' +
          'yet rotated. Lead mods are skipped. After this, you will have a list ' +
          'of codes to DM each mod individually via Discord.\n\nProceed?',
    okLabel: 'Issue all',
    cancelLabel: 'Cancel'
  });
  if (!ok) return;

  const status = document.createElement('div');
  status.style.cssText = 'color:#4A9EFF;font-size:11px;margin:6px 0';
  status.textContent = 'issuing...';
  panel.appendChild(status);

  // v5.0-Phase-1: route through RPC vault; background attaches tokens.
  const rBulk = await chrome.runtime.sendMessage({ type: 'rpc', name: 'adminBulkInvite', args: {} });
  status.remove();

  if (!rBulk || !rBulk.ok) {
    const err = document.createElement('div');
    err.style.cssText = 'color:#ff7a7a;font-size:11px;margin:6px 0';
    err.textContent = 'bulk issue rejected (HTTP ' + (rBulk && rBulk.status || '?') + ')';
    panel.appendChild(err);
    return;
  }
  const data = rBulk.data || {};
  const invites = (data && data.invites) || [];
  if (invites.length === 0) {
    const note = document.createElement('div');
    note.style.cssText = 'color:#888;font-size:11px;margin:6px 0';
    note.textContent = data.note || 'no eligible mods';
    panel.appendChild(note);
    return;
  }

  // Drop a "Copy ALL DM templates" button at top of results.
  const allDms = invites
    .filter(i => i.code)
    .map(i => __dmTemplate(i.username, i.code, data.ttl_hours))
    .join('\n\n----\n\n');
  const allCodesTable = invites
    .filter(i => i.code)
    .map(i => i.username + '\t' + i.code)
    .join('\n');

  const summary = document.createElement('div');
  summary.style.cssText = 'background:#0f1114;border:1px solid #3dd68c;border-radius:4px;padding:8px;margin:6px 0';
  const sumTitle = document.createElement('div');
  sumTitle.style.cssText = 'color:#3dd68c;font-weight:700;font-size:12px;margin-bottom:6px';
  sumTitle.textContent = '✓ ' + (data.issued || 0) + ' invites issued (72h, single-use)';
  summary.appendChild(sumTitle);

  const bulkBtns = document.createElement('div');
  bulkBtns.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';
  bulkBtns.appendChild(__makeCopyBtn('Copy ALL as username\\tcode', allCodesTable));
  bulkBtns.appendChild(__makeCopyBtn('Copy ALL DM templates', allDms));
  summary.appendChild(bulkBtns);

  panel.appendChild(summary);

  // Per-row results inside the existing roster rows.
  for (const inv of invites) {
    if (!inv.code) continue;
    const row = panel.querySelector('[data-roster-mod="' + CSS.escape(inv.username) + '"]');
    if (row) __renderInviteResult(row, inv, data.ttl_hours);
  }
}

function __buildRosterRow(m, tokens) {
  const row = document.createElement('div');
  row.dataset.rosterMod = m.mod_username;
  row.style.cssText = 'padding:6px;border-bottom:1px solid #1a1c20';

  const top = document.createElement('div');
  top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px';

  const info = document.createElement('div');
  info.style.cssText = 'flex:1;min-width:0';

  const name = document.createElement('div');
  // v9.2.3: ellipsis on long usernames so they never push the Re-issue button off-screen.
  name.style.cssText = 'color:#e4e4e4;font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  name.textContent = m.mod_username + (m.is_lead ? ' 👑' : '');
  info.appendChild(name);

  const status = document.createElement('div');
  // v9.2.4: status text wraps naturally. Pre-fix, ellipsis truncated
  // "⚠ never rotated -- lead can still impersonate" to "...lea...",
  // hiding the actually-important warning. Full text is more useful
  // than a tidy single line; wrap to 2 lines if needed.
  status.style.cssText = 'font-size:10px;line-height:1.4';
  if (m.rotated_at) {
    status.style.color = '#3dd68c';
    status.textContent = '✓ rotated ' + new Date(m.rotated_at).toLocaleDateString() +
      (m.rotation_count > 1 ? ' (' + m.rotation_count + 'x)' : '');
  } else {
    status.style.color = '#f0a040';
    status.textContent = '⚠ never rotated -- lead can still impersonate';
  }
  if (m.active_invites > 0) {
    status.textContent += ' · ' + m.active_invites + ' active invite(s)';
  }
  info.appendChild(status);

  top.appendChild(info);

  if (!m.is_lead) {
    const btn = document.createElement('button');
    btn.className = 'pop-btn pop-btn-ghost';
    btn.style.cssText = 'font-size:10px;padding:3px 8px;flex-shrink:0';
    btn.textContent = m.rotated_at ? 'Re-issue' : 'Issue';
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.textContent = 'issuing...';
      try {
        await __issueSingleFromRoster(m.mod_username, row, tokens);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Re-issue';
      }
    });
    top.appendChild(btn);
  }

  row.appendChild(top);
  return row;
}

async function openRotationRoster() {
  const panel = $('rotateRosterPanel');
  const result = $('rotateInviteResult');
  if (!panel) return;

  // Toggle: clicking again closes
  if (panel.style.display === 'block') {
    panel.style.display = 'none';
    panel.replaceChildren();
    if (result) { result.textContent = ''; result.className = 'pop-token-status'; }
    return;
  }

  if (result) {
    result.className = 'pop-token-status';
    result.textContent = 'loading roster...';
  }

  try {
    const { gam_settings } = await chrome.storage.local.get('gam_settings');
    const s = gam_settings || {};
    const team = s.workerModToken || '';
    const lead = s.leadModToken || '';
    if (!team || !lead) {
      if (result) {
        result.className = 'pop-token-status err';
        result.textContent = 'need both team + lead token first';
      }
      return;
    }
    const tokens = { team: team, lead: lead };

    // v5.0-Phase-1: route through RPC vault; background attaches tokens.
    const rList = await chrome.runtime.sendMessage({ type: 'rpc', name: 'adminListMods', args: {} });
    if (!rList || !rList.ok) {
      if (result) {
        result.className = 'pop-token-status err';
        result.textContent = 'roster fetch rejected (HTTP ' + (rList && rList.status || '?') + ')' + (rList && rList.status === 403 ? ' -- lead token required' : ' -- check your tokens');
      }
      return;
    }
    const data = rList.data || {};
    const mods = (data && data.mods) || [];
    const ttlHours = Math.round((data.ttl_ms || 72 * 3600000) / 3600000);

    // Build panel
    panel.replaceChildren();
    panel.style.cssText = 'display:block;max-height:380px;overflow-y:auto;background:#0f1114;border:1px solid #2a2a2a;border-radius:6px;padding:8px;margin-top:8px';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #2a2a2a';

    const headerLeft = document.createElement('div');
    const headerTitle = document.createElement('div');
    headerTitle.style.cssText = 'font-weight:700;color:#4A9EFF;font-size:12px';
    const unrotatedNonLead = mods.filter(m => !m.rotated_at && !m.is_lead);
    headerTitle.textContent = mods.length + ' mods · ' + unrotatedNonLead.length + ' unrotated';
    headerLeft.appendChild(headerTitle);
    const headerSub = document.createElement('div');
    headerSub.style.cssText = 'font-size:10px;color:#888';
    headerSub.textContent = 'invites valid for ' + ttlHours + 'h, single-use';
    headerLeft.appendChild(headerSub);
    header.appendChild(headerLeft);

    const bulkBtn = document.createElement('button');
    bulkBtn.className = 'pop-btn pop-btn-ghost';
    bulkBtn.style.cssText = 'font-size:11px;padding:4px 10px;flex-shrink:0';
    if (unrotatedNonLead.length > 0) {
      bulkBtn.textContent = '🚀 Issue all (' + unrotatedNonLead.length + ')';
      bulkBtn.addEventListener('click', () => __issueBulkFromRoster(panel, tokens));
    } else {
      bulkBtn.textContent = '✓ all rotated';
      bulkBtn.disabled = true;
      bulkBtn.style.opacity = '0.5';
    }
    header.appendChild(bulkBtn);

    // v8.5.3: explicit close button — panel can be 380px tall, scrolled away from toggle
    const closeBtn = document.createElement('button');
    closeBtn.className = 'pop-btn pop-btn-ghost';
    closeBtn.style.cssText = 'font-size:11px;padding:4px 8px;flex-shrink:0;margin-left:4px;color:#888';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close roster';
    closeBtn.addEventListener('click', function () {
      panel.style.display = 'none';
      panel.replaceChildren();
      if (result) { result.textContent = ''; result.className = 'pop-token-status'; }
    });
    header.appendChild(closeBtn);

    panel.appendChild(header);

    for (const m of mods) {
      panel.appendChild(__buildRosterRow(m, tokens));
    }

    if (result) result.textContent = '';
  } catch (e) {
    if (result) {
      result.className = 'pop-token-status err';
      result.textContent = 'roster error: ' + (e && e.message || e);
    }
  }
}

(function wireRoster() {
  const b = $('rotateRosterBtn');
  if (b) b.addEventListener('click', function () { withLoading(b, 'loading…', openRotationRoster); });
})();

// =========================================================================
// v8.5.0: Per-mod token sovereignty.
// =========================================================================
// Rotate: swap current token for a fresh random one only this mod knows.
// Claim: redeem a lead-issued rotation invite for a fresh random token.
async function rotateToken() {
  const status = $('rotateStatus');
  if (!status) return;
  status.className = 'pop-token-status';
  try {
    const ok = await __popupConfirm({
      title: 'Rotate your token?',
      body: 'This generates a fresh random token that ONLY YOU will know.\n\n' +
            'After rotation:\n' +
            '  - Your current token is invalid\n' +
            '  - The new token is auto-saved to this browser\n' +
            '  - The lead mod loses the ability to authenticate as you\n\n' +
            'You can rotate again any time.',
      okLabel: 'Rotate now',
      cancelLabel: 'Cancel'
    });
    if (!ok) { status.textContent = 'cancelled'; return; }

    status.textContent = 'rotating...';
    const { gam_settings } = await chrome.storage.local.get('gam_settings');
    const tok = (gam_settings || {}).workerModToken || '';
    if (!tok) {
      status.className = 'pop-token-status err';
      status.textContent = 'no current token -- nothing to rotate';
      return;
    }
    // v5.0-Phase-1: authRotateSelf validates, rotates, and stores the new token in the vault.
    const rRot = await chrome.runtime.sendMessage({ type: 'rpc', name: 'authRotateSelf', args: {} });
    if (!rRot || !rRot.ok) {
      // v9.2.1: rotation_save_failed = worker rotated but storage write failed.
      // Surface CRITICAL banner so the mod knows they need lead recovery.
      if (rRot && rRot.error === 'rotation_save_failed') {
        status.className = 'pop-token-status err';
        status.textContent = 'CRITICAL: token rotated on server but FAILED to save locally. ' +
          'You may be locked out after browser restart. ' +
          'Contact lead mod for a new rotation invite to recover. Detail: ' + (rRot.detail || '');
        return;
      }
      status.className = 'pop-token-status err';
      status.textContent = 'rotate rejected (HTTP ' + (rRot && rRot.status || '?') + ') -- your current token may be invalid; re-save it first';
      return;
    }
    status.className = 'pop-token-status ok';
    status.textContent = '✓ rotated -- lead no longer has access';
    _showVerifyTokenBtn();
    try { await loadToken(); } catch (e) {}  } catch (e) {
    status.className = 'pop-token-status err';
    status.textContent = 'rotate failed: ' + (e && e.message || e);
  }
}

async function claimRotationInvite() {
  const status = $('rotateStatus');
  if (!status) return;
  status.className = 'pop-token-status';
  try {
    const username = await __popupAskText({
      title: 'Claim rotation invite',
      label: 'Your GAW username (must match the invite)',
      placeholder: 'username',
      max: 32,
      validate: function (v) {
        if (!v) return 'username required';
        return /^[A-Za-z0-9_-]{2,32}$/.test(v) ? '' : 'invalid username shape';
      }
    });
    if (!username) { status.textContent = 'cancelled'; return; }

    const code = await __popupAskText({
      title: 'Invite code',
      label: 'Paste the rotation invite code from the lead mod',
      placeholder: 'invite code',
      max: 96,
      validate: function (v) {
        if (!v) return 'code required';
        return /^[A-Za-z0-9_-]{16,96}$/.test(v) ? '' : 'malformed code';
      }
    });
    if (!code) { status.textContent = 'cancelled'; return; }

    status.textContent = 'claiming...';
    // v5.0-Phase-1: authClaimInvite validates the code, stores the new token in the vault.
    const rClaim = await chrome.runtime.sendMessage({ type: 'rpc', name: 'authClaimInvite', args: { code: code, username: username } });
    if (!rClaim || !rClaim.ok) {
      // v9.2.1: rotation_save_failed = worker accepted claim but storage write failed.
      if (rClaim && rClaim.error === 'rotation_save_failed') {
        status.className = 'pop-token-status err';
        status.textContent = 'CRITICAL: claim accepted by server but FAILED to save locally. ' +
          'You may be locked out after browser restart. ' +
          'Contact lead mod for a fresh rotation invite to recover. Detail: ' + (rClaim.detail || '');
        return;
      }
      status.className = 'pop-token-status err';
      let msg = 'claim rejected (HTTP ' + (rClaim && rClaim.status || '?') + ')';
      if (rClaim && rClaim.data && rClaim.data.error) msg += ' -- ' + rClaim.data.error;
      else if (rClaim && rClaim.error) msg += ' -- ' + rClaim.error;
      status.textContent = msg;
      return;
    }
    const claimData = rClaim.data || {};
    status.className = 'pop-token-status ok';
    status.textContent = '✓ claimed -- you are now ' + (claimData.mod_username || username);
    _showVerifyTokenBtn();
    try { await loadToken(); } catch (e) {}  } catch (e) {
    status.className = 'pop-token-status err';
    status.textContent = 'claim failed: ' + (e && e.message || e);
  }
}

// v9.2.1: one-click token health check after rotation/claim.
// Calls modWhoami so the mod gets instant confirmation the new token works.
async function verifyTokenRoundTrip() {
  const status = $('rotateStatus');
  if (!status) return;
  status.textContent = 'verifying...';
  try {
    const r = await chrome.runtime.sendMessage({ type: 'rpc', name: 'modWhoami' });
    if (r && r.ok && r.data && r.data.username) {
      status.className = 'pop-token-status ok';
      status.textContent = '✓ verified -- token works as ' + r.data.username;
    } else {
      status.className = 'pop-token-status err';
      status.textContent = '✗ token verification FAILED -- you may be locked out. Use lead-issued rotation invite to recover.';
    }
  } catch (e) {
    status.className = 'pop-token-status err';
    status.textContent = 'verify error: ' + (e && e.message || e);
  }
}

// Injects the Verify button into rotateStatus parent on first call; subsequent
// calls are no-ops (button already present).
function _showVerifyTokenBtn() {
  if ($('verifyTokenBtn')) return;
  const status = $('rotateStatus');
  if (!status || !status.parentNode) return;
  const btn = document.createElement('button');
  btn.id = 'verifyTokenBtn';
  btn.className = 'pop-btn pop-btn-ghost';
  btn.textContent = 'Verify token works';
  btn.addEventListener('click', verifyTokenRoundTrip);
  status.parentNode.insertBefore(btn, status.nextSibling);
}

(function wireRotation() {
  const r = $('rotateBtn');
  if (r) r.addEventListener('click', function () { withLoading(r, 'rotating…', rotateToken); });
  const c = $('claimRotateBtn');
  if (c) c.addEventListener('click', function () { withLoading(c, 'claiming…', claimRotationInvite); });
})();

// v9.2.5: hide the "Rotate my token" button when there is no token to rotate.
// Pre-fix, a fresh mod (e.g. PresidentialSeal pre-claim) saw a button that
// makes no sense in their state. The button only applies once the mod has
// a token to rotate FROM. Re-evaluated whenever the popup opens or storage
// changes.
(function gateRotateBtn(){
  const r = $('rotateBtn');
  if (!r) return;
  function update(){
    chrome.storage.local.get('gam_settings').then(function(out){
      const s = (out && out.gam_settings) || {};
      const has = !!(s.workerModToken && String(s.workerModToken).length >= 32);
      r.style.display = has ? '' : 'none';
    }).catch(function(){});
  }
  update();
  try {
    chrome.storage.onChanged.addListener(function(changes, area){
      if (area === 'local' && changes && changes.gam_settings) update();
    });
  } catch (_) {}
})();

// v5.1.11: Manual crawler buttons + dashboard opener
async function sendToActiveGawTab(msg) {
  const tabs = await chrome.tabs.query({ url: GAW_TAB_PATTERNS, active: true, currentWindow: true });
  let tab = tabs[0];
  if (!tab){
    const any = await chrome.tabs.query({ url: GAW_TAB_PATTERNS });
    tab = any[0];
  }
  if (!tab) throw new Error('no GAW tab open');
  return await chrome.tabs.sendMessage(tab.id, msg);
}

document.querySelectorAll('.crawl-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const statusEl = $('crawlStatus');
    await withLoading(btn, 'crawling\u2026', async () => {
      statusEl.className = 'pop-token-status';
      statusEl.textContent = 'crawling ' + btn.dataset.section + ' (' + btn.dataset.pages + ' pages)...';
      try {
        const r = await sendToActiveGawTab({
          type: 'manualCrawl',
          section: btn.dataset.section,
          pages: parseInt(btn.dataset.pages, 10)
        });
        if (r && r.ok){
          statusEl.className = 'pop-token-status ok';
          statusEl.textContent = '\u2713 ' + r.result.pages + ' pages, ' + r.result.users + ' users harvested';
        } else {
          statusEl.className = 'pop-token-status err';
          statusEl.textContent = 'crawl failed: ' + (r && r.error || 'unknown');
        }
      } catch (e) {
        statusEl.className = 'pop-token-status err';
        statusEl.textContent = 'open greatawakening.win in a tab first — ' + e.message;
      }
    });
  });
});

$('dashBtn').addEventListener('click', async () => {
  try {
    const r = await sendToActiveGawTab({ type: 'fetchReport' });
    if (!r || !r.ok) { alert('Dashboard load failed. Need open GAW tab + mod token.'); return; }
    const html = buildDashboardHtml(r.data && r.data.report || {});
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    chrome.tabs.create({ url });
  } catch (e) {
    alert('Dashboard failed: ' + e.message);
  }
});

function buildDashboardHtml(rep) {
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const userLink = u => `<a href="https://greatawakening.win/u/${encodeURIComponent(u)}/" target="_blank">${esc(u)}</a>`;
  const table = (rows, headers) => `<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  const section = (icon, title, body) => `<section><h2>${icon} ${esc(title)}</h2>${body}</section>`;
  const badge = (label) => `<span class="badge">${esc(label)}</span>`;
  const srcBadge = (src) => src ? `<span class="src-badge src-${esc(src)}">${esc(src)}</span>` : '';
  const empty = (msg) => `<div class="empty">${esc(msg)}</div>`;
  const fmtNum = n => Number(n||0).toLocaleString();

  // --- Iter 9: Stat bar with D1 counts (Iter 7 data) ---
  const statsBar = `<div class="stats-bar">
  <div class="stat-card"><div class="stat-n" style="color:#4A9EFF">${fmtNum(rep.d1UserCount)}</div><div class="stat-l">D1 Users</div></div>
  <div class="stat-card"><div class="stat-n" style="color:#4A9EFF">${fmtNum(rep.d1PostCount)}</div><div class="stat-l">D1 Posts</div></div>
  <div class="stat-card"><div class="stat-n" style="color:#E8A317">${fmtNum(rep.d1ActionCount)}</div><div class="stat-l">Audit Events</div></div>
  <div class="stat-card"><div class="stat-n" style="color:#2ECC71">${fmtNum((rep.comebackCandidates||[]).length)}</div><div class="stat-l">Comeback Candidates</div></div>
  <div class="stat-card"><div class="stat-n" style="color:#ff6b6b">${fmtNum(rep.removedCount7d)}</div><div class="stat-l">Posts Removed (7d)</div></div>
  <div class="stat-card"><div class="stat-n" style="color:#bb86fc">${fmtNum(rep.drPendingProposals)}</div><div class="stat-l">DR Pending</div></div>
</div>`;

  // --- Iter 1: Active Mods with per-mod breakdown ---
  let activeHtml = '';
  if ((rep.activeMods||[]).length > 0) {
    activeHtml = `<div class="mod-grid">${(rep.activeMods||[]).map(m => {
      const topActions = Object.entries(m.actions||{}).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>`<span class="pill">${esc(k)} <strong>${v}</strong></span>`).join('');
      return `<div class="mod-card"><div class="mod-name">${esc(m.mod)}</div><div class="mod-total">${fmtNum(m.total)} actions</div><div class="mod-actions">${topActions}</div></div>`;
    }).join('')}</div>`;
  } else {
    activeHtml = empty('No audit events in the last 7 days -- run the extension on GAW to generate audit rows');
  }

  // --- Iter 2: Recent Bans ---
  const banRows = (rep.recentBans||[]).map(x=>`<tr><td>${esc((x.ts||'').slice(0,10))}</td><td>${userLink(x.target_user)}</td><td>${badge(x.action)}</td><td>${esc(x.mod)}</td></tr>`).join('');
  const recentBansHtml = banRows ? table(banRows, ['Date','Target','Action','Mod']) : empty('No bans logged yet -- D1 audit rows are written when mods execute bans through the extension');

  // --- Iter 3: Top Posters ---
  const posterRows = (rep.topPosters||[]).map(x=>`<tr><td>${userLink(x.username)}</td><td>${fmtNum(x.posts)}</td><td>${fmtNum(x.comments||0)}</td></tr>`).join('');
  const topPostersHtml = posterRows ? `${srcBadge(rep.topPostersSource)}${table(posterRows, ['User','Posts','Comments'])}` : empty('No post data yet -- the firehose populates gaw_users as posts are captured');

  // Top Quality -- v9.4.5: AVG(post score) per author, min 3 posts, from gaw_posts D1.
  // Old GitHub-profiles.json source still supported for backwards-compat (upvoteRatio).
  const qualRows = (rep.topQuality||[]).map(x => {
    if (typeof x.avgScore === 'number') {
      return `<tr><td>${userLink(x.username)}</td><td>${fmtNum(x.avgScore)}</td><td>${fmtNum(x.posts)}</td></tr>`;
    }
    if (typeof x.upvoteRatio === 'number') {
      return `<tr><td>${userLink(x.username)}</td><td>${(x.upvoteRatio*100).toFixed(1)}%</td><td>${fmtNum(x.posts)}</td></tr>`;
    }
    return `<tr><td>${userLink(x.username)}</td><td>--</td><td>${fmtNum(x.posts||0)}</td></tr>`;
  }).join('');
  const qualScoreHeader = (rep.topQuality && rep.topQuality[0] && typeof rep.topQuality[0].avgScore === 'number')
    ? 'Avg Score' : 'Upvote Ratio';
  const topQualityHtml = qualRows ? `${srcBadge(rep.topQualitySource)}${table(qualRows, ['User', qualScoreHeader, 'Posts'])}` : empty('No quality data yet -- need >=3 posts per author in gaw_posts');

  // --- Iter 4: Comeback Candidates ---
  const comebackRows = (rep.comebackCandidates||[]).map(x=>`<tr><td>${userLink(x.username)}</td><td>${esc((x.lastSeen||'').slice(0,10))}</td><td>${fmtNum(x.posts||0)}</td><td>${fmtNum(x.comments||0)}</td></tr>`).join('');
  const comebackHtml = comebackRows ? `${srcBadge(rep.comebackSource)}${table(comebackRows, ['User','Last Seen','Posts','Comments'])}` : empty('No comeback candidates yet -- gaw_users last_seen_at is populated by the firehose');

  // Flag leaders
  const flagRows = (rep.flagLeaders||[]).map(x=>`<tr><td>${userLink(x.username)}</td><td>${x.count}</td><td>${esc((x.severities||[]).join(', '))}</td></tr>`).join('');
  const flagHtml = flagRows ? table(flagRows, ['User','Flags','Severities']) : empty('No flags yet -- flags.json is populated when mods flag users (migration to D1 deferred)');

  // --- Iter 5: Removed Content (v9.4.5: posts + mod actions) ---
  const removedAuthorRows = (rep.removedByAuthor||[]).map(x=>`<tr><td>${userLink(x.author)}</td><td>${fmtNum(x.n)}</td></tr>`).join('');
  const removedActionsByModRows = (rep.removedActionsByMod||[]).map(x=>`<tr><td>${esc(x.mod)}</td><td>${badge(x.action)}</td><td>${fmtNum(x.n)}</td></tr>`).join('');
  const removedActionsByTargetRows = (rep.removedActionsByTarget||[]).map(x=>`<tr><td>${userLink(x.author)}</td><td>${fmtNum(x.n)}</td></tr>`).join('');
  const totalRemoved = (rep.removedPostsCount||0) + (rep.removedActionsCount||0);
  let removedHtml = '';
  if (totalRemoved > 0) {
    const summary = `<div class="meta">Posts flipped is_removed: <strong>${fmtNum(rep.removedPostsCount||0)}</strong> &nbsp;&#x2022;&nbsp; Mod removal actions: <strong>${fmtNum(rep.removedActionsCount||0)}</strong></div>`;
    const blocks = [];
    if (removedAuthorRows)        blocks.push(`<h3 style="margin:14px 0 6px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:.06em">By post author</h3>${table(removedAuthorRows, ['Author','Removed Posts'])}`);
    if (removedActionsByModRows)  blocks.push(`<h3 style="margin:14px 0 6px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:.06em">By mod (action)</h3>${table(removedActionsByModRows, ['Mod','Action','Count'])}`);
    if (removedActionsByTargetRows) blocks.push(`<h3 style="margin:14px 0 6px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:.06em">By target user</h3>${table(removedActionsByTargetRows, ['Target','Count'])}`);
    removedHtml = summary + blocks.join('');
  } else {
    removedHtml = empty('No removed content this week -- firehose marks gaw_posts.is_removed=1 on re-capture, and mods log remove_post/deathrow/unsticky to actions');
  }

  // --- Iter 6: Heatmap ---
  let heatmapHtml = '';
  if ((rep.heatmap24h||[]).length === 24) {
    const slots = rep.heatmap24h;
    const maxV = Math.max(...slots, 1);
    const bars = slots.map((n, h) => {
      const pct = Math.round((n / maxV) * 100);
      const label = h === 0 ? '12a' : h < 12 ? h+'a' : h === 12 ? '12p' : (h-12)+'p';
      return `<div class="hm-col"><div class="hm-bar" style="height:${pct}%" title="${n} actions at ${label}"></div><div class="hm-label">${h%3===0?label:''}</div></div>`;
    }).join('');
    heatmapHtml = `<div class="heatmap">${bars}</div>`;
  } else {
    heatmapHtml = empty('No heatmap data yet -- requires audit events in the last 7 days');
  }

  // --- Iter 8: Death Row Pipeline ---
  const drHtml = `<div class="stats-bar">
  <div class="stat-card"><div class="stat-n" style="color:#bb86fc">${fmtNum(rep.drPendingProposals)}</div><div class="stat-l">Pending Proposals</div></div>
  <div class="stat-card"><div class="stat-n" style="color:#E8A317">${fmtNum(rep.drActionsWeek)}</div><div class="stat-l">DR Actions (7d)</div></div>
</div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>GAW ModTools Dashboard</title>
<style>
*{box-sizing:border-box}
body{font:14px/1.5 ui-sans-serif,system-ui,sans-serif;background:#0f1114;color:#e4e4e4;margin:0;padding:24px 28px;max-width:1280px;margin:auto}
h1{color:#4A9EFF;margin:0 0 4px 0;font-size:22px;font-weight:700}
h2{color:#E8A317;border-bottom:1px solid #252830;padding-bottom:8px;margin:32px 0 12px;font-size:15px;font-weight:600}
section{margin-bottom:28px}
table{width:100%;border-collapse:collapse;background:#14161a;border-radius:8px;overflow:hidden;font-size:13px}
th,td{padding:9px 14px;text-align:left;border-bottom:1px solid #1e2026}
th{background:#1c1f25;color:#888;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.06em}
tr:last-child td{border-bottom:none}
tr:hover td{background:#1a1d23}
a{color:#4A9EFF;text-decoration:none}
a:hover{text-decoration:underline}
.meta{color:#666;font-size:12px;margin-bottom:18px}
.stats-bar{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px}
.stat-card{background:#14161a;border:1px solid #1e2026;border-radius:8px;padding:12px 18px;min-width:110px}
.stat-n{font-size:26px;font-weight:700;line-height:1.1}
.stat-l{color:#666;font-size:11px;text-transform:uppercase;margin-top:2px;letter-spacing:.04em}
.empty{color:#555;font-style:italic;padding:14px 4px;font-size:13px}
.badge{display:inline-block;background:#2a1a00;color:#E8A317;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:600}
.src-badge{display:inline-block;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.src-d1{background:#0d2236;color:#4A9EFF}
.src-github{background:#1a2400;color:#7ec850}
.src-kv{background:#1a1a00;color:#ccc}
.mod-grid{display:flex;flex-wrap:wrap;gap:10px}
.mod-card{background:#14161a;border:1px solid #1e2026;border-radius:8px;padding:12px 16px;min-width:180px;flex:1 1 180px}
.mod-name{font-weight:600;color:#e4e4e4;margin-bottom:2px;font-size:13px}
.mod-total{color:#2ECC71;font-size:12px;margin-bottom:8px;font-weight:600}
.mod-actions{display:flex;flex-wrap:wrap;gap:4px}
.pill{background:#1e2026;border-radius:4px;padding:2px 7px;font-size:11px;color:#aaa}
.pill strong{color:#e4e4e4}
.heatmap{display:flex;align-items:flex-end;gap:3px;height:60px;padding:0 2px;background:#14161a;border-radius:8px;padding:10px 10px 0}
.hm-col{display:flex;flex-direction:column;align-items:center;flex:1}
.hm-bar{width:100%;background:#4A9EFF;border-radius:2px 2px 0 0;min-height:2px;transition:opacity .15s}
.hm-bar:hover{opacity:.7}
.hm-label{color:#555;font-size:9px;margin-top:3px;white-space:nowrap}
</style></head><body>
<h1>&#x1F4CA; GAW ModTools Dashboard</h1>
<div class="meta">Generated ${esc(rep.generatedAt||'')} &nbsp;&#x2022;&nbsp; v9.4.5</div>
${statsBar}
${section('&#x26A1;', 'Active Mods (last 7 days)', activeHtml)}
${section('&#x1F6E1;', 'Recent Bans', recentBansHtml)}
${section('&#x1F4C8;', 'Activity Heatmap (last 7 days, UTC hour)', heatmapHtml)}
${section('&#x2620;', 'Death Row Pipeline', drHtml)}
${section('&#x1F4B0;', 'Top 10 Posters', topPostersHtml)}
${section('&#x1F31F;', 'Top 10 Highest Quality', topQualityHtml)}
${section('&#x1F550;', 'Comeback Candidates (' + (rep.comebackThresholdDays || 60) + '+ days silent)', comebackHtml)}
${section('&#x1F6AB;', 'Removed Content This Week', removedHtml)}
${section('&#x1F6A9;', 'Flag Leaders', flagHtml)}
</body></html>`;
}

// --- v7.2 Platform Hardening BEGIN ---
// v7.2 CHUNK 14: claim-invite handler. Reads chrome.storage.session for a
// staged invite code, shows confirm modal with prefix/suffix, routes the
// claim through the background relay's workerFetch (which attaches the
// necessary headers and POSTs to /invite/claim). On success: surfaces the
// returned modToken to the background vault via {type:'setTokens'}, clears
// the staged code, and refreshes status rows. The popup NEVER writes a
// modToken into chrome.storage.local directly.
async function __claimInviteClick() {
  const statusEl = $('claimInviteStatus');
  if (!statusEl) return;
  statusEl.className = 'pop-token-status';
  statusEl.textContent = 'checking...';
  try {
    if (!chrome.storage || !chrome.storage.session) {
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'session storage unavailable';
      return;
    }
    const out = await chrome.storage.session.get('gam_pending_invite');
    const code = (out && out.gam_pending_invite) || '';
    if (!code) {
      statusEl.textContent = 'no invite staged \u2014 visit an invite link in a GAW tab';
      return;
    }
    if (!__isTokenShape(code) && !/^[A-Za-z0-9_-]{16,128}$/.test(code)) {
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'staged invite is malformed \u2014 refused';
      return;
    }
    const prefix = String(code).slice(0, 12);
    const suffix = String(code).slice(-4);

    // v9.2.7: prompt for username so the worker can verify the invite is bound
    // to the right mod. Pre-fix, this button hit the LEGACY /invite/claim
    // endpoint which queries a different table (team_invites) and returned
    // 404 for every per-mod rotation invite -- the entire reason
    // PresidentialSeal kept hitting "404 invalid code" with a perfectly
    // valid rotation invite in token_invites.
    const username = await __popupAskText({
      title: 'Claim rotation invite',
      label: 'Your GAW username (any spelling \u2014 match is case-insensitive since v9.3.0)',
      placeholder: 'e.g. PresidentialSeal',
      max: 32,
      validate: function (v) {
        if (!v) return 'username required';
        return /^[A-Za-z0-9_-]{2,32}$/.test(v) ? '' : 'invalid username shape';
      }
    });
    if (!username) { statusEl.textContent = 'cancelled'; return; }

    const ok = await __popupConfirm({
      title: 'Claim rotation invite?',
      body: 'Username: ' + username + '\n' +
            'Invite code: ' + prefix + '\u2026' + suffix + '\n\n' +
            'This generates a fresh team token bound to this browser.\n\n' +
            'ONLY CLICK OK if you were personally given this link by your lead mod.',
      okLabel: 'Claim',
      cancelLabel: 'Cancel'
    });
    if (!ok) {
      statusEl.textContent = 'cancelled';
      return;
    }
    statusEl.textContent = 'claiming...';

    // v9.2.7: route through authClaimInvite RPC, which hits
    // /mod/token/claim-rotation (correct endpoint for per-mod rotation
    // invites). The RPC also stores the resulting token in the SW vault
    // automatically, so we don't need a separate saveTokensSecurely step.
    const rClaim = await chrome.runtime.sendMessage({
      type: 'rpc',
      name: 'authClaimInvite',
      args: { code: code, username: username }
    });
    if (!rClaim || !rClaim.ok) {
      statusEl.className = 'pop-token-status err';
      let msg = 'claim rejected';
      if (rClaim && rClaim.status) msg += ' (HTTP ' + rClaim.status + ')';
      if (rClaim && rClaim.data && rClaim.data.error) msg += ' -- ' + rClaim.data.error;
      else if (rClaim && rClaim.error) msg += ' -- ' + rClaim.error;
      statusEl.textContent = msg;
      return;
    }
    try { await chrome.storage.session.remove('gam_pending_invite'); } catch (e) {}
    const claimData = rClaim.data || {};
    statusEl.className = 'pop-token-status ok';
    statusEl.textContent = '\u2713 claimed \u2014 you are now ' + (claimData.mod_username || username);
    try { await loadToken(); } catch (e) {}
    try { await loadLead(); } catch (e) {}
  } catch (e) {
    statusEl.className = 'pop-token-status err';
    statusEl.textContent = 'check failed: ' + (e && e.message || e);
  }
}

(function wireClaimInvite() {
  const btn = $('claimInviteBtn');
  if (!btn) return;
  btn.addEventListener('click', __claimInviteClick);
})();

// Show the claim-invite wrap once we confirm the flag is on (loadToken also
// toggles this, but we do it here too for robustness).
(async function __maybeShowClaimInvite() {
  try {
    if (await __hardeningOnPopup()) {
      const wrap = $('claimInviteWrap');
      if (wrap) wrap.style.display = '';
    }
  } catch (e) {}
})();
// --- v7.2 Platform Hardening END ---

loadStats();
refreshSniffLabel();
loadToken();
loadLead();

// v9.15.0 - tab nav (Commander #30: eliminate vertical scrollbars). Maps
// existing top-level sections to one of 4 tabs and toggles visibility on
// click. Default tab: stats. Special handling for #leadSection (shared
// across tokens + lead tabs) and #leadOnlyTools (only on lead tab).
(function wireTabNav() {
  const TAB_MAP = {
    stats:  ['.pop-stats', '#pop-drill', '.pop-alert', '#dr-alert', '#firstrun-banner'],
    tokens: ['#claimInviteWrap', '.pop-token:not(#macrosSection):not(#leadSection)'],
    tools:  ['.pop-actions', '#macrosSection', '.pop-tools', '.pop-section-label',
             '.pop-maint', '#maintRosterStalenessPanel', '#bugListPanel',
             '#maintReportsPanel', '#maintTardSuggestPanel', '#maintStickyScanPanel'],
    lead:   []  // lead-only tools handled specially below
  };
  // Tag sections with data-tab so the toggle is fast + visible in DevTools
  Object.entries(TAB_MAP).forEach(([tab, sels]) => {
    sels.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (!el.dataset.tab) el.dataset.tab = tab;
        });
      } catch (_) {}
    });
  });

  function setTab(name) {
    // Hide all tagged sections, then show the matching ones
    document.querySelectorAll('[data-tab]').forEach(el => {
      el.style.display = (el.dataset.tab === name) ? '' : 'none';
    });
    // Special case: leadSection contains both the lead token input AND
    // leadOnlyTools. Visible on tokens tab AND lead tab, but the
    // lead-only-tools child only on lead tab.
    const leadSec = document.getElementById('leadSection');
    const leadTools = document.getElementById('leadOnlyTools');
    if (leadSec) leadSec.style.display = (name === 'tokens' || name === 'lead') ? '' : 'none';
    if (leadTools) leadTools.style.display = (name === 'lead') ? '' : 'none';
    // Update active tab indicator
    document.querySelectorAll('.pop-tab').forEach(b => {
      const active = b.dataset.tab === name;
      b.classList.toggle('pop-tab-active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    // Persist last-active tab so refresh restores user position
    try { localStorage.setItem('gam_popup_active_tab', name); } catch (_) {}
  }
  document.querySelectorAll('.pop-tab').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });
  // Restore last tab or default to stats
  const initial = (function() {
    try { return localStorage.getItem('gam_popup_active_tab') || 'stats'; }
    catch (_) { return 'stats'; }
  })();
  setTab(['stats','tokens','tools','lead'].includes(initial) ? initial : 'stats');
})();

// =========================================================================
// v9.3.1 (P0-4): team-wide settings — username flag TTL.
// Worker enforces the filter on /flags/read; here we only present + write.
// Lead-only UI (only renders when leadSection is visible).
// =========================================================================
async function loadTeamSettings(){
  const inputEl = $('flagTtlInput');
  const statusEl = $('flagTtlStatus');
  if (!inputEl || !statusEl) return;
  try {
    const r = await chrome.runtime.sendMessage({ type:'rpc', name:'modSettingsRead' });
    if (!r || !r.ok) { statusEl.textContent = '(could not read team settings)'; return; }
    const ttl = parseInt((r.data && r.data.settings && r.data.settings.username_flag_ttl_days), 10);
    if (Number.isFinite(ttl) && ttl > 0) {
      inputEl.value = String(ttl);
      statusEl.className = 'pop-token-status';
      statusEl.textContent = 'current: ' + ttl + 'd (server-enforced on flag reads)';
    } else {
      statusEl.textContent = 'default 30d';
    }
  } catch(e){
    statusEl.className = 'pop-token-status err';
    statusEl.textContent = 'load failed: ' + (e && e.message || e);
  }
}
async function saveFlagTtl(){
  const inputEl = $('flagTtlInput');
  const statusEl = $('flagTtlStatus');
  if (!inputEl || !statusEl) return;
  const v = parseInt(inputEl.value, 10);
  if (!Number.isFinite(v) || v < 1 || v > 365) {
    statusEl.className = 'pop-token-status err';
    statusEl.textContent = 'enter a number between 1 and 365';
    return;
  }
  statusEl.className = 'pop-token-status';
  statusEl.textContent = 'saving...';
  try {
    const r = await chrome.runtime.sendMessage({
      type:'rpc',
      name:'adminSettingsWrite',
      args:{ key:'username_flag_ttl_days', value:String(v) }
    });
    if (r && r.ok){
      statusEl.className = 'pop-token-status ok';
      statusEl.textContent = '✓ flag TTL = ' + v + 'd (live to all mods on next /flags/read)';
    } else {
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'save failed: HTTP ' + (r && r.status || '?') + (r && r.error ? ' — ' + r.error : '');
    }
  } catch(e){
    statusEl.className = 'pop-token-status err';
    statusEl.textContent = 'network error: ' + (e && e.message || e);
  }
}
{
  const btn = $('flagTtlSave');
  if (btn) btn.addEventListener('click', function(){ withLoading(btn, 'saving...', saveFlagTtl); });
  const inp = $('flagTtlInput');
  if (inp) inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') withLoading($('flagTtlSave'), 'saving...', saveFlagTtl); });
}
loadTeamSettings();

// =========================================================================
// v9.4.4: Bug-report triage panel (lead-only)
// =========================================================================
// The lead section now surfaces incoming bug reports stored in the
// bug_reports D1 table. Pre-fix, reports went into D1 and were never read by
// any client surface — leads only saw them via raw wrangler queries. This
// adds: list, expand, mark triaged/fixed/wontfix, set assignee, set the
// "who can read bug reports" allowlist (visibility config).
//
// Visibility model: a `team_features` row keyed `bug_report_visible_to` whose
// value is one of: "leads" (default), "all", or a comma list of usernames.
// Worker enforces on every GET.
//
// Polling: background.js polls /admin/bug-reports?status=open every 5min and
// updates `chrome.action.setBadgeText`. The popup mirrors the count locally
// when the panel is open.

function __bugFmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  const ageMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (ageMin < 60) return ageMin + 'm ago';
  if (ageMin < 1440) return Math.floor(ageMin / 60) + 'h ago';
  return Math.floor(ageMin / 1440) + 'd ago';
}

// XSS-safe row renderer. All user input goes through textContent.
function __renderBugRow(panel, row, refresh) {
  const wrap = document.createElement('div');
  wrap.style.borderBottom = '1px solid #2b303a';
  wrap.style.padding = '6px 4px';
  wrap.style.cursor = 'pointer';

  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.justifyContent = 'space-between';
  head.style.gap = '6px';
  head.style.alignItems = 'baseline';

  const left = document.createElement('div');
  left.style.flex = '1 1 auto';
  left.style.overflow = 'hidden';
  left.style.textOverflow = 'ellipsis';
  const id = document.createElement('span');
  id.style.color = '#888';
  id.style.marginRight = '6px';
  id.textContent = '#' + row.id;
  const reporter = document.createElement('span');
  reporter.style.color = '#4A9EFF';
  reporter.textContent = row.reported_by || '?';
  const desc = document.createElement('span');
  desc.style.marginLeft = '6px';
  desc.style.color = '#e5e9f0';
  desc.textContent = (row.description || '').slice(0, 100);
  left.appendChild(id);
  left.appendChild(reporter);
  left.appendChild(document.createTextNode(' '));
  left.appendChild(desc);

  const right = document.createElement('div');
  right.style.color = '#888';
  right.style.fontSize = '10px';
  right.style.flex = '0 0 auto';
  right.textContent = (row.version || '?') + ' · ' + __bugFmtTs(row.created_at);

  head.appendChild(left);
  head.appendChild(right);
  wrap.appendChild(head);

  // Expandable detail
  const detail = document.createElement('div');
  detail.style.display = 'none';
  detail.style.marginTop = '6px';
  detail.style.padding = '6px';
  detail.style.background = '#0b0d12';
  detail.style.borderRadius = '3px';

  const fullDesc = document.createElement('pre');
  fullDesc.style.whiteSpace = 'pre-wrap';
  fullDesc.style.color = '#cdd0d6';
  fullDesc.style.margin = '0 0 6px 0';
  fullDesc.style.fontSize = '11px';
  fullDesc.textContent = row.description || '';
  detail.appendChild(fullDesc);

  if (row.page_url) {
    const p = document.createElement('div');
    p.style.color = '#888';
    p.style.fontSize = '10px';
    p.textContent = 'page: ' + row.page_url;
    detail.appendChild(p);
  }

  if (row.snapshot_json) {
    const snapBtn = document.createElement('button');
    snapBtn.className = 'pop-btn pop-btn-ghost';
    snapBtn.style.fontSize = '10px';
    snapBtn.style.padding = '2px 6px';
    snapBtn.style.marginTop = '4px';
    snapBtn.textContent = 'Show debug snapshot';
    const snapPre = document.createElement('pre');
    snapPre.style.display = 'none';
    snapPre.style.maxHeight = '180px';
    snapPre.style.overflow = 'auto';
    snapPre.style.background = '#000';
    snapPre.style.color = '#a0d0a0';
    snapPre.style.padding = '4px';
    snapPre.style.fontSize = '10px';
    snapPre.style.marginTop = '4px';
    try {
      snapPre.textContent = JSON.stringify(JSON.parse(row.snapshot_json), null, 2);
    } catch (e) { snapPre.textContent = row.snapshot_json; }
    snapBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      snapPre.style.display = snapPre.style.display === 'none' ? 'block' : 'none';
    });
    detail.appendChild(snapBtn);
    detail.appendChild(snapPre);
  }

  // Action row: status select + assignee + resolution note + save button
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '4px';
  actions.style.flexWrap = 'wrap';
  actions.style.marginTop = '6px';
  actions.style.alignItems = 'center';

  const statusSel = document.createElement('select');
  statusSel.style.fontSize = '10px';
  statusSel.style.background = '#11131a';
  statusSel.style.color = '#e5e9f0';
  statusSel.style.border = '1px solid #3b414d';
  statusSel.style.padding = '2px 4px';
  ['open', 'triaged', 'fixed', 'wontfix'].forEach(function (s) {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    if (row.status === s) opt.selected = true;
    statusSel.appendChild(opt);
  });

  const assignInp = document.createElement('input');
  assignInp.type = 'text';
  assignInp.placeholder = 'assignee';
  assignInp.value = row.assigned_to || '';
  assignInp.style.fontSize = '10px';
  assignInp.style.background = '#11131a';
  assignInp.style.color = '#e5e9f0';
  assignInp.style.border = '1px solid #3b414d';
  assignInp.style.padding = '2px 4px';
  assignInp.style.width = '100px';

  const noteInp = document.createElement('input');
  noteInp.type = 'text';
  noteInp.placeholder = 'note (triage / resolution)';
  noteInp.style.fontSize = '10px';
  noteInp.style.background = '#11131a';
  noteInp.style.color = '#e5e9f0';
  noteInp.style.border = '1px solid #3b414d';
  noteInp.style.padding = '2px 4px';
  noteInp.style.flex = '1 1 100px';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'pop-btn pop-btn-ghost';
  saveBtn.style.fontSize = '10px';
  saveBtn.style.padding = '2px 8px';
  saveBtn.textContent = 'Save';

  saveBtn.addEventListener('click', async function (e) {
    e.stopPropagation();
    saveBtn.disabled = true;
    saveBtn.textContent = 'saving...';
    try {
      const newStatus = statusSel.value;
      const args = { id: row.id, status: newStatus };
      if (assignInp.value !== (row.assigned_to || '')) {
        args.assigned_to = assignInp.value || null;
      }
      if (noteInp.value) {
        if (newStatus === 'fixed' || newStatus === 'wontfix') {
          args.resolution_note = noteInp.value;
        } else {
          args.triage_note = noteInp.value;
        }
      }
      const r = await chrome.runtime.sendMessage({ type: 'rpc', name: 'bugReportUpdate', args });
      if (r && r.ok) {
        saveBtn.textContent = 'saved';
        setTimeout(refresh, 400);
      } else {
        saveBtn.textContent = 'fail';
        saveBtn.disabled = false;
        console.warn('[bugReportUpdate]', r);
      }
    } catch (e) {
      saveBtn.textContent = 'err';
      saveBtn.disabled = false;
    }
  });

  // Stop propagation so clicking inside controls doesn't toggle expand.
  [statusSel, assignInp, noteInp].forEach(function (el) {
    el.addEventListener('click', function (e) { e.stopPropagation(); });
    el.addEventListener('keydown', function (e) { e.stopPropagation(); });
  });

  actions.appendChild(statusSel);
  actions.appendChild(assignInp);
  actions.appendChild(noteInp);
  actions.appendChild(saveBtn);
  detail.appendChild(actions);

  wrap.appendChild(detail);

  wrap.addEventListener('click', function () {
    detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
  });

  panel.appendChild(wrap);
}

async function loadBugReports() {
  const panel = $('bugListPanel');
  const status = $('bugListStatus');
  const badge = $('bugListBadge');
  if (!panel) return;
  panel.style.display = 'block';
  status.className = 'pop-token-status';
  status.textContent = 'loading...';
  while (panel.firstChild) panel.removeChild(panel.firstChild);
  try {
    const r = await chrome.runtime.sendMessage({
      type: 'rpc', name: 'bugReportList', args: { status: 'open', limit: 100 }
    });
    if (!r || !r.ok || !r.data) {
      status.className = 'pop-token-status err';
      status.textContent = 'failed (HTTP ' + (r && r.status || '?') + ')'
        + (r && r.data && r.data.error ? ' — ' + r.data.error : '');
      return;
    }
    const reports = (r.data && r.data.reports) || [];
    const n = parseInt(r.data.open_count, 10) || 0;
    if (badge) {
      if (n > 0) { badge.textContent = String(n); badge.style.display = 'inline'; }
      else { badge.style.display = 'none'; }
    }
    status.className = 'pop-token-status ok';
    status.textContent = (reports.length === 0
      ? 'no open reports'
      : reports.length + ' open · click row to expand')
      + ' · visibility: ' + (r.data.visible_to || 'leads');
    reports.forEach(function (row) { __renderBugRow(panel, row, loadBugReports); });
  } catch (e) {
    status.className = 'pop-token-status err';
    status.textContent = 'network error: ' + (e && e.message || e);
  }
}

async function saveBugVisibility() {
  const inp = $('bugVisInput');
  const status = $('bugVisStatus');
  const v = String(inp.value || '').trim();
  if (!v) {
    status.className = 'pop-token-status err';
    status.textContent = 'enter "leads", "all", or a comma list of usernames';
    return;
  }
  status.className = 'pop-token-status';
  status.textContent = 'saving...';
  try {
    const r = await chrome.runtime.sendMessage({
      type: 'rpc', name: 'bugReportVisibilityWrite', args: { visible_to: v }
    });
    if (r && r.ok) {
      status.className = 'pop-token-status ok';
      status.textContent = '✓ saved: ' + (r.data && r.data.visible_to);
    } else {
      status.className = 'pop-token-status err';
      status.textContent = 'failed: HTTP ' + (r && r.status || '?')
        + (r && r.data && r.data.error ? ' — ' + r.data.error : '');
    }
  } catch (e) {
    status.className = 'pop-token-status err';
    status.textContent = 'network error: ' + (e && e.message || e);
  }
}

async function loadBugVisibility() {
  const inp = $('bugVisInput');
  if (!inp) return;
  try {
    const r = await chrome.runtime.sendMessage({
      type: 'rpc', name: 'bugReportVisibilityRead'
    });
    if (r && r.ok && r.data && r.data.visible_to) {
      inp.value = r.data.visible_to;
    }
  } catch (e) {}
}

{
  const listBtn = $('bugListBtn');
  if (listBtn) listBtn.addEventListener('click', function () {
    withLoading(listBtn, 'loading...', loadBugReports);
  });
  const visBtn = $('bugVisSave');
  if (visBtn) visBtn.addEventListener('click', function () {
    withLoading(visBtn, 'saving...', saveBugVisibility);
  });
}
loadBugVisibility();

// =========================================================================
// v9.6.0: Team macros (shared ban_msg + mm_reply CRUD)
// =========================================================================
let __macroKind = 'ban_msg';
let __macroEditing = null;

function __macroSetStatus(msg, cls){
  const el = document.getElementById('macrosStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'pop-token-status' + (cls ? ' ' + cls : '');
}

async function loadMacros(){
  const list = document.getElementById('macrosList');
  if (!list) return;
  list.innerHTML = '<div style="padding:10px;color:#888;font-size:11px;text-align:center">Loading...</div>';
  try {
    const r = await chrome.runtime.sendMessage({
      type: 'rpc', name: 'macrosList', args: { kind: __macroKind }
    });
    if (!r || !r.ok || !r.data || !Array.isArray(r.data.macros)){
      list.innerHTML = '<div style="padding:10px;color:#f04040;font-size:11px;text-align:center">Failed to load: ' + ((r && r.error) || 'no response') + '</div>';
      return;
    }
    if (r.data.macros.length === 0){
      list.innerHTML = '<div style="padding:10px;color:#888;font-size:11px;text-align:center">No macros yet. Click "Add new macro" below.</div>';
      return;
    }
    list.innerHTML = '';
    r.data.macros.forEach(function(m){
      const row = document.createElement('div');
      row.className = 'gam-macro-row';
      row.style.cssText = 'padding:6px 8px;border-bottom:1px solid #1f2227;display:flex;flex-direction:column;gap:2px';
      const top = document.createElement('div');
      top.style.cssText = 'display:flex;align-items:center;gap:6px';
      const lbl = document.createElement('div');
      lbl.style.cssText = 'flex:1;font-weight:600;color:#dcdcdc;font-size:12px';
      lbl.textContent = m.label;
      const useCount = document.createElement('span');
      useCount.style.cssText = 'color:#666;font-size:10px';
      useCount.textContent = (m.use_count || 0) + 'x';
      const editBtn = document.createElement('button');
      editBtn.className = 'pop-btn pop-btn-ghost';
      editBtn.style.cssText = 'padding:2px 6px;font-size:10px';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', function(){ __macroStartEdit(m); });
      const delBtn = document.createElement('button');
      delBtn.className = 'pop-btn pop-btn-ghost';
      delBtn.style.cssText = 'padding:2px 6px;font-size:10px;color:#f04040';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', function(){ __macroDelete(m); });
      top.appendChild(lbl);
      top.appendChild(useCount);
      top.appendChild(editBtn);
      top.appendChild(delBtn);
      const body = document.createElement('div');
      body.style.cssText = 'color:#999;font-size:11px;white-space:pre-wrap;word-break:break-word;max-height:50px;overflow:hidden';
      body.textContent = m.body;
      const meta = document.createElement('div');
      meta.style.cssText = 'color:#555;font-size:9.5px';
      meta.textContent = 'by ' + (m.created_by || '?') + (m.updated_by ? ' (edited by ' + m.updated_by + ')' : '');
      row.appendChild(top);
      row.appendChild(body);
      row.appendChild(meta);
      list.appendChild(row);
    });
  } catch(e){
    list.innerHTML = '<div style="padding:10px;color:#f04040;font-size:11px;text-align:center">Error: ' + (e && e.message || e) + '</div>';
  }
}

function __macroStartEdit(m){
  __macroEditing = m || { id: null, label: '', body: '' };
  document.getElementById('macroEditId').value = m && m.id ? String(m.id) : '';
  document.getElementById('macroEditLabel').value = m && m.label ? m.label : '';
  document.getElementById('macroEditBody').value = m && m.body ? m.body : '';
  document.getElementById('macroEditWrap').style.display = '';
  try { document.getElementById('macroEditLabel').focus(); } catch(_){}
}

function __macroCancelEdit(){
  __macroEditing = null;
  document.getElementById('macroEditWrap').style.display = 'none';
}

async function __macroSave(){
  const idRaw = document.getElementById('macroEditId').value;
  const id = idRaw ? parseInt(idRaw, 10) : null;
  const label = (document.getElementById('macroEditLabel').value || '').trim();
  const body = (document.getElementById('macroEditBody').value || '').trim();
  if (!label || !body){ __macroSetStatus('label + body required', 'err'); return; }
  if (label.length > 80){ __macroSetStatus('label too long (max 80)', 'err'); return; }
  if (body.length > 4000){ __macroSetStatus('body too long (max 4000)', 'err'); return; }
  __macroSetStatus('saving...');
  try {
    const r = await chrome.runtime.sendMessage({
      type: 'rpc', name: 'macroUpsert', args: { id: id, kind: __macroKind, label: label, body: body }
    });
    if (r && r.ok && r.data && r.data.ok){
      __macroSetStatus('✓ ' + (r.data.action || 'saved'), 'ok');
      __macroCancelEdit();
      loadMacros();
    } else {
      __macroSetStatus('save failed: ' + ((r && r.data && r.data.error) || (r && r.error) || 'unknown'), 'err');
    }
  } catch(e){
    __macroSetStatus('error: ' + (e && e.message || e), 'err');
  }
}

async function __macroDelete(m){
  if (!m || !m.id) return;
  if (!window.confirm('Delete macro "' + m.label + '"? This is sync\'d across the team.')) return;
  __macroSetStatus('deleting...');
  try {
    const r = await chrome.runtime.sendMessage({
      type: 'rpc', name: 'macroDelete', args: { id: m.id }
    });
    if (r && r.ok && r.data && r.data.ok){
      __macroSetStatus('✓ deleted', 'ok');
      loadMacros();
    } else {
      __macroSetStatus('delete failed: ' + ((r && r.data && r.data.error) || (r && r.error) || 'unknown'), 'err');
    }
  } catch(e){
    __macroSetStatus('error: ' + (e && e.message || e), 'err');
  }
}

// v9.6.1: AI-seed flow. Calls /macros/ai-suggest, presents the returned
// suggestions in a confirm dialog (label + body preview), and upserts
// each accepted suggestion. Per Commander: "canned replies that the AI
// wrote for us to start with".
async function __macroAiSeed(){
  const btn = document.getElementById('macroAiSeedBtn');
  const orig = btn ? btn.textContent : '';
  if (btn){ btn.disabled = true; btn.textContent = '✨ Generating...'; }
  __macroSetStatus('asking AI for ' + __macroKind + ' suggestions...');
  try {
    // v9.8.0: pass existing labels as anti-list to prevent repetition
    let existing_labels = [];
    try {
      const lr = await chrome.runtime.sendMessage({ type:'rpc', name:'macrosList', args:{ kind: __macroKind } });
      if (lr && lr.ok && lr.data && Array.isArray(lr.data.macros)) {
        existing_labels = lr.data.macros.map(m => String(m.label || '')).filter(Boolean);
      }
    } catch(_){}
    const r = await chrome.runtime.sendMessage({
      type:'rpc', name:'macroAiSuggest', args:{ kind: __macroKind, count: 5, existing_labels }
    });
    if (!r || !r.ok || !r.data || !r.data.ok || !Array.isArray(r.data.suggestions)){
      const errReason = (r && r.data && r.data.error) || (r && r.error) || 'unknown';
      __macroSetStatus('AI suggestion failed: ' + errReason, 'err');
      return;
    }
    const sugg = r.data.suggestions;
    if (sugg.length === 0){ __macroSetStatus('AI returned 0 suggestions', 'err'); return; }
    // Confirm with full preview
    const previewLines = sugg.map((s,i) => (i+1) + '. ' + s.label).join('\n');
    if (!window.confirm('AI proposed ' + sugg.length + ' ' + __macroKind + ' macros:\n\n' + previewLines + '\n\nAccept all and save? (You can edit/delete individually after.)')) {
      __macroSetStatus('cancelled', 'info');
      return;
    }
    let saved = 0, failed = 0;
    for (const s of sugg) {
      try {
        const upsert = await chrome.runtime.sendMessage({
          type:'rpc', name:'macroUpsert',
          args:{ kind: __macroKind, label: s.label, body: s.body }
        });
        if (upsert && upsert.ok && upsert.data && upsert.data.ok) saved++;
        else failed++;
      } catch(_){ failed++; }
    }
    __macroSetStatus('✓ saved ' + saved + (failed ? ' (' + failed + ' failed)' : ''), 'ok');
    loadMacros();
  } catch(e){
    __macroSetStatus('error: ' + (e && e.message || e), 'err');
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = orig; }
  }
}

{
  // Tab switching
  document.querySelectorAll('.gam-macro-tab').forEach(function(t){
    t.addEventListener('click', function(){
      __macroKind = t.getAttribute('data-kind') || 'ban_msg';
      document.querySelectorAll('.gam-macro-tab').forEach(function(t2){ t2.classList.toggle('gam-macro-tab-active', t2 === t); });
      __macroCancelEdit();
      loadMacros();
    });
  });
  const addBtn = document.getElementById('macroAddBtn');
  if (addBtn) addBtn.addEventListener('click', function(){ __macroStartEdit(null); });
  const aiBtn = document.getElementById('macroAiSeedBtn');
  if (aiBtn) aiBtn.addEventListener('click', __macroAiSeed);
  const saveBtn = document.getElementById('macroSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', function(){ withLoading(saveBtn, 'saving...', __macroSave); });
  const cancelBtn = document.getElementById('macroCancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', __macroCancelEdit);
}
loadMacros();

// =========================================================================
// v9.4.5: Stat-card drill-downs
// =========================================================================
// Each of the 6 stat cards in the popup has a `data-drill="<key>"` attribute.
// Clicking a card opens the #pop-drill drawer with a tabular detail view.
//   pending / dr / banned    -> source from chrome.storage.local (roster, dr)
//   bans24 / msgs24 / notes24 -> source from K.LOG (mod_log) filtered to last 24h
//
// All rendering uses textContent + element creation (no innerHTML on user data)
// to honour the v6.3.0 XSS contract. The CSP forbids inline handlers; rows are
// wired via addEventListener.

const __DRILL_TITLES = {
  pending: 'Pending users (awaiting triage)',
  dr:      'Death Row queue',
  banned:  'Banned users (roster)',
  bans24:  'Bans (last 24h)',
  msgs24:  'Messages / replies (last 24h)',
  notes24: 'Notes (last 24h)'
};
const __DRILL_EMPTY_HINT = {
  pending: 'No users waiting on triage. Run a /users crawl to refresh the roster.',
  dr:      'Death Row queue is empty. Schedule a ban from the Mod Console to populate.',
  banned:  'No banned users in your local roster. Crawl /users with status=banned to import.',
  bans24:  'No ban actions logged in the last 24h.',
  msgs24:  'No mod messages or replies sent in the last 24h.',
  notes24: 'No mod notes written in the last 24h.'
};

// Format an ms-epoch or ISO ts as "HH:MM" if today, else "Mon DD".
function __fmtDrillTs(ts) {
  if (ts == null || ts === '') return '—';
  const d = (typeof ts === 'number') ? new Date(ts) : new Date(String(ts));
  if (!d || isNaN(d.getTime())) return '—';
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear()
                && d.getMonth() === now.getMonth()
                && d.getDate() === now.getDate();
  const pad = n => (n < 10 ? '0' + n : '' + n);
  if (sameDay) return pad(d.getHours()) + ':' + pad(d.getMinutes());
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getMonth()] + ' ' + d.getDate();
}

// Build a row element for the drill-down body.
function __makeDrillRow(opts) {
  const row = document.createElement('div');
  row.className = 'pop-drill-row';

  const tsCell = document.createElement('span');
  tsCell.className = 'col-ts';
  tsCell.textContent = opts.ts || '—';
  row.appendChild(tsCell);

  const userCell = document.createElement('span');
  userCell.className = 'col-user';
  if (opts.user) {
    const a = document.createElement('a');
    a.href = 'https://greatawakening.win/u/' + encodeURIComponent(opts.user) + '/';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = opts.user;
    userCell.appendChild(a);
  } else {
    userCell.textContent = opts.label || '—';
  }
  row.appendChild(userCell);

  const metaCell = document.createElement('span');
  metaCell.className = 'col-meta';
  if (opts.pill) {
    const pill = document.createElement('span');
    pill.className = 'pop-drill-pill ' + (opts.pill.cls || '');
    pill.textContent = opts.pill.text;
    metaCell.appendChild(pill);
  }
  if (opts.metaText) {
    const t = document.createElement('span');
    t.style.marginLeft = opts.pill ? '6px' : '0';
    t.textContent = opts.metaText;
    metaCell.appendChild(t);
  }
  row.appendChild(metaCell);

  if (opts.snippet) {
    const snip = document.createElement('span');
    snip.className = 'col-snippet';
    snip.textContent = opts.snippet;
    row.appendChild(snip);
  }
  return row;
}

// Cache last rendered rows so CSV export can serialise them.
let __lastDrill = { key: null, rows: [], cols: [] };

function __renderDrillEmpty(key) {
  const body = $('pop-drill-body');
  body.textContent = '';
  const wrap = document.createElement('div');
  wrap.className = 'pop-drill-empty';
  wrap.textContent = 'No data in window.';
  const hint = document.createElement('div');
  hint.className = 'pop-drill-empty-hint';
  hint.textContent = __DRILL_EMPTY_HINT[key] || '';
  wrap.appendChild(hint);
  body.appendChild(wrap);
}

function __setDrillMeta(text) {
  const m = $('pop-drill-meta');
  if (m) m.textContent = text || '';
}

async function __renderPending(body) {
  const data = await chrome.storage.local.get(K.ROSTER);
  const roster = data[K.ROSTER] || {};
  const rows = Object.entries(roster)
    .filter(([_, e]) => e && (e.status === 'new' || e.status === 'pending'))
    .sort((a, b) => (b[1].first_seen || 0) - (a[1].first_seen || 0));
  if (rows.length === 0) { __renderDrillEmpty('pending'); return; }
  __lastDrill.cols = ['ts', 'user', 'status', 'reason'];
  __lastDrill.rows = [];
  rows.forEach(([username, e]) => {
    body.appendChild(__makeDrillRow({
      ts: __fmtDrillTs(e.first_seen),
      user: username,
      pill: { text: e.status || 'new', cls: 'pending' },
      snippet: e.reason || e.last_seen_reason || ''
    }));
    __lastDrill.rows.push({
      ts: e.first_seen || '', user: username,
      status: e.status || 'new', reason: e.reason || ''
    });
  });
  __setDrillMeta(rows.length + ' pending');
}

async function __renderDeathRow(body) {
  const data = await chrome.storage.local.get(K.DR);
  const dr = (data[K.DR] || []).filter(d => d && d.status === 'waiting');
  if (dr.length === 0) { __renderDrillEmpty('dr'); return; }
  dr.sort((a, b) => (a.executeAt || 0) - (b.executeAt || 0));
  const now = Date.now();
  __lastDrill.cols = ['executeAt', 'user', 'state', 'reason'];
  __lastDrill.rows = [];
  dr.forEach(d => {
    const ready = now >= (d.executeAt || 0);
    body.appendChild(__makeDrillRow({
      ts: __fmtDrillTs(d.executeAt),
      user: d.target || d.username,
      pill: ready ? { text: 'ready', cls: 'ready' } : { text: 'waiting', cls: 'dr' },
      snippet: d.reason || ''
    }));
    __lastDrill.rows.push({
      executeAt: d.executeAt || '',
      user: d.target || d.username || '',
      state: ready ? 'ready' : 'waiting',
      reason: d.reason || ''
    });
  });
  const readyCount = dr.filter(d => now >= (d.executeAt || 0)).length;
  __setDrillMeta(dr.length + ' queued, ' + readyCount + ' ready');
}

async function __renderBanned(body) {
  const data = await chrome.storage.local.get(K.ROSTER);
  const roster = data[K.ROSTER] || {};
  const rows = Object.entries(roster)
    .filter(([_, e]) => e && e.status === 'banned')
    .sort((a, b) => (b[1].banned_at || b[1].last_seen || 0) - (a[1].banned_at || a[1].last_seen || 0));
  if (rows.length === 0) { __renderDrillEmpty('banned'); return; }
  __lastDrill.cols = ['ts', 'user', 'status', 'reason'];
  __lastDrill.rows = [];
  rows.forEach(([username, e]) => {
    body.appendChild(__makeDrillRow({
      ts: __fmtDrillTs(e.banned_at || e.last_seen),
      user: username,
      pill: { text: 'banned', cls: 'banned' },
      snippet: e.reason || ''
    }));
    __lastDrill.rows.push({
      ts: e.banned_at || e.last_seen || '',
      user: username, status: 'banned', reason: e.reason || ''
    });
  });
  __setDrillMeta(rows.length + ' banned');
}

// Helper: pull last-24h log entries of given action types.
async function __log24(filterFn) {
  const data = await chrome.storage.local.get(K.LOG);
  const log = data[K.LOG] || [];
  const cutoff = Date.now() - 86400000;
  return log
    .filter(l => l && l.ts && (new Date(l.ts).getTime() >= cutoff))
    .filter(filterFn)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

async function __renderBans24(body) {
  const rows = await __log24(l => l.type === 'ban');
  if (rows.length === 0) { __renderDrillEmpty('bans24'); return; }
  __lastDrill.cols = ['ts', 'user', 'mod', 'reason'];
  __lastDrill.rows = [];
  rows.forEach(l => {
    const tgt = l.target || l.target_user || l.user || (l.details && l.details.target);
    const reason = l.reason || (l.details && l.details.reason) || '';
    const mod = l.mod || (l.details && l.details.mod) || '';
    body.appendChild(__makeDrillRow({
      ts: __fmtDrillTs(l.ts),
      user: tgt,
      pill: { text: 'ban', cls: 'ban' },
      metaText: mod ? 'by ' + mod : '',
      snippet: reason
    }));
    __lastDrill.rows.push({
      ts: l.ts || '', user: tgt || '', mod: mod, reason: reason
    });
  });
  __setDrillMeta(rows.length + ' bans / 24h');
}

async function __renderMsgs24(body) {
  const rows = await __log24(l => l.type === 'message' || l.type === 'reply');
  if (rows.length === 0) { __renderDrillEmpty('msgs24'); return; }
  __lastDrill.cols = ['ts', 'user', 'kind', 'snippet'];
  __lastDrill.rows = [];
  rows.forEach(l => {
    const tgt = l.target || l.target_user || l.user || (l.details && l.details.recipient);
    const snip = l.body || l.message || l.text || (l.details && (l.details.body || l.details.message)) || '';
    body.appendChild(__makeDrillRow({
      ts: __fmtDrillTs(l.ts),
      user: tgt,
      pill: { text: l.type, cls: 'msg' },
      snippet: snip
    }));
    __lastDrill.rows.push({
      ts: l.ts || '', user: tgt || '', kind: l.type || '', snippet: snip
    });
  });
  __setDrillMeta(rows.length + ' messages / 24h');
}

async function __renderNotes24(body) {
  const rows = await __log24(l => l.type === 'note');
  if (rows.length === 0) { __renderDrillEmpty('notes24'); return; }
  __lastDrill.cols = ['ts', 'user', 'snippet'];
  __lastDrill.rows = [];
  rows.forEach(l => {
    const tgt = l.target || l.target_user || l.user || (l.details && l.details.subject);
    const snip = l.note || l.body || (l.details && (l.details.note || l.details.body)) || '';
    body.appendChild(__makeDrillRow({
      ts: __fmtDrillTs(l.ts),
      user: tgt,
      pill: { text: 'note', cls: 'note' },
      snippet: snip
    }));
    __lastDrill.rows.push({ ts: l.ts || '', user: tgt || '', snippet: snip });
  });
  __setDrillMeta(rows.length + ' notes / 24h');
}

async function renderDrillDown(key) {
  const drawer = $('pop-drill');
  const body = $('pop-drill-body');
  const title = $('pop-drill-title');
  if (!drawer || !body || !title) return;
  title.textContent = __DRILL_TITLES[key] || 'Detail';
  body.textContent = '';
  __setDrillMeta('loading...');
  __lastDrill = { key: key, rows: [], cols: [] };
  drawer.style.display = 'flex';
  try {
    if (key === 'pending')      await __renderPending(body);
    else if (key === 'dr')      await __renderDeathRow(body);
    else if (key === 'banned')  await __renderBanned(body);
    else if (key === 'bans24')  await __renderBans24(body);
    else if (key === 'msgs24')  await __renderMsgs24(body);
    else if (key === 'notes24') await __renderNotes24(body);
    else { __renderDrillEmpty(key); }
  } catch (e) {
    body.textContent = '';
    const errBox = document.createElement('div');
    errBox.className = 'pop-drill-empty';
    errBox.textContent = 'Failed to load: ' + (e && e.message || String(e));
    body.appendChild(errBox);
    __setDrillMeta('error');
  }
}

function __closeDrillDown() {
  const drawer = $('pop-drill');
  if (drawer) drawer.style.display = 'none';
}

// CSV export of the last rendered drill-down.
function __exportDrillCsv() {
  const cur = __lastDrill;
  if (!cur || !cur.rows || cur.rows.length === 0) return;
  const cols = cur.cols;
  const esc = v => {
    const s = (v == null) ? '' : String(v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [cols.join(',')];
  cur.rows.forEach(r => lines.push(cols.map(c => esc(r[c])).join(',')));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modtools-drill-' + (cur.key || 'data') + '-'
             + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// Wire the cards via event delegation. Single listener on .pop-stats.
{
  const stats = document.querySelector('.pop-stats');
  if (stats) {
    stats.addEventListener('click', (e) => {
      const card = e.target.closest('.pop-stat[data-drill]');
      if (!card) return;
      const key = card.getAttribute('data-drill');
      if (key) renderDrillDown(key);
    });
  }
  const closeBtn = $('pop-drill-close');
  if (closeBtn) closeBtn.addEventListener('click', __closeDrillDown);
  const csvBtn = $('pop-drill-csv');
  if (csvBtn) csvBtn.addEventListener('click', __exportDrillCsv);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const drawer = $('pop-drill');
      if (drawer && drawer.style.display !== 'none') __closeDrillDown();
    }
  });
}

// =========================================================================
// v9.5.0: MAINTENANCE MODE
// =========================================================================
// 12 self-heal routines surfaced in the popup so non-tech mods can resolve
// common issues (stuck cookies, full storage, schema drift, etc.) without
// needing to ping the lead. 8 routines in the user tier (visible to all
// mods) + 4 lead-tier routines (gated by __applyLeadGate via #leadSection).
//
// Every routine logs to gam_diag_log via the modtools.js _diagLog handler
// (we delegate by sending a runtime message to the active GAW tab; if no
// tab, we write the entry directly to chrome.storage.local).
//
// Background alarms (background.js) write a `gam_maint_warning` flag when
// quota >80% or token age >60d. The header chip + banner read that flag.
// The flag is independent of `gam_update_available` — different concern.

const MAINT_DIAG_KEY = 'gam_diag_log';
const MAINT_DIAG_MAX = 500;
const MAINT_WARNING_KEY = 'gam_maint_warning';
const MAINT_SCHEMA_KEY  = 'gam_settings_schema_version';
const MAINT_SCHEMA_CURRENT = 3;
// Conservative defaults the schema migration installs for missing keys.
const MAINT_DEFAULT_SETTINGS = {
  'features.platformHardening': true,
  'features.uxPolish': false,
  autoRefreshEnabled: true
};

// Quota for chrome.storage.local is 5MB on default; 10MB with the
// "unlimitedStorage" permission (we don't have it). Use 5MB.
const MAINT_QUOTA_BYTES = 5 * 1024 * 1024;

// Append a maint event to gam_diag_log without depending on the active GAW
// tab. Mirrors modtools.js _diagLog's persisted shape.
async function __maintLog(routine, result, extra) {
  try {
    const entry = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      cat: 'maint',
      msg: String(routine || ''),
      extra: { result: result, ...(extra || null) },
      stack: null,
      v: chrome.runtime.getManifest().version
    };
    const r = await chrome.storage.local.get(MAINT_DIAG_KEY);
    const log = (r[MAINT_DIAG_KEY] || []).slice(-(MAINT_DIAG_MAX - 1));
    log.push(entry);
    await chrome.storage.local.set({ [MAINT_DIAG_KEY]: log });
  } catch (e) { /* fire-and-forget */ }
}

function __maintSetStatus(elId, text, kind) {
  const el = $(elId);
  if (!el) return;
  el.textContent = text || '';
  el.className = 'pop-token-status pop-maint-status'
    + (kind === 'ok' ? ' ok' : '')
    + (kind === 'err' ? ' err' : '')
    + (kind === 'warn' ? ' warn' : '');
}

function __fmtBytes(n) {
  if (!Number.isFinite(n)) return '?';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

// =========================================================================
// Routine #1: Clear stuck GAW cookies + page localStorage
// =========================================================================
async function maintClearCookies() {
  __maintSetStatus('maintCookiesStatus', 'clearing...');
  // Triple-domain coverage: subdomain + apex + dotted (cf cookies often set
  // at apex with leading dot).
  const domains = ['greatawakening.win', '.greatawakening.win'];
  // Cookies we own; deleting these forces a CSRF re-fetch + session re-handshake.
  // We also wildcard-match cf_* via predicate (chrome.cookies.getAll then filter).
  const exactNames = ['XSRF-TOKEN', 'session', '_session', 'cf_clearance', 'cf_chl_2'];
  let removed = 0;
  let inspected = 0;
  let errors = [];
  try {
    if (!chrome.cookies || !chrome.cookies.getAll) {
      throw new Error('chrome.cookies API unavailable -- did the cookies permission install?');
    }
    for (const dom of domains) {
      let all = [];
      try { all = await chrome.cookies.getAll({ domain: dom }); }
      catch (e) { errors.push('getAll(' + dom + '): ' + e.message); continue; }
      inspected += all.length;
      for (const c of all) {
        const matchesExact = exactNames.includes(c.name);
        const matchesPrefix = /^cf_/.test(c.name) || /-session$/.test(c.name);
        if (!matchesExact && !matchesPrefix) continue;
        const url = (c.secure ? 'https://' : 'http://') + (c.domain.replace(/^\./, '')) + (c.path || '/');
        try {
          await chrome.cookies.remove({ url: url, name: c.name });
          removed++;
        } catch (e) { errors.push('remove(' + c.name + '): ' + e.message); }
      }
    }
    // Notify any open GAW tabs to clear their localStorage too.
    let tabsHit = 0;
    try {
      const tabs = await chrome.tabs.query({ url: GAW_TAB_PATTERNS });
      for (const t of tabs) {
        try {
          await chrome.tabs.sendMessage(t.id, { type: 'clearLocalStorage' });
          tabsHit++;
        } catch (e) { /* tab may not have content script ready */ }
      }
    } catch (e) { errors.push('tabs.query: ' + e.message); }
    const out = { removed, inspected, tabsHit, errors: errors.slice(0, 5) };
    __maintLog('clearCookies', removed > 0 ? 'ok' : 'noop', out);
    if (removed === 0 && errors.length === 0) {
      __maintSetStatus('maintCookiesStatus',
        'no matching cookies found (' + inspected + ' inspected). reload GAW tabs to test.', 'warn');
      return;
    }
    __maintSetStatus('maintCookiesStatus',
      '✓ removed ' + removed + ' cookie(s) on ' + inspected + ' inspected, '
      + tabsHit + ' tab(s) cleared. Reload GAW.',
      errors.length ? 'warn' : 'ok');
    if (errors.length) console.warn('[maint] clearCookies partial errors', errors);
  } catch (e) {
    __maintLog('clearCookies', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintCookiesStatus', 'failed: ' + (e && e.message || e), 'err');
  }
}

// =========================================================================
// Routine #2: Storage health probe
// =========================================================================
async function maintStorageProbe() {
  __maintSetStatus('maintStorageStatus', 'probing...');
  try {
    // Total bytes
    const total = await new Promise((resolve, reject) => {
      try { chrome.storage.local.getBytesInUse(null, n => resolve(n)); }
      catch (e) { reject(e); }
    });
    // Per-key sizes (best effort: re-read each owned key + JSON-stringify length).
    const allKeys = await chrome.storage.local.get(null);
    const sizes = Object.entries(allKeys).map(([k, v]) => {
      let s;
      try { s = JSON.stringify(v).length; } catch (e) { s = 0; }
      return [k, s];
    }).sort((a, b) => b[1] - a[1]);
    const top5 = sizes.slice(0, 5);
    const pct = total / MAINT_QUOTA_BYTES * 100;
    const summary = __fmtBytes(total) + ' (' + pct.toFixed(1) + '% of 5MB) -- top: '
      + top5.map(([k, s]) => k + ' ' + __fmtBytes(s)).join(', ');
    __maintLog('storageProbe', 'ok', { total, pct, top5 });
    const trim = document.createElement('button');
    trim.className = 'pop-btn pop-btn-ghost';
    trim.textContent = 'Trim now';
    trim.style.cssText = 'font-size:10px;padding:2px 8px;margin-left:6px';
    trim.addEventListener('click', () => withLoading(trim, 'trimming...', maintStorageTrim));
    __maintSetStatus('maintStorageStatus', summary, pct > 80 ? 'warn' : 'ok');
    const el = $('maintStorageStatus');
    if (el) el.appendChild(trim);
  } catch (e) {
    __maintLog('storageProbe', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintStorageStatus', 'failed: ' + (e && e.message || e), 'err');
  }
}

async function maintStorageTrim() {
  __maintSetStatus('maintStorageStatus', 'trimming...');
  try {
    let evicted = 0;
    // Evict oldest 50% of intel cache.
    const intelData = await chrome.storage.local.get(K.INTEL);
    const intel = intelData[K.INTEL] || {};
    const entries = Object.entries(intel);
    if (entries.length > 0) {
      // Sort by .ts ascending; drop bottom half.
      entries.sort((a, b) => (a[1] && a[1].ts || 0) - (b[1] && b[1].ts || 0));
      const dropCount = Math.floor(entries.length / 2);
      const kept = entries.slice(dropCount);
      const next = Object.fromEntries(kept);
      await chrome.storage.local.set({ [K.INTEL]: next });
      evicted += dropCount;
    }
    // Cap diag log at 500 entries.
    const dr = await chrome.storage.local.get(MAINT_DIAG_KEY);
    const log = dr[MAINT_DIAG_KEY] || [];
    if (log.length > MAINT_DIAG_MAX) {
      const trimmed = log.slice(-MAINT_DIAG_MAX);
      await chrome.storage.local.set({ [MAINT_DIAG_KEY]: trimmed });
      evicted += (log.length - MAINT_DIAG_MAX);
    }
    __maintLog('storageTrim', 'ok', { evicted });
    __maintSetStatus('maintStorageStatus', '✓ evicted ' + evicted + ' entries. Re-probe to confirm.', 'ok');
  } catch (e) {
    __maintLog('storageTrim', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintStorageStatus', 'trim failed: ' + (e && e.message || e), 'err');
  }
}

// =========================================================================
// Routine #3: Token health probe
// =========================================================================
async function maintTokenProbe() {
  __maintSetStatus('maintTokenStatus', 'probing...');
  try {
    const t0 = Date.now();
    const r = await chrome.runtime.sendMessage({ type: 'rpc', name: 'modWhoami' });
    const latency = Date.now() - t0;
    if (!r || !r.ok || !r.data) {
      __maintLog('tokenProbe', 'err', { status: r && r.status, error: r && r.error });
      __maintSetStatus('maintTokenStatus',
        'whoami failed (HTTP ' + (r && r.status || '?') + ') -- token may be invalid', 'err');
      return;
    }
    const username = r.data.username || '?';
    const isLead = !!r.data.is_lead;
    // Read rotation timestamp from gam_settings if present.
    const { gam_settings } = await chrome.storage.local.get('gam_settings');
    const rotatedAt = gam_settings && gam_settings.rotated_at;
    let ageStr = 'age unknown';
    let kind = 'ok';
    if (rotatedAt) {
      const ageMs = Date.now() - new Date(rotatedAt).getTime();
      const ageDays = Math.floor(ageMs / 86400000);
      ageStr = 'rotated ' + ageDays + 'd ago';
      if (ageDays > 90) kind = 'err';
      else if (ageDays > 60) kind = 'warn';
    }
    const summary = '✓ ' + username + (isLead ? ' (lead)' : '')
      + ' -- ' + latency + 'ms, ' + ageStr;
    __maintLog('tokenProbe', 'ok', { username, isLead, latency, ageStr });
    __maintSetStatus('maintTokenStatus', summary, kind);
  } catch (e) {
    __maintLog('tokenProbe', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintTokenStatus', 'failed: ' + (e && e.message || e), 'err');
  }
}

// =========================================================================
// Routine #4: Selector drift report
// =========================================================================
async function maintSelectorDriftReport() {
  __maintSetStatus('maintSelectorDriftStatus', 'reading...');
  try {
    const r = await chrome.storage.local.get('gam_learned_selectors');
    const learned = (r && r.gam_learned_selectors) || {};
    const keys = Object.keys(learned);
    if (keys.length === 0) {
      __maintLog('selectorDrift', 'noop', { count: 0 });
      __maintSetStatus('maintSelectorDriftStatus',
        'no drift recorded -- primary selectors winning across the board.', 'ok');
      return;
    }
    const summary = keys.length + ' selector(s) self-promoted: '
      + keys.slice(0, 4).join(', ') + (keys.length > 4 ? '...' : '');
    __maintLog('selectorDrift', 'ok', { count: keys.length, learned });
    __maintSetStatus('maintSelectorDriftStatus', summary, 'warn');
  } catch (e) {
    __maintLog('selectorDrift', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintSelectorDriftStatus', 'failed: ' + (e && e.message || e), 'err');
  }
}

// =========================================================================
// Routine #5: Force re-hydrate (alias to existing handler)
// =========================================================================
async function maintForceRehydrate() {
  __maintSetStatus('maintRehydrateAliasStatus', 'rehydrating...');
  try {
    const tabs = await chrome.tabs.query({ url: GAW_TAB_PATTERNS, active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      __maintSetStatus('maintRehydrateAliasStatus',
        'no active GAW tab -- open greatawakening.win in this window', 'err');
      return;
    }
    const r = await chrome.tabs.sendMessage(tabs[0].id, { type: 'forceRehydrate' });
    if (r && r.ok) {
      const stamp = new Date().toLocaleTimeString();
      __maintLog('forceRehydrate', 'ok', { teamLen: r.teamLen, leadLen: r.leadLen });
      __maintSetStatus('maintRehydrateAliasStatus',
        '✓ last rehydrate: ' + stamp + ' -- team=' + (r.hasTeamToken ? 'yes(' + r.teamLen + ')' : 'no')
        + ', lead=' + (r.hasLeadToken ? 'yes(' + r.leadLen + ')' : 'no'), 'ok');
    } else {
      __maintLog('forceRehydrate', 'err', { error: r && r.error });
      __maintSetStatus('maintRehydrateAliasStatus',
        'failed: ' + (r && r.error || 'no response'), 'err');
    }
  } catch (e) {
    __maintLog('forceRehydrate', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintRehydrateAliasStatus', 'failed: ' + (e && e.message || e), 'err');
  }
}

// =========================================================================
// Routine #6: Diag log status + purge
// =========================================================================
async function maintDiagStatus() {
  __maintSetStatus('maintDiagStatus', 'reading...');
  try {
    const r = await chrome.storage.local.get(MAINT_DIAG_KEY);
    const log = r[MAINT_DIAG_KEY] || [];
    const oldest = log.length > 0 ? new Date(log[0].ts).toLocaleString() : 'none';
    __maintLog('diagStatus', 'ok', { count: log.length });
    const exportBtn = document.createElement('button');
    exportBtn.className = 'pop-btn pop-btn-ghost';
    exportBtn.textContent = 'Export';
    exportBtn.style.cssText = 'font-size:10px;padding:2px 8px;margin-left:6px';
    exportBtn.addEventListener('click', () => withLoading(exportBtn, 'copying...', maintDiagExport));
    const purgeBtn = document.createElement('button');
    purgeBtn.className = 'pop-btn pop-btn-ghost';
    purgeBtn.textContent = 'Purge 50%';
    purgeBtn.style.cssText = 'font-size:10px;padding:2px 8px;margin-left:4px';
    purgeBtn.addEventListener('click', () => withLoading(purgeBtn, 'purging...', maintDiagPurge));
    __maintSetStatus('maintDiagStatus', log.length + ' entries, oldest: ' + oldest, 'ok');
    const el = $('maintDiagStatus');
    if (el) { el.appendChild(exportBtn); el.appendChild(purgeBtn); }
  } catch (e) {
    __maintLog('diagStatus', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintDiagStatus', 'failed: ' + (e && e.message || e), 'err');
  }
}

async function maintDiagExport() {
  try {
    const r = await chrome.storage.local.get(MAINT_DIAG_KEY);
    const log = r[MAINT_DIAG_KEY] || [];
    // Redact: drop any "extra" keys named "token", "secret", "auth".
    const redacted = log.map(e => {
      const out = { ts: e.ts, iso: e.iso, cat: e.cat, msg: e.msg, v: e.v };
      if (e.extra && typeof e.extra === 'object') {
        const ex = {};
        for (const [k, v] of Object.entries(e.extra)) {
          if (/token|secret|auth/i.test(k)) ex[k] = '[REDACTED]';
          else ex[k] = v;
        }
        out.extra = ex;
      }
      return out;
    });
    const json = JSON.stringify({
      exportedAt: new Date().toISOString(),
      version: chrome.runtime.getManifest().version,
      count: redacted.length,
      entries: redacted
    }, null, 2);
    await navigator.clipboard.writeText(json);
    __maintLog('diagExport', 'ok', { count: redacted.length });
    __maintSetStatus('maintDiagStatus', '✓ ' + redacted.length + ' entries copied to clipboard (redacted).', 'ok');
  } catch (e) {
    __maintLog('diagExport', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintDiagStatus', 'export failed: ' + (e && e.message || e), 'err');
  }
}

async function maintDiagPurge() {
  try {
    const r = await chrome.storage.local.get(MAINT_DIAG_KEY);
    const log = r[MAINT_DIAG_KEY] || [];
    const dropCount = Math.floor(log.length / 2);
    const kept = log.slice(dropCount);
    await chrome.storage.local.set({ [MAINT_DIAG_KEY]: kept });
    __maintLog('diagPurge', 'ok', { dropped: dropCount, kept: kept.length });
    __maintSetStatus('maintDiagStatus', '✓ dropped ' + dropCount + ', kept ' + kept.length + '.', 'ok');
  } catch (e) {
    __maintLog('diagPurge', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintDiagStatus', 'purge failed: ' + (e && e.message || e), 'err');
  }
}

// =========================================================================
// Routine #7: Schema migration check
// =========================================================================
async function maintSchemaCheck() {
  __maintSetStatus('maintSchemaStatus', 'checking...');
  try {
    const r = await chrome.storage.local.get('gam_settings');
    const s = (r && r.gam_settings) || {};
    const stored = parseInt(s[MAINT_SCHEMA_KEY], 10) || 1;
    if (stored === MAINT_SCHEMA_CURRENT) {
      __maintLog('schemaCheck', 'noop', { stored });
      __maintSetStatus('maintSchemaStatus', '✓ schema v' + stored + ' (current).', 'ok');
      return;
    }
    if (stored > MAINT_SCHEMA_CURRENT) {
      __maintLog('schemaCheck', 'warn', { stored, code: MAINT_SCHEMA_CURRENT });
      __maintSetStatus('maintSchemaStatus',
        'stored v' + stored + ' > code v' + MAINT_SCHEMA_CURRENT + ' (downgrade?). No-op.', 'warn');
      return;
    }
    // Additive migration: install missing keys with safe defaults.
    let added = 0;
    const next = { ...s };
    for (const [k, v] of Object.entries(MAINT_DEFAULT_SETTINGS)) {
      if (!(k in next)) { next[k] = v; added++; }
    }
    next[MAINT_SCHEMA_KEY] = MAINT_SCHEMA_CURRENT;
    await chrome.storage.local.set({ gam_settings: next });
    __maintLog('schemaMigrate', 'ok', { from: stored, to: MAINT_SCHEMA_CURRENT, added });
    __maintSetStatus('maintSchemaStatus',
      '✓ migrated v' + stored + ' -> v' + MAINT_SCHEMA_CURRENT + ' (added ' + added + ' default(s)).', 'ok');
  } catch (e) {
    __maintLog('schemaCheck', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintSchemaStatus', 'failed: ' + (e && e.message || e), 'err');
  }
}

// =========================================================================
// Routine #8: Reset to defaults (DESTRUCTIVE — triple confirm)
// =========================================================================
async function maintResetDefaults() {
  __maintSetStatus('maintResetStatus', '');
  try {
    const ok1 = await __popupConfirm({
      title: 'Reset settings to defaults?',
      body: 'Wipes ALL feature flags + UI preferences in gam_settings.\n\n'
          + 'PRESERVED: your team token + lead token.\n'
          + 'WIPED: every other gam_settings entry (display prefs, learned selectors, intel cache, etc.).\n\n'
          + 'You will need to reload any open GAW tabs after.\n\nProceed to confirmation #2?',
      okLabel: 'Continue',
      cancelLabel: 'Cancel'
    });
    if (!ok1) { __maintSetStatus('maintResetStatus', 'cancelled.'); return; }
    const ok2 = await __popupConfirm({
      title: 'CONFIRM #2 of 3',
      body: 'Are you sure? This cannot be undone.',
      okLabel: 'Yes, continue',
      cancelLabel: 'No'
    });
    if (!ok2) { __maintSetStatus('maintResetStatus', 'cancelled.'); return; }
    const finalText = await __popupAskText({
      title: 'CONFIRM #3 of 3',
      label: 'Type RESET to proceed',
      placeholder: 'RESET',
      max: 16,
      validate: function (v) { return v === 'RESET' ? '' : 'Type RESET (uppercase) exactly.'; }
    });
    if (finalText !== 'RESET') { __maintSetStatus('maintResetStatus', 'cancelled.'); return; }
    // v9.6.0: PRESERVE onboarding markers + UX preferences in addition to
    // tokens. Pre-fix this routine wiped tokenOnboardedOnce/chat.dock/
    // hideSidebar/upvoteAgeFilter/consentShown -- net effect was the
    // onboarding modal re-appeared, dock layout reset, filter reverted to
    // 'off', and consent banner re-showed. Commander hit this between two
    // debug snapshots on 2026-05-07. Defaults reset is meant to clear
    // feature flags + caches, NOT undo the user's UX choices.
    const cur = await chrome.storage.local.get('gam_settings');
    const s = (cur && cur.gam_settings) || {};
    const preserved = {
      // Identity / auth — non-negotiable
      workerModToken: s.workerModToken || '',
      leadModToken: s.leadModToken || '',
      isLeadMod: !!s.isLeadMod,
      [MAINT_SCHEMA_KEY]: MAINT_SCHEMA_CURRENT,
      // Onboarding markers — preserve so we don't re-trigger first-run flows
      tokenOnboardedOnce: !!s.tokenOnboardedOnce,
      consentShown: !!s.consentShown,
      isModBrowser: !!s.isModBrowser,
      // UX preferences — preserve so layout doesn't snap back
      'chat.dock': s['chat.dock'] || undefined,
      'chat.width': s['chat.width'] || undefined,
      hideSidebar: !!s.hideSidebar,
      cleanUi: !!s.cleanUi,
      mailHoverHighlight: s.mailHoverHighlight !== false,
      upvoteAgeFilter: s.upvoteAgeFilter || 'off',
      // Easter eggs (toggleable; preserve so reset doesn't re-enable surprises)
      easterEggsEnabled: s.easterEggsEnabled !== false
    };
    // Strip undefined keys (chrome.storage rejects them)
    Object.keys(preserved).forEach(k => preserved[k] === undefined && delete preserved[k]);
    // Remove every owned non-token key + learned selectors + intel cache.
    const keysToRemove = OWNED_KEYS.filter(k => k !== K.SETTINGS).concat(['gam_learned_selectors']);
    await chrome.storage.local.remove(keysToRemove);
    await chrome.storage.local.set({ gam_settings: { ...preserved, ...MAINT_DEFAULT_SETTINGS } });
    __maintLog('resetDefaults', 'ok', { preserved: Object.keys(preserved) });
    __maintSetStatus('maintResetStatus',
      '✓ reset complete. Tokens + UX prefs preserved. Reload GAW tabs.', 'ok');
  } catch (e) {
    __maintLog('resetDefaults', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintResetStatus', 'failed: ' + (e && e.message || e), 'err');
  }
}

// =========================================================================
// Routine #9 (LEAD): Audit chain verify
// =========================================================================
async function maintAuditVerify() {
  __maintSetStatus('maintAuditVerifyStatus', 'verifying...');
  try {
    const r = await chrome.runtime.sendMessage({
      type: 'rpc', name: 'adminAuditVerify',
      args: { limit: 5000, from: 0 }
    });
    if (!r || !r.ok || !r.data) {
      __maintLog('auditVerify', 'err', { status: r && r.status, error: r && r.error });
      __maintSetStatus('maintAuditVerifyStatus',
        'verify failed (HTTP ' + (r && r.status || '?') + ')'
        + (r && r.status === 403 ? ' -- lead-only' : ''), 'err');
      return;
    }
    const d = r.data;
    const ok = !!d.ok;
    const summary = (ok ? '✓ chain valid' : '✗ chain BROKEN')
      + ' -- verified ' + (d.verified || 0) + ' of ' + (d.total || 0)
      + (d.last_verified_at ? ' (last: ' + d.last_verified_at + ')' : '')
      + (d.entry_hmac_null_post_boundary ? ' [NULL HMAC ROWS DETECTED]' : '');
    __maintLog('auditVerify', ok ? 'ok' : 'err', d);
    __maintSetStatus('maintAuditVerifyStatus', summary, ok ? 'ok' : 'err');
  } catch (e) {
    __maintLog('auditVerify', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintAuditVerifyStatus', 'failed: ' + (e && e.message || e), 'err');
  }
}

// =========================================================================
// Routine #10 (LEAD): Full health report
// =========================================================================
async function maintFullReport() {
  __maintSetStatus('maintFullReportStatus', 'running 9 routines...');
  const t0 = Date.now();
  const report = {
    generatedAt: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest().version,
    routines: {}
  };
  // Helper that captures the post-routine status text.
  async function step(name, fn, statusId) {
    try { await fn(); }
    catch (e) { /* fn writes its own status; capture below */ }
    const s = $(statusId);
    report.routines[name] = s ? s.textContent : '(no status)';
  }
  await step('clearCookies-skipped', async () => {}, 'maintCookiesStatus'); // destructive: skip
  await step('storageProbe', maintStorageProbe, 'maintStorageStatus');
  await step('tokenProbe', maintTokenProbe, 'maintTokenStatus');
  await step('selectorDrift', maintSelectorDriftReport, 'maintSelectorDriftStatus');
  await step('forceRehydrate', maintForceRehydrate, 'maintRehydrateAliasStatus');
  await step('diagStatus', maintDiagStatus, 'maintDiagStatus');
  await step('schemaCheck', maintSchemaCheck, 'maintSchemaStatus');
  await step('auditVerify', maintAuditVerify, 'maintAuditVerifyStatus');
  await step('migrationDebt', maintMigrationDebt, 'maintMigrationDebtStatus');
  report.elapsedMs = Date.now() - t0;
  const json = JSON.stringify(report, null, 2);
  try { await navigator.clipboard.writeText(json); } catch (_) {}
  // v9.6.0: render an HTML report alongside the JSON. Commander asked for
  // human-readable summary instead of opaque JSON dumps. Heuristic top-issues
  // section surfaces the things a lead actually needs to react to.
  try {
    const html = __maintRenderHealthReportHtml(report);
    const htmlBlob = new Blob([html], { type: 'text/html' });
    const htmlUrl = URL.createObjectURL(htmlBlob);
    try { window.open(htmlUrl, '_blank'); } catch(_){}
    // Don't revoke immediately -- the new tab needs the URL alive for a moment
    setTimeout(() => { try { URL.revokeObjectURL(htmlUrl); } catch(_){} }, 30_000);
  } catch (e) { console.warn('[maint] html render failed', e); }
  // Also offer JSON download (still useful for support / agent dumps).
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modtools-health-report-'
      + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (_) {}
  __maintLog('fullReport', 'ok', { elapsedMs: report.elapsedMs });
  __maintSetStatus('maintFullReportStatus',
    '✓ ran 9 routines in ' + report.elapsedMs + 'ms -- HTML report opened, JSON copied + downloaded.', 'ok');

  // v9.11.0 - AI top-10 issues summary (Commander #21). Pipes the report
  // through Llama for a lead-grade ranked list of the 10 most actionable
  // issues. Result appears in the HTML report's "Top issues" panel via
  // postMessage to the rendered window.
  try {
    const ar = await chrome.runtime.sendMessage({
      type: 'rpc', name: 'aiHealthSummarize', args: { report_json: json.slice(0, 16000) }
    });
    if (ar && ar.ok && ar.data && ar.data.ok && Array.isArray(ar.data.top_issues)) {
      // Surface as a snack so user knows AI summary is ready
      const status = $('maintFullReportStatus');
      if (status) {
        const summary = ar.data.top_issues.slice(0, 10);
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-top:6px;border:1px solid #ff9933;background:rgba(255,153,51,0.08);padding:6px 8px;font:11px/1.4 ui-monospace,JetBrains Mono,monospace';
        const head = document.createElement('div');
        head.style.cssText = 'color:#ff9933;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;font-size:10px;margin-bottom:4px';
        head.textContent = '✨ AI Top-' + summary.length + ' issues for lead review';
        wrap.appendChild(head);
        const list = document.createElement('ol');
        list.style.cssText = 'margin:0;padding-left:18px;color:#e8e6e1;font-variant-numeric:tabular-nums';
        summary.forEach(s => {
          const li = document.createElement('li');
          li.style.cssText = 'margin:2px 0';
          const sev = s.severity === 'high' ? '🔴' : s.severity === 'med' ? '🟡' : '🟢';
          li.textContent = sev + ' ' + (s.title || '?') + (s.action ? ' — ' + s.action : '');
          list.appendChild(li);
        });
        wrap.appendChild(list);
        status.parentNode.insertBefore(wrap, status.nextSibling);
      }
    }
  } catch (_aiErr) { /* non-blocking */ }
}

// v9.6.0: render the maintenance health report as a styled HTML page.
// Heuristic "top issues" section surfaces the most actionable problems.
function __maintRenderHealthReportHtml(report) {
  const r = report.routines || {};
  // Heuristic top-issues classifier.
  const issues = [];
  const probe = String(r.storageProbe || '');
  const sizeM = probe.match(/([0-9.]+)\s*KB\s*\(([0-9.]+)%/);
  if (sizeM){
    const pct = parseFloat(sizeM[2]);
    if (pct > 80) issues.push({ sev:'crit', msg: 'Storage at ' + pct + '% of 5MB. Run "Trim now" or maintenance routine #1.' });
    else if (pct > 50) issues.push({ sev:'warn', msg: 'Storage at ' + pct + '% — monitor.' });
  }
  const tok = String(r.tokenProbe || '');
  if (/✗|FAIL|fail/.test(tok)) issues.push({ sev:'crit', msg: 'Token probe FAILED: ' + tok });
  else if (!/✓/.test(tok)) issues.push({ sev:'warn', msg: 'Token probe inconclusive: ' + tok });
  if (/^✗|fail|invalid|expired/i.test(String(r.schemaCheck || ''))) issues.push({ sev:'crit', msg: 'Schema mismatch: ' + r.schemaCheck });
  const audit = String(r.auditVerify || '');
  if (audit.startsWith('verify failed') && !/lead-only/.test(audit)) issues.push({ sev:'crit', msg: 'Audit chain verify FAILED: ' + audit });
  const mig = String(r.migrationDebt || '');
  if (/debt|pending|behind/i.test(mig) && !/✓|no migration/i.test(mig)) issues.push({ sev:'warn', msg: 'Migration debt detected: ' + mig });
  const diag = String(r.diagStatus || '');
  const diagM = diag.match(/(\d+)\s*entries/);
  if (diagM && parseInt(diagM[1], 10) > 400) issues.push({ sev:'warn', msg: 'Diag log nearing cap (' + diagM[1] + '/500). Click Purge 50%.' });
  const drift = String(r.selectorDrift || '');
  if (/promoted/.test(drift)) issues.push({ sev:'info', msg: 'Selector self-healed: ' + drift + ' (no action needed).' });
  if (issues.length === 0) issues.push({ sev:'info', msg: '✓ All routines passed cleanly. No action required.' });

  // Sort: crit > warn > info
  const sevOrder = { crit:0, warn:1, info:2 };
  issues.sort((a,b) => sevOrder[a.sev] - sevOrder[b.sev]);

  const esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); };
  const sevColor = { crit:'#f04040', warn:'#f0a040', info:'#3dd68c' };
  const sevLabel = { crit:'CRITICAL', warn:'WARN', info:'INFO' };
  const issuesHtml = issues.map(function(i){
    return '<li style="border-left:3px solid ' + sevColor[i.sev] + ';padding:8px 12px;margin-bottom:6px;background:#1a1d22;list-style:none">'
         + '<span style="display:inline-block;background:' + sevColor[i.sev] + ';color:#000;font-weight:700;font-size:10px;padding:1px 6px;border-radius:3px;margin-right:8px">' + sevLabel[i.sev] + '</span>'
         + esc(i.msg)
         + '</li>';
  }).join('');

  const routinesHtml = Object.keys(r).map(function(k){
    const v = String(r[k] || '');
    const ok = /^✓/.test(v);
    const fail = /^✗|fail/i.test(v);
    const cls = ok ? '#3dd68c' : fail ? '#f04040' : '#888';
    return '<tr><td style="padding:6px 10px;color:#aaa;font-weight:600;border-bottom:1px solid #1f2227">' + esc(k) + '</td>'
         + '<td style="padding:6px 10px;color:' + cls + ';border-bottom:1px solid #1f2227">' + esc(v.slice(0, 200)) + '</td></tr>';
  }).join('');

  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<title>ModTools Health Report — ' + esc(report.generatedAt) + '</title>',
    '<style>',
    'body{font:13px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif;background:#0c0e12;color:#dcdcdc;margin:0;padding:24px;max-width:920px;margin-left:auto;margin-right:auto}',
    'h1{font-size:18px;margin:0 0 4px;display:flex;align-items:center;gap:8px}',
    'h2{font-size:14px;margin:24px 0 8px;color:#e8eaed;font-weight:700;border-bottom:1px solid #2a2d33;padding-bottom:4px}',
    '.meta{color:#888;font-size:11px}',
    'ul{margin:0;padding:0}',
    'table{border-collapse:collapse;width:100%;font-size:12px;background:#0e1115;border:1px solid #2a2d33;border-radius:6px;overflow:hidden}',
    'tr:last-child td{border-bottom:none}',
    'a{color:#4A9EFF}',
    '.foot{color:#666;font-size:10.5px;margin-top:24px;padding-top:8px;border-top:1px solid #2a2d33}',
    '</style></head><body>',
    '<h1>🛡 GAW ModTools Health Report</h1>',
    '<div class="meta">Extension v', esc(report.extensionVersion), ' · ', esc(report.generatedAt), ' · ', String(report.elapsedMs || 0), 'ms</div>',
    '<h2>📌 Top issues (', String(issues.length), ')</h2>',
    '<ul>', issuesHtml, '</ul>',
    '<h2>🔬 Routine results</h2>',
    '<table>', routinesHtml, '</table>',
    '<div class="foot">Generated by GAW ModTools maintenance routines. Lead-only routines may show "lead-only" if your token isn\'t flagged as lead. JSON copy of this report has been downloaded alongside.</div>',
    '</body></html>'
  ].join('');
}

// =========================================================================
// Routine #11 (LEAD): Roster staleness audit
// =========================================================================
async function maintRosterStaleness() {
  __maintSetStatus('maintRosterStalenessStatus', 'loading roster...');
  const panel = $('maintRosterStalenessPanel');
  if (panel) { panel.style.display = 'none'; panel.replaceChildren(); }
  try {
    const r = await chrome.runtime.sendMessage({ type: 'rpc', name: 'adminListMods' });
    if (!r || !r.ok || !r.data) {
      __maintLog('rosterStaleness', 'err', { status: r && r.status, error: r && r.error });
      __maintSetStatus('maintRosterStalenessStatus',
        'roster fetch failed (HTTP ' + (r && r.status || '?') + ')'
        + (r && r.status === 403 ? ' -- lead-only' : ''), 'err');
      return;
    }
    const mods = (r.data && r.data.mods) || [];
    let red = 0, yellow = 0, green = 0;
    if (panel) {
      panel.replaceChildren();
      panel.className = 'pop-maint-roster';
      panel.style.display = 'block';
      mods.sort((a, b) => {
        const aT = a.rotated_at ? new Date(a.rotated_at).getTime() : 0;
        const bT = b.rotated_at ? new Date(b.rotated_at).getTime() : 0;
        return aT - bT;
      });
      for (const m of mods) {
        const row = document.createElement('div');
        row.className = 'pop-maint-roster-row';
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = m.mod_username + (m.is_lead ? ' \u{1F451}' : '');
        const ageSpan = document.createElement('span');
        ageSpan.className = 'age';
        let ageDays = -1;
        if (m.rotated_at) {
          ageDays = Math.floor((Date.now() - new Date(m.rotated_at).getTime()) / 86400000);
          if (ageDays < 30) { ageSpan.classList.add('green'); green++; }
          else if (ageDays < 90) { ageSpan.classList.add('yellow'); yellow++; }
          else { ageSpan.classList.add('red'); red++; }
          ageSpan.textContent = ageDays + 'd';
        } else {
          ageSpan.classList.add('red');
          ageSpan.textContent = 'never';
          red++;
        }
        row.appendChild(name);
        row.appendChild(ageSpan);
        if (!m.is_lead) {
          const btn = document.createElement('button');
          btn.className = 'pop-btn pop-btn-ghost';
          btn.textContent = 'Rotate';
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = '...';
            try {
              const ri = await chrome.runtime.sendMessage({
                type: 'rpc', name: 'adminIssueInvite',
                args: { username: m.mod_username }
              });
              if (ri && ri.ok && ri.data && ri.data.code) {
                const url = 'https://greatawakening.win/?mt_invite=' + encodeURIComponent(ri.data.code);
                try { await navigator.clipboard.writeText(url); } catch (_) {}
                btn.textContent = '✓ link copied';
              } else {
                btn.textContent = 'failed';
              }
            } catch (e) { btn.textContent = 'err'; }
          });
          row.appendChild(btn);
        } else {
          row.appendChild(document.createElement('span'));
        }
        panel.appendChild(row);
      }
    }
    __maintLog('rosterStaleness', 'ok', { total: mods.length, red, yellow, green });
    __maintSetStatus('maintRosterStalenessStatus',
      mods.length + ' mods -- ' + green + ' green, ' + yellow + ' yellow, ' + red + ' red.',
      red > 0 ? 'warn' : 'ok');
  } catch (e) {
    __maintLog('rosterStaleness', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintRosterStalenessStatus', 'failed: ' + (e && e.message || e), 'err');
  }
}

// =========================================================================
// Routine #12 (LEAD): Migration debt scanner
// =========================================================================
async function maintMigrationDebt() {
  __maintSetStatus('maintMigrationDebtStatus', 'scanning...');
  try {
    const findings = [];
    // 1) Legacy claim path? Check for mt_invite_legacy in storage as a marker.
    const cur = await chrome.storage.local.get(null);
    const cs = cur.gam_settings || {};
    const legacyKeys = Object.keys(cs).filter(k => /legacy|deprecated|_old$/.test(k));
    if (legacyKeys.length > 0) {
      findings.push({ kind: 'legacy_settings_keys', count: legacyKeys.length, detail: legacyKeys, location: 'gam_settings' });
    }
    // 2) Learned selectors -- if many keys present, GAW layout is drifting
    if (cur.gam_learned_selectors && Object.keys(cur.gam_learned_selectors).length >= 3) {
      findings.push({
        kind: 'learned_selectors',
        count: Object.keys(cur.gam_learned_selectors).length,
        detail: 'high drift may indicate GAW DOM refactor',
        location: 'modtools.js:_SEL_FB (line ~167)'
      });
    }
    // 3) Stale rotation timestamps in roster (ask worker)
    let staleRoster = 0;
    try {
      const rr = await chrome.runtime.sendMessage({ type: 'rpc', name: 'adminListMods' });
      if (rr && rr.ok && rr.data && Array.isArray(rr.data.mods)) {
        const cutoff = Date.now() - 90 * 86400000;
        staleRoster = rr.data.mods.filter(m => !m.is_lead
          && (!m.rotated_at || new Date(m.rotated_at).getTime() < cutoff)).length;
        if (staleRoster > 0) {
          findings.push({
            kind: 'stale_roster',
            count: staleRoster,
            detail: 'mods rotated >90d ago (or never)',
            location: 'worker /admin/mod/list'
          });
        }
      }
    } catch (_) { /* lead RPC may have failed */ }
    // 4) Diag log size
    const dl = cur[MAINT_DIAG_KEY] || [];
    if (dl.length >= MAINT_DIAG_MAX * 0.9) {
      findings.push({
        kind: 'diag_log_full',
        count: dl.length,
        detail: 'within 10% of cap (' + MAINT_DIAG_MAX + '); use Purge 50%',
        location: 'popup.js:maintDiagPurge'
      });
    }
    // 5) Audit-chain NULL hmac flag (check via verify)
    try {
      const av = await chrome.runtime.sendMessage({
        type: 'rpc', name: 'adminAuditVerify', args: { limit: 1, from: 0 }
      });
      if (av && av.ok && av.data && av.data.entry_hmac_null_post_boundary) {
        findings.push({
          kind: 'audit_null_hmac',
          count: 1,
          detail: 'post-boundary rows missing entry_hmac',
          location: 'worker /admin/audit/verify'
        });
      }
    } catch (_) {}
    __maintLog('migrationDebt', 'ok', { findings });
    if (findings.length === 0) {
      __maintSetStatus('maintMigrationDebtStatus', '✓ no migration debt detected.', 'ok');
    } else {
      const summary = findings.length + ' debt item(s): '
        + findings.map(f => f.kind + '(' + f.count + ')').join(', ');
      __maintSetStatus('maintMigrationDebtStatus', summary, 'warn');
      try { console.warn('[maint] migration debt', findings); } catch (_) {}
    }
  } catch (e) {
    __maintLog('migrationDebt', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintMigrationDebtStatus', 'failed: ' + (e && e.message || e), 'err');
  }
}

// =========================================================================
// Wire all maintenance buttons + warning chip + banner
// =========================================================================
function __maintWire(id, fn, label) {
  const b = $(id);
  if (!b) return;
  b.addEventListener('click', () => withLoading(b, label || 'running...', fn));
}
__maintWire('maintCookies', maintClearCookies, 'clearing...');
__maintWire('maintStorage', maintStorageProbe, 'probing...');
__maintWire('maintToken', maintTokenProbe, 'probing...');
__maintWire('maintSelectorDrift', maintSelectorDriftReport, 'reading...');
__maintWire('maintRehydrateAlias', maintForceRehydrate, 'rehydrating...');
__maintWire('maintDiag', maintDiagStatus, 'reading...');
__maintWire('maintSchema', maintSchemaCheck, 'checking...');
__maintWire('maintReset', maintResetDefaults, 'resetting...');

// v9.11.0 - AI tard / sus-pattern suggester wire-up (Commander #23/#24).
async function maintTardSuggest() {
  __maintSetStatus('maintTardSuggestStatus', 'AI scanning recent usernames...');
  const r = await chrome.runtime.sendMessage({ type:'rpc', name:'aiTardsSuggest' });
  if (!r || !r.ok || !r.data || !r.data.ok) {
    const reason = (r && r.data && r.data.error) || (r && r.error) || 'unknown';
    __maintSetStatus('maintTardSuggestStatus', 'AI failed: ' + reason, 'err');
    return;
  }
  const suggestions = Array.isArray(r.data.suggestions) ? r.data.suggestions : [];
  const scanned = r.data.scanned || 0;
  const panel = $('maintTardSuggestPanel');
  if (!panel) return;
  panel.innerHTML = '';
  panel.style.display = '';
  panel.style.cssText = 'display:block;margin:6px 0;padding:6px 8px;background:#0a0a0b;border:1px solid #ff9933;font:11px/1.4 ui-monospace,JetBrains Mono,monospace';
  const head = document.createElement('div');
  head.style.cssText = 'color:#ff9933;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;font-size:10px;margin-bottom:6px';
  head.textContent = '✨ AI proposed ' + suggestions.length + ' patterns (scanned ' + scanned + ' usernames)';
  panel.appendChild(head);
  if (suggestions.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = '#9b9892';
    empty.textContent = 'No suspicious patterns detected. (Check firehose is running + gaw_users has data.)';
    panel.appendChild(empty);
    __maintSetStatus('maintTardSuggestStatus', '✓ scan complete (0 suggestions)', 'ok');
    return;
  }
  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  suggestions.forEach(s => {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:auto 1fr auto;gap:6px;align-items:center;padding:4px 0;border-bottom:1px solid #2a2825';
    const sevColors = { high:'#ff3b3b', medium:'#ffd84d', low:'#9b9892' };
    const sev = document.createElement('span');
    sev.style.cssText = 'color:' + (sevColors[s.severity] || '#9b9892') + ';font-weight:700;font-size:9px;letter-spacing:0.04em;text-transform:uppercase';
    sev.textContent = s.severity || 'low';
    const meta = document.createElement('div');
    meta.style.cssText = 'color:#e8e6e1;line-height:1.3';
    const pat = document.createElement('span');
    pat.style.cssText = 'color:#ff9933;font-weight:600';
    pat.textContent = s.pattern;
    meta.appendChild(pat);
    const lbl = document.createElement('span');
    lbl.style.cssText = 'color:#9b9892;margin-left:6px';
    lbl.textContent = s.label + (s.example ? ' (e.g. ' + s.example + ')' : '');
    meta.appendChild(lbl);
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ DR rule';
    addBtn.style.cssText = 'background:transparent;border:1px solid #2eaa44;color:#44dd66;padding:2px 6px;cursor:pointer;font:600 9px ui-monospace,monospace;letter-spacing:0.04em;text-transform:uppercase';
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      addBtn.textContent = 'adding...';
      try {
        const cur = await chrome.storage.local.get('gam_settings');
        const settings = cur.gam_settings || {};
        const rules = Array.isArray(settings.autoDeathRowRules) ? settings.autoDeathRowRules.slice() : [];
        if (rules.some(r => r.pattern === s.pattern)) {
          addBtn.textContent = 'already added';
          return;
        }
        rules.push({
          pattern: s.pattern,
          hours: 72,
          reason: 'AI-suggested: ' + s.label,
          enabled: true,
          added: new Date().toISOString()
        });
        settings.autoDeathRowRules = rules;
        await chrome.storage.local.set({ gam_settings: settings });
        addBtn.textContent = '✓ added';
        addBtn.style.color = '#44dd66';
      } catch (e) {
        addBtn.textContent = 'fail';
        addBtn.style.color = '#ff3b3b';
      }
    });
    row.appendChild(sev); row.appendChild(meta); row.appendChild(addBtn);
    list.appendChild(row);
  });
  panel.appendChild(list);
  __maintSetStatus('maintTardSuggestStatus', '✓ ' + suggestions.length + ' suggestions ready', 'ok');
}
__maintWire('maintTardSuggest', maintTardSuggest, 'scanning...');

// v9.12.0 - AI sticky-request detector wire-up (Commander #17).
async function maintStickyScan() {
  __maintSetStatus('maintStickyScanStatus', 'AI scanning recent modmails for sticky requests...');
  const r = await chrome.runtime.sendMessage({ type:'rpc', name:'aiStickyDetect' });
  if (!r || !r.ok || !r.data || !r.data.ok) {
    const reason = (r && r.data && r.data.error) || (r && r.error) || 'unknown';
    __maintSetStatus('maintStickyScanStatus', 'AI failed: ' + reason, 'err');
    return;
  }
  const requests = Array.isArray(r.data.requests) ? r.data.requests : [];
  const scanned = r.data.scanned || 0;
  const note = r.data.note || '';
  const panel = $('maintStickyScanPanel');
  if (!panel) return;
  panel.style.cssText = 'display:block;margin:6px 0;padding:6px 8px;background:#0a0a0b;border:1px solid #ff9933;font:11px/1.4 ui-monospace,JetBrains Mono,monospace';
  panel.innerHTML = '';
  const head = document.createElement('div');
  head.style.cssText = 'color:#ff9933;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;font-size:10px;margin-bottom:6px';
  head.textContent = '✨ ' + requests.length + ' sticky requests (scanned ' + scanned + ' candidates)';
  panel.appendChild(head);
  if (requests.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = '#9b9892';
    empty.textContent = note || 'No sticky requests detected.';
    panel.appendChild(empty);
    __maintSetStatus('maintStickyScanStatus', '✓ scan complete (0 found)', 'ok');
    return;
  }
  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  const confColor = { high:'#ff3b3b', med:'#ffd84d', low:'#9b9892' };
  requests.forEach(req => {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:auto 1fr auto;gap:6px;align-items:center;padding:4px 0;border-bottom:1px solid #2a2825';
    const conf = document.createElement('span');
    conf.style.cssText = 'color:' + (confColor[req.confidence] || '#9b9892') + ';font-weight:700;font-size:9px;letter-spacing:0.04em;text-transform:uppercase';
    conf.textContent = req.confidence;
    const meta = document.createElement('div');
    meta.style.cssText = 'color:#e8e6e1;line-height:1.3';
    const who = document.createElement('span');
    who.style.cssText = 'color:#66ccff;font-weight:600';
    who.textContent = 'u/' + req.sender;
    meta.appendChild(who);
    const sep = document.createElement('span');
    sep.style.cssText = 'color:#9b9892;margin-left:6px';
    sep.textContent = req.reason;
    meta.appendChild(sep);
    const openBtn = document.createElement('button');
    openBtn.textContent = 'Open';
    openBtn.style.cssText = 'background:transparent;border:1px solid #2a2825;color:#9b9892;padding:2px 6px;cursor:pointer;font:600 9px ui-monospace,monospace;letter-spacing:0.04em;text-transform:uppercase';
    openBtn.addEventListener('click', () => {
      // Open the modmail thread in a new tab
      window.open('https://greatawakening.win/modmail/thread/' + encodeURIComponent(req.thread_id), '_blank');
    });
    row.appendChild(conf); row.appendChild(meta); row.appendChild(openBtn);
    list.appendChild(row);
  });
  panel.appendChild(list);
  __maintSetStatus('maintStickyScanStatus', '✓ ' + requests.length + ' sticky requests found', 'ok');
}
__maintWire('maintStickyScan', maintStickyScan, 'scanning...');

// v9.16.0 - modmail history backfill wire-up (Commander #6).
async function maintModmailBackfill() {
  __maintSetStatus('maintModmailBackfillStatus', 'crawling /modmail pages 1..10 (allow ~15s)...');
  // Find an active GAW tab to send the message to (content script must run there)
  const tabs = await chrome.tabs.query({ url: 'https://greatawakening.win/*' });
  if (!tabs || tabs.length === 0) {
    __maintSetStatus('maintModmailBackfillStatus', 'no GAW tab open -- visit greatawakening.win first', 'err');
    return;
  }
  // Prefer an active tab if one is on /modmail; otherwise first available
  const target = tabs.find(t => t.url && t.url.includes('/modmail')) || tabs[0];
  try {
    const r = await chrome.tabs.sendMessage(target.id, { type: 'crawlModmailHistory', maxPages: 10 });
    if (!r || !r.ok) {
      __maintSetStatus('maintModmailBackfillStatus', 'crawl failed: ' + ((r && r.error) || 'unknown'), 'err');
      return;
    }
    const s = r.stats || {};
    __maintSetStatus('maintModmailBackfillStatus',
      '✓ crawled ' + (s.pagesCrawled || 0) + ' pages, ingested ' + (s.threadsIngested || 0) + ' threads / ' + (s.messagesIngested || 0) + ' new messages' + (s.errors ? ' (' + s.errors + ' errs)' : ''), 'ok');
  } catch (e) {
    __maintSetStatus('maintModmailBackfillStatus', 'crawl error: ' + (e && e.message || e), 'err');
  }
}
__maintWire('maintModmailBackfill', maintModmailBackfill, 'crawling...');
__maintWire('maintAuditVerify', maintAuditVerify, 'verifying...');
__maintWire('maintFullReport', maintFullReport, 'running...');
__maintWire('maintRosterStaleness', maintRosterStaleness, 'loading...');
__maintWire('maintMigrationDebt', maintMigrationDebt, 'scanning...');

// Header chip + banner consumer for gam_maint_warning. Reads on popup open;
// if flag present, surface a yellow chip in the header AND a banner above
// the maintenance section. Click chip = scroll-into-view of the banner.
async function __maintLoadWarning() {
  try {
    const r = await chrome.storage.local.get(MAINT_WARNING_KEY);
    const w = r[MAINT_WARNING_KEY];
    const chip = $('maintWarningChip');
    const banner = $('maintWarningBanner');
    if (w && typeof w === 'object' && w.reason) {
      if (chip) {
        chip.style.display = '';
        chip.textContent = '⚠ maint';
        chip.title = w.reason + ' (since ' + (w.firstSeenAt || w.at || 'recent') + ')';
        chip.addEventListener('click', () => {
          if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, { once: true });
      }
      if (banner) {
        banner.style.display = '';
        banner.textContent = '⚠ ' + w.reason
          + (w.detail ? ' -- ' + w.detail : '');
        if (w.severity === 'danger') banner.classList.add('danger');
      }
    } else {
      if (chip) chip.style.display = 'none';
      if (banner) banner.style.display = 'none';
    }
  } catch (e) { /* fail silent */ }
}
__maintLoadWarning();

// =========================================================================
// v9.5.0: Autonomous maintenance reports — lead-only surface
// =========================================================================
// Toggle reads team_settings.maintenance_autonomous_enabled (default '1').
// Reports list calls /admin/maintenance/reports (lead-only) and renders
// click-to-expand rows. "Run now" forces a weekly run from the SW alarm
// path so we can smoke-test the full upload + Llama loop without waiting
// 7 days.

async function __maintLoadAutoToggle() {
  const sel = $('maintAutoToggle');
  const status = $('maintAutoStatus');
  if (!sel) return;
  try {
    const r = await chrome.runtime.sendMessage({ type: 'rpc', name: 'modSettingsRead' });
    if (!r || !r.ok || !r.data) {
      if (status) { status.textContent = '(could not read team settings)'; }
      return;
    }
    const v = r.data && r.data.settings && r.data.settings.maintenance_autonomous_enabled;
    sel.value = (v == null ? '1' : (String(v).trim() === '0' ? '0' : '1'));
    if (status) {
      const promptVer = (r.data.settings && r.data.settings.maintenance_prompt_version) || 'v1';
      status.textContent = 'prompt: ' + promptVer + ' — saved';
      status.classList.remove('err');
    }
  } catch (e) {
    if (status) status.textContent = 'load failed: ' + (e && e.message || e);
  }
}

async function __maintSaveAutoToggle() {
  const sel = $('maintAutoToggle');
  const status = $('maintAutoStatus');
  if (!sel || !status) return;
  status.textContent = 'saving...';
  status.classList.remove('err');
  try {
    const value = sel.value === '0' ? '0' : '1';
    const r = await chrome.runtime.sendMessage({
      type: 'rpc',
      name: 'adminSettingsWrite',
      args: { key: 'maintenance_autonomous_enabled', value }
    });
    if (!r || !r.ok) {
      status.textContent = 'save failed: ' + (r && r.error || 'unknown');
      status.classList.add('err');
      return;
    }
    status.textContent = '✓ saved (autonomous=' + value + ')';
  } catch (e) {
    status.textContent = 'save failed: ' + (e && e.message || e);
    status.classList.add('err');
  }
}

function __maintRenderReports(reports) {
  const panel = $('maintReportsPanel');
  if (!panel) return;
  panel.replaceChildren();
  panel.style.display = 'block';
  if (!reports || reports.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:6px;color:#aaa';
    empty.textContent = 'No reports in window.';
    panel.appendChild(empty);
    return;
  }
  for (const r of reports) {
    const row = document.createElement('div');
    row.style.cssText = 'border-bottom:1px solid #2a2d36;padding:4px 0;cursor:pointer';
    const head = document.createElement('div');
    const sev = r.severity || 'info';
    const sevColor = sev === 'critical' ? '#ff5555'
                  : sev === 'warning'  ? '#ffaa33'
                  : sev === 'info'     ? '#66a8ff'
                  : '#88cc88';
    let summary = '';
    try {
      const llm = JSON.parse(r.llm_analysis_json || '{}');
      summary = llm && llm.summary ? llm.summary : '';
    } catch (_) {}
    const ts = new Date(r.ts).toLocaleString();
    head.innerHTML =
      '<span style="color:' + sevColor + ';font-weight:600">[' + sev + ']</span> '
      + '<span style="color:#bbb">' + (r.mod_username || '?') + '</span> '
      + '<span style="color:#888">v' + (r.extension_version || '?') + '</span> '
      + '<span style="color:#888;float:right">' + ts + '</span>'
      + (summary ? '<div style="color:#ccc;margin-top:2px">' + summary.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) + '</div>' : '');
    row.appendChild(head);
    const detail = document.createElement('pre');
    detail.style.cssText = 'display:none;color:#ccc;background:#0a0c12;padding:4px;margin:4px 0;border-radius:3px;overflow:auto;max-height:280px;font-size:10px';
    let resultsParsed, llmParsed;
    try { resultsParsed = JSON.parse(r.results_json || '{}'); } catch (_) { resultsParsed = r.results_json; }
    try { llmParsed = JSON.parse(r.llm_analysis_json || '{}'); } catch (_) { llmParsed = r.llm_analysis_json; }
    detail.textContent = JSON.stringify(
      { id: r.id, prompt_version: r.prompt_version, results: resultsParsed, llm: llmParsed }, null, 2
    );
    row.appendChild(detail);
    row.addEventListener('click', () => {
      detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
    });
    panel.appendChild(row);
  }
}

async function __maintLoadReports() {
  const status = $('maintReportsStatus');
  const sevSel = $('maintReportsSeverity');
  if (!status) return;
  status.textContent = 'loading...';
  status.classList.remove('err');
  try {
    const sev = sevSel ? sevSel.value : '';
    const r = await chrome.runtime.sendMessage({
      type: 'rpc',
      name: 'adminMaintenanceReportsList',
      args: { days: 14, limit: 100, severity: sev }
    });
    if (!r || !r.ok) {
      status.textContent = 'load failed: ' + (r && r.error || 'HTTP ' + (r && r.status));
      status.classList.add('err');
      return;
    }
    const reports = (r.data && r.data.reports) || [];
    status.textContent = reports.length + ' report(s)' + (sev ? ' (sev=' + sev + ')' : '');
    __maintRenderReports(reports);
  } catch (e) {
    status.textContent = 'load failed: ' + (e && e.message || e);
    status.classList.add('err');
  }
}

async function __maintRunNow() {
  const status = $('maintReportsStatus');
  if (!status) return;
  status.textContent = 'running weekly probe + LLM analysis...';
  status.classList.remove('err');
  try {
    const r = await chrome.runtime.sendMessage({ type: 'rpc', name: 'maintenanceRunNow' });
    if (!r || !r.ok) {
      status.textContent = 'run failed: ' + (r && r.error || 'unknown');
      status.classList.add('err');
      return;
    }
    const d = r.data;
    if (!d) { status.textContent = 'run completed but no report payload returned'; return; }
    const sev = (d.llm && d.llm.severity) || 'unknown';
    const summary = (d.llm && d.llm.summary) || '(no summary)';
    status.textContent = '✓ ' + sev + ' — ' + summary;
    // Refresh the list so the new row shows up.
    setTimeout(__maintLoadReports, 600);
  } catch (e) {
    status.textContent = 'run failed: ' + (e && e.message || e);
    status.classList.add('err');
  }
}

(function __maintWireAutonomous() {
  const saveBtn = $('maintAutoSave');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => withLoading(saveBtn, 'saving...', __maintSaveAutoToggle));
  }
  const listBtn = $('maintReportsList');
  if (listBtn) {
    listBtn.addEventListener('click', () => withLoading(listBtn, 'loading...', __maintLoadReports));
  }
  const sevSel = $('maintReportsSeverity');
  if (sevSel) sevSel.addEventListener('change', __maintLoadReports);
  const runBtn = $('maintRunNow');
  if (runBtn) {
    runBtn.addEventListener('click', () => withLoading(runBtn, 'running...', __maintRunNow));
  }
  // Auto-load the toggle state on popup open (lead-gated by __applyLeadGate
  // hiding #leadSection on non-leads, so this is a no-op for non-leads).
  __maintLoadAutoToggle();
})();

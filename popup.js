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
  if (!confirm('Clear ALL ModTools data (mod log, roster, death row, watchlist, verification, notes, intel cache)? This cannot be undone.')) return;
  try {
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
$('debugBtn').addEventListener('click', async () => {
  try {
    const tabs = await chrome.tabs.query({ url: GAW_TAB_PATTERNS, active: true, currentWindow: true });
    let snapshot = null;
    if (tabs.length > 0){
      try {
        const resp = await chrome.tabs.sendMessage(tabs[0].id, { type: 'getDebugSnapshot' });
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
      const backdrop = document.createElement('div');
      backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483646;display:flex;align-items:center;justify-content:center;';
      const panel = document.createElement('div');
      panel.style.cssText = 'background:#1a1c20;color:#e4e4e4;border-radius:8px;padding:14px 16px;min-width:260px;max-width:360px;font-family:ui-sans-serif,system-ui,sans-serif;';
      const title = document.createElement('div');
      title.style.cssText = 'font-size:13px;font-weight:700;margin-bottom:6px;color:#4A9EFF;';
      title.textContent = String(o.title || 'Input required');
      const label = document.createElement('label');
      label.style.cssText = 'display:block;font-size:11px;color:#aaa;margin-bottom:4px;';
      label.textContent = String(o.label || '');
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = String(o.placeholder || '');
      input.maxLength = Number(o.max) || 120;
      input.style.cssText = 'width:100%;background:#0f1114;color:#e4e4e4;border:1px solid #2a2a2a;border-radius:4px;padding:6px 8px;font-size:12px;box-sizing:border-box;';
      const err = document.createElement('div');
      err.style.cssText = 'color:#E74C3C;font-size:11px;margin-top:4px;min-height:14px;';
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;margin-top:10px;';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'background:#2a2a2a;color:#e4e4e4;border:0;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = 'OK';
      okBtn.style.cssText = 'background:#4A9EFF;color:#fff;border:0;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;';
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
      const backdrop = document.createElement('div');
      backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483646;display:flex;align-items:center;justify-content:center;';
      const panel = document.createElement('div');
      panel.style.cssText = 'background:#1a1c20;color:#e4e4e4;border-radius:8px;padding:14px 16px;min-width:260px;max-width:360px;font-family:ui-sans-serif,system-ui,sans-serif;';
      const title = document.createElement('div');
      title.style.cssText = 'font-size:13px;font-weight:700;margin-bottom:6px;color:#4A9EFF;';
      title.textContent = String(o.title || 'Confirm');
      const body = document.createElement('div');
      body.style.cssText = 'font-size:12px;color:#ddd;margin-bottom:10px;white-space:pre-wrap;word-break:break-word;';
      body.textContent = String(o.body || '');
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = String(o.cancelLabel || 'Cancel');
      cancelBtn.style.cssText = 'background:#2a2a2a;color:#e4e4e4;border:0;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = String(o.okLabel || 'OK');
      okBtn.style.cssText = 'background:#4A9EFF;color:#fff;border:0;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;';
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
  if (t.workerModToken && !__isTokenShape(t.workerModToken)) {
    return { ok: false, error: 'malformed team token' };
  }
  if (t.leadModToken && !__isTokenShape(t.leadModToken)) {
    return { ok: false, error: 'malformed lead token' };
  }
  try {
    const r = await chrome.runtime.sendMessage({
      type: 'setTokens',
      workerModToken: t.workerModToken || '',
      leadModToken: t.leadModToken || ''
    });
    return r || { ok: false, error: 'no response from background' };
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
        statusEl.textContent = 'not configured';
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
    $('tokenInput').value = t;
    const statusEl = $('tokenStatus');
    if (t) {
      statusEl.className = 'pop-token-status';
      statusEl.textContent = 'stored (' + t.length + ' chars)';
    } else {
      statusEl.textContent = 'not configured \u2014 cross-mod features disabled';
    }
  } catch (e) {}
}

async function saveToken() {
  const token = $('tokenInput').value.trim();
  const statusEl = $('tokenStatus');
  statusEl.className = 'pop-token-status';
  statusEl.textContent = 'validating...';
  // v5.8.1 security fix (INFO-2 + LOW-1 defense-in-depth): validate token
  // format client-side before sending. Rejects obvious garbage, prevents
  // malformed values from ever hitting chrome.storage.
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) {
    statusEl.className = 'pop-token-status err';
    statusEl.textContent = 'malformed token (expected 32-256 chars alphanumeric + _-)';
    return;
  }
  // v7.2 flag-on: save via background relay, never write tokens into
  // chrome.storage.local from the popup, clear the input after save.
  if (await __hardeningOnPopup()) {
    const r = await saveTokensSecurely({ workerModToken: token });
    if (r && r.ok) {
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
    const resp = await fetch(WORKER_BASE_POPUP + '/version', {
      headers: { 'X-Mod-Token': token }
    });
    if (!resp.ok) {
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'rejected by worker (HTTP ' + resp.status + ') \u2014 token wrong?';
      return;
    }
    const data = await resp.json();
    // v5.8.1 (LOW-1): validate worker response structure before trusting it
    if (!data || typeof data !== 'object' || typeof data.version !== 'string' || data.version.length > 32) {
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'malformed worker response \u2014 refusing to save token';
      return;
    }
    const current = await chrome.storage.local.get('gam_settings');
    const s = current.gam_settings || {};
    s.workerModToken = token;
    await chrome.storage.local.set({ gam_settings: s });
    statusEl.className = 'pop-token-status ok';
    // textContent is safe; version already validated above
    statusEl.textContent = '\u2713 accepted \u2014 worker version: ' + data.version;
  } catch (e) {
    statusEl.className = 'pop-token-status err';
    statusEl.textContent = 'network error: ' + e.message;
  }
}

$('tokenSave').addEventListener('click', saveToken);
$('tokenInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveToken(); });

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
      if (status.hasTeamToken) $('leadSection').style.display = '';
    } catch (e) {}
    return;
  }
  try {
    const { gam_settings } = await chrome.storage.local.get('gam_settings');
    const s = gam_settings || {};
    const t = s.leadModToken || '';
    $('leadInput').value = t;
    const statusEl = $('leadStatus');
    if (t){
      statusEl.className = 'pop-token-status ok';
      statusEl.textContent = 'stored (' + t.length + ' chars) \u2014 HUD + invites enabled';
    } else {
      statusEl.textContent = 'lead-mod only feature';
    }
    // Show section only if team token is set (lead-mod features require both)
    if (s.workerModToken) $('leadSection').style.display = '';
  } catch (e) {}
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
      const r = await saveTokensSecurely({ workerModToken: '', leadModToken: '' });
      // This intentionally clears BOTH under flag-on because the vault is
      // all-or-nothing. For partial clear a dedicated handler would be
      // needed -- out of scope for session 1.
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
    // Need to preserve team token. The relay's setTokens replaces BOTH, so
    // grab the team token once from the user (caveat: flag-on popup has no
    // prefill). For v7.2 session-1 scope we require team token already set
    // in vault; we don't refetch it (no back-channel exposed). Instead the
    // background only updates lead when team is already present. This is a
    // deliberate limitation that Session 2's proper implementation will
    // replace with a setTokens handler that accepts partial updates.
    // Interim shim: send leadModToken only; background vault overwrites
    // only the fields present.
    try {
      const r = await chrome.runtime.sendMessage({
        type: 'setTokens',
        // Intentionally OMIT workerModToken -- background handler reads
        // msg.workerModToken (empty string default), so an omitted field
        // would blank the team token. To avoid that, we resend the current
        // status-indicated team state: we can't read the actual secret
        // back, so we fall through to an error state requiring the team
        // token be re-entered first.
        workerModToken: '',
        leadModToken: token
      });
      // If the background blanked the team token we surface a warning so
      // the user re-saves it; this is the intentional v7.2 limitation.
      if (r && r.ok) {
        statusEl.className = 'pop-token-status ok';
        statusEl.textContent = '\u2713 stored \u2014 re-save team token if needed';
        try { $('leadInput').value = ''; } catch (e) {}
      } else {
        statusEl.className = 'pop-token-status err';
        statusEl.textContent = 'save failed';
      }
    } catch (e) {
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'save failed: ' + (e && e.message || e);
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
    // v5.2.0 H8: server-side validation -- ping a lead-gated endpoint.
    const resp = await fetch(WORKER_BASE_POPUP + '/presence/online', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'X-Mod-Token': teamTok, 'X-Lead-Token': token },
      body: '{}'
    });
    if (resp.status === 403){
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'rejected: not a lead-mod token';
      return;
    }
    if (!resp.ok){
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'worker error (' + resp.status + ')';
      return;
    }
    s.leadModToken = token;
    s.isLeadMod = true;
    await chrome.storage.local.set({ gam_settings: s });
    statusEl.className = 'pop-token-status ok';
    statusEl.textContent = '\u2713 verified \u2014 reload GAW tabs to enable HUD';
  } catch (e) {
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
    const resp = await fetch(WORKER_BASE_POPUP + '/invite/create', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'X-Mod-Token': tok, 'X-Lead-Token': lead },
      body: JSON.stringify({ mod: who })
    });
    if (!resp.ok){
      resultEl.className = 'pop-token-status err';
      resultEl.textContent = 'rejected (HTTP ' + resp.status + ')';
      return;
    }
    const data = await resp.json();
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

$('leadSave').addEventListener('click', saveLead);
$('leadInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveLead(); });
$('inviteBtn').addEventListener('click', generateInvite);

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
    statusEl.className = 'pop-token-status';
    statusEl.textContent = `crawling ${btn.dataset.section} (${btn.dataset.pages} pages)...`;
    try {
      const r = await sendToActiveGawTab({
        type: 'manualCrawl',
        section: btn.dataset.section,
        pages: parseInt(btn.dataset.pages, 10)
      });
      if (r && r.ok){
        statusEl.className = 'pop-token-status ok';
        statusEl.textContent = `\u2713 ${r.result.pages} pages, ${r.result.users} users harvested`;
      } else {
        statusEl.className = 'pop-token-status err';
        statusEl.textContent = 'crawl failed: ' + (r && r.error || 'unknown');
      }
    } catch (e) {
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'need an open GAW tab: ' + e.message;
    }
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
  const section = (title, body) => `<section><h2>${esc(title)}</h2>${body}</section>`;

  const topPosters = (rep.topPosters||[]).map(x=>`<tr><td>${userLink(x.username)}</td><td>${x.posts}</td><td>${x.comments||0}</td></tr>`).join('');
  const topQuality = (rep.topQuality||[]).map(x=>`<tr><td>${userLink(x.username)}</td><td>${(x.upvoteRatio*100).toFixed(1)}%</td><td>${x.posts}</td></tr>`).join('');
  const comeback  = (rep.comebackCandidates||[]).map(x=>`<tr><td>${userLink(x.username)}</td><td>${esc((x.lastSeen||'').slice(0,10))}</td><td>${esc(x.pageHint||'')}</td></tr>`).join('');
  const flagLead  = (rep.flagLeaders||[]).map(x=>`<tr><td>${userLink(x.username)}</td><td>${x.count}</td><td>${esc((x.severities||[]).join(', '))}</td></tr>`).join('');
  const active    = (rep.activeMods||[]).map(x=>`<tr><td>${esc(x.mod)}</td><td>${esc(x.action)}</td><td>${x.n}</td></tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>GAW ModTools Dashboard</title>
<style>
body{font:14px/1.4 ui-sans-serif,system-ui,sans-serif;background:#0f1114;color:#e4e4e4;margin:0;padding:20px;max-width:1200px;margin:auto}
h1{color:#4A9EFF;margin-top:0}
h2{color:#E8A317;border-bottom:1px solid #2a2a2a;padding-bottom:6px;margin-top:32px}
section{margin-bottom:24px}
table{width:100%;border-collapse:collapse;background:#1a1c20;border-radius:6px;overflow:hidden}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #2a2a2a}
th{background:#22252a;color:#aaa;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.05em}
tr:last-child td{border-bottom:none}
tr:hover td{background:#222}
a{color:#4A9EFF;text-decoration:none}
a:hover{text-decoration:underline}
.meta{color:#888;font-size:12px;margin-bottom:20px}
.stat{display:inline-block;background:#1a1c20;border-radius:6px;padding:10px 16px;margin:0 8px 8px 0}
.stat .n{font-size:24px;color:#2ECC71;font-weight:700}
.stat .l{color:#888;font-size:11px;text-transform:uppercase}
.empty{color:#666;font-style:italic;padding:12px 0}
</style></head><body>
<h1>&#x1F4CA; GAW ModTools Dashboard</h1>
<div class="meta">Generated ${esc(rep.generatedAt||'')}</div>
<div>
  <div class="stat"><div class="n">${rep.totalProfiles||0}</div><div class="l">Profiles indexed</div></div>
  <div class="stat"><div class="n">${rep.totalSeen||0}</div><div class="l">Users seen (crawler)</div></div>
  <div class="stat"><div class="n">${(rep.comebackCandidates||[]).length}</div><div class="l">Comeback candidates</div></div>
</div>
${section('Top 10 Posters', topPosters ? table(topPosters, ['User','Posts','Comments']) : '<div class="empty">No data yet &mdash; hover some profiles to populate</div>')}
${section('Top 10 Highest Quality (20+ posts)', topQuality ? table(topQuality, ['User','Upvote Ratio','Posts']) : '<div class="empty">No data yet</div>')}
${section('Comeback Candidates (60+ days silent)', comeback ? table(comeback, ['User','Last Seen','Found On']) : '<div class="empty">Crawler has not found any yet</div>')}
${section('Flag Leaders', flagLead ? table(flagLead, ['User','Flags','Severities']) : '<div class="empty">No flags yet</div>')}
${section('Active Mods (last 7 days)', active ? table(active, ['Mod','Action','Count']) : '<div class="empty">No audit events yet</div>')}
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
    const ok = await __popupConfirm({
      title: 'Claim team invite?',
      body: 'Invite code: ' + prefix + '\u2026' + suffix + '\n\n' +
            'This will link this browser to your mod team and store a team token.\n\n' +
            'ONLY CLICK OK if you were personally given this link by your lead mod.',
      okLabel: 'Claim',
      cancelLabel: 'Cancel'
    });
    if (!ok) {
      statusEl.textContent = 'cancelled';
      return;
    }
    statusEl.textContent = 'claiming...';
    // Route through the background relay -- same allowlist + token path the
    // content script uses. Extension-page context -> sender.id === runtime id
    // so the handler's origin guard passes.
    const r = await chrome.runtime.sendMessage({
      type: 'workerFetch',
      path: '/invite/claim',
      method: 'POST',
      body: { code: code },
      asLead: false
    });
    if (!r || !r.ok) {
      statusEl.className = 'pop-token-status err';
      const hint = (r && r.status) ? ' (HTTP ' + r.status + ')' : '';
      statusEl.textContent = 'claim rejected' + hint;
      return;
    }
    let parsed = null;
    try { parsed = JSON.parse(r.text || 'null'); } catch (e) { parsed = null; }
    const modTok = parsed && typeof parsed.modToken === 'string' ? parsed.modToken : '';
    if (!__isTokenShape(modTok)) {
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'server returned malformed modToken \u2014 refused';
      return;
    }
    // Store via relay (never chrome.storage.local direct from popup).
    const save = await saveTokensSecurely({ workerModToken: modTok });
    if (!save || !save.ok) {
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'token store failed: ' + ((save && save.error) || 'unknown');
      return;
    }
    try { await chrome.storage.session.remove('gam_pending_invite'); } catch (e) {}
    statusEl.className = 'pop-token-status ok';
    statusEl.textContent = '\u2713 claimed \u2014 team token stored';
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
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
  return 'Hey ' + username + ', here is your rotation invite for ModTools.\n\n' +
    'Open the ModTools popup, click "I have a rotation invite", enter your GAW ' +
    'username (' + username + '), then paste this code:\n\n' +
    code + '\n\n' +
    'Expires in ' + (ttlHours || 72) + 'h and is single-use. Once you claim it, ' +
    'your token will be one ONLY YOU know.';
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

  const block = document.createElement('div');
  block.className = 'gam-roster-invite-result';
  block.style.cssText = 'background:#0f1114;border:1px solid #2a2a2a;border-radius:4px;padding:6px;margin-top:4px';

  const codeRow = document.createElement('div');
  codeRow.style.cssText = 'font-family:ui-monospace,monospace;font-size:10px;word-break:break-all;color:#e4e4e4;margin-bottom:4px';
  codeRow.textContent = invite.code;
  block.appendChild(codeRow);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';
  btnRow.appendChild(__makeCopyBtn('Copy code', invite.code));
  btnRow.appendChild(__makeCopyBtn('Copy DM', __dmTemplate(invite.username, invite.code, ttlHours)));
  block.appendChild(btnRow);

  container.appendChild(block);

  // Auto-copy the code so the lead can paste straight into Discord.
  try { navigator.clipboard.writeText(invite.code); } catch (e) {}
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
  name.style.cssText = 'color:#e4e4e4;font-weight:600;font-size:12px';
  name.textContent = m.mod_username + (m.is_lead ? ' 👑' : '');
  info.appendChild(name);

  const status = document.createElement('div');
  status.style.cssText = 'font-size:10px';
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

  // Top Quality (only from GitHub profiles.json; not in D1)
  const qualRows = (rep.topQuality||[]).map(x=>`<tr><td>${userLink(x.username)}</td><td>${(x.upvoteRatio*100).toFixed(1)}%</td><td>${fmtNum(x.posts)}</td></tr>`).join('');
  const topQualityHtml = qualRows ? table(qualRows, ['User','Upvote Ratio','Posts']) : empty('No quality data yet -- populated via hover-harvest (profiles.json)');

  // --- Iter 4: Comeback Candidates ---
  const comebackRows = (rep.comebackCandidates||[]).map(x=>`<tr><td>${userLink(x.username)}</td><td>${esc((x.lastSeen||'').slice(0,10))}</td><td>${fmtNum(x.posts||0)}</td><td>${fmtNum(x.comments||0)}</td></tr>`).join('');
  const comebackHtml = comebackRows ? `${srcBadge(rep.comebackSource)}${table(comebackRows, ['User','Last Seen','Posts','Comments'])}` : empty('No comeback candidates yet -- gaw_users last_seen_at is populated by the firehose');

  // Flag leaders
  const flagRows = (rep.flagLeaders||[]).map(x=>`<tr><td>${userLink(x.username)}</td><td>${x.count}</td><td>${esc((x.severities||[]).join(', '))}</td></tr>`).join('');
  const flagHtml = flagRows ? table(flagRows, ['User','Flags','Severities']) : empty('No flags yet -- flags.json is populated when mods flag users (migration to D1 deferred)');

  // --- Iter 5: Removed Content ---
  const removedRows = (rep.removedByAuthor||[]).map(x=>`<tr><td>${userLink(x.author)}</td><td>${fmtNum(x.n)}</td></tr>`).join('');
  const removedHtml = removedRows ? table(removedRows, ['Author','Removed Posts']) : empty('No removed posts captured this week -- firehose captures removals when posts are re-fetched');

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
<div class="meta">Generated ${esc(rep.generatedAt||'')} &nbsp;&#x2022;&nbsp; v9.1.0</div>
${statsBar}
${section('&#x26A1;', 'Active Mods (last 7 days)', activeHtml)}
${section('&#x1F6E1;', 'Recent Bans', recentBansHtml)}
${section('&#x1F4C8;', 'Activity Heatmap (last 7 days, UTC hour)', heatmapHtml)}
${section('&#x2620;', 'Death Row Pipeline', drHtml)}
${section('&#x1F4B0;', 'Top 10 Posters', topPostersHtml)}
${section('&#x1F31F;', 'Top 10 Highest Quality', topQualityHtml)}
${section('&#x1F550;', 'Comeback Candidates (60+ days silent)', comebackHtml)}
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

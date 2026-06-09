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

// =============================================================================
// E.2.1 (AF-12 Rule 36): popupRpc wrapper + __showPopupRestartNotice
// Replaces all direct chrome.runtime.sendMessage({type:'rpc',...}) calls.
// Non-rpc sends (setTokens, clearTokens, tokensStatus, openPopup) NOT wrapped.
// =============================================================================
async function popupRpc(name, args) {
  try {
    var r = await chrome.runtime.sendMessage({ type: 'rpc', name: name, args: args || {} });
    if (!r) return { ok: false, code: 'NO_RESPONSE', error: 'No response from extension background.' };
    return r;
  } catch (e) {
    var msg = String(e && e.message || e);
    if (/context invalidated|receiving end does not exist|message port closed/i.test(msg)) {
      __showPopupRestartNotice();
      return { ok: false, code: 'EXT_CONTEXT_INVALIDATED', error: 'Extension is restarting — close and reopen this popup.' };
    }
    return { ok: false, error: msg };
  }
}
function __showPopupRestartNotice() {
  if (document.getElementById('gam-popup-restart-notice')) return;
  var d = document.createElement('div');
  d.id = 'gam-popup-restart-notice';
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#2a1d10;border-bottom:1px solid #ff9933;color:#ffd84d;font:600 11px ui-monospace,monospace;padding:6px 12px;text-align:center;';
  d.textContent = 'Extension is restarting — close and reopen this popup.';
  document.body.prepend(d);
}
// =============================================================================
// END E.2.1
// =============================================================================

// =============================================================================
// E.3.3 (AF-16 Rule 47): showPopupBanner — non-blocking, auto-dismisses 5s
// Replaces all alert() calls in popup.js (6 sites).
// =============================================================================
function showPopupBanner(msg, severity) {
  var existing = document.getElementById('gam-popup-banner');
  if (existing) { try { existing.remove(); } catch (_) {} }
  var colors = { error: { bg: '#2a1010', border: '#f04040', text: '#f87171' },
                 warn:  { bg: '#2a1d10', border: '#ff9933', text: '#ffd84d' },
                 success: { bg: '#0f2a1a', border: '#3dd68c', text: '#6ee7b7' },
                 info:  { bg: '#0f1a2a', border: '#4A9EFF', text: '#93c5fd' } };
  var c = colors[severity] || colors.info;
  var b = document.createElement('div');
  b.id = 'gam-popup-banner';
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;background:' + c.bg + ';border-bottom:1px solid ' + c.border + ';color:' + c.text + ';font:600 11px ui-monospace,monospace;padding:6px 12px;text-align:center;cursor:pointer;';
  b.textContent = msg;
  // a11y: keyboard-dismissible (auto-removes after 5s anyway, but Enter/Space
  // gives keyboard users a way to clear it manually). role="alert" prompts AT
  // to announce the message on insertion.
  b.setAttribute('role', 'alert');
  b.setAttribute('tabindex', '0');
  b.setAttribute('aria-label', msg + ' (press Enter to dismiss)');
  var dismiss = function () { try { b.remove(); } catch (_) {} };
  b.addEventListener('click', dismiss);
  b.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Escape') return;
    if (e.key === ' ') e.preventDefault();
    dismiss();
  });
  document.body.prepend(b);
  setTimeout(function() { try { if (b.parentNode) b.remove(); } catch (_) {} }, 5000);
}
// =============================================================================
// END E.3.3
// =============================================================================

// =============================================================================
// E.2.6 (AF-06 Rule 18): _purgeOldestDiagLog50Pct — shared helper for quota purge
// =============================================================================
async function _purgeOldestDiagLog50Pct() {
  try {
    var r = await chrome.storage.local.get('gam_diag_log');
    var entries = (r && r.gam_diag_log) || [];
    if (entries.length > 0) {
      var kept = entries.slice(Math.floor(entries.length / 2));
      await chrome.storage.local.set({ gam_diag_log: kept });
    }
  } catch (_) {}
}
// =============================================================================
// END E.2.6 helper
// =============================================================================
const GAW_TAB_PATTERNS = ['*://greatawakening.win/*', '*://*.greatawakening.win/*'];

function $(id) { return document.getElementById(id); }

// =============================================================================
// v10.x PATCH 1 — Collapsible Cards System
// =============================================================================
// Card IDs: tokens | maint | tools | macros | lead
// Storage key: gam_card_open_{id} -> boolean
// 400ms write debounce prevents burst writes on rapid toggle.

const _cardWriteTimers = {};

// v10.12 D.3.2: Only <details> cards (card-tokens, card-maint-integrity) use open state.
// card-tools, card-macros, card-lead are now <div> — no open attribute needed.
// card-maint no longer exists (split into 4 sub-cards; integrity is the <details> one).
const _DETAILS_CARDS = ['tokens', 'maint-integrity'];

async function _cardRestoreAll() {
  const ids = _DETAILS_CARDS;
  const keys = ids.map(function(id) { return 'gam_card_open_' + id; });
  try {
    const data = await chrome.storage.local.get(keys);
    ids.forEach(function(id) {
      const el = document.getElementById('card-' + id);
      if (!el || el.tagName !== 'DETAILS') return;
      const stored = data['gam_card_open_' + id];
      if (stored === false) el.removeAttribute('open');
      else if (stored === true) el.setAttribute('open', '');
    });
  } catch (_) {}
}

function _cardWireToggle(id) {
  const el = document.getElementById('card-' + id);
  if (!el || el.tagName !== 'DETAILS') return;
  el.addEventListener('toggle', function() {
    clearTimeout(_cardWriteTimers[id]);
    _cardWriteTimers[id] = setTimeout(function() {
      const openBool = el.open === true;
      chrome.storage.local.set({ ['gam_card_open_' + id]: openBool }).catch(function(e) { console.warn('[Popup] storage.set card state failed:', e); });
    }, 400);
  });
}

(async function initCards() {
  await _cardRestoreAll();
  _DETAILS_CARDS.forEach(_cardWireToggle);
})();

// Auto-collapse tokens card when auth succeeds (whoamiOk=true) or fail (false).
// v10.14.0 V14-T1: dead removeAttribute('open') / setAttribute('open','') calls
// removed -- card-tokens was switched from <details> to <div> in v10.12 UIUX-01,
// so the open attribute does nothing. Order/urgent classes still drive visual
// state (gam-card-urgent flips chrome amber, gam-card-order-last reorders).
async function _cardAutoCollapseTokens(whoamiOk) {
  const card = document.getElementById('card-tokens');
  if (!card) return;
  if (whoamiOk) {
    chrome.storage.local.set({ gam_card_open_tokens: false }).catch(function(e) { console.warn('[Popup] storage.set card-tokens state failed:', e); });
    card.classList.add('gam-card-order-last');
    card.classList.remove('gam-card-urgent');
  }
}

function _cardAuthFailed() {
  const card = document.getElementById('card-tokens');
  if (!card) return;
  card.classList.remove('gam-card-order-last');
  card.classList.add('gam-card-urgent');
}

function _cardWizardComplete() {
  const card = document.getElementById('card-tokens');
  if (!card) return;
  card.classList.add('gam-card-order-last');
  const badge = document.getElementById('card-badge-tokens');
  if (badge && !badge.querySelector('.gam-card-rerun')) {
    const btn = document.createElement('button');
    btn.className = 'pop-btn pop-btn-ghost gam-card-rerun';
    btn.style.cssText = 'font-size:9px;padding:1px 6px;line-height:1';
    btn.textContent = 'Re-run setup';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      // v10.13.3 W2: re-route to State A (no separate #firstRunWizard wrapper).
      // Reset wizard step 2 / success and switch state machine.
      try { __tokSetState('first-run'); } catch(_){}
      const step2 = document.getElementById('firstRunWizardStep2');
      const success = document.getElementById('firstRunWizardSuccess');
      if (step2)   step2.style.display = 'none';
      if (success) success.style.display = 'none';
      // v10.14.0 V14-T1: dead setAttribute('open','') removed -- card is <div>.
    });
    badge.style.display = '';
    badge.appendChild(btn);
  }
  chrome.storage.local.set({ gam_card_open_tokens: false }).catch(function() {});
}

// =============================================================================
// v10.13.3 W2 (UIUX2-02) — Tokens tab three-state machine.
// Single point of truth for tab render state. All states are pre-rendered in
// HTML; this just swaps visibility on the two state divs. Eliminates the
// flash-of-wrong-content for non-leads (P0-07) and the orphan claim button
// outside the card (R-06).
// =============================================================================
function __tokSetState(state, opts) {
  const firstRun  = document.getElementById('tokStateFirstRun');
  const returning = document.getElementById('tokStateReturning');
  if (firstRun)  firstRun.style.display  = (state === 'first-run')  ? '' : 'none';
  if (returning) returning.style.display = (state !== 'first-run')  ? '' : 'none';
  if (state === 'returning' || state === 'expired') {
    __tokUpdateBanner(opts || {});
  }
  // v10.16.48 A6-#3: when first-run state activates, auto-route the popup to
  // the Tokens tab. Pre-fix the popup defaulted to Stats — a new mod saw
  // eight dashes and zero direction. The onboarding block is well-designed
  // but lived behind tab #2; mods had to discover it. Now the popup OPENS on
  // Tokens for first-run users so the next action is immediate.
  if (state === 'first-run') {
    try {
      const tokensTabBtn = document.getElementById('tab-btn-tokens');
      const statsTabBtn = document.getElementById('tab-btn-stats');
      // Only re-route if Stats is currently the active tab (avoid clobbering
      // a deliberate tab pick by the operator if __tokSetState fires later).
      if (tokensTabBtn && statsTabBtn && statsTabBtn.classList.contains('pop-tab-active')) {
        setTimeout(function () { try { tokensTabBtn.click(); } catch (_) {} }, 30);
      }
    } catch (_) {}
  }
}

// v10.24.0 (lockout-proof L2): RECOVERY state. A returning operator whose token
// was REJECTED (background L1 sets gam_auth_failed on a real 401) must NOT be shown
// the NEW-MOD onboarding (the invite-claim dead end that trapped the lead). This
// shows the first-run paste UI but reframes it with a recovery banner: "your token
// was rejected, not a new mod" + pre-opens the token-paste path + points to the
// break-glass .bat. Auto-hides when whoami later succeeds (banner lives inside the
// first-run container, which __tokSetState('returning') hides).
function __tokShowRecovery() {
  try { __tokSetState('first-run'); } catch (_) {}
  try {
    var host = document.getElementById('tokStateFirstRun');
    if (!host) return;
    var el = document.getElementById('tokRecoveryBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tokRecoveryBanner';
      el.setAttribute('role', 'status');
      el.style.cssText = 'margin:0 0 10px;padding:8px 10px;border:1px solid var(--bb-warn,#ffd84d);border-radius:4px;background:rgba(255,216,77,0.08);color:#e8e6e1;font:11px/1.45 ui-monospace,monospace';
      host.insertBefore(el, host.firstChild);
    }
    while (el.firstChild) el.removeChild(el.firstChild);
    var h = document.createElement('div');
    h.style.cssText = 'font-weight:700;color:var(--bb-warn,#ffd84d);margin-bottom:3px';
    h.textContent = '⚠ Your saved token was rejected';
    var p = document.createElement('div');
    p.textContent = "You're a returning mod, not a new one — your token expired or was rotated. Paste a fresh token below (the \"I have a token\" path), or double-click RECOVER-LEAD-ACCESS.bat to mint one (it copies the new token to your clipboard).";
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pop-btn pop-btn-ghost';
    b.style.cssText = 'margin-top:6px;font-size:11px';
    b.textContent = 'I have a token → paste it';
    b.addEventListener('click', function () { try { var t = document.getElementById('firstRunPathToken'); if (t) t.click(); } catch (_) {} });
    el.appendChild(h); el.appendChild(p); el.appendChild(b);
    el.style.display = '';
  } catch (_) {}
}

// Populate the verified-status banner with live data.
// opts: { username, tier, verifiedAgo, ageDays, encrypted }
function __tokUpdateBanner(opts) {
  const banner    = document.getElementById('tokVerifiedBanner');
  const icon      = document.getElementById('tokBannerIcon');
  const primary   = document.getElementById('tokBannerPrimary');
  const secondary = document.getElementById('tokBannerSecondary');
  if (!banner || !primary || !secondary) return;

  const ageDays = (opts.ageDays != null) ? Number(opts.ageDays) : -1;
  let severity = 'ok';
  if (ageDays >= 90)      severity = 'err';
  else if (ageDays >= 60) severity = 'warn';

  // Apply severity class (single class, no others)
  banner.className = 'tok-banner ' + severity;
  if (icon) icon.textContent = severity === 'ok' ? '✓' : severity === 'warn' ? '⚠' : '✗';

  // Primary line
  primary.textContent = (severity === 'err')
    ? 'TOKEN EXPIRED — rotate required'
    : (severity === 'warn' ? 'Token active — rotate soon' : 'Token active');

  // Secondary: u/name * tier * verified Xs ago * ENC chip * age
  secondary.innerHTML = '';
  const parts = [];
  if (opts.username)            parts.push('u/' + opts.username);
  if (opts.tier)                parts.push(String(opts.tier).replace('_', '-') + ' tier');
  if (opts.verifiedAgo != null) parts.push('verified ' + opts.verifiedAgo + 's ago');
  parts.forEach(function(p, i) {
    if (i > 0) secondary.appendChild(document.createTextNode(' · '));
    secondary.appendChild(document.createTextNode(p));
  });

  // ENC chip — encryption is always-on since v10.11
  const encChip = document.createElement('span');
  encChip.className = 'tok-enc-chip';
  encChip.title = 'Token stored encrypted (v10.11+)';
  encChip.textContent = 'ENC';
  secondary.appendChild(document.createTextNode(' · '));
  secondary.appendChild(encChip);

  // Age indicator (60-89d amber, >=90d red rotate-now)
  if (ageDays >= 90) {
    const ageEl = document.createElement('span');
    ageEl.className = 'tok-age-err';
    ageEl.textContent = 'age ' + ageDays + 'd';
    secondary.appendChild(document.createTextNode(' · '));
    secondary.appendChild(ageEl);
    const rotateEl = document.createElement('button');
    rotateEl.className = 'tok-banner-rotate-btn';
    rotateEl.textContent = 'Rotate now';
    rotateEl.addEventListener('click', function() {
      const mgmt = document.getElementById('tokManagementDetails');
      if (mgmt) mgmt.setAttribute('open', '');
      const rotBtn = document.getElementById('rotateBtn');
      if (rotBtn) rotBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    secondary.appendChild(document.createTextNode(' '));
    secondary.appendChild(rotateEl);
  } else if (ageDays >= 60) {
    const ageEl = document.createElement('span');
    ageEl.className = 'tok-age-warn';
    ageEl.textContent = 'age ' + ageDays + 'd — rotate soon';
    secondary.appendChild(document.createTextNode(' · '));
    secondary.appendChild(ageEl);
  }
}
// =============================================================================
// END PATCH 1
// =============================================================================

// =============================================================================
// v10.x PATCH 5 — Shared empty-state renderer (popup context)
// =============================================================================
(function __installPopupEmptyState() {
  if (window.__gamEmptyStateReady) return;
  window.__gamEmptyStateReady = true;
  const s = document.createElement('style');
  s.textContent = [
    '.gam-empty-card{display:flex;flex-direction:column;align-items:center;gap:10px;',
    'padding:24px 16px;text-align:center;background:none}',
    '.gam-empty-icon{color:#5c6370}',
    '.gam-empty-headline{font-size:13px;font-weight:600;color:#e8eaed}',
    '.gam-empty-desc{font-size:11px;color:#8b929e;max-width:280px;line-height:1.5}',
    '.gam-empty-cta{margin-top:2px;padding:6px 14px;background:transparent;',
    'border:1px solid #ff9933;color:#ff9933;cursor:pointer;font:600 11px ui-monospace,monospace;',
    'letter-spacing:0.06em;text-transform:uppercase}',
    '.gam-empty-cta:hover{background:rgba(255,153,51,0.10)}'
  ].join('');
  (document.head || document.body).appendChild(s);
})();

const GAM_EMPTY_SVG = {
  'modmail-empty':  '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  'users-empty':    '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.2"/><path d="M15 20a4 4 0 0 1 6 0"/></svg>',
  'check-circle':   '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-5"/></svg>',
  'error-octagon':  '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  'rules-empty':    '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>'
};

function gamEmptyState(opts) {
  const o = opts || {};
  const card = document.createElement('div');
  card.className = 'gam-empty-card';
  card.setAttribute('role', 'status');
  if (o.icon && GAM_EMPTY_SVG[o.icon]) {
    const iw = document.createElement('div');
    iw.className = 'gam-empty-icon';
    iw.innerHTML = GAM_EMPTY_SVG[o.icon]; // STATIC constants - XSS-safe
    card.appendChild(iw);
  }
  if (o.headline) {
    const h = document.createElement('div');
    h.className = 'gam-empty-headline';
    h.textContent = String(o.headline);
    card.appendChild(h);
  }
  if (o.desc) {
    const d = document.createElement('div');
    d.className = 'gam-empty-desc';
    d.textContent = String(o.desc);
    card.appendChild(d);
  }
  if (o.ctaLabel && typeof o.ctaFn === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gam-empty-cta';
    btn.textContent = String(o.ctaLabel);
    btn.addEventListener('click', function(e) { try { o.ctaFn(e); } catch(_) {} });
    card.appendChild(btn);
  }
  return card;
}
// =============================================================================
// END PATCH 5 — gamEmptyState
// =============================================================================

// =============================================================================
// v10.13.2 W5 — copyWithPulse(btn, text)
// Three-layer clipboard fallback: DevTools copy() -> navigator.clipboard ->
// textarea + execCommand('copy'). On success, swaps button label to "COPIED"
// for 1200ms and applies gam-copy-flash keyframe (green tint fade over 800ms).
// All token/debug/AI copy buttons should route through this utility (UIUX2-31).
// =============================================================================
async function copyWithPulse(btn, text) {
  var copied = null;
  // Layer 1: DevTools-only copy() helper (rare in popup but cheap to attempt)
  try { if (typeof copy === 'function') { copy(text); copied = 'devtools'; } } catch(_){}
  // Layer 2: navigator.clipboard.writeText (requires document.hasFocus)
  // v10.14.1 CC4: await the Promise so a rejected write (focus lost mid-call)
  // falls through to Layer 3 instead of being silently swallowed.
  if (!copied) {
    try {
      if (navigator.clipboard && document.hasFocus()) {
        await navigator.clipboard.writeText(text);
        copied = 'clipboard-api';
      }
    } catch(_){}
  }
  // Layer 3: legacy textarea + execCommand fallback (works without focus)
  // v10.14.1 CC3: textarea cleanup in finally so a thrown execCommand never
  // leaks the off-screen textarea into the DOM.
  if (!copied) {
    var __ta = null;
    try {
      __ta = document.createElement('textarea');
      __ta.value = String(text);
      __ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(__ta);
      __ta.focus(); __ta.select();
      var ok = document.execCommand('copy');
      if (ok) copied = 'execCommand';
    } catch(_){
    } finally {
      if (__ta && __ta.parentNode) {
        try { __ta.parentNode.removeChild(__ta); } catch(_){}
      }
    }
  }
  // Pulse the button regardless of which layer succeeded; bail-out is silent.
  // v10.13.5 P0-E (RALPH AUDIT COPY-CLIPBOARD F7): double-click within 1200ms
  // permanently corrupted the label. Click 1 captured origLabel='COPY URL',
  // label became 'COPIED'. Click 2 at T=800ms captured origLabel='COPIED'
  // (current text), so timer 2 restored stale 'COPIED' permanently. Fix:
  // stash the original label ONCE on the button (sticky across re-clicks),
  // and clear the prior timer before setting a new one. Mirrored exactly
  // in modtools.js:7199-7212 (the same defect lived in both files).
  if (btn && copied) {
    try {
      if (btn.__copyPulseTimer) { clearTimeout(btn.__copyPulseTimer); btn.__copyPulseTimer = null; }
      if (!btn.__copyPulseOrigLabel) { btn.__copyPulseOrigLabel = btn.textContent; }
      btn.textContent = 'COPIED';
      btn.classList.add('gam-copy-flash');
      btn.style.animation = 'gam-copy-flash 800ms ease-out';
      btn.__copyPulseTimer = setTimeout(function() {
        try {
          if (btn.__copyPulseOrigLabel) btn.textContent = btn.__copyPulseOrigLabel;
          btn.classList.remove('gam-copy-flash');
          btn.style.animation = '';
          btn.__copyPulseOrigLabel = null;
          btn.__copyPulseTimer = null;
        } catch(_){}
      }, 1200);
    } catch(_){}
  }
  return copied;
}

// =============================================================================
// v10.12 PATCH 5b — State factory functions (D.3.11 UIUX-19 §C.1)
// gamMakeSkel / gamMakeEmpty / gamMakeError / gamMakeStale
// These are the canonical state helpers for popup context.
// gamMakeEmpty extends the existing gamEmptyState (which stays for compat).
// =============================================================================

// New SVG icons for sus-empty and queue-empty (UIUX-19 §B.2)
const GAM_STATE_SVG = {
  'sus-empty':   '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>',
  'queue-empty': '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="3" rx="1"/><rect x="3" y="10" width="18" height="3" rx="1" opacity=".4"/><rect x="3" y="16" width="18" height="3" rx="1" opacity=".15"/></svg>'
};

function gamMakeSkel(variant) {
  const wrap = document.createElement('div');
  wrap.className = 'gam-skel-wrap';
  wrap.setAttribute('aria-busy', 'true');
  if (variant === 'stat') {
    const bar = document.createElement('div');
    bar.className = 'gam-skel-stat gam-skel-shimmer';
    wrap.appendChild(bar);
  } else if (variant === 'paragraph') {
    [80, 95, 70].forEach(function(w) {
      const line = document.createElement('div');
      line.className = 'gam-skel-line gam-skel-shimmer';
      line.style.width = w + '%';
      wrap.appendChild(line);
    });
  } else if (variant === 'row') {
    const row = document.createElement('div');
    row.className = 'gam-skel-row gam-skel-shimmer';
    wrap.appendChild(row);
  } else {
    const card = document.createElement('div');
    card.className = 'gam-skel-card gam-skel-shimmer';
    wrap.appendChild(card);
  }
  return wrap;
}

function gamMakeEmpty(opts) {
  // Thin wrapper around gamEmptyState — adds .gam-empty-state class for new CSS
  const o = opts || {};
  // Merge SVG maps
  const allSvgs = Object.assign({}, GAM_EMPTY_SVG, GAM_STATE_SVG);
  const card = document.createElement('div');
  card.className = 'gam-empty-state';
  card.setAttribute('role', 'status');
  if (o.icon && allSvgs[o.icon]) {
    const iw = document.createElement('div');
    iw.className = 'gam-empty-icon';
    iw.innerHTML = allSvgs[o.icon]; // STATIC constants - XSS-safe
    card.appendChild(iw);
  }
  if (o.headline) {
    const h = document.createElement('div');
    h.className = 'gam-empty-headline';
    h.textContent = String(o.headline);
    card.appendChild(h);
  }
  if (o.desc) {
    const d = document.createElement('div');
    d.className = 'gam-empty-desc';
    d.textContent = String(o.desc);
    card.appendChild(d);
  }
  // v10.13.2 W5: accept BOTH ctaFn (popup-side legacy) and ctaAction (modtools-side)
  // for cross-file copy-paste back-compat. UIUX2-28 empty-states API alignment.
  const __ctaCb = o.ctaFn || o.ctaAction;
  if (o.ctaLabel && typeof __ctaCb === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gam-empty-cta';
    btn.textContent = String(o.ctaLabel);
    btn.addEventListener('click', function(e) { try { __ctaCb(e); } catch(_) {} });
    card.appendChild(btn);
  }
  return card;
}

function gamMakeError(opts) {
  const o = opts || {};
  const wrap = document.createElement('div');
  wrap.className = 'gam-error-state';
  wrap.setAttribute('role', 'alert');
  const chip = document.createElement('span');
  chip.className = 'gam-error-chip ' + (o.severity === 'soft' ? 'soft' : 'hard');
  chip.textContent = (o.label ? o.label + ' ' : '') + (o.severity === 'soft' ? 'WARN' : 'ERR');
  wrap.appendChild(chip);
  if (o.msg) {
    const msg = document.createElement('div');
    msg.className = 'gam-error-msg';
    msg.textContent = String(o.msg);
    wrap.appendChild(msg);
  }
  if (o.hint) {
    const hint = document.createElement('div');
    hint.className = 'gam-error-hint';
    hint.textContent = String(o.hint);
    wrap.appendChild(hint);
  }
  if (typeof o.retryFn === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gam-error-retry';
    btn.textContent = 'RETRY';
    btn.addEventListener('click', function() { try { o.retryFn(); } catch(_) {} });
    wrap.appendChild(btn);
  }
  return wrap;
}

function gamMakeStale(label, refreshFn) {
  const chip = document.createElement('span');
  chip.className = 'gam-stale-chip';
  chip.textContent = label || 'stale';
  if (typeof refreshFn === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gam-stale-refresh';
    btn.textContent = 'REFRESH';
    btn.addEventListener('click', function() { try { refreshFn(); } catch(_) {} });
    chip.appendChild(btn);
  }
  return chip;
}
// =============================================================================
// END PATCH 5b — State factories
// =============================================================================

// =============================================================================
// v10.12 PATCH 5c — Drill drawer focus management (D.3.8 UIUX-09 §F.4)
// Filter live-filter, sort re-sort, count badge, focus restore on close
// =============================================================================
(function wireDrillEnhancements() {
  const drill = document.getElementById('pop-drill');
  const closeBtn = document.getElementById('pop-drill-close');
  const filterIn = document.getElementById('pop-drill-filter');
  const sortSel  = document.getElementById('pop-drill-sort');
  const countEl  = document.getElementById('pop-drill-count');
  if (!drill || !closeBtn) return;

  let _prevFocus = null;

  // Observe drill visibility and manage focus (open)
  const openObs = new MutationObserver(function() {
    if (drill.style.display !== 'none' && drill.style.display !== '') {
      _prevFocus = document.activeElement;
      drill.setAttribute('aria-modal', 'true');
      closeBtn.focus();
      updateDrillCount();
    }
  });
  openObs.observe(drill, { attributes: true, attributeFilter: ['style'] });

  // Focus restore on close
  closeBtn.addEventListener('click', function() {
    if (_prevFocus && typeof _prevFocus.focus === 'function') {
      try { _prevFocus.focus(); } catch(_) {}
    }
  });

  // Esc key close + focus trap (Tab cycles inside the drawer).
  drill.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeBtn.click(); return; }
    if (e.key === 'Tab') {
      const focusable = drill.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function updateDrillCount() {
    if (!countEl) return;
    const rows = drill.querySelectorAll('.pop-drill-row');
    const visible = Array.from(rows).filter(function(r) { return r.style.display !== 'none'; });
    countEl.textContent = '(' + (visible.length || rows.length) + ')';
  }

  // Live filter
  if (filterIn) {
    filterIn.addEventListener('input', function() {
      const term = filterIn.value.toLowerCase();
      drill.querySelectorAll('.pop-drill-row').forEach(function(row) {
        row.style.display = (row.textContent.toLowerCase().includes(term)) ? '' : 'none';
      });
      updateDrillCount();
    });
  }

  // Sort — re-sort visible rows alphabetically by text
  if (sortSel) {
    sortSel.addEventListener('change', function() {
      const tbody = drill.querySelector('tbody') || drill.querySelector('.pop-drill-body');
      if (!tbody) return;
      const rows = Array.from(tbody.querySelectorAll('.pop-drill-row, tr'));
      if (!rows.length) return;
      const sortVal = sortSel.value;
      if (!sortVal) return; // "Time" = natural server order
      rows.sort(function(a, b) { return a.textContent.trim().localeCompare(b.textContent.trim()); });
      rows.forEach(function(r) { tbody.appendChild(r); });
    });
  }
})();
// =============================================================================
// END PATCH 5c — Drill enhancements
// =============================================================================

// =============================================================================
// v10.12 PATCH 5d — Stat tile skeleton + error wiring (D.3.17 UIUX-19 §C.2)
// On open: show skeleton. On loadStats() success: replace. On fail: error chip.
// =============================================================================
(function wireStatSkeletons() {
  const statIds = ['s-pending','s-dr','s-banned','s-today','s-msgs','s-notes','s-ai-today','s-unsticky'];
  statIds.forEach(function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    // Only set skeleton if still showing the initial placeholder
    if (el.textContent === '--' || el.textContent === '—' || el.textContent === '&mdash;') {
      const skel = gamMakeSkel('stat');
      skel.style.cssText = 'position:absolute;inset:0;width:80%;margin:auto;top:50%;transform:translateY(-50%)';
      el.style.position = 'relative';
      el.style.minHeight = '28px';
      el.textContent = '';
      el.appendChild(skel);
      el.dataset.skelActive = '1';
    }
  });
})();

// Called by loadStats() on success to clear skeletons
function _clearStatSkeletons() {
  const statIds = ['s-pending','s-dr','s-banned','s-today','s-msgs','s-notes','s-ai-today','s-unsticky'];
  statIds.forEach(function(id) {
    const el = document.getElementById(id);
    if (el && el.dataset.skelActive) {
      const skel = el.querySelector('.gam-skel-wrap');
      if (skel) skel.remove();
      delete el.dataset.skelActive;
      el.style.position = '';
      el.style.minHeight = '';
    }
  });
}
// =============================================================================
// END PATCH 5d
// =============================================================================

// =============================================================================
// v10.12 PATCH 5e — Diag panel skeleton (D.3.18 UIUX-19 §C.2)
// Replace "Loading..." text in diag panels with skeleton shimmer.
// =============================================================================
(function wireDiagSkeletons() {
  ['diagSysIdentity','diagSwHealth','diagRpcLog','diagStorage'].forEach(function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if ((el.textContent || '').trim() === 'Loading...') {
      const skel = gamMakeSkel('paragraph');
      el.replaceChildren(skel);
      el.dataset.skelActive = '1';
    }
  });
})();
// =============================================================================
// END PATCH 5e
// =============================================================================

// =============================================================================
// v10.x PATCH 6 — Proactive Notice Library
// =============================================================================
async function _shouldShowNotice(id) {
  return new Promise(function(resolve) {
    try {
      chrome.storage.local.get(['gam_notice_' + id + '_dismissed'], function(r) {
        resolve(!r['gam_notice_' + id + '_dismissed']);
      });
    } catch (_) { resolve(true); }
  });
}

function gamProactiveNotice(opts) {
  const id            = opts.id;
  const severity      = opts.severity || 'warn';
  const headline      = opts.headline || '';
  const body          = opts.body || '';
  const actionLabel   = opts.action_label;
  const actionFn      = opts.action_fn;
  const persistDismiss  = opts.persist_dismiss !== false;
  const onePerSession   = !!opts.one_per_session;
  const autoClearCond   = opts.auto_clear_condition;

  const STORE_KEY   = 'gam_notice_' + id + '_dismissed';
  const SESSION_KEY = 'gam_notice_shown_' + id;

  if (onePerSession && sessionStorage.getItem(SESSION_KEY)) return { teardown: function() {} };
  sessionStorage.setItem(SESSION_KEY, '1');

  const PALETTE = {
    warn:     { bg: '#1a0f00', accent: '#ff9933' },
    alert:    { bg: '#1a0000', accent: '#ff3333' },
    incident: { bg: '#1a001a', accent: '#ff33ff' }
  };
  const pal = PALETTE[severity] || PALETTE.warn;
  const bg = pal.bg;
  const accent = pal.accent;

  const wrap = document.createElement('div');
  wrap.id = 'gam-notice-' + id;
  wrap.style.cssText = [
    'position:fixed;top:0;left:0;right:0;z-index:2147483640',
    'background:' + bg + ';border-bottom:2px solid ' + accent,
    'color:' + accent + ';font:600 12px/1.4 ui-monospace,JetBrains Mono,Consolas,monospace',
    'padding:10px 16px;box-shadow:0 2px 12px rgba(0,0,0,0.6);letter-spacing:0.04em',
    'display:flex;align-items:center;gap:12px'
  ].join(';');

  const safeHeadline = String(headline).replace(/[<>&"]/g, function(c) {
    return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c];
  });
  const safeBody = String(body).replace(/[<>&"]/g, function(c) {
    return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c];
  });

  const actionHTML = actionLabel
    ? '<button id="gam-notice-' + id + '-action"' +
      ' style="background:' + accent + ';color:#000;border:0;padding:3px 10px;' +
      'font:700 11px ui-monospace,monospace;cursor:pointer;letter-spacing:0.06em"' +
      '>' + String(actionLabel).replace(/[<>&"]/g, function(c){ return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]; }) + '</button>'
    : '';

  wrap.innerHTML = '<span style="flex:1"><strong>' + safeHeadline + '</strong>' +
    '<span style="font-weight:400;margin-left:8px;opacity:0.85">' + safeBody + '</span></span>' +
    actionHTML +
    '<button id="gam-notice-' + id + '-dismiss"' +
    ' style="background:transparent;color:' + accent + ';border:1px solid ' + accent + ';' +
    'padding:2px 8px;font:600 11px ui-monospace,monospace;cursor:pointer">X</button>';

  const prevPad = (document.body && document.body.style.paddingTop) || '';
  try { document.body.style.paddingTop = '52px'; } catch (_) {}
  try { document.documentElement.appendChild(wrap); } catch (_) {
    try { document.body.appendChild(wrap); } catch (_) {}
  }

  const teardown = function() {
    try { wrap.remove(); } catch (_) {}
    try { document.body.style.paddingTop = prevPad; } catch (_) {}
  };

  const dismiss = async function() {
    if (persistDismiss) {
      try { await chrome.storage.local.set({ [STORE_KEY]: Date.now() }); } catch (_) {}
    }
    teardown();
  };

  const dismissBtn = document.getElementById('gam-notice-' + id + '-dismiss');
  if (dismissBtn) dismissBtn.addEventListener('click', dismiss);
  if (actionLabel) {
    const actBtn = document.getElementById('gam-notice-' + id + '-action');
    if (actBtn) actBtn.addEventListener('click', function() { if (actionFn) actionFn(teardown); });
  }

  if (autoClearCond) {
    const iv = setInterval(async function() {
      try { if (await autoClearCond()) { clearInterval(iv); teardown(); } } catch (_) {}
    }, 15000);
  }

  return { teardown: teardown };
}

// N-01: Token age > 75 days
(async function __noticeTokenAge() {
  try {
    if (!await _shouldShowNotice('token_age_75')) return;
    const out = await chrome.storage.local.get('gam_settings');
    const settings = (out && out.gam_settings) || {};
    const issued = settings.tokenIssuedAt;
    if (!issued) return;
    const daysOld = (Date.now() - issued) / 86400000;
    if (daysOld < 75) return;
    const daysLeft = Math.max(0, 90 - Math.floor(daysOld));
    gamProactiveNotice({
      id: 'token_age_75',
      severity: 'warn',
      headline: 'TOKEN EXPIRY IN ' + daysLeft + ' DAY' + (daysLeft !== 1 ? 'S' : ''),
      body: 'Issued ' + new Date(issued).toLocaleDateString() + '. Re-claim before the 90-day hard cutoff.',
      action_label: 'RE-CLAIM TOKEN',
      action_fn: function() {
        chrome.runtime.sendMessage({ type: 'GAM_OPEN_POPUP', view: 'token-claim' });
      },
      persist_dismiss: true,
      auto_clear_condition: async function() {
        const s2 = await chrome.storage.local.get('gam_settings');
        return !!(s2 && s2.gam_settings && s2.gam_settings.tokenIssuedAt > issued);
      }
    });
  } catch (_) {}
})();

// N-02: AI budget >= 80%
(async function __noticeAiBudget() {
  try {
    if (!await _shouldShowNotice('ai_budget_80')) return;
    const out = await chrome.storage.local.get('gam_settings');
    const settings = (out && out.gam_settings) || {};
    const used = settings.aiUsageToday || 0;
    const limit = settings.aiDailyLimit || 0;
    if (!limit || (used / limit) < 0.80) return;
    const pct = Math.round((used / limit) * 100);
    gamProactiveNotice({
      id: 'ai_budget_80',
      severity: 'warn',
      headline: 'AI BUDGET ' + pct + '% CONSUMED',
      body: used + ' of ' + limit + ' AI calls used today. Manual summaries required after this point.',
      action_label: 'VIEW USAGE',
      action_fn: function(teardown) { teardown(); },
      persist_dismiss: false,
      one_per_session: true
    });
  } catch (_) {}
})();

// N-03: Watched user posts - wired into feed via modtools content script events.
// The notice function is exposed so modtools.js can call it when a watched post arrives.
window.__gamNoticeWatchedPost = function(post) {
  try {
    const noticeId = 'watched_post_' + String(post.id || Date.now());
    gamProactiveNotice({
      id: noticeId,
      severity: 'warn',
      headline: 'WATCHED USER ACTIVE -- ' + String(post.author || '').toUpperCase(),
      body: 'Posted in ' + String(post.community || 'the forum') + '. Review before it propagates.',
      action_label: 'REVIEW POST',
      action_fn: function(teardown) { teardown(); },
      persist_dismiss: false
    });
    setTimeout(function() {
      try { document.getElementById('gam-notice-' + noticeId).remove(); } catch (_) {}
    }, 90000);
  } catch (_) {}
};
// =============================================================================
// END PATCH 6
// =============================================================================

// v8.5.3: disable a button for the duration of an async op, restore on finish.
async function withLoading(btn, label, fn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = label || orig;
  btn.classList.add('loading');
  try { return await fn(); }
  catch (e) {
    // v10.16.46 A10-Win2: guaranteed snack on any unhandled throw from fn().
    // Closes the broadest silent-failure surface in the extension — 25+ buttons
    // wrapped via withLoading previously had inconsistent per-callsite error
    // handling. Without this catch, the button visibly reset to its original
    // label with NO feedback to the operator. Re-throw preserves any caller-
    // specific error logic.
    try {
      const msg = (e && e.message) || String(e) || 'unknown';
      if (typeof __showToast === 'function') __showToast('Action failed: ' + msg, 'err');
      else console.warn('[withLoading] uncaught:', msg);
    } catch (_) {}
    throw e;
  }
  finally {
    btn.disabled = false;
    btn.textContent = orig;
    btn.classList.remove('loading');
  }
}

// v10.13.0 W1 (P0-02 / R-02): stat-tile delta + sparkline helpers.
// Pattern mirrors _updateKpiDelta() at L5876 but scoped to the 8 popup
// stat tiles (Pending / DR / Banned / Bans-24h / Msgs-24h / Notes-24h /
// AI-today / Auto-UNS). Reads previous value from sessionStorage key
// 'gam_stats_prev_<tile>', writes current, renders directional chip into
// the `#d-<key>` <span class="pop-stat-delta">. CSS rules in popup.css drive
// color via [data-dir="up|down|flat"]; arrow glyphs are part of textContent.
// Persisting in sessionStorage (not chrome.storage.local) is intentional --
// the diff is "since last popup open in this session", not historical.
function _updateStatDelta(tileId, newVal) {
  try {
    var key = 'gam_stats_prev_' + tileId;
    var prev = sessionStorage.getItem(key);
    sessionStorage.setItem(key, String(newVal));
    var el = document.getElementById('d-' + tileId);
    if (!el) return;
    if (prev === null) {
      el.textContent = '';
      el.setAttribute('data-dir', 'none');
      return;
    }
    var diff = newVal - Number(prev);
    if (Number.isNaN(diff)) { el.textContent = ''; el.setAttribute('data-dir', 'none'); return; }
    if (diff === 0) { el.textContent = '='; el.setAttribute('data-dir', 'flat'); return; }
    // ASCII arrows (^/v) -- the JetBrains Mono / SF Mono ticker fonts have
    // tabular glyphs for these; Unicode arrows would force the row to reflow.
    var arrow = diff > 0 ? ' ^' : ' v';
    el.textContent = (diff > 0 ? '+' : '') + diff + arrow;
    el.setAttribute('data-dir', diff > 0 ? 'up' : 'down');
  } catch (_) { /* sessionStorage may be quota-exceeded; non-fatal */ }
}

// v10.13.0 W1 (P0-01 / R-02): sparkline injector. Conditionally adds an
// inline SVG mini-line into the `.pop-stat` tile ONLY when the 7d series has
// at least one non-zero value. Previously a static `<div class="pop-stat-spark">`
// shipped in popup.html with no JS ever writing to it (~14px dead-space per
// tile); HTML now omits the box, JS injects it inside the .pop-stat tile when
// data warrants. Series is a length-7 array of integers (oldest -> newest).
function _injectStatSparkline(tileId, series) {
  try {
    if (!Array.isArray(series) || series.length === 0) return;
    var hasData = false;
    for (var i = 0; i < series.length; i++) { if (series[i] > 0) { hasData = true; break; } }
    if (!hasData) return;
    var tileEl = document.getElementById('s-' + tileId);
    if (!tileEl) return;
    var statEl = tileEl.closest('.pop-stat');
    if (!statEl) return;
    // Idempotent: remove any prior spark before re-injecting
    var existing = statEl.querySelector('.pop-stat-spark');
    if (existing) existing.remove();
    var max = Math.max.apply(null, series);
    if (max <= 0) return;
    var w = 48, h = 12;
    var step = w / (series.length - 1);
    var pts = series.map(function(v, idx) {
      var x = (idx * step).toFixed(1);
      var y = (h - (v / max) * h).toFixed(1);
      return x + ',' + y;
    }).join(' ');
    var spark = document.createElement('div');
    spark.className = 'pop-stat-spark';
    spark.setAttribute('aria-hidden', 'true');
    spark.style.cssText = 'margin-top:2px;height:' + h + 'px;line-height:0;';
    // Static SVG content from numeric series; no user-controlled strings.
    spark.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h
      + '" style="display:block"><polyline points="' + pts
      + '" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/></svg>';
    statEl.appendChild(spark);
  } catch (_) { /* non-fatal -- sparkline is decorative */ }
}

// v10.13.0 W1: 7d binning helper. Takes log array + a type-predicate,
// returns length-7 array (oldest -> newest) of per-day counts.
function _bin7d(log, predicate) {
  var out = [0,0,0,0,0,0,0];
  if (!Array.isArray(log)) return out;
  var nowMs = Date.now();
  for (var i = 0; i < log.length; i++) {
    var l = log[i];
    if (!l || !l.ts) continue;
    var ts = new Date(l.ts).getTime();
    if (Number.isNaN(ts)) continue;
    var ageDays = Math.floor((nowMs - ts) / 86400000);
    if (ageDays < 0 || ageDays >= 7) continue;
    if (!predicate(l)) continue;
    out[6 - ageDays]++;
  }
  return out;
}

// v10.14.0 V14-S2: threshold-driven data-state setter. Replaces static
// HTML data-state attributes with JS-driven values per UIUX2-01 §B.3.
// Tile gets state class based on current value relative to thresholds.
function _setTileState(tileId, state) {
  const el = document.getElementById('s-' + tileId);
  if (!el) return;
  const tile = el.closest('.pop-stat');
  if (!tile) return;
  if (state) tile.dataset.state = state;
  else delete tile.dataset.state;
}

// v10.14.0 V14-S6 (UIUX2-06 F.7): data-loading="true" toggling on stat tiles.
// CSS pulse rule already shipped W1; this wires the callsite that turns it on
// during loadStats and clears it once data lands. Mirrors the gam-kpi pattern.
function _setStatLoading(loading) {
  const tiles = document.querySelectorAll('.pop-stats .pop-stat');
  tiles.forEach(function(t) {
    if (loading) t.dataset.loading = 'true';
    else delete t.dataset.loading;
  });
}

async function loadStats() {
  // v10.14.0 V14-S6: pulse during fetch.
  _setStatLoading(true);
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

    // v10.12 D.3.17: clear skeletons before writing values
    _clearStatSkeletons();
    $('s-pending').textContent = pending;
    $('s-dr').textContent = drPending;
    $('s-banned').textContent = banned;
    $('s-today').textContent = todayBans;
    $('s-msgs').textContent = todayMsgs;
    $('s-notes').textContent = todayNotes;

    // v10.14.0 V14-S2/S3: threshold-driven data-state. Pending = info (always).
    // DR = warn when drReady>0 else info (NOT danger; SHIPMASTER §CONFLICT 6 keeps
    // it cyan/purple for v10.13). Banned = warn at >25, danger at >50/24h-rolling.
    // bans24 = warn at >10. notes24 = warn (always, brand). msgs24 = good.
    _setTileState('pending', 'info');
    _setTileState('dr',      drReady > 0 ? 'warn' : 'info');
    _setTileState('banned',  banned > 50 ? 'danger' : (banned > 25 ? 'warn' : 'info'));
    _setTileState('today',   todayBans > 10 ? 'warn' : 'info');
    _setTileState('msgs',    'good');
    _setTileState('notes',   'warn');

    // v10.13.0 W1 (P0-02 / R-01): wire delta chips for the 6 local-data tiles.
    // AI-today + Auto-UNS update inside their respective RPC fire-and-forget
    // blocks below since their values arrive asynchronously.
    _updateStatDelta('pending', pending);
    _updateStatDelta('dr', drPending);
    _updateStatDelta('banned', banned);
    _updateStatDelta('today', todayBans);
    _updateStatDelta('msgs', todayMsgs);
    _updateStatDelta('notes', todayNotes);

    // v10.13.0 W1 (P0-01 / R-02): inject sparklines for the 3 activity tiles
    // ONLY if the 7d series has at least one non-zero day. Pending / DR /
    // Banned are roster-state snapshots, not activity flows -- no sparkline.
    _injectStatSparkline('today', _bin7d(log, function(l) { return l.type === 'ban'; }));
    _injectStatSparkline('msgs',  _bin7d(log, function(l) { return l.type === 'message' || l.type === 'reply'; }));
    _injectStatSparkline('notes', _bin7d(log, function(l) { return l.type === 'note'; }));

    // ASK-086 / WAVE-B-AUX A.3: fetch AI budget from worker /mod/stats.
    // Fire-and-forget — never blocks the local stat render above.
    // Shows "--" if worker is unreachable or fields not yet present (WAVE-C stats D1).
    (async function() {
      try {
        var aiEl = document.getElementById('s-ai-today');
        if (!aiEl) return;
        var r = await popupRpc('modStats', {});
        if (r && r.ok && r.data) {
          var calls = r.data.ai_calls_today;
          var cap   = r.data.ai_calls_cap;
          if (typeof calls === 'number' && typeof cap === 'number') {
            aiEl.textContent = calls + '/' + cap;
            // v10.13.0 W1 (P0-02): delta on the calls-used number, not the X/Y label
            _updateStatDelta('ai', calls);
            // v10.14.0 V14-S2: AI tile threshold -- warn when used > 80% of cap.
            var ratio = cap > 0 ? (calls / cap) : 0;
            _setTileState('ai-today', ratio > 0.80 ? 'warn' : 'info');
          } else {
            _setTileState('ai-today', 'info');
          }
          // If fields missing, leave '--' placeholder (E.2.5 pattern).
        } else {
          _setTileState('ai-today', 'info');
        }
      } catch (_) { /* non-fatal — AI budget is informational only */ }
    })();

    // v10.14.0 V14-S1: Auto-UNS 8th tile wiring. Worker has modAutoActionRecent
    // RPC (background.js:3802); 24h count drives the value. Threshold-driven
    // data-state: warn at >5 (active automation), good at 1-5, info at 0.
    (async function() {
      try {
        var unsEl = document.getElementById('s-unsticky');
        if (!unsEl) return;
        var r = await popupRpc('modAutoActionRecent', { limit: 50 });
        var rows = (r && r.ok && Array.isArray(r.actions)) ? r.actions
                 : (r && r.ok && r.data && Array.isArray(r.data.actions)) ? r.data.actions
                 : [];
        var cutoff = Date.now() - 86400000;
        var count24 = rows.filter(function(a) {
          if (!a) return false;
          var ts = a.queued_at || a.executed_at || a.ts;
          if (!ts) return false;
          var ms = (typeof ts === 'number') ? ts : new Date(ts).getTime();
          return !isNaN(ms) && ms >= cutoff && a.status === 'done';
        }).length;
        unsEl.textContent = String(count24);
        _updateStatDelta('unsticky', count24);
        _setTileState('unsticky', count24 > 5 ? 'warn' : (count24 > 0 ? 'good' : 'info'));
      } catch (_) { /* non-fatal -- Auto-UNS tile is informational */ }
    })();

    // v10.14.0 V14-S5: dr-alert explicit clear branch. When drReady drops to
    // 0 between popup opens, the prior open's alert content stayed visible.
    const drAlert = $('dr-alert');
    if (drReady > 0) {
      if (drAlert) {
        drAlert.style.display = 'block';
      // v10.13.0 W1 (P1-01 / UIUX2-01): replaced skull color emoji with
      // monochrome SVG warning icon. Keeps the urgency signal but matches
      // the terminal aesthetic and works under accessibility forced-colors
      // / monochrome themes. Static template -- no user content.
        drAlert.innerHTML =
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"'
          + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
          + ' stroke-linejoin="round" aria-hidden="true"'
          + ' style="vertical-align:-2px;margin-right:4px">'
          + '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0'
          + ' 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>'
          + '<line x1="12" y1="9" x2="12" y2="13"/>'
          + '<circle cx="12" cy="17" r="0.5"/>'
          + '</svg>'
          + drReady + ' Death Row inmate' + (drReady > 1 ? 's' : '')
          + ' READY \u2014 visit GAW to execute.';
      }
    } else if (drAlert) {
      drAlert.style.display = 'none';
      drAlert.innerHTML = '';
    }

    const ver = chrome.runtime.getManifest().version;
    $('ver').textContent = 'v' + ver;
  } catch (err) {
    console.error('[Popup] Failed to load stats:', err);
    // v10.12 D.3.17 / v10.13.2 W5 (UIUX2-30): surface error state on stat tile area;
    // hint guides operator to the Diag tab where underlying error context lives.
    const statsGrid = document.querySelector('.pop-stats');
    if (statsGrid && !statsGrid.querySelector('.gam-error-state')) {
      const errEl = gamMakeError({
        severity: 'hard',
        label: 'STATS',
        msg: 'Failed to load stats: ' + (err && err.message || 'unknown'),
        hint: 'Open the Diag tab to inspect the underlying error, or retry — usually a transient worker hiccup.',
        retryFn: loadStats
      });
      errEl.style.cssText = 'grid-column:1/-1;padding:8px 12px';
      statsGrid.insertAdjacentElement('afterend', errEl);
    }
  } finally {
    // v10.14.0 V14-S6: clear loading pulse once stats render (success or fail).
    _setStatLoading(false);
  }
}

// v5.2.0 H2: keep secrets out of every export + debug path.
const SECRET_KEYS = ['workerModToken', 'leadModToken'];

// v10.12.1 PC.1: deep-recursive masker for clipboard/bug-report exports.
// Walks nested objects/arrays and masks ANY field whose KEY name suggests a
// secret OR whose VALUE matches token shape patterns. Idempotent — safe to
// run on already-masked output. Depth-bounded to prevent infinite recursion.
const _SECRET_KEY_PATTERNS = /token|csrf|auth|secret|key|password|cookie|session|bearer|nonce/i;
const _TOKEN_VALUE_RE = /^(mt_[a-z0-9_-]{16,}|sk-[A-Za-z0-9]{20,}|[A-Za-z0-9_-]{32,})$/;

function _maskSecretsDeep(value, depth) {
  if (depth === undefined) depth = 0;
  if (depth > 8) return '[**too-deep**]';
  if (value === null || value === undefined) return value;
  var t = typeof value;
  if (t === 'string') {
    // Mask if value looks like a token (32+ chars matching token pattern)
    if (value.length >= 32 && _TOKEN_VALUE_RE.test(value)) {
      return '***masked(len=' + value.length + ')***';
    }
    return value;
  }
  if (t !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map(function(v) { return _maskSecretsDeep(v, depth + 1); });
  }
  var out = {};
  var entries = Object.entries(value);
  for (var i = 0; i < entries.length; i++) {
    var k = entries[i][0];
    var v = entries[i][1];
    if (_SECRET_KEY_PATTERNS.test(k)) {
      // Mask by key match
      if (typeof v === 'string') {
        out[k] = '***masked(len=' + v.length + ')***';
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        // Encrypted-shape blob like {ct, iv, alg} — keep shape but mask ct
        var copy = Object.assign({}, v);
        if (typeof v.ct === 'string') copy.ct = '***masked-ct(len=' + v.ct.length + ')***';
        out[k] = copy;
      } else {
        out[k] = '***masked***';
      }
    } else {
      out[k] = _maskSecretsDeep(v, depth + 1);
    }
  }
  return out;
}

function scrubExport(data) {
  const out = { ...(data || {}) };
  if (out.gam_settings && typeof out.gam_settings === 'object') {
    const copy = { ...out.gam_settings };
    for (const k of SECRET_KEYS) delete copy[k];
    out.gam_settings = copy;
  }
  // Drop sniff log entirely from exports (may contain auth + moderation payloads)
  delete out.gam_sniff_log;
  // v10.12.1 PC.1: deep-mask remaining fields to catch CSRF/nested tokens
  return _maskSecretsDeep(out);
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
    // E.3.3 (AF-16 Rule 47): replace alert() with showPopupBanner
    showPopupBanner('Export failed: ' + err.message, 'error');
  }
});

// =============================================================================
// E.2.2 (AF-34 Rule 100): importBtn — data import, counterpart to exportBtn
// Placement: footer, between exportBtn and clearBtn (per SHIPMASTER Section J).
// Never overwrites workerModToken / leadModToken from import.
// =============================================================================
(function wireImportBtn() {
  var btn = $('importBtn');
  if (!btn) return;
  btn.addEventListener('click', function() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', async function() {
      var file = inp.files && inp.files[0];
      document.body.removeChild(inp);
      if (!file) return;
      try {
        var text = await file.text();
        var payload = JSON.parse(text);
        if (!payload || payload.scope !== 'owned-keys') {
          showPopupBanner('Import failed: file scope must be "owned-keys"', 'error');
          return;
        }
        var importedVersion = (payload.data && payload.data.gam_settings &&
          payload.data.gam_settings[MAINT_SCHEMA_KEY]) || 0;
        if (importedVersion > MAINT_SCHEMA_CURRENT) {
          showPopupBanner('Import aborted: exported schema version (' + importedVersion + ') is newer than current code (' + MAINT_SCHEMA_CURRENT + '). Downgrade risk.', 'warn');
          return;
        }
        // Strip tokens, sniff_log, fallback_mode from import (device-bound)
        var skipKeys = ['workerModToken', 'leadModToken', 'gam_sniff_log', 'gam_fallback_mode'];
        var toWrite = {};
        var keysRestored = [];
        var keysSkipped = [];
        var importData = payload.data || {};
        Object.keys(importData).forEach(function(k) {
          if (skipKeys.includes(k)) { keysSkipped.push(k); return; }
          if (k === 'gam_settings') {
            // Strip token fields from nested settings object too
            var s = Object.assign({}, importData[k] || {});
            delete s.workerModToken;
            delete s.leadModToken;
            toWrite[k] = s;
          } else {
            toWrite[k] = importData[k];
          }
          keysRestored.push(k);
        });
        await chrome.storage.local.set(toWrite);
        showPopupBanner('Import OK: ' + keysRestored.length + ' key(s) restored. Tokens not overwritten. Reload GAW tabs.', 'success');
        setTimeout(function() { try { loadStats(); } catch(_){} }, 500);
      } catch (err) {
        showPopupBanner('Import failed: ' + (err && err.message || err), 'error');
      }
    });
    inp.click();
  });
})();
// =============================================================================
// END E.2.2
// =============================================================================

$('clearBtn').addEventListener('click', async () => {
  // E.1.1 (AF-20 Rule 60): escalate to TRIPLE-CONFIRM. Renamed "Clear all" -> "Factory reset".
  // Dialog #1: overview of what gets wiped.
  const ok1 = await __popupConfirm({
    title: 'Factory reset — are you sure?',
    body: 'This wipes:\n' +
          '  • Your mod token (you\'ll need a fresh rotation invite from your lead to recover)\n' +
          '  • Lead token (if set)\n' +
          '  • Mod log, roster, death row, watchlist, verification, notes, intel cache\n\n' +
          'Your audit log (gam_diag_log) is preserved. The setup wizard will re-appear to guide re-authentication.\n\n' +
          'This cannot be undone. Proceed to confirmation #2?',
    okLabel: 'Continue',
    cancelLabel: 'Cancel'
  });
  if (!ok1) return;
  // Dialog #2: token-loss warning.
  const ok2 = await __popupConfirm({
    title: 'CONFIRM #2 of 3',
    body: 'This includes your mod token. You cannot recover it yourself — only your Lead can issue a new rotation invite. Are you sure?',
    okLabel: 'Yes, continue',
    cancelLabel: 'No, abort'
  });
  if (!ok2) return;
  // Dialog #3: __popupAskText WIPE confirmation (mirrors maintResetDefaults pattern).
  const wipeText = await __popupAskText({
    title: 'CONFIRM #3 of 3 — Factory reset',
    label: 'Type WIPE to confirm',
    placeholder: 'WIPE',
    max: 8,
    validate: function(v) { return v === 'WIPE' ? '' : 'Type WIPE (uppercase) exactly.'; }
  });
  if (wipeText !== 'WIPE') return;
  try {
    // v9.3.13 (Vanguard M-1): explicitly clear the SW vault BEFORE wiping
    // chrome.storage.local. Pre-fix, the storage wipe alone left the SW
    // vault with the prior token cached (the onChanged listener treated
    // newValue=undefined as no-op), so a "Clear All" appeared to leave the
    // mod still authenticated until the SW evicted naturally. clearTokens
    // RPC zeroes the cache atomically.
    try { await chrome.runtime.sendMessage({ type: 'clearTokens' }); } catch (e) {}
    // v5.1.1: scope clear to ModTools-owned keys only (don't nuke unrelated settings)
    // v10.7.0 UIUX-06 B.1: also remove gam_welcomed so welcome toast fires again after factory reset
    await chrome.storage.local.remove([...OWNED_KEYS, 'gam_welcomed', 'gam_pending_invite_backup']);
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
    // E.3.3 (AF-16 Rule 47): replace alert() with showPopupBanner
    showPopupBanner('Data cleared — reload any GAW tabs', 'success');
    loadStats();
  } catch (err) {
    // E.3.3 (AF-16 Rule 47): replace alert() with showPopupBanner
    showPopupBanner('Clear failed: ' + err.message, 'error');
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
        // v10.12.1 PC.3: deep-mask content-script snapshot before export —
        // prevents CSRF tokens embedded in ctx fields leaking to disk/bug-report
        if (resp && resp.ok) snapshot = _maskSecretsDeep(resp.snapshot);
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
    // E.3.3 (AF-16 Rule 47): replace alert() with showPopupBanner
    showPopupBanner('Debug snapshot failed: ' + err.message, 'error');
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
      // a11y: dialog semantics so AT recognizes this as a modal context.
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      const titleId = 'gam-modal-title-' + Date.now();
      panel.setAttribute('aria-labelledby', titleId);
      const previousFocus = document.activeElement;
      const title = document.createElement('div');
      title.className = 'gam-pop-modal-title';
      title.id = titleId;
      title.textContent = String(o.title || 'Input required');
      const label = document.createElement('label');
      label.className = 'gam-pop-modal-label';
      label.textContent = String(o.label || '');
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = String(o.placeholder || '');
      input.maxLength = Number(o.max) || 120;
      input.className = 'gam-pop-modal-input';
      // v10.7.0 UIUX-06 B.3: support initialValue so callers can pre-fill the field
      if (o.initialValue) { input.value = String(o.initialValue); }
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
        // a11y: restore focus to the element that opened the modal.
        try { previousFocus && previousFocus.focus && previousFocus.focus(); } catch (e) {}
        resolve(val);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
        else if (e.key === 'Enter') { e.stopPropagation(); submit(); }
        else if (e.key === 'Tab') {
          // a11y: focus trap — keep Tab inside the modal panel.
          const focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last  = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
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
      // a11y: dialog semantics so AT recognizes this as a modal context.
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      const titleId = 'gam-modal-title-' + Date.now();
      panel.setAttribute('aria-labelledby', titleId);
      const previousFocus = document.activeElement;
      const title = document.createElement('div');
      title.className = 'gam-pop-modal-title';
      title.id = titleId;
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
        // a11y: restore focus to the element that opened the modal.
        try { previousFocus && previousFocus.focus && previousFocus.focus(); } catch (e) {}
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
        else if (e.key === 'Enter') { e.stopPropagation(); finish(true); }
        else if (e.key === 'Tab') {
          // a11y: focus trap — keep Tab inside the modal panel.
          const focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last  = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
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
    // v10.11 T1 (REDTEAM-1): tokens are encrypted in local storage by the background SW.
    // The popup delegates persistence to the SW (setTokens RPC above). The local write
    // here is a belt-and-suspenders fallback for boot paths -- SW will re-encrypt on
    // next migration check. We therefore write via the background's authValidateToken
    // RPC path when possible. For the direct-local-write fallback below, omit plaintext
    // tokens so we don't write them in clear; the SW's migration will encrypt on boot.
    try {
      const current = await chrome.storage.local.get('gam_settings');
      const s = { ...(current.gam_settings || {}) };
      // NOTE: do NOT write workerModToken/leadModToken in plaintext here.
      // The SW handles encrypted persistence via authValidateToken/authValidateLeadToken RPCs.
      // This block only updates non-token settings (isLeadMod flag, etc.) for the local copy.
      if (hasLead) {
        s.isLeadMod = !!(t.leadModToken || '');
        // Remove stale plaintext if present (migration may not have run yet)
        if (t.leadModToken && s.leadModToken) delete s.leadModToken;
      }
      if (hasWorker && s.workerModToken && !t.workerModToken) delete s.workerModToken; // clearing token
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
        if (statusEl) {
          statusEl.className = 'pop-token-status';
          statusEl.textContent = 'stored';
        }
        // v10.x: tokens card auto-collapse will fire after __applyTierGate whoami
        // (hasTeamToken alone is insufficient — wait for whoami result)
      } else {
        // v10.13.3 W2: explicit State A on no-token (replaces inline status text).
        // Old guidance string is now redundant — State A's onboarding copy
        // handles first-run messaging directly in #tokStateFirstRun.
        try { __tokSetState('first-run'); } catch(_){}
        _cardAuthFailed();
      }
      // v10.13.3 W2: #claimInviteWrap orphan removed (R-06). #claimInviteBtn
      // now lives inside #tokStateFirstRun and is visibility-driven by state.
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
      statusEl.className = 'pop-token-status ok';
      statusEl.textContent = '\u2713 stored (' + t.length + ' chars) \u2014 paste a new value to replace';
    } else {
      // v9.20.0 - much louder first-run guidance. Pre-fix message buried.
      statusEl.className = 'pop-token-status warn';
      statusEl.innerHTML = '<div style="background:#0a0a0b;border:2px solid #ff9933;padding:10px 12px;margin:6px 0;color:#ff9933;font-weight:600;letter-spacing:0.04em">\u{1F449} PASTE YOUR TEAM MOD TOKEN BELOW <br><br><span style="color:#9b9892;font-weight:400;font-size:10.5px;text-transform:none;letter-spacing:0">Or if you have an invite LINK, click \u{1F4E8} Claim invite further down. The popup will detect either an invite code OR a token in this field.</span></div>';
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
        const probe = await popupRpc('modWhoami');
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
      // E.3.2 (AF-32 Rule 95): distinguish SW cold-start from worker rejection
      var saveErrMsg = r && r.error || 'unknown';
      if (/Could not establish connection|receiving end does not exist|message port closed/i.test(saveErrMsg)) {
        statusEl.textContent = 'Service worker is starting — wait 3s and try again. If this persists, reload the extension.';
      } else {
        statusEl.textContent = 'save failed: ' + saveErrMsg;
      }
    }
    return;
  }
  try {
    // v5.0-Phase-1: route through background RPC vault. authValidateToken
    // tests the candidate against /version server-side and stores it on success.
    const r = await popupRpc('authValidateToken', { token: token });
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
// =============================================================================
// v10.x PATCH 4 \u2014 Multi-Lead tier gate
// Replaces __applyLeadGate with __applyTierGate.
// Backward-compat: workers without 'tier' field fall back to is_lead boolean.
// =============================================================================
let _gamTier = 'mod'; // fail-closed default
let _gamWhoamiUsername = '';

// Keep __applyLeadGate as a thin wrapper for any legacy call sites.
async function __applyLeadGate() {
  return await __applyTierGate();
}

async function __applyTierGate() {
  const tools = $('leadOnlyTools');
  if (!tools) return;
  tools.style.display = 'none';

  // v10.13.3 W2: explicit timeout fallback. If whoami never resolves AND
  // never rejects within 5s, the Tokens tab would otherwise stay in its
  // pre-render limbo.
  // v10.14.0 V14-T5 (RALPH-RECOVERY A.9 / RALPH-TOKENS F4): pre-fix the timeout
  // hard-routed to first-run AND set _whoamiTimedOut=true so a late-resolve
  // was discarded entirely. Now: timeout shows a "Reconnecting..." snack,
  // routes to first-run (still gives user an actionable path), but does NOT
  // discard a late resolve -- if whoami eventually returns, re-apply state B.
  let _whoamiTimedOut = false;
  const _whoamiTimer = setTimeout(function() {
    _whoamiTimedOut = true;
    try { __tokSetState('first-run'); } catch(_){}
    try { _cardAuthFailed(); } catch(_){}
    // v10.14.0 V14-T5: visible reconnecting state so user knows it's in flight.
    try {
      var statusEl = document.getElementById('whoamiStatus') || document.getElementById('tokRecoveryStatus');
      if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'whoamiStatus';
        statusEl.className = 'pop-token-status';
        statusEl.style.cssText = 'color:var(--bb-warn);margin-top:4px;font-size:11px';
        var card = document.getElementById('card-tokens');
        if (card) card.appendChild(statusEl);
      }
      statusEl.textContent = 'Reconnecting...';
    } catch(_){}
  }, 5000);

  try {
    const r = await popupRpc('modWhoami');
    clearTimeout(_whoamiTimer);
    if (!r || !r.ok || !r.data) {
      // v10.24.0 (lockout-proof L2): a returning operator whose token was REJECTED
      // (L1 flags gam_auth_failed) -- or who has a token backup -- is NOT a new mod.
      // Show RECOVERY (reframe + pre-open token paste + point to the .bat), never the
      // bare NEW-MOD onboarding that dumped the lead into the invite-claim dead end.
      let _wasAuthed = false;
      try {
        const _f = await chrome.storage.local.get(['gam_auth_failed', 'gam_token_backup_v1']);
        _wasAuthed = !!(_f && (_f.gam_auth_failed || _f.gam_token_backup_v1));
      } catch (_) {}
      if (_wasAuthed) { try { __tokShowRecovery(); } catch (_) { try { __tokSetState('first-run'); } catch (__) {} } }
      else { try { __tokSetState('first-run'); } catch (_) {} }
      _cardAuthFailed();
      return;
    }
    // v10.14.0 V14-T5: late-resolve recovery -- if the timeout fired earlier,
    // clear the "Reconnecting..." status and continue rendering State B.
    if (_whoamiTimedOut) {
      try {
        var rs = document.getElementById('whoamiStatus');
        if (rs) rs.remove();
      } catch(_){}
    }
    // Backward-compat: tier field or is_lead boolean
    // v10.5.1 INVARIANT: clamp to known enum; unknown server value fails closed to 'mod'
    const _rawTier = r.data.tier || (r.data.is_lead ? 'lead' : 'mod');
    if (!['mod', 'senior_lead', 'lead'].includes(_rawTier)) {
      console.warn('[ModTools v10.5.1] unexpected tier value from server:', _rawTier, '-- defaulting to mod');
    }
    _gamTier = ['mod', 'senior_lead', 'lead'].includes(_rawTier) ? _rawTier : 'mod';
    _gamWhoamiUsername = r.data.username || '';

    __renderTierBadge(_gamTier);
    __applyTierVisibility(_gamTier, r);

    // v10.13.3 W2: compute token age from gam_settings.rotated_at, then
    // switch the tab into State B/C via __tokSetState. Replaces the implicit
    // "render everything, then hide via JS" pattern with explicit state.
    let _ageDays = -1;
    try {
      const _st = await chrome.storage.local.get('gam_settings');
      // v10.13.5 P0-A (RALPH AUDIT): __applyTierGate previously read only
      // gam_settings.rotated_at, but the local first-run/claim path writes
      // workerModToken_issued_at (background.js:2408). Without the fallback,
      // the W2 60/90d age tier banner was structurally unreachable for every
      // typical mod -- "Token active" forever regardless of real token age.
      const _ra = _st && _st.gam_settings && (_st.gam_settings.rotated_at || _st.gam_settings.workerModToken_issued_at);
      if (_ra) _ageDays = Math.floor((Date.now() - new Date(_ra).getTime()) / 86400000);
    } catch(_) {}
    try {
      __tokSetState('returning', {
        username:    _gamWhoamiUsername,
        tier:        _gamTier,
        verifiedAgo: 0,
        ageDays:     _ageDays,
        encrypted:   true   // always true since v10.11
      });
    } catch(_){}

    // v10.13.3 W2: Lead section now lives inside #tokStateReturning (Tokens
    // tab State C). Show only for lead/senior_lead. The old #leadSection
    // location inside #card-lead is gone.
    const _leadSec = document.getElementById('leadSection');
    if (_leadSec) _leadSec.style.display = (_gamTier === 'lead' || _gamTier === 'senior_lead') ? '' : 'none';

    // Auto-collapse tokens card on auth success (kept for legacy badge path)
    await _cardAutoCollapseTokens(true);
    // Show lead KPI row + quick actions for full leads
    __loadLeadKpi();
  } catch (_) {
    if (_whoamiTimedOut) return;
    clearTimeout(_whoamiTimer);
    // Network/auth failure - explicit State A, fail-closed
    try { __tokSetState('first-run'); } catch(_){}
    _cardAuthFailed();
  }
}

function __renderTierBadge(tier) {
  const badge = $('tierBadge');
  if (!badge) return;
  if (tier === 'lead') {
    badge.textContent = 'LEAD';
    badge.className = 'pop-tier-badge tier-lead';
    badge.style.display = '';
  } else if (tier === 'senior_lead') {
    badge.textContent = 'SR-LEAD';
    badge.className = 'pop-tier-badge tier-senior-lead';
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

function __setSrLeadLoadingHint(visible) {
  const el = $('srLeadEmptyHint');
  if (el) el.style.display = visible ? '' : 'none';
}

function __applyTierVisibility(tier, whoamiData) {
  const r = whoamiData || {};
  const data = r.data || r || {};

  // v10.13.5 P1-02 (RALPH AUDIT W2 F4 + TOKENS F3 + LEADDAILY F1): Lead nav
  // tab routes to an empty panel (#tab-panel-lead has display:none baseline,
  // not cleared by setTab). 3 agents corroborated. Lead content lives on the
  // Tokens tab (Quick Actions + Lead KPIs). Keep the tab hidden for ALL
  // tiers so clicking it never shows nothing. Was: leadTab.style.display
  // toggled on for tier === 'lead'.
  const leadTab = document.querySelector('[data-tab="lead"]');
  if (leadTab) leadTab.style.display = 'none';

  // #leadOnlyTools: visible for senior_lead AND lead
  const tools = $('leadOnlyTools');
  if (tools) {
    tools.style.display = (tier !== 'mod') ? '' : 'none';
    if (tier === 'senior_lead') __setSrLeadLoadingHint(true);
  }

  const isFullLead = (tier === 'lead');

  // Lead-exclusive nodes (hidden for senior_lead)
  const leadExclusive = [
    'maintAuditVerify', 'maintFullReport',
    'maintAutoToggle', 'maintAutoSave', 'maintAutoStatus', 'maintRunNow'
  ];
  leadExclusive.forEach(function(id) {
    const el = $(id);
    if (!el) return;
    el.style.display = isFullLead ? '' : 'none';
    const parentRow = el.closest && el.closest('.pop-maint-row');
    if (parentRow) parentRow.style.display = isFullLead ? '' : 'none';
  });

  // Bug reports: senior_lead read-only
  const bugVisSave = $('bugVisSave');
  const bugVisInput = $('bugVisInput');
  if (bugVisSave) bugVisSave.style.display = isFullLead ? '' : 'none';
  if (bugVisInput) bugVisInput.readOnly = !isFullLead;

  // v9.6.2 OPTIONAL hint for lead token input
  if (tier !== 'mod') {
    try {
      const lbl = document.querySelector('label[for="leadInput"]');
      if (lbl && !document.getElementById('lead-optional-hint')) {
        const hint = document.createElement('div');
        hint.id = 'lead-optional-hint';
        hint.style.cssText = 'font-size:10.5px;color:#3dd68c;margin:2px 0 4px;';
        hint.innerHTML = '\u2713 Your team token (' + (data.username || 'this account') + ') already authenticates you as lead. ' +
          'This field is OPTIONAL \u2014 only needed for dual-factor ops (audit backfill, health/extended).';
        lbl.parentNode.insertBefore(hint, lbl.nextSibling);
      }
    } catch (_) {}
  }

  // Lead KPI row and quick-actions: full lead only
  const kpiRow = $('leadKpiRow');
  const qaRow  = $('leadQuickActions');
  if (kpiRow) kpiRow.style.display = isFullLead ? 'grid' : 'none';
  if (qaRow)  qaRow.style.display  = isFullLead ? 'flex'  : 'none';

  // v10.17: AI usage today — wire #gam-lead-ai-usage on open
  const aiUsageDetails = $('gam-lead-ai-usage');
  if (aiUsageDetails && isFullLead) {
    aiUsageDetails.addEventListener('toggle', function onAiUsageToggle() {
      if (!aiUsageDetails.open) return;
      aiUsageDetails.removeEventListener('toggle', onAiUsageToggle);
      popupRpc('modStats').then(function(r) {
        var d = r && r.ok && r.data ? r.data : {};
        var expl = (d.ai_explains_today != null) ? String(d.ai_explains_today) : '—';
        var summ = (d.ai_summaries_today != null) ? String(d.ai_summaries_today) : '—';
        var sugg = (d.ai_suggests_today != null) ? String(d.ai_suggests_today) : '—';
        var eEl = $('aiUsageExplains'), sEl = $('aiUsageSummaries'), gEl = $('aiUsageSuggests'), stEl = $('aiUsageStatus');
        if (eEl) eEl.textContent = expl;
        if (sEl) sEl.textContent = summ;
        if (gEl) gEl.textContent = sugg;
        if (stEl) stEl.textContent = r && r.ok ? '' : (r && r.error ? 'error: ' + r.error.slice(0, 60) : 'worker not deployed');
      }).catch(function(e) {
        var stEl = $('aiUsageStatus');
        if (stEl) stEl.textContent = 'error: ' + (e && e.message ? e.message.slice(0, 60) : 'unknown');
      });
    }, { passive: true });
  }

  // v10.12: lapsedModsCard replaced by lapsedModsChip (shown by __loadLapsedMods when count > 0)

  // Restart setup button: v10.14.0 V14-T2 (RALPH-TOKENS F2). Pre-fix only
  // shown for lead/senior_lead, leaving regular mods with stale tokens no
  // affordance to re-paste. Workflow-breaking inversion. Show for all tiers.
  const rsw = $('restartSetupWrap');
  if (rsw) rsw.style.display = '';

  if (tier === 'senior_lead') {
    // Hint auto-hides as soon as content loads
    setTimeout(function() { __setSrLeadLoadingHint(false); }, 1500);
  }
}

// Confirm modal for tier changes (Patch 4)
function __showConfirmModal(opts) {
  return new Promise(function(resolve) {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;' +
      'display:flex;align-items:center;justify-content:center';
    const safeTitle = String(opts.title || '').replace(/[<>&"]/g, function(c){ return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]; });
    const safeBody2 = String(opts.body  || '').replace(/[<>&"]/g, function(c){ return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]; });
    const safeLbl   = String(opts.confirmLabel || 'Confirm').replace(/[<>&"]/g, function(c){ return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]; });
    const ccls      = String(opts.confirmClass || '');
    overlay.innerHTML =
      '<div style="background:#1a1d24;border:1px solid #3b414d;border-radius:6px;' +
      'padding:16px;max-width:260px;width:90%;font-size:12px;color:#e5e9f0">' +
      '<div style="font-weight:700;margin-bottom:8px">' + safeTitle + '</div>' +
      '<div style="color:#9b9892;margin-bottom:14px">' + safeBody2 + '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="pop-btn pop-btn-ghost" id="__cmCancel">Cancel</button>' +
      '<button class="pop-btn ' + ccls + '" id="__cmConfirm">' + safeLbl + '</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#__cmCancel').onclick  = function() { overlay.remove(); resolve(false); };
    overlay.querySelector('#__cmConfirm').onclick = function() { overlay.remove(); resolve(true);  };
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); resolve(false); } };
  });
}

function __showToast(msg, type) {
  // Minimal toast for tier change feedback
  try {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:99999;' +
      'background:' + (type === 'err' ? '#3a0a0a' : '#0a1f0a') + ';' +
      'border:1px solid ' + (type === 'err' ? '#ff3333' : '#3dd68c') + ';' +
      'color:' + (type === 'err' ? '#ff3333' : '#3dd68c') + ';' +
      'font:600 11px ui-monospace,monospace;padding:6px 12px;border-radius:3px';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { try { t.remove(); } catch (_) {} }, 3000);
  } catch (_) {}
}

async function __confirmTierChange(username, selectEl) {
  const newTier  = selectEl.value;
  const prevTier = selectEl.dataset.curtier || 'mod';
  if (newTier === prevTier) return;

  // Revert while modal is open
  selectEl.value = prevTier;

  const confirmed = await __showConfirmModal({
    title:        'Change tier for u/' + username,
    body:         prevTier + ' -> ' + (newTier === 'senior_lead' ? 'sr-lead' : newTier),
    confirmLabel: 'Confirm',
    confirmClass: 'pop-btn-danger'
  });
  if (!confirmed) return;

  try {
    // E.2.1 (AF-12 Rule 36): converted to popupRpc
    const r = await popupRpc('adminModPromote', { mod_username: username, tier: newTier });
    if (r && r.ok) {
      selectEl.value = newTier;
      selectEl.dataset.curtier = newTier;
      selectEl.setAttribute('data-curtier', newTier);
      __showToast('u/' + username + ' is now ' + newTier, 'ok');
    } else {
      __showToast('Promote failed: ' + ((r && r.error) || 'unknown'), 'err');
    }
  } catch (e) {
    __showToast('RPC error: ' + (e && e.message || e), 'err');
  }
}
// =============================================================================
// END PATCH 4
// =============================================================================

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
    const r = await popupRpc('authValidateLeadToken', { token: token });
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

// v10.14.2 LD2: shared invite-click helper. Pre-fix the deep-dive #inviteBtn
// flow (generateInvite) and the Quick-Actions #qaInviteBtn flow had divergent
// implementations that drifted (PARAM-SHAPE bug at qaInvite L6925, FIELD-NAME
// bug L6926, default-target bug L6928 caught in v10.12.1). Centralizing the
// invite ask + RPC + URL extract into _handleInviteClick keeps both buttons
// in lockstep. Caller passes `target = 'deep'` (writes inviteResult inline)
// or `target = 'qa'` (uses snack/toast + copyWithPulse).
async function _handleInviteClick(target) {
  const isQa = target === 'qa';
  const resultEl = isQa ? null : $('inviteResult');
  if (resultEl) {
    resultEl.className = 'pop-token-status';
    resultEl.textContent = 'requesting...';
  }
  try {
    if (!isQa) {
      const { gam_settings } = await chrome.storage.local.get('gam_settings');
      const s = gam_settings || {};
      const tok = s.workerModToken || '';
      const lead = s.leadModToken || '';
      if (!tok || !lead){
        resultEl.className = 'pop-token-status err';
        resultEl.textContent = 'need both team + lead token first';
        return;
      }
    }
    // Username prompt -- deep-dive treats target as optional (audit-only),
    // qa makes it required (matches the v10.12.1 fix that prompted explicitly).
    let who;
    if (await __hardeningOnPopup()) {
      const raw = await __popupAskText({
        title: 'Invite target',
        label: isQa ? 'GAW username this invite is for' : 'GAW username this invite is for (optional, for audit)',
        placeholder: 'username',
        max: 24,
        validate: function (v) {
          if (!v) return isQa ? 'Required.' : '';
          return /^[A-Za-z0-9_-]{3,24}$/.test(v) ? '' : 'Username 3-24 chars.';
        }
      });
      if (raw == null) {
        if (resultEl) resultEl.textContent = 'cancelled';
        return;
      }
      who = raw;
      if (isQa && !who) return;
    } else {
      who = prompt(isQa ? 'GAW username this invite is for:' : 'GAW username this invite is for (optional, for audit):', '') || '';
      if (isQa && !who) return;
    }
    const rInv = await popupRpc('adminInviteCreate', { mod: who });
    const url = rInv && rInv.ok && rInv.data && (rInv.data.url || rInv.data.invite_url);
    if (!url) {
      if (isQa) {
        try { __showToast('Invite failed: ' + ((rInv && rInv.error) || 'unknown'), 'err'); } catch(_){}
      } else {
        resultEl.className = 'pop-token-status err';
        resultEl.textContent = 'rejected (HTTP ' + (rInv && rInv.status || '?') + ')';
      }
      return;
    }
    if (isQa) {
      const qaBtn = $('qaInviteBtn');
      if (qaBtn) copyWithPulse(qaBtn, url);
      try { __showToast('Invite for ' + who + ' copied to clipboard', 'ok'); } catch(_){}
      return;
    }
    // Deep-dive path: render link inline + auto-copy to clipboard.
    resultEl.className = 'pop-token-status ok';
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
    if (isQa) {
      try { __showToast('Invite failed: ' + (e && e.message || e), 'err'); } catch(_){}
    } else if (resultEl) {
      resultEl.className = 'pop-token-status err';
      resultEl.textContent = 'network error: ' + (e && e.message || e);
    }
  }
}

// Backwards-compat thin wrapper -- still called from a few legacy paths.
async function generateInvite() { return _handleInviteClick('deep'); }

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

function __makeCopyBtn(label, payload, parentBtn, primary) {
  const b = document.createElement('button');
  // v10.15.6: primary variant for the lead's most-used artifact (DM template).
  b.className = primary ? 'pop-btn pop-btn-primary' : 'pop-btn pop-btn-ghost';
  b.style.cssText = primary
    ? 'font-size:10px;padding:3px 8px;margin-right:4px;font-weight:600'
    : 'font-size:10px;padding:2px 6px;margin-right:4px';
  b.textContent = label;
  // v10.13.2 W5: route through copyWithPulse (3-layer fallback + COPIED flash)
  b.addEventListener('click', function () { copyWithPulse(b, payload); });
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
  // v10.15.6: DM template promoted to FIRST + primary styling per Commander
  // 2026-05-12 "convenient" feedback. The pre-filled Discord DM is the
  // highest-leverage artifact (greeting + clickable URL + manual fallback +
  // TTL note + single-use disclaimer) and was previously third/last/ghost.
  // Pre-v9.2.6 order (URL / code / DM) optimised for "share a URL anywhere";
  // current order optimises for "paste a complete DM into Discord and go."
  btnRow.appendChild(__makeCopyBtn('✉ Copy DM template', __dmTemplate(invite.username, invite.code, ttlHours), null, true));
  btnRow.appendChild(__makeCopyBtn('🔗 Copy invite link', inviteUrl));
  btnRow.appendChild(__makeCopyBtn('Copy code only', invite.code));
  block.appendChild(btnRow);

  container.appendChild(block);

  // v9.2.6: auto-copy the FULL INVITE URL (was raw code). The URL is what
  // the recipient pastes into their browser; the bare code on its own
  // requires extra steps. URL is the primary lead artifact.
  try { navigator.clipboard.writeText(inviteUrl); } catch (e) {}
}

async function __issueSingleFromRoster(username, rowEl, tokens) {
  // v5.0-Phase-1: route through RPC vault; background attaches tokens.
  const rsi = await popupRpc('adminIssueInvite', { username: username });
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

// v10.5.0: DM all unrotated mods their rotation invite via Discord.
// Calls /admin/rotation/dm-all-unrotated and renders per-mod result table inline.
async function __dmAllUnrotated(panel, tokens) {
  const unrotated = tokens.filter(m => !m.rotated_at && !m.is_lead);
  const confirmed = await __popupConfirm({
    title: 'DM rotation invites to Discord?',
    body: 'This will DM ' + unrotated.length + ' unrotated mod(s) their rotation invite via Discord. ' +
          'Mods without a linked Discord account will be listed for manual copy. Proceed?',
    okLabel: 'Send DMs',
    cancelLabel: 'Cancel'
  });
  if (!confirmed) return;

  const btn = panel.querySelector('[data-dm-all-btn]');
  if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }

  let data;
  try {
    const resp = await __popupPost('/admin/rotation/dm-all-unrotated', { include_zip: true });
    data = await resp.json();
  } catch (e) {
    if (btn) { btn.textContent = '📨 DM all (error)'; btn.disabled = false; }
    console.error('[dm-all-unrotated]', e);
    return;
  }

  // Replace button with inline result block
  const container = btn ? btn.parentElement : panel;
  if (btn) btn.remove();

  const summary = document.createElement('div');
  summary.style.cssText = 'font-size:11px;color:#888;margin:4px 0 6px';
  summary.textContent = 'Sent: ' + data.sent + ' | No Discord: ' + data.skipped_no_discord + ' | Errors: ' + data.errors;
  container.appendChild(summary);

  for (const r of (data.results || [])) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0;font-size:11px';

    const name = document.createElement('span');
    name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#ccc';
    name.textContent = r.username;
    row.appendChild(name);

    const status = document.createElement('span');
    if (r.ok) {
      status.style.color = '#4caf50';
      status.textContent = '✓ DM sent';
    } else if (r.reason === 'no_discord') {
      status.style.color = '#ffa726';
      status.textContent = '(no Discord)';
      // Fallback: issue a fresh invite and copy link to clipboard
      const copyBtn = document.createElement('button');
      copyBtn.className = 'pop-btn pop-btn-ghost';
      copyBtn.style.cssText = 'font-size:10px;padding:2px 6px;margin-left:4px';
      copyBtn.textContent = 'Copy invite';
      copyBtn.addEventListener('click', async () => {
        try {
          const ir = await __popupPost('/admin/mod/rotation-invite', { mod_username: r.username });
          const id = await ir.json();
          if (id.ok && id.code) {
            // v10.14.1 CC1: route via copyWithPulse for 3-layer fallback + COPIED flash
            copyWithPulse(copyBtn, 'https://greatawakening.win/?mt_invite=' + id.code);
          } else {
            copyBtn.textContent = 'Error';
          }
        } catch (_) { copyBtn.textContent = 'Error'; }
      });
      row.appendChild(copyBtn);
    } else {
      status.style.color = '#f44336';
      status.textContent = '✗ ' + String(r.error || 'failed').slice(0, 50);
    }
    row.appendChild(status);
    container.appendChild(row);
  }
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
  const rBulk = await popupRpc('adminBulkInvite', {});
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
  // v10.16.19: VERTICAL-STACK rebuild. Previous flex-row layouts (v9.2.3
  // ellipsis, v10.16.18 flex-wrap) both proved unreliable at 380px popup
  // body width when buttons + tier dropdown ate the horizontal budget.
  // Commander reported names STILL invisible on v10.16.18. Bulletproof fix:
  // stop using flex layout for the primary info entirely. Each row is now
  // a vertical stack -- name on its OWN line at full row width, status
  // below, action buttons on a third line. No flex collapse possible. The
  // name occupies the entire row width (~340px after padding) so any
  // username is fully visible at 13px font without truncation or ellipsis.
  const row = document.createElement('div');
  row.dataset.rosterMod = m.mod_username;
  row.style.cssText = 'padding:8px 6px;border-bottom:1px solid #1a1c20;display:flex;flex-direction:column;gap:3px';

  // ── Line 1: NAME (own row, full width, prominent) ──
  const name = document.createElement('div');
  name.style.cssText = 'color:#e4e4e4;font-weight:700;font-size:13px;line-height:1.3;word-break:break-all';
  name.textContent = m.mod_username + (m.is_lead ? ' 👑' : '');
  row.appendChild(name);

  // ── Line 2: STATUS (rotated date / never-rotated warning) ──
  const status = document.createElement('div');
  status.style.cssText = 'font-size:10px;line-height:1.4;word-break:break-word';
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
  row.appendChild(status);

  // ── Line 3: ACTION BUTTONS (own row, flex with wrap) ──
  // Only added if there's anything to put here (non-lead → Issue button,
  // full lead viewer → tier dropdown). For mods viewing a lead's own row,
  // skip the actions line entirely so the row is compact.
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:2px';
  let actionsHaveContent = false;

  if (!m.is_lead) {
    const btn = document.createElement('button');
    btn.className = 'pop-btn pop-btn-ghost';
    btn.style.cssText = 'font-size:10px;padding:3px 10px';
    btn.textContent = m.rotated_at ? 'Re-issue' : 'Issue';
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.textContent = 'issuing...';
      try {
        await __issueSingleFromRoster(m.mod_username, row, tokens);
      } finally {
        btn.disabled = false;
        btn.textContent = m.rotated_at ? 'Re-issue' : 'Issue';
      }
    });
    actions.appendChild(btn);
    actionsHaveContent = true;
  }

  // v10.x Patch 4: tier dropdown (full lead only)
  if (_gamTier === 'lead') {
    const tierWrap = document.createElement('label');
    tierWrap.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#9b9892';
    tierWrap.appendChild(document.createTextNode('tier:'));
    const tierSel = document.createElement('select');
    tierSel.className = 'roster-tier-sel';
    tierSel.dataset.mod = m.mod_username;
    tierSel.style.cssText = 'font-size:10px;padding:1px 4px;background:#0a0a0b;color:#e4e4e4;border:1px solid #2a2a2a';
    const curTier = m.tier || (m.is_lead ? 'lead' : 'mod');
    tierSel.dataset.curtier = curTier;
    ['mod', 'senior_lead', 'lead'].forEach(function(t) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t === 'senior_lead' ? 'sr-lead' : t;
      opt.selected = (curTier === t);
      tierSel.appendChild(opt);
    });
    tierSel.setAttribute('data-curtier', curTier);
    tierSel.addEventListener('change', function() { __confirmTierChange(m.mod_username, tierSel); });
    tierWrap.appendChild(tierSel);
    actions.appendChild(tierWrap);
    actionsHaveContent = true;
  }

  if (actionsHaveContent) row.appendChild(actions);
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
    const rList = await popupRpc('adminListMods', {});
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

    // v10.5.0: DM all unrotated via Discord
    const dmAllBtn = document.createElement('button');
    dmAllBtn.id = 'rosterDmAll';
    dmAllBtn.className = 'pop-btn pop-btn-ghost';
    dmAllBtn.setAttribute('data-dm-all-btn', '');
    dmAllBtn.style.cssText = 'font-size:11px;padding:4px 10px;flex-shrink:0;margin-left:4px';
    if (unrotatedNonLead.length > 0) {
      dmAllBtn.textContent = '📨 DM all (' + unrotatedNonLead.length + ')';
      dmAllBtn.addEventListener('click', () => __dmAllUnrotated(panel, tokens));
    } else {
      dmAllBtn.textContent = '📨 DM all';
      dmAllBtn.disabled = true;
      dmAllBtn.style.opacity = '0.5';
    }
    header.appendChild(dmAllBtn);

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
    const rRot = await popupRpc('authRotateSelf', {});
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

// v10.28.0: a lead self-recovering via GAW LEAD RESCUE holds a TEAM TOKEN, not a
// rotation invite -- but both are base64url, so the claim field accepts the token
// and the worker rejects it ("claim failed: invalid"). Tokens and invite codes
// are indistinguishable by shape; the only reliable test is whether the value
// AUTHENTICATES. This adopts a pasted value as a token: save it, probe
// /mod/whoami, keep it on success, roll the save back on failure. Returns the
// username on success (it IS a token), or null (let the caller claim as normal).
async function __tryAdoptCodeAsToken(code) {
  try {
    if (!__isTokenShape(code)) return null;
    const r = await saveTokensSecurely({ workerModToken: code });
    if (!r || !r.ok) return null;
    const probe = await popupRpc('modWhoami');
    if (probe && probe.ok && probe.data && probe.data.username) return probe.data.username;
    // Not a valid token after all -- roll the transient save back so we never
    // leave a bad token persisted (same pattern as the Team Mod Token field).
    try { await saveTokensSecurely({ workerModToken: '' }); } catch (_) {}
    return null;
  } catch (_) { return null; }
}

async function claimRotationInvite() {
  const status = $('rotateStatus');
  if (!status) return;
  status.className = 'pop-token-status';
  try {
    // v10.16.19: pre-fill from chrome.storage.session if the recipient
    // clicked the invite URL recently. The content script's invite-claim
    // IIFE (modtools.js L25478) stages the code into gam_pending_invite
    // and the username into gam_pending_invite_for. Pre-fix this
    // claimRotationInvite handler ignored both -- mods had to retype
    // both fields even when the staged data was sitting right there.
    // Commander reported "their invites never work" -- partial root
    // cause: too much friction for non-technical mods to claim. Also
    // checks the chrome.storage.local backup that survives session.
    let stagedCode = '';
    let stagedUsername = '';
    try {
      const sess = await chrome.storage.session.get(['gam_pending_invite', 'gam_pending_invite_for']);
      stagedCode = (sess && sess.gam_pending_invite) || '';
      const stagedFor = sess && sess.gam_pending_invite_for;
      if (stagedFor && stagedFor !== '__paste_into_token_field__') stagedUsername = stagedFor;
    } catch (_) {}
    if (!stagedCode) {
      try {
        const lo = await chrome.storage.local.get('gam_pending_invite_backup');
        const bk = lo && lo.gam_pending_invite_backup;
        if (bk && bk.code && Date.now() - (bk.staged_at || 0) < 24 * 60 * 60 * 1000) {
          stagedCode = bk.code;
          if (bk.gaw_username) stagedUsername = bk.gaw_username;
        }
      } catch (_) {}
    }

    const username = await __popupAskText({
      title: 'Claim rotation invite',
      label: 'Your GAW username (must match the invite)' + (stagedUsername ? ' — auto-filled from invite link' : ''),
      placeholder: 'username',
      initialValue: stagedUsername || '',
      max: 32,
      validate: function (v) {
        if (!v) return 'username required';
        return /^[A-Za-z0-9_-]{2,32}$/.test(v) ? '' : 'invalid username shape';
      }
    });
    if (!username) { status.textContent = 'cancelled'; return; }

    const code = await __popupAskText({
      title: 'Invite code',
      label: 'Paste the rotation invite code from the lead mod' + (stagedCode ? ' — auto-filled from invite link' : ''),
      placeholder: 'invite code',
      initialValue: stagedCode || '',
      max: 96,
      validate: function (v) {
        if (!v) return 'code required';
        return /^[A-Za-z0-9_-]{16,96}$/.test(v) ? '' : 'malformed code';
      }
    });
    if (!code) { status.textContent = 'cancelled'; return; }

    // v10.28.0: foolproofing -- a lead recovering via GAW LEAD RESCUE pastes a
    // TEAM TOKEN here (same base64url shape as an invite code). If it
    // authenticates, adopt it directly instead of failing "claim ... invalid".
    try {
      const _adoptedUser = await __tryAdoptCodeAsToken(code);
      if (_adoptedUser) {
        status.className = 'pop-token-status ok';
        status.textContent = '✓ that was your team TOKEN, not an invite -- saved it. You are ' + _adoptedUser;
        _showVerifyTokenBtn();
        try { await loadToken(); } catch (e) {}
        try { await loadLead(); } catch (e) {}
        return;
      }
    } catch (_) {}

    status.textContent = 'claiming...';
    // v5.0-Phase-1: authClaimInvite validates the code, stores the new token in the vault.
    const rClaim = await popupRpc('authClaimInvite', { code: code, username: username });
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
      // v10.28.0: if it wasn't a valid invite, it may be a team token in the wrong box.
      msg += ' (if this is your team TOKEN, paste it in the "Team Mod Token" field instead)';
      status.textContent = msg;
      return;
    }
    const claimData = rClaim.data || {};
    status.className = 'pop-token-status ok';
    status.textContent = '✓ claimed -- you are now ' + (claimData.mod_username || username);
    _showVerifyTokenBtn();
    // v10.16.20: clear the self-rotated flag -- this is a fresh claim,
    // the new token came from a lead invite, the CTA should re-surface
    // so the new mod is prompted to self-rotate.
    try { await chrome.storage.local.remove('gam_self_rotated_at'); } catch (_) {}
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
    const r = await popupRpc('modWhoami');
    if (r && r.ok && r.data && r.data.username) {
      status.className = 'pop-token-status ok';
      status.textContent = '✓ verified -- token works as ' + r.data.username;
      try { await __noteWhoami(r.data.username); } catch(_){}
    } else {
      status.className = 'pop-token-status err';
      status.textContent = '✗ token verification FAILED -- you may be locked out. Use lead-issued rotation invite to recover.';
    }
  } catch (e) {
    status.className = 'pop-token-status err';
    status.textContent = 'verify error: ' + (e && e.message || e);
  }
}

// v10.1: Two-mods-same-machine collision guard. Drive Desktop sync ships
// a single unpacked/ folder to multiple mod machines. If two mods share
// a Chrome profile (same gam_settings local store), the second mod's
// claim-rotation silently overwrites the first's token. Symptom: mod A
// suddenly authenticates as mod B with no warning. The guard detects when
// the whoami-resolved username changes and surfaces a non-blocking modal
// the moment it happens. We don't auto-rollback (the user's intent might
// be a deliberate switch — e.g. lead testing a non-lead account); we just
// make the situation impossible to miss.
async function __noteWhoami(username) {
  if (!username) return;
  try {
    const out = await chrome.storage.local.get('gam_last_whoami_username');
    const prev = (out && out.gam_last_whoami_username) || '';
    if (prev && prev !== username) {
      // Persist the new identity FIRST so dismissing the modal doesn't
      // re-trigger on the next whoami probe.
      try { await chrome.storage.local.set({ gam_last_whoami_username: username }); } catch(_){}
      // Render an in-popup modal (not window.alert — blocking modals are
      // hostile and skipped by power users).
      const backdrop = document.createElement('div');
      backdrop.className = 'gam-pop-modal-backdrop';
      backdrop.style.zIndex = '2147483647';
      const _idTitleId = 'gam-modal-title-' + Date.now();
      backdrop.innerHTML =
        '<div class="gam-pop-modal-panel" role="dialog" aria-modal="true" aria-labelledby="' + _idTitleId + '" style="max-width:420px;border-color:#a78bfa">' +
          '<div class="gam-pop-modal-title" id="' + _idTitleId + '" style="color:#a78bfa">⚠ Identity changed</div>' +
          '<div class="gam-pop-modal-body">' +
            'This Chrome profile previously authenticated as <strong style="color:#ffd84d">' + escapeHtml(prev) + '</strong>.\n\n' +
            'You are now authenticated as <strong style="color:#3dd68c">' + escapeHtml(username) + '</strong>.\n\n' +
            'If this was intentional (rotation, testing a different account) — fine, dismiss this.\n\n' +
            'If this was UNEXPECTED (e.g. shared computer, Drive Desktop sync, two mods on the same Chrome profile) — your previous token has been replaced. To prevent silent overwrites, use a separate Chrome profile per mod account.' +
          '</div>' +
          '<div class="gam-pop-modal-btnrow">' +
            '<button class="gam-pop-modal-btn-ok" style="background:#a78bfa">OK, got it</button>' +
          '</div>' +
        '</div>';
      const _idPanel = backdrop.querySelector('.gam-pop-modal-panel');
      const _idPrevFocus = document.activeElement;
      document.body.appendChild(backdrop);
      const okBtn = backdrop.querySelector('.gam-pop-modal-btn-ok');
      const _idOnKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); dismiss(); }
        else if (e.key === 'Tab' && _idPanel) {
          const focusable = _idPanel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last  = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      const dismiss = () => {
        try { document.removeEventListener('keydown', _idOnKey, true); } catch(_){}
        try { backdrop.remove(); } catch(_){}
        try { _idPrevFocus && _idPrevFocus.focus && _idPrevFocus.focus(); } catch(_){}
      };
      if (okBtn) okBtn.addEventListener('click', dismiss);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) dismiss(); });
      document.addEventListener('keydown', _idOnKey, true);
      try { okBtn && okBtn.focus(); } catch(_){}
    } else if (!prev) {
      // First time we resolve a username — record without warning.
      try { await chrome.storage.local.set({ gam_last_whoami_username: username }); } catch(_){}
    }
  } catch (e) { /* never throw from a guard */ }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
  // v10.16.20: prominent self-rotate CTA. Wires the banner button + manages
  // visibility based on `gam_self_rotated_at` flag. Banner shows when the
  // mod has an authenticated token (workerModToken length>=32) AND has
  // never self-rotated. Hides once rotateToken succeeds (which sets the
  // flag below).
  const ctaBtn = $('selfRotateCtaBtn');
  const ctaWrap = $('selfRotateCta');
  const ctaDismiss = $('selfRotateCtaDismiss');
  if (ctaBtn) ctaBtn.addEventListener('click', function () {
    withLoading(ctaBtn, 'rotating…', async function () {
      await rotateToken();
      // After successful rotation rotateToken sets status='✓ rotated ...'
      // We check + write the persistent flag here. If rotation failed the
      // CTA stays visible.
      try {
        const status = $('rotateStatus');
        const ok = status && /rotated/.test(status.textContent || '');
        if (ok) {
          await chrome.storage.local.set({ gam_self_rotated_at: Date.now() });
          if (ctaWrap) ctaWrap.style.display = 'none';
        }
      } catch (_) {}
    });
  });
  // v10.16.20: Dismiss path for mods who already self-rotated before this
  // banner shipped (or who genuinely don't want to rotate, e.g. lead is
  // themselves). Sets the same flag without actually rotating. Re-shows
  // ONLY if the underlying token changes (chrome.storage.onChanged below
  // re-evaluates), which is the right behavior -- a fresh claim should
  // re-surface the CTA.
  if (ctaDismiss) ctaDismiss.addEventListener('click', async function () {
    try {
      await chrome.storage.local.set({ gam_self_rotated_at: Date.now() });
      if (ctaWrap) ctaWrap.style.display = 'none';
    } catch (_) {}
  });
  // v10.16.20: also auto-open the token-management details for unrotated
  // mods so they discover the alternate paths (re-enter token, etc.) when
  // they expand the disclosure -- separate from the CTA above.
  async function _evaluateSelfRotateCta() {
    try {
      const out = await chrome.storage.local.get(['gam_settings', 'gam_self_rotated_at']);
      const s = (out && out.gam_settings) || {};
      const hasToken = !!(s.workerModToken && String(s.workerModToken).length >= 32);
      const hasRotated = !!(out && out.gam_self_rotated_at);
      // Show CTA only when authed AND not yet self-rotated.
      if (ctaWrap) ctaWrap.style.display = (hasToken && !hasRotated) ? '' : 'none';
      // Auto-open the details when needed.
      const det = $('tokManagementDetails');
      if (det && hasToken && !hasRotated) det.setAttribute('open', '');
    } catch (_) {}
  }
  _evaluateSelfRotateCta();
  try {
    chrome.storage.onChanged.addListener(function (changes) {
      if (changes && (changes.gam_settings || changes.gam_self_rotated_at)) _evaluateSelfRotateCta();
    });
  } catch (_) {}
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
    // E.2.6 (AF-06 Rule 18): add console.warn to silent catch
    }).catch(function(e){ console.warn('[Popup] storage.get settings failed:', e); });
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
          // v10.12 D.3.4: update crawlStatusLabel with last-crawl timestamp
          const labelEl = document.getElementById('crawlStatusLabel');
          if (labelEl) labelEl.textContent = '\u00b7 last crawl: just now';
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
    if (!r || !r.ok) { showPopupBanner('Dashboard load failed. Need open GAW tab + mod token.', 'error'); return; }
    const html = buildDashboardHtml(r.data && r.data.report || {});
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    chrome.tabs.create({ url });
  } catch (e) {
    // E.3.3 (AF-16 Rule 47): replace alert() with showPopupBanner
    showPopupBanner('Dashboard failed: ' + e.message, 'error');
  }
});

// v10.18.3: SNAPSHOT FOR FIX popup wiring. Sends a `gamSnapshotForFix`
// message to the active GAW tab; the Wave 6 IIFE in modtools-aux.js handles
// it -- captures live page state, formats markdown, writes to clipboard,
// persists to chrome.storage.local.gam_last_snapshot. Surfaces success /
// failure inline in the Diag tab so the operator knows the clipboard has
// the payload without having to switch tabs.
(function __wireSnapshotForFixBtn() {
  const b = $('snapshotForFixBtn');
  if (!b) return;
  b.addEventListener('click', async () => {
    const st = $('snapshotForFixStatus');
    if (st) { st.className = 'pop-token-status'; st.textContent = 'capturing live page state...'; }
    try {
      const r = await sendToActiveGawTab({ type: 'gamSnapshotForFix' });
      if (!r) {
        if (st) { st.className = 'pop-token-status err'; st.textContent = 'no response -- need an active GAW tab'; }
        try { showPopupBanner('Snapshot: open a greatawakening.win tab first.', 'error'); } catch (_) {}
        return;
      }
      if (r.ok) {
        if (st) {
          st.className = 'pop-token-status ok';
          st.textContent = '✓ snapshot copied (' + r.copyMethod + ', ' + (r.length || 0) + ' chars) -- paste to Claude';
        }
      } else {
        const msg = r.error || ('clipboard failed -- check chrome.storage.local.gam_last_snapshot');
        if (st) { st.className = 'pop-token-status err'; st.textContent = msg; }
      }
    } catch (e) {
      if (st) { st.className = 'pop-token-status err'; st.textContent = 'capture failed: ' + (e && e.message || e); }
    }
  });
})();

// v10.18.2: GOD MODE Search launcher. Hand-off flow:
//   1. ask SW for the team token via the popup-only popupRevealTeamToken RPC
//   2. copyWithPulse (3-layer fallback) writes it to the clipboard + flashes the button
//   3. chrome.tabs.create opens the standalone /godmode app in a new tab
//   4. mod pastes once on the destination page (it persists to localStorage there)
// Closes the friction gap named in HANDOFF_FIREHOSE_GODMODE.md §7 / open item #2.
// Token never transits via URL or DOM text -- only the SW->popup channel + clipboard.
const __GODMODE_APP_URL_POPUP = WORKER_BASE_POPUP + '/godmode';
async function __runGodmodeHandoff() {
  const btn = $('godmodeBtn');
  const statusEl = $('godmodeBtnStatus');
  if (statusEl) { statusEl.className = 'pop-token-status'; statusEl.textContent = 'fetching token...'; }
  let token = '';
  try {
    const r = await popupRpc('popupRevealTeamToken', {});
    if (r && r.ok && r.token) {
      token = String(r.token);
    } else {
      const errMsg = (r && r.error) || 'no team token stored -- claim or paste a token first';
      if (statusEl) { statusEl.className = 'pop-token-status err'; statusEl.textContent = errMsg; }
      try { showPopupBanner('GOD MODE: ' + errMsg, 'error'); } catch (_) {}
      return;
    }
  } catch (e) {
    const errMsg = 'reveal failed: ' + (e && e.message || e);
    if (statusEl) { statusEl.className = 'pop-token-status err'; statusEl.textContent = errMsg; }
    return;
  }
  // Sequence matters: write clipboard BEFORE opening the tab. tabs.create steals
  // focus, which would break Layer 2 (navigator.clipboard requires document.hasFocus).
  try { await copyWithPulse(btn, token); } catch (_) {}
  try {
    if (statusEl) {
      statusEl.className = 'pop-token-status ok';
      statusEl.textContent = '✓ token copied -- opening GOD MODE in a new tab. Paste on the destination page once.';
    }
    chrome.tabs.create({ url: __GODMODE_APP_URL_POPUP });
  } catch (e) {
    if (statusEl) {
      statusEl.className = 'pop-token-status err';
      statusEl.textContent = 'open-tab failed: ' + (e && e.message || e);
    }
  } finally {
    token = '';
  }
}
(function __wireGodmodeBtn() {
  const b = $('godmodeBtn');
  if (b) b.addEventListener('click', __runGodmodeHandoff);
})();

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
    // v10.7.0 UIUX-06 B.3: also read gam_pending_invite_for to pre-fill username field
    const out = await chrome.storage.session.get(['gam_pending_invite', 'gam_pending_invite_for']);
    let code = (out && out.gam_pending_invite) || '';
    let _stagedUsername = (out && out.gam_pending_invite_for && out.gam_pending_invite_for !== '__paste_into_token_field__') ? out.gam_pending_invite_for : '';
    // v10.0: fall back to chrome.storage.local backup if session was wiped
    // (extension reload during onboarding). 5-min TTL on the backup; expire
    // anything older than that.
    if (!code) {
      try {
        const lo = await chrome.storage.local.get('gam_pending_invite_backup');
        const bk = lo && lo.gam_pending_invite_backup;
        if (bk && bk.code && bk.staged_at && (Date.now() - bk.staged_at) < (bk.ttl_ms || 300000)) {
          code = bk.code;
          // v10.7.0 UIUX-06 B.3: capture username from backup so pre-fill works after extension reload
          if (!_stagedUsername && bk.gaw_username && bk.gaw_username !== '__paste_into_token_field__') { _stagedUsername = bk.gaw_username; }
          // Re-stage in session so subsequent paths see it.
          try { await chrome.storage.session.set({ gam_pending_invite: code, gam_pending_invite_for: bk.gaw_username || '', gam_pending_invite_at: bk.staged_at }); } catch(_){}
          statusEl.textContent = 'recovered staged invite from local backup...';
        } else if (bk) {
          // Expired backup -- purge.
          try { await chrome.storage.local.remove('gam_pending_invite_backup'); } catch(_){}
        }
      } catch(_){}
    }
    if (!code) {
      // v10.7.0 UIUX-06 B.4: add recovery action to "no invite staged" dead-end
      statusEl.textContent = 'No invite link detected. Click the invite link your lead sent you in a GAW tab first, then return here and click Claim invite. Or paste your mt_invite_... URL directly into the Team Mod Token field above.';
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
    // v10.7.0 UIUX-06 B.3: pre-fill username from staged gam_pending_invite_for if available
    const username = await __popupAskText({
      title: 'Claim rotation invite',
      label: 'Your GAW username (any spelling \u2014 match is case-insensitive since v9.3.0)',
      placeholder: 'e.g. PresidentialSeal',
      initialValue: _stagedUsername || '',
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
    const rClaim = await popupRpc('authClaimInvite', { code: code, username: username });
    if (!rClaim || !rClaim.ok) {
      statusEl.className = 'pop-token-status err';
      let msg = 'claim rejected';
      if (rClaim && rClaim.status) msg += ' (HTTP ' + rClaim.status + ')';
      if (rClaim && rClaim.data && rClaim.data.error) msg += ' -- ' + rClaim.data.error;
      else if (rClaim && rClaim.error) msg += ' -- ' + rClaim.error;
      statusEl.textContent = msg;
      return;
    }
    // v10.16.23 (QA5 P1-A): collapse the two-step cleanup (session.remove +
    // local.remove) into a single Promise.all so a popup-close mid-await
    // can't leave gam_pending_invite_backup orphaned in local storage with
    // session already cleared. Both cleanups race in parallel; the popup
    // closing kills both. Symmetric atomic cleanup matches the symmetric
    // atomic staging in modtools.js.
    try {
      await Promise.all([
        chrome.storage.session.remove('gam_pending_invite'),
        chrome.storage.local.remove('gam_pending_invite_backup')
      ]);
    } catch (e) { /* both best-effort */ }
    const claimData = rClaim.data || {};
    statusEl.className = 'pop-token-status ok';
    statusEl.textContent = '\u2713 claimed \u2014 you are now ' + (claimData.mod_username || username);
    // v10.16.23 (QA5 P1-B): DON'T remove gam_self_rotated_at here. v10.16.22
    // removed it before the auto-rotate confirm, which created a 3-write
    // sequence (remove \u2192 auto-rotate set OR ctaDismiss set) and made the
    // amber CTA banner flash visible briefly. Now: only clear the flag if
    // the user DECLINES the auto-rotate prompt below (so the banner shows
    // as a backup discoverability surface). If they accept and rotation
    // succeeds, the set at L3580 writes the correct timestamp. If they
    // accept and rotation fails, we still clear so they're reminded.
    try { await loadToken(); } catch (e) {}
    try { await loadLead(); } catch (e) {}

    // v10.16.22: AUTO-PROMPT self-rotate immediately after successful claim.
    // Commander explicitly asked: "workflow-wise, once this is finished,
    // it should offer the ability to rotate the mod token (away from the
    // lead token) immediately." Previously the rotate path was either
    // (a) buried inside a collapsed <details> or (b) surfaced only via
    // the v10.16.20 amber CTA banner which the operator had to notice on
    // their own. Now: immediately after claim, fire a confirm modal that
    // offers one-click rotate -- so the lead's record of the original
    // invite-derived token can never be used to impersonate this mod.
    // Non-blocking: skip on confirm-cancel, log + continue if rotate fails.
    try {
      const wantRotate = await __popupConfirm({
        title: '\u{1F510} Rotate your token now?',
        body: 'You\'re now authenticated as ' + (claimData.mod_username || username) + '.\n\n' +
              'Your current token came from your lead\'s rotation invite, so the lead can still authenticate AS YOU until you rotate.\n\n' +
              'Rotating generates a fresh random token that ONLY YOU know -- the lead loses impersonation access.\n\n' +
              'Recommended. You can rotate again any time from the Tokens tab.',
        okLabel: '\u{1F504} Rotate now',
        cancelLabel: 'Skip (rotate later)'
      });
      if (!wantRotate) {
        // v10.16.23 (QA5 P1-B): user declined auto-rotate. Clear the flag NOW
        // so the v10.16.20 amber CTA banner re-surfaces as backup
        // discoverability. If we don't clear, the banner would only appear
        // if the flag was missing for some other reason -- and a freshly-
        // claimed mod who declined the prompt SHOULD still see the banner.
        try { await chrome.storage.local.remove('gam_self_rotated_at'); } catch (_) {}
      } else {
        try {
          const rRot = await popupRpc('authRotateSelf', {});
          if (rRot && rRot.ok) {
            statusEl.textContent = '\u2713 claimed + rotated \u2014 you are now ' + (claimData.mod_username || username) + ' (lead lost impersonation access)';
            try { await chrome.storage.local.set({ gam_self_rotated_at: Date.now() }); } catch (_) {}
            try { await loadToken(); } catch (_) {}
          } else if (rRot && rRot.error === 'rotation_save_failed') {
            // v10.16.23 (QA2 P0): mirror manual rotateToken() CRITICAL branch at
            // popup.js:2920. The worker DID rotate the token but the local
            // storage write failed -- the mod is now operating on an
            // INVALIDATED server-side token that they can't recover from
            // without lead intervention. Surface the CRITICAL banner instead
            // of the generic "retry from Tokens tab" message.
            statusEl.className = 'pop-token-status err';
            statusEl.textContent = '\u2713 claimed BUT CRITICAL: token rotated on server, FAILED to save locally. ' +
              'You may be locked out after browser restart. ' +
              'Contact lead mod for a fresh rotation invite to recover. Detail: ' + (rRot.detail || '');
            // Don't clear gam_self_rotated_at -- the server DID rotate; banner
            // can't help (re-rotation would also fail until lead reissues).
          } else {
            // Rotation failed -- claim is still valid, just leave a warning.
            statusEl.textContent = '\u2713 claimed (rotation failed: ' + ((rRot && rRot.error) || 'unknown') + ' \u2014 retry from Tokens tab)';
            statusEl.className = 'pop-token-status warn';
            // v10.16.23 (QA5 P1-B follow-up): clear flag so the amber CTA
            // banner re-surfaces as backup. Lead still has impersonation
            // access; mod needs to retry rotation.
            try { await chrome.storage.local.remove('gam_self_rotated_at'); } catch (_) {}
          }
        } catch (rotErr) {
          statusEl.textContent = '\u2713 claimed (rotation error: ' + (rotErr && rotErr.message || rotErr) + ' \u2014 retry from Tokens tab)';
          statusEl.className = 'pop-token-status warn';
          // Same as generic-failure branch above: surface the banner.
          try { await chrome.storage.local.remove('gam_self_rotated_at'); } catch (_) {}
        }
      }
    } catch (_) { /* confirm modal failed -- continue */ }

    // ASK-069 / WAVE-B-AUX A.2: welcome celebration toast \u2014 first-time claim only.
    // gam_welcomed flag persists in local storage; skip banner on subsequent claims.
    try {
      const welStore = await chrome.storage.local.get('gam_welcomed');
      if (!welStore || !welStore.gam_welcomed) {
        const welcomeUser = (claimData.mod_username || username) || 'Mod';
        showPopupBanner(
          'Welcome, ' + welcomeUser + '! Your token is stored and ModChat is live. You\'re ready to moderate.',
          'success'
        );
        await chrome.storage.local.set({ gam_welcomed: true });
      }
    } catch (_) { /* non-fatal: welcome toast is pure UX polish */ }
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

// v10.13.3 W2: __maybeShowClaimInvite was a redundant IIFE that toggled
// #claimInviteWrap visibility. The wrap is gone (R-06); #claimInviteBtn now
// lives inside State A and is visibility-driven by __tokSetState. No-op.
// --- v7.2 Platform Hardening END ---

// AF-39 (Rule 116 / C.2.9): dynamic version — replaces stale hardcoded v5.2.8 in popup.html L24
(function() {
  try {
    var verEl = document.getElementById('ver');
    if (verEl) verEl.textContent = 'v' + chrome.runtime.getManifest().version;
  } catch (_) {}
})();

// E.2.5 (AF-09 Rule 26): set '--' placeholder in stat cells before loadStats() runs
// Prevents blank-to-zero flash on cold start or after storage clear.
// ASK-086 / WAVE-B-AUX A.3: s-ai-today added to placeholder list.
['s-pending','s-dr','s-banned','s-today','s-msgs','s-notes','s-ai-today'].forEach(function(id) {
  var el = document.getElementById(id);
  if (el && !el.textContent.trim()) el.textContent = '--';
});

loadStats();
refreshSniffLabel();
loadToken();
loadLead();

// v9.21.0 - First-run onboarding wizard (Commander explicit ask 2026-05-08:
// "agent brainstorm team should have caught the fact that when there are
// no AUTH tokens, the tab should automatically focus there and lead the
// user through the first authentication iteration").
// 3-path wizard: invite link / invite code / pre-minted team token. Each
// path collapses to its specific input + verifies via worker. On success,
// shows welcome + auto-hides after 5s. Persists state in chrome.storage.session
// so a refresh during step 2 doesn't reset.
(async function initFirstRunWizard() {
  // v10.13.3 W2: wizard wrapper #firstRunWizard removed; State A
  // (#tokStateFirstRun) is the new container. We still need to gate path-
  // button + step-2 + success behavior the same way, but the visibility
  // of the container is now driven by __tokSetState() not local opacity.
  const stateA = document.getElementById('tokStateFirstRun');
  const path1 = document.getElementById('firstRunPathLink');
  if (!stateA || !path1) return;

  // v10.3 (Auth Carry-Over RCA primary fix): wizard now reads via the SW
  // tokensStatus RPC instead of raw chrome.storage.local. Pre-fix the
  // wizard read local storage directly while loadToken read the SW vault;
  // after a Drive Desktop sync triggered an extension reload, the SW
  // session cache was empty while local still held the token — the two
  // reads disagreed and the wizard popped up for already-authed mods
  // (catsfive screenshot 2026-05-08). __tokensStatus routes through the
  // SW which forces loadSecrets() on cold cache, cascading session →
  // local → IDB; both reads converge. Token found → wizard hides
  // automatically with zero re-entry required.
  let hasToken = false;
  try {
    const status = await __tokensStatus();
    hasToken = !!(status && status.hasTeamToken);
  } catch (_) {
    // Fallback to local-storage read so a hard SW failure doesn't strand the wizard
    try {
      const out = await chrome.storage.local.get('gam_settings');
      const s = (out && out.gam_settings) || {};
      hasToken = !!(s.workerModToken && String(s.workerModToken).length >= 32);
    } catch (_) {}
  }
  if (hasToken) {
    // v10.13.3 W2: fast-path State B render. Token is in storage so the
    // user is at minimum a returning mod; __applyTierGate will refine
    // username/tier/age into the banner shortly. Showing State B
    // immediately avoids a flash-of-empty-tokens-card.
    try { __tokSetState('returning', { username: '', tier: 'mod', verifiedAgo: 0, ageDays: -1, encrypted: true }); } catch(_){}
    // v10.16.22: DON'T early-return. The path-button + step-2 listeners
    // below MUST be wired even when a token is already stored, because
    // the operator can re-enter State A via the "Re-run setup" button
    // (added in _cardWizardComplete) and click LINK/CODE/Raw-token. Pre-
    // fix the early return left those buttons dead -- Commander reported
    // "I go to CODE to manually enter the invite code into the mod's
    // browser but nothing pops up. It does not show a field where I can
    // enter the invite token." Listener wiring is idempotent (only fires
    // once per popup load), no harm in always running it.
  } else {
    // No token → State A. Reset step-2 / success containers; path row is
    // always visible inside State A.
    try { __tokSetState('first-run'); } catch(_){}
    const _step2  = document.getElementById('firstRunWizardStep2');
    const _ok     = document.getElementById('firstRunWizardSuccess');
    if (_step2) _step2.style.display = 'none';
    if (_ok)    _ok.style.display    = 'none';
  }

  // v10.13.3 W2: showStep semantics changed -- there's no step 1 (path row
  // is always visible). showStep(2) shows step-2 form, showStep(3) shows
  // success. showStep(1) is now an alias for "reset back to path picker"
  // which means hide step-2 and success.
  function showStep(n) {
    const s2 = document.getElementById('firstRunWizardStep2');
    const sk = document.getElementById('firstRunWizardSuccess');
    if (s2) s2.style.display = n === 2 ? 'block' : 'none';
    if (sk) sk.style.display = n === 3 ? 'block' : 'none';
    // v10.15.5 QA-A2 LOW: hide the install accordion during the wizard success
    // state. Pre-fix the green success banner + Open-GAW CTA + Done button
    // appeared side-by-side with the still-visible "Install help" expandable
    // accordion (mild UX noise after a successful claim).
    const accord = document.getElementById('firstRunInstallAccordion');
    if (accord) accord.style.display = (n === 3) ? 'none' : '';
    // Hide the path-row only while step 2 / success are active
    const pathRow = document.querySelector('#tokStateFirstRun .tok-path-row');
    const pathDiv = document.querySelector('#tokStateFirstRun .tok-path-divider');
    const claimEl = document.getElementById('claimInviteBtn');
    const claimSt = document.getElementById('claimInviteStatus');
    const showPicker = (n !== 2 && n !== 3);
    if (pathRow) pathRow.style.display = showPicker ? '' : 'none';
    if (pathDiv) pathDiv.style.display = showPicker ? '' : 'none';
    if (claimEl) claimEl.style.display = showPicker ? '' : 'none';
    if (claimSt) claimSt.style.display = showPicker ? '' : 'none';
  }
  showStep(1);

  let pathChoice = null;  // 'link' | 'code' | 'token'

  $('firstRunPathLink').addEventListener('click', () => {
    pathChoice = 'link';
    $('firstRunStep2Prompt').textContent = 'Paste the FULL invite URL your lead sent you (https://greatawakening.win/?mt_invite=...)';
    $('firstRunInput').placeholder = 'https://greatawakening.win/?mt_invite=...';
    $('firstRunInput').type = 'text';
    $('firstRunUsernameWrap').style.display = 'block';
    showStep(2);
    setTimeout(() => $('firstRunInput').focus(), 50);
  });
  $('firstRunPathCode').addEventListener('click', () => {
    pathChoice = 'code';
    $('firstRunStep2Prompt').textContent = 'Paste the invite CODE (48 alphanumeric chars, no URL)';
    $('firstRunInput').placeholder = 'IKHZK9SRz0s89AxBK017DPn36xlanZXov...';
    $('firstRunInput').type = 'password';
    $('firstRunUsernameWrap').style.display = 'block';
    showStep(2);
    setTimeout(() => $('firstRunInput').focus(), 50);
  });
  $('firstRunPathToken').addEventListener('click', () => {
    pathChoice = 'token';
    $('firstRunStep2Prompt').textContent = 'Paste your already-minted team mod token (sent by lead)';
    $('firstRunInput').placeholder = 'paste 32-256 char team token';
    $('firstRunInput').type = 'password';
    $('firstRunUsernameWrap').style.display = 'none';
    showStep(2);
    setTimeout(() => $('firstRunInput').focus(), 50);
  });
  $('firstRunBack').addEventListener('click', () => {
    pathChoice = null;
    $('firstRunInput').value = '';
    $('firstRunUsername').value = '';
    $('firstRunStatus').textContent = '';
    showStep(1);
  });
  // v10.14.2 FR3: live username validation in the claim wizard. Shows a
  // colored hint as the mod types so they catch shape errors before the
  // worker rejects the claim. Pattern matches the static hint in HTML.
  (function _wireFirstRunUsernameValidation() {
    const inp = $('firstRunUsername');
    const hint = $('firstRunUsernameHint');
    if (!inp || !hint) return;
    const _USERNAME_RE = /^[A-Za-z0-9_-]{2,64}$/;
    const __validate = () => {
      const v = inp.value || '';
      if (!v) {
        hint.textContent = 'Allowed: A-Z a-z 0-9 _ -, 2-64 chars';
        hint.style.color = '#5a5752';
        inp.style.borderColor = '#3d3a35';
        return;
      }
      if (_USERNAME_RE.test(v)) {
        hint.textContent = '✓ valid format';
        hint.style.color = '#44dd66';
        inp.style.borderColor = '#44dd66';
      } else {
        hint.textContent = '✗ invalid -- A-Z a-z 0-9 _ - only, 2-64 chars';
        hint.style.color = '#ff6b3d';
        inp.style.borderColor = '#ff6b3d';
      }
    };
    inp.addEventListener('input', __validate);
    inp.addEventListener('blur', __validate);
  })();
  // v10.5.1 AFFORDANCE: Done button on success step — collapses the tokens card
  // so the wizard visually closes. Pre-fix: success screen had no exit affordance.
  const _firstRunDoneBtn = $('firstRunDone');
  if (_firstRunDoneBtn) {
    _firstRunDoneBtn.addEventListener('click', function() {
      _cardWizardComplete();
    });
  }
  $('firstRunGo').addEventListener('click', async () => {
    const input = $('firstRunInput').value.trim();
    const status = $('firstRunStatus');
    if (!input) { status.textContent = 'paste something first'; status.style.color = '#ff3b3b'; return; }

    if (pathChoice === 'link' || pathChoice === 'code') {
      // Extract code from URL if path is 'link'
      let code = input;
      if (pathChoice === 'link') {
        const m = input.match(/[?&]mt_invite=([A-Za-z0-9_-]+)/);
        if (!m) { status.textContent = 'URL has no mt_invite=... parameter'; status.style.color = '#ff3b3b'; return; }
        code = m[1];
      }
      const username = $('firstRunUsername').value.trim();
      if (!username) { status.textContent = 'enter your GAW username'; status.style.color = '#ff3b3b'; return; }
      status.textContent = '⌛ minting your team token via /mod/token/claim-rotation...';
      status.style.color = '#ff9933';
      try {
        const r = await popupRpc('authClaimInvite', { code, username });
        if (!r || !r.ok) {
          status.textContent = 'claim failed: ' + ((r && r.data && r.data.error) || (r && r.error) || 'unknown');
          status.style.color = '#ff3b3b';
          return;
        }
        // Verify
        const who = await popupRpc('modWhoami');
        if (who && who.ok && who.data && who.data.username) {
          try { await __noteWhoami(who.data.username); } catch(_){}
          $('firstRunSuccessName').textContent = 'Welcome, u/' + who.data.username + (who.data.is_lead ? ' (lead)' : '');
          showStep(3);
          // v10.13.3 W2: legacy token-input opacity reset removed -- the token
          // input now lives inside #tokManagementDetails (State B), not next to
          // the wizard. State transition handles visibility.
          setTimeout(() => { _cardWizardComplete(); try { loadToken(); loadLead(); loadStats(); } catch(_){} }, 5000);
        } else {
          status.textContent = 'token minted but whoami probe failed -- try refreshing';
          status.style.color = '#ffd84d';
        }
      } catch (e) {
        status.textContent = 'error: ' + (e && e.message || e);
        status.style.color = '#ff3b3b';
      }
      return;
    }

    if (pathChoice === 'token') {
      if (!/^[A-Za-z0-9_-]{32,256}$/.test(input)) {
        status.textContent = 'token shape invalid (need 32-256 alphanumeric + _-)';
        status.style.color = '#ff3b3b';
        return;
      }
      status.textContent = '⌛ saving + verifying via /mod/whoami...';
      status.style.color = '#ff9933';
      try {
        const sr = await popupRpc('setTokens', { workerModToken: input });
        // Note: setTokens RPC may not exist; fall back to saveTokensSecurely
        // v10.11 T1 (REDTEAM-1): do NOT write plaintext token to chrome.storage.local here.
        // If the RPC fails, use authValidateToken which handles encryption in the SW.
        if (!sr || !sr.ok) {
          // Fallback: use authValidateToken RPC which validates AND persists encrypted.
          // Direct chrome.storage.local writes of plaintext tokens are no longer safe.
          try { await popupRpc('authValidateToken', { token: input }); } catch (_) {}
        }
        const who = await popupRpc('modWhoami');
        if (who && who.ok && who.data && who.data.username) {
          try { await __noteWhoami(who.data.username); } catch(_){}
          $('firstRunSuccessName').textContent = 'Welcome, u/' + who.data.username + (who.data.is_lead ? ' (lead)' : '');
          showStep(3);
          // v10.13.3 W2: legacy token-input opacity reset removed -- the token
          // input now lives inside #tokManagementDetails (State B), not next to
          // the wizard. State transition handles visibility.
          setTimeout(() => { _cardWizardComplete(); try { loadToken(); loadLead(); loadStats(); } catch(_){} }, 5000);
        } else {
          // Likely the user pasted an invite code instead of a token
          status.innerHTML = 'worker rejected as token (HTTP ' + (who && who.status || '?') + '). It looks like you may have pasted an INVITE CODE instead. Click Back and try the "invite CODE" path.';
          status.style.color = '#ff3b3b';
        }
      } catch (e) {
        status.textContent = 'error: ' + (e && e.message || e);
        status.style.color = '#ff3b3b';
      }
      return;
    }
  });
})();

// v10.12 D.3.1: wireTabNav — leadSection/leadOnlyTools special-case REMOVED.
// #leadSection and #leadOnlyTools are now inside #card-lead (data-tab="lead").
// Standard data-tab gate handles all card visibility. Tab panels use [hidden] attr.
// v9.15.0 - tab nav (Commander #30: eliminate vertical scrollbars).
(function wireTabNav() {
  // TAB_MAP: only legacy non-panel elements that still need data-tab tagging.
  // Cards now carry data-tab directly in HTML; tab panels use [hidden].
  const TAB_MAP = {
    stats:  ['.pop-stats', '#pop-drill', '.pop-alert', '#dr-alert', '#firstrun-banner'],
    // v10.13.3 W2: #claimInviteWrap orphan removed; #claimInviteBtn now lives
    // inside #card-tokens > #tokStateFirstRun, so the card's data-tab="tokens"
    // attribute already covers it. No legacy non-panel selectors here.
    tokens: [],
    tools:  ['.pop-actions'],
    lead:   [],
    diag:   []
  };
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
    // Legacy data-tab hide/show (pop-stats, pop-actions, etc.)
    // v9.22.0: class-based hide so Bloomberg !important wins over inline style.
    document.querySelectorAll('[data-tab]:not(.pop-tab)').forEach(el => {
      if (el.dataset.tab === name) {
        el.classList.remove('pop-tab-hidden');
        el.style.display = '';
      } else {
        el.classList.add('pop-tab-hidden');
      }
    });
    // v10.12 D.3.10: tab panels use hidden attribute for a11y
    document.querySelectorAll('[role="tabpanel"]').forEach(panel => {
      const labelId = panel.getAttribute('aria-labelledby') || '';
      panel.hidden = labelId !== 'tab-btn-' + name;
    });
    // Update active tab indicator
    document.querySelectorAll('.pop-tab').forEach(b => {
      const active = b.dataset.tab === name;
      b.classList.toggle('pop-tab-active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      // a11y: roving tabindex per WAI-ARIA APG tab pattern. Only the active
      // tab is in the page tab-order; arrow keys move between tabs (below).
      b.tabIndex = active ? 0 : -1;
    });
    try { localStorage.setItem('gam_popup_active_tab', name); } catch (_) {}
  }
  document.querySelectorAll('.pop-tab').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });
  // a11y: WAI-ARIA APG tab pattern keyboard nav.
  // Left/Right cycle with wraparound; Home/End jump to first/last.
  // Hidden tabs (lead tab for non-leads via display:none) are skipped.
  // Activation is automatic on focus — setTab is cheap (no content load).
  const tablist = document.querySelector('.pop-tabnav');
  if (tablist) {
    tablist.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight'
          && e.key !== 'Home' && e.key !== 'End') return;
      const cur = e.target.closest('.pop-tab');
      if (!cur) return;
      const tabs = Array.from(tablist.querySelectorAll('.pop-tab'))
                        .filter(t => t.offsetParent !== null);
      const i = tabs.indexOf(cur);
      if (i === -1) return; // current tab is hidden; bail rather than guess
      e.preventDefault();
      let next;
      if (e.key === 'ArrowRight')      next = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft')  next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home')       next = 0;
      else                             next = tabs.length - 1; // End
      const target = tabs[next];
      setTab(target.dataset.tab);
      target.focus();
    });
  }
  // v9.20.0 - first-run UX: if no team token saved, default to TOKENS tab
  // (where the input lives) rather than STATS (which shows zeros and looks
  // broken). Returning users with a saved token still get their last tab.
  // Adds a red-dot indicator on the TOKENS tab when no team token saved.
  async function detectInitialTab() {
    let hasToken = false;
    try {
      const out = await chrome.storage.local.get('gam_settings');
      const s = (out && out.gam_settings) || {};
      hasToken = !!(s.workerModToken && String(s.workerModToken).length >= 32);
    } catch (_) {}
    if (!hasToken) {
      // Mark TOKENS tab with a visible "action needed" dot
      const tokensBtn = document.querySelector('.pop-tab[data-tab="tokens"]');
      if (tokensBtn && !tokensBtn.querySelector('.pop-tab-alert-dot')) {
        const dot = document.createElement('span');
        dot.className = 'pop-tab-alert-dot';
        dot.style.cssText = 'display:inline-block;width:6px;height:6px;background:#ff3b3b;border-radius:50%;margin-left:4px;vertical-align:middle;animation:gam-tab-dot-pulse 1.5s ease-in-out infinite';
        tokensBtn.appendChild(dot);
      }
      // Inject pulse keyframes once
      if (!document.getElementById('gam-tab-dot-style')) {
        const st = document.createElement('style');
        st.id = 'gam-tab-dot-style';
        st.textContent = '@keyframes gam-tab-dot-pulse{0%,100%{opacity:1}50%{opacity:0.45}}';
        document.head.appendChild(st);
      }
      return 'tokens';
    }
    try { return localStorage.getItem('gam_popup_active_tab') || 'stats'; }
    catch (_) { return 'stats'; }
  }
  detectInitialTab().then(initial => {
    setTab(['stats','tokens','tools','lead','diag'].includes(initial) ? initial : 'stats'); // v10.6.2 HOTFIX UIUX-01: added 'diag' to whitelist
  }).catch(() => setTab('stats'));
  // v10.14.2 LD3: expose setTab on window so qa* button handlers (defined at
  // module scope outside this IIFE) can defensively prepend a switch to the
  // tokens tab before opening lead-deep-dive sub-panels.
  try { window.setTab = setTab; } catch(_){}
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
    const r = await popupRpc('modSettingsRead');
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
    const r = await popupRpc('adminSettingsWrite', { key:'username_flag_ttl_days', value:String(v) });
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
  // a11y: this is a disclosure widget — make it keyboard-activatable.
  wrap.setAttribute('role', 'button');
  wrap.setAttribute('tabindex', '0');
  wrap.setAttribute('aria-expanded', 'false');
  wrap.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.key === ' ') e.preventDefault();
    wrap.click();
  });

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
      // E.2.1 (AF-12 Rule 36): converted to popupRpc
      const r = await popupRpc('bugReportUpdate', args);
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
    wrap.setAttribute('aria-expanded', detail.style.display === 'none' ? 'false' : 'true');
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
    const r = await popupRpc('bugReportList', { status: 'open', limit: 100 });
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
    if (reports.length === 0) {
      // v10.x Patch 5 P4: visual empty state for bug reports
      const emptyCard = (typeof gamEmptyState === 'function')
        ? gamEmptyState({ icon: 'check-circle', headline: 'No open bug reports', desc: 'Team is clean. Reports appear here as mods submit them.' })
        : null;
      if (emptyCard) {
        panel.appendChild(emptyCard);
        status.textContent = '0 open · visibility: ' + (r.data.visible_to || 'leads');
      } else {
        status.textContent = 'no open reports · visibility: ' + (r.data.visible_to || 'leads');
      }
    } else {
      status.textContent = reports.length + ' open · click row to expand · visibility: ' + (r.data.visible_to || 'leads');
      reports.forEach(function (row) { __renderBugRow(panel, row, loadBugReports); });
    }
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
    const r = await popupRpc('bugReportVisibilityWrite', { visible_to: v });
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
    const r = await popupRpc('bugReportVisibilityRead');
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
// v10.13.4 W4 (P0 / R-07): macros v2 — filter + sort state.
let __macroFilter = '';
let __macroSort = 'name'; // 'name' | 'use' | 'date'
// v10.14.0 V14-M3: sort direction (asc/desc) with persistence.
let __macroSortDir = 'asc'; // 'asc' | 'desc'
let __macroAllItems = [];

// v10.14.0 V14-M3: load persisted sort state. Fire once at module init.
(async function _macroLoadSortPrefs(){
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    const data = await chrome.storage.local.get(['gam_macro_sort', 'gam_macro_sort_dir']);
    if (data.gam_macro_sort && ['name','use','date'].includes(data.gam_macro_sort)) __macroSort = data.gam_macro_sort;
    if (data.gam_macro_sort_dir === 'asc' || data.gam_macro_sort_dir === 'desc') __macroSortDir = data.gam_macro_sort_dir;
  } catch (_) {}
})();

// v10.14.0 V14-M7: SVG icons for action trio. Inline so CSP-clean. 14x14
// stroke-only matches Bloomberg monochrome aesthetic.
const _MACRO_ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const _MACRO_ICON_DUP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const _MACRO_ICON_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

function __macroSetStatus(msg, cls){
  const el = document.getElementById('macrosStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'pop-token-status' + (cls ? ' ' + cls : '');
}

// v10.13.4 W4: Edit form lives BELOW the list in the HTML (cannot touch
// popup.html). On first call, hoist it to sit ABOVE the list so the slide-in
// pattern matches the spec ("inline edit form slides above list, not below").
function __macroEnsureEditAbove() {
  const wrap = document.getElementById('macroEditWrap');
  const section = document.getElementById('macrosSection');
  const list = document.getElementById('macrosList');
  if (!wrap || !section || !list) return;
  if (wrap.dataset.gamHoisted === '1') return;
  // Insert immediately before the list (above it, below filter bar).
  section.insertBefore(wrap, list);
  wrap.dataset.gamHoisted = '1';
}

// v10.14.0 V14-M3: filter bar with search + 3 sort text-buttons (Name/Use/Date)
// with direction toggle (asc/desc). Click active button to flip direction;
// click inactive to switch sort key (preserves direction). Persisted to
// chrome.storage.local under gam_macro_sort + gam_macro_sort_dir.
function __macroEnsureFilterBar() {
  if (document.getElementById('macroFilterBar')) return;
  const section = document.getElementById('macrosSection');
  const list = document.getElementById('macrosList');
  if (!section || !list) return;
  const bar = document.createElement('div');
  bar.id = 'macroFilterBar';
  bar.className = 'gam-macro-filter';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Filter macros...';
  search.setAttribute('aria-label', 'Filter macros');
  search.value = __macroFilter;
  search.addEventListener('input', function() {
    __macroFilter = (search.value || '').trim().toLowerCase();
    __macroRender();
  });
  const sortGroup = document.createElement('div');
  sortGroup.className = 'gam-macro-sort';
  sortGroup.setAttribute('role', 'group');
  sortGroup.setAttribute('aria-label', 'Sort macros');
  const sortKeys = [
    { v: 'name', l: 'Name' },
    { v: 'use',  l: 'Use'  },
    { v: 'date', l: 'Date' }
  ];
  sortKeys.forEach(function(o){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gam-macro-sort-btn';
    btn.dataset.sort = o.v;
    btn.setAttribute('aria-pressed', o.v === __macroSort ? 'true' : 'false');
    const txt = document.createElement('span');
    txt.textContent = o.l;
    const dir = document.createElement('span');
    dir.className = 'dir';
    dir.textContent = o.v === __macroSort ? (__macroSortDir === 'asc' ? '▲' : '▼') : '';
    btn.appendChild(txt);
    btn.appendChild(dir);
    btn.addEventListener('click', function() {
      if (__macroSort === o.v) {
        __macroSortDir = __macroSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        __macroSort = o.v;
      }
      try {
        chrome.storage.local.set({ gam_macro_sort: __macroSort, gam_macro_sort_dir: __macroSortDir });
      } catch (_) {}
      // Refresh button states
      sortGroup.querySelectorAll('.gam-macro-sort-btn').forEach(function(b) {
        const isActive = b.dataset.sort === __macroSort;
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        const d = b.querySelector('.dir');
        if (d) d.textContent = isActive ? (__macroSortDir === 'asc' ? '▲' : '▼') : '';
      });
      __macroRender();
    });
    sortGroup.appendChild(btn);
  });
  bar.appendChild(search);
  bar.appendChild(sortGroup);
  section.insertBefore(bar, list);
}

// v10.13.4 W4: render the (already-loaded) macros list, applying filter+sort.
function __macroRender() {
  const list = document.getElementById('macrosList');
  if (!list) return;
  const items = __macroAllItems.slice();
  // Filter
  const filtered = __macroFilter
    ? items.filter(function(m){
        const hay = ((m.label || '') + ' ' + (m.body || '')).toLowerCase();
        return hay.indexOf(__macroFilter) !== -1;
      })
    : items;
  // Sort. v10.14.0 V14-M3: each key normalized to ASC (a-b), then flipped if desc.
  // Default direction = asc (alphabetical/oldest/least-used first); user toggles.
  filtered.sort(function(a, b){
    let cmp;
    if (__macroSort === 'use') {
      cmp = (a.use_count || 0) - (b.use_count || 0);
    } else if (__macroSort === 'date') {
      const at = a.updated_at || a.created_at || 0;
      const bt = b.updated_at || b.created_at || 0;
      cmp = at - bt;
    } else {
      cmp = String(a.label || '').localeCompare(String(b.label || ''));
    }
    return __macroSortDir === 'asc' ? cmp : -cmp;
  });
  if (filtered.length === 0) {
    if (__macroFilter) {
      list.innerHTML = '<div style="padding:10px;color:#9b9892;font-size:11px;text-align:center">No macros match "' + (__macroFilter.replace(/[<>&"]/g, '')) + '"</div>';
    } else {
      list.replaceChildren(gamMakeEmpty({ icon: 'rules-empty', headline: 'No macros yet', desc: 'Click Add custom below to create one.' }));
    }
    return;
  }
  list.innerHTML = '';
  filtered.forEach(function(m){
    list.appendChild(__macroRow(m));
  });
}

// v10.13.4 W4 (R-07): row builder uses .gam-macro-item-* classes that already
// exist in popup.css (previously orphaned). Hover-revealed action trio:
// edit / duplicate / delete.
function __macroRow(m) {
  const row = document.createElement('div');
  row.className = 'gam-macro-item';
  row.dataset.id = String(m.id || '');

  const top = document.createElement('div');
  top.style.cssText = 'display:flex;align-items:center;gap:6px';
  const lbl = document.createElement('div');
  lbl.className = 'gam-macro-item-label';
  lbl.style.flex = '1';
  lbl.textContent = m.label || '(no label)';
  const useCount = document.createElement('span');
  useCount.className = 'gam-macro-item-meta';
  useCount.textContent = (m.use_count || 0) + 'x';

  const actions = document.createElement('div');
  actions.className = 'gam-macro-item-actions';

  // v10.14.0 V14-M7: SVG icons for action trio. innerHTML safe -- icons are
  // hardcoded inline SVG constants, no user data interpolated.
  const editBtn = document.createElement('button');
  editBtn.className = 'gam-macro-item-action';
  editBtn.type = 'button';
  editBtn.title = 'Edit';
  editBtn.setAttribute('aria-label', 'Edit macro');
  editBtn.innerHTML = _MACRO_ICON_EDIT;
  editBtn.addEventListener('click', function(){ __macroStartEdit(m); });

  const dupBtn = document.createElement('button');
  dupBtn.className = 'gam-macro-item-action';
  dupBtn.type = 'button';
  dupBtn.title = 'Duplicate';
  dupBtn.setAttribute('aria-label', 'Duplicate macro');
  dupBtn.innerHTML = _MACRO_ICON_DUP;
  dupBtn.addEventListener('click', function(){
    __macroStartEdit({ id: null, label: (m.label || '') + ' (copy)', body: m.body || '' });
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'gam-macro-item-action danger';
  delBtn.type = 'button';
  delBtn.title = 'Delete';
  delBtn.setAttribute('aria-label', 'Delete macro');
  delBtn.innerHTML = _MACRO_ICON_DEL;
  delBtn.addEventListener('click', function(){ __macroBeginDelconfirm(row, m); });

  actions.appendChild(editBtn);
  actions.appendChild(dupBtn);
  actions.appendChild(delBtn);

  top.appendChild(lbl);
  top.appendChild(useCount);
  top.appendChild(actions);

  const body = document.createElement('div');
  body.className = 'gam-macro-item-body';
  body.style.cssText = 'white-space:pre-wrap;word-break:break-word;max-height:50px;overflow:hidden';
  body.textContent = m.body || '';

  const meta = document.createElement('div');
  meta.className = 'gam-macro-item-meta';
  meta.textContent = 'by ' + (m.created_by || '?') + (m.updated_by ? ' (edited by ' + m.updated_by + ')' : '');

  row.appendChild(top);
  row.appendChild(body);
  row.appendChild(meta);
  return row;
}

async function loadMacros(){
  const list = document.getElementById('macrosList');
  if (!list) return;
  // Hoist the edit form above the list + mount filter bar (idempotent).
  __macroEnsureFilterBar();
  __macroEnsureEditAbove();
  // v10.12 D.3.13 / UIUX-19: skeleton instead of "Loading..." text
  list.replaceChildren(gamMakeSkel('paragraph'));
  try {
    const r = await popupRpc('macrosList', { kind: __macroKind });
    if (!r || !r.ok || !r.data || !Array.isArray(r.data.macros)){
      list.replaceChildren(gamMakeError({ severity: 'hard', label: 'MACROS', msg: (r && r.error) || 'no response', hint: 'Worker may be offline or RPC contract changed — retry, or open Diag tab for context.', retryFn: loadMacros }));
      return;
    }
    __macroAllItems = r.data.macros;
    // D.3.13: wire count badge (full count, not filtered)
    const badge = document.getElementById('card-badge-macros');
    if (badge) {
      badge.textContent = String(r.data.macros.length);
      badge.style.display = r.data.macros.length > 0 ? '' : 'none';
    }
    __macroRender();
  } catch(e){
    list.innerHTML = '<div style="padding:10px;color:#f04040;font-size:11px;text-align:center">Error: ' + (e && e.message || e) + '</div>';
  }
}

// v10.14.0 V14-M6: char-counter wiring with warn/err thresholds.
// LABEL: warn at 40 / err at 50 (visible cap; maxlength keeps 80 forgiving).
// BODY:  warn at 800 / err at 1000 (visible cap; maxlength keeps 4000 forgiving).
function __macroUpdateCounter(inputId, counterId, warnAt, errAt) {
  const input = document.getElementById(inputId);
  const counter = document.getElementById(counterId);
  if (!input || !counter) return;
  const len = (input.value || '').length;
  counter.textContent = String(len);
  if (len >= errAt)       counter.dataset.state = 'err';
  else if (len >= warnAt) counter.dataset.state = 'warn';
  else                    delete counter.dataset.state;
}

function __macroStartEdit(m){
  // v10.14.0 V14-M8: edit/AI mutex. If AI review panel is open, close it
  // before opening the edit form (and vice versa in __macroAiSeed).
  const aiPanel = document.getElementById('macroAiReview');
  if (aiPanel) aiPanel.remove();

  __macroEditing = m || { id: null, label: '', body: '' };
  document.getElementById('macroEditId').value = m && m.id ? String(m.id) : '';
  document.getElementById('macroEditLabel').value = m && m.label ? m.label : '';
  document.getElementById('macroEditBody').value = m && m.body ? m.body : '';
  // v10.14.0 V14-M5: select active KIND radio (default = current tab kind).
  const kindToSelect = (m && m.kind) || __macroKind;
  const radios = document.querySelectorAll('input[name="macroEditKind"]');
  radios.forEach(function(r) { r.checked = (r.value === kindToSelect); });
  // v10.14.0 V14-M6: prime char counters.
  __macroUpdateCounter('macroEditLabel', 'macroEditLabelCounter', 40, 50);
  __macroUpdateCounter('macroEditBody',  'macroEditBodyCounter',  800, 1000);
  // v10.14.0 V14-M2: slide open via class toggle, no display swap.
  const wrap = document.getElementById('macroEditWrap');
  if (wrap) {
    wrap.classList.add('gam-macro-edit-form-open');
    wrap.setAttribute('aria-hidden', 'false');
  }
  try { document.getElementById('macroEditLabel').focus(); } catch(_){}
}

function __macroCancelEdit(){
  __macroEditing = null;
  // v10.14.0 V14-M2: slide closed via class toggle.
  const wrap = document.getElementById('macroEditWrap');
  if (wrap) {
    wrap.classList.remove('gam-macro-edit-form-open');
    wrap.setAttribute('aria-hidden', 'true');
  }
}

async function __macroSave(){
  const idRaw = document.getElementById('macroEditId').value;
  const id = idRaw ? parseInt(idRaw, 10) : null;
  const label = (document.getElementById('macroEditLabel').value || '').trim();
  const body = (document.getElementById('macroEditBody').value || '').trim();
  // v10.14.0 V14-M5: read selected KIND from radio group, fallback to active tab.
  let kind = __macroKind;
  try {
    const checked = document.querySelector('input[name="macroEditKind"]:checked');
    if (checked && checked.value) kind = checked.value;
  } catch(_){}
  if (!label || !body){ __macroSetStatus('label + body required', 'err'); return; }
  if (label.length > 80){ __macroSetStatus('label too long (max 80)', 'err'); return; }
  if (body.length > 4000){ __macroSetStatus('body too long (max 4000)', 'err'); return; }
  __macroSetStatus('saving...');
  try {
    const r = await popupRpc('macroUpsert', { id: id, kind: kind, label: label, body: body });
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

// v10.13.4 W4 (P0-28 / R-09): inline delconfirm row state with 4s countdown
// bar (replaces window.confirm). Click Confirm to delete now; click Cancel
// or wait 4s for auto-cancel.
function __macroBeginDelconfirm(row, m){
  if (!row || !m || !m.id) return;
  // Already in delconfirm? Toggle off.
  if (row.classList.contains('delconfirm')) {
    __macroEndDelconfirm(row);
    return;
  }
  row.classList.add('delconfirm');
  // Stash original innards so we can restore on cancel/timeout.
  const orig = row.innerHTML;
  row.dataset.gamOrig = orig;
  row.innerHTML = '';
  const banner = document.createElement('div');
  banner.className = 'gam-macro-delconfirm';
  const label = document.createElement('span');
  label.style.flex = '0 0 auto';
  label.textContent = 'Delete "' + (m.label || 'macro') + '"?';
  const bar = document.createElement('div');
  bar.className = 'gam-macro-delconfirm-bar';
  const fill = document.createElement('span');
  bar.appendChild(fill);
  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.textContent = 'Confirm';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'cancel';
  cancelBtn.textContent = 'Cancel';
  banner.appendChild(label);
  banner.appendChild(bar);
  banner.appendChild(okBtn);
  banner.appendChild(cancelBtn);
  row.appendChild(banner);

  let done = false;
  const timer = setTimeout(function(){
    if (done) return;
    done = true;
    // v10.13.5 P1-14: clear text countdown interval on auto-cancel timeout.
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    __macroEndDelconfirm(row);
  }, 4000);
  // v10.13.5 P1-14 (RALPH AUDIT MACROS F4): under prefers-reduced-motion,
  // the CSS countdown bar freezes at scaleX(0.5) for the full 4s -- the
  // mod has zero countdown signal even though the JS timer still fires.
  // Add a text countdown on the cancel button as an a11y-honest alternative.
  let countdownInterval = null;
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const startTs = Date.now();
      const baseLabel = cancelBtn.textContent;
      function _updateCancelLabel() {
        const remaining = Math.max(0, Math.ceil((4000 - (Date.now() - startTs)) / 1000));
        if (remaining <= 0) {
          cancelBtn.textContent = baseLabel;
          if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
          return;
        }
        cancelBtn.textContent = baseLabel + ' (Auto-cancel in ' + remaining + 's)';
      }
      _updateCancelLabel();
      countdownInterval = setInterval(_updateCancelLabel, 1000);
    }
  } catch(_) {}
  cancelBtn.addEventListener('click', function(){
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    __macroEndDelconfirm(row);
  });
  okBtn.addEventListener('click', async function(){
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    okBtn.disabled = true;
    cancelBtn.disabled = true;
    okBtn.textContent = 'deleting...';
    await __macroDoDelete(m);
  });
}

function __macroEndDelconfirm(row){
  if (!row) return;
  row.classList.remove('delconfirm');
  if (row.dataset.gamOrig) {
    row.innerHTML = row.dataset.gamOrig;
    delete row.dataset.gamOrig;
    // Re-wire the action buttons (innerHTML restore drops listeners).
    // Easiest: re-render the whole list from cache.
    __macroRender();
  }
}

async function __macroDoDelete(m){
  if (!m || !m.id) return;
  __macroSetStatus('deleting...');
  try {
    const r = await popupRpc('macroDelete', { id: m.id });
    if (r && r.ok && r.data && r.data.ok){
      __macroSetStatus('✓ deleted', 'ok');
      loadMacros();
    } else {
      __macroSetStatus('delete failed: ' + ((r && r.data && r.data.error) || (r && r.error) || 'unknown'), 'err');
      loadMacros();
    }
  } catch(e){
    __macroSetStatus('error: ' + (e && e.message || e), 'err');
    loadMacros();
  }
}

// v9.6.1: AI-seed flow. Calls /macros/ai-suggest, presents the returned
// suggestions inline. Per Commander: "canned replies that the AI wrote for
// us to start with".
// v10.13.4 W4 (P0-28 / R-09): replaced window.confirm with inline review
// panel — checkbox per suggestion + SAVE SELECTED (N) button that updates
// count as boxes toggle.
async function __macroAiSeed(){
  const btn = document.getElementById('macroAiSeedBtn');
  const orig = btn ? btn.textContent : '';
  // v10.14.0 V14-M1: drop the sparkle emoji.
  if (btn){ btn.disabled = true; btn.textContent = 'Generating...'; }
  __macroSetStatus('asking AI for ' + __macroKind + ' suggestions...');
  try {
    // v9.8.0: pass existing labels as anti-list to prevent repetition
    let existing_labels = [];
    try {
      const lr = await popupRpc('macrosList', { kind: __macroKind });
      if (lr && lr.ok && lr.data && Array.isArray(lr.data.macros)) {
        existing_labels = lr.data.macros.map(m => String(m.label || '')).filter(Boolean);
      }
    } catch(_){}
    const r = await popupRpc('macroAiSuggest', { kind: __macroKind, count: 5, existing_labels });
    if (!r || !r.ok || !r.data || !r.data.ok || !Array.isArray(r.data.suggestions)){
      const errReason = (r && r.data && r.data.error) || (r && r.error) || 'unknown';
      __macroSetStatus('AI suggestion failed: ' + errReason, 'err');
      return;
    }
    const sugg = r.data.suggestions;
    if (sugg.length === 0){ __macroSetStatus('AI returned 0 suggestions', 'err'); return; }
    __macroShowAiReview(sugg);
    // v10.14.0 V14-M1: drop the sparkle emoji.
    __macroSetStatus(sugg.length + ' AI suggestions -- pick which to save', 'info');
  } catch(e){
    __macroSetStatus('error: ' + (e && e.message || e), 'err');
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = orig; }
  }
}

// v10.13.4 W4: inline AI review panel (replaces window.confirm). All
// suggestions checked by default. SAVE SELECTED (N) button updates count
// as user toggles checkboxes.
// v10.14.0 V14-M8: edit/AI mutex -- close edit form before opening AI panel.
function __macroShowAiReview(sugg){
  // Remove any prior review panel
  const old = document.getElementById('macroAiReview');
  if (old) old.remove();
  // v10.14.0 V14-M8: close edit form if open (mutex).
  __macroCancelEdit();
  const section = document.getElementById('macrosSection');
  const list = document.getElementById('macrosList');
  if (!section || !list) return;
  const panel = document.createElement('div');
  panel.id = 'macroAiReview';
  panel.className = 'gam-macro-ai-review';
  const head = document.createElement('div');
  head.className = 'gam-macro-ai-review-head';
  // v10.14.0 V14-M1 (HTML scaffold rewrite): drop the sparkle emoji.
  head.textContent = 'AI proposed ' + sugg.length + ' ' + __macroKind + ' macros';
  panel.appendChild(head);

  const checkboxes = [];
  sugg.forEach(function(s, i){
    const row = document.createElement('label');
    row.className = 'gam-macro-ai-review-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.idx = String(i);
    checkboxes.push(cb);
    const wrap = document.createElement('div');
    wrap.style.flex = '1';
    const lbl = document.createElement('div');
    lbl.className = 'label';
    lbl.textContent = s.label || '(no label)';
    const body = document.createElement('div');
    body.className = 'body';
    body.textContent = s.body || '';
    wrap.appendChild(lbl);
    wrap.appendChild(body);
    row.appendChild(cb);
    row.appendChild(wrap);
    panel.appendChild(row);
  });

  const actionsRow = document.createElement('div');
  actionsRow.className = 'gam-macro-ai-review-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'cancel';
  // v10.14.0 V14-M8: rename Cancel -> DISCARD ALL. Stronger language matches
  // the action: clicking discards all 5 proposed suggestions, not just dismisses.
  cancelBtn.textContent = 'Discard all';
  actionsRow.appendChild(saveBtn);
  actionsRow.appendChild(cancelBtn);
  panel.appendChild(actionsRow);

  function _refreshCount() {
    const n = checkboxes.filter(function(c){ return c.checked; }).length;
    saveBtn.textContent = 'Save selected (' + n + ')';
    saveBtn.disabled = (n === 0);
  }
  checkboxes.forEach(function(c){ c.addEventListener('change', _refreshCount); });
  _refreshCount();

  cancelBtn.addEventListener('click', function(){
    panel.remove();
    __macroSetStatus('cancelled', 'info');
  });

  saveBtn.addEventListener('click', async function(){
    const picks = checkboxes.filter(function(c){ return c.checked; }).map(function(c){
      return sugg[parseInt(c.dataset.idx, 10)];
    });
    if (!picks.length) return;
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    saveBtn.textContent = 'saving...';
    let saved = 0, failed = 0;
    for (const s of picks) {
      try {
        const upsert = await popupRpc('macroUpsert', { kind: __macroKind, label: s.label, body: s.body });
        if (upsert && upsert.ok && upsert.data && upsert.data.ok) saved++;
        else failed++;
      } catch(_){ failed++; }
    }
    __macroSetStatus('✓ saved ' + saved + (failed ? ' (' + failed + ' failed)' : ''), 'ok');
    panel.remove();
    loadMacros();
  });

  // Mount above list (below filter bar)
  section.insertBefore(panel, list);
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
  // v10.14.0 V14-M6: live char-counter input listeners.
  const lblInput = document.getElementById('macroEditLabel');
  if (lblInput) lblInput.addEventListener('input', function() {
    __macroUpdateCounter('macroEditLabel', 'macroEditLabelCounter', 40, 50);
  });
  const bodyInput = document.getElementById('macroEditBody');
  if (bodyInput) bodyInput.addEventListener('input', function() {
    __macroUpdateCounter('macroEditBody', 'macroEditBodyCounter', 800, 1000);
  });
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
  notes24: 'Notes (last 24h)',
  ai24:    'AI usage today'   // v10.10.1 P5 (DESIGN-09)
};
const __DRILL_EMPTY_HINT = {
  pending: 'No users waiting on triage. Run a /users crawl to refresh the roster.',
  dr:      'Death Row queue is empty. Schedule a ban from the Mod Console to populate.',
  banned:  'No banned users in your local roster. Crawl /users with status=banned to import.',
  bans24:  'No ban actions logged in the last 24h.',
  msgs24:  'No mod messages or replies sent in the last 24h.',
  notes24: 'No mod notes written in the last 24h.',
  ai24:    'No AI calls logged today, or usage data not yet available from /mod/stats. Per-call detail is not retained at the worker.'  // v10.13.0 W1 (P0-05)
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
  // v10.x Patch 5: visual empty states for high-visibility drill variants
  const visualSpecs = {
    dr:      { icon: 'check-circle', headline: 'Death Row clear',     desc: 'No users scheduled for banning.' },
    pending: { icon: 'users-empty',  headline: 'Triage queue clear',  desc: 'No new users waiting. Run a /users crawl to refresh.' }
  };
  const spec = visualSpecs[key];
  if (spec && typeof gamEmptyState === 'function') {
    body.appendChild(gamEmptyState(spec));
    return;
  }
  // Fallback: v8.0 text
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
    else if (key === 'ai24')    __renderAi24(body);  // v10.10.1 P5 (DESIGN-09)
    else { __renderDrillEmpty(key); }
  } catch (e) {
    // v10.16.48 A10-Win1: replaced the bare text div with gamMakeError so the
    // drill drawer now offers a RETRY button + actionable hint instead of
    // leaving the operator stranded with a stack trace. Mod must close-and-
    // reclick before; now one click recovers.
    body.textContent = '';
    const msg = (e && e.message) || String(e) || 'unknown';
    try {
      if (typeof gamMakeError === 'function') {
        const errEl = gamMakeError({
          severity: 'hard',
          label: (__DRILL_TITLES[key] || 'DRILL').toUpperCase(),
          msg: 'Failed to load: ' + msg,
          hint: 'Transient worker hiccup or auth blip — retry, or open Diag tab for a connection ping.',
          retryFn: function () { renderDrillDown(key); }
        });
        if (errEl) body.appendChild(errEl);
        else {
          const fb = document.createElement('div');
          fb.className = 'pop-drill-empty';
          fb.textContent = 'Failed to load: ' + msg;
          body.appendChild(fb);
        }
      } else {
        const fb = document.createElement('div');
        fb.className = 'pop-drill-empty';
        fb.textContent = 'Failed to load: ' + msg;
        body.appendChild(fb);
      }
    } catch (_) {
      const fb = document.createElement('div');
      fb.className = 'pop-drill-empty';
      fb.textContent = 'Failed to load: ' + msg;
      body.appendChild(fb);
    }
    __setDrillMeta('error');
  }
}

// v10.13.0 W1 (P0-05): AI tile drill -- honest empty state.
// Was a v10.10.1 placeholder reading "coming v10.11"; v10.12.4 ships and
// the per-call log was never wired (and the daily snapshot rolls up before
// per-call detail is queryable -- not "coming," not retained at all). We
// surface the rolled-up calls/cap value the tile already has, then state
// plainly that per-call detail is unavailable. Uses gamMakeEmpty() for
// consistent empty-state visual treatment.
function __renderAi24(body) {
  const aiVal = ($('s-ai-today') || {}).textContent || '—';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:12px 14px;';
  const valLine = document.createElement('p');
  valLine.style.cssText = 'font-size:22px;font-weight:600;color:var(--bb-purple);margin:0 0 4px;font-variant-numeric:tabular-nums;text-align:left;';
  valLine.textContent = aiVal;
  const labelLine = document.createElement('p');
  labelLine.style.cssText = 'font-size:11px;color:var(--bb-ink-dim);margin:0 0 12px;text-transform:uppercase;letter-spacing:0.08em;text-align:left;';
  labelLine.textContent = 'AI calls today';
  wrap.appendChild(valLine);
  wrap.appendChild(labelLine);
  // Honest empty state -- per-call detail is not retained anywhere.
  const empty = gamMakeEmpty({
    headline: 'Per-call log unavailable',
    desc: 'AI usage rolls up at the daily snapshot — per-call detail is not retained.'
  });
  wrap.appendChild(empty);
  body.appendChild(wrap);
  __setDrillMeta('AI usage');
  __lastDrill = { key: 'ai24', rows: [], cols: [] };
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
    // a11y: REDTEAM-3 made .pop-stat focusable (role=button, tabindex=0).
    // Pair the click delegation with keyboard activation. Synthesize a click
    // so any current/future click handler on .pop-stat fires for free.
    stats.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.pop-stat[data-drill]');
      if (!card) return;
      if (e.key === ' ') e.preventDefault(); // stop page scroll on Space
      card.click();
    });
  }
  // a11y: same treatment for the lead KPI tiles (REDTEAM-3 also made these
  // focusable). Keydown synthesizes a click so the route below fires for
  // both mouse and keyboard from a single source of truth.
  const kpiRow = document.getElementById('leadKpiRow');
  if (kpiRow) {
    kpiRow.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tile = e.target.closest('.gam-kpi-tile[data-kpi]');
      if (!tile) return;
      if (e.key === ' ') e.preventDefault();
      tile.click();
    });
    // KPI tile click routing. `active` has live data via modPresencePing;
    // the other 3 (clearrate/mmp50/incidents) are stubs awaiting worker
    // endpoints — honest "pending" toast beats silent failure.
    kpiRow.addEventListener('click', async (e) => {
      const tile = e.target.closest('.gam-kpi-tile[data-kpi]');
      if (!tile) return;
      const kpi = tile.getAttribute('data-kpi');
      if (kpi === 'active') {
        // Toggle: if panel is open, close it. Otherwise fetch + render full list.
        const existing = document.getElementById('kpi-active-panel');
        if (existing && existing.style.display !== 'none') {
          existing.style.display = 'none';
          tile.setAttribute('aria-expanded', 'false');
          return;
        }
        try {
          const r = await popupRpc('modPresencePing', {});
          const mods = (r && r.ok && r.data && Array.isArray(r.data.mods)) ? r.data.mods : [];
          __renderActiveModsPanel(mods);
          tile.setAttribute('aria-expanded', 'true');
        } catch (_) {
          __showToast('Failed to load active mods', 'err');
        }
      } else {
        const labels = { clearrate: 'Queue clear-rate', mmp50: 'Modmail p50', incidents: 'Incidents' };
        __showToast((labels[kpi] || kpi) + ' detail: endpoint pending', 'ok');
      }
    });
    // a11y: advertise the disclosure relationship from initial render so AT
    // sees the tile as a collapsed disclosure widget before any interaction.
    const activeTile = document.getElementById('kpi-active');
    if (activeTile && !activeTile.hasAttribute('aria-expanded')) {
      activeTile.setAttribute('aria-expanded', 'false');
    }
  }
  const closeBtn = $('pop-drill-close');
  if (closeBtn) closeBtn.addEventListener('click', __closeDrillDown);
  const csvBtn = $('pop-drill-csv');
  if (csvBtn) csvBtn.addEventListener('click', __exportDrillCsv);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const drawer = $('pop-drill');
      if (drawer && drawer.style.display !== 'none') __closeDrillDown();
      // Also dismiss the kpi-active inline list, keeping aria-expanded in sync.
      const kpiPanel = document.getElementById('kpi-active-panel');
      if (kpiPanel && kpiPanel.style.display !== 'none') {
        kpiPanel.style.display = 'none';
        const tile = document.getElementById('kpi-active');
        if (tile) tile.setAttribute('aria-expanded', 'false');
      }
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
    // E.2.6 (AF-06 Rule 18): auto-purge diag log when pct > 90%
    if (pct > 90) {
      console.warn('[Popup AF-06] Storage > 90% — auto-purging diag log oldest 50%');
      await _purgeOldestDiagLog50Pct();
    }
    const trim = document.createElement('button');
    trim.className = 'pop-btn pop-btn-ghost';
    trim.textContent = 'Trim now';
    trim.style.cssText = 'font-size:10px;padding:2px 8px;margin-left:6px';
    trim.addEventListener('click', () => withLoading(trim, 'trimming...', maintStorageTrim));
    // E.2.6 (AF-06 Rule 18): green < 60%, amber 60-80%, red > 80%
    var storageSev = pct > 80 ? 'warn' : pct > 60 ? 'info' : 'ok';
    __maintSetStatus('maintStorageStatus', summary, storageSev);
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
    const r = await popupRpc('modWhoami');
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
    // E.3.2 (AF-32 Rule 95): token expired — inject action link to rotate
    if (kind === 'err') {
      const statusEl = $('maintTokenStatus');
      if (statusEl) {
        const link = document.createElement('button');
        link.className = 'pop-link';
        link.style.cssText = 'margin-left:6px;font-size:10px';
        link.textContent = 'Token expired — click here to rotate';
        link.addEventListener('click', function() {
          _cardAuthFailed();
          const rotateBtn = $('rotateBtn');
          if (rotateBtn) rotateBtn.scrollIntoView({ behavior: 'smooth' });
        });
        statusEl.appendChild(link);
      }
    }
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
    // v10.14.1 CC2: thread btn so maintDiagExport can pulse via copyWithPulse
    exportBtn.addEventListener('click', () => withLoading(exportBtn, 'copying...', () => maintDiagExport(exportBtn)));
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

// v10.14.1 CC2: optional btn parameter — when threaded from the wired Export
// button, route through copyWithPulse for 3-layer fallback + COPIED flash.
async function maintDiagExport(btn) {
  try {
    const r = await chrome.storage.local.get(MAINT_DIAG_KEY);
    const log = r[MAINT_DIAG_KEY] || [];
    // v10.12.1 PC.3: replace shallow key-name redactor with deep-recursive masker.
    // Catches CSRF tokens and nested secret values in ctx/extra fields, not just
    // top-level "token|secret|auth" key names.
    const redacted = log.map(e => _maskSecretsDeep(e));
    const json = JSON.stringify({
      exportedAt: new Date().toISOString(),
      version: chrome.runtime.getManifest().version,
      count: redacted.length,
      entries: redacted
    }, null, 2);
    if (btn && typeof copyWithPulse === 'function') {
      copyWithPulse(btn, json);
    } else {
      await navigator.clipboard.writeText(json);
    }
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
// Routine #8a (AF-07 Rule 19+21): Repair settings -- non-destructive shape fix
// Reads gam_settings from chrome.storage.local, validates required key presence
// + types against SETTINGS_REQUIRED_SHAPE, patches only the broken keys with
// DEFAULT_SETTINGS values. Tokens and UX prefs are never touched.
// =========================================================================
const REPAIR_REQUIRED_SHAPE = {
  autoRefreshEnabled:           'boolean',
  workerModToken:               'string',
  leadModToken:                 'string',
  isLeadMod:                    'boolean',
  hideSidebar:                  'boolean',
  tardsThreshold:               'number',
  autoDeathRowRules:            'array',
  autoTardRules:                'array',
  'features.platformHardening': 'boolean',
  'features.teamBoost':         'boolean'
};
const REPAIR_DEFAULT_VALUES = {
  autoRefreshEnabled:           true,
  workerModToken:               '',
  leadModToken:                 '',
  isLeadMod:                    false,
  hideSidebar:                  true,
  tardsThreshold:               2,
  autoDeathRowRules:            [],
  autoTardRules:                [],
  'features.platformHardening': true,
  'features.teamBoost':         false
};
function __validateSettingsShape(obj) {
  var missing = [];
  var mistyped = [];
  if (!obj || typeof obj !== 'object') {
    return { ok: false, missing: Object.keys(REPAIR_REQUIRED_SHAPE), mistyped: [] };
  }
  Object.keys(REPAIR_REQUIRED_SHAPE).forEach(function(k) {
    if (!(k in obj)) { missing.push(k); return; }
    var expected = REPAIR_REQUIRED_SHAPE[k];
    if (expected === 'array') {
      if (!Array.isArray(obj[k])) mistyped.push(k);
    } else {
      if (typeof obj[k] !== expected) mistyped.push(k);
    }
  });
  return { ok: missing.length === 0 && mistyped.length === 0, missing: missing, mistyped: mistyped };
}
async function maintRepairSettings() {
  __maintSetStatus('maintRepairStatus', 'checking...');
  try {
    const r = await chrome.storage.local.get('gam_settings');
    const s = (r && r.gam_settings) || null;
    const report = __validateSettingsShape(s);
    if (report.ok) {
      __maintLog('repairSettings', 'clean', {});
      __maintSetStatus('maintRepairStatus', '✓ No corruption found. All required keys present + typed.', 'ok');
      return;
    }
    const broken = report.missing.concat(report.mistyped);
    const patch = Object.assign({}, s || {});
    broken.forEach(function(k) {
      if (k in REPAIR_DEFAULT_VALUES) patch[k] = REPAIR_DEFAULT_VALUES[k];
    });
    await chrome.storage.local.set({ gam_settings: patch });
    __maintLog('repairSettings', 'repaired', { missing: report.missing, mistyped: report.mistyped, keys: broken });
    __maintSetStatus('maintRepairStatus',
      '✓ Repaired ' + broken.length + ' key(s): ' + broken.join(', ') + '. Reload GAW tabs.', 'ok');
  } catch (e) {
    __maintLog('repairSettings', 'err', { error: String(e && e.message || e) });
    __maintSetStatus('maintRepairStatus', 'failed: ' + (e && e.message || e), 'err');
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
    // v10.7.0 UIUX-06 B.1: also remove gam_welcomed so re-onboarding welcome toast fires correctly
    const keysToRemove = OWNED_KEYS.filter(k => k !== K.SETTINGS).concat(['gam_learned_selectors', 'gam_welcomed']);
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
    const r = await popupRpc('adminAuditVerify', { limit: 5000, from: 0 });
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
  // v10.12.1 PC.3: deep-mask health report before clipboard — routine status
  // strings may contain token excerpts from token-probe output.
  const json = JSON.stringify(_maskSecretsDeep(report), null, 2);
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
    const ar = await popupRpc('aiHealthSummarize', { report_json: json.slice(0, 16000) });
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
    const r = await popupRpc('adminListMods');
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
              const ri = await popupRpc('adminIssueInvite', { username: m.mod_username });
              if (ri && ri.ok && ri.data && ri.data.code) {
                const url = 'https://greatawakening.win/?mt_invite=' + encodeURIComponent(ri.data.code);
                // v10.14.1 CC1: route via copyWithPulse for 3-layer fallback + COPIED flash
                btn.disabled = false;
                copyWithPulse(btn, url);
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
      const rr = await popupRpc('adminListMods');
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
      const av = await popupRpc('adminAuditVerify', { limit: 1, from: 0 });
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
__maintWire('maintRepair', maintRepairSettings, 'repairing...');  // v10.5.1 AF-07 Rule 21
__maintWire('maintReset', maintResetDefaults, 'resetting...');

// =============================================================================
// E.2.3 (AF-18 Rule 52): Safe Mode toggle wiring
// Writes gam_settings.safe_mode; shows "reload GAW tab to apply" snack.
// Wired via __maintWire convention (reads the checkbox state, not a button click).
// =============================================================================
(function wireSafeModeToggle() {
  var toggle = $('safeModeToggle');
  var track  = $('safeModeToggleTrack');
  var thumb  = $('safeModeToggleThumb');
  var label  = $('safeModeToggleLabel2');
  if (!toggle || !track) return;
  // a11y: the checkbox ships as display:none which removes it from the
  // accessibility tree and tab order. Replace with the visually-hidden
  // pattern so it remains focusable + Space-toggleable. Mirror focus to
  // the visible track so keyboard users see where they are.
  toggle.style.cssText = 'position:absolute;width:1px;height:1px;'
    + 'margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);'
    + 'clip-path:inset(50%);white-space:nowrap';
  toggle.setAttribute('role', 'switch');
  toggle.addEventListener('focus', function () { track.style.outline = '2px solid var(--bb-blue)'; track.style.outlineOffset = '2px'; });
  toggle.addEventListener('blur',  function () { track.style.outline = ''; track.style.outlineOffset = ''; });

  function applySafeModeVisual(on) {
    if (on) {
      track.style.background = '#f0a040';
      thumb.style.left = '18px';
      thumb.style.background = '#fff';
      label.style.color = '#f0a040';
      label.textContent = 'ON';
    } else {
      track.style.background = '#2a2f38';
      thumb.style.left = '2px';
      thumb.style.background = '#5c6370';
      label.style.color = '#5c6370';
      label.textContent = 'OFF';
    }
    toggle.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  // Load current safe_mode state on popup open
  (async function() {
    try {
      var r = await chrome.storage.local.get('gam_settings');
      var safeMode = !!(r && r.gam_settings && r.gam_settings.safe_mode);
      toggle.checked = safeMode;
      applySafeModeVisual(safeMode);
    } catch(_) {}
  })();

  toggle.addEventListener('change', async function() {
    var on = toggle.checked;
    applySafeModeVisual(on);
    try {
      var r = await chrome.storage.local.get('gam_settings');
      var s = Object.assign({}, (r && r.gam_settings) || {});
      s.safe_mode = on;
      await chrome.storage.local.set({ gam_settings: s });
      __showToast('Safe mode ' + (on ? 'enabled' : 'disabled') + ' — reload the GAW tab to apply.', on ? 'warn' : 'ok');
    } catch(e) {
      __showToast('Safe mode save failed: ' + (e && e.message || e), 'error');
    }
  });

  // Make the whole row clickable (not just the toggle)
  var row = $('safeModeRow');
  if (row) {
    row.addEventListener('click', function(e) {
      if (e.target !== toggle) { toggle.checked = !toggle.checked; toggle.dispatchEvent(new Event('change')); }
    });
  }
  var safeModeRowEl = $('safeModeRow');
  if (safeModeRowEl) safeModeRowEl.style.display = 'flex';
})();
// =============================================================================
// END E.2.3
// =============================================================================

// =============================================================================
// E.2.4 (AF-18 Rule 54): Feature Health row — reads gam_error_counters on popup
// open and renders auto-disabled features with Re-enable buttons.
// =============================================================================
(async function renderFeatureHealthRow() {
  var row = $('featureHealthRow');
  var list = $('featureHealthList');
  if (!row || !list) return;
  try {
    var r = await chrome.storage.local.get('gam_error_counters');
    var counters = (r && r.gam_error_counters) || {};
    var disabled = Object.entries(counters).filter(function(kv) { return kv[1] && kv[1].disabled_at; });
    if (disabled.length === 0) {
      list.textContent = 'All features healthy';
      row.style.display = 'flex';
      return;
    }
    list.innerHTML = '';
    row.style.display = 'flex';
    disabled.forEach(function(kv) {
      var feature = kv[0];
      var rec = kv[1];
      var time = rec.disabled_at ? new Date(rec.disabled_at).toLocaleTimeString() : '?';
      var item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px';
      var chip = document.createElement('span');
      chip.style.cssText = 'color:#f04040;font-size:10px;flex:1';
      chip.textContent = '✗ ' + feature + ' (disabled ' + time + ')';
      var reEnableBtn = document.createElement('button');
      reEnableBtn.className = 'pop-btn pop-btn-ghost';
      reEnableBtn.style.cssText = 'font-size:9px;padding:1px 5px';
      reEnableBtn.textContent = 'Re-enable';
      reEnableBtn.addEventListener('click', async function() {
        try {
          var cr = await chrome.storage.local.get('gam_error_counters');
          var cs = Object.assign({}, (cr && cr.gam_error_counters) || {});
          if (cs[feature]) { cs[feature] = { count: 0, window_start: 0, disabled_at: 0 }; }
          await chrome.storage.local.set({ gam_error_counters: cs });
          reEnableBtn.textContent = 're-enabled';
          reEnableBtn.disabled = true;
          chip.style.color = '#3dd68c';
          chip.textContent = '✓ ' + feature + ' re-enabled — reload GAW tab';
        } catch(e) {
          reEnableBtn.textContent = 'failed';
        }
      });
      item.appendChild(chip);
      item.appendChild(reEnableBtn);
      list.appendChild(item);
    });
  } catch(_) { row.style.display = 'none'; }
})();
// =============================================================================
// END E.2.4
// =============================================================================

// v9.11.0 - AI tard / sus-pattern suggester wire-up (Commander #23/#24).
async function maintTardSuggest() {
  __maintSetStatus('maintTardSuggestStatus', 'AI scanning recent usernames...');
  const r = await popupRpc('aiTardsSuggest');
  if (!r || !r.ok || !r.data || !r.data.ok) {
    const reason = (r && r.data && r.data.error) || (r && r.error) || 'unknown';
    // E.3.2 (AF-32 Rule 95): AI error — append manual fallback hint
    __maintSetStatus('maintTardSuggestStatus', 'AI failed: ' + reason + ' — AI unavailable, use Ban Manager to ban manually or review /users directly.', 'err');
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
    // v10.x Patch 5 P5: visual empty state - clean scan is NOT an error
    const emptyCard = (typeof gamEmptyState === 'function')
      ? gamEmptyState({ icon: 'users-empty', headline: 'No new patterns detected', desc: '0 suspicious username clusters in current data.' })
      : null;
    if (emptyCard) {
      panel.appendChild(emptyCard);
    } else {
      const empty = document.createElement('div');
      empty.style.color = '#9b9892';
      empty.textContent = 'No suspicious patterns detected.';
      panel.appendChild(empty);
    }
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
  const r = await popupRpc('aiStickyDetect');
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
        // a11y: chip is a <span>, not a button — make it keyboard-activatable.
        chip.setAttribute('role', 'button');
        chip.setAttribute('tabindex', '0');
        chip.setAttribute('aria-label', 'Maintenance warning: ' + w.reason + '. Activate to scroll to detail.');
        const scrollToBanner = () => {
          if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        chip.addEventListener('click', scrollToBanner, { once: true });
        chip.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          if (e.key === ' ') e.preventDefault();
          chip.click();
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

// E.3.2 (AF-32 Rule 95): FallbackMode ON — show "NATIVE MODE" label in chip
(async function __maintCheckFallbackMode() {
  try {
    var r = await chrome.storage.local.get('gam_fallback_mode');
    if (!r || !r.gam_fallback_mode) return;
    var chip = $('maintWarningChip');
    if (!chip) return;
    chip.style.display = '';
    chip.textContent = '⚠ NATIVE MODE';
    chip.title = 'ModTools interception is OFF — actions taken in native GAW UI will not sync to shared roster. Open popup to re-enable.';
  } catch(_) {}
})();

// =========================================================================
// v10.16.32 (Grok #140): extension health-score chip
// =========================================================================
// Composite 0-100 score surfaced in the popup header. Reads local-only
// signals (no worker round-trip) so the chip renders instantly:
//   - token age (>60d -10, >90d -20)
//   - SW boot count in last hour (>5 -10, indicates instability)
//   - last RPC status (last-failed -5)
//   - maintenance warning present (-15 if severity=warn, -30 if danger)
//   - fallback/native mode active (-25)
//   - secret cache empty when settings claim token exists (-15, recently-evicted)
// Chip colors: ≥80 green ✓ healthy, 50-79 amber ⚠ attention, <50 red ✕ degraded.
// Click → jump to Diag tab.
(async function __loadHealthChip() {
  try {
    const chip = $('healthChip');
    if (!chip) return;
    let score = 100;
    const reasons = [];

    // Token age signal
    try {
      const s = await chrome.storage.local.get('gam_settings');
      const settings = (s && s.gam_settings) || {};
      const issuedAt = parseInt(settings.workerModToken_issued_at, 10) || 0;
      if (issuedAt > 0) {
        const ageDays = (Date.now() - issuedAt) / 86400000;
        if (ageDays > 90)      { score -= 20; reasons.push('token age ' + Math.floor(ageDays) + 'd >90d'); }
        else if (ageDays > 60) { score -= 10; reasons.push('token age ' + Math.floor(ageDays) + 'd >60d'); }
      }
    } catch (_) {}

    // SW boot stability — too many boots in last hour = SW evicted often
    try {
      const r = await chrome.storage.local.get('gam_sw_boots');
      const boots = (r && Array.isArray(r.gam_sw_boots)) ? r.gam_sw_boots : [];
      const oneHourAgo = Date.now() - 3600000;
      const recentBoots = boots.filter(b => {
        try { return b && b.ts && new Date(b.ts).getTime() >= oneHourAgo; } catch (_) { return false; }
      }).length;
      if (recentBoots > 5) { score -= 10; reasons.push('SW boots in last hour: ' + recentBoots); }
    } catch (_) {}

    // Maintenance warning signal
    try {
      const r = await chrome.storage.local.get('gam_maint_warning');
      const w = r && r.gam_maint_warning;
      if (w && typeof w === 'object' && w.reason) {
        if (w.severity === 'danger') { score -= 30; reasons.push('maint danger: ' + w.reason); }
        else                          { score -= 15; reasons.push('maint warn: ' + w.reason); }
      }
    } catch (_) {}

    // Fallback / native mode signal
    try {
      const r = await chrome.storage.local.get('gam_fallback_mode');
      if (r && r.gam_fallback_mode) { score -= 25; reasons.push('fallback / native mode active'); }
    } catch (_) {}

    // Last-RPC status signal (popup.js writes gam_last_rpc_failed on failures)
    try {
      const r = await chrome.storage.session.get('gam_last_rpc_failed');
      if (r && r.gam_last_rpc_failed) { score -= 5; reasons.push('last RPC failed'); }
    } catch (_) {}

    // Clamp + render
    score = Math.max(0, Math.min(100, score));
    chip.style.display = '';
    chip.textContent = '♥ ' + score;
    let tier = '';
    if      (score < 50) tier = 'danger';
    else if (score < 80) tier = 'warn';
    if (tier) chip.setAttribute('data-tier', tier); else chip.removeAttribute('data-tier');
    chip.title = 'Extension health: ' + score + '/100' +
      (reasons.length ? '\n— ' + reasons.join('\n— ') : '\n(all signals nominal)') +
      '\n\nClick to open Diagnostics tab.';

    // v10.16.48 A6-#4: Diag tab gets a visual alert dot when health < 80.
    // Pre-fix the health chip in the header was the ONLY signal — the eye
    // had to travel from chip to Diag tab and the connection was visually
    // weak. Now: the Diag tab button itself carries `data-health-alert="1"`
    // (CSS rule in popup.css renders an amber dot via ::after pseudo-element).
    try {
      const diagBtn = $('tab-btn-diag');
      if (diagBtn) {
        if (score < 80) diagBtn.setAttribute('data-health-alert', '1');
        else            diagBtn.removeAttribute('data-health-alert');
      }
    } catch (_) {}

    // Click / Enter handler: jump to Diag tab
    const __openDiag = () => {
      try {
        const diagBtn = $('tab-btn-diag');
        if (diagBtn) diagBtn.click();
      } catch (_) {}
    };
    chip.addEventListener('click', __openDiag);
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); __openDiag(); }
    });
  } catch (_) { /* fail-silent: chip just stays hidden */ }
})();

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
    const r = await popupRpc('modSettingsRead');
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
    const r = await popupRpc('adminSettingsWrite', { key: 'maintenance_autonomous_enabled', value });
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
    // a11y: disclosure widget — make it keyboard-activatable.
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-expanded', 'false');
    row.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.key === ' ') e.preventDefault();
      row.click();
    });
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
      row.setAttribute('aria-expanded', detail.style.display === 'none' ? 'false' : 'true');
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
    const r = await popupRpc('adminMaintenanceReportsList', { days: 14, limit: 100, severity: sev });
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
    const r = await popupRpc('maintenanceRunNow');
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

// v10.16.29: AI provider key rotation wiring (lead-only).
// Architecture: worker proxies all AI calls + stores rotated keys in KV.
// Lead pastes new key → /admin/ai-key/rotate → KV update → all mods'
// next AI call uses the new key transparently (env.XAI_API_KEY is patched
// at request entry by the worker). No mod-side update, no redeploy.
async function __aiKeyLoadStatus() {
  const stEl = $('aiKeyStatus');
  if (!stEl) return;
  stEl.textContent = 'loading...';
  stEl.className = 'pop-token-status';
  try {
    const r = await popupRpc('adminAiKeyStatus');
    if (!r || !r.ok || !r.data || !r.data.ok) {
      stEl.className = 'pop-token-status err';
      stEl.textContent = 'fetch failed: ' + (r && (r.error || r.status) || '?');
      return;
    }
    const providers = r.data.providers || {};
    const envFb = providers._env_fallback || {};
    const parts = [];
    ['xai', 'openai', 'anthropic'].forEach(p => {
      const meta = providers[p];
      const envOk = (p === 'xai') ? !!envFb.xai : false;
      if (meta && meta.rotated_at) {
        const ago = Math.floor((Date.now() - meta.rotated_at) / (24 * 3600 * 1000));
        parts.push(p + ': ' + (meta.key_prefix || '?') + '…' + (meta.key_suffix || '?') + ' (rotated ' + ago + 'd ago)');
      } else if (envOk) {
        parts.push(p + ': env-fallback (legacy)');
      } else {
        parts.push(p + ': not set');
      }
    });
    stEl.textContent = parts.join(' · ');
  } catch (e) {
    stEl.className = 'pop-token-status err';
    stEl.textContent = 'error: ' + (e && e.message || e);
  }
}
async function __aiKeyRotate() {
  const provSel = $('aiKeyProvider');
  const provider = (provSel && provSel.value) || 'xai';
  const result = $('aiKeyResult');
  if (!result) return;
  result.className = 'pop-token-status';
  try {
    const key = await __popupAskText({
      title: '🔑 Rotate ' + provider + ' API key',
      label: 'Paste new ' + provider + ' API key (16-256 alphanumeric / _ / -). All mods will use this on their next AI call. Old key is invalidated immediately.',
      placeholder: 'sk-... / xai-... / etc',
      max: 260,
      validate: (v) => {
        if (!v) return 'key required';
        return /^[A-Za-z0-9_\-]{16,256}$/.test(v) ? '' : 'shape invalid (16-256 alphanumeric/_-)';
      }
    });
    if (!key) { result.textContent = 'cancelled'; return; }
    const ok = await __popupConfirm({
      title: 'Rotate ' + provider + ' key for the whole team?',
      body: 'Every mod\'s next AI call (Llama fallback / Grok / etc) will use this new key.\n\n' +
            'Old key value is immediately invalidated on the worker side.\n\n' +
            'Prefix: ' + key.slice(0, 4) + '…' + key.slice(-4) + ' (length ' + key.length + ')\n\n' +
            'Continue?',
      okLabel: 'Rotate',
      cancelLabel: 'Cancel'
    });
    if (!ok) { result.textContent = 'cancelled'; return; }
    result.textContent = 'rotating...';
    const r = await popupRpc('adminAiKeyRotate', { provider, key });
    if (!r || !r.ok || !r.data || !r.data.ok) {
      result.className = 'pop-token-status err';
      let msg = 'rotate rejected';
      if (r && r.status) msg += ' (HTTP ' + r.status + ')';
      if (r && r.data && r.data.error) msg += ' — ' + r.data.error;
      else if (r && r.error) msg += ' — ' + r.error;
      result.textContent = msg;
      return;
    }
    result.className = 'pop-token-status ok';
    result.textContent = '✓ rotated — ' + provider + ' key ' + r.data.key_prefix + '…' + r.data.key_suffix + ' is now live for the team';
    try { await __aiKeyLoadStatus(); } catch (_) {}
  } catch (e) {
    result.className = 'pop-token-status err';
    result.textContent = 'rotate error: ' + (e && e.message || e);
  }
}
(function __aiKeyWire() {
  const rotBtn = $('aiKeyRotateBtn');
  if (rotBtn) rotBtn.addEventListener('click', () => withLoading(rotBtn, 'rotating...', __aiKeyRotate));
  const refBtn = $('aiKeyRefreshBtn');
  if (refBtn) refBtn.addEventListener('click', () => withLoading(refBtn, '...', __aiKeyLoadStatus));
  // Auto-load when the details element opens (lazy)
  const det = $('gam-lead-ai-keys');
  if (det) det.addEventListener('toggle', () => { if (det.open) __aiKeyLoadStatus(); });
})();

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

// =============================================================================
// v10.12 PATCH 3 — Lead KPI Dashboard + Lapsed Chip + Quick-actions wiring
// D.3.4: CLR-RATE + MM p50 hooked to /mod/stats
// D.3.5: KPI delta tracking via sessionStorage
// D.3.6: lapsed chip replaces lapsedModsCard show/hide
// D.3.7: qaMaintBtn opens gam-lead-deepdive + scrolls to diag sub-panel
// D.3.12: TAB_MAP.lead updated implicitly (card-lead data-tab="lead" covers it)
// =============================================================================

// D.3.5: KPI delta helper
function _updateKpiDelta(tileId, newVal) {
  const key = 'gam_kpi_prev_' + tileId;
  const prev = sessionStorage.getItem(key);
  sessionStorage.setItem(key, String(newVal));
  const el = $(tileId + '-delta');
  if (!el || prev === null) { if (el) { el.textContent = ''; el.removeAttribute('data-dir'); } return; }
  const diff = newVal - Number(prev);
  if (diff === 0) { el.textContent = '='; el.setAttribute('data-dir', 'flat'); return; }
  el.textContent = (diff > 0 ? '+' : '') + diff;
  // v10.13.5 P1-12 (RALPH AUDIT LEADDAILY F8): inverted-color tiles where
  // numeric "up" means "worse" (e.g. MM p50 latency, INCIDENTS count). For
  // these, "up" should render red and "down" green. Driven by data-invert
  // on the tile element + CSS rules in popup.css.
  const tileEl = $(tileId);
  const inverted = tileEl && tileEl.getAttribute('data-invert') === 'true';
  const dir = diff > 0 ? 'up' : 'down';
  el.setAttribute('data-dir', inverted ? (dir === 'up' ? 'down' : 'up') : dir);
}

// D.3.4: set a KPI tile value + semantic color
function _setKpiTile(tileId, value, color) {
  const el = $(tileId + '-val');
  if (!el) return;
  if (value == null) {
    el.textContent = '--';
    el.style.color = 'var(--bb-ink-faint)';
    const de = $(tileId + '-delta');
    if (de) { de.textContent = '?'; de.setAttribute('data-dir', 'none'); }
    return;
  }
  const numVal = typeof value === 'number' ? value : parseFloat(value);
  el.textContent = String(value);
  el.style.color = color || 'var(--bb-ink)';
  _updateKpiDelta(tileId, isNaN(numVal) ? 0 : numVal);
}

// Persistent inline list of active mods, lazy-mounted under #leadKpiRow.
// Replaces the earlier toast which capped at 5 names. Toggled by clicking
// the kpi-active tile (or activating it via Enter/Space).
function __renderActiveModsPanel(mods) {
  let panel = document.getElementById('kpi-active-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'kpi-active-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Active mods list');
    panel.style.cssText = 'background:#11131a;border:1px solid #2a2d33;'
      + 'border-top:none;padding:6px 8px;margin:-8px 0 8px 0;'
      + 'max-height:180px;overflow:auto';
    const kpiRow = document.getElementById('leadKpiRow');
    if (kpiRow && kpiRow.parentNode) {
      kpiRow.parentNode.insertBefore(panel, kpiRow.nextSibling);
    } else {
      return; // no anchor, nothing to do
    }
    // Wire aria-controls now that the controlled element exists.
    const activeTile = document.getElementById('kpi-active');
    if (activeTile) activeTile.setAttribute('aria-controls', 'kpi-active-panel');
  }
  panel.replaceChildren();
  const header = document.createElement('div');
  header.style.cssText = 'font:600 9px/1.2 ui-monospace,monospace;color:#888;'
    + 'letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px';
  header.textContent = mods.length === 0
    ? 'No mods active right now'
    : 'Active now (' + mods.length + ')';
  panel.appendChild(header);
  mods.forEach(m => {
    const row = document.createElement('div');
    row.style.cssText = 'font:11px ui-monospace,monospace;color:#e4e4e4;'
      + 'padding:2px 0';
    row.textContent = 'u/' + (m.mod_username || m.username || '?');
    panel.appendChild(row);
  });
  panel.style.display = '';
}

// v10.14.2 LD1 (UIUX2-06 F.6/F.12): populate the 3 sub-status spans inside
// the Lead deep-dive accordion (rotation / maint reports / diagnostics) so
// the lead sees a one-line summary on each sub-summary without expanding.
// All values come from local gam_settings -- no RPCs to keep this cheap and
// safe even when the worker is degraded. Times are humanised via __relTime.
function __relTime(ts) {
  if (!ts) return null;
  const dt = (typeof ts === 'number') ? ts : Date.parse(ts);
  if (!dt || isNaN(dt)) return null;
  const diff = Math.max(0, Date.now() - dt);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 30) return d + 'd ago';
  return Math.floor(d / 30) + 'mo ago';
}

async function __renderLeadSubStatuses() {
  let s = {};
  try {
    const out = await chrome.storage.local.get('gam_settings');
    s = (out && out.gam_settings) || {};
  } catch(_){}
  const setSpan = (id, text, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text ? '· ' + text : '';
    el.style.cssText = 'color:' + (color || '#5a5752') + ';font-size:10px;letter-spacing:0.04em;margin-left:6px';
  };
  // Rotation: last token rotation timestamp
  const rotTs = s.rotated_at || s.workerModToken_issued_at || null;
  const rotRel = __relTime(rotTs);
  setSpan(
    'lead-sub-rotation-status',
    rotRel ? 'rotated ' + rotRel : 'no rotation on file',
    rotRel ? '#9b9892' : 'var(--bb-warn)'
  );
  // Maint reports: last weekly run timestamp
  const maintTs = s.maintLastRunAt || s.maint_last_run_at || null;
  const maintRel = __relTime(maintTs);
  setSpan(
    'lead-sub-maintreports-status',
    maintRel ? 'last run ' + maintRel : 'never run',
    maintRel ? '#9b9892' : 'var(--bb-warn)'
  );
  // Diag/audit: last audit verify timestamp
  const auditTs = s.lastAuditVerifyAt || s.last_audit_verify_at || null;
  const auditRel = __relTime(auditTs);
  setSpan(
    'lead-sub-diag-status',
    auditRel ? 'verified ' + auditRel : 'not verified',
    auditRel ? '#9b9892' : '#5a5752'
  );
}

async function __loadLeadKpi() {
  // Tile 1: Active Now from /presence/online (v10.10.1 color fix already applied)
  try {
    const r = await popupRpc('modPresencePing', {});
    if (r && r.ok && r.data) {
      const count = Array.isArray(r.data.mods) ? r.data.mods.length : (r.data.active_count || 0);
      const color = count === 0 ? 'var(--bb-red)' : count < 3 ? 'var(--bb-warn)' : 'var(--bb-green)';
      _setKpiTile('kpi-active', count, color);
    }
  } catch (_) {}

  // D.3.4: Tiles 2-3 from /mod/stats (CLR-RATE + MM p50)
  try {
    const stats = await popupRpc('modStats', {});
    if (stats && stats.ok && stats.data) {
      const clr = stats.data.queue_clear_rate_24h;
      const p50 = stats.data.modmail_p50_hours;
      // CLR-RATE color thresholds: green >=80%, amber 50-79%, red <50%
      const clrColor = clr == null ? null
        : clr >= 80 ? 'var(--bb-green)' : clr >= 50 ? 'var(--bb-warn)' : 'var(--bb-red)';
      _setKpiTile('kpi-clearrate', clr != null ? Math.round(clr) + '%' : null, clrColor);
      // MM p50 color thresholds: green <=2h, amber 2-6h, red >6h
      const p50Color = p50 == null ? null
        : p50 <= 2 ? 'var(--bb-green)' : p50 <= 6 ? 'var(--bb-warn)' : 'var(--bb-red)';
      _setKpiTile('kpi-mmp50', p50 != null ? p50.toFixed(1) + 'h' : null, p50Color);
      // AI budget visibility (also used by loadStats tile)
      const calls = stats.data.ai_calls_today;
      const cap   = stats.data.ai_calls_cap;
      if (typeof calls === 'number' && typeof cap === 'number') {
        const aiEl = $('s-ai-today');
        if (aiEl) aiEl.textContent = calls + '/' + cap;
      }
    }
  } catch (_) {}

  // Tile 4: INCIDENTS — endpoint not yet wired (V11 mod_incidents).
  // v10.13.5 P1-13 (RALPH AUDIT LEADDAILY F3, UIUX2-06 F.8): was hardcoded
  // `0, var(--bb-green)` which actively misled leads to read "no incidents"
  // when in fact NOTHING has been measured. Render "--" stub + tooltip
  // explaining the wire status, per spec verbatim.
  _setKpiTile('kpi-incidents', null, null);
  try {
    const incTile = $('kpi-incidents');
    if (incTile) incTile.title = 'INCIDENTS endpoint not yet wired (V11)';
  } catch(_){}

  // D.3.6: Load lapsed mods → chip (not lapsedModsCard)
  __loadLapsedMods();

  // v10.14.2 LD1 (UIUX2-06 F.6/F.12): wire 3 deep-dive sub-status spans so
  // a lead at-a-glance sees rotation freshness / last maint run / last audit
  // verify without expanding each accordion. Local-only reads (gam_settings)
  // -- no extra RPCs, fail-silent on missing data.
  try { await __renderLeadSubStatuses(); } catch(_){}

  // Wire quick-actions (once, idempotent)
  if (!window.__qaWired) {
    window.__qaWired = true;

    const qaInvite = $('qaInviteBtn');
    if (qaInvite) qaInvite.addEventListener('click', async function() {
      // v10.14.2 LD3: defensive prepend setTab('tokens') so the lead deep-dive
      // (which lives inside the tokens-tab panel after Wave A's three-state
      // machine) is visible if the user clicked QA from a different tab.
      try { if (typeof window.setTab === 'function') window.setTab('tokens'); } catch(_){}
      // v10.14.2 LD2: route via shared _handleInviteClick to keep deep-dive
      // and qa flows in lockstep. The previous separate handler had drifted
      // (caught + fixed in v10.12.1).
      withLoading(qaInvite, 'generating...', function() { return _handleInviteClick('qa'); });
    });

    const qaRotateAll = $('qaRotateAllBtn');
    if (qaRotateAll) qaRotateAll.addEventListener('click', function() {
      // v10.14.2 LD3: defensive setTab('tokens') prepend.
      try { if (typeof window.setTab === 'function') window.setTab('tokens'); } catch(_){}
      // Opens rotation sub-panel inside deep-dive
      const deepDive = $('gam-lead-deepdive');
      if (deepDive && !deepDive.open) deepDive.setAttribute('open', '');
      const rotSub = $('lead-sub-rotation');
      if (rotSub && !rotSub.open) rotSub.setAttribute('open', '');
      if (rotSub) rotSub.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    const qaBugs = $('qaBugsBtn');
    if (qaBugs) qaBugs.addEventListener('click', function() {
      const deepDive = $('gam-lead-deepdive');
      if (deepDive && !deepDive.open) deepDive.setAttribute('open', '');
      const bugSub = $('lead-sub-bugs');
      if (bugSub && !bugSub.open) bugSub.setAttribute('open', '');
      if (bugSub) bugSub.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // D.3.7: qaMaintBtn opens deep-dive accordion + scrolls to diag sub-panel
    const qaMaint = $('qaMaintBtn');
    if (qaMaint) qaMaint.addEventListener('click', function() {
      // v10.14.2 LD3: defensive setTab('tokens') prepend.
      try { if (typeof window.setTab === 'function') window.setTab('tokens'); } catch(_){}
      const deepDive = $('gam-lead-deepdive');
      if (deepDive && !deepDive.open) deepDive.setAttribute('open', '');
      const diagSub = $('lead-sub-diag');
      if (diagSub && !diagSub.open) diagSub.setAttribute('open', '');
      if (diagSub) diagSub.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // Sync bugs badge (bugListBadge -> qaBugsBadge)
    const bugBadge = $('bugListBadge');
    const qaBadge  = $('qaBugsBadge');
    if (bugBadge && qaBadge) {
      const obs = new MutationObserver(function() {
        qaBadge.textContent = bugBadge.textContent;
        qaBadge.style.display = bugBadge.style.display;
      });
      obs.observe(bugBadge, { childList: true, attributes: true, attributeFilter: ['style'] });
    }
  }
}

// D.3.6: __loadLapsedMods — now writes to #lapsedModsChip instead of #lapsedModsCard
async function __loadLapsedMods() {
  const chip    = $('lapsedModsChip');
  const list    = $('lapsedModsList');
  const countEl = $('lapsedModsCount');
  const status  = $('lapsedModsStatus');
  // Fall back gracefully whether chip or old card exists
  if (!list) return;

  const threshInput = $('lapsedThresholdInput');
  const days = Math.max(7, Math.min(60, parseInt((threshInput && threshInput.value) || 21, 10)));

  if (status) { status.className = 'pop-token-status'; status.textContent = 'loading...'; }
  try {
    const r = await popupRpc('adminModLapsed', { days: days });
    if (!r || !r.ok || !Array.isArray(r.data)) {
      if (status) { status.className = 'pop-token-status'; status.textContent = 'lapsed data unavailable (worker endpoint pending)'; }
      return;
    }
    const mods = r.data;
    // Show/hide chip based on count (D.3.6)
    if (chip) {
      chip.style.display = mods.length > 0 ? 'flex' : 'none';
    }
    if (countEl) countEl.textContent = mods.length > 0 ? String(mods.length) : '';
    list.replaceChildren();
    if (mods.length === 0) {
      if (status) { status.className = 'pop-token-status ok'; status.textContent = 'no lapsed mods'; }
      return;
    }
    mods.forEach(function(m) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--bb-line);font-size:11px';
      const nameEl = document.createElement('span');
      nameEl.style.cssText = 'flex:1;color:var(--bb-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      nameEl.textContent = m.mod_username || m.username || '?';
      const daysEl = document.createElement('span');
      daysEl.style.cssText = 'color:var(--bb-warn);font-variant-numeric:tabular-nums;min-width:28px;text-align:right';
      daysEl.textContent = String(m.days_since_action || '?') + 'd';
      const pingBtn = document.createElement('button');
      pingBtn.textContent = 'Ping';
      pingBtn.className = 'pop-btn pop-btn-ghost';
      pingBtn.style.cssText = 'font-size:9px;padding:1px 5px';
      pingBtn.addEventListener('click', function() {
        __showToast('Open ModChat to ping u/' + (m.mod_username || '?'), 'ok');
      });
      row.appendChild(nameEl); row.appendChild(daysEl); row.appendChild(pingBtn);
      list.appendChild(row);
    });
    if (status) { status.className = 'pop-token-status ok'; status.textContent = mods.length + ' lapsed mod(s) >' + days + 'd'; }
  } catch (e) {
    if (status) { status.className = 'pop-token-status'; status.textContent = 'lapsed load failed: ' + (e && e.message || e); }
  }
}

// Wire lapsed expand toggle (chip expands panel)
(function wireLapsedExpand() {
  const btn = $('lapsedExpandBtn');
  const panel = $('lapsedModsPanel');
  if (!btn || !panel) return;
  btn.addEventListener('click', function() {
    const expanded = panel.style.display !== 'none';
    panel.style.display = expanded ? 'none' : 'block';
    btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    btn.textContent = expanded ? 'Expand' : 'Collapse';
  });
})();

// Restart setup button wiring
// v10.13.3 W2: re-routes to State A. No more #firstRunWizard wrapper / Step1.
(function wireRestartSetup() {
  const btn = $('restartSetupBtn');
  if (!btn) return;
  btn.addEventListener('click', function() {
    try { __tokSetState('first-run'); } catch(_){}
    const step2 = $('firstRunWizardStep2');
    const success = $('firstRunWizardSuccess');
    if (step2) step2.style.display = 'none';
    if (success) success.style.display = 'none';
    // Restore path-row visibility (showStep(1) equivalent)
    const pathRow = document.querySelector('#tokStateFirstRun .tok-path-row');
    const pathDiv = document.querySelector('#tokStateFirstRun .tok-path-divider');
    const claimEl = document.getElementById('claimInviteBtn');
    const claimSt = document.getElementById('claimInviteStatus');
    if (pathRow) pathRow.style.display = '';
    if (pathDiv) pathDiv.style.display = '';
    if (claimEl) claimEl.style.display = '';
    if (claimSt) claimSt.style.display = '';
  });
})();
// =============================================================================
// END PATCH 3
// =============================================================================

// =============================================================================
// v10.x PATCH 2 — Token Section: wizard auto-collapse hook + restart button
// Wizard complete: call _cardWizardComplete() to collapse tokens card.
// (The wizard setTimeout block at ~L1894 is patched below.)
// =============================================================================
// [Hooked into wizard success block further up in file — see setTimeout patches]
// =============================================================================
// END PATCH 2
// =============================================================================

// =============================================================================
// E.3.1 (AF-32 Rule 94): Diagnostics tab — renderDiagTab()
// Auto-runs on tab show. Reads gam_sw_boots, gam_diag_log, gam_settings,
// chrome.alarms.getAll() in parallel. Auto-refreshes on storage.onChanged.
// =============================================================================
var _diagTabRendered = false;
async function renderDiagTab() {
  _diagTabRendered = true;
  var sysEl = $('diagSysIdentity');
  var swEl  = $('diagSwHealth');
  var rpcEl = $('diagRpcLog');
  var stoEl = $('diagStorage');
  if (!sysEl || !swEl || !rpcEl || !stoEl) return;

  // --- Section 1: System identity ---
  try {
    var mf = chrome.runtime.getManifest();
    var perms = await new Promise(function(res) {
      try { chrome.permissions.getAll(function(p) { res(p); }); } catch(_) { res({}); }
    });
    var ua = navigator.userAgent;
    var chromeMatch = ua.match(/Chrome\/([\d.]+)/);
    var chromeVer = chromeMatch ? chromeMatch[1] : 'unknown';
    var permList = (perms.permissions || []).concat(perms.origins || []).join(', ');
    sysEl.textContent = [
      'Extension: v' + mf.version + ' (' + chrome.runtime.id + ')',
      'Browser: Chrome ' + chromeVer,
      'Permissions: ' + permList
    ].join('\n');
    sysEl.className = 'pop-token-status ok';
  } catch(e) {
    sysEl.textContent = 'identity read failed: ' + (e && e.message || e);
    sysEl.className = 'pop-token-status err';
  }

  // --- Section 2: SW health + alarms ---
  try {
    var data = await chrome.storage.local.get(['gam_sw_boots', 'gam_settings']);
    var boots = (data.gam_sw_boots) || [];
    var last = boots.length > 0 ? boots[boots.length - 1] : null;
    var lastAgo = last ? Math.round((Date.now() - new Date(last.ts).getTime()) / 1000) + 's ago' : 'no boot recorded';
    var alarms = await new Promise(function(res) {
      try { chrome.alarms.getAll(function(a) { res(a || []); }); } catch(_) { res([]); }
    });
    var alarmLines = alarms.map(function(a) {
      return '  ' + a.name + ' — next: ' + new Date(a.scheduledTime).toLocaleTimeString();
    });
    var bootLines = boots.slice(-5).reverse().map(function(b) {
      return '  ' + (b.ts ? new Date(b.ts).toLocaleTimeString() : '?') + ' — ' + (b.reason || '?');
    });
    swEl.textContent = [
      'Boot count: ' + boots.length + ' (max 50 ring buffer)',
      'Last boot: ' + (last ? last.ts : 'none') + ' (' + lastAgo + ')',
      'Last boot reason: ' + (last ? last.reason || '?' : '—'),
      '',
      'Recent boots:',
      bootLines.join('\n') || '  (none)',
      '',
      'Active alarms:',
      alarmLines.join('\n') || '  (none)'
    ].join('\n');
    swEl.className = 'pop-token-status ok';
  } catch(e) {
    swEl.textContent = 'SW health read failed: ' + (e && e.message || e);
    swEl.className = 'pop-token-status err';
  }

  // --- Section 3: RPC error log ---
  // v10.12.4 HOTFIX: gam_diag_log moved to IndexedDB in v10.12.3 PA.3 migration.
  // Direct chrome.storage.local read returns empty since entries are in IDB now.
  // Route through diagReadRecent RPC. Fall back to legacy storage.local read for
  // pre-migration backwards-compat (returns empty post-migration; harmless).
  var diagRpcEntries = [];
  try {
    var diagLog = [];
    try {
      var rpcResp = await popupRpc('diagReadRecent', { limit: 500 });
      if (rpcResp && rpcResp.ok && rpcResp.data) {
        diagLog = Array.isArray(rpcResp.data.entries) ? rpcResp.data.entries
                : Array.isArray(rpcResp.data) ? rpcResp.data
                : [];
      }
    } catch (eRpc) {}
    if (diagLog.length === 0) {
      var diagData = await chrome.storage.local.get('gam_diag_log');
      diagLog = (diagData && diagData.gam_diag_log) || [];
    }
    var errorCats = ['unhandledrejection', 'uncaught-error', 'rpc-error', 'net-error'];
    diagRpcEntries = diagLog.filter(function(e) {
      return errorCats.some(function(c) { return e && e.cat && e.cat.indexOf(c) !== -1; });
    }).slice(-50).reverse();
    if (diagRpcEntries.length === 0) {
      rpcEl.textContent = '';
      var chip = document.createElement('div');
      chip.style.cssText = 'color:#3dd68c;font-size:10px;padding:4px';
      chip.textContent = 'No RPC errors in log';
      rpcEl.appendChild(chip);
    } else {
      rpcEl.textContent = '';
      diagRpcEntries.forEach(function(entry) {
        var row = document.createElement('div');
        row.style.cssText = 'border-bottom:1px solid #1e2128;padding:2px 0;display:flex;gap:4px;align-items:baseline';
        var ts = document.createElement('span');
        ts.style.cssText = 'color:#5c6370;flex:0 0 60px;font-size:9px';
        ts.textContent = entry.ts ? new Date(entry.ts).toLocaleTimeString() : '?';
        var cat = document.createElement('span');
        cat.style.cssText = 'color:#f0a040;flex:0 0 80px;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        cat.textContent = entry.cat || '';
        var msg = document.createElement('span');
        msg.style.cssText = 'color:#e8eaed;flex:1;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        msg.textContent = (entry.msg || '').slice(0, 120);
        row.appendChild(ts); row.appendChild(cat); row.appendChild(msg);
        rpcEl.appendChild(row);
      });
    }
  } catch(e) {
    rpcEl.textContent = 'diag log read failed: ' + (e && e.message || e);
  }

  // Wire "Copy errors" button
  var diagExportBtn = $('diagExportErrors');
  if (diagExportBtn) {
    diagExportBtn.onclick = function() {
      try {
        // v10.12.1 PC.3: deep-mask diag error entries before clipboard export
        var out = JSON.stringify(_maskSecretsDeep(diagRpcEntries), null, 2);
        // v10.13.2 W5: copyWithPulse handles 3-layer fallback + COPIED flash uniformly
        copyWithPulse(diagExportBtn, out);
      } catch(_) {}
    };
  }

  // Wire debug snapshot button (moved here from Tools card)
  var diagSnapBtn = $('diagSnapshotBtn');
  var toolsDebugBtn = $('debugBtn');
  if (diagSnapBtn && toolsDebugBtn) {
    diagSnapBtn.addEventListener('click', function() { toolsDebugBtn.click(); });
  }

  // v10.16.32 (Grok #114): test-connection ping. Times a round-trip to the
  // worker via modWhoami (cheapest authenticated RPC). Latency + status →
  // result span. Disables button while in-flight, re-enables on completion.
  var diagPingBtn = $('diagPingBtn');
  var diagPingResult = $('diagPingResult');
  if (diagPingBtn && diagPingResult) {
    diagPingBtn.addEventListener('click', async function() {
      diagPingBtn.disabled = true;
      diagPingResult.style.color = 'var(--bb-ink-dim)';
      diagPingResult.textContent = '… probing';
      var t0 = performance.now();
      try {
        var r = await popupRpc('modWhoami');
        var ms = Math.round(performance.now() - t0);
        if (r && r.ok) {
          diagPingResult.style.color = 'var(--bb-green)';
          var who = r.data && r.data.username ? r.data.username : '(unknown)';
          diagPingResult.textContent = '✓ ok ' + ms + 'ms · as ' + who;
        } else {
          diagPingResult.style.color = 'var(--bb-red)';
          var st = r && r.status ? r.status : '?';
          var err = r && (r.error || r.text) ? (r.error || r.text).slice(0, 80) : 'no detail';
          diagPingResult.textContent = '✕ HTTP ' + st + ' ' + ms + 'ms · ' + err;
        }
      } catch (e) {
        var ms2 = Math.round(performance.now() - t0);
        diagPingResult.style.color = 'var(--bb-red)';
        diagPingResult.textContent = '✕ throw ' + ms2 + 'ms · ' + (e && e.message ? e.message.slice(0, 80) : 'unknown');
      } finally {
        diagPingBtn.disabled = false;
      }
    });
  }

  // v10.17: AI smoke-test buttons — Explain / Summarize / Suggest
  (function() {
    var smokeResult = $('diagAiSmokeResult');
    function showSmokeResult(text, ok) {
      if (!smokeResult) return;
      smokeResult.style.display = 'block';
      smokeResult.style.color = ok ? 'var(--bb-green)' : 'var(--bb-red)';
      smokeResult.textContent = text;
    }
    function makeSmokeHandler(btnId, rpcName, args, label) {
      var btn = $(btnId);
      if (!btn) return;
      btn.addEventListener('click', async function() {
        btn.disabled = true;
        if (smokeResult) { smokeResult.style.display = 'block'; smokeResult.textContent = '... probing'; smokeResult.style.color = 'var(--bb-ink-dim)'; }
        var t0 = performance.now();
        try {
          var r = await popupRpc(rpcName, args);
          var ms = Math.round(performance.now() - t0);
          if (r && r.ok) {
            var preview = r.data && typeof r.data === 'object' ? JSON.stringify(r.data).slice(0, 200) : String(r.data || '').slice(0, 200);
            showSmokeResult('[' + label + '] ok ' + ms + 'ms  ' + preview, true);
          } else {
            var err = r && (r.error || r.text) ? (r.error || r.text).slice(0, 120) : 'no detail';
            showSmokeResult('[' + label + '] FAIL ' + ms + 'ms  HTTP ' + (r && r.status ? r.status : '?') + '  ' + err, false);
          }
        } catch (e) {
          var ms2 = Math.round(performance.now() - t0);
          showSmokeResult('[' + label + '] throw ' + ms2 + 'ms  ' + (e && e.message ? e.message.slice(0, 120) : 'unknown'), false);
        } finally {
          btn.disabled = false;
        }
      });
    }
    makeSmokeHandler('diagAiExplainBtn', 'aiExplain', { username: 'catsfive', context: 'mod-console', target_type: 'user' }, 'Explain');
    makeSmokeHandler('diagAiSumBtn', 'aiSummarizeThread', { content: 'User reports a brigade -- 5 accounts all created today are downvoting one thread.' }, 'Summarize');
    makeSmokeHandler('diagAiSugBtn', 'aiSuggestAction', { username: 'catsfive', context_summary: 'User posted off-topic memes in /p/123456.' }, 'Suggest');
  })();

  // --- Section 4: Storage + audit ---
  try {
    var total = await new Promise(function(resolve, reject) {
      try { chrome.storage.local.getBytesInUse(null, function(n) { resolve(n); }); }
      catch(e) { reject(e); }
    });
    var pct = total / MAINT_QUOTA_BYTES * 100;
    var tokenData = await chrome.storage.local.get('gam_settings');
    var ts2s = tokenData && tokenData.gam_settings;
    // v10.11 T3 (REDTEAM-1): use new issued_at / expires_at metadata fields.
    var nowMsD = Date.now();
    var workerIssued = ts2s && ts2s.workerModToken_issued_at;
    var workerExpires = ts2s && ts2s.workerModToken_expires_at;
    var workerAgeLine = workerIssued
      ? ('Team token age: ' + Math.floor((nowMsD - workerIssued) / 86400000) + 'd' +
         (workerExpires ? (' / expires in ' + Math.max(0, Math.floor((workerExpires - nowMsD) / 86400000)) + 'd') : ''))
      : 'Team token age: unknown';
    var leadIssued = ts2s && ts2s.leadModToken_issued_at;
    var leadExpires = ts2s && ts2s.leadModToken_expires_at;
    var leadAgeLine = leadIssued
      ? ('Lead token age: ' + Math.floor((nowMsD - leadIssued) / 86400000) + 'd' +
         (leadExpires ? (' / expires in ' + Math.max(0, Math.floor((leadExpires - nowMsD) / 86400000)) + 'd') : ''))
      : '';
    var stoLines = ['Storage: ' + __fmtBytes(total) + ' (' + pct.toFixed(1) + '% of 5MB)', workerAgeLine];
    if (leadAgeLine) stoLines.push(leadAgeLine);
    // Amber chip if either token expires within 7 days
    var workerDaysLeft = workerExpires ? Math.floor((workerExpires - nowMsD) / 86400000) : 999;
    var leadDaysLeft = leadExpires ? Math.floor((leadExpires - nowMsD) / 86400000) : 999;
    var minDaysLeft = Math.min(workerDaysLeft, leadDaysLeft);
    stoEl.textContent = stoLines.join('\n');
    stoEl.className = (pct > 80 || minDaysLeft <= 3) ? 'pop-token-status err' : (pct > 60 || minDaysLeft <= 7) ? 'pop-token-status warn' : 'pop-token-status ok';
  } catch(e) {
    stoEl.textContent = 'storage read failed: ' + (e && e.message || e);
    stoEl.className = 'pop-token-status err';
  }

  // --- Section 5: Crypto health (v10.11 T4 REDTEAM-1) ---
  var cryptEl = $('diagCryptEl');
  if (cryptEl) {
    try {
      var cryptResp = await chrome.runtime.sendMessage({ type: 'cryptHealth' });
      var ch = cryptResp && cryptResp.data;
      if (ch) {
        cryptEl.textContent = [
          'Crypto key present: ' + (ch.cryptKeyPresent ? 'yes' : 'NO (IDB unavailable?)'),
          'IDB available: ' + (ch.idbAvailable ? 'yes' : 'NO'),
          'Encrypted tokens: ' + ch.encryptedTokensFound,
          'Plaintext tokens: ' + ch.plaintextTokensFound + (ch.plaintextTokensFound > 0 ? ' (migration pending)' : ''),
          'Last migration: ' + (ch.lastMigrationTs ? new Date(ch.lastMigrationTs).toLocaleString() : 'never')
        ].join('\n');
        cryptEl.className = (!ch.cryptKeyPresent || !ch.idbAvailable) ? 'pop-token-status err' : ch.plaintextTokensFound > 0 ? 'pop-token-status warn' : 'pop-token-status ok';
      } else {
        cryptEl.textContent = 'crypt health unavailable';
        cryptEl.className = 'pop-token-status warn';
      }
    } catch(e) {
      cryptEl.textContent = 'crypt health error: ' + (e && e.message || e);
      cryptEl.className = 'pop-token-status err';
    }
  }
}

// Wire the Diag tab to render on first show, auto-refresh on storage changes
(function wireDiagTab() {
  var diagBtn = document.querySelector('.pop-tab[data-tab="diag"]');
  if (!diagBtn) return;
  diagBtn.addEventListener('click', function() {
    setTimeout(function() { try { renderDiagTab(); } catch(_) {} }, 50);
  });
  // Auto-refresh when diag keys change
  try {
    chrome.storage.onChanged.addListener(function(changes) {
      if (!_diagTabRendered) return;
      var diagSection = $('diagTabSection');
      if (!diagSection || diagSection.classList.contains('pop-tab-hidden')) return;
      if (changes.gam_diag_log || changes.gam_sw_boots) {
        renderDiagTab();
      }
    });
  } catch(_) {}
})();
// =============================================================================
// END E.3.1
// =============================================================================

// =============================================================================
// E.3.4 (AF-33 Rule 98): Promote session drafts to local with TTL
// gam_modmail_drafts: 4h TTL mirror. gam_macro_drafts: 24h TTL mirror.
// On read: purge stale (savedAt + TTL < now). On write: update local mirror.
// This is a utility for modtools.js to call via RPC; popup.js handles the
// local-side cleanup on popup open (prunes stale TTL entries).
// =============================================================================
// v10.13.5 P1-07 (RALPH AUDIT W4 + MODMAIL-DEEP F4): TTL contract was split
// across files -- modtools.js read with 24h (W4 widening), but popup.js
// purge here was still 4h. Mod opening popup at hour 5 silently nuked the
// local mirror BEFORE panel could read it. Now both sides agree on 24h.
var DRAFT_TTL_MODMAIL_MS = 24 * 60 * 60 * 1000;  // 24 hours (was 4h)
var DRAFT_TTL_MACRO_MS   = 24 * 60 * 60 * 1000;  // 24 hours

(async function purgeStaleDrafts() {
  try {
    var now = Date.now();
    // Modmail drafts
    var mmData = await chrome.storage.local.get('gam_modmail_drafts_local');
    var mmDraft = mmData && mmData.gam_modmail_drafts_local;
    if (mmDraft && mmDraft.savedAt && (now - mmDraft.savedAt) > DRAFT_TTL_MODMAIL_MS) {
      await chrome.storage.local.remove('gam_modmail_drafts_local');
    }
    // Macro drafts
    var macData = await chrome.storage.local.get('gam_macro_drafts_local');
    var macDraft = macData && macData.gam_macro_drafts_local;
    if (macDraft && macDraft.savedAt && (now - macDraft.savedAt) > DRAFT_TTL_MACRO_MS) {
      await chrome.storage.local.remove('gam_macro_drafts_local');
    }
  } catch(_) {}
})();
// =============================================================================
// END E.3.4
// =============================================================================

// ====================== GAW MOD Pro Tier — popup patchset v1.0 (additive — appended at EOF) ======================
// ============================================================================
// GAW MOD Pro Tier - popup.js ADDITIVE SNIPPET
// ============================================================================
// PURPOSE: Wires up the additive markup from popup-pro-badge.html.snippet:
//   1. On popup open  -> GET /stripe/status, toggle #pro-badge vs #upgrade-cta
//   2. On CTA click   -> POST /stripe/checkout, open Stripe URL in new tab,
//                        start 3s polling loop (max 100 polls = 5 minutes)
//   3. Polling        -> stops on { pro: true } | timeout | popup close
//   4. refreshProStatus() helper -> idempotent re-run of (1)
//
// PASTE LOCATION:
//   Append this entire block to the BOTTOM of modtools-ext/popup/popup.js,
//   AFTER any existing init code. The IIFE keeps all symbols scoped so
//   nothing leaks into the global namespace or collides with existing names.
//
// CONSTRAINTS (CLAUDE.md sections 2, 3, 8):
//   - Vanilla DOM API only (no fetch wrappers, no libraries)
//   - Purely additive (no existing IDs/classes touched)
//   - Uses existing chrome.storage.local keys: 'mod_token', 'worker_url'
//   - Uses existing 'tabs' permission for chrome.tabs.create
// ============================================================================

(function initGawProTier() {
  'use strict';

  // --------------------------------------------------------------------------
  // Constants
  // --------------------------------------------------------------------------
  const POLL_INTERVAL_MS = 3000;       // 3 seconds between polls
  const POLL_MAX_ATTEMPTS = 100;       // 100 * 3s = 300s = 5 minutes
  const LOG_TAG = '[gaw-pro]';

  // --------------------------------------------------------------------------
  // Module state (scoped to this IIFE)
  // --------------------------------------------------------------------------
  let pollIntervalId = null;
  let pollAttempts = 0;

  // --------------------------------------------------------------------------
  // Tiny logger - brief, Discord-style. NEVER throws.
  // --------------------------------------------------------------------------
  function log(msg, extra) {
    try {
      if (extra !== undefined) {
        console.log(LOG_TAG, msg, extra);
      } else {
        console.log(LOG_TAG, msg);
      }
    } catch (_) { /* console unavailable - swallow */ }
  }

  function warn(msg, extra) {
    try {
      if (extra !== undefined) {
        console.warn(LOG_TAG, msg, extra);
      } else {
        console.warn(LOG_TAG, msg);
      }
    } catch (_) { /* swallow */ }
  }

  // --------------------------------------------------------------------------
  // Storage helpers - Promise wrappers around chrome.storage.local.get
  // --------------------------------------------------------------------------
  function getStorage(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            warn('storage.get error', chrome.runtime.lastError.message);
            resolve({});
            return;
          }
          resolve(result || {});
        });
      } catch (err) {
        warn('storage.get threw', err && err.message);
        resolve({});
      }
    });
  }

  async function getWorkerContext() {
    const data = await getStorage(['mod_token', 'worker_url']);
    return {
      token: data.mod_token || '',
      baseUrl: (data.worker_url || '').replace(/\/+$/, ''), // strip trailing /
    };
  }

  // --------------------------------------------------------------------------
  // DOM helpers - safe lookups (return null if missing, don't blow up popup)
  // --------------------------------------------------------------------------
  function el(id) {
    return document.getElementById(id);
  }

  function show(id, isVisible) {
    const node = el(id);
    if (!node) return;
    if (isVisible) {
      node.removeAttribute('hidden');
    } else {
      node.setAttribute('hidden', '');
    }
  }

  function setStatusText(text) {
    const node = el('upgrade-cta-status');
    if (!node) return;
    if (text) {
      node.textContent = text;
      node.removeAttribute('hidden');
    } else {
      node.textContent = '';
      node.setAttribute('hidden', '');
    }
  }

  function applyProClass(isPro) {
    const badge = el('pro-badge');
    if (!badge) return;
    if (isPro) {
      badge.classList.add('is-pro');
    } else {
      badge.classList.remove('is-pro');
    }
  }

  // --------------------------------------------------------------------------
  // Network: GET /stripe/status
  // Returns: { pro: boolean, status: string } | null on error
  // --------------------------------------------------------------------------
  async function fetchStripeStatus() {
    const { token, baseUrl } = await getWorkerContext();
    if (!token || !baseUrl) {
      warn('missing token or worker_url - skipping status check');
      return null;
    }

    try {
      const res = await fetch(baseUrl + '/stripe/status', {
        method: 'GET',
        headers: {
          'x-mod-token': token,
          'accept': 'application/json',
        },
      });

      if (res.status === 401) {
        warn('status 401 - token rejected');
        return null;
      }
      if (!res.ok) {
        warn('status non-OK', res.status);
        return null;
      }

      const data = await res.json();
      // Contract is { pro: boolean, status: string }. Defensive coerce.
      return {
        pro: data && data.pro === true,
        status: (data && typeof data.status === 'string') ? data.status : '',
      };
    } catch (err) {
      warn('status network error', err && err.message);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Network: POST /stripe/checkout
  // Returns: { url: string } | null on error
  // --------------------------------------------------------------------------
  async function createCheckoutSession() {
    const { token, baseUrl } = await getWorkerContext();
    if (!token || !baseUrl) {
      warn('missing token or worker_url - cannot start checkout');
      return null;
    }

    try {
      const res = await fetch(baseUrl + '/stripe/checkout', {
        method: 'POST',
        headers: {
          'x-mod-token': token,
          'accept': 'application/json',
        },
      });

      if (!res.ok) {
        warn('checkout non-OK', res.status);
        return null;
      }

      const data = await res.json();
      if (!data || typeof data.url !== 'string' || !data.url) {
        warn('checkout response missing url field');
        return null;
      }
      return { url: data.url };
    } catch (err) {
      warn('checkout network error', err && err.message);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // DELIVERABLE 4: refreshProStatus()
  // Idempotent. Called on popup open and after polling success.
  // Re-fetches /stripe/status and updates the UI accordingly.
  // --------------------------------------------------------------------------
  async function refreshProStatus() {
    const result = await fetchStripeStatus();

    // Network failure / 401 -> do NOT block the popup. Leave both hidden.
    if (result === null) {
      show('pro-badge', false);
      show('upgrade-cta', false);
      return;
    }

    if (result.pro) {
      // Pro user: show gold badge, hide upgrade CTA
      show('pro-badge', true);
      applyProClass(true);
      show('upgrade-cta', false);
      log('pro tier active');
    } else {
      // Free user: hide badge, show upgrade CTA
      show('pro-badge', false);
      applyProClass(false);
      show('upgrade-cta', true);
      log('free tier - showing upgrade CTA');
    }
  }

  // --------------------------------------------------------------------------
  // DELIVERABLE 3: polling loop
  // Cancellable via stopPolling(). Runs at most POLL_MAX_ATTEMPTS times.
  // On { pro: true } -> calls refreshProStatus() then stops.
  // On timeout -> stops, leaves UI as-is, logs timeout.
  // --------------------------------------------------------------------------
  function stopPolling(reason) {
    if (pollIntervalId !== null) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
      log('polling stopped', reason || 'unspecified');
    }
    pollAttempts = 0;
  }

  function startPolling() {
    // Guard: never run two pollers concurrently
    if (pollIntervalId !== null) {
      log('polling already active - not starting another');
      return;
    }
    pollAttempts = 0;
    log('polling started (every ' + POLL_INTERVAL_MS + 'ms, max ' + POLL_MAX_ATTEMPTS + ')');
    setStatusText('Waiting for payment confirmation...');

    pollIntervalId = setInterval(async () => {
      pollAttempts += 1;

      if (pollAttempts > POLL_MAX_ATTEMPTS) {
        stopPolling('timeout after ' + POLL_MAX_ATTEMPTS + ' attempts');
        setStatusText('Timed out - reopen the popup after payment.');
        return;
      }

      const result = await fetchStripeStatus();
      // Network errors during polling are non-fatal - just keep trying
      if (result === null) {
        return;
      }

      if (result.pro) {
        stopPolling('pro tier confirmed');
        setStatusText('');
        await refreshProStatus();
      }
    }, POLL_INTERVAL_MS);
  }

  // --------------------------------------------------------------------------
  // DELIVERABLE 2: "Upgrade to Pro" click handler
  // Creates Stripe Checkout session, opens it in a new tab, starts polling.
  // --------------------------------------------------------------------------
  async function onUpgradeClick(evt) {
    if (evt && typeof evt.preventDefault === 'function') {
      evt.preventDefault();
    }

    const button = el('upgrade-cta-button');
    if (button) {
      button.disabled = true;
    }
    setStatusText('Opening Stripe Checkout...');

    const checkout = await createCheckoutSession();

    if (!checkout) {
      setStatusText('Could not start checkout. Try again in a moment.');
      if (button) {
        button.disabled = false;
      }
      return;
    }

    // Open Stripe Checkout in a new tab. Uses existing 'tabs' permission.
    try {
      chrome.tabs.create({ url: checkout.url });
      log('checkout tab opened');
    } catch (err) {
      warn('chrome.tabs.create failed', err && err.message);
      setStatusText('Could not open checkout tab.');
      if (button) {
        button.disabled = false;
      }
      return;
    }

    // Re-enable button (user may want to retry if they close Stripe tab)
    if (button) {
      button.disabled = false;
    }

    // Kick off the polling loop immediately
    startPolling();
  }

  // --------------------------------------------------------------------------
  // DELIVERABLE 1: bind handlers + run initial status check on popup open
  // --------------------------------------------------------------------------
  function wireUp() {
    const button = el('upgrade-cta-button');
    if (button) {
      button.addEventListener('click', onUpgradeClick);
    } else {
      warn('#upgrade-cta-button not found - HTML snippet may not be pasted');
    }

    // Ensure polling is cancelled if the popup window unloads (popup closed).
    // chrome extension popups fire 'unload' when the user clicks away.
    window.addEventListener('unload', () => stopPolling('popup unload'));

    // Initial status check
    refreshProStatus();
  }

  // Defer until DOM ready so element lookups succeed regardless of
  // where this snippet was pasted relative to other init code.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireUp, { once: true });
  } else {
    wireUp();
  }

  // Expose refreshProStatus on window so other parts of popup.js (or future
  // additions) can re-sync after, e.g., a manual token change.
  // Namespaced to avoid collisions.
  window.gawPro = Object.freeze({
    refreshProStatus: refreshProStatus,
  });
})();

// ============================================================================
// END OF popup-pro-badge.js.snippet
// ============================================================================
// ====================== END GAW MOD Pro Tier — popup patchset v1.0 ======================

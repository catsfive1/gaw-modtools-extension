# Proactive Notices Pattern Library
## v10.x — modtools-ext

Derived from: v10.0 `gam-brave-banner` (modtools.js:18328). Generalises that
pattern into a reusable component, then specifies ten contextual notices.

---

## A. SHARED COMPONENT — `gamProactiveNotice`

### API

```js
/**
 * Render a proactive contextual notice.
 *
 * @param {object} opts
 * @param {string}   opts.id             - Unique stable key (used as storage dismiss flag: `gam_notice_${id}_dismissed`)
 * @param {'warn'|'alert'|'incident'} opts.severity
 *                                       - warn=amber  alert=red  incident=fuchsia
 * @param {string}   opts.headline       - Short bold line (≤60 chars). Plain text.
 * @param {string}   opts.body           - One sentence of context / what to do.
 * @param {string}   [opts.action_label] - Button label. Omit = notice-only (dismiss X only).
 * @param {Function} [opts.action_fn]    - Called when action button is clicked. Receives teardown() as first arg.
 * @param {boolean}  [opts.persist_dismiss=true]
 *                                       - true  = dismissed flag lives in chrome.storage.local (survives page reload)
 *                                       - false = session-only (flag clears on unload; suits pulse notices)
 * @param {boolean}  [opts.one_per_session=false]
 *                                       - Suppress re-render if this notice already showed this page-load.
 * @param {Function} [opts.auto_clear_condition]
 *                                       - Async fn → bool. If supplied, fires every 15s;
 *                                         resolves true → auto-teardown (does NOT set dismiss flag).
 * @returns {{ teardown: Function }}
 */
function gamProactiveNotice(opts) { ... }
```

### Severity palette (Bloomberg aesthetic — square corners, text-driven)

| `severity` | Background  | Border / text accent | Use for                          |
|------------|-------------|----------------------|----------------------------------|
| `warn`     | `#1a0f00`   | `#ff9933` (amber)    | Soft threshold, non-urgent       |
| `alert`    | `#1a0000`   | `#ff3333` (red)      | Action required, time-sensitive  |
| `incident` | `#1a001a`   | `#ff33ff` (fuchsia)  | Platform down, brigade, multi-mod|

### Render skeleton

```js
function gamProactiveNotice(opts) {
  const {
    id, severity = 'warn', headline, body,
    action_label, action_fn,
    persist_dismiss = true,
    one_per_session = false,
    auto_clear_condition
  } = opts;

  const STORE_KEY = `gam_notice_${id}_dismissed`;
  const SESSION_KEY = `gam_notice_shown_${id}`;

  // Session-level de-dupe
  if (one_per_session && sessionStorage.getItem(SESSION_KEY)) return { teardown: () => {} };
  sessionStorage.setItem(SESSION_KEY, '1');

  const PALETTE = {
    warn:     { bg: '#1a0f00', accent: '#ff9933' },
    alert:    { bg: '#1a0000', accent: '#ff3333' },
    incident: { bg: '#1a001a', accent: '#ff33ff' }
  };
  const { bg, accent } = PALETTE[severity] || PALETTE.warn;

  const wrap = document.createElement('div');
  wrap.id = `gam-notice-${id}`;
  wrap.style.cssText = [
    'position:fixed;top:0;left:0;right:0;z-index:2147483640',
    `background:${bg};border-bottom:2px solid ${accent}`,
    `color:${accent};font:600 12px/1.4 ui-monospace,JetBrains Mono,Consolas,monospace`,
    'padding:10px 16px;box-shadow:0 2px 12px rgba(0,0,0,0.6);letter-spacing:0.04em',
    'display:flex;align-items:center;gap:12px'
  ].join(';');

  const actionHTML = action_label
    ? `<button id="gam-notice-${id}-action"
         style="background:${accent};color:#000;border:0;padding:3px 10px;
                font:700 11px ui-monospace,monospace;cursor:pointer;letter-spacing:0.06em"
       >${action_label}</button>`
    : '';

  wrap.innerHTML = `
    <span style="flex:1">
      <strong>${headline}</strong>
      <span style="font-weight:400;margin-left:8px;opacity:0.85">${body}</span>
    </span>
    ${actionHTML}
    <button id="gam-notice-${id}-dismiss"
      style="background:transparent;color:${accent};border:1px solid ${accent};
             padding:2px 8px;font:600 11px ui-monospace,monospace;cursor:pointer">
      X
    </button>
  `;

  const prevPad = document.body?.style.paddingTop || '';
  try { document.body.style.paddingTop = '52px'; } catch (_) {}
  try { document.documentElement.appendChild(wrap); } catch (_) {
    try { document.body.appendChild(wrap); } catch (_) {}
  }

  const teardown = () => {
    try { wrap.remove(); } catch (_) {}
    try { document.body.style.paddingTop = prevPad; } catch (_) {}
  };

  const dismiss = async () => {
    if (persist_dismiss) {
      try { await chrome.storage.local.set({ [STORE_KEY]: Date.now() }); } catch (_) {}
    }
    teardown();
  };

  document.getElementById(`gam-notice-${id}-dismiss`)?.addEventListener('click', dismiss);
  if (action_label) {
    document.getElementById(`gam-notice-${id}-action`)?.addEventListener('click', () => {
      action_fn?.(teardown);
    });
  }

  // Auto-clear polling (does NOT write dismiss flag — only UI dismiss does)
  if (auto_clear_condition) {
    const iv = setInterval(async () => {
      try { if (await auto_clear_condition()) { clearInterval(iv); teardown(); } } catch (_) {}
    }, 15_000);
  }

  return { teardown };
}
```

### Dismiss-flag guard (call before rendering)

Every notice must check its own flag before mounting:

```js
async function _shouldShowNotice(id) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get([`gam_notice_${id}_dismissed`], r => {
        resolve(!r[`gam_notice_${id}_dismissed`]);
      });
    } catch (_) { resolve(true); }
  });
}
```

---

## B. TEN NOTICES

---

### N-01 — TOKEN AGE > 75 DAYS (amber warn)

**Trigger condition:** `Date.now() - tokenIssuedAt > 75 * 86_400_000`  
Read `tokenIssuedAt` from settings. Fire on page load, once per session.

**Severity:** `warn`

**Headline:** `TOKEN EXPIRY IN <N> DAYS`

**Body:** `Your mod token was issued on <date>. It expires after 90 days. Re-claim now before you lose access mid-shift.`

**Action label:** `RE-CLAIM TOKEN`

**Action handler:** Opens the popup to the token claim view.
```js
action_fn: (teardown) => {
  chrome.runtime.sendMessage({ type: 'GAM_OPEN_POPUP', view: 'token-claim' });
  // teardown() NOT called here — let the user complete the flow; auto_clear fires on token renewal
}
```

**Dismissal:** `persist_dismiss: true` — stays dismissed for current token lifetime.

**Auto-clear condition:** Token renewed (new `workerModToken` saved to storage).

**Storage flag:** `gam_notice_token_age_75_dismissed`  
**Re-arm on next token:** set flag when new token is saved; clear flag simultaneously.

---

### N-02 — AI BUDGET AT 80% (amber warn)

**Trigger condition:** `aiBudgetUsedPct >= 80 && aiBudgetUsedPct < 100`  
Poll from cached AI-usage state (already tracked in settings as `aiUsageToday / aiDailyLimit`).

**Severity:** `warn`

**Headline:** `AI BUDGET 80% CONSUMED`

**Body:** `<used> of <limit> AI calls used today. Summarise actions manually after this threshold — AI assist will be unavailable until midnight UTC.`

**Action label:** `VIEW USAGE`

**Action handler:** Opens the stats panel section showing AI breakdown.

**Dismissal:** `persist_dismiss: false` (session-only — resets each new page load so the mod is re-notified after a browser restart if still >80%).

**Auto-clear condition:** `aiBudgetUsedPct` drops back below 80 (unlikely but handles quota resets).

---

### N-03 — WATCHED USER POSTS (amber warn -> pulse)

**Trigger condition:** A post or comment from a user on the mod's watch-list appears in the live feed. Currently the feed processes silently.

**Severity:** `warn`

**Headline:** `WATCHED USER ACTIVE — <USERNAME>`

**Body:** `<username> just posted in <community>. Tap to review.`

**Action label:** `REVIEW POST`

**Action handler:** Navigates directly to the new post (opens in same tab or modmail drawer).

**Dismissal:** `persist_dismiss: false`, `one_per_session: false`  
A new notice fires per watched-user event; each has a unique `id` (`watched_post_<postId>`). Old ones auto-teardown after 90s.

**Desktop notification escalation (stretch):** If document is not focused, also fire `new Notification('GAW Mod Tools', { body: '...' })` — see Section D.

**Implementation note:** The live feed already emits events when new posts arrive. Hook into that emitter and call `gamProactiveNotice` for any author in the watch-list.

---

### N-04 — MODMAIL FROM PRIOR-BANNED USER (alert)

**Trigger condition:** Modmail thread author's `userId` is present in the ban log. Check on modmail load / new-thread event.

**Severity:** `alert`

**Headline:** `MODMAIL — PRIOR-BAN HISTORY`

**Body:** `<username> was banned <N> days ago for <reason>. Review history before responding.`

**Action label:** `VIEW BAN LOG`

**Action handler:** Opens the user intel drawer to the ban history tab.

**Dismissal:** `persist_dismiss: true` per thread-id — once a mod acknowledges for thread T, banner doesn't re-fire for T. Fresh thread = fresh notice.

**Storage flag:** `gam_notice_modmail_banned_<threadId>_dismissed`

---

### N-05 — NEW MOD FIRST TOKEN USE (alert, lead-only)

**Trigger condition:** Lead's worker receives a `/mod/action` request from a `workerModToken` that has a `firstUse: true` flag (set by worker on first-ever authenticated call for that token). Worker returns `firstUse: true` in the response envelope — lead's extension receives this via background polling.

**Severity:** `alert`

**Headline:** `NEW MOD ONLINE — FIRST ACTION`

**Body:** `Rotation invite accepted by <mod_handle>. Verify identity and confirm permissions before they proceed.`

**Action label:** `REVIEW MOD PROFILE`

**Action handler:** Opens the team management section filtered to the new mod.

**Dismissal:** `persist_dismiss: true` per `modTokenId` — lead sees this once per new mod per rotation.

**Storage flag:** `gam_notice_firstuse_<modTokenId>_dismissed`

---

### N-06 — SCHEMA VERSION MISMATCH (alert)

**Trigger condition:** On extension load, compare `GAM_SCHEMA_VERSION` constant in modtools.js against the version stored in `chrome.storage.local` from the previous install. If they differ, a migration may be needed — or a stale cached value may cause silent bugs.

**Severity:** `alert`

**Headline:** `SCHEMA UPDATED — RELOAD REQUIRED`

**Body:** `Extension updated from schema v<old> to v<new>. Cached settings may be stale. Reload to apply migration.`

**Action label:** `RELOAD NOW`

**Action handler:**
```js
action_fn: () => { window.location.reload(); }
```

**Dismissal:** `persist_dismiss: false` — after reload the versions match and the condition no longer fires.

**Note:** This fires before `init()` completes — safe to call from the early-boot IIFE alongside the Brave-banner check.

---

### N-07 — CROSS-MOD BRIGADE SIGNAL (incident)

**Trigger condition:** Same `userId` reported in modmail by 2+ distinct mods within a 60-minute window. Detected by worker; surfaced in the modmail polling response via a `brigadeSignal: { userId, reportCount, windowMins }` field.

**Severity:** `incident`

**Headline:** `BRIGADE SIGNAL — <USERNAME> REPORTED BY <N> MODS`

**Body:** `Same user reported across <N> modmail threads in the last <M> minutes. Coordinate before actioning independently.`

**Action label:** `OPEN MODMAIL`

**Action handler:** Opens the modmail drawer filtered to threads containing this userId.

**Dismissal:** `persist_dismiss: true` per `brigadeSignalId` (a composite hash of userId + window start). Dismissed by any lead — worker broadcasts the dismiss to all connected mods.

**Storage flag:** `gam_notice_brigade_<brigadeSignalId>_dismissed`

---

### N-08 — DR RULE FIRED (warn)

**Trigger condition:** A Dangerous Reply rule matched and auto-actioned. Currently fires silently. Expose the existing DR-match event to surface a notice.

**Severity:** `warn`

**Headline:** `DR RULE FIRED — <RULE_NAME>`

**Body:** `Auto-action: <action_taken> on post by <username>. Review if override needed.`

**Action label:** `VIEW ACTION`

**Action handler:** Opens the audit log entry for this DR action.

**Dismissal:** `persist_dismiss: false`, `one_per_session: false`  
Unique `id` per action (`dr_fired_<actionId>`). Auto-teardowns after 60s — this is informational, not blocking.

---

### N-09 — WORKER DEGRADED (incident)

**Trigger condition:** Background error-rate tracker (already exists, watches fetch responses) detects >2% 5xx rate over a 5-minute sliding window.

**Severity:** `incident`

**Headline:** `WORKER DEGRADED — <PCT>% ERROR RATE`

**Body:** `AI assist and remote ban sync may be unreliable. Actions are queued locally. Check CF status.`

**Action label:** `CF STATUS`

**Action handler:** Opens `https://www.cloudflarestatus.com` in a new tab.

**Dismissal:** `persist_dismiss: false`  
Auto-clear condition: error rate drops back below 2% (background tracker emits a recovery event).

**Note:** This is the only notice that renders as a *persistent top-bar status indicator* rather than a one-shot. Do not write a dismiss flag — only auto-clear removes it.

---

### N-10 — SHIFT START AMBIENT (warn, soft)

**Trigger condition:** First page interaction after a 4+ hour idle gap (tracked via `lastActivityTs` in settings). Fire once per natural session start.

**Severity:** `warn`

**Headline:** `SHIFT STARTING`

**Body:** `<N> items in queue, <M> modmails waiting, <P> watched users active.`

**Action label:** `OPEN QUEUE`

**Action handler:** Opens the modmail / queue view.

**Dismissal:** `persist_dismiss: false`, `one_per_session: true`  
Auto-teardown after 12 seconds even without user interaction — this is ambient, not alarming.

**Implementation note:** Counts fetched from cached state already maintained by the extension. No extra API call needed at render time.

---

## C. SHIP-TONIGHT PATCH

Three notices + component. Ordered by mod impact.

### 1. Drop `gamProactiveNotice` into modtools.js

Place the function body immediately after the Brave-banner IIFE (around line 18374). Shared utility, no dependencies.

### 2. N-01 — Token Age Warning

Wire into the existing `_monitorTokenAge()` path (or the closest equivalent). On page load:

```js
(async () => {
  if (!await _shouldShowNotice('token_age_75')) return;
  const settings = await _getSettings();
  const issued = settings?.tokenIssuedAt;
  if (!issued) return;
  const daysOld = (Date.now() - issued) / 86_400_000;
  if (daysOld < 75) return;
  const daysLeft = Math.max(0, 90 - Math.floor(daysOld));
  gamProactiveNotice({
    id: 'token_age_75',
    severity: 'warn',
    headline: `TOKEN EXPIRY IN ${daysLeft} DAY${daysLeft !== 1 ? 'S' : ''}`,
    body: `Issued ${new Date(issued).toLocaleDateString()}. Re-claim before the 90-day hard cutoff.`,
    action_label: 'RE-CLAIM TOKEN',
    action_fn: () => chrome.runtime.sendMessage({ type: 'GAM_OPEN_POPUP', view: 'token-claim' }),
    persist_dismiss: true,
    auto_clear_condition: async () => {
      const s = await _getSettings();
      return s?.tokenIssuedAt > issued; // new token = newer timestamp
    }
  });
})();
```

### 3. N-02 — AI Budget Warning

Wire into the AI-usage check that already runs post-auth:

```js
(async () => {
  if (!await _shouldShowNotice('ai_budget_80')) return;
  const settings = await _getSettings();
  const used = settings?.aiUsageToday ?? 0;
  const limit = settings?.aiDailyLimit ?? 0;
  if (!limit || (used / limit) < 0.80) return;
  const pct = Math.round((used / limit) * 100);
  gamProactiveNotice({
    id: 'ai_budget_80',
    severity: 'warn',
    headline: `AI BUDGET ${pct}% CONSUMED`,
    body: `${used} of ${limit} AI calls used today. Manual summaries required after this point.`,
    action_label: 'VIEW USAGE',
    action_fn: (teardown) => { _openStatsPanel('ai-usage'); teardown(); },
    persist_dismiss: false,
    one_per_session: true
  });
})();
```

### 4. N-03 — Watched User Posts

Hook into the existing live-feed new-post event emitter. Wherever the feed calls its internal render for a new post, add:

```js
if (_watchList.has(post.author)) {
  const noticeId = `watched_post_${post.id}`;
  gamProactiveNotice({
    id: noticeId,
    severity: 'warn',
    headline: `WATCHED USER ACTIVE -- ${post.author.toUpperCase()}`,
    body: `Posted in ${post.community}. Review before it propagates.`,
    action_label: 'REVIEW POST',
    action_fn: (teardown) => { _navigateToPost(post.id); teardown(); },
    persist_dismiss: false
  });
  // Auto-teardown after 90s
  setTimeout(() => {
    try { document.getElementById(`gam-notice-${noticeId}`)?.remove(); } catch (_) {}
  }, 90_000);
}
```

---

## D. STRETCH — Browser Notification Escalation + Sound Chimes

### Browser notifications

For N-03 (watched user) and N-07 (brigade signal), escalate to a native OS notification when the document is not focused:

```js
async function _maybeDesktopNotify(headline, body) {
  if (document.hasFocus()) return; // in-page banner is sufficient
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if (Notification.permission !== 'granted') return;
  new Notification('GAW Mod Tools', { body: `${headline}: ${body}`, silent: false });
}
```

Request permission once at extension boot (after auth succeeds), not at notification time — mid-action permission prompts break flow.

### Sound chimes

Two tones, non-blocking, fire from the notice render path:

```js
function _gamChime(type) {
  // 'warn': single soft ping   'alert': two-tone urgent
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const freqs = type === 'alert' ? [880, 660] : [660];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f;
      o.type = 'sine';
      g.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.22 + 0.35);
      o.start(ctx.currentTime + i * 0.22);
      o.stop(ctx.currentTime + i * 0.22 + 0.36);
    });
  } catch (_) {} // AudioContext blocked in some browser states; silent fail is correct
}
```

Add `_gamChime('warn')` or `_gamChime('alert')` as the first line inside `gamProactiveNotice`, gated on severity:

```js
if (severity === 'alert' || severity === 'incident') _gamChime('alert');
else if (severity === 'warn') _gamChime('warn');
```

---

*Pattern library v1.0 — 2026-05-09. Derived from gam-brave-banner (v10.0). Ship-tonight candidates: N-01, N-02, N-03.*

# AF-18: Anti-Fragile Suite -- Rules 52-54
**GAW ModTools v10.5.1 | Audit date: 2026-05-09**

---

## Rule 52 -- Safe Mode (`gam_settings.safe_mode`)

### Proposal

Add a boolean flag to the settings schema:

```js
// chrome.storage.local key: gam_settings
// Default: false
gam_settings.safe_mode = false
```

This flag is read at content-script init (`modtools.js`, `runMigrations()` time) and at popup load. Both surfaces check it and skip initialization of risky subsystems before they boot. Not a runtime kill-switch applied mid-session -- a boot-time gate.

---

### What Safe Mode Disables

| Subsystem | Key / Flag | Rationale |
|---|---|---|
| Firehose (all 10 panels) | `gam_settings.firehose_enabled` (existing) | Highest DOM churn, highest API call volume. Mutation observers + polling are the most likely source of cascading failure under site load spikes. |
| AI calls (ban AI, modmail AI-assist, tard suggester) | `gam_settings.ai_assist_enabled` (existing) | Worker `/ai/` endpoints add per-call latency and can fail independently of the mod-action path. AI failure must never block a ban. |
| Presence ping (online-status ticker, squad-online badge) | `gam_settings.presence_enabled` (existing) | 30-second polling. Under degraded connectivity, the ping retry loop amplifies traffic. Lowest user impact when cut. |
| CSS animations (pulse on inbox, slide-in panels, press scale) | `gam_settings.animations_enabled` (existing) | Eliminates any chance of animation-loop jank contributing to UI freeze diagnoses. Also reduces paint cost on low-end machines. |
| Auto-DR tick (autoDeathRowTick) | `gam_settings.auto_dr_enabled` (existing) | Autonomous action under failure is dangerous. DR in safe mode is manual-only. |
| Firehose sticky live feed (`gam_fh_sticky_feed`) | covered by firehose flag | Separate mention: this is the highest-frequency DOM writer in the codebase (new-post insertion). First thing to cut. |

**The cut list is additive** -- safe mode sets all of the above to disabled regardless of their individual flag values. Individual flags remain stored; they restore when safe mode is toggled off.

---

### What Safe Mode Keeps (Minimum Feature Set)

| Feature | Rationale |
|---|---|
| Token entry and validation (popup Auth section) | Mods must always be able to re-authenticate. |
| Ban hammer (manual send chain, no AI, no DR auto-fire) | Core moderation action must survive any failure mode. |
| Modmail send (compose + send, no AI-assist) | Responding to reports cannot be gated on feature health. |
| Status bar (static -- shows token state, no live ticker) | Mods need to know they are authenticated. The ticker (presence-dependent) is replaced with a static "[Safe Mode]" badge. |
| Mod log read (past actions, no AI audit) | Read-only history access. No write paths, no AI enrichment. |
| Settings panel (to toggle safe mode off again) | Self-evident -- safe mode must be escapable. |

---

### Popup Affordance

Location: **Maintenance section** (the existing 4x4 grid of maintenance controls).

A new row is added at the top of the Maintenance grid, spanning full width:

```
[ Safe Mode ]  OFF/ON toggle (amber when active)
"Disables firehose, AI, animations, presence ping, auto-DR.
 Keeps: token entry, ban hammer, modmail send, mod log."
```

Toggle behavior:
1. User flips toggle -> `setSetting('safe_mode', true/false)` -> `chrome.storage.local`.
2. A snack fires: "Safe mode enabled -- reload the GAW tab to apply."
3. On next content-script load, the gate fires before any subsystem init.

**No auto-reload is triggered** -- the mod controls when to apply it. This avoids surprise reload-mid-action.

Implementation surface: `popup.js` settings handler + `modtools.js` init gate at the top of `_bootGawTools()` (or equivalent init entry point).

---

## Rule 53 -- Fallback UI on Critical Failure

### Problem

When a subsystem throws at init or during runtime, the current behavior is uneven: some subsystems silently fail, others break adjacent features by corrupting shared DOM or shared state. The modmail panel error taking down the status bar is the canonical example of this class of failure.

### 5 Surfaces Where Failure Must Not Propagate

**Surface 1: Modmail panel**

- Current risk: The modmail panel is mounted into a DOM element shared with the status bar's right-side container. A throw during panel mount (e.g., malformed thread data, API 500) can crash the entire right-side DOM insertion and remove the status bar.
- Boundary: Wrap `_mountModmailPanel()` in a top-level try/catch. On catch, insert a minimal fallback element: `<div id="gam-modmail-fallback" class="gam-status-chip gam-error">Modmail unavailable -- reload to retry</div>`. The status bar render path must not go through the same mount call.

**Surface 2: Firehose panels (all 10)**

- Current risk: Each firehose panel registers a MutationObserver. If the DOM target disappears (GAW layout change) or the observer callback throws, the unhandled rejection can freeze all subsequent observer callbacks in the same microtask queue.
- Boundary: Each observer callback is already a closure. Wrap the body of every firehose observer callback in try/catch. On catch: disconnect the observer, increment the panel's error counter (see Rule 54 below), emit a `gam-panel-error` custom event. A single subscriber on `document` catches these events and renders a red "Firehose panel unavailable" chip in the panel's placeholder.

**Surface 3: AI suggestion calls (ban + modmail)**

- Current risk: An unhandled rejection from the AI worker endpoint (429, 503, network drop) propagates up through the ban-modal flow and can freeze the entire modal if the calling code awaits without a catch.
- Boundary: All calls to `_rpcWorkerCall` with `name` matching `/^ai/` get a dedicated catch in the UI layer that replaces the AI output zone with a static "AI unavailable -- choose a macro manually" message. The ban send chain continues normally. No modal freeze.

**Surface 4: User-info hover card (`__userInfoHover`)**

- Current risk: The hover card fetches user history from D1. If D1 is unavailable or the RPC times out, the card mount either hangs (spinner forever) or throws and leaves a partially-rendered popover in the DOM, which then blocks click events on posts beneath it.
- Boundary: `__userInfoHover` already has partial try/catch coverage (per AF-05 audit). Add a 5-second AbortController timeout on the D1 fetch. On abort/error: render the card with static fields only (username, avatar) and a "History unavailable" label. Dismiss the card normally on mouseout.

**Surface 5: Mod Audit View (V10_V11/04 feature)**

- Current risk: The audit view queries the mod_log table. A query error or malformed row can throw inside the table-render loop, producing a blank audit tab with no error message. Mods assume no audit history exists.
- Boundary: Wrap the table-render loop in try/catch per-row. On row-level error: render a `<tr class="gam-row-error">` with "Row render failed -- raw: [JSON.stringify(row)]" in the first cell. The rest of the table continues. On query-level error: render the audit tab with a full-width "Audit data unavailable (D1 error)" panel and a Retry button.

---

### Implementation Pattern (canonical for all 5 surfaces)

```js
// Surface-level boundary -- wraps the entire subsystem mount
try {
  await _mountSubsystem();
} catch (err) {
  _incrementErrorCounter('subsystem_name');      // Rule 54
  _renderFallbackChip('subsystem_name', err);    // Rule 53
  console.warn('[ModTools AF-53] subsystem_name fell back:', err);
}

function _renderFallbackChip(name, err) {
  const el = document.getElementById('gam-' + name + '-root');
  if (!el) return;
  el.innerHTML =
    '<div class="gam-fallback-chip gam-error">' +
    name + ' unavailable -- ' + (err && err.message || 'unknown error') +
    ' <button class="gam-btn-ghost" onclick="location.reload()">Reload</button>' +
    '</div>';
}
```

The status bar is never a child of any feature mount point. It has its own dedicated DOM insertion in the page's fixed-position layer. This architectural separation must be enforced by code review: no feature mount may `appendChild` into `#gam-status-bar-root` or any ancestor of it.

---

## Rule 54 -- Auto-Disable on Repeated Crash (3 in 5 minutes)

### Proposal: Per-Feature Error Counter

A new key in `chrome.storage.local`:

```js
// Key: gam_error_counters
// Shape:
{
  "firehose_activity_timeline": { count: 0, window_start: 0, disabled_at: 0 },
  "firehose_brigade_detector":  { count: 0, window_start: 0, disabled_at: 0 },
  "ai_ban_assist":              { count: 0, window_start: 0, disabled_at: 0 },
  "ai_modmail_assist":          { count: 0, window_start: 0, disabled_at: 0 },
  "modmail_panel":              { count: 0, window_start: 0, disabled_at: 0 },
  "presence_ping":              { count: 0, window_start: 0, disabled_at: 0 },
  "user_info_hover":            { count: 0, window_start: 0, disabled_at: 0 },
  "mod_audit_view":             { count: 0, window_start: 0, disabled_at: 0 }
}
```

`disabled_at: 0` means active. `disabled_at: <timestamp>` means auto-disabled.

---

### Counter Logic (`_incrementErrorCounter`)

```js
const ERROR_WINDOW_MS = 5 * 60 * 1000;   // 5 minutes
const ERROR_THRESHOLD = 3;

async function _incrementErrorCounter(featureName) {
  const store = await chrome.storage.local.get('gam_error_counters');
  const counters = store.gam_error_counters || {};
  const now = Date.now();
  const rec = counters[featureName] || { count: 0, window_start: now, disabled_at: 0 };

  // Already disabled -- skip (avoids double-counting)
  if (rec.disabled_at) return;

  // Window expired -- reset
  if (now - rec.window_start > ERROR_WINDOW_MS) {
    rec.count = 0;
    rec.window_start = now;
  }

  rec.count += 1;

  if (rec.count >= ERROR_THRESHOLD) {
    rec.disabled_at = now;
    counters[featureName] = rec;
    await chrome.storage.local.set({ gam_error_counters: counters });
    _onFeatureAutoDisabled(featureName, now);
    return;
  }

  counters[featureName] = rec;
  await chrome.storage.local.set({ gam_error_counters: counters });
}
```

---

### Auto-Disable Callback (`_onFeatureAutoDisabled`)

```js
function _onFeatureAutoDisabled(featureName, ts) {
  // 1. Render red disabled chip in the feature's placeholder
  _renderDisabledChip(featureName, ts);

  // 2. Log to diag (same sink as Rule 14 health alarm)
  _maintAppendDiag('auto_disable', featureName, {
    ts: ts,
    reason: 'crashed_3x_in_5min'
  }).catch(() => {});

  // 3. Emit custom event so any interested listener can react
  document.dispatchEvent(new CustomEvent('gam-feature-auto-disabled', {
    detail: { feature: featureName, ts: ts }
  }));
}
```

---

### Disabled Chip UI

When a feature is auto-disabled, its mount point renders:

```
[ -- firehose: activity timeline -- ]
[X] Disabled: crashed 3x in 5 min  [ Re-enable ]
    Last error: 14:32:07
```

The chip is styled with `gam-error` (red border, red left accent -- same token as auth-fail banner). The "Re-enable" button:

1. Calls `_clearErrorCounter(featureName)` -- sets `disabled_at: 0`, resets count/window.
2. Attempts to re-mount the feature.
3. If the re-mount throws immediately, the counter restarts from 1 (not 0) -- one free retry, then the 3-strike window applies again from that moment.

---

### Boot-Time Gate

At content-script init, before any feature mounts:

```js
const counters = (await chrome.storage.local.get('gam_error_counters')).gam_error_counters || {};
for (const [feature, rec] of Object.entries(counters)) {
  if (rec.disabled_at) {
    console.info('[ModTools AF-54] ' + feature + ' is auto-disabled (crashed 3x). Skipping mount.');
    _renderDisabledChip(feature, rec.disabled_at);
  }
}
```

This ensures a browser restart does not silently resurrect a feature that was auto-disabled. The mod must explicitly re-enable it.

---

### Popup Integration (Maintenance section)

Below the Safe Mode toggle, a new "Feature Health" row lists any currently auto-disabled features:

```
Feature Health:
  [X] firehose: activity timeline  [ Re-enable ]  disabled 14:32
  [X] ai: ban assist                [ Re-enable ]  disabled 14:35
```

If no features are auto-disabled, the row shows: `All features healthy`.

The popup reads `gam_error_counters` on open and renders the list. Re-enable buttons send a message to the content script to call `_clearErrorCounter` + attempt re-mount.

---

## Implementation File Map

| File | Change |
|---|---|
| `modtools.js` | `_incrementErrorCounter()`, `_onFeatureAutoDisabled()`, `_renderFallbackChip()`, `_renderDisabledChip()`, `_clearErrorCounter()`, boot-time gate loop, try/catch boundaries on 5 surfaces |
| `background.js` | No change required for core logic; `_maintAppendDiag` already exists |
| `popup.js` | Safe Mode toggle in Maintenance section; Feature Health row; `gam_error_counters` read on popup open; Re-enable message dispatch |
| `popup.html` | Safe Mode toggle row markup; Feature Health list placeholder |
| `chrome.storage.local schema` | New key `gam_error_counters`; new field `gam_settings.safe_mode` (default false) |

---

## Summary

| Rule | Status | Deliverable |
|---|---|---|
| 52 -- Safe Mode flag | Not yet implemented | `gam_settings.safe_mode` boot gate; popup toggle in Maintenance; 6 subsystems cut; 6 features preserved |
| 53 -- Fallback UI | Partial (some subsystems have try/catch; none have structured fallback chips or DOM isolation guarantee) | 5 named surfaces with try/catch + `_renderFallbackChip`; status bar DOM isolation requirement |
| 54 -- Auto-disable on 3x crash | Not yet implemented | `gam_error_counters` schema; `_incrementErrorCounter` with 5-min sliding window; disabled chip + Re-enable; boot-time gate; popup Feature Health row |

**No production edits made.** All proposals above are design-level. Implementation session required.

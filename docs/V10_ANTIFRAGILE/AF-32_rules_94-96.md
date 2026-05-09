# AF-32: Anti-Fragile Suite -- Rules 94, 95, 96

**Target files:** popup.html, popup.js, modtools.js, background.js
**Worker:** out of scope
**Version:** 10.5.1 (audit-only -- no code changes in this document)
**Author:** AF-32 agent, 2026-05-09

---

## Scope

- **Rule 94** -- Include a full Diagnostics page in options
- **Rule 95** -- Make every feature discoverable even after partial failure
- **Rule 96** -- Support keyboard shortcuts that still work in degraded mode

---

## Rule 94 -- Diagnostics Page

### Current state

The popup currently exposes diagnostic data across three scattered surfaces:

1. **Tools card** -- two buttons: "Debug snapshot" (`#debugBtn`) and "Dashboard" (`#dashBtn`).
2. **Maintenance card -- System diagnostics (advanced)** accordion -- Storage health probe, Selector drift report, Diag log status + purge, Schema migration check.
3. **Maintenance (lead) accordion** -- Audit chain verify, Full health report, Roster staleness audit, Migration debt scanner.

The backing data that already exists in `chrome.storage.local`:
- `gam_sw_boots` -- ring buffer of last 50 SW wakes (written by `_recordSwBoot()`, AF-04/Rule 11). Contains `{ v, ts, reason }` per entry.
- `gam_diag_log` -- up to 500 entries of `{ ts, iso, cat, msg, stack, v }` written by the global `unhandledrejection` and `error` handlers, plus every maintenance routine.
- `gam_maint_warning` -- quota / token-age flags set by alarm handlers.
- `gam_settings` -- contains `workerModToken` age-derivable fields.
- `gam_schema_version` -- schema migration state.

What is **absent** from any single reachable surface:
- SW boot count + time since last boot in one glance
- Alarm fire log (none written; alarms fire silently)
- KV write count (not tracked; no counter exists)
- Last 50 RPC errors as a searchable list (they land in `gam_diag_log` but filtered by `cat` only in the full debug snapshot)
- Browser version + extension version in a single readable tile
- Permission grant list

### Proposed: Diagnostics tab

Add a fifth popup nav tab labeled **Diag** (or replace the existing generic "Tools" tab, which only holds the debug snapshot and dashboard buttons). The Diagnostics tab is a single `data-tab="diag"` section containing one card with four collapsible sub-sections:

**Section 1 -- System identity** (always open, no button needed -- reads synchronously from `chrome.runtime.getManifest()` and `navigator.userAgent`):

| Field | Source |
|---|---|
| Extension version | `chrome.runtime.getManifest().version` |
| Browser + version | `navigator.userAgent` (parse Chrome/N) |
| Install ID | `chrome.runtime.id` (stable per install) |
| Permissions granted | `chrome.permissions.getAll()` -- list `permissions[]` + `origins[]` |

**Section 2 -- Service Worker health** (reads `gam_sw_boots` on open):
- Boot count (length of `gam_sw_boots` array -- actual count since storage was last cleared, max 50)
- Last boot timestamp + reason (`boots[boots.length-1].ts` and `.reason`)
- Last boot age in human-readable form ("3 minutes ago")
- A mini-table of the 5 most recent boots (ts, reason) for spotting thrash loops
- Alarm schedule: call `chrome.alarms.getAll()` and list active alarm names + next-fire ETA

**Section 3 -- RPC error log** (reads `gam_diag_log` filtered to RPC/network cats):
- Last 50 entries where `cat` is `unhandledrejection`, `uncaught-error`, `rpc-error`, or `net-error`
- Each row: relative timestamp, category badge, message (truncated to 120 chars), expandable stack
- "Export errors" button: copies filtered entries as JSON to clipboard
- Empty state: green "No RPC errors in log" chip

**Section 4 -- Storage + audit** (existing routines surfaced here instead of buried in the advanced accordion):
- Inline Storage health probe result (auto-runs when tab opens, no button click required -- this is the eliminate-the-meatbag move)
- Token health: age color-coded per existing thresholds (green/yellow/red)
- KV write count: **not currently tracked** -- propose adding a `gam_kv_write_count` integer key, incremented on every `chrome.storage.local.set()` call in the hot path (ban, note, roster write). Display here. v10.6 work item.
- Audit chain status: last verified ts + next boundary (calls `maintAuditVerify` inline)
- Schema version: current vs. code-side constant

The existing "Debug snapshot" button moves into this tab and becomes "Copy full snapshot to clipboard" -- same handler, better placement. The existing "Full health report" (lead-only) stays in the Lead card but also copies its summary here.

**Implementation notes:**
- The Diag tab only needs a new `data-tab="diag"` section in popup.html and a `renderDiagTab()` function in popup.js that runs `chrome.storage.local.get(['gam_sw_boots','gam_diag_log','gam_settings','gam_schema_version'])` and `chrome.alarms.getAll()` in parallel.
- No new storage keys except the proposed `gam_kv_write_count` (deferred).
- Lead-only sections (audit chain, roster staleness) stay gated by `__applyLeadGate` exactly as today.
- The tab auto-refreshes on `chrome.storage.onChanged` for `gam_diag_log` and `gam_sw_boots` so a freshly-fired alarm makes the table update without a popup reopen.

---

## Rule 95 -- Discoverability After Partial Failure

### Five features that hide their fallback path

**1. AI ban-suggestion fails -- manual ban path is invisible**

When the AI ban-suggest button (`#maintTardSuggest`) errors or times out, the status div shows a red error string. There is no follow-on text pointing to the manual ban path. A mod who has never banned manually will stall. The manual path is `/ban` on GAW -- but nothing in the popup says so. Worse: if the Llama circuit breaker is open, every AI call silently degrades with no indication the mod should switch to manual review.

Proposed fix: error state of every AI button must include a one-line recovery hint: "AI unavailable -- use [Ban Manager] to ban manually or review /users directly." Wire the hint text to the existing `maintTardSuggestStatus` div; it already renders HTML.

**2. Firehose dead -- queue-based fallback has no status indicator**

The content script switches to `FallbackMode` when the session is unhealthy or the mod explicitly toggles it. When `FallbackMode = true`, the GAW native queue at `/queue` still works -- but mods have no visible indication that the queue path is their active fallback and that queue actions will not sync to the shared KV. The Maintenance chip (`#maintWarningChip`) fires on storage quota and token age, but not on firehose/session failure. A mod in fallback mode has no persistent reminder they are operating degraded.

Proposed fix: when `FallbackMode` is true, the maintenance warning chip should display a distinct amber "NATIVE MODE" label (not just the wrench icon) and the chip tooltip should read "ModTools interception is OFF -- actions taken in native GAW UI will not sync to shared roster. Open popup to re-enable." The chip click already opens Maintenance; no routing change needed.

**3. SW dead -- popup token save fails silently**

If the service worker is in the process of spinning up (i.e., the first message after a cold eviction), `chrome.runtime.sendMessage` from popup.js to background.js may time out. The token-save path currently catches the rejection and shows a generic "save failed" message in `#tokenStatus`. There is no indication to the mod that they should wait 2-3 seconds and retry, vs. that the token is permanently broken.

Proposed fix: the catch block in the token-save handler should distinguish `chrome.runtime.lastError` with message "Could not establish connection" or similar from a worker-side rejection, and render: "Service worker is starting -- wait 3s and try again. If this persists, reload the extension."

**4. Crawl completes -- data not available hint missing**

When a crawl finishes (`crawlStatus` div updates), there is no follow-on affordance pointing to where the crawled data appears. A first-time mod does not know that crawled users land in the pending/roster counts on the Stats tab or that they can be searched in the Mod Console. The crawl button is in the Tools card; the output is on the Stats tab. Zero visual connection.

Proposed fix: crawl success message appends "-- users now visible in Stats > Pending and searchable in Mod Console (Ctrl+Shift+M)." This is a string change in the crawl completion handler in popup.js, not an architectural change.

**5. Token expired -- rotate path hidden under lead accordion**

If the token health probe returns red (>90d), the `#maintTokenStatus` div shows the age and color but does not surface a "Rotate your token" action link. The rotate button exists in the Tokens card (`#rotateBtn`) but the Tokens card is collapsed by default after successful auth (`_cardAutoCollapseTokens`). A mod seeing a red token health result has to discover the rotate path themselves.

Proposed fix: when token health probe returns age > 90d, inject an action link into the status div: "Token expired -- click here to rotate." The click handler calls `_cardAuthFailed()` (which re-opens and highlights the Tokens card) and scrolls to `#rotateBtn`. This is 4 lines of popup.js and zero new storage.

---

## Rule 96 -- Keyboard Shortcuts

### Current state

No `commands` key exists in `manifest.json`. No `chrome.commands` API is used anywhere in background.js or popup.js. The content script (`modtools.js`) has two keydown listeners:

1. `Ctrl+Z` undo handler on the compose/textarea path (line ~4638) -- strips Shift/Alt combinations explicitly.
2. Modal `keydown` handlers for Enter/Escape inside the confirm-modal and ban-modal dialogs -- these are scoped to the modal backdrop element, not the document.

The shortcuts specified in the audit brief (Ctrl+Shift+B, Ctrl+Shift+M, Ctrl+Shift+W, Ctrl+Shift+T, Ctrl+K) are **not implemented anywhere**. They are proposed, not existing.

### Degraded-mode viability analysis

Chrome extension keyboard shortcuts registered via `manifest.json` `"commands"` are dispatched by the browser to the background service worker via `chrome.commands.onCommand`. They do not require the content script or the SW to be in a healthy state for the key event to be captured -- Chrome handles the registration. The SW handler then dispatches a message to the active tab's content script.

| Shortcut | Proposed action | SW-dead viable? | Analysis |
|---|---|---|---|
| Ctrl+Shift+B | Open ban modal for focused user | Partial | Requires content script alive. SW dead: can open `/ban` as fallback URL via `chrome.tabs.create`. |
| Ctrl+Shift+M | Open Mod Console | Partial | Requires content script. SW dead: navigate to `/mod/console` as fallback. |
| Ctrl+Shift+W | Open watchlist | Partial | Requires content script + storage. SW dead: `chrome.tabs.create({url:'https://greatawakening.win/users?filter=watch'})` as fallback. |
| Ctrl+Shift+T | Open Hot Now / trending | Partial | Requires content script. SW dead: `chrome.tabs.create({url:'https://greatawakening.win/'})` as fallback -- no equivalent native page. |
| Ctrl+K | Search | Partial | Requires content script focus-and-inject. SW dead: navigate to `/search`. |

All five shortcuts survive the SW being evicted if the `onCommand` handler in background.js is written with a try/tab-create fallback: attempt the RPC to the content script first; if `chrome.runtime.lastError` fires, open the corresponding GAW native URL in a new tab.

### Proposed: Ctrl+Shift+/ help overlay

A help overlay triggered by Ctrl+Shift+/ (or `?` on a non-input element, consistent with most web apps) should render a full-screen overlay on the GAW page listing all active shortcuts. Implementation in modtools.js as a `keydown` listener on document:

- Condition: `e.ctrlKey && e.shiftKey && e.key === '/'` (or `e.key === '?'` when `document.activeElement` is not an input/textarea)
- Overlay: fixed-position dark panel, z-index above all gam strips, lists shortcut + description + current state (enabled/disabled based on `FallbackMode`)
- FallbackMode awareness: shortcuts that require the content script show a "degraded -- native fallback active" badge when `FallbackMode` is true, so mods know what they're getting
- Close: Escape, click outside, or second Ctrl+Shift+/

The overlay must work when `FallbackMode` is true -- it is a read-only display of a static data structure, no RPC needed.

### manifest.json addition required

```json
"commands": {
  "ban-user": {
    "suggested_key": { "default": "Ctrl+Shift+B" },
    "description": "Open ban modal for focused user"
  },
  "open-console": {
    "suggested_key": { "default": "Ctrl+Shift+M" },
    "description": "Open Mod Console"
  },
  "open-watchlist": {
    "suggested_key": { "default": "Ctrl+Shift+W" },
    "description": "Open watchlist"
  },
  "open-hot-now": {
    "suggested_key": { "default": "Ctrl+Shift+T" },
    "description": "Open Hot Now"
  },
  "search": {
    "suggested_key": { "default": "Ctrl+K" },
    "description": "Focus search"
  },
  "shortcut-help": {
    "suggested_key": { "default": "Ctrl+Shift+Slash" },
    "description": "Show keyboard shortcut help"
  }
}
```

Note: Chrome limits extensions to 4 `commands` with `suggested_key`. The remaining must be user-configured via `chrome://extensions/shortcuts`. Propose shipping Ctrl+Shift+B, Ctrl+Shift+M, Ctrl+Shift+/, and Ctrl+K as the four suggested keys. Ctrl+Shift+W and Ctrl+Shift+T are user-assignable with guidance in the Diag tab.

---

## Summary of findings

| Rule | Status | Gap | Effort |
|---|---|---|---|
| 94 -- Diagnostics page | Partial | Data exists; scattered across 3 locations. No unified tab. No alarm-fire log. No KV write count. | Medium -- new tab wire-up + `renderDiagTab()` function |
| 95 -- Discoverability | Partial | 5 features identified with hidden fallback paths. All fixable with string/handler additions, no new storage. | Low -- string + 1-4 lines per fix |
| 96 -- Keyboard shortcuts | Not implemented | Zero `commands` in manifest. Zero `chrome.commands` usage. All 5 shortcuts are unbuilt. Help overlay unbuilt. | High -- manifest + background handler + modtools overlay |

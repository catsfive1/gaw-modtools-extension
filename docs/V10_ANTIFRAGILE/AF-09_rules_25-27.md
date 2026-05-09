# AF-09: Anti-Fragile Suite -- Rules 25-27
**GAW ModTools v10.5.1 | Audit date: 2026-05-09**

---

## Rule 25 -- Automatic Storage Quota Purge

**Requirement:** If `getBytesInUse > 0.8 * QUOTA_BYTES`, automatically purge `gam_diag_log` oldest 50% and `gam_intel_cache` (actual key: `gam_profile_intel`) LRU 50%. Log the purge event.

### Current State

Background.js already probes quota every 6 hours via `_maintQuotaCheck()`. At 80% it calls `_maintSetWarning()` -- which writes a `gam_maint_warning` flag and a console.warn. That is all it does. No purge fires automatically.

The trim logic exists but is popup-only: `maintStorageTrim()` in popup.js (line 3806) is wired to a "Trim now" button that renders after `maintStorageProbe()` runs. Click-only. Background.js `_maintQuotaCheck()` has no purge path at all.

Note on `gam_modmail_drafts`: this key lives in `chrome.storage.session`, not `chrome.storage.local`. Session storage is not counted in `getBytesInUse(null, ...)` against the local quota and is automatically evicted when the service worker terminates. It is not a target for Rule 25.

### Gap

`_maintQuotaCheck()` in background.js detects the 80% threshold but stops at warning. The auto-purge tier is missing.

### Patch Required -- background.js: `_maintQuotaCheck()`

The existing function (lines 368-390) sets a warning at `>= MAINT_QUOTA_THRESHOLD_PCT` (80%). Add an auto-purge branch that fires when the threshold is breached. The purge mirrors what `maintStorageTrim()` does in popup.js but runs autonomously.

```js
// v10.5.1 AF-09 Rule 25: auto-purge when quota > 80%
async function _maintQuotaPurge() {
  let evicted = 0;
  const log = [];

  // Purge gam_diag_log: drop oldest 50%
  try {
    const r = await chrome.storage.local.get(MAINT_DIAG_KEY);
    const entries = r[MAINT_DIAG_KEY] || [];
    if (entries.length > 0) {
      const dropCount = Math.floor(entries.length / 2);
      const kept = entries.slice(dropCount);
      await chrome.storage.local.set({ [MAINT_DIAG_KEY]: kept });
      evicted += dropCount;
      log.push('diag_log: dropped ' + dropCount + ', kept ' + kept.length);
    }
  } catch (e) {
    log.push('diag_log purge failed: ' + String(e && e.message || e));
  }

  // Purge gam_profile_intel: evict LRU 50% (sort by .ts ascending, drop bottom half)
  try {
    const r = await chrome.storage.local.get(MAINT_INTEL_KEY);
    const intel = r[MAINT_INTEL_KEY] || {};
    const entries = Object.entries(intel);
    if (entries.length > 0) {
      entries.sort((a, b) => (a[1] && a[1].ts || 0) - (b[1] && b[1].ts || 0));
      const dropCount = Math.floor(entries.length / 2);
      const kept = Object.fromEntries(entries.slice(dropCount));
      await chrome.storage.local.set({ [MAINT_INTEL_KEY]: kept });
      evicted += dropCount;
      log.push('profile_intel: dropped ' + dropCount + ', kept ' + entries.length - dropCount);
    }
  } catch (e) {
    log.push('profile_intel purge failed: ' + String(e && e.message || e));
  }

  // Log the purge event to gam_diag_log
  try {
    const purgeEntry = {
      ts: new Date().toISOString(),
      cat: 'maint.quotaPurge',
      msg: 'auto-purge: evicted ' + evicted + ' entries',
      extra: { evicted: evicted, detail: log }
    };
    const r2 = await chrome.storage.local.get(MAINT_DIAG_KEY);
    const existing = r2[MAINT_DIAG_KEY] || [];
    existing.push(purgeEntry);
    if (existing.length > MAINT_DIAG_MAX) existing.splice(0, existing.length - MAINT_DIAG_MAX);
    await chrome.storage.local.set({ [MAINT_DIAG_KEY]: existing });
  } catch (_) {}

  console.log('[ModTools AF-09] quota auto-purge complete. Evicted:', evicted, log);
  return evicted;
}
```

Within `_maintQuotaCheck()`, replace the current warning-only branch with:

```js
// Existing code:
if (pct >= MAINT_QUOTA_THRESHOLD_PCT) {
  await _maintSetWarning({ ... });
  // ADD: auto-purge when over threshold
  await _maintQuotaPurge();
}
```

The purge runs every time the 6-hour alarm fires and the 80% threshold is still breached. It is idempotent and non-destructive (only removes the oldest half of log/intel, never tokens or settings).

### Severity note

The existing `_maintSetWarning` escalates to severity `'danger'` at 95%. The purge fires at 80%. At 95% the purge may not recover enough headroom if both caches are enormous -- in that case the warning chip in the popup remains visible and the mod should run the manual trim. This is correct behavior; the auto-purge is a pressure-relief valve, not a substitute for the manual routine.

---

## Rule 26 -- No UI Blocking While Waiting for Storage

**Requirement:** Scan popup.js for awaited storage calls before first paint. Loading states must be visible (skeleton, "Loading..." snack, etc.) where missing.

### Audit Methodology

Grepped popup.js for the first top-level `await chrome.storage` call and the first DOM mutation that renders user-visible data. Traced the call order from script execution start.

### Findings

#### Path 1: `initCards()` -- IIFE, lines 62-65

```js
(async function initCards() {
  await _cardRestoreAll();   // awaits chrome.storage.local.get(keys)
  ['tokens', 'maint', 'tools', 'macros', 'lead'].forEach(_cardWireToggle);
})();
```

This runs synchronously at script parse time. The await delays `_cardWireToggle` registration by the duration of one storage read. During this window, the `<details>` cards render in their HTML-default state (all open) and the toggle listeners are not yet wired. If the popup renders before `_cardRestoreAll` resolves, the user sees the correct visual state (HTML default) and the listeners attach within ~1-5ms (one local storage read). This is acceptable -- the visual state is correct, the listener gap is imperceptible.

**Verdict: OK. No loading state needed here.**

#### Path 2: `loadStats()` -- called at bottom of popup.js, NO loading state

`loadStats()` reads `K.LOG`, `K.ROSTER`, `K.DR` and writes into stat DOM elements (`s-pending`, `s-dr`, `s-banned`, `s-today`, `s-msgs`, `s-notes`). During the await, those elements contain their HTML default content -- typically empty or `0` from the HTML template.

Checked popup.js around line 377 and the invocation site. The call is bare:

```js
loadStats();  // fire-and-forget, no await, no loading indicator
```

The stat cells start empty and snap to values when the storage read resolves. On a warm Chrome session with a populated storage this is sub-millisecond and unnoticeable. However, on a cold extension install or after `chrome.storage.local` is cleared, the snap can be visible -- cells show blank, then flash to `0`.

**Verdict: Minor gap. Not a blank-panel block (the panel is not hidden during load), but the cells flash from blank to zero without a loading hint.**

**Fix:** Set an explicit `--` placeholder in each stat cell before `loadStats()` runs, and clear it on completion. This costs zero storage I/O and eliminates the blank-to-zero flash.

```js
// Before loadStats() call (at the bottom of popup.js startup block):
['s-pending', 's-dr', 's-banned', 's-today', 's-msgs', 's-notes'].forEach(function(id) {
  const el = document.getElementById(id);
  if (el && !el.textContent.trim()) el.textContent = '--';
});
loadStats(); // already fire-and-forget; loadStats itself writes the real values
```

This is the minimum fix. No skeleton, no spinner, no snack needed -- the `--` placeholder communicates "data incoming" without visual weight.

#### Path 3: `__noticeTokenAge()` and `__noticeAiBudget()` -- lines 289-338

Both are async IIFEs that read `gam_settings` before deciding whether to render a notice banner. Neither blocks the visible UI -- the banner only appears if a condition is met, and during the await nothing is shown. This is correct behavior for a conditional notice.

**Verdict: OK.**

#### Path 4: `__hardeningOnPopup()` -- line 594

Awaited inline at definition but only called from within event handlers (button clicks). Does not block first paint.

**Verdict: OK.**

#### Path 5: `loadToken()` / `loadLeadToken()` -- lines 821, 985

Both called from event handlers or wizard steps, not at first paint. Both have try/catch.

**Verdict: OK.**

### Summary of Rule 26

| Path | Block? | Fix needed? |
|------|--------|-------------|
| `initCards()` / `_cardRestoreAll` | No -- HTML default state shown; listener gap imperceptible | No |
| `loadStats()` cell flash | Cosmetic -- cells briefly blank | Yes -- `--` placeholder before call |
| Notice IIFEs | No -- conditional render | No |
| `__hardeningOnPopup` | No -- event-handler only | No |
| Token load functions | No -- event-handler only | No |

The only actionable gap is the stat-cell blank flash. The fix is a 6-line placeholder injection before the `loadStats()` call site.

---

## Rule 27 -- Cache Invalidation on Version Update

**Requirement:** On `chrome.runtime.onInstalled` with `reason='update'`: invalidate `gam_modmail_drafts` and `gam_intel_cache` (`gam_profile_intel`) by purging those keys. Add this hook if missing.

### Current State of `onInstalled`

The existing handler (background.js lines 173-193) does:

1. Calls `_recordSwBoot(details.reason)` (AF-04 Rule 11 -- SW boot ring buffer)
2. Creates/recreates all alarms unconditionally
3. Calls `__ensureSessionAccess()`
4. Calls `loadSecrets()`

It does NOT check `details.reason === 'update'` for any cache invalidation. No version-specific purge exists.

### Cache Analysis

**`gam_modmail_drafts`** -- lives in `chrome.storage.session`. Session storage is automatically cleared when the service worker is terminated, which happens on every Chrome restart and frequently during normal use. A version update triggers SW reload, which terminates the current SW instance -- the session storage is cleared automatically as a side effect. No explicit purge is needed; the platform handles it.

**`gam_profile_intel`** (`gam_profile_intel`) -- lives in `chrome.storage.local`. Persists across SW restarts, Chrome restarts, and extension updates. This IS the cache that needs explicit invalidation on update. Without it, a stale intel cache built under the old schema or AI-model version survives the update and is served to the new code without revalidation.

**`gam_intel_cache`** -- this key name does not exist in the codebase. The task spec uses this label; the actual storage key is `gam_profile_intel` (aliased as `MAINT_INTEL_KEY` in background.js and `K.INTEL` in popup.js). Purging `gam_profile_intel` satisfies the requirement.

### Patch Required -- background.js: `onInstalled` handler

Add an `update`-reason branch immediately after `_recordSwBoot`:

```js
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[ModTools] Installed:', details.reason);
  await _recordSwBoot(details.reason || 'install');

  // v10.5.1 AF-09 Rule 27: on version update, invalidate stale caches.
  // gam_modmail_drafts (session) is auto-cleared by SW termination on update.
  // gam_profile_intel (local) must be purged explicitly -- it persists across updates.
  if (details.reason === 'update') {
    try {
      await chrome.storage.local.remove(MAINT_INTEL_KEY);
      console.log('[ModTools AF-09] update: purged gam_profile_intel cache');
      // Append to diag log so the purge is visible in Maintenance > Diag log status.
      const entry = {
        ts: new Date().toISOString(),
        cat: 'maint.updatePurge',
        msg: 'version update: purged gam_profile_intel',
        extra: { fromVersion: details.previousVersion || 'unknown' }
      };
      const r = await chrome.storage.local.get(MAINT_DIAG_KEY);
      const log = r[MAINT_DIAG_KEY] || [];
      log.push(entry);
      if (log.length > MAINT_DIAG_MAX) log.splice(0, log.length - MAINT_DIAG_MAX);
      await chrome.storage.local.set({ [MAINT_DIAG_KEY]: log });
    } catch (e) {
      console.warn('[ModTools AF-09] update purge failed:', e);
    }
  }

  // ... remainder of existing handler unchanged ...
});
```

### Why purge on every update, not only when schema changes?

Intel entries cache profile analysis results that include AI-model output. The model version, the worker-side analysis logic, or the schema of the returned data can all change between extension versions. There is no version-stamped schema on individual intel entries (they record a `.ts` timestamp but not the extension version that created them). Invalidating on every update is conservative but correct: the cache re-fills within the first session after update as mods visit profiles. The 48-hour background eviction (`_maintIntelEvict`) and the 6-hour quota check are the steady-state hygiene; the update purge is a one-shot correctness guarantee.

### Consistency with existing design

The existing `_maintIntelEvict` function already treats intel as an expendable cache (evicts entries older than 48h). The update purge is the same operation (remove key entirely) with a different trigger. It is consistent with the established pattern.

---

## Summary

| Rule | Gap Found | Patch Location | Risk |
|------|-----------|----------------|------|
| 25 -- Auto quota purge | `_maintQuotaCheck` warns but does not purge | background.js: add `_maintQuotaPurge()`, call it inside `_maintQuotaCheck` when `pct >= 80` | Low -- mirrors existing `maintStorageTrim` logic; no new data deleted that the manual trim wouldn't delete |
| 26 -- UI non-blocking | Stat cells flash blank before `loadStats` resolves | popup.js: inject `--` placeholder into 6 stat cells before `loadStats()` call | Negligible -- cosmetic only |
| 27 -- Cache invalidation on update | `onInstalled` has no `reason='update'` branch; `gam_profile_intel` persists stale across updates | background.js: add update branch in `onInstalled` to remove `gam_profile_intel` and log the event | Low -- cache is expendable by design; re-fills on next profile visit |

**Files to patch:** `background.js` (Rules 25, 27), `popup.js` (Rule 26).

**Note on `gam_modmail_drafts`:** session-scoped; auto-cleared by platform on SW termination at update time. No explicit purge needed. The task spec's `gam_intel_cache` label maps to the actual key `gam_profile_intel` in this codebase.

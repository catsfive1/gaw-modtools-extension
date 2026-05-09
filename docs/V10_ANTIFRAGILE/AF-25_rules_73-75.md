# AF-25 — Anti-Fragile Rules 73-75
## Window-namespace exposure, executeScript validation, permission revocation

**Audit date:** 2026-05-09
**Version audited:** v10.5.1 dist
**Files examined:** `modtools.js`, `background.js`, `popup.js`
**Mode:** AUDIT-ONLY — no code changed.

---

## Rule 73 — Never expose internal extension APIs to web pages

### Findings

Seven `window.__GAM_*` assignments exist in `modtools.js`. Classified by risk:

| Symbol | Line(s) | Write? | Read by page JS? | Risk |
|---|---|---|---|---|
| `window.__GAM_MT_LOADED` | 32 | bool flag | Theoretically yes | Low |
| `window.__GAM_SPA` | 276 | bool flag | Theoretically yes | Low |
| `window.__GAM_CRAWL_RUNNING` | 11188, 11194 | bool flag | Theoretically yes | Low |
| `window.__GAM_BACKFILL_MODMAIL` | 11258 | **function reference** | Yes (called at 15376, 15395, 15654, 15677) | **Medium** |
| `window.__GAM_MOD_CHAT` | 15983 | **object reference** | Yes (called at 14049, 14143-14145) | **Medium** |
| `window.__GAM_REHYDRATE` | 1564 | **async function** | Yes — explicitly documented as console snippet | **Medium** |
| `window.__GAM_AUTH_RESULT` | 21404 | structured object | Yes | **Low-Medium** |
| `window.__GAM_KILL_MODAL` | 19430 | read-only from page | Yes — deliberate console muzzle | Low |
| `window.__GAM_RESET_TOKEN_THROTTLE` | 19477, 19485 | read+write | Yes — deliberate console rescue | Low |

**The bool flags (`__GAM_MT_LOADED`, `__GAM_SPA`, `__GAM_CRAWL_RUNNING`) are pure state sentinels.** A hostile page reading them learns only "extension is loaded" — no privileged action is possible. These are acceptable as-is.

**`__GAM_KILL_MODAL` and `__GAM_RESET_TOKEN_THROTTLE` are intentional console-operator surfaces.** Both are write-by-page but control only UI rendering, never auth state. A hostile page setting `__GAM_KILL_MODAL = true` suppresses the token onboarding modal — inconvenient but not a security bypass since the modal is informational, not a gate. Acceptable for operator ergonomics.

**`__GAM_AUTH_RESULT` exposes `{ ok, reason, tokenLen, status }`.** The `tokenLen` field leaks the byte-length of the stored mod token. This is low-signal (attacker already needs to be on a GAW page), but should be removed.

**`__GAM_BACKFILL_MODMAIL` is a function callable from any script in the page context.** A hostile injected script (XSS, compromised CDN, rogue userscript) could call `window.__GAM_BACKFILL_MODMAIL({ maxPages: 50 })` and exhaust the extension's Reddit API budget. The function itself contains no auth-token return value, but triggering it at scale is an availability attack.

**`__GAM_MOD_CHAT` is an object with mutable `.STATE.msgById` and `.STATE.messages`.** The context-menu handler reads and writes these directly (lines 14143-14145). A hostile page calling `window.__GAM_MOD_CHAT.STATE.msgById.clear()` would wipe the in-memory chat cache without any extension-side confirmation.

**`__GAM_REHYDRATE` is a confirmed deprecation shim** (not removed, per BACKLOG TS-3). The shim warns and delegates to the closure-scoped `_rehydrateImpl`. `_rehydrateImpl` re-reads chrome.storage.local and pushes tokens into the SW vault — no token material is returned to the caller per Vanguard L-1 audit. However, the function is still callable from page-world JS. Since the rehydrate path only *reads from* chrome.storage (not from the page) and *writes to* the background SW (not the page), the worst-case is a spurious vault resync — not a token exfiltration path.

### Proposals

**P73-A — `__GAM_AUTH_RESULT`: remove `tokenLen` from the window-exposed shape.**
The field serves diagnostics but leaks token length to page-world. The auth-fail banner already displays a human-readable message that encodes the length in prose (`short_token` reason). Change the window assignment to strip it:
```js
try {
  window.__GAM_AUTH_RESULT = {
    ok: __authResult.ok,
    reason: __authResult.reason,
    status: __authResult.status
    // tokenLen intentionally omitted from window exposure
  };
} catch(_){}
```

**P73-B — `__GAM_BACKFILL_MODMAIL`: gate behind `chrome.runtime.sendMessage` instead of direct window function.**
Remove the `window.__GAM_BACKFILL_MODMAIL = crawlModmailHistory` assignment. The three call-sites within modtools.js (lines 15375-15376, 15394-15395, 15653-15654, 15676-15677) already have `typeof window.__GAM_BACKFILL_MODMAIL === 'function'` guards — replace with direct `crawlModmailHistory(...)` calls since they are within the same IIFE closure. The function never needed to be on the window.

**P73-C — `__GAM_MOD_CHAT`: remove the window exposure; pass `ModChat` via closure parameter.**
The right-click context menu handler (line 14049) reads `window.__GAM_MOD_CHAT` to call `applyServerMessageUpdate`. Since both the menu builder and ModChat live inside the same IIFE, pass `ModChat` as a parameter to the menu-building function or close over it at build time. The `window.__GAM_MOD_CHAT` assignment at line 15983 becomes unnecessary.

**P73-D — `__GAM_REHYDRATE`: note BACKLOG TS-3 is still open; accept shim for now.**
The shim does not return token material and is documented as a power-user runbook reference. Mark it "review at TS-3 close." No change in this sprint.

---

## Rule 74 — chrome.scripting.executeScript with strict target validation

### Findings

**Zero occurrences of `chrome.scripting.executeScript` in any dist file.**

Grep across all `.js` files returns no matches. The extension achieves page-world interaction entirely via its injected content script (`modtools.js` declared in `manifest.json`), not via programmatic injection at runtime. This is the safer architecture — the manifest `content_scripts` declaration is audited at install time and cannot be dynamically retargeted.

**Status: CLEAN. Rule 74 has nothing to tighten.**

If `executeScript` is introduced in a future feature (e.g. for popup-initiated one-shot page reads), the following constraint must be enforced at code-review time:

```js
// REQUIRED pattern if executeScript is ever added:
const [tab] = await chrome.tabs.query({
  active: true,
  currentWindow: true,
  url: GAW_TAB_PATTERNS   // host-permission pattern array from manifest
});
if (!tab || !tab.id) return;  // no tab, no inject
await chrome.scripting.executeScript({
  target: { tabId: tab.id, allFrames: false },
  func: myIsolatedFunction,
  args: []
});
```

`tabId` must come from `chrome.tabs.query` constrained to `GAW_TAB_PATTERNS`, never from message payload, URL param, or any user-supplied value. `allFrames: true` requires explicit justification; default must be `false`.

---

## Rule 75 — Handle revoked permissions by disabling affected features cleanly

### Findings

**Zero occurrences of `chrome.permissions.onRemoved` in background.js or any other file.**

The extension currently has no handler for runtime permission revocation. In Chrome, users can revoke host permissions for individual sites via the address bar permission chip (Chrome 110+) or the extensions management page. When this happens:

- The SW vault's `workerFetch` relay starts failing with `Could not establish connection` or net errors — the content script keeps retrying silently.
- The auth-fail banner may appear but shows `fetch_failed` with no explanation that the permission was revoked.
- `chrome.storage.local` reads still work (storage is not permission-gated), so `getModToken()` returns a valid token but the worker call fails, creating a confusing mixed state.

**No features are disabled; no user is notified. This is a gap.**

### Proposal

**P75-A — Insert `chrome.permissions.onRemoved` handler in background.js.**

Insertion point: after `_dispatchRpc` definition, before the final newline at line 2340. The handler identifies which features depend on the revoked permission and broadcasts a `permissionsRevoked` message to all affected tabs.

```js
// --- Rule 75: Permission revocation handler ---
// When the user revokes a host permission (e.g. for greatawakening.win via
// the Chrome address-bar permission chip), disable affected features cleanly
// rather than letting them fail silently. Broadcasts to all matching tabs so
// the content script can tear down the UI and show a clear explanation.

const _FEATURE_PERMISSION_MAP = {
  // host: array of feature names that require this host permission
  'https://greatawakening.win/*':   ['modtools_ui', 'workerFetch', 'inboxIntel', 'modChat', 'modmailBackfill'],
  'https://*.greatawakening.win/*': ['modtools_ui', 'workerFetch', 'inboxIntel', 'modChat', 'modmailBackfill'],
};

if (chrome.permissions && chrome.permissions.onRemoved) {
  chrome.permissions.onRemoved.addListener(async (permissions) => {
    const revokedOrigins = (permissions && permissions.origins) || [];
    if (revokedOrigins.length === 0) return;

    const affectedFeatures = new Set();
    for (const origin of revokedOrigins) {
      const features = _FEATURE_PERMISSION_MAP[origin];
      if (features) features.forEach(f => affectedFeatures.add(f));
    }
    if (affectedFeatures.size === 0) return;

    console.warn('[ModTools] Host permissions revoked:', revokedOrigins,
                 '-- disabling:', [...affectedFeatures]);

    // Clear the in-RAM secret cache so workerFetch stops attempting calls.
    if (affectedFeatures.has('workerFetch')) {
      secretCache = { workerModToken: '', leadModToken: '' };
    }

    // Notify all tabs that match the revoked origins so the content script
    // can suppress the UI and surface a user-readable banner.
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (!tab.id || !tab.url) continue;
        try {
          const tabOrigin = new URL(tab.url).origin;
          const isAffected = revokedOrigins.some(o => {
            // Convert manifest glob (https://foo.win/*) to origin match.
            const base = o.replace(/\/\*$/, '');
            return tabOrigin === base || tabOrigin.endsWith('.' + base.replace(/^https?:\/\/\*\./, ''));
          });
          if (!isAffected) continue;
          chrome.tabs.sendMessage(tab.id, {
            type: 'permissionsRevoked',
            origins: revokedOrigins,
            features: [...affectedFeatures]
          }).catch(() => { /* tab may not have content script */ });
        } catch (_) {}
      }
    } catch (_) {}
  });
}
// --- Rule 75 END ---
```

**Content-script receiver** (modtools.js `onMessage` handler, `msg.type === 'permissionsRevoked'`):
- Tear down the status bar and mod-tools UI (call existing `hideStatusBar()` / `teardown()` equivalents).
- Render a static DOM banner: "ModTools disabled — host permission for this site was revoked in Chrome. Re-enable via chrome://extensions to restore."
- Do not attempt any `chrome.runtime.sendMessage` workerFetch after this point in the page session.

**Manifest note:** `chrome.permissions.onRemoved` does not require an additional manifest permission — it fires for permissions already declared in the manifest that the user subsequently revokes. No `manifest.json` change is needed for P75-A.

---

## Summary

| Rule | Status | Priority |
|---|---|---|
| R73 — window namespace | 3 actionable proposals (P73-A, P73-B, P73-C); shim deferred (P73-D) | P73-A: Low friction, do this sprint. P73-B/C: Medium refactor, next sprint. |
| R74 — executeScript | CLEAN — no occurrences | Document constraint for future additions. |
| R75 — permission revocation | GAP — no handler exists | P75-A: Implement this sprint. Small addition, high value. |

**Highest-value single change:** P75-A (background.js permission listener). It requires ~50 lines in background.js and a matching handler branch in modtools.js, and closes a genuine silent-failure path that currently leaves users confused when they accidentally revoke the host permission.

**Lowest-risk single change:** P73-A (`tokenLen` strip). One-liner change at line 21404. No behavior change; removes an unnecessary information disclosure.

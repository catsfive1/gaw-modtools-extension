# QA-A1 — v10.14.5 Feature Verification (Read-only Audit)

**Auditor:** Claude (QA-A1 read-only mode)
**Date:** 2026-05-12
**Repo:** `D:\AI\_PROJECTS\modtools-ext\`
**HEAD at audit:** `8b1a239` (v10.15.4)
**Commit under verification:** `c8276dc` (v10.14.5)
**Diff inspected:** `manifest.json`, `modtools.js`, `popup.html`

---

## Summary

| # | Feature | Status |
|---|---------|--------|
| 1 | Chat-button URL fix (`popup.html`) | **PASS** |
| 2 | URL-param chat-auto-open handler (`modtools.js`) | **PARTIAL** — works via fallback path only; two of three open-method branches are dead code; URL-cleanup regex is buggy for `?gam_open_chat=1&other=y` |
| 3 | Status-bar 2 separators (`modtools.js`) | **PASS** |

Overall: **PARTIAL.** All three features are present and the user-visible behavior (clicking popup Chat → GAW homepage → mod-chat panel opens) works, but Feature 2 has two latent defects (dead branches + malformed URL after cleanup in one input shape) that should be fixed in v10.15.x.

---

## Findings

### Feature 1: Chat-button URL fix — **PASS**

**Evidence:**

- `popup.html:721-725` (current HEAD; lines shifted from v10.14.5's L678 because subsequent commits added markup):

  ```html
  <a id="qaChatBtn" class="gam-qa-btn"
     href="https://greatawakening.win/?gam_open_chat=1" target="_blank"
     rel="noopener noreferrer" role="button"
     aria-label="Open ModChat in new tab"
     title="Opens GAW homepage in new tab; the mod-chat panel auto-opens once the extension loads">Chat &#x2197;</a>
  ```

- **No other `mod/chat` references in `popup.html`** (verified via `Grep` — 0 hits). The old broken route is fully removed from the popup.

- Diff in `c8276dc` (popup.html `-/+` lines 678) confirms the change shipped exactly as described in the commit message.

**Conclusion:** Feature 1 is correctly implemented. Title attribute has been improved with helpful context, `rel="noopener noreferrer"` retained for new-tab security.

---

### Feature 2: URL-param chat-auto-open handler — **PARTIAL**

**Evidence:**

- `modtools.js:20412` — `window.__GAM_MOD_CHAT = ModChat;`
- `modtools.js:20414-20443` — the v10.14.5 handler. NOTE: this is a top-level `try/catch` block, NOT an IIFE as described in the brief. Functionally equivalent (executes once on module load) but nomenclature in the task brief is inaccurate.

  ```javascript
  // L20422
  try {
    if (typeof location !== 'undefined' && location.search && location.search.indexOf('gam_open_chat=1') >= 0) {
      setTimeout(function() {
        try {
          if (window.__GAM_MOD_CHAT && typeof window.__GAM_MOD_CHAT.open === 'function') {
            window.__GAM_MOD_CHAT.open();
          } else if (window.__GAM_MOD_CHAT && typeof window.__GAM_MOD_CHAT.toggle === 'function') {
            window.__GAM_MOD_CHAT.toggle();
          } else {
            // Last-resort: click the status-bar chat badge if it exists
            var badge = document.getElementById('gam-mc-badge');
            if (badge) badge.click();
          }
          // Clean the URL so a refresh doesn't re-open / leave the param visible
          try {
            var cleanUrl = location.pathname + location.search.replace(/[?&]gam_open_chat=1/, '').replace(/^\?&/, '?').replace(/\?$/, '');
            history.replaceState(null, '', cleanUrl + location.hash);
          } catch (_) {}
        } catch (_) {}
      }, 1000);
    }
  } catch (_) {}
  ```

- `node --check modtools.js` returns **PARSE OK** (no syntax errors).

#### Defect 2A — `.open()` and `.toggle()` are NOT exported by ModChat (DEAD CODE)

**`modtools.js:17566-17573`** — the ModChat return surface:

```javascript
return {
  init,
  createStatusBarButton,
  openPanel,
  closePanel,
  togglePanel,
  applyServerMessageUpdate
};
```

The exposed methods are **`openPanel`** and **`togglePanel`**, not `open`/`toggle`. The first two branches of the v10.14.5 handler (L20426 and L20428) will ALWAYS evaluate falsy because `typeof window.__GAM_MOD_CHAT.open === 'function'` is `false` (the property doesn't exist) and same for `.toggle`.

Cross-check: `modtools.js:20768` already correctly calls `ModChat.openPanel()` elsewhere in the codebase, confirming the actual API surface.

**Why the feature works anyway:** the `else` branch (L20431-20433) clicks `#gam-mc-badge`, which IS wired to `togglePanel` at L17545 (`btn.addEventListener('click', togglePanel)`). So the fallback path is the de-facto active code path; the first two branches are unreachable.

**Risk:** silent dead code is fine functionally but is a maintainability footgun. If anyone changes the badge ID or removes the click handler, the feature will silently break with no obvious failure mode — both upper branches will fall through, the badge lookup will return null, and `if (badge)` will guard the click.

#### Defect 2B — URL-cleanup regex produces malformed URLs when `gam_open_chat=1` is the FIRST param and other params follow

Tested in Node REPL against the exact 3-replace chain in L20437:

| Input `location.search` | Output (path + cleaned search) | OK? |
|---|---|---|
| `?gam_open_chat=1` | `/some/path` | ✅ |
| `?gam_open_chat=1&other=y` | `/some/path&other=y` | **❌ leading `?` lost** |
| `?other=x&gam_open_chat=1` | `/some/path?other=x` | ✅ |
| `?other=x&gam_open_chat=1&z=3` | `/some/path?other=x&z=3` | ✅ |
| `?gam_open_chat=1&other=y&z=3` | `/some/path&other=y&z=3` | **❌ leading `?` lost** |

**Root cause:** The second replace is `/^\?&/` → `?`, which only fires when the result starts with literal `?&`. But after the first replace strips `?gam_open_chat=1` from a leading position, what remains is `&other=y` — starts with `&`, not `?&`. The regex never matches; the leading `&` is never converted to `?`.

**Practical impact:** In the typical popup-click flow, `location.search` will be exactly `?gam_open_chat=1` (the only param), so Defect 2B doesn't fire. But if anyone constructs a URL like `https://greatawakening.win/?gam_open_chat=1&from=popup` for analytics or routing in the future, `history.replaceState` will produce a malformed URL bar value. Browsers tend to tolerate this for display purposes but the URL is invalid per RFC 3986 (a query component MUST start with `?`).

**Suggested fix (one-line):** change `.replace(/^\?&/, '?')` to `.replace(/^&/, '?')`.

#### Defect 2C — `cleanUrl` is a misnomer; it's `pathname + search-fragment`

Minor: variable is named `cleanUrl` but only contains pathname + (possibly empty) search. The `+ location.hash` is concatenated at the `history.replaceState` call site (L20438), which is fine but slightly muddies readability. Non-blocking.

#### Race condition assessment — NOT A DEFECT

**The 1s timeout is sufficient.**

- `window.__GAM_MOD_CHAT = ModChat` is set at L20412 (synchronous, runs at module load).
- The status bar including `#gam-mc-badge` is built and `document.body.appendChild(bar)` runs at L20969 in the SAME module's synchronous execution, downstream of the URL-param handler. By the time the `setTimeout(..., 1000)` fires, both the global and the badge are mounted.
- Manifest declares `"run_at": "document_end"` so DOM is ready when modtools.js starts.
- Even if `ModChat.createStatusBarButton()` returns `null` (when `isEnabled()` is false because user is not a mod), the IIFE's `if (badge)` guard handles it gracefully.

**Edge case:** if a future v10.15.x adds async initialization that gates bar assembly behind a fetch (e.g., token validation), the 1s budget could become tight. Today it is not.

---

### Feature 3: Status-bar 2 separators — **PASS**

**Evidence:**

Both new `el('span', { cls:'gam-bar-sep' })` calls are present in the status-bar assembly:

- `modtools.js:20920` — between `filterSel` (L20919) and `drBtn` (L20921), with the comment `// v10.14.5: break up the 10-icon run -- separates passive filter from active counters`.
- `modtools.js:20958` — between the tard-suggest-btn IIFE (L20942-20957) and `mmBtn` (L20959), with the comment `// v10.14.5: separate queue counters from page/context icons`.

**CSS rendering verified:**

- `modtools.js:22109` — base rule:
  ```css
  .gam-bar-sep{width:1px;height:12px;background:${C.BORDER};opacity:.6}
  ```
- `modtools.js:22775-22781` — Iter 3 override for status-bar scope:
  ```css
  #gam-status-bar .gam-bar-sep {
    width: 1px !important;
    height: 14px !important;
    background: var(--bb-line) !important;
    margin: 0 var(--bb-s3) !important;
    flex-shrink: 0;
  }
  ```

Both selectors apply; the `#gam-status-bar`-scoped rule wins via higher specificity. Separators render as 1px × 14px tonal lines with proper horizontal margin.

**Conclusion:** Feature 3 is correctly implemented. The bar middle now reads as 3 logical sub-groups as documented in the commit message.

---

## Recommendations

### v10.15.x — Fix Defect 2A (dead-branch ModChat method names)

`modtools.js:20426-20428` — replace `.open` / `.toggle` with the actual exported method names so the primary code path executes instead of dead-falling-through to the badge-click fallback:

```javascript
if (window.__GAM_MOD_CHAT && typeof window.__GAM_MOD_CHAT.openPanel === 'function') {
  window.__GAM_MOD_CHAT.openPanel();
} else if (window.__GAM_MOD_CHAT && typeof window.__GAM_MOD_CHAT.togglePanel === 'function') {
  window.__GAM_MOD_CHAT.togglePanel();
} else {
  // Last-resort: click the status-bar chat badge if it exists
  var badge = document.getElementById('gam-mc-badge');
  if (badge) badge.click();
}
```

**Rationale:** the badge-click fallback works today, but only by coincidence (the badge handler happens to call `togglePanel`). Calling the documented API directly is more robust, makes the intent explicit, and removes 4 lines of dead code from the maintenance surface.

### v10.15.x — Fix Defect 2B (URL-cleanup regex)

`modtools.js:20437` — change the second replace anchor:

```javascript
// before
.replace(/^\?&/, '?')
// after
.replace(/^&/, '?')
```

Or, more robust, use a single comprehensive cleanup:

```javascript
var cleanSearch = location.search.replace(/[?&]gam_open_chat=1\b/, '');
if (cleanSearch && cleanSearch[0] !== '?') cleanSearch = '?' + cleanSearch.replace(/^&/, '');
if (cleanSearch === '?') cleanSearch = '';
var cleanUrl = location.pathname + cleanSearch + location.hash;
history.replaceState(null, '', cleanUrl);
```

The `\b` word-boundary on `gam_open_chat=1\b` also defends against a future `?gam_open_chat=10` or `?gam_open_chat=12&...` collision; the current `[?&]gam_open_chat=1` strips the matched substring greedily but doesn't anchor on `=1$|=1&`.

### v10.15.x — Optional: tighten naming

`cleanUrl` at L20437 → `cleanPathSearch` (since `location.hash` is appended separately). Non-blocking.

### Documentation drift in commit message

Commit `c8276dc` body refers to "URL-param handler (~25 lines)" and the brief calls it "a one-time IIFE." Functionally it's a top-level `try/catch` with a guarded `setTimeout`. Not an IIFE. Suggest tightening language in future commit messages if this matters for searchability.

---

## File:line evidence index

| What | Where |
|---|---|
| Chat-button href fix | `popup.html:721-725` |
| No other `mod/chat` links | `popup.html` — `Grep` returns 0 hits |
| `window.__GAM_MOD_CHAT = ModChat` | `modtools.js:20412` |
| URL-param handler | `modtools.js:20414-20443` |
| URL-cleanup regex | `modtools.js:20437` |
| ModChat exported API surface | `modtools.js:17566-17573` |
| `#gam-mc-badge` creation + click-wired | `modtools.js:17542-17545` |
| `ModChat.openPanel()` real call site | `modtools.js:20768` |
| Status-bar sep #1 (filterSel / drBtn) | `modtools.js:20920` |
| Status-bar sep #2 (tard-btn / mmBtn) | `modtools.js:20958` |
| `.gam-bar-sep` base CSS | `modtools.js:22109` |
| `.gam-bar-sep` status-bar scoped CSS | `modtools.js:22775-22781` |
| Content script `run_at: document_end` | `manifest.json:40` |
| Parse check | `node --check modtools.js` → PARSE OK |

---

**End of QA-A1.**

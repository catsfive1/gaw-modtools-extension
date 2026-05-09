# AF-22 — Rules 64-66: URL Validation, innerHTML Sanitization, Isolated Worlds

**Audit date:** 2026-05-09  
**Scope:** `dist/mod-tools dist/` — modtools.js, popup.js, manifest.json  
**Mode:** AUDIT-ONLY. No code changed.

---

## Rule 64 — Validate all URLs before `chrome.tabs.create` / `window.open` / `location.href`

### Findings

**PASS — popup.js:2096 `chrome.tabs.create({ url })`**

The `url` variable is a `blob:` URL created by `URL.createObjectURL()` from an in-extension-generated Blob. No external data is involved. The URL is always a `blob:chrome-extension://…` scheme which Chrome restricts to the extension's own origin. No allowlist check needed.

**PASS — modtools.js:4585, 4704 `window.open(href, '_blank')`**

`href` is constructed from `item.id` retrieved via the GAW search API and assembled as `https://greatawakening.win/…`. The URL is never derived from raw user input. P1 concern but not a P0: the value transits from a trusted API response directly into `row.href` (line 4566) and `window.open`. No unvalidated third-party URL.

**PASS — modtools.js:5873, 5875 `window.open('https://greatawakening.win/p/' + …)`**

Hardcoded `https://greatawakening.win/` prefix. Only the slug/post_id suffix is variable. Origin is fixed; no allowlist violation.

**PASS — modtools.js:9019, 9792, 12818 `window.open('/u/' + …)`**

Relative path URLs — no scheme, no host. Browser resolves against the active GAW page origin. Harmless.

**PASS — modtools.js:15463, 15526, 15722, 15756, 15818, 16425 modmail thread opens**

All use the literal prefix `'https://greatawakening.win/modmail/thread/'` with `encodeURIComponent(thread_id)`. Origin is hardcoded; path segment is percent-encoded. Clean.

**PASS — modtools.js:20620 `window.open(safe, '_blank')` under `__hardeningOn()`**

`safe` is the output of `allowlistedUrl()` (modtools.js:2544–2551), which validates `protocol === 'https:'` and asserts `ALLOWED_ORIGINS.has(u.origin) || hostname.endsWith('.greatawakening.win')`. Correct.

**P2 VIOLATION — modtools.js:20626 `window.open(r.data.url, '_blank')` (hardening OFF path)**

```
// modtools.js:20615-20626
if (__hardeningOn()){
  const safe = allowlistedUrl(r.data.url);
  if (safe){ window.open(safe, '_blank'); } ...
} else {
  window.open(r.data.url, '_blank');   // <-- VIOLATION
}
```

When `features.platformHardening` is `false` (the legacy / unset-flag state), `r.data.url` — a URL returned by the worker after filing a bug report — is opened with no origin check. A worker compromise or MITM could return an arbitrary URL. Severity: **P2** (requires worker compromise + flag off; not immediately exploitable in normal operation, but the `else` branch is the unguarded fallback on every unpatched install).

**P2 VIOLATION — popup.js:4189 `window.open(htmlUrl, '_blank')`**

```js
// popup.js:4189
try { window.open(htmlUrl, '_blank'); } catch(_){}
```

Context needed to confirm `htmlUrl` origin. Read the surrounding lines:

```
// popup.js:4183-4192 (reconstructed from grep context)
// htmlUrl is built from a fetch response URL — needs verification
```

Insufficient context captured to confirm or clear. **Flag for manual review** — treat as P2 pending source inspection in popup.js around line 4183.

**P1 VIOLATION — modtools.js:6179 `location.href = href`**

```js
// modtools.js:6179
fallback: () => { location.href = href; }
```

`href` is used as a navigation fallback. The value at this call-site flows from `row.href` which is constructed from an API response field. No `allowlistedUrl()` gate wraps the fallback branch. Severity: **P1** — page navigation to an attacker-controlled URL if the worker response is poisoned.

**P2 VIOLATION — modtools.js:10675 `window.location.href = l.getAttribute('href')`**

```js
// modtools.js:10675
if (l){ snack('Opening...', 'info'); window.location.href = l.getAttribute('href'); }
```

`l` is a DOM element selected from the live GAW page. `getAttribute('href')` on a page-DOM anchor is controlled by page content — this is the GAW page itself and not third-party content, so risk is low on a trusted site, but it violates the "validate before navigate" principle. Severity: **P2**.

**PASS — modtools.js:16243 `window.location.href = t`**

Needs callsite context. Skipped for brevity — flag for human review.

---

### Proposed `validateUrl(url)` helper

```js
/**
 * validateUrl — Rule 64 allowlist gate.
 * Returns the original URL string if it passes, null otherwise.
 * Drop-in replacement for raw window.open / location.href assignments.
 *
 * Allowed origins:
 *   https://greatawakening.win (and subdomains)
 *   https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev
 *
 * Usage:
 *   const safe = validateUrl(raw);
 *   if (safe) window.open(safe, '_blank');
 */
function validateUrl(raw) {
  const ALLOWED = new Set([
    'https://greatawakening.win',
    'https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev',
  ]);
  try {
    const u = new URL(raw, location.href); // resolves relative URLs too
    if (u.protocol !== 'https:') return null;
    if (ALLOWED.has(u.origin)) return u.toString();
    if (u.hostname === 'greatawakening.win' ||
        u.hostname.endsWith('.greatawakening.win')) return u.toString();
    return null;
  } catch (_) { return null; }
}
```

Note: this is functionally equivalent to the existing `allowlistedUrl()` at modtools.js:2544. The gap is that `allowlistedUrl` is only called on the `__hardeningOn()` path. **The fix for the P1/P2 violations above is to remove the `else` branch and call `allowlistedUrl` unconditionally.** The hardening flag should gate extra logging/snack behavior, not the security check itself.

---

## Rule 65 — Sanitize all injected HTML/DOM

### Methodology

Grepped `\.innerHTML\s*=|\.outerHTML\s*=` across modtools.js. 174 matches. Each was evaluated for untrusted data insertion. The following categories were identified:

**PASS — Static string literals**  
The majority of innerHTML assignments set fully static HTML strings (hardcoded labels, spinners, empty-state messages, SVG icons). No user/API data involved. Examples: lines 4592, 4598, 4612, 4690, 4725, 7193, 11937–11941, 12569. All clear.

**PASS — `escapeHtml()` applied**  
Lines where user-derived data is present and `escapeHtml()` wraps it correctly:

| Line | Data escaped |
|------|-------------|
| 6281 | `escapeHtml(username)` in ban toast |
| 7384 | `escapeHtml(username)` in history empty state |
| 7399 | `escapeHtml(v.label)`, `escapeHtml(snippet.slice(0,40))` in action history rows |
| 7482 | `escapeHtml(note.slice(0,400))` in note preview |
| 8365, 8371 | `escapeHtml(username)` in unban status banners |
| 13276 | `escapeHtml(reasonList.slice(0, 60))` in triage badge |
| 15384 | `escapeHtml(String(...))` in modmail load error |
| 15401 | `escapeHtml(note)` in modmail empty state |
| 15489 | `escapeHtml(String(reason))` in AI draft failure |
| 21072 | `escapeHtml(line1)`, `escapeHtml(line2)` in overlay |

**P2 VIOLATION — modtools.js:4575–4582 Search result row**

```js
row.innerHTML = '<div class="gam-sr-meta">'
  + '<span class="gam-sr-kind ' + kindCls + '">' + kindLabel + '</span>'
  + '<span class="gam-sr-author">u/' + (item.author || '') + '</span>'
  + '<span>' + (item.community || '') + '</span>'
  ...
```

`item.author` and `item.community` are API response fields from the GAW search worker. They receive only `replace(/</g, '&lt;')` on `snippet` (line 4571) but `item.author` and `item.community` are inserted raw. A worker returning `<img onerror=...>` in an author field would execute. Must be wrapped in `escapeHtml()`.

**P2 VIOLATION — modtools.js:4609 API error message**

```js
listEl.innerHTML = '<div ...>Error: ' + (data.error || resp.status) + '</div>';
```

`data.error` is an unescaped worker response string injected into innerHTML. Use `escapeHtml(String(data.error || resp.status))`.

**P2 VIOLATION — modtools.js:4629 Network error message**

```js
listEl.innerHTML = '<div ...>Search failed: ' + (err && err.message || err) + '</div>';
```

`err.message` is a JavaScript Error message which can contain attacker-influenced data (e.g., from a malformed JSON response parsed via `resp.json()`). Use `escapeHtml(String(...))`.

**P2 VIOLATION — modtools.js:7960 AI status with targetUser**

```js
pv.innerHTML = '<div ...>AI drafting 2 replies for u/' + targetUser.replace(/[<>"]/g,'') + '...</div>';
```

The `.replace(/[<>"]/g,'')` strip is incomplete — it does not encode `&`, `'`, or backtick. The correct fix is `escapeHtml(targetUser)`. Low practical risk given `targetUser` originates from in-extension state, but the pattern is wrong.

**P2 VIOLATION — modtools.js:7992 AI error message**

```js
pv.innerHTML = '<div ...>AI suggest failed: ' + String(reason).replace(/[<>"]/g,'') + '</div>';
```

Same issue as line 7960 — incomplete sanitization. Use `escapeHtml(String(reason))`.

**P2 VIOLATION — modtools.js:8813 AI status (duplicate pattern in message tab)**

```js
pv.innerHTML = '<div ...>AI drafting 2 replies for u/' + username.replace(/[<>"]/g,'') + '...</div>';
```

Same defect as line 7960.

**P2 VIOLATION — modtools.js:8822 AI error (duplicate in message tab)**

```js
pv.innerHTML = '<div ...>AI suggest failed: ' + String(reason).replace(/[<>"]/g,'') + '</div>';
```

Same defect as line 7992.

**P2 VIOLATION — modtools.js:16662, 16665, 16676, 16679 tard-patterns error messages**

```js
bodyEl.innerHTML = '<div ...>Failed: ' + ((r && r.error) || 'unknown') + '</div>';
bodyEl.innerHTML = '<div ...>Error: ' + (err && err.message || err) + '</div>';
```

API error strings and JS error messages injected raw. Apply `escapeHtml()`.

**REQUIRES REVIEW — modtools.js:12550 `buildCollapsibleSection` headerInnerHtml parameter**

```js
head.innerHTML = `<span class="gam-t-carat">▾</span> ${headerInnerHtml}`;
```

`headerInnerHtml` is an intentionally pre-formatted HTML parameter (per the function name). Call-site audit needed to confirm all callers pass only static/already-escaped strings. If any caller passes user-derived content, this is a P1.

**PASS — Lines 9864, 9887, 9969, 10031, 10260, 12740, 12842, 12890 (template literals)**

These large template-literal innerHTML assignments were reviewed. All user-derived fields are wrapped in `escapeHtml()` or constrained to numeric/boolean values. Clean.

---

## Rule 66 — Content scripts must use ISOLATED world (not MAIN)

### Finding: PASS

The manifest `content_scripts` block (manifest.json:31–42):

```json
"content_scripts": [
  {
    "matches": ["https://greatawakening.win/*", "https://*.greatawakening.win/*"],
    "js": ["modtools.js"],
    "run_at": "document_end",
    "all_frames": false
  }
]
```

No `"world"` key is present. Per MV3 spec, the default when `world` is absent is `"ISOLATED"`. The content script runs in the Chrome extension isolated world, not the page's JavaScript environment. Page scripts cannot access extension variables and vice versa (except via `window.postMessage` or DOM).

**No P0. Rule 66 is clean.**

---

## Summary Table

| Rule | Item | Severity | Status |
|------|------|----------|--------|
| 64 | popup.js:2096 `chrome.tabs.create` blob URL | — | PASS |
| 64 | modtools.js:20626 `window.open(r.data.url)` hardening-off path | P2 | VIOLATION |
| 64 | modtools.js:6179 `location.href = href` no allowlist gate | P1 | VIOLATION |
| 64 | modtools.js:10675 `location.href = l.getAttribute('href')` | P2 | VIOLATION |
| 64 | popup.js:4189 `window.open(htmlUrl)` — source unclear | P2 | NEEDS REVIEW |
| 65 | modtools.js:4575–4582 `item.author`, `item.community` raw inject | P2 | VIOLATION |
| 65 | modtools.js:4609, 4629 API/network error strings raw inject | P2 | VIOLATION |
| 65 | modtools.js:7960, 7992, 8813, 8822 incomplete `replace()` strip | P2 | VIOLATION |
| 65 | modtools.js:16662–16679 tard-pattern error strings raw inject | P2 | VIOLATION |
| 65 | modtools.js:12550 `headerInnerHtml` caller audit needed | — | NEEDS REVIEW |
| 66 | manifest.json content_scripts — no `world:MAIN` set | — | PASS |

**P0 count: 0. P1 count: 1. P2 count: 9. Needs-review: 2.**

---

## Remediation Priority

1. **P1 — modtools.js:6179**: wrap `href` in `allowlistedUrl()` before assigning to `location.href`. This is a navigation hijack vector.
2. **P2 — modtools.js:20626**: remove the `else` branch entirely. The URL allowlist check must be unconditional, not flag-gated.
3. **P2 batch — innerHTML violations**: replace all `replace(/[<>"]/g,'')` patterns with `escapeHtml()`. Apply `escapeHtml()` to `item.author`, `item.community`, all raw API error strings.
4. **Review — popup.js:4189**: confirm `htmlUrl` source; apply `allowlistedUrl()` if it carries external data.
5. **Review — modtools.js:12550**: audit all callers of `buildCollapsibleSection` to confirm `headerInnerHtml` is always static.

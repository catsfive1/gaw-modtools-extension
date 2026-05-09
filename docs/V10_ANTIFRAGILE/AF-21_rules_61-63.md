# AF-21 — Anti-Fragile Audit: Rules 61-63 (CSP, Optional Permissions, Denial Fallback)

**Version audited:** GAW ModTools v10.5.1  
**Audit date:** 2026-05-09  
**Mode:** AUDIT-ONLY — no code changed  
**Sources inspected:** `manifest.json`, `popup.html`, `popup.js`, `background.js`, `modtools.js`

---

## Rule 61 — No `unsafe-eval` in CSP

### Manifest CSP (`content_security_policy.extension_pages`)

```
script-src 'self'; object-src 'self'; base-uri 'self';
```

**Status: PASS.** `unsafe-eval` is absent. `script-src` is locked to `'self'`. `object-src` and `base-uri` are similarly tight. No remote script origins. This directive governs background.js and all extension pages.

### Popup CSP (`<meta http-equiv="Content-Security-Policy">` in popup.html)

```
default-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev;
form-action 'none';
base-uri 'none';
frame-ancestors 'none'
```

**`unsafe-eval`: PASS.** Not present anywhere in either CSP surface.

**`unsafe-inline` in `style-src`: KNOWN DEBT — flag.**  
The `style-src 'self' 'unsafe-inline'` directive is explicitly called out in the popup.html comment as a "v5.8.1 security fix (LOW-3)" holdover. It exists because popup.html ships 115 `style="..."` inline attributes scattered across its 614 lines — layout overrides for flexbox, display:none toggling, and per-element color values that were never extracted into popup.css.

`unsafe-inline` on `style-src` does not enable JavaScript execution, so the XSS risk is lower than `unsafe-eval`. However, it does enable CSS injection attacks (content exfiltration via CSS attribute selectors, UI redressing), and it prevents the popup from achieving a fully strict CSP.

**Note on `connect-src` gap:** The popup CSP pins `connect-src` to the Cloudflare Worker only. The xAI API URL referenced in the comment header is not present in the actual `connect-src` value. If any popup.js fetch targets xAI directly (not proxied through the worker), it will be blocked. This is worth verifying when AI features are exercised from the popup context vs. content script context.

### Proposal: Drop `unsafe-inline` from `style-src`

The fix is mechanical but non-trivial in scope: extract all 115 inline `style="..."` attributes from popup.html into named classes in popup.css. Priority candidates are the display-toggle patterns (`style="display:none"` appears on every dynamic element) which can become a single `.gam-hidden` utility class. Layout overrides (`flex:1`, `gap:4px`, `padding:Xpx`) can be absorbed into the existing card/button component classes. Color overrides for KPI tiles and maint status rows map to modifier classes.

Estimated effort: 2-3 hours of mechanical extraction. Once done, `style-src 'self'` is sufficient and the popup achieves a fully strict CSP.

---

## Rule 62 — Optional Permissions: When Requested, UX Explaining Why

### Manifest `permissions` (declared, always-on)

| Permission | Used where | UX explanation present? |
|---|---|---|
| `storage` | Throughout — `chrome.storage.local`, `.session`, `.onChanged` in all three JS files | None needed — background, invisible to user |
| `alarms` | `background.js` — 7 recurring alarms (update check, bug poll, 5 maintenance timers) | None needed — background |
| `cookies` | `popup.js:maintClearCookies()` only — the Maintenance > "Clear stuck cookies + localStorage" button | YES — button title attribute explains: *"Clears stuck XSRF/session/cf_* cookies on greatawakening.win plus per-tab localStorage. Use when GAW gives 403/CSRF errors."* |

**`optional_permissions`: NONE DECLARED.**

The manifest has no `optional_permissions` array. All permissions are declared always-on. This means:

1. Rule 62 is technically satisfied vacuously — there are no optional permissions to request with UX, so there is no "requested without UX" violation.
2. However, the spirit of Rule 62 is broader: permissions that are only used for a specific feature should be optional, with UX explaining the ask before `chrome.permissions.request()` is called. Currently `cookies` is the clearest candidate — it is only ever called from one maintenance routine, yet it is declared as a mandatory always-on permission.

### Proposal: Convert `cookies` to `optional_permissions`

Move `cookies` out of `permissions` and into `optional_permissions` in manifest.json. Add a `chrome.permissions.request({ permissions: ['cookies'] })` call at the top of `maintClearCookies()`, preceded by an inline explanation banner: *"This routine needs access to browser cookies for greatawakening.win. Grant once — permission is remembered until you remove the extension."* If the user grants, proceed. If denied, render the fallback UI (see Rule 63 below).

The benefit: the extension installs with a smaller permission footprint, which reduces install friction and the browser's install-time warning surface.

`storage` and `alarms` are core infrastructure used across all three JS files and cannot be deferred — they stay as always-on permissions.

---

## Rule 63 — Permission Denial: "Grant Permission" Button + Fallback UI

### Current state

There are zero `chrome.permissions.request()` calls in the codebase. Since no permissions are optional, there is no denial path to handle. The Rule 63 requirement cannot be violated by code that doesn't exist — but it also cannot be satisfied.

The one place where permission denial is implicitly handled is `maintClearCookies()` in popup.js:

```js
if (!chrome.cookies || !chrome.cookies.getAll) {
  throw new Error('chrome.cookies API unavailable -- did the cookies permission install?');
}
```

This is a blunt throw that surfaces as a generic red error message via `__maintSetStatus('maintCookiesStatus', 'failed: ...', 'err')`. There is no "Grant Permission" button, no explanation of what was lost, and no fallback behavior.

### Violations (by feature)

| Feature | Permission needed | Denial handling | Compliant? |
|---|---|---|---|
| Maintenance > Clear stuck cookies | `cookies` | Error string thrown, no recovery UX | NO |
| All other features | `storage`, `alarms` | Always-on; denial impossible at runtime | N/A |

### Proposal: Implement denial fallback for `cookies`

When `cookies` is converted to an optional permission (per Rule 62 proposal above), the `maintClearCookies()` function needs a full Rule 63 treatment:

**Step 1 — Check before act:**
```js
const hasCookies = await chrome.permissions.contains({ permissions: ['cookies'] });
```

**Step 2 — If not granted, render "Grant Permission" UI** in the `maintCookiesStatus` div:

```
[!] Cookie access not granted.
    This routine needs browser cookie access to clear stuck GAW session tokens.
    [Grant Cookie Access]
```

The "Grant Cookie Access" button calls `chrome.permissions.request({ permissions: ['cookies'] })` and, on success, immediately retries the routine. On denial, it replaces the button with:

```
Permission denied. You can grant it later from this button, or manually
clear cookies via Chrome Settings > Privacy > Cookies.
```

**Step 3 — Fallback behavior when permanently denied:** Surface a link to `chrome://settings/cookies` and an instruction to manually delete `XSRF-TOKEN`, `session`, and `cf_clearance` for `greatawakening.win`. This is the degraded-but-functional path Rule 63 requires.

---

## Summary of Findings

| Rule | Finding | Severity |
|---|---|---|
| 61 — No `unsafe-eval` | Clean — absent from both CSP surfaces | PASS |
| 61 — `unsafe-inline` in `style-src` | Known v10.x debt; 115 inline styles need extraction to popup.css | LOW (known) |
| 61 — `connect-src` xAI gap | xAI URL mentioned in comment but absent from actual CSP value — verify | INVESTIGATE |
| 62 — Optional permissions | No `optional_permissions` declared; `cookies` is always-on despite single-feature use | DEBT |
| 62 — UX explaining why | Cookies button has adequate title text; no `permissions.request()` flows exist to audit | N/A |
| 63 — Denial fallback: cookies | Blunt throw, no "Grant Permission" button, no degraded-mode fallback | VIOLATION |
| 63 — Denial fallback: all others | Storage and alarms are always-on; no runtime denial path exists | N/A |

### Recommended work items (priority order)

1. **(v10.6 — LOW effort, high polish)** Move `cookies` to `optional_permissions`. Add `chrome.permissions.request()` + "Grant Permission" button + fallback instructions in `maintClearCookies()`. Addresses Rules 62 and 63 simultaneously.
2. **(v11.x — medium effort)** Extract all 115 `style="..."` inline attributes from popup.html into popup.css classes. Drop `unsafe-inline` from `style-src`. Achieves a fully strict popup CSP. Track as `CSP-strict-popup` in the v11 milestone.
3. **(immediate — 5 min verification)** Confirm whether any popup.js `fetch()` targets xAI directly or always proxies through the worker. If direct, add the xAI URL to `connect-src`. If always proxied, remove the stale comment reference.

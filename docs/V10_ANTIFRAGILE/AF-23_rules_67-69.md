# AF-23 — Anti-Fragile Audit: Rules 67-69
**GAW ModTools v10.5.1 | AUDIT-ONLY | 2026-05-09**

---

## Scope

Three rules audited against dist artefacts:
`modtools.js`, `popup.js`, `background.js`, `manifest.json`, `popup.html`.

Source of truth: `D:\AI\_PROJECTS\dist\mod-tools dist\`

---

## Rule 67 — No Hardcoded API Keys / Tokens / Secrets

### What was searched

Pattern 1 — raw token shape (32-256 alphanumeric chars as a contiguous literal):

```
[A-Za-z0-9_\-]{32,256}
```

Pattern 2 — assignment of a secret-named variable to a string literal:

```
const\s+\w*(token|secret|key|password)\w*\s*=\s*['"][A-Za-z0-9_\-]{20,}['"]
```

Pattern 3 — base64 blobs (40+ chars with +/= chars):

```
[A-Za-z0-9+/]{40,}={0,2}
```

Pattern 4 — inline assignment with label keywords (`token=`, `key:`, `bearer=`, etc.)

### Findings

**One hit flagged, cleared on inspection:**

`popup.js:2461`
```js
$('firstRunInput').placeholder = 'IKHZK9SRz0s89AxBK017DPn36xlanZXov...';
```

This is a **UI placeholder string** — the trailing `...` is literal (ellipsis truncation), and the surrounding code makes the context unambiguous: it sets the `placeholder` attribute of a password input during the first-run onboarding wizard. The string is never sent over the wire, never read as a credential, and never stored. It exists purely to show the user what token shape to expect when they paste their own value. This is not a hardcoded secret.

**All `const *KEY` matches** (`MAINT_LAST_REPORT_KEY`, `PATTERN_SYNC_KEY`, `__V80_TELEMETRY_KEY`, `NOTE_KEY`, etc.) are `chrome.storage` key names — opaque string identifiers for localStorage namespaces, not credentials.

**manifest.json `"key"` field** is the extension's public RSA key used by Chrome to pin the extension ID across unpacked installs. It is a public key, not a private key or API secret. Its presence in the manifest is correct and required.

**No `webRequest` or `declarativeNetRequest` permissions appear in the manifest** (see Rule 69 below). The absence eliminates any HTTP interception surface.

### Verdict: PASS

Zero hardcoded tokens, secrets, or API keys in any source file. The token lifecycle is correct: the user enters their mod token at first-run, it is stored in `chrome.storage.local`, and retrieved at runtime by the service worker. No credentials are ever baked into the distribution.

---

## Rule 68 — Content Security Policy Reporting

### Current state

`manifest.json` line 47-49:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; base-uri 'self';"
}
```

**No `report-uri` directive is present. CSP violations are silently dropped.**

The CSP itself is strict and correct for MV3: `'self'`-only for scripts and objects, no `'unsafe-inline'`, no `'unsafe-eval'`, no remote origins. AF-21 compliance is already achieved — inline scripts are rejected. However, because there is no reporting endpoint, any CSP violation (injected script from a rogue page, future regression introducing inline code) fails silently with no operator visibility.

### Gap

CSP violations in this extension would be high-signal events: the extension runs exclusively on `greatawakening.win`, the CSP is tight, and any violation means either (a) a bad actor injected a script into the extension's popup, or (b) a developer accidentally introduced an inline handler during a future refactor. Neither should be silent.

### Proposed fix — worker endpoint + CSP directive

**Step 1 — Add `POST /admin/csp-report` to the GAW worker.**

The endpoint accepts the standard browser-sent CSP report body (`application/csp-report`, JSON):

```js
// cloudflare-worker/src/routes/admin.js  (or equivalent router file)
router.post('/admin/csp-report', async (req, env) => {
  // Require lead token — same check as other /admin/* routes
  const auth = req.headers.get('x-lead-token');
  if (!env.LEAD_MOD_TOKEN || auth !== env.LEAD_MOD_TOKEN) {
    return new Response('Unauthorized', { status: 401 });
  }
  const report = await req.json().catch(() => null);
  if (!report) return new Response('Bad Request', { status: 400 });

  // Log to a D1 table or KV for review; minimal schema:
  // INSERT INTO csp_violations (ts, document_uri, violated_directive, blocked_uri, source_file, line_number)
  const row = report['csp-report'] ?? report;
  await env.DB.prepare(
    'INSERT INTO csp_violations (ts, document_uri, violated_directive, blocked_uri) VALUES (?, ?, ?, ?)'
  ).bind(Date.now(), row['document-uri'], row['violated-directive'], row['blocked-uri']).run();

  return new Response(null, { status: 204 });
});
```

**Step 2 — Add `report-uri` to the manifest CSP.**

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; base-uri 'self'; report-uri https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev/admin/csp-report;"
}
```

### Critical edge-case: AF-21 interaction

AF-21 already removed `'unsafe-inline'` from the CSP. This means any existing inline handlers would already be blocked in the current build. When `report-uri` is added, **violations start flowing immediately** against whatever the current page load triggers — not as a new regression, but as previously-silent violations now becoming visible.

The correct landing sequence is:

1. Verify zero inline handlers exist in `popup.html` and that `modtools.js` attaches all handlers via `addEventListener` (no `onclick=`, `onload=`, etc. attributes).
2. Run the extension in a staging build with `report-uri` active; confirm zero CSP reports appear on normal usage.
3. Ship `report-uri` and the worker endpoint together in the same release.

Do **not** ship `report-uri` without first confirming step 1-2. If any inline handler survives, the violation log will flood with false positives on every popup open, masking genuine attacks.

### Verdict: GAP — Actionable

Add `POST /admin/csp-report` worker endpoint + `report-uri` directive. Land together with AF-21 cleanup verification. Priority: medium. Zero operator risk from landing it; high signal gain.

---

## Rule 69 — webRequest / declarativeNetRequest Misuse Audit

### What was searched

Full-text grep across all `.js` and `.json` files for the strings:
- `webRequest`
- `declarativeNetRequest`

**Zero matches found in any file.**

### Manifest permissions (complete list)

```json
"permissions": ["storage", "alarms", "cookies"],
"host_permissions": [
  "https://greatawakening.win/*",
  "https://*.greatawakening.win/*",
  "https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev/*"
]
```

Neither `webRequest` nor `declarativeNetRequest` appears in `permissions`, `optional_permissions`, or anywhere in source code.

### Why this is a strength

`webRequest` grants the extension the ability to observe, block, or modify any HTTP request made by the browser — including requests from other tabs, other extensions, and the browser itself. It is one of the most privacy-sensitive permissions in the MV2/MV3 model and the primary attack surface exploited by malicious extensions (credential harvesting, MITM on API calls, ad injection).

`declarativeNetRequest` is MV3's safer declarative replacement, but still grants network interception capability. Its absence means the extension has no mechanism to intercept traffic outside its declared `host_permissions` scope.

GAW ModTools' network surface is entirely outbound and scoped: the service worker calls `gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev` directly for all API operations. No interception layer is needed and none exists.

### Verdict: PASS — Documented as Strength

The complete absence of `webRequest` and `declarativeNetRequest` is an intentional architectural strength. It should be preserved. Any future PR that adds either permission to the manifest requires explicit justification and security review before merge.

---

## Summary Table

| Rule | Subject | Status | Action Required |
|------|---------|--------|-----------------|
| 67 | Hardcoded secrets in source | PASS | None |
| 68 | CSP `report-uri` directive | GAP | Add worker endpoint + manifest directive, land with AF-21 |
| 69 | webRequest / declarativeNetRequest | PASS (Strength) | None — preserve intentionally |

---

## Files Audited

- `D:\AI\_PROJECTS\dist\mod-tools dist\modtools.js`
- `D:\AI\_PROJECTS\dist\mod-tools dist\popup.js`
- `D:\AI\_PROJECTS\dist\mod-tools dist\background.js`
- `D:\AI\_PROJECTS\dist\mod-tools dist\manifest.json`
- `D:\AI\_PROJECTS\dist\mod-tools dist\popup.html`

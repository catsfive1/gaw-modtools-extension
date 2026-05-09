# AF-24 -- Anti-Fragile Rules 70-72: Identity Auth, Token Encryption, Auto-Logout
**Audit date:** 2026-05-09
**Files inspected:** `modtools.js`, `popup.js`, `background.js` (dist)
**Status:** FINDINGS + PRESCRIPTIONS

---

## Rule 70 -- Use chrome.identity for authenticated flows when possible

### Architectural decision record

**chrome.identity does NOT apply to the current GAW ModTools auth model.**

The extension authenticates moderators against the Cloudflare Worker
(`gaw-mod-proxy`) via a custom invite/rotation token flow:

1. A lead mod provisions a 48-character `cryptoRandomValues`-derived token
   via `provision-mod-token.ps1`, which writes it into the Worker's D1
   `mod_tokens` table.
2. A team mod enters their token once in the popup (`gam_settings.workerModToken`
   / `leadModToken`).
3. Every authenticated call attaches `X-Mod-Token` (or `X-Lead-Token`) and the
   Worker validates against D1.
4. Token rotation is an explicit lead-initiated action, not an OAuth lifecycle.

`chrome.identity` provides OAuth 2.0 flows (Google Sign-In, or any provider
registered in the extension manifest via `oauth2` key). Our worker is not an
OAuth resource server -- it has no `Authorization: Bearer` handler, no token
introspection endpoint, and no JWKS. Wrapping the existing flow with
`chrome.identity.getAuthToken()` would require substantial worker-side changes
for zero user-facing benefit: mods log in once via the popup and are never
prompted again.

**When chrome.identity WOULD apply -- future Discord OAuth:**

If a future version adds "Log in with Discord" to replace or supplement the
manual invite flow, `chrome.identity.launchWebAuthFlow()` is the correct
mechanism. The pattern would be:

```
chrome.identity.launchWebAuthFlow(
  { url: DISCORD_OAUTH_URL, interactive: true },
  (redirectUrl) => { /* parse code from redirectUrl, exchange for token at worker */ }
);
```

The worker would then act as the OAuth relay: validate the Discord access token
via Discord's `/api/users/@me`, mint a GAW mod session token, and return it.
That worker-minted token would still be stored in `gam_settings.workerModToken`
-- chrome.identity handles the browser-half of the flow, not the storage or
subsequent request auth.

**Prescription:** No code changes required for Rule 70 against the current
invite-based flow. Document this ADR in `docs/ARCHITECTURE.md` (or the
maintenance backlog) so future contributors do not attempt a chrome.identity
retrofit unnecessarily. Flag as APPLICABLE on first Discord-OAuth sprint.

---

## Rule 71 -- Encrypt any sensitive data at rest

### Violations found

**CRIT: `workerModToken` and `leadModToken` stored plaintext**

Both tokens are written and read from two locations without any encryption:

| Storage | Key path | Write site | Read site |
|---|---|---|---|
| `chrome.storage.local` | `gam_settings.workerModToken` | `popup.js` (settings save) | `background.js:108-114` (loadSecrets), `modtools.js:19388` (getModToken) |
| `chrome.storage.local` | `gam_settings.leadModToken` | `popup.js` (settings save) | `background.js:108-114` (loadSecrets), `modtools.js:19389` (getLeadToken) |
| `chrome.storage.session` | `gam_settings.workerModToken` | `background.js:118-121` (secretCache mirror) | `background.js:103-104` (session read) |
| `chrome.storage.session` | `gam_settings.leadModToken` | Same | Same |
| RAM (`secretCache`) | `secretCache.workerModToken` | `background.js:84,118` | Every `workerFetch` handler |
| RAM (`secretCache`) | `secretCache.leadModToken` | Same | Same |

`chrome.storage.local` survives browser restarts and is readable by any
code running in the same extension origin. If the extension is ever
compromised (malicious update, supply-chain attack, or a 0-day that lets
a different extension inspect storage), both tokens are immediately exposed.

`SECURITY_REAUDIT_v9.22.md` (NEW-1) additionally documents the now-purged
`gam_auth_backup` IDB that wrote tokens into the **page origin** (greatawakening.win).
The IDB migration guard at `modtools.js:1420-1443` handles that legacy path.
The remaining plaintext exposure in `chrome.storage.local` was flagged as
AF-07 future work and is formally addressed here.

**Keys requiring encryption (exhaustive list):**

| Key | Storage | Sensitivity |
|---|---|---|
| `gam_settings.workerModToken` | `chrome.storage.local`, `chrome.storage.session` | HIGH -- authenticates all Worker calls |
| `gam_settings.leadModToken` | `chrome.storage.local`, `chrome.storage.session` | CRITICAL -- elevated Worker endpoints |

No other `gam_settings` subkeys contain secret material. The remaining keys
(`isLeadMod`, feature flags, UI state) are configuration, not credentials.

### Proposed helper: `gam_crypt.{wrap, unwrap}`

**Key derivation strategy -- generated-on-first-boot:**

`chrome.identity.getProfileUserInfo()` requires the `identity.email` manifest
permission (currently absent) and returns an empty object in incognito. It is
also not available in service-worker context. Using the profile email as key
material would silently fail for ~15% of Chrome installs (Guest mode,
incognito-only use). Do NOT use it as the primary key source.

Preferred approach: generate a random 256-bit key on first install, persist it
to `chrome.storage.local` under `gam_crypt_key` (base64url). This key is itself
plaintext, but it separates the token from any direct string search of storage
and makes bulk extraction materially harder (attacker must find and decode two
separate storage keys). For a stronger guarantee, the key can be derived from a
hardware-backed source if the extension ever targets Chrome OS (where
`chrome.platformKeys` is available) -- that path is out of scope for v10.

**API surface:**

```js
// gam_crypt.js  (background.js or a shared module)
const GAM_CRYPT_KEY_STORAGE = 'gam_crypt_key';

async function _getOrCreateDeviceKey() {
  const stored = await chrome.storage.local.get(GAM_CRYPT_KEY_STORAGE);
  if (stored[GAM_CRYPT_KEY_STORAGE]) {
    const raw = base64urlToBytes(stored[GAM_CRYPT_KEY_STORAGE]);
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('raw', key);
  await chrome.storage.local.set({ [GAM_CRYPT_KEY_STORAGE]: bytesToBase64url(exported) });
  return key;
}

// wrap(plaintext) -> base64url string "iv.ciphertext"
async function wrap(plaintext) {
  const key = await _getOrCreateDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return bytesToBase64url(iv) + '.' + bytesToBase64url(new Uint8Array(ct));
}

// unwrap(ciphertext) -> plaintext string, or '' on failure
async function unwrap(ciphertext) {
  try {
    const [ivB64, ctB64] = ciphertext.split('.');
    if (!ivB64 || !ctB64) return '';
    const key = await _getOrCreateDeviceKey();
    const iv  = base64urlToBytes(ivB64);
    const ct  = base64urlToBytes(ctB64);
    const pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch (_) { return ''; }
}
```

**Integration points:**

- **Write path** (`popup.js` settings save): call `wrap(token)` before writing
  `gam_settings.workerModToken` and `gam_settings.leadModToken` to storage.
- **Read path** (`background.js` `loadSecrets`): call `unwrap()` on the stored
  value before populating `secretCache`. The `secretCache` in RAM holds
  decrypted plaintext -- this is unavoidable and acceptable (RAM is not
  persisted across browser restarts).
- **Migration** (one-shot, on upgrade): detect plaintext values (no `.` separator
  in the stored token), wrap them, and write back. Gate on a `gam_schema_version`
  bump so it runs exactly once.
- **`chrome.storage.session`** mirror in `background.js`: session storage is
  cleared on browser restart and is accessible only to trusted extension contexts,
  so storing decrypted values there (in RAM-equivalent session) is acceptable.
  No need to re-encrypt the session mirror.

**Scope for AF-24 (audit-only):** implementation is a v10.6 task. AF-07 already
flagged this as "future ship Web Crypto subtle." This audit provides the exact
API contract and integration points.

---

## Rule 72 -- Implement automatic logout on suspicious activity

### Current state

**`_consecutive401` counter (modtools.js:19393-19492, 19860-19876):**

The codebase already implements a consecutive-401 guard:

- Counter increments on every 401 from `__legacyWorkerCall` and the relay path.
- At `>= 3` consecutive 401s the code checks storage and either shows the
  `showTokenOnboardingModal('rejected')` or a snack nudge.
- Counter resets on any `2xx`/`3xx` response.

This is a soft nudge, not a logout. The token is not cleared. The modal asks
the user to re-enter their token, but leaves the stale token in place.

**`withCollisionCheck` / viewing-presence (modtools.js:22495-22506):**

The CHUNK 18 collision guard surfaces a "another mod is reviewing this" warning
but has no auth dimension -- it checks mod identity via `getMyModUsername()` and
`rpcCall('modPresenceViewing')`, not the stored token.

**No auto-logout exists today.**

### Defining "suspicious activity"

Three trigger classes, ordered by severity:

**Class A -- Repeated token rejection (existing `_consecutive401` pattern):**

5 consecutive 401s on any authenticated endpoint (not just `/mod/whoami`).
3 is the current threshold; raising to 5 reduces false positives from transient
network issues or CF Worker cold-start rejections that resolve on their own.
Action: clear `gam_settings.workerModToken` from storage AND `secretCache`,
then show the onboarding modal with `reason='auto_logout_401'`.

**Class B -- `/mod/whoami` identity mismatch (collision-style):**

Worker returns a username on `/mod/whoami` that differs from the username
previously confirmed (`v7ModUsernameVerified` or `getMyModUsername()`). This
would indicate the token was re-issued to a different mod without the local
extension knowing. Action: same as Class A.

**Class C -- User-initiated "log out + re-claim" from collision modal:**

When `withCollisionCheck` fires and the user encounters a collision, add a
third button: "Log out + re-claim" alongside "Yes, proceed" / "No, wait".
Clicking it clears the stored token and opens the popup to the invite-claim
flow. This gives mods a friction-free escape hatch when they suspect their
token has been claimed by someone else.

### Prescription: extending the collision guard

```js
// Augment withCollisionCheck (modtools.js:22496) to offer the logout path:
async function withCollisionCheck(kind, id, proceedFn) {
  if (!smOn()) return proceedFn();
  try {
    const r = await rpcCall('modPresenceViewing', { kind, id: String(id), _get: true });
    const me = getMyModUsername();
    if (r && r.ok && r.data && r.data.mod && r.data.mod !== me
        && (Date.now() - (r.data.ts || 0) < TTL.VIEWING_MS)) {
      // Three-option modal: proceed / wait / logout+reclaim
      const choice = await tripleModal(
        r.data.mod + ' is reviewing this right now.',
        'Yes, proceed', 'No, wait', 'Log out + re-claim'
      );
      if (choice === 'logout') {
        await _clearTokenAndReclaim();   // clears storage + opens popup
        return;
      }
      if (!choice) return;  // 'wait'
    }
  } catch (e) {}
  return proceedFn();
}

// Central token-clear helper (new):
async function _clearTokenAndReclaim() {
  try {
    // 1. Wipe from chrome.storage.local
    const stored = await chrome.storage.local.get('gam_settings');
    const s = (stored && stored.gam_settings) || {};
    delete s.workerModToken;
    delete s.leadModToken;
    await chrome.storage.local.set({ gam_settings: s });
    // 2. Wipe from session storage via SW message
    await chrome.runtime.sendMessage({ type: 'clearTokens' });
    // 3. Open popup to invite-claim screen
    chrome.runtime.sendMessage({ type: 'openPopupTokenClaim' });
  } catch (e) {}
}
```

**SW-side `clearTokens` handler (background.js):**

```js
case 'clearTokens':
  secretCache = { workerModToken: '', leadModToken: '' };
  if (chrome.storage && chrome.storage.session) {
    await chrome.storage.session.remove('gam_settings');
  }
  sendResponse({ ok: true });
  break;
```

**Auto-logout on Class A (upgrade `_consecutive401` block):**

```js
// modtools.js -- upgrade the existing >= 3 block to >= 5 + token clear:
if (_consecutive401 >= 5) {
  _consecutive401 = 0;
  try { await _clearTokenAndReclaim(); } catch(e){}
  try { showTokenOnboardingModal('auto_logout_401'); } catch(e){}
}
```

**Auto-logout on Class B (`/mod/whoami` identity mismatch):**

Add a check inside the `__noteWhoami`-adjacent `/mod/whoami` result handler
(modtools.js:~21361-21395):

```js
if (whoamiResult.ok && whoamiResult.data && whoamiResult.data.username) {
  const verified = getSetting('v7ModUsernameVerified', '');
  if (verified && verified !== whoamiResult.data.username) {
    // Identity mismatch -- token belongs to a different mod
    await _clearTokenAndReclaim();
    showTokenOnboardingModal('identity_mismatch');
    return;
  }
}
```

### Summary of open items (for v10.6 implementation sprint)

| # | Rule | Item | Priority |
|---|---|---|---|
| 1 | 71 | Implement `gam_crypt.{wrap,unwrap}` in `background.js` | HIGH |
| 2 | 71 | Write migration: detect plaintext tokens, wrap on upgrade | HIGH |
| 3 | 71 | Add `identity.email` to manifest IF future Discord-OAuth ships | LOW |
| 4 | 72 | Raise consecutive-401 threshold from 3 to 5, add token clear | MEDIUM |
| 5 | 72 | Add Class B identity-mismatch auto-logout on whoami path | MEDIUM |
| 6 | 72 | Extend `withCollisionCheck` with "Log out + re-claim" third option | MEDIUM |
| 7 | 70 | Document chrome.identity ADR in `ARCHITECTURE.md` | LOW |

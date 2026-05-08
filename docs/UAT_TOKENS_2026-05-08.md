# UAT — Token Rotation + Authentication Pipeline (v9.17.0)

**Date:** 2026-05-08
**Surface:** modtools.js + popup.js + background.js + gaw-mod-proxy-v2.js
**Verdict:** core flow correct; 4 real holes, 1 nit, top-5 v11 UX fixes listed.

---

## A) TOKEN LIFECYCLE (mint -> store -> use -> expire -> re-mint)

```
LEAD POPUP                  WORKER                     D1                   MOD BROWSER
----------                  ------                     --                   -----------
[gen invite]
  POST /admin/rotation-     handleAdminRotationInvite  INSERT token_invites
   invite {username}        @3499                      (code_hash, mod, exp)
  requireLeadAuth @591      randomToken(48)            audit: rotation_invite_issued
                            <-- {code, expires_at, ttl}
[lead delivers code via
 invite URL or DM]
                                                                          GAW page load:
                                                                            ?mt_invite=CODE
                                                                          modtools.js IIFE @17913
                                                                          - shape regex 16-128
                                                                          - find header user link
                                                                            (strict + fallback @17960-18000)
                                                                          - window.confirm @18018
                                                                          - chrome.storage.session.set
                                                                            gam_pending_invite @18034
                                                                          - URL stripped
                                                                          - snack "STAGED"
                                                                                v
                                                                          POPUP open
                                                                          __claimInviteClick @1583
                                                                          - read staged code
                                                                          - prompt username @1614
                                                                          - confirm @1626
                                                                          - RPC authClaimInvite @1645
                                                                                v
                            handleModTokenClaimRotation @3701
                            - IP rate limit @3709 (5/60s, KV first)
                            - atomic UPDATE token_invites    UPDATE...RETURNING
                              SET used_at=now WHERE          mod_username
                              code_hash=? AND used_at IS
                              NULL AND expires_at>=now @3734
                            - case-insensitive username @3756
                            - audit token.rotation_claimed
                              FIRST @3777 (PR2-H-4 fix)
                            - UPDATE mod_tokens
                              SET token_hash=newHash,
                              token=NULL @3793
                            <-- {ok, new_token, mod_username}
                                                                          background _persistRotatedToken @1010
                                                                          - secretCache.workerModToken=new
                                                                          - chrome.storage.local.set
                                                                          - read-back verify x3 retries
                                                                          - storage.session mirror
                                                                                v
                                                                          modtools.js init @19412
                                                                          preloadSecrets ->
                                                                          syncSecretsToBackgroundVault ->
                                                                          __validateModAuth @19304
                                                                          fetch /mod/whoami @19313
                                                                                v
                            handleModWhoami @1056
                            lookupModFromToken @976
                            (hash-first then plaintext)
                            <-- {username, is_lead}
                                                                          UI unlocked
                                                                          status bar + lead gate
                                                                          __applyLeadGate @665

EXPIRY:  invite TTL = 72h (ROTATION_INVITE_TTL_MS @3436); unused codes age out via expires_at>=now check.
RE-MINT: lead reissues invite -> mod claims -> atomic UPDATE replaces token_hash -> prior token dies on next /mod/whoami (404 hash, 404 plaintext = 401 -> banner).
```

---

## B) STATE MACHINE

| State | Storage shape | UI shows | User can |
|---|---|---|---|
| **no-token** | `gam_settings.workerModToken=''` | Auth-fail banner reason `no_token`; popup shows Claim/Paste hint @472 | paste invite URL/code; click Claim |
| **staged-invite** | `chrome.storage.session.gam_pending_invite=CODE` | Snack "Invite STAGED" on GAW; popup Claim button @1672 visible | click Claim invite -> username prompt -> mint |
| **staged-token** (v9.9.1 misroute) | `gam_pending_invite_for='__paste_into_token_field__'` | Token input warns "looks like INVITE CODE" @527; Claim button outlined orange @542 | click Claim invite |
| **minting** | none persistent; popup shows `claiming...` @1639 | popup spinner | wait for response |
| **valid** | `gam_settings.workerModToken=PLAIN`, SW vault loaded | full UI, status bar, ModChat; lead gate may unlock | use any feature |
| **expired** (invite >72h) | invite row `expires_at<now` | popup error `invalid` (HTTP 404) @3712 generic | request fresh invite from lead |
| **rotated-out** (someone else claimed first) | local token still set but worker rejects | banner reason `whoami_status` (HTTP 401) @19322 | Force re-hydrate; reclaim |
| **invalidated** (lead reissued + claimed) | local token persists but D1 hash mismatch | banner reason `whoami_status`; persistent until reclaim | Force re-hydrate (won't help); claim new invite |
| **EXT_CONTEXT_INVALIDATED** | runtime severed @17799 | banner reason from this code @19348 ("exception"); rpcCall returns code | hard-refresh page (Ctrl+R) |

---

## C) FAILURE-MODE RECOVERY UX (8 reason codes)

All produced in `__validateModAuth` @19304-19328, all surfaced via `__showAuthFailBanner` @19336.

| reason | UX text @19342-19349 | Recovery action wired? | Verdict |
|---|---|---|---|
| `no_token` | "Open the popup and claim a rotation invite" | Force re-hydrate visible but won't help (no token to hydrate); user must open popup | OK; **nit:** Force re-hydrate label could read "Open popup" instead since hydrate is a no-op here |
| `short_token` | "Stored token is malformed (length N). Re-claim." | Force re-hydrate would re-push the same garbage; wrong action surfaced | **HOLE-D5:** banner suggests re-hydrate but root cause is corrupt storage; need a "Clear & restart" action |
| `fetch_failed` | "Worker unreachable: <err>. Check connectivity, try Force re-hydrate." | Force re-hydrate just retries; correct | OK |
| `no_response` | "No response from /mod/whoami. Try Force re-hydrate." | retry; correct | OK |
| `whoami_status` | "Worker rejected token (HTTP N). May be expired/rotated -- claim fresh invite." | Force re-hydrate runs same fetch -> same 401; doesn't open popup | **HOLE-D2:** retry button doesn't help on 401; should deep-link to popup claim flow |
| `whoami_empty` | "Token accepted but no username. Try Force re-hydrate." | retry covers transient parse blip | OK |
| `exception` | "Auth check threw: <err>. Open DevTools." | Generic; relies on user to console | OK (rare path) |
| `EXT_CONTEXT_INVALIDATED` | NOT a __validateModAuth reason -- comes from `rpcCall` @17803/17811/17831 | Banner shows generic "exception"; v9.5.2 detection only fires inside rpcCall, not init's direct fetch | **HOLE-D1:** init bypass means after extension reload the banner says "exception" not "reload page". `__validateModAuth` uses raw fetch @19313, never sees rpcCall's chrome.runtime probe. Banner reason mapping has no `EXT_CONTEXT_INVALIDATED` case @19340 |

---

## D) SECURITY HOLES (file:line evidence)

**HOLE-S1: Lead-token via ext-id allowlist is wide open.**
`gaw-mod-proxy-v2.js:117-124` — `isAllowedExtensionOrigin` returns `false` when `EXTENSION_ID_ALLOWLIST` env-var is empty (per AGENT_BRIEF: "currently empty"). Fine. **But** the strict-path gate @11714-11722 then falls through to `lookupModFromToken` -> if `is_lead===true`, allows the request. So a stolen mod token with `is_lead=true` (catsfive) bypasses the entire ext-id allowlist for `/admin/*`. Stated tradeoff in v9.10.0 comment, but no rate limit on the fallthrough, no IP correlation, no audit row for "non-extension origin used lead bypass." A leaked lead token = full admin curl access. **Severity: HIGH.** Mitigation: bind a rate limit + always-audit on the `is_lead` fallthrough at @11718.

**HOLE-S2: `claim-rotation` rate limit can be bypassed across IPs.**
`gaw-mod-proxy-v2.js:3666-3699` — IP-hashed bucket, 5/60s. Code-space is 48 chars `[A-Za-z0-9_-]` = ~10^85, brute-force impractical. **But** `randomToken(48)` quality unverified in this read; if it's `crypto.getRandomValues`, fine. If it's `Math.random` somewhere, this collapses. Worth re-grepping. Also: KV is eventually consistent; a multi-colo distributed attacker can briefly exceed 5x cap (acknowledged @3683).

**HOLE-S3: `_persistRotatedToken` can lose the token silently in a SW restart race.**
`background.js:1010-1043` — `secretCache.workerModToken=newPlain` happens BEFORE storage write @1012. If chrome.storage.local fails all 3 retries (`saved=false` returned), caller surfaces the error @1561, BUT secretCache RAM still holds the new token. SW eviction = vault gone, storage = old token (dead post-rotation). Mod is locked out, must re-claim. The audit row exists, but the token is in RAM only. Race window: storage write fails on attempt 1-3. **Severity: MEDIUM.** Mitigation: write storage FIRST then promote to RAM only on verified read-back.

**HOLE-S4: `mt_invite` URL strip happens AFTER staging in the flag-on path.**
`modtools.js:17942` — `cleanUrl()` runs before confirm in flag-on. Good. But the snack/alert path on missing `_me` @18007-18016 returns without staging — but ALSO without cleaning. Re-read: @17942 cleanUrl runs unconditionally early. OK. **Real risk:** the `cleanUrl` regex @17920 leaves a bare `?` in some edge cases (param order mid-query). Cosmetic only — not security.

**HOLE-S5: `__validateModAuth` direct fetch bypasses background's auth-header injection.**
`modtools.js:19313` — fetches `/mod/whoami` with `getModToken()` page-context value, NOT via background relay. If hardening flag is on, every other call routes through SW vault — but this critical gate doesn't. If page storage is poisoned (XSS, but extension content-script CSP blocks most), the gate validates against attacker-supplied value. Comment @19310 admits "we avoid the SW round-trip here for the very first init." **Severity: LOW** (page-storage poisoning out of scope for content-script). But this IS the strongest gate — should be the hardest target.

---

## E) TOP 5 TOKEN-FLOW UX IMPROVEMENTS for v11

1. **Auto-open popup when banner reason is `whoami_status` or `no_token`.** Current Force re-hydrate button is wrong action. Add second button "Open popup & claim" that triggers `chrome.action.openPopup()` via SW (HOLE-D2).

2. **Add `EXT_CONTEXT_INVALIDATED` case to banner switch @19340.** v9.5.2 fixes rpcCall, but init uses raw fetch — context-invalidated state surfaces as generic `exception`. Detect `chrome.runtime` severed at init top of `__validateModAuth` and return that reason explicitly (HOLE-D1).

3. **One-click invite copy from lead UI to "ready to paste in mod popup" string.** Currently lead gens code @3514, must Discord-DM it manually. Lead popup should generate `https://greatawakening.win/?mt_invite=CODE` link plus a copy-button — already implied but not consistently surfaced; verify lead popup actually shows the URL not just the bare code.

4. **Surface "rotated-out" state distinctly from "expired."** Both render as `whoami_status` HTTP 401. Mod sees "may be expired or rotated"; useless. Worker should return `{error, code: "rotated_out"|"never_minted"|"hash_mismatch"}` so the banner can say specifically what happened. Aids lead diagnosis when "PresidentialSeal got bumped — did someone re-claim his code?"

5. **`saveToken` paste-then-probe round-trip (v9.9.1) is two-network-call slow.** @558-587 saves the token, THEN probes whoami, THEN rolls back. Single-call detection: if shape is 32-256 AND user typed in token field, just probe FIRST without storing — if 200, store; if 401, route to claim. Eliminates the rollback path and the brief window where a bad token is in storage. Also covers the documented v9.9.1 footgun more cleanly.

---

**File:line index for follow-up**

| Topic | File | Line |
|---|---|---|
| `__validateModAuth` | modtools.js | 19304 |
| `__showAuthFailBanner` | modtools.js | 19336 |
| `mt_invite` IIFE staging | modtools.js | 17913 |
| header user link selector | modtools.js | 17960-18000 |
| EXT_CONTEXT_INVALIDATED detect | modtools.js | 17799, 17822-17831 |
| `saveToken` (auto-route v9.9.1) | popup.js | 502 |
| `saveTokensSecurely` | popup.js | 397 |
| `__claimInviteClick` | popup.js | 1583 |
| `__applyLeadGate` (v9.6.1/9.6.2) | popup.js | 665 |
| `setTokens` RPC | background.js | 836 |
| `_persistRotatedToken` | background.js | 1010 |
| `modWhoami` RPC | background.js | 1093 |
| `authClaimInvite` RPC | background.js | 1547 |
| `lookupModFromToken` (dual-mode) | gaw-mod-proxy-v2.js | 976 |
| `requireLeadAuth` (v9.6.2) | gaw-mod-proxy-v2.js | 591 |
| `handleModTokenClaimRotation` (atomic) | gaw-mod-proxy-v2.js | 3701 |
| `handleModTokenRotate` | gaw-mod-proxy-v2.js | 3438 |
| `handleAdminRotationInvite` | gaw-mod-proxy-v2.js | 3499 |
| `handleAdminModList` | gaw-mod-proxy-v2.js | 3558 |
| Strict-path gate (v9.10.0) | gaw-mod-proxy-v2.js | 11688-11725 |
| `handleModWhoami` | gaw-mod-proxy-v2.js | 1056 |

Word count: ~960.

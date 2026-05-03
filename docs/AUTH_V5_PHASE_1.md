# Auth v5.0 — Phase 1 (boundary cleanup)

**Status:** shipped in v8.6.0. Phases 2-3 deferred to follow-on sessions.

## What Phase 1 changed

The legacy auth flow had two privileged surfaces in the extension:

1. **Direct token reads in the content script** — `getModToken()` returned the
   plaintext, which then got attached to `fetch` headers in-page.
2. **Generic `workerFetch(path, asLead)`** in the background — content scripts
   asked the background to call any allowlisted endpoint with attached
   secrets. The path was caller-supplied; the policy was a string allowlist.

The v5.0 spec requires explicit named RPCs at the background-script
boundary. Phase 1 introduces the framework and migrates the first call site
(audit-log writes); the existing `workerFetch` keeps working but emits a
deprecation warning per call so the v8.6.x sweep can find every remaining
caller.

## What's in v8.6.0

### Background script (`background.js`)

- New message type: `{ type: 'rpc', name, args }`. Routed through
  `_dispatchRpc(name, args, sender)`.
- `RPC_HANDLERS` map keyed by RPC name. Each entry has:
  - `allowed_callers`: list of caller-context tags (`content`, `popup`).
    Calls from disallowed contexts return `{ ok: false, error: '...refused for caller-context...' }`.
  - `handler(args, ctx)`: the operation. Calls `_rpcWorkerCall(method, path, body, opts)`
    internally — that helper attaches `X-Mod-Token` (and `X-Lead-Token` when
    `opts.asLead`) from the background's secret cache. The path is hard-coded
    in the handler; callers cannot supply paths.
- Token plaintexts that come back from rotation/claim flows
  (`authRotateSelf`, `authClaimInvite`) are persisted directly into the
  vault by the handler. The popup never sees the plaintext on the way back
  — it gets `{ ok, mod_username, rotated: true }` only.

### Content script (`modtools.js`)

- New helper: `rpcCall(name, args)` — wraps `chrome.runtime.sendMessage`
  with the RPC envelope. Same return shape as `workerCall`.
- Audit-log call sites (3) migrated from `workerCall('/audit/log', ...)`
  to `rpcCall('modAuditLog', ...)`.
- Other call sites unchanged — they still use the legacy `workerCall` path,
  which still works. Migration of the rest is mechanical and will land in
  v8.6.x patches without further architectural changes.

### Deprecation visibility

Every call to the legacy `workerFetch` in `background.js` now logs:

```
[v5.0/Phase-1 deprecated] workerFetch path=/audit/log -- migrate to a named rpc handler in background.js (RPC_HANDLERS map)
```

Open DevTools on a GAW page after a moderator action — every line in this
list is a call site to migrate.

## RPC handler catalog (v8.6.0)

| RPC name              | Allowed callers      | Status                                              |
|-----------------------|----------------------|-----------------------------------------------------|
| `modAuditLog`         | content, popup       | Live. Used by the 3 migrated audit-log sites.       |
| `modWhoami`           | content, popup       | Live. Returns `{ username, is_lead }` from token.   |
| `modSearch`           | content, popup       | Live. Wraps `/gaw/search`.                          |
| `modPresencePing`     | content, popup       | Live. Wraps `/presence/ping`.                       |
| `authRotateSelf`      | popup                | Live. Token plaintext stays in background.          |
| `authClaimInvite`     | popup                | Live. Same.                                          |
| `authGetMyDevices`    | popup                | Stub (Phase 3 ships `mod_devices`).                  |
| `authRevokeMyDevice`  | popup                | Stub (501).                                          |
| `adminListMods`       | popup                | Live. Wraps `/admin/mod/list`.                       |
| `adminIssueInvite`    | popup                | Live. Wraps `/admin/mod/rotation-invite`.            |
| `adminBulkInvite`     | popup                | Live. Wraps `/admin/mod/rotation-invite-bulk`.       |
| `adminAuditVerify`    | popup                | Live. Wraps `/admin/audit/verify`.                   |
| `adminDisableMod`     | popup                | Stub (501) — Phase 2 ships `mods.auth_epoch`.        |
| `adminEpochBump`      | popup                | Stub (501) — same.                                   |

## Acceptance criteria — what Phase 1 hits and what it does NOT

| v5.0 acceptance criterion                     | v8.6.0 state                        |
|-----------------------------------------------|-------------------------------------|
| No content-script secrets                     | **Partial.** Framework in place; `_secretsCache` still populated for legacy `workerCall` callers. Full enforcement in v8.6.x as call sites migrate. |
| Instant revoke                                | **Not yet.** Requires Phase 2 (sessions) + Phase 3 (devices). |
| Lead has no root token                        | **Not yet.** `LEAD_MOD_TOKEN` still a single shared secret. Replaced by the step-up flow in Phase 4. |
| Full audit                                    | **Partial.** Existing actions table + Merkle chain works. Dedicated `auth_events` table lands in Phase 5. |

## What's next

- **Phase 2** (next session): short-lived sessions broker. New tables: `mods`,
  `auth_sessions`, `device_refresh_credentials`. Replaces long-lived
  `mod_tokens.token_hash` with a refresh-token + session-token model.
- **Phase 3**: `mod_devices` enrollment + per-browser revocation.
- **Phase 4**: lead step-up (TOTP/passkey) replaces the single shared
  `LEAD_MOD_TOKEN`.
- **Phase 5**: `auth_events` table + risk scoring + family-reuse detection.

## How to verify Phase 1 in v8.6.0

1. Reload the extension at `D:\AI\_PROJECTS\modtools-ext` in `brave://extensions`.
2. Visit a GAW page, open DevTools console.
3. Trigger a mod action that writes an audit row (a ban, a sticky, a note).
4. Look in the console for:
   - **No** `[v5.0/Phase-1 deprecated] workerFetch path=/audit/log` line
     for the audit-log call (it's been migrated to RPC).
   - Other `[v5.0/Phase-1 deprecated]` lines flagging the call sites
     still on the legacy path — that's the work backlog for v8.6.x.

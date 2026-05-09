# BUILDER-DISCORD Report — v10.5.0 Discord DM + AI-DM Patches

Build session: 2026-05-09. Scope: migration 035, 5 worker endpoints, popup roster button, 3 background RPC handlers.

---

## Migration 035 -- discord_dm_log

**Applied: YES**

File: `D:\AI\_PROJECTS\cloudflare-worker\migrations\035_discord_dm_log.sql`

Applied via:
```
npx wrangler d1 execute gaw-audit --remote --file=migrations/035_discord_dm_log.sql
```

Result: 5 queries executed in 2.55ms, 6 rows written. DB now at 56 tables, 11.47 MB.

Table created: `discord_dm_log` with columns: id, ts, kind, recipient_mod, discord_id, channel_id, message_id, payload_summary, ai_drafted, ai_draft_id, approved_by, http_status, error, zip_version, zip_url, expires_at.

Indexes: idx_dmlog_ts, idx_dmlog_mod_kind, idx_dmlog_kind_ts, idx_dmlog_unapproved (partial on ai_drafted=1 AND approved_by IS NULL).

---

## Worker Endpoints Added

File: `D:\AI\_PROJECTS\cloudflare-worker\gaw-mod-proxy-v2.js`

All 4 route cases inserted at lines 12836-12839 (after the existing rotation-invite-bulk case at 12835).

### Helper functions (internal)

| Function | Line | Purpose |
|---|---|---|
| `discordDmUserFull` | 3925 | Wraps `discordDmUser` to return `{ channel_id, message_id }` for dm_log hydration |
| `writeDmLog` | 3932 | Non-fatal INSERT into discord_dm_log; swallows errors |

### Endpoint 1: POST /admin/rotation/dm-all-unrotated

**Handler:** `handleAdminDmAllUnrotated` at line 3959
**Route:** line 12836
**Auth:** `requireLeadAuth`
**dry_run support:** YES — pass `{ dry_run: true }` in body; returns would-be list without minting invites or sending DMs
**include_zip support:** YES — finds latest `dist/extension/v*.zip` in R2, generates 7-day signed URL, appends to DM
**DM log:** writes `discord_dm_log` row per mod (kind='rotation_invite'), including channel_id, message_id, zip_url if applicable
**Audit:** writes `appendAuditAction` (action='token.rotation_dm_all')

Body schema:
```json
{ "include_rotated": false, "include_zip": true, "dry_run": false, "ttl_hours": 72 }
```

### Endpoint 2: POST /admin/dist/push-zip

**Handler:** `handleAdminDistPushZip` at line 4114
**Route:** line 12837
**Auth:** `requireLeadAuth`
**Input:** `multipart/form-data` with fields `version` (text, semver) and `file` (zip binary, max 50 MB)
**R2 key:** `dist/extension/v<version>.zip` in the EVIDENCE bucket
**Audit:** writes `appendAuditAction` (action='dist.push_zip')

### Endpoint 3: POST /admin/discord/dm-mod-with-ai-draft

**Handler:** `handleAdminDiscordDmModWithAiDraft` at line 4165
**Route:** line 12838
**Auth:** `requireLeadAuth`
**AI model:** `BOT_LLAMA` (Llama 3.3-70b) via `env.AI`
**Returns:** `{ nonce, mod_username, kind, drafts: [{tone, body}] }` — 4 draft variations, NO send
**KV cache:** `ai_dm_draft:<nonce>` with 5-min TTL in `env.MOD_KV`
**DM log:** writes row with `ai_drafted=1`, `approved_by=NULL`, `http_status=0` (generation logged, send not yet done)
**Rule 36:** Enforced — no auto-send. Drafts returned to lead for review.

Valid kinds: `onboarding_nudge`, `lapsed_reactivate`, `incident_alert`, `shift_handoff`

### Endpoint 4: POST /admin/discord/dm-mod-send

**Handler:** `handleAdminDiscordDmModSend` at line 4272
**Route:** line 12839
**Auth:** `requireLeadAuth`
**Integrity gate:** if `ai_draft_id` supplied, `body` must exactly match one of the 4 KV-cached drafts (prevents body substitution between review and send)
**Discord send:** via `discordDmUserFull` (returns channel_id + message_id)
**DM log update:** if `ai_draft_id` present, UPDATEs existing row setting `approved_by`, `http_status`, `channel_id`, `message_id`. Otherwise INSERTs new row with `ai_drafted=0`.
**Audit:** writes `appendAuditAction` (action='discord.dm.send', target=recipient mod)

---

## Popup Roster Button

File: `D:\AI\_PROJECTS\modtools-ext\popup.js`

**Button:** `#rosterDmAll` (`data-dm-all-btn` attribute) inserted at line 1764, in the roster panel header immediately after the existing `bulkBtn`. Only in the rotation roster section — no other popup sections touched.

Button text: `📨 DM all (N)` when unrotated mods exist; disabled with `📨 DM all` + opacity 0.5 otherwise.

**Click handler function:** `__dmAllUnrotated` at line 1460.
- Confirmation modal before send.
- Calls `/admin/rotation/dm-all-unrotated` with `include_zip: true`.
- While pending: button shows `Sending...` (disabled).
- On response: button removed, inline result table rendered with per-mod status:
  - Green `✓ DM sent` for ok:true
  - Orange `(no Discord)` + Copy invite button for reason:'no_discord'
  - Red `✗ <error>` for failures

---

## Background RPC Handlers

File: `D:\AI\_PROJECTS\modtools-ext\background.js`

3 new entries appended to `RPC_HANDLERS` object (lines 2208-2257):

| RPC name | Line | Worker endpoint |
|---|---|---|
| `adminRotationDmAllUnrotated` | 2208 | POST /admin/rotation/dm-all-unrotated |
| `adminDiscordDmModWithAiDraft` | 2223 | POST /admin/discord/dm-mod-with-ai-draft |
| `adminDiscordDmModSend` | 2240 | POST /admin/discord/dm-mod-send |

All three: `allowed_callers: [RPC_CALLER_POPUP]`, dispatched with `asLead: true`.

---

## Parse Checks

All three files pass `node --check`:

- `gaw-mod-proxy-v2.js` — PARSE OK
- `popup.js` — PARSE OK
- `background.js` — PARSE OK

---

## Smoke Probe — dry_run

**Status: pending deploy.** Worker not yet deployed (BUILDER-WORKER owns the deploy step).

Post-deploy smoke probe command:
```bash
curl -s -X POST https://gaw-mod-proxy.workers.dev/admin/rotation/dm-all-unrotated \
  -H "Content-Type: application/json" \
  -H "x-lead-token: $GAW_LEAD_TOKEN" \
  -d '{"dry_run": true}' | jq .
```

Expected response shape:
```json
{ "ok": true, "sent": N, "skipped_no_discord": M, "errors": 0, "dry_run": true, "results": [...] }
```

With `dry_run: true`, no invites are minted and no Discord API calls are made. Safe to run immediately after deploy.

---

## WORKER_VERSION Coordination Note

**WORKER_VERSION is already `9.5.0` (line 54).** BUILDER-WORKER set this. BUILDER-DISCORD did NOT bump it (would have created a merge conflict). The spec said "set it to 9.5.0" — it's already there. BUILDER-WORKER's deploy at the end of its run picks up both patch sets in the single `9.5.0` deploy.

---

## Constraints Check

- [x] DO NOT deploy — left for BUILDER-WORKER
- [x] BUILDER-POPUP surfaces not touched (collapsibles, token reorg, lead 4-tile, multi-lead UI, empty states, proactive notices — zero edits)
- [x] AI-drafted DMs require lead approval before send (Rule 36 enforced via nonce integrity gate)
- [x] All DM delivery logged to discord_dm_log (nothing opaque)
- [x] No full message bodies logged — only payload_summary (first 80 chars or label)
- [x] `/admin/rotation/dm-all-unrotated` validates discord_id via bot_mods join (no arbitrary Discord ID DMs)
- [x] `/admin/discord/dm-mod-with-ai-draft` and `/admin/discord/dm-mod-send` both validate discord_id against active bot_mods row

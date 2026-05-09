# Discord Automation 1 -- Webhook DM Rotation

Version target: V10. Lead-only. ~14 mods.

---

## A. SCHEMA ADDITIONS

**Critical finding:** Two separate tables already exist and must be linked.

- `mod_tokens` -- auth table (mod_username, token_hash, rotated_at, is_lead). **No discord_id column.**
- `bot_mods` -- Discord bot allowlist (discord_id PK, gaw_username, role, revoked_at). Already has discord_id.

The join key between the two is `gaw_username`. No migration is needed to add a new column -- the link already exists via `bot_mods.gaw_username = mod_tokens.mod_username`.

Migration 032 adds nothing to the schema. It only needs to enforce that `bot_mods.gaw_username` is indexed (it is not currently indexed), which makes the DM-all join fast:

```sql
-- migrations/032_bot_mods_gaw_index.sql
CREATE INDEX IF NOT EXISTS idx_bot_mods_gaw_username ON bot_mods(gaw_username);
```

If a mod has a `mod_tokens` row but no `bot_mods` row, they have no Discord ID linked -- they fall into the fallback path (section G).

---

## B. SELF-REGISTER FLOW

Mods who already have a `bot_mods` row (registered via `/gm register` or `/gm addmod`) require no action -- their `discord_id` is already on file.

For mods not yet in `bot_mods`, the lead uses the existing `/gm addmod` slash command which calls `processAddMod` and writes to `bot_mods`. That is the canonical registration path. No new slash command is needed.

**If a mod is in `mod_tokens` but not `bot_mods`:** lead uses `/gm addmod discord_id:<snowflake> gaw_username:<name> role:mod` -- the existing command. The worker already validates snowflake format and writes the row.

No new slash command is required for V10 ship. The fallback path (section G) covers the gap at DM time.

---

## C. WORKER ENDPOINT

**Route:** `POST /admin/rotation/dm-all-unrotated`

**Auth:** `requireLeadAuth` (same as all `/admin/` routes).

**Request body:**
```json
{
  "include_rotated": false,
  "ttl_hours": 72
}
```

`include_rotated` defaults false (only DMs mods whose `rotated_at IS NULL`). `ttl_hours` defaults 72.

**Logic:**
1. JOIN `mod_tokens` + `bot_mods` ON `mod_username = gaw_username` WHERE `mod_tokens.is_lead = 0`.
2. If `include_rotated = false`, add `AND mod_tokens.rotated_at IS NULL`.
3. For each row that has a non-null `bot_mods.discord_id`:
   a. Call existing `handleAdminRotationInvite` logic inline (mint code, write `token_invites`).
   b. Call `discordDmUser` (already exists in worker at line 6716) with templated message.
   c. Record per-mod result: `{ username, discord_id, ok, invite_code, dm_channel_id, error }`.
4. For each row with NULL `discord_id`: record as `{ username, ok: false, reason: 'no_discord' }`.
5. Return full result table + summary counts.

**Response shape:**
```json
{
  "ok": true,
  "sent": 11,
  "skipped_no_discord": 2,
  "errors": 1,
  "results": [
    {
      "username": "PatriotMod1",
      "discord_id": "123456789012345678",
      "ok": true,
      "invite_expires_at": 1715472000000
    },
    {
      "username": "SilentMod",
      "discord_id": null,
      "ok": false,
      "reason": "no_discord"
    },
    {
      "username": "OfflineMod3",
      "discord_id": "987654321098765432",
      "ok": false,
      "error": "discord api 403"
    }
  ]
}
```

---

## D. DISCORD API CALLS

The worker already has `discordDmUser` (line 6716) which does the exact two-step required. Reuse it directly -- do not reimplement.

**Step 1 -- Open DM channel:**
```
POST https://discord.com/api/v10/users/@me/channels
Authorization: Bot {DISCORD_BOT_TOKEN}
Content-Type: application/json

{ "recipient_id": "123456789012345678" }
```
Response: `{ "id": "9876543210987654321", "type": 1, ... }` -- `id` is the DM channel snowflake.

**Step 2 -- Send message to DM channel:**
```
POST https://discord.com/api/v10/channels/9876543210987654321/messages
Authorization: Bot {DISCORD_BOT_TOKEN}
Content-Type: application/json

{
  "content": "Hi PatriotMod1, your GAW ModTools rotation invite..."
}
```

**Error handling (per-mod, non-fatal):**
- `403 Forbidden` -- bot cannot DM this user (privacy settings). Record error, continue to next mod.
- `404 Not Found` -- discord_id is stale/invalid. Record error, continue.
- `429 Too Many Requests` -- respect `retry_after` from response body; sleep and retry once. If second attempt also 429, record error and continue.
- Any other non-2xx -- record `{ ok: false, error: "discord api <status>" }`, continue.

Per-mod failures are **non-fatal**: the endpoint completes all mods and reports failures in the result table. Lead sees exactly which mods need manual follow-up.

**Rate limiting note:** Discord allows ~5 DM channel opens/second. With 14 mods, no explicit delay is needed. If the roster ever grows past ~50, add a 200ms sleep between calls.

---

## E. TEMPLATE

```
Hi {mod_username},

Your GAW ModTools token rotation invite is ready.

Claim link (expires in {ttl_hours}h -- single use):
https://greatawakening.win/?mt_invite={invite_code}

What this does: replaces your current mod token with a fresh one
that only you know. The lead will not be able to see your new token.

If the link doesn't work, paste this code manually at the GAW
ModTools extension popup -> "Claim rotation invite":
{invite_code}

-- GAW Mod Team
```

Placeholders resolved server-side before sending. No markdown formatting in the message body -- Discord DMs render it inconsistently on mobile. Plain text is reliable.

**ZIP attachment note (for agent #2 coordination):** The attachment delivery is a separate concern. The DM message body above is self-contained and sent as a plain `content` string. Agent #2's ZIP attachment is added as a `multipart/form-data` upload to the same channel after the text message lands, using the channel ID returned from Step 1. The DM channel ID is included in the per-mod result row so agent #2 can post to it without re-opening the channel.

---

## F. POPUP UI

The existing rotation roster panel (`__issueBulkFromRoster` in popup.js line 952) already has a "Issue all unrotated" button. V10 adds a second button: **"DM all unrotated"** that calls the new endpoint instead of the existing bulk-invite endpoint.

**Button placement:** In the roster panel header row, alongside the existing `bulkBtn`. Only visible to lead (the roster panel itself is already lead-gated).

**Button behavior:**
1. Click -> confirmation modal: "This will DM {N} mods their rotation invite via Discord. Mods without a linked Discord account will be skipped. Proceed?"
2. On confirm -> `POST /admin/rotation/dm-all-unrotated`.
3. While pending -> button shows "Sending..." (disabled).
4. On response -> replace button area with inline status table.

**Status table columns:** Mod Username | Discord | Status | Action

**Status cell values:**
- Green checkmark + "DM sent" -- `ok: true`
- Yellow warning + "No Discord linked -- Copy invite" + copy button -- `reason: 'no_discord'`
- Red X + error string -- `ok: false` with error

The copy button for no-Discord mods copies the invite URL to clipboard (same format as the existing `__dmTemplate` function output).

**Popup JS diff summary** (exact lines follow in section H):
- `__issueBulkFromRoster`: unchanged.
- New function `__dmAllUnrotated(panel, tokens)` -- mirrors `__issueBulkFromRoster` structure; calls new endpoint; renders status table.
- Roster panel builder: add `dmAllBtn` element adjacent to `bulkBtn`.

---

## G. FALLBACK PATH

Mods with NULL `discord_id` (in `bot_mods`) or no `bot_mods` row at all are surfaced in the result as `reason: 'no_discord'`. The popup renders them with:

```
PatriotMod7   (no Discord linked)   [Copy invite link]
```

The "Copy invite link" button mints the invite inline (same call as the per-row "Issue" button already in the roster) and copies the full claim URL to clipboard. Lead pastes it to the mod via any channel they have -- GAW PM, Signal, whatever.

This path requires zero extra work from the lead for mods who are linked; it degrades gracefully to the existing manual flow for those who are not.

**Lead action to link a mod:** `/gm addmod discord_id:<snowflake> gaw_username:<username> role:mod` in any channel the bot is in. One command; the DM-all will pick them up on the next run.

---

## H. SHIP-TONIGHT MINIMAL PATCH

Three files touched. Zero breaking changes to existing routes.

### 1. Migration (new file)

**File:** `D:\AI\_PROJECTS\cloudflare-worker\migrations\032_bot_mods_gaw_index.sql`

```sql
-- Migration 032: index bot_mods.gaw_username for DM-all join performance
CREATE INDEX IF NOT EXISTS idx_bot_mods_gaw_username ON bot_mods(gaw_username);
```

Apply:
```
npx wrangler d1 execute gaw-audit --remote --file=migrations/032_bot_mods_gaw_index.sql
```

### 2. Worker (one new function + one route case)

**File:** `D:\AI\_PROJECTS\cloudflare-worker\gaw-mod-proxy-v2.js`

**Insert after line 3660** (end of `handleAdminRotationInviteBulk`):

```js
// v10.0.0: DM each unrotated mod their rotation invite via Discord DM.
// Joins mod_tokens + bot_mods on gaw_username to get discord_id.
// Per-mod failures are non-fatal; full result table returned to popup.
async function handleAdminDmAllUnrotated(request, env) {
  const lead = await requireLeadAuth(request, env); if (lead) return lead;
  if (!env.AUDIT_DB) return jsonResponse({ ok: false, error: 'D1 not bound' }, 503);
  if (!env.DISCORD_BOT_TOKEN) return jsonResponse({ ok: false, error: 'DISCORD_BOT_TOKEN not set' }, 503);

  let body = {};
  try { body = await request.json(); } catch (_) {}
  const includeRotated = !!body.include_rotated;
  const ttlHours = Math.min(Math.max(parseInt(body.ttl_hours || '72', 10), 1), 168);
  const now = Date.now();
  const expiresAt = now + ttlHours * 3_600_000;

  // Join: mod_tokens LEFT JOIN bot_mods ON gaw_username = mod_username
  let sql = `
    SELECT m.mod_username, m.is_lead, m.rotated_at,
           b.discord_id
      FROM mod_tokens m
      LEFT JOIN bot_mods b ON b.gaw_username = m.mod_username AND b.revoked_at IS NULL
     WHERE m.is_lead = 0
  `;
  if (!includeRotated) sql += ' AND m.rotated_at IS NULL';
  sql += ' ORDER BY m.mod_username COLLATE NOCASE';

  let targets;
  try {
    const rs = await env.AUDIT_DB.prepare(sql).all();
    targets = (rs && rs.results) || [];
  } catch (e) {
    return safeError(e, 'dm_all_unrotated_query_failed');
  }

  const results = [];
  let sent = 0, skippedNoDiscord = 0, errors = 0;

  for (const t of targets) {
    if (!t.discord_id) {
      skippedNoDiscord++;
      results.push({ username: t.mod_username, discord_id: null, ok: false, reason: 'no_discord' });
      continue;
    }

    // Mint invite
    const code = randomToken(48);
    const codeHash = await sha256Hex(code);
    try {
      await env.AUDIT_DB.prepare(
        `INSERT INTO token_invites (code_hash, mod_username, created_at, expires_at, created_by)
         VALUES (?, ?, ?, ?, 'lead-dm')`
      ).bind(codeHash, t.mod_username, now, expiresAt).run();
    } catch (e) {
      errors++;
      results.push({ username: t.mod_username, discord_id: t.discord_id, ok: false, error: 'invite_mint_failed: ' + String(e && e.message || e) });
      continue;
    }

    const claimUrl = `https://greatawakening.win/?mt_invite=${code}`;
    const msg = [
      `Hi ${t.mod_username},`,
      '',
      `Your GAW ModTools token rotation invite is ready.`,
      '',
      `Claim link (expires in ${ttlHours}h -- single use):`,
      claimUrl,
      '',
      `What this does: replaces your current mod token with a fresh one that only you know. The lead will not be able to see your new token.`,
      '',
      `If the link doesn't work, paste this code at the ModTools popup -> "Claim rotation invite":`,
      code,
      '',
      `-- GAW Mod Team`,
    ].join('\n');

    try {
      const dmResult = await discordDmUser(env, t.discord_id, { content: msg });
      sent++;
      results.push({
        username: t.mod_username,
        discord_id: t.discord_id,
        ok: true,
        invite_expires_at: expiresAt,
        dm_channel_id: dmResult && dmResult.channel_id ? dmResult.channel_id : null
      });
    } catch (e) {
      errors++;
      results.push({ username: t.mod_username, discord_id: t.discord_id, ok: false, error: String(e && e.message || e).slice(0, 200) });
    }
  }

  try {
    await appendAuditAction(env, {
      ts: new Date().toISOString(), mod: 'lead',
      action: 'token.rotation_dm_all',
      target_user: '',
      details: JSON.stringify({ sent, skipped_no_discord: skippedNoDiscord, errors, include_rotated: includeRotated }),
      page_url: '', is_test: 0
    });
  } catch (_) {}

  return jsonResponse({ ok: true, sent, skipped_no_discord: skippedNoDiscord, errors, results });
}
```

**Add route case** in the URL router (around line 11854, after `rotation-invite-bulk` case):

```js
case '/admin/rotation/dm-all-unrotated': return await handleAdminDmAllUnrotated(request, env);
```

### 3. Popup JS (one new function + two lines in roster builder)

**File:** `D:\AI\_PROJECTS\modtools-ext\popup.js`

**Insert after `__issueBulkFromRoster` (around line 950):**

```js
async function __dmAllUnrotated(panel, tokens) {
  const unrotated = tokens.filter(m => !m.rotated_at && !m.is_lead);
  const ok = await __popupConfirm({
    title: 'DM rotation invites to Discord?',
    body: `This will DM ${unrotated.length} unrotated mod(s) their rotation invite via Discord. ` +
          'Mods without a linked Discord account will be listed for manual copy. Proceed?',
    okLabel: 'Send DMs',
    cancelLabel: 'Cancel'
  });
  if (!ok) return;

  const btn = panel.querySelector('[data-dm-all-btn]');
  if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }

  let data;
  try {
    const resp = await __popupPost('/admin/rotation/dm-all-unrotated', {});
    data = await resp.json();
  } catch (e) {
    if (btn) { btn.textContent = 'Error -- see console'; btn.disabled = false; }
    console.error('[dm-all-unrotated]', e);
    return;
  }

  // Replace button area with result table
  const container = btn ? btn.parentElement : panel;
  if (btn) btn.remove();

  const summary = document.createElement('div');
  summary.style.cssText = 'font-size:11px;color:#888;margin:4px 0 6px';
  summary.textContent = `Sent: ${data.sent} | No Discord: ${data.skipped_no_discord} | Errors: ${data.errors}`;
  container.appendChild(summary);

  for (const r of (data.results || [])) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0;font-size:11px';

    const name = document.createElement('span');
    name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#ccc';
    name.textContent = r.username;

    const status = document.createElement('span');
    if (r.ok) {
      status.style.color = '#4caf50';
      status.textContent = 'DM sent';
    } else if (r.reason === 'no_discord') {
      status.style.color = '#ffa726';
      status.textContent = '(no Discord)';
      // Copy-invite fallback button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'pop-btn pop-btn-ghost';
      copyBtn.style.cssText = 'font-size:10px;padding:2px 6px';
      copyBtn.textContent = 'Copy invite';
      copyBtn.addEventListener('click', async () => {
        // Issue a fresh invite for this mod and copy it
        try {
          const ir = await __popupPost('/admin/mod/rotation-invite', { mod_username: r.username });
          const id = await ir.json();
          if (id.ok && id.code) {
            await navigator.clipboard.writeText(`https://greatawakening.win/?mt_invite=${id.code}`);
            copyBtn.textContent = 'Copied!';
          }
        } catch (_) { copyBtn.textContent = 'Error'; }
      });
      row.appendChild(copyBtn);
    } else {
      status.style.color = '#f44336';
      status.textContent = String(r.error || 'failed').slice(0, 40);
    }
    row.appendChild(name);
    row.appendChild(status);
    container.appendChild(row);
  }
}
```

**In the roster panel builder** (around line 1148, where `bulkBtn` is added):

```js
// After bulkBtn is constructed and appended, add dmAllBtn:
const dmAllBtn = document.createElement('button');
dmAllBtn.className = 'pop-btn pop-btn-ghost';
dmAllBtn.setAttribute('data-dm-all-btn', '');
dmAllBtn.style.cssText = 'font-size:11px;padding:4px 10px;flex-shrink:0';
if (unrotatedNonLead.length > 0) {
  dmAllBtn.textContent = 'DM all (' + unrotatedNonLead.length + ')';
  dmAllBtn.addEventListener('click', () => __dmAllUnrotated(panel, mods));
} else {
  dmAllBtn.textContent = 'DM all';
  dmAllBtn.disabled = true;
}
headerLeft.appendChild(dmAllBtn);  // appended right after bulkBtn
```

---

## Wiring summary

| What | Where | Status |
|---|---|---|
| `idx_bot_mods_gaw_username` index | migration 032 | New -- 1-liner |
| `handleAdminDmAllUnrotated` | gaw-mod-proxy-v2.js after line 3660 | New function |
| Route `/admin/rotation/dm-all-unrotated` | Router switch around line 11854 | New case |
| `__dmAllUnrotated` + `dmAllBtn` | popup.js after `__issueBulkFromRoster` | New function + 8 lines in builder |
| `discordDmUser` helper | Already exists at line 6716 | No change needed |
| `DISCORD_BOT_TOKEN` env var | Already set in CF | No change needed |

Ship sequence: apply migration, deploy worker, reload extension.

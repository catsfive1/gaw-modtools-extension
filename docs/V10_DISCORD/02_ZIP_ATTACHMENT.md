# Discord Automation 2 -- ZIP Attachment

## A. CHOSEN OPTION + DEFENSE

**Option 1: Worker stages ZIP in R2 (EVIDENCE bucket) and DMs a signed, time-limited R2 URL.**

Option 2 (multipart Discord upload) is rejected for three reasons:
1. Workers are CPU-time-capped. Fetching a GitHub release ZIP (~400 KB), holding it in memory, then chunking it into a `multipart/form-data` body to Discord eats significant CPU time per rotation -- unpredictably more if Discord is slow on the receive end. A CF Worker that exceeds 50 ms CPU time on the free plan (or even on paid) is a liability that silently fails mods.
2. No GitHub release asset exists. The ZIP lives locally at `D:\AI\_PROJECTS\dist\gaw-modtools-chrome-store-v<ver>.zip`. Getting it to GitHub Releases requires a manual publish step per release -- that is meatbag work Option 1 eliminates.
3. Discord's attachment DM path requires multipart -- the existing `discordApi` helper sends JSON only. Wiring multipart into the Worker is a meaningful patch with its own failure modes; R2 is already bound and working.

Option 3 (R2 temp store with lifecycle) is what this document describes -- Option 1 and 3 are the same thing. "Option 1" in the brief equates to pre-generating a signed URL, which is R2's native path.

Option 4 (lead uploads URL manually) is acceptable as a fallback but leaves the lead as the bottleneck every release. Option 1 eliminates that.

**The stack: build script writes ZIP to R2 on every build. Rotation trigger reads the live object, generates a signed URL (7-day expiry), embeds it in the DM. Mod clicks, downloads. Zero lead friction after initial wiring.**

---

## B. UPLOAD / SOURCE PATH

The ZIP already exists at `D:\AI\_PROJECTS\dist\gaw-modtools-chrome-store-v<ver>.zip` after `build-zip.ps1` runs. The build script emits the version, path, and SHA-256 in its summary log.

The build script needs one addition at the tail of its success block: upload the fresh ZIP to the `EVIDENCE` R2 bucket under a canonical key:

```
dist/extension/<version>/gaw-modtools-chrome-store-v<version>.zip
```

Upload happens via a new PowerShell step in `build-zip.ps1` that calls the worker's existing `/evidence/upload` endpoint using the lead's token. The worker already enforces the path-prefix rule (`evidence/<mod_username>/...`). The lead's token will produce a key like:

```
evidence/lead/dist/extension/v10.2.0/gaw-modtools-chrome-store-v10.2.0.zip
```

A simpler alternative that avoids the `/evidence/upload` auth constraints: add a worker-internal R2 put directly via a new **lead-only endpoint** (`POST /admin/dist/push-zip`). This endpoint:
- Validates `x-lead-token`
- Accepts a `multipart/form-data` body with the ZIP bytes + version string
- Writes to key `dist/extension/<version>.zip` in the `EVIDENCE` bucket
- Returns the R2 object metadata (key, size, etag)

This is the recommended path because it keeps the ZIP namespace separate from evidence objects and avoids the `evidence/<username>` prefix enforcement.

The build script calls `Invoke-RestMethod` to `POST /admin/dist/push-zip` at the end of the success block, passing the ZIP file bytes and version. One new endpoint, ~30 lines of worker code.

---

## C. DISCORD MULTIPART OR LINK

**Link-based DM, not a file attachment.**

The existing `discordDmUser` helper in `gaw-mod-proxy-v2.js` already works:

```js
async function discordDmUser(env, userId, payload) {
  const dm = await discordApi(env, 'POST', '/users/@me/channels', { recipient_id: userId });
  return discordApi(env, 'POST', `/channels/${dm.id}/messages`, payload);
}
```

The rotation DM payload adds a signed R2 URL to the existing invite message:

```js
const signedUrl = await env.EVIDENCE.createSignedUrl(
  `dist/extension/${version}.zip`,
  { expiresIn: 7 * 24 * 3600 }   // 7-day TTL
);

await discordDmUser(env, mod.discord_id, {
  content: [
    `**GAW ModTools v${version} -- your rotation invite**`,
    ``,
    `Invite code: \`${plaintextCode}\``,
    `Extension ZIP (expires in 7 days): ${signedUrl}`,
    ``,
    `Paste the invite code into the **Claim** button in your popup, then install the ZIP.`
  ].join('\n')
});
```

`env.EVIDENCE.createSignedUrl()` is the standard Cloudflare R2 Workers API method. It returns a pre-signed HTTPS URL that works without any auth header -- the mod just clicks it in Discord and the browser downloads the file.

Note: R2 `createSignedUrl` is only available when the bucket has **no public access** configured (default). If the bucket ever gets a public domain, switch to constructing `https://<public-domain>/dist/extension/<version>.zip` directly instead.

---

## D. VERSION TRACKING

D1 (`AUDIT_DB`) gets one row per ZIP delivery. Extend or reuse the `token_invites` table or create a new `dist_deliveries` table:

```sql
CREATE TABLE IF NOT EXISTS dist_deliveries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mod_username TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  version      TEXT NOT NULL,          -- e.g. '10.2.0'
  r2_key       TEXT NOT NULL,          -- 'dist/extension/v10.2.0.zip'
  signed_url_expires_at INTEGER NOT NULL,  -- unix ts
  sent_at      INTEGER NOT NULL,
  rotation_invite_id INTEGER,          -- FK to token_invites.id if paired
  claimed_at   INTEGER                 -- NULL until mod claims their token
);
```

The worker writes this row in the same transaction block as the rotation invite insert -- so the delivery record exists before the DM fires. If the DM fails (Discord API error), the row still exists and the lead can re-trigger the DM without re-uploading to R2.

Query to see who has/hasn't claimed their token post-rotation:

```sql
SELECT d.mod_username, d.version, d.sent_at, d.claimed_at
FROM dist_deliveries d
WHERE d.version = '10.2.0'
ORDER BY d.mod_username;
```

---

## E. EXPIRY / CLEANUP

**Signed URL TTL: 7 days.** Long enough that a mod who ignores Discord for a weekend still gets the file. Short enough that a leaked URL is useless after the rotation cycle closes.

**R2 object retention: 90 days, then lifecycle-delete.** The bucket already exists (`gaw-mod-evidence`). Add a lifecycle rule in the CF dashboard:

- Prefix: `dist/extension/`
- Action: Delete after 90 days

This keeps the two most recent release ZIPs alive (typical release cadence is monthly), and auto-cleans older ones without any worker logic.

No R2 object delete is needed at URL expiry -- the signed URL simply stops working. The object persists until the lifecycle rule fires.

If a mod requests the ZIP after their URL expires (missed the window), the lead re-triggers via a new `POST /admin/dist/resend-zip` endpoint that generates a fresh signed URL from the existing R2 object (no re-upload needed) and re-DMs the mod.

---

## F. SHIP-TONIGHT MINIMAL PATCH

Three file changes:

**1. `gaw-mod-proxy-v2.js` -- ~60 lines**

Add `POST /admin/dist/push-zip`:
- Validate lead token (`x-lead-token`)
- Parse `multipart/form-data` for `version` (text field) and `file` (binary field)
- Write to `env.EVIDENCE` at key `dist/extension/v<version>.zip`
- Return `{ ok: true, key, size, etag }`

Modify the rotation-invite send path (wherever the existing invite DM fires -- around line 7736):
- After writing to `token_invites`, call `env.EVIDENCE.createSignedUrl('dist/extension/v<version>.zip', { expiresIn: 604800 })`
- Append the signed URL to the DM content string
- Insert a `dist_deliveries` row

**2. `build-zip.ps1` -- ~15 lines appended to success block**

After the current summary log block, add:
```powershell
# Push ZIP to R2 via worker
$workerUrl = 'https://gaw-mod-proxy.workers.dev'
$leadToken = $env:GAW_LEAD_TOKEN   # set as system env var -- not in script
if ($leadToken) {
  $form = [System.Net.Http.MultipartFormDataContent]::new()
  $form.Add([System.Net.Http.StringContent]::new($version), 'version')
  $fileBytes = [System.IO.File]::ReadAllBytes($outZip)
  $fileContent = [System.Net.Http.ByteArrayContent]::new($fileBytes)
  $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new('application/zip')
  $form.Add($fileContent, 'file', (Split-Path $outZip -Leaf))
  $httpClient = [System.Net.Http.HttpClient]::new()
  $httpClient.DefaultRequestHeaders.Add('x-lead-token', $leadToken)
  $resp = $httpClient.PostAsync("$workerUrl/admin/dist/push-zip", $form).Result
  $body = $resp.Content.ReadAsStringAsync().Result
  Log "R2 push: HTTP $($resp.StatusCode.value__) -- $body" $(if ($resp.IsSuccessStatusCode) { 'Green' } else { 'Yellow' })
} else {
  Log 'GAW_LEAD_TOKEN env var not set -- skipping R2 push' 'Yellow'
}
```

This is graceful-degrade: if the env var is absent, the build still succeeds and the ZIP sits locally. The lead can push manually later.

**3. D1 migration -- 1 SQL file**

`migrations/011_dist_deliveries.sql`:
```sql
CREATE TABLE IF NOT EXISTS dist_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mod_username TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  version TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  signed_url_expires_at INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  rotation_invite_id INTEGER,
  claimed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_dist_deliveries_version ON dist_deliveries(version);
CREATE INDEX IF NOT EXISTS idx_dist_deliveries_mod ON dist_deliveries(mod_username);
```

Run: `npx wrangler d1 execute gaw-audit --remote --file=migrations/011_dist_deliveries.sql`

**Total worker lines added: ~60. Build script lines added: ~20. One migration. No new bindings, no new secrets (R2 already bound, lead token already a secret).**

---

## G. FAILURE PATHS

**G1 -- Mod's Discord DMs are closed (common for privacy-conscious users)**

`discordDmUser` returns a Discord API error `50007: Cannot send messages to this user`. The worker catches this, logs it, marks the `dist_deliveries` row with `dm_failed = 1`, and returns an error to the rotation endpoint caller. The lead sees the failure in the rotation audit log and can DM the mod manually or ask them to open their DMs temporarily.

Mitigation: add a check at mod registration time -- attempt a test DM, flag accounts that fail. The `/admin/mod/roster` endpoint could expose a `dm_enabled` column.

**G2 -- ZIP not yet in R2 when rotation fires**

`env.EVIDENCE.get('dist/extension/v<version>.zip')` returns null. Worker returns `{ ok: false, error: 'zip_not_staged', hint: 'Run build-zip.ps1 first' }`. The rotation invite still issues (it does not block on the ZIP), but the DM omits the download URL and instead says: `"ZIP not yet available -- lead will DM separately."` The `dist_deliveries` row is written with `r2_key = null` so the gap is visible.

**G3 -- Signed URL expires before mod downloads**

7 days covers normal rotation windows. If a mod misses it, they hit a 403 on the R2 signed URL. The lead uses `POST /admin/dist/resend-zip` to generate a fresh URL from the existing R2 object and re-DM the mod. No re-upload required.

**G4 -- ZIP size grows beyond 25 MB Discord DM limit**

Not applicable to the link approach -- the URL is just text. Only relevant if someone switches to multipart upload. Current ZIP is 386 KB; a 64x growth before this matters. Log a warning in the build script if ZIP exceeds 20 MB.

**G5 -- R2 write fails during build**

`build-zip.ps1` logs the failure as a warning (not a hard failure) -- the local ZIP is still valid. The rotation automation gracefully omits the download link (G2 path). Build exits 0 with a yellow warning. Lead is informed via the clipboard log.

**G6 -- `createSignedUrl` not available (bucket public access enabled)**

If the bucket ever gets a public R2 domain attached, `createSignedUrl` throws. Guard: wrap in try/catch, fall back to constructing `https://<R2_PUBLIC_DOMAIN>/dist/extension/v<version>.zip` using an env var `R2_DIST_PUBLIC_URL`. If neither works, omit the URL from the DM (G2 path).

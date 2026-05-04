# GAW ModTools v2.0 — Lead Rollout Guide

**Audience:** you (Commander Cats), as the lead mod rolling this out to the rest of the team.
**Goal:** every mod ends up with a token only THEY know, the audit chain is whole, no one accidentally bricks anything.
**Time:** about 30–45 minutes once you've sent the first DM.

---

## What you're rolling out (one paragraph)

GAW ModTools v2.0 gives every mod their own auth token that the worker recognizes individually. Mods can rotate that token to a value only they know — once they do, you (the lead) can no longer authenticate as them. The Merkle audit chain on the worker means anyone can verify the audit log hasn't been tampered with. None of this is visible to the mods unless they look — they just keep using ModTools normally and benefit from the security.

---

## Step 1 — make sure YOUR install is healthy

Before touching anyone else, confirm your own state.

1. Open `brave://extensions` → confirm GAW ModTools shows version **9.0.0**.
2. Open a fresh GAW tab → bottom of page should show **🛡 v9.0.0**.
3. Click the popup icon (toolbar) → Lead Mod Token section is visible (it's hidden for non-leads).
4. Click **👥 Mod rotation roster** → panel opens, shows every mod with their rotation status.

If any of those four checks fails, **stop**. Fix your install before involving anyone else. Re-load the extension from `D:\AI\_PROJECTS\modtools-ext\` if needed.

---

## Step 2 — distribute the v9.0.0 ZIP to every mod

You have **two options**. Pick whichever is less work for your team.

### Option A: Each mod loads it themselves (recommended)

Send each mod a Discord DM with this text:

> Hey [name], we're rolling out a security update for ModTools (v2.0).
>
> 1. Download this ZIP: [paste link or attach `gaw-modtools-chrome-store-v9.0.0.zip`]
> 2. Extract it to a folder you'll keep around (e.g., `Documents\modtools-v9`).
> 3. Open `chrome://extensions` (or `brave://extensions`).
> 4. Make sure **Developer mode** (top right) is ON.
> 5. If you have an old GAW ModTools installed, click **Remove** on it.
> 6. Click **Load unpacked** (top left).
> 7. Pick the folder you extracted in step 2.
> 8. You should see "GAW ModTools 9.0.0" appear.
> 9. Refresh any open GAW tabs.
>
> When you're done, in your popup you'll see a button **🔄 Rotate my token**. Click it. That's the actual security part — we'll talk about it after.
>
> Reply when you're on 9.0.0.

### Option B: You ship it, they reload

If a mod already has an unpacked install at a folder you can update, you can replace the files in their folder remotely (e.g., shared OneDrive). They just hit the 🔄 reload icon. Less common — only worth doing if you set this up beforehand.

---

## Step 3 — issue rotation invites for every mod

Once a mod confirms they're on v9.0.0, they need to swap the token you gave them at provisioning for a fresh one only they know. The **Rotation Roster** in your popup makes this one click per mod (or one click for the whole team).

### Bulk: every unrotated mod at once

1. Open your popup → Lead Mod Token section → click **👥 Mod rotation roster**.
2. At the top of the panel: **🚀 Issue all (N)** where N = number of unrotated mods.
3. Click it. Confirm.
4. The panel now shows N rotation invite codes — one per mod. Two big buttons at the top:
   - **Copy ALL as username\\tcode** — paste this anywhere two-column (Notepad, Discord, a spreadsheet)
   - **Copy ALL DM templates** — paste this into a Discord notepad and split-DM each mod

5. DM each mod their code. Each DM template has the mod's username + code already formatted.

### One mod at a time

Same panel. Find their row. Click **Issue** (or **Re-issue** if they've rotated before). Copy the resulting code. DM them.

### What's in the DM

Auto-formatted by the popup. Looks like:

> Hey [mod], here is your rotation invite for ModTools.
> In the ModTools popup, click "I have a rotation invite", enter your GAW username ([mod]), then paste this code:
> [48-character code]
> Expires in 72h. Single-use. Once you claim it, your token will be one only YOU know.

---

## Step 4 — verify each mod claimed successfully

Refresh the rotation roster panel. As each mod claims their invite, their row updates from **⚠ never rotated** (orange) to **✓ rotated [date]** (green). Rotation count ticks up to 1.

If a mod hasn't claimed within 24h, follow up. The invite expires at 72h.

---

## Step 5 — verify the Merkle audit chain

Once everyone has rotated:

```powershell
pwsh D:\AI\_PROJECTS\cloudflare-worker\scripts\verify-audit-chain.ps1
```

Paste your lead token when prompted. Expect:

> ✓ ok
> checked: [N]
> first_break: null

If `first_break` is non-null, the audit log was tampered with — paste me the row id.

---

## Step 6 — set the SENTRY_DSN if you haven't

If you haven't already enabled error capture on the worker:

```powershell
pwsh D:\AI\_PROJECTS\cloudflare-worker\scripts\set-sentry-dsn.ps1 -FromClipboard
```

(Copy the DSN from sentry.io first.)

This lets you see worker errors in your Sentry dashboard. One-time setup. Already in your roadmap if not done.

---

## What can go wrong (and how to recover)

| Symptom | Cause | Fix |
|---|---|---|
| Mod can't load extension | Old version still installed | Remove old, Load unpacked from new folder |
| "Unknown mod" when issuing invite | Username typo or wasn't provisioned | Verify spelling against the roster panel |
| Mod claims, then says "I get logged out" | They lost their token between rotation and saving | Issue a fresh rotation invite — single-use, no harm |
| Mod claims an invite, gets a token, then accidentally clears storage | Need to re-onboard | Issue another rotation invite |
| Audit chain shows tampering | Investigate the row id from `first_break` | Worth a careful look — could be a worker bug or a real tamper |
| You (lead) lose your lead token | Re-set via `wrangler secret put LEAD_MOD_TOKEN` | The mods are fine; the lead-only features are gated by this token |

---

## What this rollout does NOT do

To set expectations: v2.0 is the auth layer. It does not yet:

- Provide per-device enrollment (Phase 3 spec — a stolen mod laptop still has a working token until rotation)
- Auto-rotate on schedule (mods rotate manually)
- Replace the lead token with step-up auth (Phase 4 spec)
- Provide an instant-revoke mechanism (you can issue a fresh invite, which invalidates the old token, but propagation across the mod's open tabs takes one page reload)

These are queued for v2.x or v3.0. The v2.0 milestone is "the lead can no longer impersonate any rotated mod" — which is the headline change.

---

## Quick checklist

```
[ ] My install: v9.0.0, popup roster works, lead token saved
[ ] ZIP distributed to all 14 mods
[ ] All 14 mods confirmed v9.0.0 on their end
[ ] Bulk issued rotation invites
[ ] All 14 mods claimed (rotation roster shows green)
[ ] Audit chain verifier returns ok=true
[ ] (optional) Sentry DSN set on the worker
```

Once all boxes are checked, you've shipped v2.0. Hand the team the **mod-perspective guide** as the user manual going forward.

# Lead-Lockout Playbook — when you can't get in as lead

> TL;DR: **double-click the `GAW LEAD RESCUE` button on your Desktop → paste (Ctrl+V)
> into the popup's "I have a token" field → SAVE & VERIFY → reload your GAW tab.**
> ~30 seconds. Works for every cause (wiped vault, rotated token, corrupted settings).

## ELI5 — fixing the lockout (the dead-simple version)

**What went wrong:** the extension keeps your "lead badge" (your token) in its
pocket. To save memory, Chrome makes the extension take naps. Sometimes when it
wakes up, the badge has fallen out of its pocket — so it doesn't recognize you and
shows the **"NEW MOD SETUP"** screen. **You are NOT a new mod.** The badge just got lost.

**How to fix it — 3 steps, ~30 seconds:**

1. **Double-click `GAW LEAD RESCUE` on your Desktop.** A black window opens, works
   for ~10 seconds, then beeps. It just minted you a brand-new badge and **copied it
   to your clipboard** for you.
2. **Open the ModTools popup.** If you see "NEW MOD SETUP," click **← BACK**, then
   click **"I have a token"** (NOT the invite-link or invite-code options).
3. **Press Ctrl+V** to paste, then **SAVE & VERIFY**. Reload your greatawakening.win
   tab. You're lead again.

**The good news:** the extension now keeps a *spare* badge and puts it back in its
pocket by itself. Once you're on **v10.24.0+**, this mostly stops happening on its
own — and the rare time it can't auto-fix (your badge was changed on the server),
the popup now says *"your token was rejected — paste a new one"* instead of
pretending you're a stranger.

*(That's the whole strategy. Everything below is the technical detail.)*

## When you're locked out RIGHT NOW (the break-glass)

1. **Double-click** `D:\AI\_PROJECTS\modtools-ext\scripts\RECOVER-LEAD-ACCESS.bat`.
   It mints a fresh lead token, writes it straight into the worker's `mod_tokens`
   table (`is_lead=1`), self-verifies via `/mod/whoami`, and **puts the new token
   on your clipboard**. (A copy is also saved to `D:\AI\_PROJECTS\logs\RECOVERY-TOKEN-*.txt`.)
2. In the ModTools popup: if you see **NEW MOD SETUP**, click **← BACK**, then pick
   the **"I have a token"** path (NOT the invite link / invite code).
3. **Ctrl+V** to paste the token → **SAVE & VERIFY** (no username needed on this path).
4. Reload your GAW tab — HUD + lead powers are back.

That's the whole recovery. It needs your machine's existing wrangler auth (the same
one that deploys the worker) — no admin secret required.

## Why this happens

The extension stores your **team token** (`workerModToken`, whose `is_lead=1` in D1
makes you lead). You land in NEW-MOD onboarding when that token can't be found:

- **MV3 service-worker eviction** empties the in-memory + `storage.session` vault.
- The on-disk token blob can become **undecryptable** after eviction (a documented
  v10.11.1 failure mode) — the vault comes up empty.
- The token was **rotated** server-side (the saved one now 401s).
- A settings reset / re-install **cleared `gam_settings`**.

Any of these → no usable token → onboarding screen.

## The layers that make it rarer (so you stop needing the break-glass)

| Layer | Status | Covers |
|---|---|---|
| **L4/L5 — auto-restore** (v10.23.0) | ✅ shipped | **Wiped/undecryptable vault** self-heals on next load from a decrypt-independent backup — **no action from you**. Survives the v10.11.1 crypto-loss case. |
| **The `.bat` break-glass** | ✅ shipped | **Everything** — wiped, rotated, corrupted. The universal floor. |
| **L1/L2 — 401 → in-popup recovery** | ⏳ next | **Rotated/invalid token** → the popup routes you to one-click recovery instead of NEW-MOD onboarding. |

**The single most important thing to stop the recurrence: load the latest build
(v10.23.0+).** The self-heal (L4/L5) only protects you once it's installed — an
older build (e.g. v10.19.x) has no backup/restore, so it keeps dumping you into
onboarding on every eviction. Loading current = the wiped-vault case fixes itself.

## What the recovery script does (for the record)

`scripts/recover-lead-access.ps1` (called by the `.bat`):
1. Generates a fresh 32-byte base64url team token.
2. Computes its SHA-256 (matches the worker's `sha256Hex` lookup — cross-checked
   against Node's hash + a known vector).
3. `wrangler d1 execute gaw-audit --remote` → `INSERT … is_lead=1` (mirrors the
   worker's own insert shape: `token=NULL`, `token_hash` set).
4. Self-verifies via `GET /mod/whoami` → expects `is_lead:true` before declaring success.
5. Token → clipboard (on success); full debug log → `D:\AI\_PROJECTS\logs\` (and →
   clipboard on failure, so you can paste the error back to Claude).

The dead old token stays dead and harmless; each run just adds a fresh valid lead row.

## The separate `LEAD_MOD_TOKEN` admin secret

That's a *different* thing (the "Lead Mod Token" popup field) — only needed to
*provision new mods* via `/admin/*`. You don't need it for daily lead work. It's
unrecoverable if lost (regenerate with `scripts/_set_lead_token.ps1`), but the
break-glass above restores normal lead access without it.

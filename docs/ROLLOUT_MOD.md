# GAW ModTools v9.3 — What You Need to Do (Mod Edition)

**Audience:** you, a GAW mod who just got a Discord DM from Commander Cats about installing or updating ModTools.
**Time:** 5 minutes, mostly clicking.
**Why:** v9.3 is a major security hardening release — your mod token is yours alone, the audit chain is HMAC-anchored, and 50+ Vanguard red-team findings have been closed.

---

## What just changed (in plain English)

v9.3 closes a long list of attack surfaces flagged by an adversarial audit. None of the changes affect your daily workflow — same status bar, Mod Console, Triage Console, chat, Death Row queue. You just install and keep going.

The biggest ones you'd actually notice:

- **Per-mod token sovereignty** (since v8.5, refined in v9.3): your token is yours alone — even Commander can't authenticate as you after the rotation step.
- **Cross-mod SUS flags** (v9.3.4): right-click a username in the tooltip → 🚩 Mark SUS. All mods see the flag immediately. BOLD RED if the user has >8 comments in 24h.
- **Status bar SIREN chip** (v9.3.7): 🚨 chip shows live count of TARDs + recent DR adds. Click it to open the mod log.
- **Chat dock + width + edit/delete** (v9.3.8 / v9.3.9): chat panel docks left or right, three widths (S / M / L). Right-click your own message → Edit (5 min window) or Delete. Reply works on anyone's message.
- **@username autocomplete** (v9.3.9): type `@` in the chat composer for mod autocomplete. Start a message with `@KnownMod` to send a DM.
- **First-time mod claim flow** (v9.3.6): platformHardening flag default-on; the popup's 📨 Claim invite button is always visible for fresh installs.

---

## Step 1 — install v9.3.15

Commander DM'd you a ZIP (`gaw-modtools-chrome-store-v9.3.15.zip`). Save it somewhere you won't accidentally delete:

```
Documents\modtools-v9.3\
```

Right-click the ZIP → **Extract All** → choose that folder.

Now in your browser:

1. Address bar: `chrome://extensions` (or `brave://extensions` if you use Brave).
2. Top right corner: turn ON **Developer mode** if it isn't already.
3. If you see an old "GAW ModTools" entry, click the reload arrow ↻ on its card (DON'T click Remove — your stored token survives a reload).
4. If this is a brand-new install: top left, click **Load unpacked**.
5. Pick the folder you extracted to in step 1 (the one with `manifest.json` directly inside).
6. You should see "GAW ModTools 9.3.15" appear in the list.

To confirm it worked:

7. Open `https://greatawakening.win` in a new tab.
8. Bottom of the page, you should see a small floating bar with **🛡 v9.3.15**.

If anything in steps 1–8 didn't go right, paste a screenshot to Commander.

---

## Step 2 — claim your rotation invite

If you've been a mod since v8.5+ and your token is already saved, you can skip this step (your existing token still works). Otherwise:

Commander will DM you something that looks like this:

> Hey [you], here is your rotation invite for ModTools.
> Easiest way: click this link in the browser where you have ModTools installed (signed into GAW as [you]):
> `https://greatawakening.win/?mt_invite=<48-char code>`
> Then open the ModTools popup and click "📨 Claim invite". Confirm.
> Manual fallback: open the popup, click "📥 I have a rotation invite", enter your GAW username (any spelling — case-insensitive), paste the 48-character code.

**v9.3.12 security note**: when you click the invite link, ModTools will pop a confirm dialog showing your detected GAW username. Verify it matches you before clicking OK. If the username looks wrong (e.g., it's a stranger's name), CLICK CANCEL and tell Commander — that means someone may have crafted a malicious link.

Then:

1. Click the ModTools toolbar icon to open the popup.
2. Click **📨 Claim invite** (auto-staged) OR **📥 I have a rotation invite** (manual paste).
3. Confirm the prompts.
4. You should see: **✓ claimed — you are now [your username]**.
5. Refresh any open GAW tabs.

---

## Step 3 — confirm everything still works

Open a GAW page. Try one normal mod action — open the Triage Console, hover a username, do whatever you usually do. If it all works, you're done.

If anything breaks (the popup says "no mod token" or you get authentication errors), tell Commander immediately. They can issue you a fresh rotation invite — same process as step 2.

---

## (Optional) Step 4 — rotate your token any time you want

You can swap your token for another fresh random one whenever you like — for example:

- You suspect your laptop was used by someone else
- You want to "reset" before a long break
- It's just a habit you want to keep

How:

1. Open the popup.
2. Click **🔄 Rotate my token (lead loses access)**.
3. Confirm.
4. Done. You have a new token.

If you rotate, even Commander can no longer authenticate as you. To recover, ask Commander for a fresh rotation invite.

---

## What if I lose my token?

You don't really lose it — it's saved in the extension's storage. But if your Chrome profile gets wiped, or you uninstall and reinstall the extension, the token goes with it.

If that happens:

1. DM Commander: "I lost my ModTools token, can you issue a rotation invite?"
2. They send you a new invite link or code.
3. You repeat **Step 2** above.

Done. Your old token is now gone forever — no one can use it for anything — and you have a new one.

---

## What if I see an "Update available" banner?

Commander pushes new versions periodically. When the worker detects a newer release, your active GAW tab will show a red banner at the top: "ModTools update available — vX.Y.Z."

Click the **↻ Reload extension** button on the banner. Then reload your GAW tabs.

(v9.3.14+ DOES NOT auto-reload your extension — you click the button yourself. This is a security feature.)

---

## New in v9.3 — features you might want to try

- **Mark SUS**: in the username tooltip (pin a tooltip first by clicking a username), there's a 🚩 Mark SUS button. Mark a user as SUS with a reason, all other mods see them flagged orange (or BOLD RED if they have >8 comments in 24h).
- **Death Row rules sync**: rules created by Commander or other leads automatically apply on your `/users` page. You'll see them in the auto-rules list.
- **Chat dock + width**: open mod chat (💬 in the status bar), look in the header — left/right dock toggle and S/M/L width selector. Persists per-mod.
- **Right-click on chat messages**: Reply (works on anyone's message), Edit/Delete (only your own, 5 minute window).
- **@username in chat**: type `@` to autocomplete mod names. Start a message with `@SomeMod ...` to send a DM.
- **🚨 SIREN chip** on the status bar: live count of currently-flagged SUS users + recent DR adds. Click for details.

---

## Quick checklist

```
[ ] Extracted v9.3.15 ZIP to a permanent folder (or hit reload arrow if updating)
[ ] chrome://extensions shows "GAW ModTools 9.3.15"
[ ] Status bar shows 🛡 v9.3.15 on greatawakening.win
[ ] Team Mod Token saved (or claimed via rotation invite)
[ ] Tested one normal mod action and it worked
```

Once all boxes are checked, you're done. Get back to modding.

---

## Questions?

DM Commander Cats. They have lead-only diagnostics and can issue you a fresh invite at any time.

---

## Security highlights for the curious

v9.3 closed 55+ adversarial audit findings spanning extension, worker, and D1. The headline ones:

- `/invite/claim` legacy team-token mint endpoint **deleted**
- Lead env-token can no longer double as a mod identity
- Audit chain is now HMAC-anchored with atomic chained inserts
- Ban actions are rate-limited (10/min, 100/day) with a kill-switch lead can flip
- AI proxy capped at 500 calls/day per mod + 5000 global
- Drive-by `?mt_invite=` link attacks require explicit confirm with username verification
- All cross-mod IDOR paths (proposal cancel, sniper arm/remove, profile write, evidence get) now token-verified
- 94% of error responses sanitized (no token leakage in 500s)
- Manifest restricted to `https://`, `tabs` permission dropped, auto-reload removed (no more supply-chain RCE)

Full details: `docs/RELEASE_NOTES_v9.3.md` and `docs/PUNCHLIST_v9.3.md` in the source repo.

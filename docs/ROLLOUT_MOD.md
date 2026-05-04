# GAW ModTools v2.0 — What You Need to Do (Mod Edition)

**Audience:** you, a GAW mod who just got a Discord DM from Commander Cats about installing ModTools v2.0.
**Time:** 5 minutes, mostly clicking.
**Why:** this update means YOUR mod token is yours alone — even Commander can't authenticate as you after the rotation step.

---

## What just changed (in plain English)

Before v2.0, every mod's auth token was set up by the lead. The lead held a copy. That meant the lead could (in principle) authenticate as you and write actions under your name in the audit log.

v2.0 lets you swap that token for a fresh random one that only you know. The lead still has lead privileges, but they can no longer impersonate you. Everything else about ModTools works the same — same status bar, same Mod Console, same Death Row queue. You won't notice anything different in daily use.

The only thing you have to do is install v2.0 and click two buttons.

---

## Step 1 — install v2.0

Commander DM'd you a ZIP (`gaw-modtools-chrome-store-v9.0.0.zip`). Save it somewhere you won't accidentally delete — for example:

```
Documents\modtools-v9\
```

Right-click the ZIP → **Extract All** → choose that folder.

Now in your browser:

1. Address bar: `chrome://extensions` (or `brave://extensions` if you use Brave).
2. Top right corner: turn ON **Developer mode** if it isn't already.
3. If you see an old "GAW ModTools" entry, click **Remove**.
4. Top left: click **Load unpacked**.
5. Pick the folder you extracted to in step 1 (the one with `manifest.json` directly inside).
6. You should see "GAW ModTools 9.0.0" appear in the list.

To confirm it worked:

7. Open `https://greatawakening.win` in a new tab.
8. Bottom of the page, you should see a small floating bar with **🛡 v9.0.0**.

If anything in steps 1–8 didn't go right, paste a screenshot to Commander.

---

## Step 2 — paste your existing token (if you don't already have it)

If your old install was already set up, your team mod token may already be saved and you can skip ahead to step 3. Click the ModTools toolbar icon. Under **🔑 Team Mod Token** you should see "stored" or similar.

If it says "not configured" or you're a brand-new mod:

1. Click the toolbar icon for ModTools to open the popup.
2. In the **🔑 Team Mod Token** field, paste the token Commander gave you when you joined the team.
3. Click **Save**.
4. You should see "stored" or "✓ accepted".

---

## Step 3 — claim your rotation invite (the only NEW step)

Commander will DM you something that looks like this:

> Hey [you], here is your rotation invite for ModTools.
> In the ModTools popup, click "I have a rotation invite", enter your GAW username ([you]), then paste this code:
> [48-character code]
> Expires in 72h. Single-use.

Do exactly what it says:

1. Click the ModTools toolbar icon to open the popup.
2. Find the button: **📥 I have a rotation invite**. Click it.
3. First prompt: enter your **GAW username** (case matters — match what Commander wrote in the DM).
4. Second prompt: paste the 48-character code.
5. Click OK.
6. You should see: **✓ claimed — you are now [your username]**.

That's it. Behind the scenes:
- The worker generated a fresh random token
- Your extension auto-saved it
- Commander never sees the new token — it never left the worker except through the secure pipe to your browser

The old token is now invalid. If anyone tries to use the original token Commander gave you, the worker rejects it.

---

## Step 4 — confirm everything still works

Open a GAW page. Try one normal mod action — open the Triage Console, hover a username, do whatever you usually do. If it all works, you're done.

If anything breaks (the popup says "no mod token" or you get authentication errors), tell Commander immediately. They can issue you a fresh rotation invite — same process as step 3.

---

## (Optional) Step 5 — rotate your token any time you want

You can swap your token for another fresh random one whenever you like — for example:

- You suspect your laptop was used by someone else
- You want to "reset" before a long break
- It's just a habit you want to keep

How:

1. Open the popup.
2. Click **🔄 Rotate my token**.
3. Confirm.
4. Done. You have a new token. Even *you* don't see it as a string — it's just stored in the extension.

No one can ever read it from the database (it's stored as a hash, not plaintext). The only way to invalidate it is to rotate again.

---

## What if I lose my token?

You don't really lose it — it's saved in the extension's storage. But if your Chrome profile gets wiped, or you uninstall and reinstall the extension, the token goes with it.

In that case:

1. DM Commander: "I lost my ModTools token, can you issue a rotation invite?"
2. They send you a new invite code.
3. You repeat **Step 3** above.

Done. Your old token is now gone forever — no one can use it for anything — and you have a new one.

---

## What this update DOESN'T change

You'll keep using ModTools the same way. Same:

- Status bar at the bottom of GAW pages
- Mod chat (💬)
- Triage Console on `/users`
- Death Row queue
- Auto-DR rules
- Mod log
- Bug reports

If anything LOOKS different from before v2.0, that's a UX polish change, not a workflow change.

---

## Quick checklist

```
[ ] Extracted v9.0.0 ZIP to a permanent folder
[ ] Loaded unpacked in chrome://extensions
[ ] Status bar shows 🛡 v9.0.0
[ ] Team Mod Token saved (or already was)
[ ] Claimed rotation invite from Commander → "✓ claimed"
[ ] Tested one normal mod action and it worked
```

Once all boxes are checked, you're done. Get back to modding.

---

## Questions?

DM Commander Cats. They have the lead-only diagnostics and can issue you a fresh invite at any time.

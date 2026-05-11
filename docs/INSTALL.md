# GAW ModTools — Install Guide

## TL;DR

**First-install recommended path:** Path B (lead attaches a ZIP to the DM you'll receive). It's the fastest and doesn't require Google Drive access. To update later, the lead re-attaches a new ZIP and you replace the folder.

**For mods who want auto-updates** (lead pushes a new version → it lands on your machine automatically): Path A. Requires Google Drive Desktop installed + the lead must share a Drive folder with your Gmail.

Do you have **Google Drive Desktop** installed on this machine?

- **Yes — and you want auto-updates** → follow [Path A](#path-a--with-drive-desktop). The shared folder auto-syncs; you pick it once and forget it.
- **No — or for first install** → follow [Path B](#path-b--without-drive-desktop). You unzip the ZIP your lead DM'd you to a stable folder, load it.

Either path takes under 10 minutes on Chrome. Brave users: read the [Brave section](#brave-gotcha) before you start.

---

## Browser compatibility

| Browser | Supported | Notes |
|---|---|---|
| Chrome 116+ | Yes | Primary tested platform |
| Brave 1.50+ | Yes | Read [Brave Gotcha](#brave-gotcha) first |
| Edge (Chromium) | Yes | Treat the same as Chrome |
| Firefox | No | MV3 extension differences — not supported |

## OS compatibility

| OS | Supported | Notes |
|---|---|---|
| Windows | Yes | Primary tested platform |
| macOS | Yes | Drive Desktop available |
| Linux | Yes | Drive Desktop not available — use [Path B](#path-b--without-drive-desktop); see [Linux Notes](#linux-notes) |

---

## Path A — With Drive Desktop

### Step 1: Confirm Drive Desktop is running

Look for the Drive icon in your system tray (Windows: bottom-right; macOS: menu bar). If it is there and showing a checkmark or sync icon, you are ready. If not, install it from [drive.google.com/drive/download](https://drive.google.com/drive/download) and sign in with the Google account the lead shared the folder to.

### Step 2: Make the ModTools folder Available Offline — CRITICAL, DO NOT SKIP

This is the single most common cause of "extension won't load" errors. Drive Desktop
shows the folder in File Explorer, but the files inside may be stubs (cloud-only placeholders)
until you toggle this setting. Chrome cannot load a manifest from a stub.

1. Open File Explorer and navigate to your Google Drive (it appears as a drive letter, e.g. `G:\My Drive\` or `E:\My Drive\`)
2. Find the shared `mod-tools` folder (or `modtools-ext` — whatever the lead named it)
3. Right-click the folder
4. Click **Available offline** (or **Always keep on this device** on some versions)
5. Wait for the green checkmark to appear on the folder icon — this means all files have synced locally
6. Verify: open the folder in File Explorer and confirm `manifest.json` is visible as a real file (not a cloud-icon stub)

Do not proceed to Step 3 until the green checkmark is solid and `manifest.json` is a real file.

### Step 3: Load Unpacked in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Toggle **Developer mode** ON (switch is in the top-right corner of the page)
3. Click **Load unpacked**
4. Navigate to the `mod-tools` folder (or `modtools-ext`) in your Drive sync
5. Select the folder — the one where `manifest.json` lives at the top level
6. Click **Select Folder**

You should see a "GAW ModTools" card appear in the extensions list. If you get a "Manifest file is missing or unreadable" error, see [Common Errors](#common-errors-and-fixes).

### Step 4: Pin the extension

1. Click the puzzle-piece icon in the Chrome toolbar (top-right, next to the address bar)
2. Find **GAW ModTools** in the dropdown
3. Click the pin icon next to it

The GAW ModTools icon should now be permanently visible in your toolbar.

### Step 5: Authenticate

Your lead will send you either an **invite link** or a **raw token**. Use the path that matches what you received.

**Path 5A — You received an invite link** (a URL that looks like `https://greatawakening.win/?mt_invite=...`):

1. Make sure you are signed into greatawakening.win in the same Chrome profile
2. Click the invite link (from DM, email, or Discord)
3. A confirmation dialog will appear naming you — click **OK**
4. A small notice will appear asking you to open the ModTools popup
5. Click the GAW ModTools icon in your toolbar
6. Click **Claim invite**
7. Enter your GAW username when prompted. The wizard shows a live format hint (allowed chars: `A-Z a-z 0-9 _ -`, length 2-64) — if the chip turns green, you're good. Click **Claim**.
8. You should see a confirmation that your token has been saved

**Path 5B — You received a raw token** (a long string of random characters):

1. Click the GAW ModTools icon in your toolbar
2. Click the **Tokens** tab
3. Paste your token into the **Team Mod Token** field (the one with the key icon)
4. Click **Save**, then click **Verify**
5. A green confirmation will appear when the token is accepted

### Step 6: Verify it worked

1. Hard-refresh greatawakening.win (Ctrl+Shift+R)
2. The ModTools status bar should appear at the bottom of the page
3. If you see a red "auth failed" banner instead, see [Common Errors](#common-errors-and-fixes)

---

## Path B — Without Drive Desktop

### Step 1: Get the release ZIP

Ask your lead for the latest `gaw-modtools-LATEST.zip`. They will send it via Discord, Slack, or DM.

### Step 2: Unzip to a stable location

Unzip the file to a folder you will not move or delete. Recommended locations:

- Windows: `C:\Users\YourName\modtools-ext\`
- macOS: `~/modtools-ext/`
- Linux: `~/modtools-ext/`

Do not leave it in your Downloads folder. Chrome records the folder path when you load the extension. If you move or delete the folder later, the extension will break and you will need to reload it.

### Step 3: Load Unpacked in Chrome

Same as Path A Step 3 above. Navigate to the unzipped folder when Chrome asks you to select one.

### Step 4: Pin the extension

Same as Path A Step 4.

### Step 5: Authenticate

Same as Path A Step 5.

### Step 6: Verify it worked

Same as Path A Step 6.

### Important: Manual updates

Path B does not auto-update. When the lead announces a new version in Discord or Slack:

1. Download the new ZIP
2. Unzip it to the same stable folder (overwrite the old files)
3. Go to `chrome://extensions/` and click the reload icon on the GAW ModTools card

---

## Brave Gotcha

Brave's Shields feature can interfere with the invite link flow.

**The problem:** When you click an invite link (`?mt_invite=...`), Brave Shields may silently strip the query parameter before the extension sees it. The page loads normally and nothing looks wrong — but the extension never received the invite code.

The extension (v10.0+) includes a detection step: if it sees you are on Brave and the invite parameter went missing, it will show an amber rescue banner with instructions to paste the invite URL directly into the popup instead.

**If the amber banner does not appear and your invite link seems to have done nothing**, do this manually:

1. Click the GAW ModTools icon in your toolbar
2. Click the **Tokens** tab
3. Paste the full invite URL (`https://greatawakening.win/?mt_invite=...`) into the **Team Mod Token** field
4. The popup will detect it is a link, not a token, and route you to the Claim flow automatically

**If actions like Claim or Verify fail with "fetch failed" on Brave**, lower your Shields settings for greatawakening.win:

1. Go to `https://greatawakening.win/`
2. Click the Shields icon (lion head) in the address bar
3. Change **Trackers and ads blocking** to Standard (not Aggressive)
4. Change **Cross-site cookies** to Standard
5. Reload the page and try again

---

## Linux Notes

- Drive Desktop is not available on Linux. Use [Path B](#path-b--without-drive-desktop).
- Brave on Linux (1.50+) is functional. If you hit an invite-link issue, use the manual paste method in the [Brave Gotcha](#brave-gotcha) section above.
- Some Linux desktop environments do not support the native `confirm()` dialog that the invite-link flow uses. If clicking the invite link does nothing, paste the URL directly into the popup's Team Mod Token field.
- If you encounter any Linux-specific issues not covered here, report them to the lead so they can be documented.

---

## Common Errors and Fixes

### "Manifest file is missing or unreadable"

Two possible causes:

1. **Wrong folder selected.** You must select the folder that contains `manifest.json` directly at its top level. If you unzipped a file and got a folder inside a folder (e.g. `modtools-ext\modtools-ext\manifest.json`), select the inner folder — the one where `manifest.json` lives.

2. **Drive Desktop folder not set to Available Offline.** The file exists in Drive but has not synced to your machine yet. Go back to Path A Step 2 and wait for the green checkmark before loading.

### "Token rejected" or "401 Unauthorized" when verifying

Your token has expired or been rotated by the lead. Ask the lead for a fresh invite link and use Path A Step 5A.

### "Connection failed" or Cloudflare error 1101

The backend worker may be deploying an update. Wait 60 seconds and try again. If it persists after 5 minutes, message the lead.

### Extension icon shows a red badge

Open the popup. Either your token is missing (go to the Tokens tab and run Verify) or the extension has hit a maintenance window (check the Maintenance tab). The red badge clears itself once the issue is resolved.

### Banner says "Connection re-established" or "Extension was reloaded"

These two banner texts mean different things (as of v10.14):

- **"Connection re-established"** — Chrome paused the extension's background service worker (normal — saves memory) and now woke it back up. No action needed; this is healthy lifecycle behavior. The banner self-dismisses.
- **"Extension was reloaded"** — the extension was actually reloaded (you reloaded it, or an update landed). Drafts in open textareas may have been preserved via the local mirror (modmail/macros) — look for a small "Draft restored" chip. If you don't see it, your latest typing may have been lost; retry.

If the banner persists for more than a minute, hard-refresh greatawakening.win (Ctrl+Shift+R).

### The status bar does not appear on greatawakening.win

1. Make sure you are signed into greatawakening.win — the bar only appears for logged-in users
2. Hard-refresh the page (Ctrl+Shift+R)
3. Check `chrome://extensions/` — the GAW ModTools card should show "Enabled" with no errors listed

### Brave: invite link worked but Claim fails with "fetch failed"

See the [Brave Gotcha](#brave-gotcha) section above and lower your Shields settings.

---

## Verification Checklist

Run through this after install before declaring yourself live:

- [ ] Extension appears in `chrome://extensions/` with no error badge
- [ ] Developer mode is toggled ON
- [ ] GAW ModTools icon is pinned in the toolbar
- [ ] Click the icon — the popup opens
- [ ] Tokens tab shows a green "Token verified" status
- [ ] Stats tab shows numbers (not dashes)
- [ ] Visit `https://greatawakening.win/` — the ModTools status bar appears at the bottom of the page
- [ ] The status bar has no red or orange error state

If all eight are clear, you are live. Welcome to the team.

---

## Where to Get Help

- Discord or Slack mod chat
- Lead (Commander Cats) — catsfive@yahoo.com
- In-extension bug report: click the GAW ModTools icon, go to the **Tools** tab, click **Bug Report**

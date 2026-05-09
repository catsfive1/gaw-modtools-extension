# Discord Automation 3 -- PS1 Installer

Script: `scripts/install-gaw-modtools.ps1`
Author: C5 Operations
Version: 1.0.0 (2026-05-09)

---

## A. WHAT THE SCRIPT DOES (mod-friendly description)

When you get the GAW ModTools update link in Discord, you run one script and
the extension installs itself. No unzipping, no dragging files around, no
hunting for the right folder. Here is the sequence in plain English:

1. Checks your PowerShell version is new enough (5.1+).
2. Verifies it can reach the download server.
3. Checks it has write permission to your install folder before touching anything.
4. Downloads the ZIP to a throwaway temp file.
5. Makes a timestamped backup of whatever version you had before
   (saved next to the install folder as `mod-tools dist.bak-YYYYMMDD-HHmmss`).
6. Clears the install folder and extracts the new files.
7. Reads `manifest.json` out of the freshly extracted files and reports the version.
8. Opens `chrome://extensions` in Chrome automatically.
9. Tells you exactly what to click (the reload arrow on the GAW ModTools card).
10. Copies the full debug log to your clipboard and plays the three-note completion beep.

Total time: under 30 seconds on a normal connection.

---

## B. INVOCATION (mod-readable instructions)

### Exact Discord DM wording (copy-paste into the DM template)

---

**GAW ModTools v{VERSION} is ready.**

To install, follow these steps:

**1.** Save the script to your Desktop (right-click -> Save link as):
`install-gaw-modtools.ps1` -- {SCRIPT_DOWNLOAD_LINK}

**2.** Right-click the saved file -> **Run with PowerShell**
(or open Windows Terminal and type:)
`powershell -ExecutionPolicy Bypass -File "%USERPROFILE%\Desktop\install-gaw-modtools.ps1" -ZipUrl "{ZIP_DOWNLOAD_URL}"`

**3.** The script will download, install, and open Chrome for you.
Click the **reload arrow** on the GAW ModTools card.

**4.** Refresh greatawakening.win. The toolbar should show v{VERSION}.

If anything goes wrong, paste the log from your clipboard into this DM thread.

---

### Parameters the script accepts

| Parameter | Required | Default | Notes |
|---|---|---|---|
| `-ZipUrl` | No | GitHub Releases latest URL | Pass the Discord DM link here |
| `-InstallPath` | No | `D:\AI\_PROJECTS\dist\mod-tools dist` | Mods on different machines may need to override |
| `-ExpectedVersion` | No | (no check) | Pass e.g. `10.3.0` to enforce a version gate |
| `-NoPause` | No | off | Add for automated/headless runs |

### Invoking without a ZipUrl

If the mod omits `-ZipUrl`, the script falls back to the hardcoded
`$DEFAULT_ZIP_URL` constant near the top of the script. Update that constant
each release cycle so the script always self-resolves to the current version
when run without arguments.

```
powershell -ExecutionPolicy Bypass -File install-gaw-modtools.ps1
```

### Invoking with a specific URL (the Discord DM case)

```
powershell -ExecutionPolicy Bypass -File install-gaw-modtools.ps1 -ZipUrl "https://github.com/YourOrg/gaw-modtools/releases/download/v10.3.0/gaw-modtools.zip"
```

---

## C. ERROR PATHS + REMEDIATION HINTS

Every failure exits with code 2 and prints remediation hints in yellow.
The full debug log lands on the clipboard for paste-back.

### ExecutionPolicy block

Symptom: `File cannot be loaded because running scripts is disabled on this system.`

Remedy: The mod must invoke via `powershell -ExecutionPolicy Bypass -File ...`
not by double-clicking the .ps1. Include that exact invocation string in the
Discord DM; do not rely on double-click.

### No network / download failed

Symptom: `Download failed: ... unable to connect ...`

Remedy: Mod checks internet connection. If using a Discord CDN link, links
expire after 24 hours -- send a fresh link. Confirm the URL has no trailing
whitespace or line-wrap artifact from Discord formatting.

### Expired Discord CDN link

Symptom: `Download failed: (403) Forbidden` or `(404) Not Found`

Remedy: Discord attachment links expire. Re-upload the ZIP and DM a fresh
link, or switch to a GitHub Releases permanent URL (preferred -- see Section F).

### No write permission to InstallPath

Symptom: `No write permission to 'D:\AI\_PROJECTS\dist\mod-tools dist'`

Remedy: Right-click PowerShell or Windows Terminal -> Run as administrator.
Alternatively, pass `-InstallPath` pointing to a folder the mod owns
(e.g. `$env:USERPROFILE\Desktop\gaw-modtools`).

### Chrome not found

Symptom: `WARN: Chrome not found on PATH or common locations.`

Remedy: Script continues successfully; Chrome just doesn't auto-open.
The mod manually navigates to `chrome://extensions`. Not a fatal error.

### Chrome is using the install folder

Symptom: `Extraction failed: ... being used by another process`

Remedy: In `chrome://extensions`, disable GAW ModTools, then re-run the
script. Or close Chrome entirely, run the script, then re-open Chrome.

### Version mismatch after install

Symptom: `VERSION MISMATCH: expected '10.3.0', got '10.2.0'`

Remedy: The downloaded ZIP does not match the expected release. Verify the
URL resolves to the correct release asset on GitHub. Check that GitHub
Actions completed and published the release before sharing the link.

### manifest.json not found in extracted files

Symptom: `WARN: manifest.json not found in extracted files`

Remedy: The ZIP is missing the manifest -- the build step failed or the wrong
file was distributed. Re-run `build-zip.ps1` and verify `manifest.json` is
present in the output ZIP before sharing.

### PowerShell version too old

Symptom: `ERROR: This script requires PowerShell 5.1 or later.`

Remedy: The mod is on an extremely old system. Install Windows Management
Framework 5.1 from microsoft.com, or send them a link to the PS 7 installer
at `https://aka.ms/powershell`.

---

## D. TESTING NOTES

Before shipping any update to mods:

1. Run `build-zip.ps1` and confirm the output ZIP contains `manifest.json`
   with the correct version.

2. Run the installer pointing at the freshly built ZIP:
   ```
   powershell -ExecutionPolicy Bypass -File scripts\install-gaw-modtools.ps1 -ZipUrl "file:///D:/AI/_PROJECTS/dist/gaw-modtools-chrome-store-v10.x.x.zip" -ExpectedVersion "10.x.x"
   ```
   Note: `file://` URIs do not work with `WebClient.DownloadFile`. For local
   testing, copy the ZIP to a local HTTP server or use a GitHub pre-release.

3. Confirm the backup folder was created next to the install path with the
   correct timestamp suffix.

4. Confirm `chrome://extensions` opened automatically.

5. Confirm the extension card shows the new version after clicking reload.

6. Confirm the clipboard contains the full timestamped debug log.

7. Confirm the E-C-G beep played (659 Hz, 523 Hz, 784 Hz).

8. Confirm a `.log` file was written under `D:\AI\_PROJECTS\logs\`.

9. Test on a machine without admin rights to verify the write-permission
   error message is clear and actionable.

10. Test with a bad URL to confirm the download failure message is clear.

---

## E. PARSE-CHECK PROOF

Both engines confirmed clean on 2026-05-09:

```
PARSE OK (PowerShell 5.1)
PARSE OK (PowerShell 7)
```

Command used:

```
$p = 'D:\AI\_PROJECTS\modtools-ext\scripts\install-gaw-modtools.ps1'
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile($p, [ref]$null, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Host ('L' + $_.Extent.StartLineNumber + ': ' + $_.Message) }
} else { Write-Host 'PARSE OK' }
```

Script also avoids all PS 7-only constructs (no `??`, no `?:`, no `?.`,
no `&&`/`||` chaining, no `-AsPlainText`, no `-Parallel`) so it runs
identically under `powershell.exe` 5.1 and `pwsh.exe` 7.x. The file was
BOM-prefixed (0xEF 0xBB 0xBF) after write to ensure Windows PowerShell 5.1
does not misparse non-ASCII bytes if any are accidentally introduced.

---

## F. INTEGRATION WITH AGENT 2 (ZIP delivery path)

Agent 2 owns the build and distribution pipeline. The ZIP this script
downloads can come from two sources:

### Option 1 -- GitHub Releases (preferred, permanent URLs)

`build-zip.ps1` produces the ZIP. A GitHub Actions workflow (or manual
`gh release create`) publishes it as a release asset. The asset URL format:

```
https://github.com/YourOrg/gaw-modtools/releases/download/v{VERSION}/gaw-modtools.zip
```

This URL is permanent -- it does not expire. Update `$DEFAULT_ZIP_URL` in
`install-gaw-modtools.ps1` each release cycle so mods who run the script
with no arguments always get the latest.

In the Discord DM, pass the versioned release URL explicitly via `-ZipUrl`
so the mod gets the exact release you tested, not whatever "latest" resolves
to at script-run time.

### Option 2 -- Discord CDN (fallback for rapid hotfixes)

Upload the ZIP directly to Discord (as an attachment in the DM). Discord
generates a CDN URL like `https://cdn.discordapp.com/attachments/...`.
This works but expires in ~24 hours. Use only for hotfix situations where
a GitHub release is not yet published.

### Handoff contract between Agent 2 and this script

Agent 2 must guarantee:
- ZIP contains `manifest.json` at the root level (not inside a subdirectory).
- ZIP contains all files listed in `build-zip.ps1`'s `$includes` array.
- The `manifest.json` `version` field matches the release tag.

This script does not impose a directory structure inside the ZIP beyond
requiring `manifest.json` at root. `Expand-Archive` flattens to the install
folder directly.

---

## G. FUTURE: SCHEDULED AUTO-UPDATE

Once the installer is proven stable, a Windows Task Scheduler hook can run
it on a daily or weekly schedule so mods never have to manually update.

### Approach

1. Write a wrapper script `auto-update-gaw-modtools.ps1` that:
   - Fetches the latest release metadata from GitHub API:
     `https://api.github.com/repos/YourOrg/gaw-modtools/releases/latest`
   - Extracts `tag_name` and compares to the version in the currently
     installed `manifest.json`.
   - If a newer version is available, calls `install-gaw-modtools.ps1`
     with `-NoPause`.
   - Logs the result to `D:\AI\_PROJECTS\logs\auto-update-YYYYMMDD.log`.

2. Register a Task Scheduler job (requires admin or S4U logon type to
   avoid Windows Terminal flash on Win11 -- see
   `~/.claude/memory/feedback_win11_terminal_hidden.md`):
   ```
   $action = New-ScheduledTaskAction -Execute 'pwsh.exe' `
       -Argument '-NonInteractive -WindowStyle Hidden -File D:\AI\_PROJECTS\modtools-ext\scripts\auto-update-gaw-modtools.ps1 -NoPause'
   $trigger = New-ScheduledTaskTrigger -Daily -At '09:00'
   Register-ScheduledTask -TaskName 'GAW ModTools Auto-Update' `
       -Action $action -Trigger $trigger -RunLevel Highest
   ```

3. The bake-in for Win11 hidden-window suppression is the S4U logon type
   (no password stored, runs as current user at logon). See the existing
   scheduled-task infrastructure in the repo for the pattern already used
   by maintenance scripts.

### Notes

- Auto-update should be opt-in for mods, not default. Ship the manual
  installer first and validate it with the mod team before wiring up the
  scheduler.
- The GitHub API rate limit is 60 unauthenticated requests/hour per IP,
  which is fine for a daily check. No token needed.
- A `$DEFAULT_ZIP_URL` pointing to the `latest` release asset means the
  auto-updater can call the installer directly without parsing JSON if
  simplicity is preferred:
  `https://github.com/YourOrg/gaw-modtools/releases/latest/download/gaw-modtools.zip`
  This always resolves to the most recent published release.

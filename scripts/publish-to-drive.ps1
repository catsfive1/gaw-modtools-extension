#requires -Version 5.1
<#
.SYNOPSIS
    Build the GAW ModTools extension and publish it to the team Google Drive
    folder so other mods can grab fresh builds.
.DESCRIPTION
    Calls build-zip.ps1 with -NoPause, then copies:
      - the versioned ZIP (gaw-modtools-chrome-store-vN.N.N.zip)
      - a stable filename copy (gaw-modtools-LATEST.zip)
      - VERSION.txt (semantic version + sha256 + build timestamp)
      - CHANGELOG.md (last 20 commits, easier than asking mods to scroll git)
      - INSTALL.md (paste-ready install instructions for new mods)
    to E:\My Drive\GAW\mod-tools (the team's shared folder).
.PARAMETER NoPause
    Skip the final Read-Host pause.
.NOTES
    Commander spec 2026-05-08: "publish mod tools to a cloud location that
    enables the other mods to easily update the extension."
#>

[CmdletBinding()]
param(
    [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# --- Pre-flight ---------------------------------------------------------
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "Requires PS 5.1+. Found $($PSVersionTable.PSVersion)" -ForegroundColor Red
    exit 1
}

$RepoRoot   = Split-Path -Parent $PSScriptRoot
$DriveRoot  = 'E:\My Drive\GAW\mod-tools'
$DistRoot   = 'D:\AI\_PROJECTS\dist'
$LogsDir    = 'D:\AI\_PROJECTS\logs'
$LogPath    = Join-Path $LogsDir ("publish-to-drive-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir | Out-Null }

$log = New-Object System.Collections.ArrayList
function Say { param($msg, $color='Cyan'); Write-Host $msg -ForegroundColor $color; [void]$log.Add($msg) }

# --- Validate target ----------------------------------------------------
Say "Publish target: $DriveRoot"
if (-not (Test-Path $DriveRoot)) {
    Say "Target folder does not exist. Creating..." 'Yellow'
    try {
        New-Item -ItemType Directory -Path $DriveRoot -Force | Out-Null
        Say "  created" 'Green'
    } catch {
        Say "FAILED to create $DriveRoot : $_" 'Red'
        exit 2
    }
}

# --- Step 1: build ------------------------------------------------------
Say ""
Say "=== Step 1: build extension =================================" 'Yellow'
$buildScript = Join-Path $PSScriptRoot 'build-zip.ps1'
if (-not (Test-Path $buildScript)) {
    Say "Cannot find build-zip.ps1 at $buildScript" 'Red'
    exit 2
}
try {
    & $buildScript -NoPause | ForEach-Object { Say "  $_" 'Gray' }
    if ($LASTEXITCODE -ne 0) { throw "build-zip exited with code $LASTEXITCODE" }
} catch {
    Say "BUILD FAILED: $_" 'Red'
    exit 2
}

# --- Step 2: locate latest ZIP -----------------------------------------
Say ""
Say "=== Step 2: locate built artifact ===========================" 'Yellow'
$zips = Get-ChildItem -Path $DistRoot -Filter 'gaw-modtools-chrome-store-v*.zip' |
        Sort-Object LastWriteTime -Descending
if (-not $zips -or $zips.Count -eq 0) {
    Say "No ZIP found in $DistRoot" 'Red'
    exit 2
}
$latestZip = $zips[0]
Say "  $($latestZip.Name) ($([math]::Round($latestZip.Length/1KB)) KB)"

# Read manifest version for VERSION.txt
$manifestPath = Join-Path $RepoRoot 'manifest.json'
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$semver = $manifest.version
Say "  manifest version: $semver"

# Compute sha256
$hash = (Get-FileHash -Path $latestZip.FullName -Algorithm SHA256).Hash.ToLower()
Say "  sha256: $hash"

# --- Step 3: write VERSION.txt + INSTALL.md ----------------------------
Say ""
Say "=== Step 3: prepare metadata =================================" 'Yellow'
$buildTimestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz")
$versionTxt = @"
GAW ModTools -- Latest Build
============================
version:   $semver
file:      $($latestZip.Name)
sha256:    $hash
built:     $buildTimestamp

Stable filename for shareable links:
   gaw-modtools-LATEST.zip  (always points to this version)

Install: see INSTALL.md in this folder.
"@
$versionTxtPath = Join-Path $DriveRoot 'VERSION.txt'
$versionTxt | Set-Content -Path $versionTxtPath -Encoding UTF8
Say "  wrote $versionTxtPath"

$installMd = @"
# GAW ModTools -- Install Guide

## First-time install

1. Download **gaw-modtools-LATEST.zip** from this folder.
2. Right-click the ZIP and choose **Extract All...** to a folder you'll
   keep around (e.g. ``C:\Tools\gaw-modtools``). DO NOT delete this folder
   later -- Chrome reads from it on every launch.
3. Open Chrome. Go to ``chrome://extensions``.
4. Top-right, turn on **Developer mode**.
5. Top-left, click **Load unpacked**.
6. Pick the folder where you extracted the ZIP. The extension appears.
7. Pin it to your toolbar: click the puzzle icon (top right of Chrome),
   find **GAW ModTools**, click the pin icon next to its name.
8. Visit ``https://greatawakening.win`` while logged in.
9. Click the GAW ModTools icon in the toolbar to open the popup.
10. Click your invite link from the lead, OR paste your team token in the
    ? **Team Mod Token** field and click **Save**.
11. Refresh greatawakening.win. The status bar appears at the bottom.

## Updating to a newer version

1. Download the new **gaw-modtools-LATEST.zip** from this folder.
2. Extract it OVER your existing folder (replacing all files), OR delete
   the old folder and extract fresh.
3. Go to ``chrome://extensions`` and click the **? reload** icon on
   GAW ModTools.
4. Hard-refresh greatawakening.win (Ctrl+Shift+R).

That's it. Your token, settings, and chat history persist across updates
because the Chrome extension ID is fixed via ``manifest.key``.

## What's in this folder

| File | What |
|---|---|
| ``gaw-modtools-LATEST.zip`` | Newest build -- always download this one |
| ``gaw-modtools-chrome-store-vN.N.N.zip`` | Versioned snapshot, kept for rollback |
| ``VERSION.txt`` | Current version, sha256, build timestamp |
| ``CHANGELOG.md`` | Recent commits -- what changed in the last few releases |
| ``INSTALL.md`` | This file |

## If something breaks

1. ``chrome://extensions`` -> reload GAW ModTools.
2. Hard-refresh greatawakening.win (Ctrl+Shift+R).
3. If the bar disappears or auth fails, open the popup -> click
   **Force re-hydrate**.
4. Still broken? Click the ? **bug** icon in the status bar to file a
   report -- it auto-attaches a redacted debug snapshot.
5. Last resort: extract a previous versioned ZIP from this folder, point
   chrome://extensions at it via "Load unpacked".

-- catsfive
"@
$installMdPath = Join-Path $DriveRoot 'INSTALL.md'
$installMd | Set-Content -Path $installMdPath -Encoding UTF8
Say "  wrote $installMdPath"

# Recent commits as CHANGELOG
try {
    Push-Location $RepoRoot
    $gitLog = & git log --pretty=format:"%h %s" -n 20 2>&1
    Pop-Location
    if ($LASTEXITCODE -eq 0 -and $gitLog) {
        $changelog = "# GAW ModTools -- Recent commits`r`n`r`n``````" + "`r`n" + $gitLog + "`r`n" + "``````" + "`r`n"
        $changelogPath = Join-Path $DriveRoot 'CHANGELOG.md'
        $changelog | Set-Content -Path $changelogPath -Encoding UTF8
        Say "  wrote $changelogPath ($((($gitLog -split "`n").Count)) commits)"
    }
} catch {
    Say "  CHANGELOG write skipped: $_" 'DarkGray'
}

# --- Step 4: copy ZIPs --------------------------------------------------
Say ""
Say "=== Step 4: copy ZIPs to drive ===============================" 'Yellow'
$verDest    = Join-Path $DriveRoot $latestZip.Name
$latestDest = Join-Path $DriveRoot 'gaw-modtools-LATEST.zip'
Copy-Item -Path $latestZip.FullName -Destination $verDest -Force
Say "  $verDest"
Copy-Item -Path $latestZip.FullName -Destination $latestDest -Force
Say "  $latestDest"

# --- Step 5: cleanup old versioned ZIPs (keep last 5) ------------------
Say ""
Say "=== Step 5: prune old versioned snapshots ====================" 'Yellow'
$existing = Get-ChildItem -Path $DriveRoot -Filter 'gaw-modtools-chrome-store-v*.zip' |
            Sort-Object LastWriteTime -Descending
if ($existing.Count -gt 5) {
    $toRemove = $existing | Select-Object -Skip 5
    foreach ($f in $toRemove) {
        try {
            Remove-Item $f.FullName -Force
            Say "  pruned $($f.Name)" 'DarkGray'
        } catch {
            Say "  could not prune $($f.Name) : $_" 'Yellow'
        }
    }
} else {
    Say "  $($existing.Count) versioned ZIP(s); under 5-snapshot cap, nothing to prune"
}

# --- Step 6: report -----------------------------------------------------
Say ""
Say "=== PUBLISH SUMMARY ==========================================" 'Green'
Say "version:   $semver"
Say "sha256:    $hash"
Say "drive:     $DriveRoot"
Say "files:"
Get-ChildItem -Path $DriveRoot |
    Where-Object { -not $_.PSIsContainer } |
    Sort-Object Name |
    ForEach-Object { Say ("  {0,-50}  {1,8} bytes" -f $_.Name, $_.Length) }
Say ""
Say "Share link to send mods:" 'Yellow'
Say "  Right-click the 'mod-tools' folder in Drive -> Get link" 'DarkGray'
Say "  Set 'Anyone with the link' -> Viewer" 'DarkGray'
Say "  Mods download gaw-modtools-LATEST.zip from there" 'DarkGray'

# --- Step 7: clipboard + log + beep + pause ----------------------------
$logText = ($log -join [Environment]::NewLine)
try {
    $logText | Set-Clipboard
    Say ""
    Say "[full debug log copied to clipboard]" 'DarkGray'
} catch {
    Say "[clipboard copy failed: $_]" 'Yellow'
}
try { $logText | Set-Content -Path $LogPath -Encoding UTF8 } catch {}

# E-C-G beep
try {
    [Console]::Beep(659, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(523, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(784, 800)
} catch {}

if (-not $NoPause) { Read-Host 'Press Enter to exit' }
exit 0

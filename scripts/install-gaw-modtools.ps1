<#
.SYNOPSIS
  Download and install (or update) the GAW ModTools unpacked Chrome extension.
.DESCRIPTION
  Mods run this script after receiving the download link in the GAW Discord DM.
  The script downloads the ZIP, backs up the previous install, extracts the
  new files, verifies the manifest, then opens chrome://extensions so you can
  click the reload arrow. No manual extraction required.
.PARAMETER ZipUrl
  Full HTTPS URL to the .zip file (from Discord DM or GitHub Releases).
  Defaults to the latest GitHub Releases URL if omitted.
.PARAMETER InstallPath
  Where to extract the unpacked extension.
  Defaults to D:\AI\_PROJECTS\dist\mod-tools dist (the path already in Chrome).
.PARAMETER ExpectedVersion
  If provided, the script checks that manifest.json inside the ZIP reports
  this version. Leave blank to skip the version check.
.PARAMETER NoPause
  Skip the "Press Enter to exit" pause. Useful for scripted/automated runs.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install-gaw-modtools.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install-gaw-modtools.ps1 -ZipUrl "https://example.com/modtools.zip" -ExpectedVersion "10.3.0"
.NOTES
  Version: 1.0.0
  Requires: PowerShell 5.1+
  For mods: double-click or run from Windows Terminal.
#>

[CmdletBinding()]
param(
    [string]$ZipUrl = '',
    [string]$InstallPath = 'D:\AI\_PROJECTS\dist\mod-tools dist',
    [string]$ExpectedVersion = '',
    [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# Force TLS 1.2+ for all web requests (required on PS 5.1 / older Win10)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
$log = New-Object System.Collections.ArrayList

function Log {
    param($msg, $color = 'Gray')
    $stamped = ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $msg)
    Write-Host $stamped -ForegroundColor $color
    [void]$log.Add($stamped)
}

# ---------------------------------------------------------------------------
# Default ZIP URL (GitHub Releases latest)
# Update this constant each release cycle.
# ---------------------------------------------------------------------------
$DEFAULT_ZIP_URL = 'https://github.com/YourOrg/gaw-modtools/releases/latest/download/gaw-modtools.zip'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Assert-PSVersion {
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        Write-Host 'ERROR: This script requires PowerShell 5.1 or later.' -ForegroundColor Red
        Write-Host ("  Found: " + $PSVersionTable.PSVersion.ToString()) -ForegroundColor Red
        Write-Host '  Fix: Install PowerShell 5.1+ from https://aka.ms/powershell' -ForegroundColor Yellow
        exit 1
    }
    Log ("PowerShell version: " + $PSVersionTable.PSVersion.ToString()) 'Cyan'
}

function Assert-WritePermission {
    param([string]$dir)
    $testFile = Join-Path $dir '.write-test'
    try {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        [System.IO.File]::WriteAllText($testFile, 'ok')
        Remove-Item $testFile -Force -ErrorAction SilentlyContinue
    } catch {
        throw ("No write permission to '$dir'. " +
               "Try running PowerShell as Administrator, or check that the folder is not read-only.")
    }
}

function Test-NetworkReachability {
    param([string]$url)
    try {
        $uri = [System.Uri]$url
        $host_ = $uri.Host
        Log ("Network check: $host_") 'Cyan'
        $req = [System.Net.WebRequest]::Create("https://$host_")
        $req.Method = 'HEAD'
        $req.Timeout = 8000
        $resp = $req.GetResponse()
        $resp.Close()
        Log "  -> reachable" 'Green'
        return $true
    } catch {
        Log ("  -> WARN: reachability check failed: " + $_.Exception.Message) 'Yellow'
        return $false
    }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
$startTime = Get-Date
$installOk = $false
$installedVersion = '(unknown)'
$backupPath = ''
$extractCount = 0

try {
    Assert-PSVersion

    # Resolve URL
    $resolvedUrl = $ZipUrl
    if (-not $resolvedUrl) {
        $resolvedUrl = $DEFAULT_ZIP_URL
        Log "No -ZipUrl provided; using default: $resolvedUrl" 'Yellow'
    }
    Log "ZIP URL: $resolvedUrl" 'Cyan'

    # Network pre-flight
    Test-NetworkReachability -url $resolvedUrl | Out-Null

    # Write permission pre-flight
    Log "Checking write permission: $InstallPath" 'Cyan'
    Assert-WritePermission -dir $InstallPath

    # Download ZIP to temp
    $tempZip = Join-Path $env:TEMP ("gaw-modtools-" + [guid]::NewGuid().ToString('N') + ".zip")
    Log "Downloading to: $tempZip" 'Cyan'

    $wc = New-Object System.Net.WebClient
    try {
        $wc.DownloadFile($resolvedUrl, $tempZip)
    } catch {
        throw ("Download failed: " + $_.Exception.Message + "`n" +
               "  Hint: Check the URL is correct and you have internet access. " +
               "If using a Discord link, make sure it has not expired.")
    } finally {
        $wc.Dispose()
    }

    $zipSizeKB = [math]::Round((Get-Item $tempZip).Length / 1KB, 1)
    $zipSha = (Get-FileHash $tempZip -Algorithm SHA256).Hash.ToLower()
    Log "Downloaded: $zipSizeKB KB  sha256: $zipSha" 'Cyan'

    # Backup previous install
    if (Test-Path $InstallPath) {
        $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
        $backupPath = ($InstallPath.TrimEnd('\') + ".bak-$ts")
        Log "Backing up previous install to: $backupPath" 'Cyan'
        try {
            Copy-Item -Path $InstallPath -Destination $backupPath -Recurse -Force
            Log "  -> backup OK" 'Green'
        } catch {
            Log ("  -> WARN: backup failed: " + $_.Exception.Message +
                 ". Continuing anyway.") 'Yellow'
            $backupPath = '(backup failed)'
        }
    } else {
        Log "No previous install found; fresh install." 'Cyan'
    }

    # Wipe existing contents (keep the folder so Chrome path stays valid)
    if (Test-Path $InstallPath) {
        Get-ChildItem $InstallPath -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    } else {
        New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
    }

    # Extract
    Log "Extracting to: $InstallPath" 'Cyan'
    try {
        Expand-Archive -Path $tempZip -DestinationPath $InstallPath -Force
    } catch {
        throw ("Extraction failed: " + $_.Exception.Message + "`n" +
               "  Hint: Make sure the destination folder is not open in another program " +
               "(e.g. Windows Explorer or Chrome loading from it).")
    }

    $extractCount = (Get-ChildItem $InstallPath -Recurse -File).Count
    Log "Files extracted: $extractCount" 'Cyan'

    # Verify manifest.json
    $manifestPath = Join-Path $InstallPath 'manifest.json'
    if (Test-Path $manifestPath) {
        try {
            $mj = Get-Content $manifestPath -Raw | ConvertFrom-Json
            $installedVersion = $mj.version
            Log "manifest.json version: $installedVersion" 'Green'

            if ($ExpectedVersion -and ($installedVersion -ne $ExpectedVersion)) {
                Log ("VERSION MISMATCH: expected '$ExpectedVersion', got '$installedVersion'. " +
                     "The ZIP may be the wrong file. Check the download link.") 'Yellow'
            } elseif ($ExpectedVersion) {
                Log "Version check: OK ($installedVersion)" 'Green'
            }
        } catch {
            Log ("WARN: could not parse manifest.json: " + $_.Exception.Message) 'Yellow'
        }
    } else {
        Log "WARN: manifest.json not found in extracted files. The ZIP may be malformed." 'Yellow'
    }

    # Cleanup temp ZIP
    Remove-Item $tempZip -Force -ErrorAction SilentlyContinue

    $installOk = $true

    # Open chrome://extensions
    Log "" 'Gray'
    Log "Opening Chrome extensions page..." 'Cyan'
    try {
        $chrome = Get-Command chrome -ErrorAction SilentlyContinue
        if (-not $chrome) {
            # Try common install paths
            $chromePaths = @(
                "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
                "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
                "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
            )
            $chromePath = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
            if ($chromePath) {
                Start-Process $chromePath 'chrome://extensions'
                Log "Opened chrome://extensions" 'Green'
            } else {
                Log "WARN: Chrome not found on PATH or common locations." 'Yellow'
                Log "  -> Open Chrome manually and go to: chrome://extensions" 'Yellow'
            }
        } else {
            Start-Process chrome.exe 'chrome://extensions'
            Log "Opened chrome://extensions" 'Green'
        }
    } catch {
        Log ("WARN: could not open Chrome automatically: " + $_.Exception.Message) 'Yellow'
        Log "  -> Open Chrome manually and go to: chrome://extensions" 'Yellow'
    }

    $elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)

    # ---------------------------------------------------------------------------
    # Final report
    # ---------------------------------------------------------------------------
    Log "" 'Gray'
    Log "=======================================" 'Green'
    Log "  GAW ModTools Install Complete" 'Green'
    Log "=======================================" 'Green'
    Log ("  Version installed : " + $installedVersion) 'Green'
    Log ("  Files extracted   : " + $extractCount) 'Green'
    Log ("  Install path      : " + $InstallPath) 'Green'
    if ($backupPath) {
        Log ("  Backup location   : " + $backupPath) 'Green'
    }
    Log ("  ZIP sha256        : " + $zipSha) 'Green'
    Log ("  Elapsed           : " + $elapsed + "s") 'Green'
    Log "=======================================" 'Green'
    Log "" 'Gray'
    Log "NEXT STEPS:" 'Cyan'
    Log "  1. In Chrome, go to chrome://extensions (tab should be open)." 'Cyan'
    Log "  2. Find 'GAW ModTools' in the list." 'Cyan'
    Log "  3. Click the circular reload arrow on the card." 'Cyan'
    Log "  4. Refresh greatawakening.win and verify the toolbar appears." 'Cyan'
    Log "" 'Gray'
    Log "  If you do not see GAW ModTools in the list:" 'Yellow'
    Log "  - Make sure 'Developer mode' toggle (top-right) is ON." 'Yellow'
    Log ("  - Click 'Load unpacked' and pick this folder: " + $InstallPath) 'Yellow'

} catch {
    $errMsg = $_.Exception.Message
    $errPos = $_.InvocationInfo.PositionMessage
    Log "" 'Gray'
    Log "=======================================" 'Red'
    Log "  INSTALL FAILED" 'Red'
    Log "=======================================" 'Red'
    Log ("  Error   : " + $errMsg) 'Red'
    Log ("  At      : " + $errPos) 'DarkGray'
    Log "" 'Red'
    Log "Common fixes:" 'Yellow'
    Log "  - Run PowerShell as Administrator if you see 'access denied'." 'Yellow'
    Log "  - Check your internet connection if the download failed." 'Yellow'
    Log "  - Make sure Chrome is not actively using the install folder." 'Yellow'
    Log "  - If the Discord link has expired, ask for a fresh one." 'Yellow'
    Log "=======================================" 'Red'
}

# ---------------------------------------------------------------------------
# MANDATORY FOUR-STEP ENDING BLOCK
# ---------------------------------------------------------------------------

# Step 1 already written above via Log(); log buffer is complete.

# Step 2: Persist log to file for recovery, then copy to clipboard.
$logRoot = 'D:\AI\_PROJECTS\logs'
try {
    if (-not (Test-Path $logRoot)) { New-Item -ItemType Directory -Path $logRoot | Out-Null }
    $logFile = Join-Path $logRoot ("install-gaw-modtools-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
    ($log -join "`r`n") | Set-Content -Path $logFile -Encoding UTF8
    Write-Host ("[log saved -> $logFile]") -ForegroundColor DarkGray
} catch {
    Write-Host ('[WARN: could not save log file: ' + $_.Exception.Message + ']') -ForegroundColor Yellow
}

($log -join "`r`n") | Set-Clipboard
Write-Host '[FULL DEBUG LOG COPIED TO CLIPBOARD]' -ForegroundColor Green

# Step 3: E-C-G beep
try {
    [Console]::Beep(659, 160)
    Start-Sleep -Milliseconds 100
    [Console]::Beep(523, 160)
    Start-Sleep -Milliseconds 100
    [Console]::Beep(784, 800)
} catch {}

# Step 4: Pause
if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }

if ($installOk) { exit 0 } else { exit 2 }

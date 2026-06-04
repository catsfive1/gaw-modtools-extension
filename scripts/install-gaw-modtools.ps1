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
.PARAMETER InviteCode
  Optional invite code (e.g. mt_invite_xxx) received in the Discord DM.
  If provided, it is written to the clipboard so you can paste it into the
  extension popup on first run. The script also tells you exactly where to paste it.
.PARAMETER NoPause
  Skip the "Press Enter to exit" pause. Useful for scripted/automated runs.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install-gaw-modtools.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install-gaw-modtools.ps1 -ZipUrl "https://example.com/modtools.zip" -ExpectedVersion "10.6.0"
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install-gaw-modtools.ps1 -InviteCode "mt_invite_abc123"
.NOTES
  Version: 1.1.0
  Requires: PowerShell 5.1+
  For mods: right-click -> Run with PowerShell, or double-click install-gaw-modtools.bat
#>

[CmdletBinding()]
param(
    [string]$ZipUrl = '',
    [string]$InstallPath = 'D:\AI\_PROJECTS\dist\mod-tools dist',
    [string]$ExpectedVersion = '',
    [string]$InviteCode = '',
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
# v10.7.0 UIUX-06 B.5: replaced YourOrg placeholder with real GitHub org (catsfive1)
$DEFAULT_ZIP_URL = 'https://github.com/catsfive1/gaw-modtools-extension/releases/latest/download/gaw-modtools.zip'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Assert-PSVersion {
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        Write-Host 'ERROR: This script requires PowerShell 5.1 or later.' -ForegroundColor Red
        Write-Host ('  Found: ' + $PSVersionTable.PSVersion.ToString()) -ForegroundColor Red
        Write-Host '  Fix: Install PowerShell 5.1+ from https://aka.ms/powershell' -ForegroundColor Yellow
        exit 1
    }
    if ($PSVersionTable.PSVersion.Major -eq 5 -and $PSVersionTable.PSVersion.Minor -lt 1) {
        Write-Host 'ERROR: This script requires PowerShell 5.1 or later.' -ForegroundColor Red
        Write-Host ('  Found: ' + $PSVersionTable.PSVersion.ToString()) -ForegroundColor Red
        Write-Host '  Fix: Install Windows Management Framework 5.1 from microsoft.com' -ForegroundColor Yellow
        exit 1
    }
    Log ('PowerShell version: ' + $PSVersionTable.PSVersion.ToString()) 'Cyan'
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
        throw ('No write permission to ''' + $dir + '''. ' +
               'Try running PowerShell as Administrator, or pass -InstallPath ' +
               'pointing to a folder you own (e.g. your Desktop).')
    }
}

function Assert-DiskSpace {
    param([string]$dir, [long]$minFreeBytes)
    try {
        $root = [System.IO.Path]::GetPathRoot($dir)
        $drive = Get-PSDrive -Name ($root.TrimEnd('\').TrimEnd(':')) -ErrorAction SilentlyContinue
        if ($null -ne $drive -and $null -ne $drive.Free) {
            $freeMB = [math]::Round($drive.Free / 1MB, 1)
            $minMB  = [math]::Round($minFreeBytes / 1MB, 1)
            Log ('Disk free on ' + $root + ': ' + $freeMB + ' MB') 'Cyan'
            if ($drive.Free -lt $minFreeBytes) {
                throw ('Insufficient disk space: ' + $freeMB + ' MB free, need at least ' +
                       $minMB + ' MB. Free up space and try again.')
            }
            Log ('  -> disk space OK (need ' + $minMB + ' MB)') 'Green'
        } else {
            Log '  -> disk space check skipped (could not read drive info)' 'Yellow'
        }
    } catch {
        if ($_.Exception.Message -like '*Insufficient disk space*') { throw }
        Log ('  -> disk space check failed (non-fatal): ' + $_.Exception.Message) 'Yellow'
    }
}

function Test-NetworkReachability {
    param([string]$url)
    try {
        $uri = [System.Uri]$url
        $hostName = $uri.Host
        Log ('Network check: ' + $hostName) 'Cyan'
        $req = [System.Net.WebRequest]::Create('https://' + $hostName)
        $req.Method = 'HEAD'
        $req.Timeout = 8000
        $resp = $req.GetResponse()
        $resp.Close()
        Log '  -> reachable' 'Green'
        return $true
    } catch {
        Log ('  -> WARN: reachability check failed: ' + $_.Exception.Message) 'Yellow'
        return $false
    }
}

function Find-Browser {
    # Returns the path to Chrome, Brave, or Edge (first found), or empty string.
    $candidates = @(
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe",
        "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
        "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
    $found = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($found) { return $found }
    # Fallback: check PATH
    $cmd = Get-Command chrome -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $cmd = Get-Command brave -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $cmd = Get-Command msedge -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return ''
}

# Map a browser executable path to its extensions-page URL.
# v10.18.5 fix (storm-flagged P1): hardcoding `chrome://extensions` for every
# browser meant Brave operators got nothing useful when the installer launched
# the browser to that URL -- Brave does not alias the chrome:// scheme. The
# leaf-name match below covers the same three browsers Find-Browser detects.
function Get-ExtensionsUrl {
    param([string]$browserPath)
    if (-not $browserPath) { return 'chrome://extensions' }
    $leaf = ''
    try { $leaf = (Split-Path -Leaf $browserPath).ToLower() } catch { $leaf = '' }
    if ($leaf -like 'brave*')  { return 'brave://extensions' }
    if ($leaf -like 'msedge*' -or $leaf -like 'edge*') { return 'edge://extensions' }
    return 'chrome://extensions'
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
$startTime = Get-Date
$installOk = $false
$installedVersion = '(unknown)'
$backupPath = ''
$extractCount = 0
$zipSha = '(not computed)'

Log '============================================' 'Cyan'
Log '  GAW ModTools Installer v1.1.0' 'Cyan'
Log '============================================' 'Cyan'

try {
    # Pre-flight: PS version
    Assert-PSVersion

    # Pre-flight: disk space (50 MB minimum)
    Assert-DiskSpace -dir $InstallPath -minFreeBytes 52428800

    # Resolve URL
    $resolvedUrl = $ZipUrl
    if (-not $resolvedUrl) {
        $resolvedUrl = $DEFAULT_ZIP_URL
        Log ('No -ZipUrl provided; using default: ' + $resolvedUrl) 'Yellow'
    }
    Log ('ZIP URL: ' + $resolvedUrl) 'Cyan'

    # Pre-flight: browser check (non-fatal)
    $browserPath = Find-Browser
    if ($browserPath) {
        Log ('Browser found: ' + $browserPath) 'Green'
    } else {
        Log 'WARN: Chrome/Brave/Edge not found. You will need to open chrome://extensions manually.' 'Yellow'
    }

    # Pre-flight: network reachability
    Test-NetworkReachability -url $resolvedUrl | Out-Null

    # Pre-flight: write permission
    Log ('Checking write permission: ' + $InstallPath) 'Cyan'
    Assert-WritePermission -dir $InstallPath

    # Download ZIP to temp
    $tempZip = Join-Path $env:TEMP ('gaw-modtools-' + [guid]::NewGuid().ToString('N') + '.zip')
    Log ('Downloading to temp: ' + $tempZip) 'Cyan'

    $wc = New-Object System.Net.WebClient
    try {
        $wc.DownloadFile($resolvedUrl, $tempZip)
    } catch {
        throw ('Download failed: ' + $_.Exception.Message + "`r`n" +
               '  Hint: Check the URL is correct and you have internet access. ' +
               'If using a Discord link, make sure it has not expired (links expire after ~24h).')
    } finally {
        $wc.Dispose()
    }

    $zipSizeKB = [math]::Round((Get-Item $tempZip).Length / 1KB, 1)
    $zipSha = (Get-FileHash $tempZip -Algorithm SHA256).Hash.ToLower()
    Log ('Downloaded: ' + $zipSizeKB + ' KB  sha256: ' + $zipSha) 'Cyan'

    # Backup previous install
    if (Test-Path $InstallPath) {
        $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
        $backupPath = ($InstallPath.TrimEnd('\') + '.bak-' + $ts)
        Log ('Backing up previous install to: ' + $backupPath) 'Cyan'
        try {
            Copy-Item -Path $InstallPath -Destination $backupPath -Recurse -Force
            Log '  -> backup OK' 'Green'
        } catch {
            Log ('  -> WARN: backup failed: ' + $_.Exception.Message + '. Continuing anyway.') 'Yellow'
            $backupPath = '(backup failed)'
        }
    } else {
        Log 'No previous install found; this is a fresh install.' 'Cyan'
    }

    # Wipe existing contents (keep the folder so the Chrome path stays valid)
    if (Test-Path $InstallPath) {
        Get-ChildItem $InstallPath -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    } else {
        New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
    }

    # Extract
    Log ('Extracting to: ' + $InstallPath) 'Cyan'
    try {
        Expand-Archive -Path $tempZip -DestinationPath $InstallPath -Force
    } catch {
        throw ('Extraction failed: ' + $_.Exception.Message + "`r`n" +
               '  Hint: Make sure the folder is not open in another program ' +
               '(e.g. Windows Explorer or Chrome loading from it). ' +
               'In Chrome, disable GAW ModTools, then re-run this script.')
    }

    $extractCount = (Get-ChildItem $InstallPath -Recurse -File).Count
    Log ('Files extracted: ' + $extractCount) 'Cyan'

    # Verify manifest.json
    $manifestPath = Join-Path $InstallPath 'manifest.json'
    if (Test-Path $manifestPath) {
        try {
            $mj = Get-Content $manifestPath -Raw | ConvertFrom-Json
            $installedVersion = $mj.version
            Log ('manifest.json version: ' + $installedVersion) 'Green'

            if ($ExpectedVersion -and ($installedVersion -ne $ExpectedVersion)) {
                Log ('VERSION MISMATCH: expected ''' + $ExpectedVersion + ''', got ''' +
                     $installedVersion + '''. The ZIP may be the wrong file. Check the download link.') 'Yellow'
            } elseif ($ExpectedVersion) {
                Log ('Version check: OK (' + $installedVersion + ')') 'Green'
            }
        } catch {
            Log ('WARN: could not parse manifest.json: ' + $_.Exception.Message) 'Yellow'
        }
    } else {
        Log 'WARN: manifest.json not found in extracted files. The ZIP may be malformed.' 'Yellow'
    }

    # Cleanup temp ZIP
    Remove-Item $tempZip -Force -ErrorAction SilentlyContinue

    $installOk = $true

    # Open the extensions page in browser (per-browser URL scheme).
    Log '' 'Gray'
    Log 'Opening extensions page in browser...' 'Cyan'
    $extUrl = Get-ExtensionsUrl $browserPath
    if ($browserPath) {
        try {
            Start-Process $browserPath $extUrl
            Log ('Opened ' + $extUrl) 'Green'
        } catch {
            Log ('WARN: could not open browser automatically: ' + $_.Exception.Message) 'Yellow'
            Log ('  -> Open your browser manually and go to: ' + $extUrl) 'Yellow'
        }
    } else {
        Log '  -> Open Chrome/Brave/Edge manually and go to: chrome://extensions (Brave: brave://extensions, Edge: edge://extensions)' 'Yellow'
    }

    $elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)

    # ---------------------------------------------------------------------------
    # InviteCode handling
    # ---------------------------------------------------------------------------
    if ($InviteCode) {
        Log '' 'Gray'
        Log '============================================' 'Magenta'
        Log '  INVITE CODE DETECTED' 'Magenta'
        Log ('  Code: ' + $InviteCode) 'Magenta'
        Log '============================================' 'Magenta'
        Log 'Your invite code has been noted.' 'Magenta'
        Log 'After clicking the extension reload arrow:' 'Magenta'
        Log '  1. Click the GAW ModTools icon in your Chrome toolbar.' 'Magenta'
        Log '  2. Go to the Tokens tab.' 'Magenta'
        Log '  3. Paste the invite code shown above.' 'Magenta'
        Log '  4. Click Claim.' 'Magenta'
        Log 'OR: click the invite link in your Discord DM -- it auto-fills.' 'Magenta'
    }

    # ---------------------------------------------------------------------------
    # Final success report
    # ---------------------------------------------------------------------------
    Log '' 'Gray'
    Log '=======================================' 'Green'
    Log '  GAW ModTools Install Complete' 'Green'
    Log '=======================================' 'Green'
    Log ('  Version installed : ' + $installedVersion) 'Green'
    Log ('  Files extracted   : ' + $extractCount) 'Green'
    Log ('  Install path      : ' + $InstallPath) 'Green'
    if ($backupPath -and $backupPath -ne '(backup failed)') {
        Log ('  Backup location   : ' + $backupPath) 'Green'
    }
    Log ('  ZIP sha256        : ' + $zipSha) 'Green'
    Log ('  Elapsed           : ' + $elapsed + 's') 'Green'
    Log '=======================================' 'Green'
    Log '' 'Gray'
    Log 'NEXT STEPS:' 'Cyan'
    Log '  1. In Chrome/Brave/Edge, go to chrome://extensions (tab should be open).' 'Cyan'
    Log '  2. Make sure Developer mode toggle (top-right) is ON.' 'Cyan'
    Log '  3. Find GAW ModTools in the list.' 'Cyan'
    Log '  4. Click the circular reload arrow on the card.' 'Cyan'
    Log '  5. Refresh greatawakening.win and verify the toolbar shows v' + $installedVersion + '.' 'Cyan'
    Log '' 'Gray'
    Log '  If GAW ModTools is not in the list yet:' 'Yellow'
    Log '  - Click Load unpacked and select this folder:' 'Yellow'
    Log ('    ' + $InstallPath) 'Yellow'
    if ($InviteCode) {
        Log '' 'Gray'
        Log '  Then paste your invite code in the extension popup -> Tokens tab.' 'Yellow'
    }

} catch {
    $errMsg  = $_.Exception.Message
    $errPos  = $_.InvocationInfo.PositionMessage
    Log '' 'Gray'
    Log '=======================================' 'Red'
    Log '  INSTALL FAILED' 'Red'
    Log '=======================================' 'Red'
    Log ('  Error   : ' + $errMsg) 'Red'
    Log ('  At      : ' + $errPos) 'DarkGray'
    Log '' 'Red'
    Log 'Common fixes:' 'Yellow'
    Log '  - Run PowerShell as Administrator if you see access denied.' 'Yellow'
    Log '  - Check your internet connection if the download failed.' 'Yellow'
    Log '  - If the Discord link expired, ask for a fresh one (links expire in ~24h).' 'Yellow'
    Log '  - Make sure Chrome is not actively loading from the install folder.' 'Yellow'
    Log '  - For no-admin machines, pass -InstallPath "$env:USERPROFILE\Desktop\gaw-modtools"' 'Yellow'
    Log '=======================================' 'Red'
}

# ---------------------------------------------------------------------------
# MANDATORY FOUR-STEP ENDING BLOCK
# ---------------------------------------------------------------------------

# Step 1 already complete -- all output went through Log(); $log buffer is full.

# Step 2: Persist log to file, then copy FULL debug log to clipboard.
$logRoot = 'D:\AI\_PROJECTS\logs'
$logFile  = ''
try {
    if (-not (Test-Path $logRoot)) { New-Item -ItemType Directory -Path $logRoot -Force | Out-Null }
    $logFile = Join-Path $logRoot ('install-gaw-modtools-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
    ($log -join "`r`n") | Set-Content -Path $logFile -Encoding UTF8
    Write-Host ('[log saved -> ' + $logFile + ']') -ForegroundColor DarkGray
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

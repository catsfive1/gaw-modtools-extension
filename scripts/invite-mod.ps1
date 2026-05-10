<#
.SYNOPSIS
    One-command invite flow for adding a new mod to GAW ModTools.

.DESCRIPTION
    Wraps the existing token-provision + delivery pipeline into a single
    command that produces DM-ready text Commander pastes into Discord/Slack.

    What it does, end to end:
      1. Pre-flight: PS / OS / TLS / worker reachability dump
      2. Prompt for new mod's GAW username
      3. Prompt for lead token (hidden via masking, NOT SecureString -- PS 5.1 bug)
      4. Mint a cryptographically secure 32-byte base64url token client-side
      5. POST to /admin/import-tokens-from-kv to register at the worker
      6. Verify the Drive shared folder is up to date (E:\My Drive\GAW\mod-tools\)
      7. Build the DM-ready text:
            - Greeting + the operator's name
            - Direct link to the install ZIP via Drive
            - Clickable mt_invite URL (https://greatawakening.win/?mt_invite=TOKEN)
            - Raw token fallback for Path 5B (paste-into-Tokens-tab)
            - Path-A vs Path-B install instructions short form
            - Brave Shields warning if relevant
      8. Write DM text to file: D:\AI\_PROJECTS\logs\invite-{user}-{ts}.txt
            (per CLAUDE.md Rule 9: clipboard owns debug log, secondary artifact in file)
      9. Full debug log -> clipboard
     10. E-C-G beep + Read-Host pause

    Workflow for Commander:
      1. pwsh -File D:\AI\_PROJECTS\modtools-ext\scripts\invite-mod.ps1
      2. Type new mod's GAW username
      3. Paste lead token
      4. Open the invite-{user}-{ts}.txt file the script names
      5. Copy its contents
      6. Paste into Discord DM to the new mod

    The new mod gets ONE message containing everything they need. Their path:
      - Click the install link -> Drive folder opens -> follow INSTALL.md Path A
      - When extension is installed, click the mt_invite link -> Claim wizard
      - Paste username -> done

.PARAMETER NoPause
    Skip the final Read-Host pause. Use for scripted / CI runs.

.NOTES
    Requires: PowerShell 5.1+ (works on both powershell.exe and pwsh.exe).
    Requires: gaw-mod-proxy worker reachable (lead-mod auth required).
    Requires: E:\My Drive\GAW\mod-tools\ accessible (or override via -DrivePath).
    Requires: at least one .zip in the Drive folder (publish-to-drive.ps1 first).

    Origin: Commander 2026-05-10. "HOW DO I INVITE OTHER MODS?" -- the existing
    provision-mod-token.ps1 produced a raw token + token file but no clean
    delivery payload. This wraps the whole path into one paste-and-go output.
#>

[CmdletBinding()]
param(
    [switch]$NoPause,
    [string]$DrivePath = 'E:\My Drive\GAW\mod-tools',
    [string]$GawHost   = 'https://greatawakening.win'
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

$WorkerUrl  = 'https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev'
$WorkerHost = 'gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev'

$script:log = New-Object System.Collections.Generic.List[string]
function Say {
    param([string]$msg, [string]$color = 'Cyan')
    Write-Host $msg -ForegroundColor $color
    $script:log.Add($msg) | Out-Null
}
function SayHeader {
    param([string]$msg)
    $bar = '=' * 70
    Say ''
    Say $bar DarkCyan
    Say $msg Yellow
    Say $bar DarkCyan
}
function Mask {
    param([string]$s)
    if (-not $s) { return '(empty)' }
    if ($s.Length -le 8) { return '(short, ' + $s.Length + ' chars)' }
    return $s.Substring(0,4) + '...' + $s.Substring($s.Length - 4) + ' (len ' + $s.Length + ')'
}

$started = Get-Date
$result = @{
    username       = ''
    success        = $false
    inviteFile     = ''
    driveVersion   = ''
    driveZip       = ''
    errors         = New-Object System.Collections.Generic.List[string]
}

try {
    SayHeader 'GAW ModTools -- Invite a New Mod'
    Say "Worker:    $WorkerUrl"
    Say "GAW host:  $GawHost"
    Say "Drive:     $DrivePath"
    Say "Started:   $($started.ToString('yyyy-MM-dd HH:mm:ss'))"
    Say "PS:        $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"
    Say "Host:      $env:COMPUTERNAME  User: $env:USERNAME"

    # --- Step 0: reachability probe ----------------------------------------
    Say ''
    Say 'Probing worker reachability...' DarkGray
    try {
        $probe = Invoke-WebRequest -Uri "$WorkerUrl/health" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        Say "  GET /health -> HTTP $($probe.StatusCode)" Green
    } catch {
        $probeErr = $_
        $probeStatus = if ($probeErr.Exception.Response) { $probeErr.Exception.Response.StatusCode.value__ } else { '???' }
        Say "  GET /health -> $probeStatus" Yellow
        Say "  exception: $($probeErr.Exception.Message)" DarkGray
    }

    # --- Step 0b: Drive folder sanity check --------------------------------
    Say ''
    Say "Verifying Drive folder $DrivePath ..." DarkGray
    if (-not (Test-Path $DrivePath)) {
        Say "  FAIL: Drive folder not found." Red
        Say "  HINT: Run scripts\publish-to-drive.ps1 first to populate it." Yellow
        $result.errors.Add('Drive folder missing')
        throw 'Drive folder required'
    }
    $latestZip = Join-Path $DrivePath 'gaw-modtools-LATEST.zip'
    $versionTxt = Join-Path $DrivePath 'VERSION.txt'
    if (-not (Test-Path $latestZip)) {
        Say "  WARN: gaw-modtools-LATEST.zip not found in Drive." Yellow
        Say "  HINT: Run scripts\publish-to-drive.ps1 to refresh." Yellow
        $result.errors.Add('LATEST.zip missing')
    } else {
        $zipInfo = Get-Item $latestZip
        Say "  LATEST.zip:  $($zipInfo.Length) bytes  (modified $($zipInfo.LastWriteTime))" Green
        $result.driveZip = $zipInfo.Name
    }
    if (Test-Path $versionTxt) {
        $verLine = (Get-Content $versionTxt -TotalCount 1).Trim()
        Say "  VERSION.txt: $verLine" Green
        $result.driveVersion = $verLine
    } else {
        Say "  WARN: VERSION.txt missing." Yellow
    }

    # --- Step 1: username --------------------------------------------------
    SayHeader 'Step 1: New mod GAW username'
    $user = Read-Host 'Enter the new mod''s GAW username (e.g. bob)'
    $user = ($user | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($user)) {
        Say '  Username was blank. Aborting.' Red
        $result.errors.Add('username blank')
        throw 'username required'
    }
    if ($user -notmatch '^[A-Za-z0-9_-]{2,64}$') {
        Say "  Username '$user' does not match [A-Za-z0-9_-]{2,64}." Red
        $result.errors.Add('username format invalid')
        throw 'username format'
    }
    $result.username = $user
    Say "  Username: $user" Green

    # --- Step 2: lead token ------------------------------------------------
    SayHeader 'Step 2: Your LEAD token'
    Say '  Note: PS 5.1 SecureString -AsSecureString has a known paste-loss bug.' DarkGray
    Say '  We use plain Read-Host with output masking. Token is captured + masked.' DarkGray
    Say ''
    $leadPlain = ''
    $attempts = 0
    while ($attempts -lt 3) {
        $attempts++
        $raw = Read-Host "Paste LEAD token (attempt $attempts of 3)"
        $leadPlain = ($raw -replace '[\x00-\x1F\x7F﻿]', '').Trim()
        if ([string]::IsNullOrWhiteSpace($leadPlain)) {
            Say '    -> blank. Try again.' Red
            continue
        }
        Say "    -> captured: $(Mask $leadPlain)" DarkGreen
        if ($leadPlain.Length -lt 8) {
            Say '    -> suspiciously short. Paste clipped? Right-click paste in PowerShell.' Yellow
            $confirm = Read-Host 'Type RETRY or OVERRIDE'
            if ($confirm -ne 'OVERRIDE') { continue }
        }
        break
    }
    if ([string]::IsNullOrWhiteSpace($leadPlain)) {
        Say '  Lead token never captured. Aborting.' Red
        $result.errors.Add('lead token capture failed')
        throw 'lead token required'
    }

    # --- Step 3: mint token ------------------------------------------------
    SayHeader 'Step 3: Mint new mod token'
    $bytes = New-Object 'System.Byte[]' 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $newToken = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    Say "  Generated: $(Mask $newToken)" Green

    # --- Step 4: register with worker --------------------------------------
    SayHeader 'Step 4: POST /admin/import-tokens-from-kv'
    $body = @{
        tokens = @(
            @{
                token        = $newToken
                mod_username = $user
                is_lead      = $false
            }
        )
    } | ConvertTo-Json -Depth 4 -Compress

    $headers = @{
        'x-lead-token' = $leadPlain
        'Content-Type' = 'application/json'
    }
    $uri = "$WorkerUrl/admin/import-tokens-from-kv"
    Say "  URI:  $uri" DarkGray
    Say "  body: $($body.Length) bytes" DarkGray

    $rawStatus = '???'
    $rawBody   = ''
    $webErr    = $null
    try {
        $resp = Invoke-WebRequest -Uri $uri -Method POST -Headers $headers -Body $body `
                                  -ContentType 'application/json' -UseBasicParsing `
                                  -TimeoutSec 30 -ErrorAction Stop
        $rawStatus = $resp.StatusCode
        $rawBody   = ($resp.Content | Out-String).Trim()
    } catch {
        $webErr = $_
        $ex = $webErr.Exception
        if ($ex.Response) {
            try { $rawStatus = $ex.Response.StatusCode.value__ } catch {}
            try {
                $stream = $ex.Response.GetResponseStream()
                if ($stream) {
                    $stream.Position = 0
                    $reader = New-Object System.IO.StreamReader($stream)
                    $rawBody = $reader.ReadToEnd()
                }
            } catch { $rawBody = "(could not read response body)" }
        }
    }

    Say "  HTTP status: $rawStatus" DarkGray
    if ($rawBody) { Say "  body: $rawBody" DarkGray }

    if ($webErr) {
        Say ''
        Say '--- EXCEPTION CHAIN ---' Red
        Say "  type:    $($webErr.Exception.GetType().FullName)" Red
        Say "  message: $($webErr.Exception.Message)" Red
        $inner = $webErr.Exception.InnerException
        $depth = 1
        while ($inner -and $depth -lt 5) {
            Say ("  inner[$depth] " + $inner.GetType().FullName) Red
            Say ("           msg " + $inner.Message) Red
            $inner = $inner.InnerException
            $depth++
        }
    }

    if ($rawStatus -eq 200 -and $rawBody) {
        try {
            $jr = $rawBody | ConvertFrom-Json -ErrorAction Stop
            if ($jr.ok -eq $true -and $jr.imported -ge 1) {
                Say "  Registered: imported=$($jr.imported) skipped=$($jr.skipped)" Green
                $result.success = $true
            } else {
                Say "  Unexpected response: $rawBody" Red
                $result.errors.Add("unexpected: $rawBody")
                throw 'register failed'
            }
        } catch {
            Say "  Response not valid JSON: $($_.Exception.Message)" Red
            $result.errors.Add("json: $($_.Exception.Message)")
            throw 'register parse failed'
        }
    } else {
        switch ($rawStatus) {
            403 { Say '  HINT: LEAD token rejected. Check CF secret LEAD_MOD_TOKEN.' Yellow }
            401 { Say '  HINT: auth header missing/mangled.' Yellow }
            404 { Say '  HINT: endpoint not found. Worker on old code?' Yellow }
            503 { Say '  HINT: AUDIT_DB binding missing. Re-deploy worker.' Yellow }
            default {
                if ($rawStatus -eq '???') {
                    Say '  HINT: NO HTTP response. DNS/TLS failure.' Yellow
                } else {
                    Say "  HINT: unexpected HTTP $rawStatus." Yellow
                }
            }
        }
        $result.errors.Add("HTTP $rawStatus : $rawBody")
        throw "register failed (status $rawStatus)"
    }

    # --- Step 5: build DM-ready text ---------------------------------------
    SayHeader 'Step 5: Build DM-ready invite text'
    $inviteUrl = "$GawHost/?mt_invite=$newToken"

    $dmLines = New-Object System.Collections.Generic.List[string]
    [void]$dmLines.Add("Hey $user, welcome to the GAW mod team. Three-step setup below.")
    [void]$dmLines.Add('')
    [void]$dmLines.Add('1. INSTALL THE EXTENSION')
    [void]$dmLines.Add('   You have two options.')
    [void]$dmLines.Add('')
    [void]$dmLines.Add('   Option A (auto-update, recommended): I will share a Google Drive folder')
    [void]$dmLines.Add("   called 'mod-tools' with you. When it shows up in your Drive, right-click")
    [void]$dmLines.Add("   it and choose 'Available offline'. Then go to chrome://extensions/, turn")
    [void]$dmLines.Add("   on Developer Mode (top right), click 'Load unpacked', and select that")
    [void]$dmLines.Add("   folder. Future updates land automatically when I publish.")
    [void]$dmLines.Add('')
    [void]$dmLines.Add('   Option B (manual): Tell me and I will send you a ZIP. Unzip to a folder')
    [void]$dmLines.Add('   you will not move (e.g. C:\Users\YourName\modtools-ext\), then load it')
    [void]$dmLines.Add('   the same way as Option A.')
    [void]$dmLines.Add('')
    [void]$dmLines.Add('2. CLAIM YOUR INVITE')
    [void]$dmLines.Add('   Once the extension is loaded and pinned to your toolbar, click this link')
    [void]$dmLines.Add('   in the SAME Chrome profile where you are logged into greatawakening.win:')
    [void]$dmLines.Add('')
    [void]$dmLines.Add("   $inviteUrl")
    [void]$dmLines.Add('')
    [void]$dmLines.Add('   A confirmation popup will appear. Click OK, then click the GAW ModTools')
    [void]$dmLines.Add("   icon in your toolbar, click 'Claim invite', and enter your GAW username")
    [void]$dmLines.Add("   ($user) when it asks.")
    [void]$dmLines.Add('')
    [void]$dmLines.Add('   IF YOU USE BRAVE: Brave Shields can silently strip the mt_invite parameter.')
    [void]$dmLines.Add('   If clicking the link does nothing visible in the popup, fall back to step 3.')
    [void]$dmLines.Add('')
    [void]$dmLines.Add('3. RAW TOKEN FALLBACK (if step 2 did not work)')
    [void]$dmLines.Add("   Click the GAW ModTools icon, go to the 'Tokens' tab, and paste this into")
    [void]$dmLines.Add("   the 'Team Mod Token' field:")
    [void]$dmLines.Add('')
    [void]$dmLines.Add("   $newToken")
    [void]$dmLines.Add('')
    [void]$dmLines.Add("   Click Save, then Verify. You should see a green 'Token verified' status.")
    [void]$dmLines.Add('')
    [void]$dmLines.Add('4. VERIFY')
    [void]$dmLines.Add("   Hard-refresh greatawakening.win (Ctrl+Shift+R). The ModTools status bar")
    [void]$dmLines.Add('   should appear at the bottom of the page. If it shows green, you are live.')
    [void]$dmLines.Add('')
    [void]$dmLines.Add('Full install guide is in the Drive folder as INSTALL.md if you hit issues.')
    [void]$dmLines.Add('Ping me on Discord/Slack if anything blocks you.')
    [void]$dmLines.Add('')
    [void]$dmLines.Add('-- Commander Cats')

    $dmText = $dmLines -join "`r`n"

    # --- Step 6: write DM file ---------------------------------------------
    $logDir = 'D:\AI\_PROJECTS\logs'
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $inviteFile = Join-Path $logDir ("invite-$user-$stamp.txt")
    try {
        Set-Content -Path $inviteFile -Value $dmText -Encoding UTF8
        $result.inviteFile = $inviteFile
        Say "  DM text written to:" Green
        Say "    $inviteFile" Green
    } catch {
        Say "  Failed to write DM file: $($_.Exception.Message)" Red
        Say ''
        Say '--- DM TEXT (copy from below as fallback) ---' Yellow
        Say $dmText White
        Say '--- end DM text ---' Yellow
        $result.errors.Add("invite file write: $($_.Exception.Message)")
    }

    # --- wipe plaintext ---------------------------------------------------
    $leadPlain = $null
    Remove-Variable leadPlain -ErrorAction SilentlyContinue

    # --- Step 7: tell Commander what to do --------------------------------
    SayHeader 'Step 7: Next actions for you'
    Say ''
    Say "  1. Open the DM file:  $inviteFile" Yellow
    Say "  2. Select all (Ctrl+A) -> Copy (Ctrl+C)" Yellow
    Say "  3. Paste into Discord/Slack DM to $user" Yellow
    Say ''
    Say "  4. SHARE THE DRIVE FOLDER with $user's Google account:" Yellow
    Say "     - File Explorer: $DrivePath" DarkGray
    Say "     - Right-click 'mod-tools' folder -> Share with people" DarkGray
    Say "     - Add their Gmail, set 'Viewer' permission" DarkGray
    Say ''
    Say "  5. They click the mt_invite link in the DM after extension is loaded" Yellow
    Say ''
    Say "  Drive snapshot: $($result.driveZip) ($($result.driveVersion))" DarkGreen

    Say ''
    Say "Total elapsed: $((Get-Date) - $started)" DarkGray

} catch {
    Say ''
    Say '=== INVITE FAILED ===' Red
    Say "  Reason:    $($_.Exception.Message)" Red
    Say "  Username:  $($result.username)" DarkGray
    if ($result.errors.Count -gt 0) {
        Say '  Errors:' Red
        foreach ($e in $result.errors) { Say "    - $e" Red }
    }
    if ($_.ScriptStackTrace) {
        Say '  Stack:' DarkGray
        foreach ($line in ($_.ScriptStackTrace -split "`r?`n")) {
            Say "    $line" DarkGray
        }
    }
}

# --- final block ---------------------------------------------------------
Say ''
SayHeader 'INVITE-MOD FINAL REPORT'
Say "Username:        $($result.username)"
Say "Worker register: $(if ($result.success) { 'OK' } else { 'FAILED' })" $(if ($result.success) { 'Green' } else { 'Red' })
Say "Drive snapshot:  $($result.driveVersion)"
Say "DM file:         $($result.inviteFile)"
Say "Errors:          $($result.errors.Count)"
Say "Elapsed:         $((Get-Date) - $started)"
Say ''
Say "Open DM file -> select all -> copy -> paste to $($result.username)." Yellow

# Persist log to disk
$persistDir = 'D:\AI\_PROJECTS\logs'
if (-not (Test-Path $persistDir)) { New-Item -ItemType Directory -Path $persistDir -Force | Out-Null }
$persistPath = Join-Path $persistDir ("invite-mod-debug-$(Get-Date -Format 'yyyyMMdd-HHmmss').log")
try { $script:log | Set-Content -Path $persistPath -Encoding UTF8 } catch {}

# Clipboard: full debug log (per CLAUDE.md Rule 9)
try {
    $script:log -join "`r`n" | Set-Clipboard
    Say ''
    Say '[FULL DEBUG LOG COPIED TO CLIPBOARD]' Green
    Say "[invite-debug log also at: $persistPath]" DarkGray
    Say "[INVITE DM TEXT in: $($result.inviteFile) -- open + copy that, NOT the clipboard]" Yellow
} catch {
    Say "Clipboard write failed: $($_.Exception.Message)" Red
    Say "Debug log saved to file: $persistPath" Yellow
}

# E-C-G beep
try {
    [Console]::Beep(659, 160)
    Start-Sleep -Milliseconds 100
    [Console]::Beep(523, 160)
    Start-Sleep -Milliseconds 100
    [Console]::Beep(784, 800)
} catch {}

if (-not $NoPause) { Read-Host 'Press Enter to exit' }

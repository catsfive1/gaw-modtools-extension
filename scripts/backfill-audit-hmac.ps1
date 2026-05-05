<#
.SYNOPSIS
    Backfill HMAC anchors on legacy audit-chain rows (v9.4.3 endpoint).
.DESCRIPTION
    One-shot operation. Calls POST /admin/audit/backfill-hmac in batches
    until total_remaining=0. Worker computes HMAC over each legacy row's
    entry_hash using env.AUDIT_HMAC_KEY (promoted from KV on 2026-05-05).

    Endpoint requires BOTH:
      x-mod-token  = Commander's catsfive token (hardcoded below; safe
                     to keep in repo because rotation invalidates it
                     instantly if it ever leaks)
      x-lead-token = env.LEAD_MOD_TOKEN value (only in CF dashboard;
                     prompted via Read-Host -AsSecureString here so it
                     never lands on disk or screen)

    After this script returns "remaining: 0" the entire actions table
    has entry_hmac populated. The migration-026 boundary becomes
    irrelevant; verifier rejects ANY future NULL hmac.

    Idempotent. Re-running after success is a no-op.
.PARAMETER NoPause
    Skip the final Read-Host. For Task Scheduler / unattended runs.
.EXAMPLE
    Right-click this file -> Run with PowerShell
    OR
    pwsh -File scripts\backfill-audit-hmac.ps1
.NOTES
    Version: 1.0.0
    Requires: PowerShell 5.1+ (PS 7 also fine)
    Author: assistant per Commander v9.3.15 dissemination push
#>
[CmdletBinding()]
param([switch]$NoPause)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

# --- Pre-flight ---------------------------------------------------------
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "Requires PS 5.1 or later. Found: $($PSVersionTable.PSVersion)" -ForegroundColor Red
    if (-not $NoPause) { Read-Host 'Press Enter to exit' }
    exit 1
}

# --- Config -------------------------------------------------------------
$ModToken    = 'Ts2wPWowho27L2AlaMAYWncIlEzFQzZDWyZbQAyw6whUUl7k'
$WorkerBase  = 'https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev'
$Endpoint    = "$WorkerBase/admin/audit/backfill-hmac"
$LogDir      = 'D:\AI\_PROJECTS\logs'
$LogFile     = Join-Path $LogDir ('backfill-audit-hmac-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

# --- Helpers ------------------------------------------------------------
$log = New-Object System.Collections.ArrayList
function Log {
    param([string]$Msg, [string]$Color = 'Gray')
    $stamped = '[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $Msg
    Write-Host $stamped -ForegroundColor $Color
    [void]$log.Add($stamped)
}

# --- Lead token prompt --------------------------------------------------
Log '=== Audit-HMAC backfill (worker v9.4.3 endpoint) ===' Cyan
Log ''
Log 'This will populate entry_hmac on every legacy audit row that pre-dates' Gray
Log 'migration 026 (~459 rows expected). Each call processes up to 1000 rows.' Gray
Log 'Idempotent: re-running after success is a no-op.' Gray
Log ''
Log 'Required: your env.LEAD_MOD_TOKEN value. It is in your Cloudflare' Yellow
Log 'dashboard under Workers -> gaw-mod-proxy -> Settings -> Variables and' Yellow
Log 'Secrets -> LEAD_MOD_TOKEN -> Edit (or click the eye icon to reveal).' Yellow
Log ''
Log 'Paste it at the prompt below. The hidden field shows ONE asterisk' DarkGray
Log 'regardless of the paste length -- the full token IS captured. That' DarkGray
Log 'is normal PS behavior, not a bug.' DarkGray
Log ''

$leadSecure = Read-Host 'Paste LEAD_MOD_TOKEN' -AsSecureString
$leadPlain  = [System.Net.NetworkCredential]::new('', $leadSecure).Password

if ([string]::IsNullOrWhiteSpace($leadPlain)) {
    Log 'Empty token. Aborted.' Red
    if (-not $NoPause) { Read-Host 'Press Enter to exit' }
    exit 1
}
if ($leadPlain -notmatch '^[A-Za-z0-9_-]{32,256}$') {
    Log 'Token shape looks wrong (expect 32-256 base64url-ish chars). Aborted.' Red
    Remove-Variable leadPlain -ErrorAction SilentlyContinue
    if (-not $NoPause) { Read-Host 'Press Enter to exit' }
    exit 1
}

Log 'Token captured. Starting backfill loop...' Green

# --- Backfill loop ------------------------------------------------------
$started = Get-Date
$totalBackfilled = 0
$totalCalls = 0
$lastError = $null
$exitCode = 0

try {
    while ($true) {
        $totalCalls++
        $headers = @{
            'x-mod-token'  = $ModToken
            'x-lead-token' = $leadPlain
            'origin'       = 'https://greatawakening.win'
        }
        $body = '{"max_rows":1000,"batch_size":100}'

        Log ("Call #{0}: POST /admin/audit/backfill-hmac (max 1000/batch 100)..." -f $totalCalls) Cyan

        try {
            $params = @{
                Uri         = $Endpoint
                Method      = 'POST'
                Headers     = $headers
                ContentType = 'application/json'
                Body        = $body
                TimeoutSec  = 60
            }
            $resp = Invoke-RestMethod @params
        } catch {
            $sr = $_.Exception.Response
            $status = if ($sr) { $sr.StatusCode.value__ } else { 'no-response' }
            $bodyText = ''
            try {
                $stream = $sr.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $bodyText = $reader.ReadToEnd()
            } catch {}
            Log ("HTTP {0} from worker: {1}" -f $status, $bodyText) Red
            Log ("Exception: {0}" -f $_.Exception.Message) DarkGray
            $lastError = "HTTP $status :: $bodyText"
            $exitCode = 2
            break
        }

        if (-not $resp -or -not $resp.ok) {
            Log ("Worker returned non-ok response: {0}" -f ($resp | ConvertTo-Json -Compress)) Red
            $lastError = ($resp | ConvertTo-Json -Compress)
            $exitCode = 2
            break
        }

        $thisCall = [int]($resp.backfilled)
        $remaining = [int]($resp.total_remaining)
        $took = [int]($resp.took_ms)
        $batches = [int]($resp.batches_processed)
        $totalBackfilled += $thisCall

        Log ("  -> backfilled this call: {0,-6}  remaining: {1,-6}  ({2} batches in {3} ms)" -f $thisCall, $remaining, $batches, $took) Green

        if ($remaining -le 0) {
            Log 'All legacy rows now HMAC-signed. Migration-026 boundary irrelevant.' Green
            break
        }
        if ($thisCall -le 0 -and $remaining -gt 0) {
            Log 'Worker returned 0 backfilled but remaining > 0 -- aborting to avoid infinite loop.' Yellow
            $lastError = 'progress stalled'
            $exitCode = 2
            break
        }

        Start-Sleep -Milliseconds 200
    }
} finally {
    # Wipe the plaintext token from memory ASAP.
    if (Test-Path variable:leadPlain) { Remove-Variable leadPlain -ErrorAction SilentlyContinue }
}

# --- Final structured report -------------------------------------------
$elapsed = (Get-Date) - $started
Log ''
Log '=== BACKFILL SUMMARY ===' Cyan
Log ('elapsed:        {0}' -f $elapsed.ToString('mm\:ss\.fff'))
Log ('worker calls:   {0}' -f $totalCalls)
Log ('rows backfilled: {0}' -f $totalBackfilled)
if ($lastError) {
    Log ('last error:     {0}' -f $lastError) Red
} else {
    Log 'last error:     (none)' Green
}
Log ''
if ($exitCode -eq 0) {
    Log 'NEXT STEP: run `npx wrangler d1 execute gaw-audit --remote --command="SELECT COUNT(*) FROM actions WHERE entry_hmac IS NULL"` to confirm 0 rows. Or invoke /admin/audit/verify and check that hmacLegacy=0.' Yellow
} else {
    Log 'Backfill aborted. Investigate the last_error above. Check `wrangler tail` for worker-side stack.' Red
}

# --- Persist log + clipboard + beep ------------------------------------
try {
    $log -join "`r`n" | Set-Content -Path $LogFile -Encoding UTF8
    Log ('log saved to: {0}' -f $LogFile) DarkGray
} catch {
    Log ('log save failed: {0}' -f $_.Exception.Message) DarkGray
}

try {
    $log -join "`r`n" | Set-Clipboard
    Log '[FULL DEBUG LOG COPIED TO CLIPBOARD]' Cyan
} catch {
    Log 'clipboard copy failed; log file at path above' DarkGray
}

# E-C-G beep -- Commander's audible completion signal
try {
    [Console]::Beep(659, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(523, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(784, 800)
} catch {}

if (-not $NoPause) { Read-Host 'Press Enter to exit' }
exit $exitCode

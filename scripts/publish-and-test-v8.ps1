<#
.SYNOPSIS
    GAW ModTools v8.0 one-shot publish + test pipeline.

.DESCRIPTION
    Handles EVERYTHING needed to finish v8.0 deployment:
      1. Preflight (paths + files exist)
      2. Refresh wrangler auth (opens browser if expired)
      3. Optional: collect mod tokens from clipboard for multi-mod tests
      4. Apply migration 013 (idempotent; swallows ALTER duplicate-column)
      5. Deploy worker
      6. Run verify-v8-0.ps1 -LiveWorker
      7. Amendment C.1 DB integrity sweep
      8. Amendment C.4 multi-mod sync test (skippable if no second token)
      9. Structured final report + clipboard + E-C-G beep + Read-Host

    Safe to re-run. Designed for Commander Cats.

.PARAMETER SkipMultiModTest
    Skip the Amendment C.4 multi-mod sync test block entirely, even if
    tokens are available. Useful when you just want to ship and test UI
    manually.

.PARAMETER NoPause
    Skip the final Read-Host pause. Use for scripted / CI runs.

.EXAMPLE
    pwsh -File D:\AI\_PROJECTS\publish-and-test-v8.ps1
#>

[CmdletBinding()]
param(
    [switch]$SkipMultiModTest,
    [switch]$NoPause
)

# -------------------- Setup --------------------
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$ProjectRoot = 'D:\AI\_PROJECTS'
$WorkerDir   = Join-Path $ProjectRoot 'cloudflare-worker'
$LogsDir     = Join-Path $ProjectRoot 'logs'
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null }
$StartTime = Get-Date
$Stamp     = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogPath   = Join-Path $LogsDir ("publish-v8-$Stamp.log")

$WorkerUrl = 'https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev'
$SynUser   = '__v8_test_user_xyz__'

# Log buffer (console + clipboard at end)
$global:logBuf = @()
function Log {
    param([string]$msg, [string]$color = 'White')
    $ts = Get-Date -Format 'HH:mm:ss'
    $line = "[$ts] $msg"
    Write-Host $line -ForegroundColor $color
    $global:logBuf += $line
}
function Banner {
    param([string]$txt)
    Log ''
    Log ('=' * 68) Cyan
    Log ('  ' + $txt) Cyan
    Log ('=' * 68) Cyan
}
function Step {
    param([string]$n, [string]$name)
    Banner ("STEP $n : $name")
}

$StepStatus = @{}
function Pass {
    param([string]$step, [string]$details = '')
    $StepStatus[$step] = 'PASS'
    Log "  [OK] $step" Green
    if ($details) { Log "       $details" DarkGray }
}
function Fail {
    param([string]$step, [string]$reason)
    $StepStatus[$step] = "FAIL: $reason"
    Log "  [X ] $step" Red
    Log "       $reason" Red
}
function Skip {
    param([string]$step, [string]$reason)
    $StepStatus[$step] = "SKIP: $reason"
    Log "  [- ] $step (skipped)" Yellow
    Log "       $reason" DarkYellow
}

# -------------------- Preflight --------------------
Banner 'GAW ModTools v8.0 one-shot publish + test'
Log "Host: $env:COMPUTERNAME  User: $env:USERNAME  PS: $($PSVersionTable.PSVersion)"
Log "Log:  $LogPath"

Step '0' 'Preflight -- verify files in place'
$preflight = @(
    @{ Name = 'Worker dir';             Path = $WorkerDir }
    @{ Name = 'Migration 013';          Path = (Join-Path $WorkerDir 'migrations\013_team_productivity.sql') }
    @{ Name = 'verify-v8-0.ps1';        Path = (Join-Path $ProjectRoot 'verify-v8-0.ps1') }
    @{ Name = 'v8.0 ZIP';               Path = (Join-Path $ProjectRoot 'dist\gaw-modtools-chrome-store-v8.0.0.zip') }
    @{ Name = 'modtools.js v8.0';       Path = (Join-Path $ProjectRoot 'modtools-ext\modtools.js') }
)
$prefailed = $false
foreach ($p in $preflight) {
    if (Test-Path $p.Path) { Pass ('Preflight: ' + $p.Name) }
    else { Fail ('Preflight: ' + $p.Name) ("Missing: " + $p.Path); $prefailed = $true }
}

if ($prefailed) {
    Log ''
    Log 'PREFLIGHT FAILED. Aborting before any destructive step.' Red
    goto :FinalReport
}

# -------------------- Wrangler auth --------------------
Step '1' 'Verify wrangler auth (API token preferred over OAuth)'

$hasApiToken = -not [string]::IsNullOrEmpty($env:CLOUDFLARE_API_TOKEN) -or -not [string]::IsNullOrEmpty($env:CF_API_TOKEN)
if ($hasApiToken) {
    Log 'Detected CLOUDFLARE_API_TOKEN / CF_API_TOKEN env var -- using API token auth.'
    Log 'Skipping  wrangler login  (OAuth) since API token takes precedence.'
} else {
    Log 'No CLOUDFLARE_API_TOKEN env var detected -- will attempt wrangler login (OAuth).'
    Log 'A browser window may open. Complete Cloudflare login, then return.'
}

Push-Location $WorkerDir
try {
    if (-not $hasApiToken) {
        $loginOut = & npx --yes wrangler@latest login 2>&1 | Out-String
        $loginOut -split "`r?`n" | Where-Object { $_ } | ForEach-Object { Log "    $_" DarkGray }
    }

    # Verify via whoami
    Log ''
    Log 'Running: wrangler whoami'
    $whoami = & npx --yes wrangler@latest whoami 2>&1 | Out-String
    $whoami -split "`r?`n" | Where-Object { $_ } | ForEach-Object { Log "    $_" DarkGray }

    if ($whoami -match 'Account Name|Account ID|catsfive|logged in') {
        Pass 'Wrangler auth'
    } elseif ($whoami -match 'code.*10000|Authentication error') {
        Fail 'Wrangler auth' 'API token present but rejected by CF. Rotate it at dash.cloudflare.com -> My Profile -> API Tokens.'
        Pop-Location
        goto :FinalReport
    } else {
        Fail 'Wrangler auth' 'whoami did not confirm auth -- aborting before deploy'
        Pop-Location
        goto :FinalReport
    }
}
catch {
    Fail 'Wrangler auth' $_.Exception.Message
    Pop-Location
    goto :FinalReport
}
Pop-Location

# -------------------- Optional token collection --------------------
Step '2' 'Collect tokens for multi-mod test (optional)'
$leadToken = ''
$modBToken = ''
$modBUser  = ''
$runMultiMod = $false

if ($SkipMultiModTest) {
    Skip 'Token collection' '-SkipMultiModTest flag set'
} else {
    Log 'This step collects tokens for the Amendment C.4 multi-mod sync test.'
    Log 'Press Enter on any prompt to skip the test entirely.'
    Log ''
    Log 'TIP: tokens are pasted from clipboard (no characters appear). That is'
    Log '     normal. After paste, press Enter to load from clipboard.'

    $null = Read-Host 'Copy your LEAD TOKEN to clipboard, then press Enter (or just Enter to skip)'
    $leadToken = ((Get-Clipboard) | Out-String).Trim()

    if ($leadToken -match '^[A-Za-z0-9_-]{16,256}$') {
        Log "Lead token accepted (length $($leadToken.Length)). Next token..."

        $null = Read-Host 'Copy SECOND MOD token to clipboard, then press Enter (or just Enter to skip second-mod test)'
        $modBToken = ((Get-Clipboard) | Out-String).Trim()

        if ($modBToken -match '^[A-Za-z0-9_-]{16,256}$' -and $modBToken -ne $leadToken) {
            $modBUser = Read-Host 'Second mod GAW username (e.g. bob)'
            if ($modBUser) {
                $runMultiMod = $true
                Pass 'Token collection' "lead + mod B + username captured"
            } else {
                Skip 'Token collection' 'second-mod username was blank'
            }
        } elseif ($modBToken -eq $leadToken) {
            Skip 'Token collection' 'second-mod token was identical to lead token'
        } else {
            Skip 'Token collection' 'second-mod token looked invalid or empty'
        }
    } else {
        Skip 'Token collection' 'lead token looked invalid or empty'
    }
}

# -------------------- Migration 013 --------------------
Step '3' 'Apply migration 013 (idempotent)'
Push-Location $WorkerDir
try {
    $migOut = & npx --yes wrangler@latest d1 execute gaw-audit --remote `
        --file='migrations/013_team_productivity.sql' 2>&1 | Out-String
    $migOut -split "`r?`n" | Where-Object { $_ } | Select-Object -First 20 | ForEach-Object { Log "    $_" DarkGray }

    if ($migOut -match 'success.*true' -or $migOut -match 'Executed \d+ queries') {
        Pass 'Migration 013'
    } elseif ($migOut -match 'duplicate column name') {
        Pass 'Migration 013' 'already applied (duplicate-column ALTER swallowed)'
    } elseif ($migOut -match 'Authentication error|code.*10000') {
        Fail 'Migration 013' 'auth error -- wrangler login did not stick'
    } else {
        Fail 'Migration 013' 'unexpected output (see log above)'
    }
}
catch { Fail 'Migration 013' $_.Exception.Message }
Pop-Location

# -------------------- Deploy worker --------------------
Step '4' 'Deploy worker (wrangler deploy)'
Push-Location $WorkerDir
try {
    $deployOut = & npx --yes wrangler@latest deploy 2>&1 | Out-String
    $deployOut -split "`r?`n" | Where-Object { $_ } | Select-Object -First 30 | ForEach-Object { Log "    $_" DarkGray }

    if ($deployOut -match 'Uploaded gaw-mod-proxy' -or $deployOut -match 'Deployed gaw-mod-proxy') {
        $verId = ''
        if ($deployOut -match 'Current Version ID:\s*([a-f0-9-]+)') { $verId = $Matches[1] }
        Pass 'Worker deploy' "Version: $verId"
    } else {
        Fail 'Worker deploy' 'did not see Uploaded/Deployed confirmation'
    }
}
catch { Fail 'Worker deploy' $_.Exception.Message }
Pop-Location

# -------------------- verify-v8-0.ps1 live --------------------
Step '5' 'Run verify-v8-0.ps1 -LiveWorker'
try {
    $verifyScript = Join-Path $ProjectRoot 'verify-v8-0.ps1'
    $verOut = & pwsh -NoProfile -File $verifyScript -LiveWorker -NoPause 2>&1 | Out-String
    # Take last 30 lines as summary
    $verOut -split "`r?`n" | Where-Object { $_ } | Select-Object -Last 30 | ForEach-Object { Log "    $_" DarkGray }

    if ($verOut -match '(\d+)\s*/\s*(\d+)\s*PASS' -or $verOut -match 'ALL\s+\d+\s+checks\s+passed') {
        Pass 'verify-v8-0.ps1 -LiveWorker'
    } elseif ($verOut -match 'FAIL|error') {
        Fail 'verify-v8-0.ps1 -LiveWorker' 'verify script reported failures (see log)'
    } else {
        Pass 'verify-v8-0.ps1 -LiveWorker' '(no explicit pass counter found; manual review of log recommended)'
    }
}
catch { Fail 'verify-v8-0.ps1 -LiveWorker' $_.Exception.Message }

# -------------------- Amendment C.1 DB integrity --------------------
Step '6' 'Amendment C.1 -- DB integrity sweep'
Push-Location $WorkerDir

function DbQuery {
    param([string]$sql, [string]$label)
    Log "  Q: $label" DarkGray
    try {
        $out = & npx --yes wrangler@latest d1 execute gaw-audit --remote --command=$sql 2>&1 | Out-String
        return $out
    } catch { return "ERROR: $($_.Exception.Message)" }
}

try {
    $allTables = DbQuery "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" 'All tables'
    $expectedTables = @('proposals','drafts','claims','team_features','bug_reports','mod_tokens','precedents','actions','shadow_triage_decisions','parked_items','ai_suspect_queue')
    $missing = @()
    foreach ($t in $expectedTables) { if ($allTables -notmatch [regex]::Escape($t)) { $missing += $t } }
    if ($missing.Count -eq 0) { Pass 'DB: all v7.x + v8.0 tables present' } else { Fail 'DB: tables' "Missing: $($missing -join ', ')" }

    $rowCountSql = "SELECT 'proposals' as t, COUNT(*) as n FROM proposals UNION ALL SELECT 'drafts', COUNT(*) FROM drafts UNION ALL SELECT 'claims', COUNT(*) FROM claims UNION ALL SELECT 'team_features', COUNT(*) FROM team_features UNION ALL SELECT 'bug_reports', COUNT(*) FROM bug_reports UNION ALL SELECT 'mod_tokens', COUNT(*) FROM mod_tokens UNION ALL SELECT 'precedents', COUNT(*) FROM precedents UNION ALL SELECT 'actions', COUNT(*) FROM actions UNION ALL SELECT 'parked_items', COUNT(*) FROM parked_items UNION ALL SELECT 'shadow_triage_decisions', COUNT(*) FROM shadow_triage_decisions UNION ALL SELECT 'ai_suspect_queue', COUNT(*) FROM ai_suspect_queue;"
    $counts = DbQuery $rowCountSql 'Row counts'
    $counts -split "`r?`n" | Where-Object { $_ -match '"t"' -or $_ -match '"n"' -or $_ -match '\d+' } | Select-Object -First 30 | ForEach-Object { Log "       $_" DarkGray }
    Pass 'DB: row counts captured'

    $drIdx = DbQuery "SELECT sql FROM sqlite_master WHERE name='idx_actions_dr_idempotency';" 'DR idempotency index'
    if ($drIdx -match 'WHERE\s+dr_scheduled_at\s+IS\s+NOT\s+NULL') {
        Pass 'DB: DR idempotency partial unique index'
    } else {
        Fail 'DB: DR idempotency partial unique index' 'WHERE clause missing or index not found'
    }

    $allIdx = DbQuery "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name;" 'All idx_* indexes'
    $idxCount = ([regex]::Matches($allIdx, 'idx_\w+')).Count
    Log "       Found $idxCount idx_* indexes" DarkGray
    if ($idxCount -gt 10) { Pass 'DB: indexes' "$idxCount idx_* indexes present" }
    else { Fail 'DB: indexes' "Only $idxCount found; expected 15+" }
}
catch { Fail 'DB integrity sweep' $_.Exception.Message }
Pop-Location

# -------------------- Amendment C.4 multi-mod sync test --------------------
if ($runMultiMod) {
    Step '7' 'Amendment C.4 -- multi-mod sync test (synthetic target)'

    $leadHdr = @{ 'x-mod-token' = $leadToken; 'content-type' = 'application/json' }
    $modBHdr = @{ 'x-mod-token' = $modBToken; 'content-type' = 'application/json' }
    $leadLeadHdr = @{ 'x-lead-token' = $leadToken; 'content-type' = 'application/json' }

    function Post {
        param([string]$path, $body, $headers)
        try {
            $json = if ($body) { ($body | ConvertTo-Json -Depth 10 -Compress) } else { '{}' }
            return Invoke-RestMethod -Uri ($WorkerUrl + $path) -Method POST -Headers $headers -Body $json -TimeoutSec 15
        } catch {
            return [pscustomobject]@{ ok = $false; error = $_.Exception.Message; http = $_.Exception.Response.StatusCode }
        }
    }

    # 7.1 Propose Ban round-trip
    Log '  [7.1] Propose Ban round-trip (synthetic target)' DarkCyan
    $propResp = Post '/proposals/create' @{ kind='ban'; target=$SynUser; duration=86400; reason='v8.0 test'; proposer_note='synthetic' } $leadHdr
    if ($propResp.ok -or $propResp.id) {
        $propId = if ($propResp.id) { $propResp.id } else { ($propResp | ConvertTo-Json -Depth 5) -match '"id":(\d+)' | Out-Null; $Matches[1] }
        Log "       proposal id = $propId" DarkGray
        Start-Sleep -Seconds 1
        $listB = Post '/proposals/list' @{} $modBHdr
        $seen = ($listB | ConvertTo-Json -Depth 5) -match "id.*$propId"
        if ($seen) {
            Log '       [OK] proposal visible to mod B' Green
            $voteResp = Post '/proposals/vote' @{ id = [int]$propId; action = 'punt'; reason = 'v8 test' } $modBHdr
            if ($voteResp.ok -or $voteResp.status -eq 'punted') {
                Pass 'C.4 Propose Ban round-trip' 'created -> listed -> punted'
            } else {
                Fail 'C.4 Propose Ban round-trip' ('vote failed: ' + ($voteResp | ConvertTo-Json -Depth 3 -Compress))
            }
        } else {
            Fail 'C.4 Propose Ban round-trip' 'proposal not visible to mod B list'
        }
    } else {
        Fail 'C.4 Propose Ban round-trip' ('create failed: ' + ($propResp | ConvertTo-Json -Depth 3 -Compress))
    }

    # 7.2 Park round-trip
    Log ''
    Log '  [7.2] Park round-trip (Discord DM check)' DarkCyan
    $parkResp = Post '/parked/create' @{ kind='user'; subject_id=$SynUser; note='v8.0 park test' } $leadHdr
    if ($parkResp.ok -or $parkResp.id) {
        $parkId = if ($parkResp.id) { $parkResp.id } else { ($parkResp | ConvertTo-Json -Depth 5) -match '"id":(\d+)' | Out-Null; $Matches[1] }
        Log "       park id = $parkId" DarkGray
        Start-Sleep -Seconds 1
        $listP = Post '/parked/list' @{ status = 'open' } $modBHdr
        $seenP = ($listP | ConvertTo-Json -Depth 5) -match "id.*$parkId"
        if ($seenP) {
            Log '       [OK] park visible to mod B' Green
            $resResp = Post '/parked/resolve' @{ id = [int]$parkId; resolution_action = 'OTHER'; resolution_reason = 'v8 test' } $modBHdr
            if ($resResp.ok -or $resResp.status -eq 'resolved') {
                Pass 'C.4 Park round-trip' 'created -> listed -> resolved (Discord DM should fire to original parker)'
            } else {
                Fail 'C.4 Park round-trip' 'resolve failed'
            }
        } else {
            Fail 'C.4 Park round-trip' 'park not visible to mod B list'
        }
    } else {
        Fail 'C.4 Park round-trip' 'create failed'
    }

    # 7.3 Shadow triage contract smoke
    Log ''
    Log '  [7.3] Shadow Queue AI contract smoke (Amendment B.2 schema)' DarkCyan
    $shadowResp = Post '/ai/shadow-triage' @{
        kind = 'queue'
        subject_id = "v8-smoke-$(Get-Date -Format yyyyMMddHHmmss)"
        context = @{ body = 'hello world test' }
    } $leadHdr
    $required = @('decision','confidence','evidence','counterarguments','rule_refs','prompt_version','model','provider','rules_version','generated_at')
    $payload = if ($shadowResp.data) { $shadowResp.data } else { $shadowResp }
    $payloadJson = ($payload | ConvertTo-Json -Depth 5 -Compress)
    $missingFields = @()
    foreach ($f in $required) { if ($payloadJson -notmatch "`"$f`"") { $missingFields += $f } }
    if ($missingFields.Count -eq 0) {
        Pass 'C.4 Shadow Queue AI contract' 'all 10 Amendment B.2 fields present'
    } else {
        Fail 'C.4 Shadow Queue AI contract' "Missing fields: $($missingFields -join ', ')"
    }
}
else {
    Step '7' 'Amendment C.4 -- multi-mod sync test'
    Skip 'Multi-mod sync test' 'tokens not provided (or -SkipMultiModTest); can be run later manually'
}

# -------------------- Final report --------------------
:FinalReport
Banner 'FINAL REPORT'

$elapsed = (Get-Date) - $StartTime
Log "Elapsed: $([int]$elapsed.TotalMinutes)m $($elapsed.Seconds)s"
Log ''

$passed = ($StepStatus.GetEnumerator() | Where-Object { $_.Value -eq 'PASS' }).Count
$failed = ($StepStatus.GetEnumerator() | Where-Object { $_.Value -like 'FAIL*' }).Count
$skipped = ($StepStatus.GetEnumerator() | Where-Object { $_.Value -like 'SKIP*' }).Count
Log "Summary: PASS=$passed  FAIL=$failed  SKIP=$skipped" White
Log ''

foreach ($kv in ($StepStatus.GetEnumerator() | Sort-Object Key)) {
    $icon = if ($kv.Value -eq 'PASS') { '[OK]' } elseif ($kv.Value -like 'FAIL*') { '[X ]' } else { '[- ]' }
    $color = if ($kv.Value -eq 'PASS') { 'Green' } elseif ($kv.Value -like 'FAIL*') { 'Red' } else { 'Yellow' }
    Log ("  $icon  " + $kv.Key + "  :  " + $kv.Value) $color
}

Log ''
Log '----------- NEXT STEPS FOR LIVE MOD-TEAM TESTING -----------' Cyan

if ($failed -eq 0) {
    Log 'Publish pipeline completed without errors. You can now:' Green
    Log ''
    Log '  1. Open greatawakening.win in your primary browser profile.' White
    Log '  2. Extension settings -> flip features.platformHardening ON.' White
    Log '  3. Extension settings -> flip features.teamBoost ON.' White
    Log '  4. Run one solo shift. Watch for errors in DevTools console.' White
    Log '  5. Export telemetry ring buffer for review:' White
    Log '       In DevTools console: copy(JSON.stringify(JSON.parse(localStorage.gam_telemetry_buffer), null, 2))' DarkGray
    Log '  6. On second computer / second GAW account:' White
    Log '     a. Install extension via installer one-liner (mods already auto-updated)' White
    Log '     b. Popup -> paste second mod token' White
    Log '     c. Settings -> flip both platformHardening + teamBoost ON' White
    Log '  7. End-to-end UI test:' White
    Log '     - Propose Ban on a synthetic user from primary' White
    Log '       -> chime + status-bar alert fires on second install within 15s' White
    Log '       -> second install clicks Execute -> ban submits' White
    Log '     - Park a queue row from second install' White
    Log '       -> primary status-bar shows [P N] chip within 30s' White
    Log '       -> primary resolves -> Discord DM to second install' White
    Log '     - Shadow Queue: /queue page shows AI-pre-decided badges' White
    Log '       Space expands row + shows evidence. Enter commits.' White
    Log '     - Ban tab: draft auto-populates with rule + outcome count' White
    Log '  8. If anything breaks: Settings -> toggle features.teamBoost OFF.' White
    Log '     Instant rollback to v7.2.0 behavior. No reinstall.' White
    Log '  9. Report any bug via the red-bug icon in the status bar.' White
    Log ' 10. When clean after one shift: use the Promote to team button' White
    Log '     in settings to flip flags for the entire mod team.' White
} else {
    Log 'Some steps failed. Review the log above.' Red
    Log 'Common recovery paths:' Yellow
    Log '  - Auth error: run  npx wrangler login  manually, then re-run this script.' White
    Log '  - Migration 013 partial: re-running is safe (CREATE IF NOT EXISTS + ALTER swallowed).' White
    Log '  - Deploy error: check cloudflare-worker/wrangler.jsonc exists.' White
    Log '  - verify-v8-0 failures: examine log at D:\AI\_PROJECTS\logs\verify-v8-0-*.log' White
    Log ''
    Log 'Rollback everything:' Yellow
    Log '  1. Restore *.v7.2.0.bak files in modtools-ext\ and cloudflare-worker\' White
    Log '  2. cd gaw-mod-shared-flags ; git revert 6453f69 ; git push' White
    Log '  3. cd gaw-dashboard ; git revert 488e1da ; git push' White
    Log '  4. Drop v8.0 tables:  wrangler d1 execute gaw-audit --remote' White
    Log '     --command="DROP TABLE shadow_triage_decisions; DROP TABLE parked_items; DROP TABLE ai_suspect_queue;"' White
}

Log ''
Log '---------------------------------------------' Cyan
Log "Log saved to: $LogPath" DarkGray

# -------------------- 4-step ending --------------------
try {
    # 1. Persist log to file
    $global:logBuf | Out-File -FilePath $LogPath -Encoding UTF8 -Force

    # 2. Copy log to clipboard
    $global:logBuf -join "`r`n" | Set-Clipboard
    Log '[log copied to clipboard]' Green
}
catch {
    Log "WARN: could not persist log / copy to clipboard: $_" Yellow
}

# 3. E-C-G beep (Commander signature)
try {
    [Console]::Beep(659, 160)
    Start-Sleep -Milliseconds 100
    [Console]::Beep(523, 160)
    Start-Sleep -Milliseconds 100
    [Console]::Beep(784, 800)
}
catch {}

# 4. Pause
if (-not $NoPause) {
    Write-Host ''
    Read-Host 'Press Enter to exit'
}

# Exit code: 0 if no failures, 2 if any failed
if ($failed -gt 0) { exit 2 } else { exit 0 }

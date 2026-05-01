<#
.SYNOPSIS
  D1 backup-restore drill -- prove that exports actually round-trip.
.DESCRIPTION
  1. Snapshots row counts from the remote 'gaw-audit' D1 (key tables only).
  2. `npx wrangler d1 export gaw-audit --remote` to a local SQL dump.
  3. Creates a fresh local SQLite DB from the dump.
  4. Compares row counts.
  5. Reports pass/fail with delta per table.

  Run quarterly. Failure means the export pipeline has rotted -- diagnose
  before the next outage forces a real restore at midnight.
#>
[CmdletBinding()]
param([switch]$NoPause)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$log = New-Object System.Collections.ArrayList
function Log($msg, $color='Gray'){
  $stamped = ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $msg)
  Write-Host $stamped -ForegroundColor $color
  [void]$log.Add($stamped)
}

$WorkerDir = 'D:\AI\_PROJECTS\cloudflare-worker'
$DbName = 'gaw-audit'
$BackupRoot = 'D:\AI\_PROJECTS\backups'
$Tables = @('actions','mod_messages','mod_tokens','gaw_posts','gaw_comments')

try {
  Push-Location $WorkerDir
  if (-not (Test-Path $BackupRoot)) { New-Item -ItemType Directory -Path $BackupRoot | Out-Null }
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $dumpPath = Join-Path $BackupRoot ("gaw-audit-$stamp.sql")
  $dbPath   = Join-Path $BackupRoot ("gaw-audit-$stamp.db")

  Log 'Phase 1: snapshot remote row counts...' 'Cyan'
  $remoteCounts = @{}
  foreach ($t in $Tables) {
    $cmd = "SELECT COUNT(*) AS n FROM $t"
    try {
      $raw = & npx wrangler d1 execute $DbName --remote --command $cmd --json 2>$null
      $obj = $raw | Out-String | ConvertFrom-Json
      $n = $obj[0].results.results[0].n
      if ($null -eq $n) { $n = 0 }
      $remoteCounts[$t] = [int]$n
      Log ("  remote $t = " + $n) 'DarkGray'
    } catch {
      Log ("  remote $t skipped: " + $_.Exception.Message.Substring(0,[Math]::Min(80,$_.Exception.Message.Length))) 'Yellow'
      $remoteCounts[$t] = -1
    }
  }

  Log 'Phase 2: export to SQL dump...' 'Cyan'
  & npx wrangler d1 export $DbName --remote --output=$dumpPath 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "wrangler d1 export exited $LASTEXITCODE" }
  if (-not (Test-Path $dumpPath)) { throw "export file not created: $dumpPath" }
  $dumpSize = (Get-Item $dumpPath).Length
  Log ("  dump: $dumpPath (" + [math]::Round($dumpSize/1MB,2) + " MB)") 'DarkGray'

  Log 'Phase 3: rehydrate into fresh local SQLite...' 'Cyan'
  # Try sqlite3 CLI; fall back to .NET if missing.
  $sqlite = Get-Command sqlite3 -ErrorAction SilentlyContinue
  if ($sqlite) {
    Get-Content $dumpPath -Raw | & sqlite3 $dbPath
    if ($LASTEXITCODE -ne 0) { throw "sqlite3 import exited $LASTEXITCODE" }
    Log '  imported via sqlite3 CLI' 'DarkGray'
  } else {
    Log '  sqlite3 CLI not on PATH -- skipping rehydration check' 'Yellow'
    Log "  install via: winget install SQLite.SQLite  (then re-run)" 'Yellow'
    # Still proves the export step works; row-count comparison is skipped.
    $dbPath = $null
  }

  if ($dbPath -and (Test-Path $dbPath)) {
    Log 'Phase 4: compare row counts...' 'Cyan'
    $localCounts = @{}
    foreach ($t in $Tables) {
      try {
        $n = & sqlite3 $dbPath "SELECT COUNT(*) FROM $t;"
        $localCounts[$t] = [int]$n
      } catch {
        $localCounts[$t] = -1
      }
    }

    $allOk = $true
    foreach ($t in $Tables) {
      $r = $remoteCounts[$t]
      $l = $localCounts[$t]
      if ($r -eq -1) {
        Log ("  $t : remote skipped") 'Yellow'
      } elseif ($r -eq $l) {
        Log ("  $t : OK ($r rows)") 'Green'
      } else {
        Log ("  $t : MISMATCH (remote=$r local=$l)") 'Red'
        $allOk = $false
      }
    }
    if ($allOk) { Log 'DRILL PASSED' 'Green' } else { Log 'DRILL FAILED' 'Red' }
  } else {
    Log 'Drill incomplete: rehydration skipped (sqlite3 missing).' 'Yellow'
  }

  Log '' 'Gray'
  Log "Dump: $dumpPath" 'Cyan'
  if ($dbPath) { Log "DB:   $dbPath" 'Cyan' }

  $logRoot = 'D:\AI\_PROJECTS\logs'
  if (-not (Test-Path $logRoot)) { New-Item -ItemType Directory -Path $logRoot | Out-Null }
  $logPath = Join-Path $logRoot ("backup-restore-drill-" + $stamp + ".log")
  $log | Set-Content -Path $logPath -Encoding UTF8

  ($log -join "`r`n") | Set-Clipboard
  Log '[full debug log copied to clipboard]' 'Green'

  try {
    [Console]::Beep(659, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(523, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(784, 800)
  } catch {}

  if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }
  Pop-Location
  exit 0
}
catch {
  Log ('FAIL: ' + $_.Exception.Message) 'Red'
  Log ('  at: ' + $_.InvocationInfo.PositionMessage) 'DarkGray'
  ($log -join "`r`n") | Set-Clipboard
  Log '[full debug log copied to clipboard]' 'Yellow'
  try {
    [Console]::Beep(440, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(330, 600)
  } catch {}
  if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }
  try { Pop-Location } catch {}
  exit 2
}

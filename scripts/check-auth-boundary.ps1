<#
.SYNOPSIS
  v5.0 Phase 1 CI guard. Greps the codebase for forbidden auth patterns
  that would re-introduce content-script secret reads.
.DESCRIPTION
  Fails (exit 2) if any of:
    - `_secretsCache.workerModToken` is read OUTSIDE background.js
    - `_secretsCache.leadModToken` is read OUTSIDE background.js
    - new direct `fetch('https://...workers.dev` calls land in modtools.js
      that pass `X-Mod-Token` or `X-Lead-Token` (these belong in named RPCs)

  Run before commit; wire into git pre-commit if useful.
#>
[CmdletBinding()]
param([switch]$NoPause)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$root = Split-Path -Parent $PSScriptRoot
$violations = New-Object System.Collections.ArrayList
$log = New-Object System.Collections.ArrayList
function Log($m, $c='Gray'){ $s=('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'),$m); Write-Host $s -ForegroundColor $c; [void]$log.Add($s) }

function Check($file, $pattern, $rule) {
  $p = Join-Path $root $file
  if (-not (Test-Path $p)) { return }
  $hits = Select-String -Path $p -Pattern $pattern -AllMatches
  foreach ($h in $hits) {
    $line = $h.Line.Trim()
    if ($line.StartsWith('//') -or $line.StartsWith('*')) { continue } # skip comments
    [void]$violations.Add([pscustomobject]@{
      File=$file; Line=$h.LineNumber; Rule=$rule; Text=$line
    })
  }
}

try {
  Log 'v5.0 Phase 1 boundary check' 'Cyan'

  # Rule 1: _secretsCache token reads OUTSIDE background.js
  Check 'modtools.js' '_secretsCache\.(worker|lead)ModToken'   'no-content-script-secret-read'
  Check 'popup.js'    '_secretsCache\.(worker|lead)ModToken'   'no-popup-secret-read'

  # Rule 2: any X-Mod-Token / X-Lead-Token literal OUTSIDE background.js
  Check 'modtools.js' "X-Mod-Token"                            'no-direct-token-header-in-content'
  Check 'modtools.js' "X-Lead-Token"                           'no-direct-token-header-in-content'

  if ($violations.Count -eq 0) {
    Log '' 'Gray'
    Log 'PASS -- no v5.0 Phase 1 boundary violations.' 'Green'
    try { [Console]::Beep(659,160); Start-Sleep -Milliseconds 100; [Console]::Beep(523,160); Start-Sleep -Milliseconds 100; [Console]::Beep(784,800) } catch {}
    if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }
    exit 0
  }

  Log '' 'Gray'
  Log ('FAIL -- ' + $violations.Count + ' violation(s):') 'Red'
  $violations | ForEach-Object {
    Log ('  ' + $_.File + ':' + $_.Line + '  [' + $_.Rule + ']') 'Yellow'
    Log ('    ' + $_.Text) 'DarkGray'
  }
  ($log -join "`r`n") | Set-Clipboard
  Log '[debug log copied to clipboard]' 'Yellow'
  try { [Console]::Beep(440,160); Start-Sleep -Milliseconds 100; [Console]::Beep(330,600) } catch {}
  if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }
  exit 2
}
catch {
  Log ('FAIL: ' + $_.Exception.Message) 'Red'
  ($log -join "`r`n") | Set-Clipboard

# --- Retrofit ending block (ps1-retrofit-endingblock.ps1 v1) ---
# Conditionally executed: only if $logVar appears to be a log buffer.
try {
    if (($log -is [System.Collections.IList]) -or ($log -is [string])) {
        $__rlogText = if ($log -is [string]) { $log } else { $log -join "`r`n" }
        $__rlogFile = Join-Path 'D:\AI\_PROJECTS\logs' ('check-auth-boundary-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
        if (-not (Test-Path 'D:\AI\_PROJECTS\logs')) { New-Item -ItemType Directory -Path 'D:\AI\_PROJECTS\logs' -Force | Out-Null }
        $__rlogText | Out-File -FilePath $__rlogFile -Encoding UTF8
        $__rlogText | Set-Clipboard
        Write-Host "[log persisted: $__rlogFile]" -ForegroundColor DarkGray
        Write-Host '[FULL DEBUG LOG COPIED TO CLIPBOARD]' -ForegroundColor Green
    }
    [Console]::Beep(659, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(523, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(784, 800)
} catch {}
# --- end retrofit ending block ---
  if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }
  exit 2
}

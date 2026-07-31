# Build for non-programmer operator: deploy the extension to the local Chrome
# "load unpacked" folder. This is the ONLY deploy path that makes changes show
# up in Commander's browser. The build-zip.ps1 script makes a Web Store ZIP; it
# does NOT reach the live unpacked install. (This drift is what caused the
# v10.49.2 incident where source edits never reached the browser.)
#
# WHAT THIS DOES: syntax-checks the 4 JS files -> copies the runtime file set
# into the unpacked folder Chrome actually reads -> verifies the copy -> beeps.
#
# USAGE: pwsh -File scripts\deploy-unpacked.ps1   (double-click the .bat wrapper)
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

# --- Anti-fragile header (AGENTS.md S19a): plain-language purpose + pre-announce ---
Write-Host ''
Write-Host '=== DEPLOY GAW ModTools to local Chrome (load-unpacked) ===' -ForegroundColor White
Write-Host 'Copies the current source build into the folder Chrome loads from.' -ForegroundColor Gray
Write-Host 'No elevation needed. No data is deleted; files are overwritten in place.' -ForegroundColor Gray
Write-Host ''

$RepoRoot    = Split-Path -Parent $PSScriptRoot
$ManifestPath= Join-Path $RepoRoot 'manifest.json'
# The live unpacked path Chrome's Secure Preferences binds the extension ID to.
# (Confirmed 2026-07-31: location=4 / load-unpacked, ID pfkfimhoefhodeoklmlacdehgmlngmgc.)
$DeployDir   = 'D:\AI\_PROJECTS\dist\mod-tools dist'

try {
  Log "Source (repo): $RepoRoot"
  Log "Deploy target: $DeployDir"

  # --- Pre-flight: manifest + version ---
  if (-not (Test-Path $ManifestPath)) { throw "manifest.json not found at $ManifestPath" }
  $manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
  $version  = $manifest.version
  Log "Source version: $version" 'Cyan'
  if (-not $version) { throw 'manifest.json has no version field' }

  # --- Pre-flight: syntax-check all 4 JS files (never deploy broken JS) ---
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { throw 'node not on PATH — cannot syntax-check; aborting deploy' }
  foreach ($js in 'modtools.js','modtools-aux.js','popup.js','background.js') {
    $p = Join-Path $RepoRoot $js
    if (Test-Path $p) {
      & node --check $p
      if ($LASTEXITCODE -ne 0) { throw "$js failed Node parse check — deploy aborted, nothing copied" }
      Log "$js parse: OK" 'DarkGray'
    }
  }

  # --- Ensure deploy dir exists ---
  if (-not (Test-Path $DeployDir)) {
    New-Item -ItemType Directory -Path $DeployDir -Force | Out-Null
    Log "Created deploy dir (was missing)" 'Yellow'
  }

  # --- Copy the runtime file set (matches what build-zip ships; no docs/tests/scripts) ---
  $files = 'manifest.json','background.js','modtools.js','modtools-aux.js','popup.js','popup.css','popup.html','README.md'
  Log "Copying $($files.Count) files..." 'Cyan'
  foreach ($f in $files) {
    $src = Join-Path $RepoRoot $f
    if (Test-Path $src) {
      Copy-Item $src (Join-Path $DeployDir $f) -Force
      Log "  copied $f"
    } else {
      Log "  SKIP $f (not in source)" 'Yellow'
    }
  }
  # Icons dir
  $iconsSrc = Join-Path $RepoRoot 'icons'
  if (Test-Path $iconsSrc) {
    Copy-Item $iconsSrc\* (Join-Path $DeployDir 'icons') -Force -Recurse
    Log '  synced icons/'
  }

  # --- Verify the copy took ---
  $depMan = Get-Content (Join-Path $DeployDir 'manifest.json') -Raw | ConvertFrom-Json
  if ($depMan.version -ne $version) { throw "Deployed version $($depMan.version) != source $version — copy failed" }
  Log "Deployed version verified: $($depMan.version)" 'Green'

  # --- Final report buffer (AGENTS.md S0 step 1) ---
  $report = @(
    "DEPLOY REPORT - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "Source:  $RepoRoot (v$version)",
    "Target:  $DeployDir",
    "Files:   $($files.Count) runtime files + icons/",
    "Status:  SUCCESS — reload the extension in chrome://extensions to see changes",
    "NOTE:    This script only updates the load-unpacked folder. Web Store publish still needs build-zip.ps1."
  ) -join "`n"

  # --- Step 2: write full debug log to logs/ (NOT clipboard, per AGENTS.md S9) ---
  $logDir = 'D:\AI\_PROJECTS\logs'
  if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
  $logFile = Join-Path $logDir ("deploy-unpacked-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  $report + "`n`n--- verbose log ---`n" + ($log -join "`n") | Out-File -FilePath $logFile -Encoding UTF8
  Log "Log written: $logFile" 'DarkGray'

  Write-Host ''
  Write-Host 'SUCCESS. Reload GAW ModTools in chrome://extensions to see the update.' -ForegroundColor Green

  # --- Step 3: E-C-G beep (AGENTS.md S0 step 3) ---
  try {
    [console]::beep(659,160); [console]::beep(523,160); [console]::beep(784,800)
  } catch {}

  # --- Step 4: pause unless -NoPause (AGENTS.md S0 step 4) ---
  if (-not $NoPause) { Read-Host "`nPress Enter to close" }

} catch {
  $err = "DEPLOY FAILED: $($_.Exception.Message)"
  Write-Host $err -ForegroundColor Red
  $logDir = 'D:\AI\_PROJECTS\logs'
  if (Test-Path $logDir) {
    $logFile = Join-Path $logDir ("deploy-unpacked-FAIL-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    $err + "`n`n" + ($log -join "`n") | Out-File -FilePath $logFile -Encoding UTF8
    Write-Host "Failure log: $logFile" -ForegroundColor DarkGray
  }
  try { [console]::beep(200,600) } catch {}
  if (-not $NoPause) { Read-Host "`nPress Enter to close" }
  exit 1
}

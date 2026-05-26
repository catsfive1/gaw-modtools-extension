<#
.SYNOPSIS
  Stage and ZIP the extension for Chrome Web Store / direct distribution.
.DESCRIPTION
  Reads version from manifest.json, copies the Chrome-required files to a
  temp staging dir, zips them to D:\AI\_PROJECTS\dist\gaw-modtools-chrome-store-vX.Y.Z.zip,
  reports size + SHA256 + parse-clean status.
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

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ManifestPath = Join-Path $RepoRoot 'manifest.json'
$DistDir = 'D:\AI\_PROJECTS\dist'

try {
  Log "RepoRoot: $RepoRoot" 'Cyan'
  if (-not (Test-Path $ManifestPath)) { throw "manifest.json not found at $ManifestPath" }

  $manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
  $version = $manifest.version
  Log "manifest version: $version" 'Cyan'
  if (-not $version) { throw 'manifest.json has no version field' }

  # Verify modtools.js parses (Node check)
  $mtPath = Join-Path $RepoRoot 'modtools.js'
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    & node --check $mtPath
    if ($LASTEXITCODE -ne 0) { throw "modtools.js failed Node parse check" }
    Log 'modtools.js parse: OK' 'Green'
  } else {
    Log 'node not on PATH; skipping parse check' 'Yellow'
  }

  if (-not (Test-Path $DistDir)) { New-Item -ItemType Directory -Path $DistDir | Out-Null }
  $outZip = Join-Path $DistDir ("gaw-modtools-chrome-store-v$version.zip")
  Log "target ZIP: $outZip" 'Cyan'

  # Stage to a temp dir so we don't leak repo dotfiles into the ZIP
  $stage = Join-Path $env:TEMP ("gam-stage-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $stage | Out-Null

  $includes = @('manifest.json','modtools.js','modtools-aux.js','background.js','popup.html','popup.js','popup.css','LICENSE','README.md')
  $copied = 0
  foreach ($name in $includes) {
    $src = Join-Path $RepoRoot $name
    if (Test-Path $src) {
      Copy-Item $src (Join-Path $stage $name) -Force
      $copied++
    }
  }
  Log ("staged $copied files") 'Cyan'

  $iconsSrc = Join-Path $RepoRoot 'icons'
  if (Test-Path $iconsSrc) {
    # v8.6.4: filter out .bak / .prev.bak / *~ junk so old icon snapshots
    # don't bloat the Chrome Web Store package. Only ship real icon files.
    $iconsDst = Join-Path $stage 'icons'
    New-Item -ItemType Directory -Path $iconsDst | Out-Null
    Get-ChildItem $iconsSrc -File |
      Where-Object { $_.Extension -in '.png','.jpg','.jpeg','.svg','.webp','.ico' } |
      ForEach-Object { Copy-Item $_.FullName (Join-Path $iconsDst $_.Name) -Force }
    $iconCount = (Get-ChildItem $iconsDst -File).Count
    Log "staged icons: $iconCount" 'Cyan'
  }

  if (Test-Path $outZip) { Remove-Item $outZip -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $outZip -Force
  Remove-Item $stage -Recurse -Force

  # v9.2.3: also extract into the "Load unpacked" folder Chrome reads from.
  # Without this step, the user has to manually unzip every build before the
  # extension reload arrow can pick up changes -- regression caught when the
  # popup stayed at v9.2.2 after a clean v9.2.3 build because Chrome was
  # still loading from a stale extraction.
  $UnpackedDir = Join-Path $DistDir 'mod-tools dist'
  try {
    if (Test-Path $UnpackedDir) {
      # Wipe contents (not the directory itself, so Chrome's path stays valid)
      Get-ChildItem $UnpackedDir -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    } else {
      New-Item -ItemType Directory -Path $UnpackedDir | Out-Null
    }
    Expand-Archive -Path $outZip -DestinationPath $UnpackedDir -Force
    Log "extracted to: $UnpackedDir" 'Cyan'
  } catch {
    Log ("WARN: extract to '$UnpackedDir' failed: " + $_.Exception.Message) 'Yellow'
  }

  $info = Get-Item $outZip
  $sha = (Get-FileHash $outZip -Algorithm SHA256).Hash.ToLower()
  $sizeKB = [math]::Round($info.Length / 1KB, 1)
  Log '' 'Gray'
  Log '=== BUILD SUMMARY ===' 'Green'
  Log "version: $version" 'Green'
  Log "path:    $outZip" 'Green'
  Log "size:    $sizeKB KB" 'Green'
  Log "sha256:  $sha" 'Green'

  # Persist the log for recovery
  $logRoot = 'D:\AI\_PROJECTS\logs'
  if (-not (Test-Path $logRoot)) { New-Item -ItemType Directory -Path $logRoot | Out-Null }
  $logPath = Join-Path $logRoot ("build-zip-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
  $log | Set-Content -Path $logPath -Encoding UTF8

  # Clipboard the full debug log (per Commander rule)
  ($log -join "`r`n") | Set-Clipboard
  Log '[full debug log copied to clipboard]' 'Green'

  # E-C-G beep
  try {
    [Console]::Beep(659, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(523, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(784, 800)
  } catch {}

  if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }
  exit 0
}
catch {
  Log ("FAIL: " + $_.Exception.Message) 'Red'
  Log ("  at: " + $_.InvocationInfo.PositionMessage) 'DarkGray'
  ($log -join "`r`n") | Set-Clipboard
  Log '[full debug log copied to clipboard]' 'Yellow'
  try {
    [Console]::Beep(440, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(330, 600)
  } catch {}
  if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }
  exit 2
}

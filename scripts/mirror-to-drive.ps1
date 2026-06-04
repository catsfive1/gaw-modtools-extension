param([string]$Version = '10.18.2', [switch]$NoPause)
$ErrorActionPreference = 'Stop'
$src = "D:\AI\_PROJECTS\dist\gaw-modtools-chrome-store-v$Version.zip"
$dstDir = 'E:\My Drive\_PROJECTS\modtools-ext'
$log = New-Object System.Collections.ArrayList
function Log($m, $c='Gray'){
  $s = ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $m)
  Write-Host $s -ForegroundColor $c
  [void]$log.Add($s)
}
try {
  if (-not (Test-Path 'E:\')) { Log '[skip] E: drive not mounted' 'Yellow'; exit 0 }
  if (-not (Test-Path $src)) { throw "source ZIP not found: $src" }
  if (-not (Test-Path $dstDir)) {
    New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
    Log "[mkdir] $dstDir" 'Cyan'
  }
  $dst = Join-Path $dstDir (Split-Path -Leaf $src)
  Copy-Item $src $dst -Force
  Log "[mirror OK] $dst" 'Green'
  $all = Get-ChildItem $dstDir -Filter 'gaw-modtools-chrome-store-v*.zip' | Sort-Object LastWriteTime -Descending
  $pruned = 0
  $all | Select-Object -Skip 2 | ForEach-Object {
    Remove-Item $_.FullName -Force
    Log ("[prune] " + $_.Name) 'Yellow'
    $pruned++
  }
  Log '--- Drive archive state ---' 'Cyan'
  Get-ChildItem $dstDir -Filter 'gaw-modtools-chrome-store-v*.zip' | Sort-Object LastWriteTime -Descending | ForEach-Object {
    Log ("  " + $_.Name + "  (" + [math]::Round($_.Length/1KB, 1) + " KB)") 'Green'
  }
  Log "[done] mirrored v$Version + pruned $pruned older" 'Green'
}
catch {
  Log ("FAIL: " + $_.Exception.Message) 'Red'
  ($log -join "`r`n") | Set-Clipboard
  Log '[log copied to clipboard]' 'Yellow'
  if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }
  exit 2
}
($log -join "`r`n") | Set-Clipboard
Log '[log copied to clipboard]' 'Green'
try {
  [Console]::Beep(659, 160); Start-Sleep -Milliseconds 100
  [Console]::Beep(523, 160); Start-Sleep -Milliseconds 100
  [Console]::Beep(784, 800)
} catch {}
if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }
exit 0

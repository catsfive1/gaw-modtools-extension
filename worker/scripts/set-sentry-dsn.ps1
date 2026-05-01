<#
.SYNOPSIS
  Set the SENTRY_DSN worker secret. Runs the wrangler tempfile-pipe pattern
  so long DSN strings don't get mangled by the PowerShell paste-to-prompt bug.
.DESCRIPTION
  Prompts for the Sentry DSN (hidden), validates it parses as a URL with
  the expected shape (https://<key>@<host>/<projectId>), writes to a temp
  file, pipes to `wrangler secret put`, securely wipes the temp file, and
  reports success.

  After this runs, the worker's captureSentry() helper is live -- top-level
  fetch() catches and cron task catches now POST errors to Sentry. No code
  redeploy needed; the next request that errors is captured.

  To disable later: `npx wrangler secret delete SENTRY_DSN`. The capture
  helper degrades gracefully when the secret is absent.
#>
[CmdletBinding()]
param(
  [string]$Dsn,
  [switch]$FromClipboard,
  [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$log = New-Object System.Collections.ArrayList
function Log($msg, $color='Gray'){
  $stamped = ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $msg)
  Write-Host $stamped -ForegroundColor $color
  [void]$log.Add($stamped)
}

$WorkerDir = 'D:\AI\_PROJECTS\cloudflare-worker'

try {
  Push-Location $WorkerDir

  Log 'Sentry DSN setup' 'Cyan'
  Log 'Get a DSN by creating a project at https://sentry.io (free tier supports our volume)' 'DarkGray'
  Log 'DSN format: https://<key>@<host>/<projectId>' 'DarkGray'
  Log '' 'Gray'

  if ($FromClipboard) {
    Log 'Reading DSN from clipboard...' 'Cyan'
    $dsn = (Get-Clipboard -Raw)
    if (-not $dsn) { throw 'clipboard is empty -- copy the DSN first, then re-run' }
    $dsn = $dsn.Trim()
  } elseif ($Dsn) {
    Log 'DSN provided via -Dsn parameter (skipping Read-Host)' 'DarkGray'
    $dsn = $Dsn.Trim()
  } else {
    Log 'Tip: easiest path is to copy the DSN to clipboard and run with -FromClipboard' 'DarkGray'
    Log '' 'Gray'
    $secure = Read-Host 'Paste Sentry DSN (hidden; only one * shows on paste -- that is normal)' -AsSecureString
    $dsn = [System.Net.NetworkCredential]::new('', $secure).Password
    if (-not $dsn) { throw 'no DSN entered' }
    $dsn = $dsn.Trim()
  }

  Log ('  captured length: ' + $dsn.Length + ' chars') 'DarkGray'
  if ($dsn.Length -lt 30) {
    Log ('  raw value: ' + $dsn) 'Yellow'
  } else {
    # Redact-friendly preview: first 12 + last 8, dots between
    $preview = $dsn.Substring(0, [Math]::Min(12, $dsn.Length)) + '...' + $dsn.Substring([Math]::Max(0, $dsn.Length - 8))
    Log ('  preview: ' + $preview) 'DarkGray'
  }

  # Validate shape
  try {
    $uri = [Uri]$dsn
    if (-not $uri.UserInfo) {
      throw "DSN missing key (no user-info segment). Got scheme='$($uri.Scheme)' host='$($uri.Host)' path='$($uri.AbsolutePath)'. Expected shape: https://<key>@<host>/<projectId>"
    }
    if (-not $uri.Host)     { throw 'DSN missing host' }
    $project = ($uri.AbsolutePath -replace '^/', '').TrimEnd('/').Split('/')[-1]
    if (-not $project) { throw 'DSN missing project id' }
    Log ('  host:    ' + $uri.Host) 'Cyan'
    Log ('  project: ' + $project) 'Cyan'
    Log ('  key:     ' + $uri.UserInfo.Substring(0, [Math]::Min(8, $uri.UserInfo.Length)) + '...') 'Cyan'
  } catch {
    throw ('DSN failed parse: ' + $_.Exception.Message)
  }

  $tmp = Join-Path $env:TEMP ("sentry_dsn_" + [guid]::NewGuid().ToString('N') + ".txt")
  Log ('Writing DSN to temp file...') 'DarkGray'
  [IO.File]::WriteAllText($tmp, $dsn, [Text.Encoding]::ASCII)

  Log 'Setting SENTRY_DSN via npx wrangler...' 'Cyan'
  Get-Content $tmp -Raw | & npx wrangler secret put SENTRY_DSN
  $exit = $LASTEXITCODE

  Log 'Securely wiping temp file...' 'DarkGray'
  $fs = [IO.File]::Open($tmp, 'Open', 'Write')
  try {
    $len = $fs.Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    for ($pass = 0; $pass -lt 3; $pass++) {
      $fs.Position = 0
      $buf = New-Object byte[] $len
      $rng.GetBytes($buf)
      $fs.Write($buf, 0, $len)
      $fs.Flush()
    }
  } finally { $fs.Close() }
  Remove-Item $tmp -Force

  if ($exit -ne 0) { throw "wrangler secret put exited with code $exit" }

  Log '' 'Gray'
  Log '=== SENTRY ENABLED ===' 'Green'
  Log ('  host:    ' + $uri.Host) 'Green'
  Log ('  project: ' + $project) 'Green'
  Log '  capture is live; next worker error will appear in Sentry within seconds' 'Green'
  Log '  no redeploy required' 'Green'

  $logRoot = 'D:\AI\_PROJECTS\logs'
  if (-not (Test-Path $logRoot)) { New-Item -ItemType Directory -Path $logRoot | Out-Null }
  $logPath = Join-Path $logRoot ("set-sentry-dsn-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
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

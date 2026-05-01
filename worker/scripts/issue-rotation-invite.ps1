<#
.SYNOPSIS
  Lead-only: issue a one-time-use rotation invite for a specific mod.
.DESCRIPTION
  Calls POST /admin/mod/rotation-invite with the lead token. The worker
  generates a 48-char invite code (only the SHA-256 hash is stored in D1),
  returns the plaintext to this script. The script copies it to clipboard
  so the lead can paste it directly into a Discord DM to the mod.

  The mod claims via the "I have a rotation invite" button in their popup.
  The worker generates a fresh random token at claim time -- the lead never
  sees the resulting token, so cannot impersonate the mod after the claim.

  Invites expire 24h after issue and are single-use. Re-issue freely if the
  mod doesn't claim in time.
.PARAMETER Username
  GAW mod username the invite is bound to. Must already exist in mod_tokens.
.EXAMPLE
  pwsh issue-rotation-invite.ps1 -Username someguy
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [string]$Username,
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

$WorkerUrl = 'https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev'

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

  if (-not ($Username -match '^[A-Za-z0-9_-]{2,32}$')) {
    throw 'Invalid username shape (allowed: 2-32 chars, alphanumeric + _-)'
  }

  Log ('issuing rotation invite for: ' + $Username) 'Cyan'
  Log ('worker: ' + $WorkerUrl) 'DarkGray'

  $secure = Read-Host 'Paste lead-mod token (hidden; only one * shows on paste -- normal)' -AsSecureString
  $leadToken = [System.Net.NetworkCredential]::new('', $secure).Password
  if (-not $leadToken) { throw 'no lead token entered' }

  $body = @{ username = $Username } | ConvertTo-Json -Compress

  Log 'POST /admin/mod/rotation-invite ...' 'Cyan'
  $resp = Invoke-RestMethod `
    -Uri ($WorkerUrl + '/admin/mod/rotation-invite') `
    -Method Post `
    -Headers @{ 'x-lead-token' = $leadToken; 'Content-Type' = 'application/json' } `
    -Body $body `
    -TimeoutSec 30

  if (-not $resp.ok) {
    throw ('worker rejected: ' + ($resp.error | Out-String))
  }

  $code = $resp.code
  $expiresAt = [DateTimeOffset]::FromUnixTimeMilliseconds($resp.expires_at).LocalDateTime

  Log '' 'Gray'
  Log '=== INVITE ISSUED ===' 'Green'
  Log ('  username:    ' + $resp.username) 'Green'
  Log ('  ttl_hours:   ' + $resp.ttl_hours) 'Green'
  Log ('  expires_at:  ' + $expiresAt.ToString('yyyy-MM-dd HH:mm:ss')) 'Green'
  Log '' 'Gray'
  Log 'INVITE CODE (deliver to mod via Discord DM):' 'Yellow'
  Log ('  ' + $code) 'Yellow'
  Log '' 'Gray'

  # Code -> clipboard for easy paste-into-DM
  $code | Set-Clipboard
  Log '[invite code copied to clipboard]' 'Cyan'
  Log 'Suggested DM text:' 'DarkGray'
  Log ("  Hey, here's your rotation invite. In ModTools popup click 'I have a rotation invite', enter your GAW username '" + $resp.username + "', then paste this code:") 'DarkGray'
  Log ('  ' + $code) 'DarkGray'

  $logRoot = 'D:\AI\_PROJECTS\logs'
  if (-not (Test-Path $logRoot)) { New-Item -ItemType Directory -Path $logRoot | Out-Null }
  $logPath = Join-Path $logRoot ("issue-rotation-invite-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
  # Persist log WITHOUT the invite code -- code lives only in clipboard.
  $logRedacted = ($log | ForEach-Object { if ($_ -match $code) { '<line containing invite code redacted>' } else { $_ } })
  $logRedacted | Set-Content -Path $logPath -Encoding UTF8

  try {
    [Console]::Beep(659, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(523, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(784, 800)
  } catch {}

  if (-not $NoPause) { Read-Host 'Press Enter to exit (clipboard still has the invite code)' | Out-Null }
  exit 0
}
catch {
  Log ('FAIL: ' + $_.Exception.Message) 'Red'
  Log ('  at: ' + $_.InvocationInfo.PositionMessage) 'DarkGray'
  ($log -join "`r`n") | Set-Clipboard
  Log '[debug log copied to clipboard]' 'Yellow'
  try {
    [Console]::Beep(440, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(330, 600)
  } catch {}
  if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }
  exit 2
}

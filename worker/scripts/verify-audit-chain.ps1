<#
.SYNOPSIS
  Verify the Merkle audit chain on the gaw-mod-proxy worker.
.DESCRIPTION
  Prompts for the lead-mod token (hidden), calls /admin/audit/verify,
  and reports chain state. Run this on demand or schedule weekly.

  - ok=true means every chained row's hash matched expectations.
  - ok=false + first_break tells you exactly where the chain broke.
  - checked=0 means no chained rows yet (expected immediately after
    the migration; chain starts at the first /audit/log call afterward).
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

$WorkerUrl = 'https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev'

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

  Log 'Audit chain verifier' 'Cyan'
  Log ('Worker: ' + $WorkerUrl) 'DarkGray'
  Log '' 'Gray'
  $secure = Read-Host 'Paste lead-mod token (hidden; only one * shows on paste -- that is normal)' -AsSecureString
  $token = [System.Net.NetworkCredential]::new('', $secure).Password
  if (-not $token) { throw 'no token entered' }
  Log ('token length: ' + $token.Length + ' chars') 'DarkGray'

  $headers = @{ 'x-lead-token' = $token }
  $url = $WorkerUrl + '/admin/audit/verify?limit=50000'
  Log ('GET ' + $url) 'Cyan'

  try {
    $resp = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -TimeoutSec 30
  } catch {
    $sr = $_.Exception.Response
    if ($sr) {
      Log ('HTTP ' + $sr.StatusCode.value__ + ' ' + $sr.StatusDescription) 'Red'
    }
    throw
  }

  Log '' 'Gray'
  Log '=== CHAIN VERIFICATION ===' (if ($resp.ok) { 'Green' } else { 'Red' })
  Log ('  ok:         ' + $resp.ok) (if ($resp.ok) { 'Green' } else { 'Red' })
  Log ('  checked:    ' + $resp.checked) 'Cyan'
  Log ('  last_id:    ' + $resp.last_id) 'Cyan'
  Log ('  chain_head: ' + $(if ($resp.chain_head) { $resp.chain_head.Substring(0, [Math]::Min(16, $resp.chain_head.Length)) + '...' } else { '(empty)' })) 'Cyan'
  if ($resp.first_break) {
    Log '' 'Red'
    Log '!!! CHAIN BROKEN !!!' 'Red'
    Log ('  row id:   ' + $resp.first_break.id) 'Red'
    Log ('  reason:   ' + $resp.first_break.reason) 'Red'
    Log ('  expected: ' + $resp.first_break.expected) 'Red'
    Log ('  got:      ' + $resp.first_break.got) 'Red'
    Log '' 'Red'
    Log 'This row was modified or deleted. Investigate via SQL:' 'Red'
    Log ("  npx wrangler d1 execute gaw-audit --remote --command `"SELECT * FROM actions WHERE id = " + $resp.first_break.id + "`"") 'Yellow'
  } else {
    if ($resp.checked -eq 0) {
      Log '' 'Yellow'
      Log 'Chain is empty -- no audit rows since migration 018.' 'Yellow'
      Log 'Expected immediately after deploy; will populate as mods take action.' 'DarkGray'
    } else {
      Log '' 'Green'
      Log ('Chain integrity confirmed across ' + $resp.checked + ' rows.') 'Green'
    }
  }

  $logRoot = 'D:\AI\_PROJECTS\logs'
  if (-not (Test-Path $logRoot)) { New-Item -ItemType Directory -Path $logRoot | Out-Null }
  $logPath = Join-Path $logRoot ("verify-audit-chain-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
  $log | Set-Content -Path $logPath -Encoding UTF8

  ($log -join "`r`n") | Set-Clipboard
  Log '[full debug log copied to clipboard]' 'Green'

  try {
    [Console]::Beep(659, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(523, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(784, 800)
  } catch {}

  if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }
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
  exit 2
}

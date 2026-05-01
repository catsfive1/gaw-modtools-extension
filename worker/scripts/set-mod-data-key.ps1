<#
.SYNOPSIS
  Generate a random AES-256 key and set it as MOD_DATA_KEY worker secret.
.DESCRIPTION
  - Generates 32 random bytes via .NET RNG (cryptographic randomness).
  - Base64-encodes the bytes (44-char wire format).
  - Writes the encoded key to a temp file.
  - Pipes the temp file to `wrangler secret put MOD_DATA_KEY` -- this avoids
    the PowerShell paste bug where long strings get mangled to a single SYN
    control char on interactive entry (lesson from the ANTHROPIC_API_KEY
    saga, 2026-04-23).
  - Securely deletes the temp file (3-pass overwrite + delete).
  - Persists ONLY the SHA-256 fingerprint of the key to a log so we can
    confirm what got set without leaking the key.
.NOTES
  Requires: pwsh, npm/npx, wrangler authenticated to the gaw-mod-proxy worker.
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

try {
  Push-Location $WorkerDir

  Log 'Generating 32 random bytes (AES-256)...' 'Cyan'
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $b64 = [Convert]::ToBase64String($bytes)
  Log ('  key length (b64 chars): ' + $b64.Length) 'DarkGray'

  $sha = [System.Security.Cryptography.SHA256]::Create()
  $fp  = ($sha.ComputeHash([Text.Encoding]::ASCII.GetBytes($b64)) | ForEach-Object { $_.ToString('x2') }) -join ''
  Log ('  key fingerprint (SHA-256 of b64 form): ' + $fp.Substring(0,16) + '...') 'DarkGray'

  $tmp = Join-Path $env:TEMP ("mod_data_key_" + [guid]::NewGuid().ToString('N') + ".txt")
  Log ('Writing key to temp file: ' + $tmp) 'DarkGray'
  # ASCII no-newline -- wrangler reads stdin verbatim
  [IO.File]::WriteAllText($tmp, $b64, [Text.Encoding]::ASCII)

  Log 'Setting MOD_DATA_KEY via npx wrangler...' 'Cyan'
  Get-Content $tmp -Raw | & npx wrangler secret put MOD_DATA_KEY
  $exit = $LASTEXITCODE

  # 3-pass overwrite then delete
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
  Log 'wrangler secret put: OK' 'Green'
  Log '' 'Gray'
  Log '=== KEY SET ===' 'Green'
  Log ('  MOD_DATA_KEY (b64 fingerprint): ' + $fp.Substring(0,16) + '...') 'Green'
  Log '  full key never logged or persisted' 'Green'

  $logRoot = 'D:\AI\_PROJECTS\logs'
  if (-not (Test-Path $logRoot)) { New-Item -ItemType Directory -Path $logRoot | Out-Null }
  $logPath = Join-Path $logRoot ("set-mod-data-key-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
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

<#
.SYNOPSIS
  Recover lead-mod access: mint a fresh team token for a username with is_lead=1
  and write it directly into the worker's mod_tokens (D1) table.
.DESCRIPTION
  Use when a lead is locked out of the extension (lost the local token; the
  previously-saved token was rotated and now 401s). The canonical
  /admin/import-tokens-from-kv path can ONLY create is_lead=0 rows -- lead
  promotion is a separate gated handler -- so it cannot restore LEAD status.
  This does it in ONE surgical D1 insert that mirrors the worker's own INSERT
  shape (token=NULL, token_hash set; see handleAdminImportTokensFromKv) but with
  is_lead=1.

  Steps:
    1. Generate a fresh 32-byte base64url team token.
    2. Compute its SHA-256 hex (matches the worker's sha256Hex token lookup).
    3. INSERT a mod_tokens row (is_lead=1) via: wrangler d1 execute gaw-audit --remote.
    4. Self-verify: GET /mod/whoami with the new token -> expect is_lead:true.
    5. Write the token to a dedicated file + paste instructions.

  The token is written to a FILE (clipboard holds the debug log, per the
  Commander rule). -DryRun does everything EXCEPT the remote D1 write + verify.
.PARAMETER ModUser
  GAW username to restore as lead. Default: catsfive.
.PARAMETER NoPause
  Skip the final Read-Host pause (for scripted runs).
.PARAMETER DryRun
  Generate + build the SQL but do NOT touch the remote DB (safe rehearsal).
.NOTES
  Requires: PowerShell 5.1+ (works on powershell.exe and pwsh.exe).
  Requires: this machine's wrangler auth (the same that runs deploys).
#>
[CmdletBinding()]
param(
  [string]$ModUser = 'catsfive',
  [switch]$NoPause,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

$WorkerUrl = 'https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev'
$DbName    = 'gaw-audit'
$WorkerDir = 'D:\AI\_PROJECTS\cloudflare-worker'
$LogDir    = 'D:\AI\_PROJECTS\logs'

$log = New-Object System.Collections.ArrayList
function Say($m, $c='Gray'){
  $s = ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $m)
  Write-Host $s -ForegroundColor $c
  [void]$log.Add($s)
}
function Mask($s){
  if (-not $s) { return '(empty)' }
  if ($s.Length -le 10) { return '(' + $s.Length + ' chars)' }
  return $s.Substring(0,4) + '...' + $s.Substring($s.Length-4) + ' (len ' + $s.Length + ')'
}

$ok = $false
$tokenFile = ''
$sqlFile = ''
try {
  Say '=== GAW ModTools -- Lead Access Recovery ===' 'Cyan'
  Say ('Worker:   ' + $WorkerUrl)
  Say ('DB:       ' + $DbName)
  Say ('ModUser:  ' + $ModUser)
  Say ('DryRun:   ' + [bool]$DryRun)
  Say ('PS:       ' + $PSVersionTable.PSVersion + ' (' + $PSVersionTable.PSEdition + ')')

  if ($ModUser -notmatch '^[A-Za-z0-9_-]{3,32}$') { throw ("ModUser '" + $ModUser + "' fails [A-Za-z0-9_-]{3,32}") }

  if (-not $DryRun) {
    $npx = (Get-Command npx -ErrorAction SilentlyContinue)
    if (-not $npx) { throw 'npx not on PATH (needed for wrangler). Install Node, or run with -DryRun to rehearse.' }
  }

  # --- Step 1: fresh team token -----------------------------------------------
  Say ''
  Say 'Step 1: generate fresh team token (32 bytes base64url)' 'Cyan'
  $bytes = New-Object 'System.Byte[]' 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  Say ('  token: ' + (Mask $token)) 'DarkGreen'

  # --- Step 2: SHA-256 hex (must equal worker sha256Hex(token)) ----------------
  Say 'Step 2: compute SHA-256 hex of token' 'Cyan'
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $hashBytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($token))
  $tokenHash = ([BitConverter]::ToString($hashBytes)).Replace('-','').ToLower()
  Say ('  sha256: ' + $tokenHash.Substring(0,16) + '... (len ' + $tokenHash.Length + ')') 'DarkGray'
  if ($tokenHash.Length -ne 64) { throw 'sha256 hex wrong length' }

  # --- Step 3: build + run the D1 insert --------------------------------------
  Say 'Step 3: insert mod_tokens row (is_lead=1) via wrangler d1 --remote' 'Cyan'
  $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $sql = "INSERT INTO mod_tokens (token, token_hash, mod_username, is_lead, created_at, last_used_at) VALUES (NULL, '" + $tokenHash + "', '" + $ModUser + "', 1, " + $nowMs + ", NULL);"
  Say ('  SQL: ' + $sql) 'DarkGray'

  if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
  $sqlFile = Join-Path $LogDir ('recover-' + $ModUser + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql')
  Set-Content -Path $sqlFile -Value $sql -Encoding ASCII -NoNewline

  if ($DryRun) {
    Say '  [DryRun] skipping remote D1 write + verify.' 'Yellow'
    Say ('  [DryRun] SQL written to: ' + $sqlFile) 'Yellow'
  } else {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'cmd.exe'
    $psi.Arguments = '/c npx wrangler d1 execute ' + $DbName + ' --remote --file="' + $sqlFile + '"'
    $psi.WorkingDirectory = $WorkerDir
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $proc = [System.Diagnostics.Process]::Start($psi)
    # auto-answer the "Ok to proceed on remote? (y/N)" confirmation if it prompts
    try { $proc.StandardInput.WriteLine('y') } catch {}
    try { $proc.StandardInput.Close() } catch {}
    $out = $proc.StandardOutput.ReadToEnd()
    $err = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()
    $exit = $proc.ExitCode
    if ($out) { ($out -split "`r?`n") | Where-Object { $_ } | ForEach-Object { Say ('  wrangler: ' + $_) 'DarkGray' } }
    if ($err) { ($err -split "`r?`n") | Where-Object { $_ } | ForEach-Object { Say ('  wrangler-err: ' + $_) 'DarkGray' } }
    if ($exit -ne 0) { throw ('wrangler d1 execute exited ' + $exit + ' (see wrangler lines above)') }
    Say '  D1 insert OK' 'Green'

    # --- Step 4: verify via /mod/whoami ---------------------------------------
    Say 'Step 4: verify token via GET /mod/whoami' 'Cyan'
    $whoStatus = 0; $whoBody = ''
    try {
      $resp = Invoke-WebRequest -Uri ($WorkerUrl + '/mod/whoami') -Headers @{ 'x-mod-token' = $token; 'Origin' = 'https://greatawakening.win' } -Method GET -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop
      $whoStatus = [int]$resp.StatusCode
      $whoBody = ($resp.Content | Out-String).Trim()
    } catch {
      if ($_.Exception.Response) { try { $whoStatus = [int]$_.Exception.Response.StatusCode } catch {} }
    }
    Say ('  /mod/whoami HTTP ' + $whoStatus) 'DarkGray'
    if ($whoBody) { Say ('  body: ' + $whoBody) 'DarkGray' }
    if ($whoStatus -ne 200) { throw ('verify failed: /mod/whoami returned ' + $whoStatus) }
    $isLead = $false; $whoUser = ''
    try { $j = $whoBody | ConvertFrom-Json; $isLead = [bool]$j.is_lead; $whoUser = [string]$j.username } catch {}
    Say ('  username=' + $whoUser + '  is_lead=' + $isLead) 'Green'
    if (-not $isLead) { throw 'token authenticates but is_lead is FALSE -- the insert did not set lead' }
    if ($whoUser -and $whoUser -ne $ModUser) { Say ('  WARN: whoami username (' + $whoUser + ') != ' + $ModUser) 'Yellow' }
    $ok = $true
  }

  # --- Step 5: hand off the token ---------------------------------------------
  if (-not $DryRun) {
    $tokenFile = Join-Path $LogDir ('RECOVERY-TOKEN-' + $ModUser + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
    Set-Content -Path $tokenFile -Value $token -Encoding ASCII -NoNewline
    Say ''
    Say '=== RECOVERY COMPLETE ===' 'Green'
    Say '  New LEAD team token written to:' 'Green'
    Say ('    ' + $tokenFile) 'Green'
    Say ''
    Say '  TO RESTORE ACCESS IN THE EXTENSION:' 'Yellow'
    Say '    1. Open the ModTools popup.' 'Yellow'
    Say '    2. In NEW MOD SETUP, click BACK, then pick the "I have a token" path' 'Yellow'
    Say '       (the third option -- NOT the invite link or invite code).' 'Yellow'
    Say ('    3. Open the file above, copy the token, paste it (username is not needed' ) 'Yellow'
    Say '       on the token path), then SAVE & VERIFY.' 'Yellow'
    Say '    4. whoami confirms lead; reload your GAW tab to re-enable the HUD.' 'Yellow'
  }
}
catch {
  Say ('FATAL: ' + $_.Exception.Message) 'Red'
  if ($_.InvocationInfo) { Say ('  at: ' + $_.InvocationInfo.PositionMessage) 'DarkGray' }
}
finally {
  # tidy the temp SQL (it held only a hash, but keep the dir clean)
  try { if ($sqlFile -and (Test-Path $sqlFile)) { Remove-Item $sqlFile -Force } } catch {}

  # --- 4-step mandatory ending ------------------------------------------------
  Say ''
  Say '--- Final Report ---' 'Cyan'
  Say ('  success: ' + $ok)
  if ($tokenFile) { Say ('  token file: ' + $tokenFile) }
  if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
  $logFile = Join-Path $LogDir ('recover-lead-access-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
  try { $log -join "`r`n" | Set-Content -Path $logFile -Encoding UTF8 } catch {}
  try {
    $log -join "`r`n" | Set-Clipboard
    Say '[FULL DEBUG LOG COPIED TO CLIPBOARD]' 'DarkGreen'
    if ($tokenFile) { Say ('  (the TOKEN is in the .txt file above -- clipboard holds the debug log, not the token)') 'DarkGray' }
  } catch { Say '(clipboard copy failed)' 'DarkYellow' }
  try {
    [Console]::Beep(659,160); Start-Sleep -Milliseconds 100
    [Console]::Beep(523,160); Start-Sleep -Milliseconds 100
    [Console]::Beep(784,800)
  } catch {}
  if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }
}

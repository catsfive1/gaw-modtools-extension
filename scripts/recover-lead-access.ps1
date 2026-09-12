<#
.SYNOPSIS
  GAW LEAD RESCUE v2 -- one-shot lead lockout recovery.
.DESCRIPTION
  End-to-end, single run, no menus:

    1. Deletes the user's stale LEAD rows (v1 left orphaned lead credentials
       piling up in D1 + logs -- one rescue = one live token, nothing older).
    2. Mints a fresh 32-byte lead token and writes it to the worker's
       mod_tokens (D1, remote) with is_lead=1 AND tier='lead'.
       v1 bug this fixes: the INSERT omitted tier, which defaults to 'mod',
       so /mod/whoami answered is_lead:true + tier:'mod' -- and the extension
       gates ALL lead UI on tier. Every v1-minted token could authenticate
       but never re-enable lead tools. That was the "rescue works but I am
       STILL locked out" loop.
    3. HARD-verifies via GET /mod/whoami: must return is_lead:true AND
       tier:'lead'. Anything else is a FATAL -- do not paste a token that
       has not passed this gate.
    4. On success: token goes on the clipboard (NEVER printed to console or
       log), greatawakening.win opens in the default browser, one beep.

  Remaining operator step (3 clicks, no typing, extension v10.50.1+):
    1. Click the ModTools icon in Chrome (puzzle piece, top right).
    2. Press Ctrl+V.
    3. Click Go.
  On v10.50.1+ the popup's recovery screen auto-opens the token paste path,
  and a pasted token that authenticates as lead is auto-routed into the LEAD
  slot as well -- no username, no invite, no lead-section hunting.

  Failure path: full debug log copied to clipboard (paste it back to the
  CTO agent); success path leaves the TOKEN on the clipboard. Full log is
  always written to D:\AI\_PROJECTS\logs\ regardless.
.PARAMETER ModUser
  GAW username to restore as lead. Default: catsfive.
.PARAMETER NoPause
  Skip the final Read-Host pause (for scripted runs).
.PARAMETER DryRun
  Build the SQL but do NOT touch the remote DB (safe rehearsal).
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
try {
  Say '=== GAW LEAD RESCUE v2 (one-shot) ===' 'Cyan'
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

  # --- Step 1: fresh lead token -----------------------------------------------
  Say ''
  Say 'Step 1/4: generate fresh lead token (32 bytes base64url)' 'Cyan'
  $bytes = New-Object 'System.Byte[]' 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  Say ('  token: ' + (Mask $token)) 'DarkGreen'

  # --- Step 2: SHA-256 hex (must equal worker sha256Hex(token)) ----------------
  Say 'Step 2/4: compute SHA-256 hex of token' 'Cyan'
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $hashBytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($token))
  $tokenHash = ([BitConverter]::ToString($hashBytes)).Replace('-','').ToLower()
  Say ('  sha256: ' + $tokenHash.Substring(0,16) + '... (len ' + $tokenHash.Length + ')') 'DarkGray'
  if ($tokenHash.Length -ne 64) { throw 'sha256 hex wrong length' }

  # --- Step 3: clean stale lead rows + insert with tier='lead' -----------------
  # tier='lead' is the v2 fix: migration 033 defaults tier to 'mod' and the
  # extension gates every lead surface on tier (not is_lead), so a row minted
  # without tier can authenticate but never re-enables lead UI.
  Say 'Step 3/4: D1 write -- delete stale lead rows, insert fresh (tier=lead)' 'Cyan'
  $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $sql = "DELETE FROM mod_tokens WHERE mod_username = '" + $ModUser + "' AND is_lead = 1; " +
         "INSERT INTO mod_tokens (token, token_hash, mod_username, is_lead, tier, created_at, last_used_at) " +
         "VALUES (NULL, '" + $tokenHash + "', '" + $ModUser + "', 1, 'lead', " + $nowMs + ", " + $nowMs + ");"
  Say ('  SQL: ' + $sql) 'DarkGray'

  if ($DryRun) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    $dryFile = Join-Path $LogDir ('recover-' + $ModUser + '-dryrun-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql')
    Set-Content -Path $dryFile -Value $sql -Encoding ASCII -NoNewline
    Say ('  [DryRun] remote D1 write + verify skipped. SQL saved to: ' + $dryFile) 'Yellow'
  } else {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    $sqlFile = Join-Path $LogDir ('recover-' + $ModUser + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql')
    Set-Content -Path $sqlFile -Value $sql -Encoding ASCII -NoNewline

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
    if ($out) { ($out -split "`r?`n") | Where-Object { $_ } | Select-Object -Last 6 | ForEach-Object { Say ('  wrangler: ' + $_) 'DarkGray' } }
    if ($err) { ($err -split "`r?`n") | Where-Object { $_ } | Select-Object -Last 3 | ForEach-Object { Say ('  wrangler-err: ' + $_) 'DarkGray' } }
    try { Remove-Item $sqlFile -Force } catch {}
    if ($exit -ne 0) { throw ('wrangler d1 execute exited ' + $exit + ' (see wrangler lines above)') }
    Say '  D1 write OK (stale lead rows cleared, fresh row tier=lead)' 'Green'

    # --- Step 4: HARD verify via /mod/whoami ----------------------------------
    Say 'Step 4/4: verify token via GET /mod/whoami (is_lead AND tier gate)' 'Cyan'
    $whoStatus = 0; $whoBody = ''
    try {
      $resp = Invoke-WebRequest -Uri ($WorkerUrl + '/mod/whoami') -Headers @{ 'x-mod-token' = $token; 'Origin' = 'https://greatawakening.win' } -Method GET -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop
      $whoStatus = [int]$resp.StatusCode
      $whoBody = ($resp.Content | Out-String).Trim()
    } catch {
      if ($_.Exception.Response) { try { $whoStatus = [int]$_.Exception.Response.StatusCode } catch {} }
    }
    Say ('  /mod/whoami HTTP ' + $whoStatus + '  body: ' + $whoBody) 'DarkGray'
    if ($whoStatus -ne 200) { throw ('verify failed: /mod/whoami returned ' + $whoStatus + ' -- token NOT delivered. Nothing was copied to the clipboard.') }
    $isLead = $false; $whoTier = ''; $whoUser = ''
    try { $j = $whoBody | ConvertFrom-Json; $isLead = [bool]$j.is_lead; $whoTier = [string]$j.tier; $whoUser = [string]$j.username } catch {}
    if (-not $isLead) { throw 'FATAL: token authenticates but is_lead is FALSE -- do NOT paste this token; report to the CTO agent.' }
    if ($whoTier -ne 'lead') { throw ("FATAL: is_lead is true but tier is '" + $whoTier + "' (expected 'lead'). The extension hides all lead UI unless tier=lead. Do NOT paste; report to the CTO agent.") }
    if ($whoUser -and $whoUser -ne $ModUser) { Say ('  WARN: whoami username (' + $whoUser + ') != ' + $ModUser) 'Yellow' }
    Say ('  VERIFIED: username=' + $whoUser + '  is_lead=True  tier=lead') 'Green'
    $ok = $true

    # --- Deliver: clipboard + open site ---------------------------------------
    $tokenFile = Join-Path $LogDir ('RECOVERY-TOKEN-' + $ModUser + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
    Set-Content -Path $tokenFile -Value $token -Encoding ASCII -NoNewline

    Say ''
    Say '=== LEAD ACCESS RESTORED (server side) ===' 'Green'
    Say '  Your new lead token is on the CLIPBOARD (never printed here).' 'Green'
    try {
      $token | Set-Clipboard
      Say '  [clipboard: token]' 'Green'
    } catch { Say '  clipboard copy FAILED -- token is in the file: ' + $tokenFile 'Yellow' }
    try { Start-Process 'https://greatawakening.win' } catch { Say '  (could not auto-open the site -- open it yourself)' 'Yellow' }

    Say ''
    Say '  LAST STEP -- 3 clicks, no typing:' 'Yellow'
    Say '    1. In Chrome, click the puzzle piece (top right) and pick GAW ModTools.' 'Yellow'
    Say '    2. Press Ctrl+V.' 'Yellow'
    Say '    3. Click Go.' 'Yellow'
    Say '  (If the popup shows a red "token was rejected" note, click' 'Yellow'
    Say '   "I have a token -> paste it" first -- then Ctrl+V, Go.)' 'Yellow'
    Say '  The orange banner on the site clears itself once you are back in.' 'Yellow'
  }
}
catch {
  Say ('FATAL: ' + $_.Exception.Message) 'Red'
  if ($_.InvocationInfo) { Say ('  at: ' + $_.InvocationInfo.PositionMessage) 'DarkGray' }
}
finally {
  Say ''
  Say '--- Final Report ---' 'Cyan'
  if ($DryRun) { Say '  success: True (dry run -- no remote write, no token delivered)' }
  else { Say ('  success: ' + $ok) }
  if ($tokenFile) { Say ('  token file: ' + $tokenFile) }
  if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
  $logFile = Join-Path $LogDir ('recover-lead-access-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
  try { $log -join "`r`n" | Set-Content -Path $logFile -Encoding UTF8 } catch {}
  # Success: clipboard keeps the TOKEN (paste straight into the popup).
  # Failure: clipboard carries the debug log (paste back to the CTO agent).
  try {
    if ($ok -and $token) {
      $token | Set-Clipboard
      Say '[CLIPBOARD = NEW LEAD TOKEN -- paste into the ModTools popup with Ctrl+V]' 'Green'
      Say ('  (full debug log saved to: ' + $logFile + ')') 'DarkGray'
    } else {
      $log -join "`r`n" | Set-Clipboard
      Say '[CLIPBOARD = DEBUG LOG -- paste it back to the CTO agent]' 'DarkYellow'
    }
  } catch { Say '(clipboard copy failed -- use the files listed above)' 'DarkYellow' }
  try {
    [Console]::Beep(659,160); Start-Sleep -Milliseconds 100
    [Console]::Beep(523,160); Start-Sleep -Milliseconds 100
    [Console]::Beep(784,800)
  } catch {}
  if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }
}

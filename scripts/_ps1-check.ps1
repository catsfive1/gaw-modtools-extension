param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
if (-not (Test-Path $Path)) { Write-Host "MISSING: $Path" -ForegroundColor Red; exit 2 }
$err = $null
[System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$null, [ref]$err) | Out-Null
if ($err -and $err.Count -gt 0) {
    Write-Host "PARSE ERRORS in $Path :" -ForegroundColor Red
    $err | ForEach-Object {
        Write-Host ("  L{0}: {1}" -f $_.Extent.StartLineNumber, $_.Message) -ForegroundColor Red
    }
    exit 2
}
Write-Host "PARSE OK: $Path" -ForegroundColor Green
exit 0

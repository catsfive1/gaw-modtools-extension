<#
.SYNOPSIS
    Verify v8.1 UX Polish release artifacts.
.DESCRIPTION
    Static + structural checks for the v8.1 UX Polish chunks A/B/C:
      - v8.1 sentinel open + close present exactly once in modtools.js
      - features.uxPolish default false in modtools.js and popup.js
      - renderSkeleton call count >= 8
      - renderEmptyState call count >= 6
      - optimisticAction helper + at least one call site
      - showToast helper present
      - body.gam-ux-polish-on CSS scope present
      - innerHTML safety inside v8.1 region (UX_SVG[icon] or empty only)
      - Contrast block with 6 --gam-* vars and WCAG 4.5:1 audit
      - Touch-target min 44x44 CSS present
      - node --check passes on all 3 extension JS files
    Exits 0 on full pass, 2 on any failure. ASCII-only, UTF-8 BOM.
    Parse-clean on Windows PowerShell 5.1 and PowerShell 7.x.
.PARAMETER NoPause
    Skip the final Read-Host prompt.
.EXAMPLE
    pwsh -NoProfile -File D:\AI\_PROJECTS\verify-v8-1.ps1
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File D:\AI\_PROJECTS\verify-v8-1.ps1 -NoPause
.NOTES
    Version: 1.0.0
    Requires: PowerShell 5.1+
#>

[CmdletBinding()]
param(
    [switch]$NoPause
)

$ErrorActionPreference = 'Continue'
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "Requires PowerShell 5.1+. Found $($PSVersionTable.PSVersion)" -ForegroundColor Red
    exit 1
}
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$log = New-Object System.Collections.Generic.List[string]
function Say {
    param([string]$t, [string]$c = 'Cyan')
    Write-Host $t -ForegroundColor $c
    [void]$log.Add($t)
}

$repo = 'D:\AI\_PROJECTS'
$ext  = Join-Path $repo 'modtools-ext'
$mt   = Join-Path $ext  'modtools.js'
$pp   = Join-Path $ext  'popup.js'
$bg   = Join-Path $ext  'background.js'
$mf   = Join-Path $ext  'manifest.json'

$failed = 0
$passed = 0
function Gate {
    param([string]$name, [bool]$cond, [string]$detail = '')
    if ($cond) {
        Say ("PASS  " + $name) Green
        $script:passed++
    } else {
        $msg = "FAIL  " + $name
        if ($detail) { $msg = $msg + "  [" + $detail + "]" }
        Say $msg Red
        $script:failed++
    }
}

Say "================================================" Cyan
Say "v8.1 UX Polish verification" Cyan
Say "================================================" Cyan

# --- File existence ---------------------------------------------------------
Gate "modtools.js exists"  (Test-Path $mt) $mt
Gate "popup.js exists"     (Test-Path $pp) $pp
Gate "background.js exists" (Test-Path $bg) $bg
Gate "manifest.json exists" (Test-Path $mf) $mf

if ($failed -gt 0) {
    Say "Aborting further gates: missing files." Red
} else {

# Read text once.
$mtText = Get-Content -LiteralPath $mt -Raw -Encoding UTF8
$ppText = Get-Content -LiteralPath $pp -Raw -Encoding UTF8
$bgText = Get-Content -LiteralPath $bg -Raw -Encoding UTF8

# --- Sentinel gates ---------------------------------------------------------
$openSentinel  = [regex]::Matches($mtText, [regex]::Escape('===== v8.1 UX POLISH ====='))
$closeSentinel = [regex]::Matches($mtText, [regex]::Escape('===== END v8.1 ====='))
Gate "v8.1 open sentinel present exactly once"  ($openSentinel.Count -eq 1)  ("count=" + $openSentinel.Count)
Gate "v8.1 close sentinel present exactly once" ($closeSentinel.Count -eq 1) ("count=" + $closeSentinel.Count)

# Extract v8.1 sentinel region (for innerHTML safety scan).
$regionText = ''
if ($openSentinel.Count -eq 1 -and $closeSentinel.Count -eq 1) {
    $start = $openSentinel[0].Index
    $end   = $closeSentinel[0].Index
    if ($end -gt $start) {
        $regionText = $mtText.Substring($start, $end - $start)
    }
}

# --- Feature flag default-false gates ---------------------------------------
$mtFlagDefault = $mtText -match "'features\.uxPolish':\s*false"
Gate "modtools.js DEFAULT_SETTINGS has features.uxPolish default false" $mtFlagDefault ''

$ppFlagDefault = $ppText -match "'features\.uxPolish':\s*false"
Gate "popup.js documents features.uxPolish default false" $ppFlagDefault ''

# --- Helper definitions + call counts ---------------------------------------
$skelCalls   = [regex]::Matches($mtText, 'renderSkeleton\(').Count
$emptyCalls  = [regex]::Matches($mtText, 'renderEmptyState\(').Count
$optCalls    = [regex]::Matches($mtText, 'optimisticAction\(').Count
$toastCalls  = [regex]::Matches($mtText, 'showToast\(').Count
$uxOnDef     = ($mtText -match 'function __uxOn\(')
$optDef      = ($mtText -match 'function optimisticAction\(')
$toastDef    = ($mtText -match 'function showToast\(')
$skelDef     = ($mtText -match 'function renderSkeleton\(')
$emptyDef    = ($mtText -match 'function renderEmptyState\(')

Gate "function __uxOn defined"        $uxOnDef
Gate "function renderSkeleton defined" $skelDef
Gate "function renderEmptyState defined" $emptyDef
Gate "function optimisticAction defined" $optDef
Gate "function showToast defined"      $toastDef
Gate "renderSkeleton call count >= 8"  ($skelCalls -ge 8)  ("count=" + $skelCalls)
Gate "renderEmptyState call count >= 6" ($emptyCalls -ge 6) ("count=" + $emptyCalls)
Gate "optimisticAction call count >= 2" ($optCalls -ge 2)   ("count=" + $optCalls + ' (1 def + >=1 site)')

# --- CSS scope --------------------------------------------------------------
$scopeHits = [regex]::Matches($mtText, 'body\.gam-ux-polish-on').Count
Gate "body.gam-ux-polish-on CSS scope present (>= 20 hits)" ($scopeHits -ge 20) ("count=" + $scopeHits)

$toggleCall = ($mtText -match "classList\.toggle\('gam-ux-polish-on'")
Gate "body class toggler wires gam-ux-polish-on" $toggleCall

# --- innerHTML safety inside v8.1 region ------------------------------------
# Allowed: UX_SVG[icon], empty string '', or empty string "". Reject anything
# else, including template-literal interpolation (${...}) and string concat.
$badInnerHtml = @()
if ($regionText) {
    $innerMatches = [regex]::Matches($regionText, 'innerHTML\s*=\s*([^;\n]+)')
    foreach ($m in $innerMatches) {
        $rhs = $m.Groups[1].Value.Trim()
        # Accept UX_SVG[...] (static lookup)
        if ($rhs -match '^UX_SVG\[') { continue }
        # Accept empty literal
        if ($rhs -eq "''" -or $rhs -eq '""') { continue }
        $badInnerHtml += $rhs
    }
}
Gate "v8.1 region innerHTML uses only UX_SVG[icon] or '' literal" ($badInnerHtml.Count -eq 0) ($badInnerHtml -join ' | ')

# Explicit banned pattern: template-literal interpolation inside innerHTML.
$badTemplate = [regex]::Matches($regionText, 'innerHTML\s*=\s*[^;\n]*\$\{').Count
Gate "v8.1 region contains zero template-literal interpolation into innerHTML" ($badTemplate -eq 0) ("hits=" + $badTemplate)

# --- Contrast block: 6 canonical --gam-* vars -------------------------------
$contrastVars = @(
    '--gam-muted-text:#b0b5bc',
    '--gam-link:#7cb8ff',
    '--gam-warn-text:#ffe5b0',
    '--gam-ok-text:#c6f6d5',
    '--gam-danger-text:#fed7d7',
    '--gam-bg-card:#181b20'
)
$contrastMissing = @()
foreach ($v in $contrastVars) {
    $needle = $v.Replace('#', '#')
    $found = $mtText.Contains($v)
    if (-not $found) { $contrastMissing += $v }
}
Gate "contrast block contains 6 canonical --gam-* vars" ($contrastMissing.Count -eq 0) ($contrastMissing -join ', ')

# --- WCAG 2.1 contrast audit (inline, dependency-free) ----------------------
function Get-Luminance([int]$r, [int]$g, [int]$b) {
    $vals = @($r, $g, $b)
    $out = @()
    foreach ($raw in $vals) {
        $v = $raw / 255.0
        if ($v -le 0.03928) { $out += ($v / 12.92) }
        else { $out += [Math]::Pow((($v + 0.055) / 1.055), 2.4) }
    }
    return (0.2126 * $out[0]) + (0.7152 * $out[1]) + (0.0722 * $out[2])
}
function Get-ContrastRatio([string]$hexA, [string]$hexB) {
    $a = $hexA.TrimStart('#')
    $b = $hexB.TrimStart('#')
    $r1 = [Convert]::ToInt32($a.Substring(0,2), 16)
    $g1 = [Convert]::ToInt32($a.Substring(2,2), 16)
    $b1 = [Convert]::ToInt32($a.Substring(4,2), 16)
    $r2 = [Convert]::ToInt32($b.Substring(0,2), 16)
    $g2 = [Convert]::ToInt32($b.Substring(2,2), 16)
    $b2 = [Convert]::ToInt32($b.Substring(4,2), 16)
    $l1 = Get-Luminance $r1 $g1 $b1
    $l2 = Get-Luminance $r2 $g2 $b2
    $light = [Math]::Max($l1, $l2)
    $dark  = [Math]::Min($l1, $l2)
    return ($light + 0.05) / ($dark + 0.05)
}

$pairs = @(
    @{ Name = 'muted-text on bg-card';  Fg = '#b0b5bc'; Bg = '#181b20' },
    @{ Name = 'link on bg-card';        Fg = '#7cb8ff'; Bg = '#181b20' },
    @{ Name = 'warn-text on warn-bg';   Fg = '#ffe5b0'; Bg = '#744210' },
    @{ Name = 'ok-text on ok-bg';       Fg = '#c6f6d5'; Bg = '#276749' },
    @{ Name = 'danger-text on danger-bg'; Fg = '#fed7d7'; Bg = '#9b2c2c' }
)
foreach ($p in $pairs) {
    $ratio = Get-ContrastRatio $p.Fg $p.Bg
    $ratioFmt = '{0:N2}' -f $ratio
    Gate ("contrast " + $p.Name + " >= 4.5:1") ($ratio -ge 4.5) ("actual=" + $ratioFmt + ':1')
}

# --- Touch-target (44x44) ---------------------------------------------------
$touchHits = [regex]::Matches($mtText, 'min-height:44px').Count
Gate "touch-target min-height:44px present (>= 3 hits)" ($touchHits -ge 3) ("count=" + $touchHits)
$touchBarIcon = ($mtText -match 'body\.gam-ux-polish-on \.gam-bar-icon')
Gate "touch-target rule: body.gam-ux-polish-on .gam-bar-icon" $touchBarIcon

# --- Skeleton + empty-state CSS scaffolding ---------------------------------
$shimmerKeyframes = ($mtText -match '@keyframes\s+gam-skeleton-shimmer')
Gate "skeleton shimmer @keyframes present" $shimmerKeyframes
$reducedMotion = ($mtText -match '@media \(prefers-reduced-motion: no-preference\)')
Gate "skeleton gated by prefers-reduced-motion: no-preference" $reducedMotion

# --- aria-live regions ------------------------------------------------------
$ariaPolite    = ([regex]::Matches($mtText, 'aria-live="polite"').Count) -ge 1
$ariaAssertive = ([regex]::Matches($mtText, 'aria-live="assertive"').Count) -ge 1
Gate "aria-live polite region present"    $ariaPolite
Gate "aria-live assertive region present" $ariaAssertive

# --- Manifest version -------------------------------------------------------
try {
    $manifest = Get-Content -LiteralPath $mf -Raw -Encoding UTF8 | ConvertFrom-Json
    $ver = [string]$manifest.version
    Gate "manifest.json version == 8.1.0" ($ver -eq '8.1.0') ("actual=" + $ver)
} catch {
    Gate "manifest.json parseable as JSON" $false $_.Exception.Message
}

# --- node --check on all 3 JS files -----------------------------------------
function Invoke-NodeCheck([string]$path) {
    $null = & node --check $path 2>&1
    return $LASTEXITCODE -eq 0
}
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    Gate "node --check modtools.js"   (Invoke-NodeCheck $mt)
    Gate "node --check popup.js"      (Invoke-NodeCheck $pp)
    Gate "node --check background.js" (Invoke-NodeCheck $bg)
} else {
    Say "SKIP  node --check (node not found on PATH)" Yellow
}

} # end if files exist

Say "================================================" Cyan
$total = $passed + $failed
if ($failed -eq 0) {
    Say ("v8.1 VERIFY: ALL PASS (" + $passed + "/" + $total + ")") Green
} else {
    Say ("v8.1 VERIFY: " + $failed + " FAIL (" + $passed + "/" + $total + " pass)") Red
}
Say "================================================" Cyan

# --- Mandatory 4-step ending: log -> clipboard -> E-C-G beep -> Read-Host ---
try {
    $logDir = Join-Path $repo 'logs'
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $logPath = Join-Path $logDir ("verify-v8-1-" + $stamp + ".log")
    ($log -join "`r`n") | Set-Content -LiteralPath $logPath -Encoding UTF8
    Say ("[log persisted to " + $logPath + "]") DarkGray
} catch {
    Say ("[log persist FAILED: " + $_.Exception.Message + "]") Yellow
}

try {
    ($log -join "`r`n") | Set-Clipboard
    Say "[log copied to clipboard]" DarkGray
} catch {
    Say ("[clipboard copy FAILED: " + $_.Exception.Message + "]") Yellow
}

try {
    [Console]::Beep(659, 160)
    Start-Sleep -Milliseconds 100
    [Console]::Beep(523, 160)
    Start-Sleep -Milliseconds 100
    [Console]::Beep(784, 800)
} catch {}

if (-not $NoPause) {

# --- Retrofit ending block (ps1-retrofit-endingblock.ps1 v1) ---
# Conditionally executed: only if $logVar appears to be a log buffer.
try {
    if (($log -is [System.Collections.IList]) -or ($log -is [string])) {
        $__rlogText = if ($log -is [string]) { $log } else { $log -join "`r`n" }
        $__rlogFile = Join-Path 'D:\AI\_PROJECTS\logs' ('verify-v8-1-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
        if (-not (Test-Path 'D:\AI\_PROJECTS\logs')) { New-Item -ItemType Directory -Path 'D:\AI\_PROJECTS\logs' -Force | Out-Null }
        $__rlogText | Out-File -FilePath $__rlogFile -Encoding UTF8
        $__rlogText | Set-Clipboard
        Write-Host "[log persisted: $__rlogFile]" -ForegroundColor DarkGray
        Write-Host '[FULL DEBUG LOG COPIED TO CLIPBOARD]' -ForegroundColor Green
    }
    [Console]::Beep(659, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(523, 160); Start-Sleep -Milliseconds 100
    [Console]::Beep(784, 800)
} catch {}
# --- end retrofit ending block ---
    try { Read-Host 'Press Enter to exit' | Out-Null } catch {}
}

if ($failed -eq 0) { exit 0 } else { exit 2 }

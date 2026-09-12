@echo off
REM Double-clickable wrapper for recover-lead-access.ps1 (lead lockout recovery).
REM v2 fix: the old `where pwsh && (pwsh ...) || (powershell ...)` one-liner
REM re-ran the script under powershell.exe whenever the pwsh run exited
REM non-zero -- double minting a lead token on every failure. Explicit
REM if/else runs it exactly once.
where pwsh >nul 2>nul
if %errorlevel%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0recover-lead-access.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0recover-lead-access.ps1"
)
exit /b %errorlevel%

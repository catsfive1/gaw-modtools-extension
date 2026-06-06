@echo off
REM Double-clickable wrapper for recover-lead-access.ps1 (lead lockout recovery).
where pwsh >nul 2>nul && (pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0recover-lead-access.ps1") || (powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0recover-lead-access.ps1")

@echo off
REM GAW ModTools Installer Launcher
REM Double-click this file to run the installer.
REM Pass any arguments through to the PowerShell script.
REM Example: install-gaw-modtools.bat -ZipUrl "https://..."

powershell -ExecutionPolicy Bypass -File "%~dp0install-gaw-modtools.ps1" %*

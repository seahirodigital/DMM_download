@echo off
setlocal
cd /d "%~dp0"

set "URL=http://127.0.0.1:4312/"

echo DMM Ranking Studio
echo Project: %CD%
echo URL: %URL%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Please install Node.js, then run this file again.
  echo.
  pause
  exit /b 1
)

echo Stopping existing dashboard server for this project...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root = (Resolve-Path '.').Path; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'node(\\.exe)?' -and $_.CommandLine -match 'server\\.js' -and $_.CommandLine -like ('*' + $root + '*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('Stopped process ' + $_.ProcessId) }" 2>nul
echo.

echo Opening browser...
start "" "%URL%"

echo Starting server...
echo Keep this window open while using the dashboard.
echo Press Ctrl+C to stop the server.
echo.

node server.js

echo.
echo Server stopped or failed.
echo If this was unexpected, check the message above.
pause
endlocal

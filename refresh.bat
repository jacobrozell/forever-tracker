@echo off
cd /d "%~dp0"
node tools\refresh.mjs
if errorlevel 1 (
  echo.
  echo Refresh failed. Log out of WoW first so the save files are written, then try again.
  pause
  exit /b 1
)
echo.
echo Done. Open index.html and click "Reset to scan values" if old numbers are still showing.
pause

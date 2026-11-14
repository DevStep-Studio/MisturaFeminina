@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Instale Node.js 22.12+ e abra novamente o terminal.
  pause
  exit /b 1
)
node scripts\dev.mjs %*
set "DEVSTEP_EXIT=%ERRORLEVEL%"
if not "%DEVSTEP_EXIT%"=="0" pause
exit /b %DEVSTEP_EXIT%

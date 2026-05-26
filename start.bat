@echo off
title RFI Generator — Dev Server
cd /d "%~dp0"
echo.
echo  ================================================
echo   RFI Generator — Starting Dev Server
echo  ================================================
echo.
:: ── Only install if node_modules is missing ───────────────────────────────────
if not exist "node_modules\" (
    echo  [1/1] Installing dependencies...
    call npm install --silent
    if errorlevel 1 ( echo  ERROR: npm install failed. & pause & exit /b 1 )
) else (
    echo  [1/1] Dependencies already installed.
)
:: ── Launch ───────────────────────────────────────────────────────────────────
echo.
echo  Launching Netlify dev server at http://localhost:8888
echo  Press Ctrl+C to stop.
echo.
call netlify dev
pause

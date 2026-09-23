@echo off
title RFI Generator — Push to GitHub
cd /d "%~dp0"
echo.
echo  ================================================
echo   RFI Generator — Push to GitHub
echo  ================================================
echo.
:: ── Prompt for commit message (press Enter to use default) ──────────────────
:: wmic was removed in Windows 11 24H2, which left DT empty and produced commit
:: messages like "Update ~0,4DT:~4,2DT:...". PowerShell, with %date% as a fallback.
for /f "delims=" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set "STAMP=%%i"
if not defined STAMP set "STAMP=%date% %time:~0,5%"
set "DEFAULT_MSG=Update %STAMP%"
echo  Press Enter to use default: "%DEFAULT_MSG%"
set /p COMMIT_MSG=Enter commit message (or press Enter):
if "%COMMIT_MSG%"=="" set COMMIT_MSG=%DEFAULT_MSG%
:: ── Stage all changes ─────────────────────────────────────────────────────────
echo.
echo  Staging all changes...
git add -A
if errorlevel 1 (
    echo  ERROR: git add failed.
    pause
    exit /b 1
)
:: ── Commit ────────────────────────────────────────────────────────────────────
echo  Committing: "%COMMIT_MSG%"
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo  Nothing to commit, or commit failed.
    pause
    exit /b 1
)
:: ── Target branch ─────────────────────────────────────────────────────────────
set BRANCH=main
echo  Target branch: %BRANCH%
:: ── Switch to target branch if not already on it ─────────────────────────────
for /f "tokens=*" %%i in ('git rev-parse --abbrev-ref HEAD') do set CURRENT_BRANCH=%%i
if /i not "%CURRENT_BRANCH%"=="%BRANCH%" (
    echo  Switching from %CURRENT_BRANCH% to %BRANCH%...
    git checkout %BRANCH%
    if errorlevel 1 (
        echo  ERROR: Could not switch to %BRANCH%.
        pause
        exit /b 1
    )
    echo  Merging %CURRENT_BRANCH% into %BRANCH%...
    git merge %CURRENT_BRANCH% --no-ff -m "Merge %CURRENT_BRANCH% into %BRANCH%"
    if errorlevel 1 (
        echo  ERROR: Merge failed. Resolve conflicts and try again.
        pause
        exit /b 1
    )
)
:: ── Push to GitHub ────────────────────────────────────────────────────────────
echo  Pushing to GitHub...
git push origin %BRANCH%
if errorlevel 1 (
    echo  ERROR: Push failed. Check your connection or credentials.
    pause
    exit /b 1
)
echo.
echo  ================================================
echo   Done! Changes pushed to origin/%BRANCH%
echo  ================================================
echo.
pause

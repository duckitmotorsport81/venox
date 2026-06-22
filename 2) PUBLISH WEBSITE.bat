@echo off
cd /d "%~dp0"
title VENOX - Publish Website
echo ============================================================
echo   Publishing your latest changes to venoxperformance.my ...
echo ============================================================
echo.
call npm run publish-site
echo.
echo You can close this window now.
pause

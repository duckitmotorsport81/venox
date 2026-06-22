@echo off
cd /d "%~dp0"
title VENOX - Edit Website
echo ============================================================
echo   VENOX website editor
echo ------------------------------------------------------------
echo   A browser tab will open at the admin login in a moment.
echo   Password: your admin password.
echo.
echo   Edit content / upload photos, then click "Save changes".
echo   When finished, close this window, then run
echo   "2) PUBLISH WEBSITE" to put it live.
echo ============================================================
echo.
start "" /b cmd /c "timeout /t 4 >nul & start http://localhost:3000/admin"
call npm start
pause

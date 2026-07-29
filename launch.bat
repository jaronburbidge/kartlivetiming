@echo off
TITLE KartSport Orbits Bridge Launcher
COLOR 0A
echo ========================================================
echo        KartSport Live - Orbits Bridge Client
echo ========================================================
echo.

cd /d "%~dp0"

IF NOT EXIST config.json (
    echo [ERROR] config.json not found in this directory!
    pause
    exit /b
)

echo Starting bridge monitoring script...
node bridge.js
pause
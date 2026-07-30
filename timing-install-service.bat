@echo off
:: Ensure script is running as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ========================================================
    echo ERROR: Administrative Privileges Required
    echo ========================================================
    echo Please right-click 'install-service.bat' and select
    echo 'Run as administrator'.
    echo ========================================================
    pause
    exit /b 1
)

title KartSport Timing Bridge Installer
color 0A

echo ========================================================
echo        KartLive Race Event Results Bridge - Service Setup
echo ========================================================
echo.

:: Set working directory to script location
cd /d "%~dp0"

:: ---------------------------------------------------------
:: STEP 1: SELECT CLUB
:: ---------------------------------------------------------
echo Select your Kart Club:
echo [1]  KartSport Whangarei (whangarei)
echo [2]  KartSport Auckland Mt Wellington (auckland)
echo [3]  KartSport Hamilton (hamilton)
echo [4]  KartSport Tokoroa (tokoroa)
echo [5]  KartSport Rotorua (rotorua)
echo [6]  KartSport Bay of Plenty (bop)
echo [7]  KartSport Eastern Bay of Plenty (ebop)
echo [8]  KartSport Hawkes Bay (hb)
echo [9]  KartSport Taranaki (taranaki)
echo [10] KartSport Manawatu (manawatu)
echo [11] KartSport Wellington (wellington)
echo [12] KartSport Nelson (nelson)
echo [13] KartSport Marlborough (marlborough)
echo [14] KartSport Westland (westland)
echo [15] KartSport Canterbury (canterbury)
echo [16] KartSport Southland (southland)
echo [17] Enter Custom Club ID
echo.
set /p CLUB_CHOICE="Enter choice [1-17]: "

if "%CLUB_CHOICE%"=="1" set SELECTED_CLUB=whangarei
if "%CLUB_CHOICE%"=="2" set SELECTED_CLUB=auckland
if "%CLUB_CHOICE%"=="3" set SELECTED_CLUB=hamilton
if "%CLUB_CHOICE%"=="4" set SELECTED_CLUB=tokoroa
if "%CLUB_CHOICE%"=="5" set SELECTED_CLUB=rotorua
if "%CLUB_CHOICE%"=="6" set SELECTED_CLUB=bop
if "%CLUB_CHOICE%"=="7" set SELECTED_CLUB=ebop
if "%CLUB_CHOICE%"=="8" set SELECTED_CLUB=hb
if "%CLUB_CHOICE%"=="9" set SELECTED_CLUB=taranaki
if "%CLUB_CHOICE%"=="10" set SELECTED_CLUB=manawatu
if "%CLUB_CHOICE%"=="11" set SELECTED_CLUB=wellington
if "%CLUB_CHOICE%"=="12" set SELECTED_CLUB=nelson
if "%CLUB_CHOICE%"=="13" set SELECTED_CLUB=marlborough
if "%CLUB_CHOICE%"=="14" set SELECTED_CLUB=westland
if "%CLUB_CHOICE%"=="15" set SELECTED_CLUB=canterbury
if "%CLUB_CHOICE%"=="16" set SELECTED_CLUB=southland
if "%CLUB_CHOICE%"=="17" (
    echo.
    set /p SELECTED_CLUB="Type custom club slug (lowercase, e.g. customclub): "
)

if "%SELECTED_CLUB%"=="" set SELECTED_CLUB=tokoroa

echo.
echo ➔ Selected Club ID: %SELECTED_CLUB%
echo.

:: Inject selected Club ID into bridge/orbits-stream.js
powershell -Command "(gc bridge/orbits-stream.js) -replace \"const CLUB_ID = process.env.CLUB_ID \|\| '.*?'\", \"const CLUB_ID = process.env.CLUB_ID || '%SELECTED_CLUB%'\" | Set-Content bridge/orbits-stream.js"

:: ---------------------------------------------------------
:: STEP 2: CHECK OR INSTALL NODE.JS
:: ---------------------------------------------------------
echo [1/5] Checking Node.js environment...
where node >nul 2>&1
if %errorLevel% equ 0 (
    echo ✅ Node.js is installed.
) else (
    echo ⚠️ Node.js not detected. Downloading Node.js LTS installer...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi' -OutFile 'node-installer.msi'"
    
    if not exist "node-installer.msi" (
        echo ❌ ERROR: Failed to download Node.js. Check internet connection.
        pause
        exit /b 1
    )

    echo 📦 Installing Node.js silently...
    msiexec /i node-installer.msi /quiet /norestart
    del node-installer.msi
    set "PATH=%ProgramFiles%\nodejs\;%APPDATA%\npm;%PATH%"
    echo ✅ Node.js installed!
)

echo.

:: ---------------------------------------------------------
:: STEP 3: DEPENDENCIES & PM2
:: ---------------------------------------------------------
echo [2/5] Installing project dependencies...
if exist "package.json" call npm install --no-audit --no-fund

echo.
echo [3/5] Installing PM2 background service manager...
call npm install -g pm2 pm2-windows-startup --no-audit --no-fund

echo.
echo [4/5] Registering Auto-Start Service...
call pm2-startup install >nul 2>&1

echo.
echo [5/5] Launching Orbits Stream Bridge for %SELECTED_CLUB%...
call pm2 start bridge/orbits-stream.js --name "kartsport-bridge"
call pm2 save

echo.
echo ========================================================
echo ✅ SUCCESS! Timing bridge configured for '%SELECTED_CLUB%'.
echo Service is running silently and will auto-start on boot.
echo ========================================================
echo.
pause

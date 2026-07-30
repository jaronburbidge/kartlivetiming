@echo off
:: Ensure script is running as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ========================================================
    echo ERROR: Administrative Privileges Required
    echo ========================================================
    echo Please right-click this file 'install-service.bat' and
    echo select 'Run as administrator'.
    echo ========================================================
    pause
    exit /b 1
)

title KartSport Timing Bridge Installer
color 0A

echo ========================================================
echo        KartSport Live Timing Bridge - Service Setup
echo ========================================================
echo.

:: Set working directory to script location
cd /d "%~dp0"

:: ---------------------------------------------------------
:: STEP 1: CHECK OR INSTALL NODE.JS
:: ---------------------------------------------------------
echo [1/5] Checking for Node.js environment...
where node >nul 2>&1
if %errorLevel% equ 0 (
    echo ✅ Node.js is already installed.
) else (
    echo ⚠️ Node.js not detected. Downloading Node.js LTS installer...
    
    :: Download Node.js MSI Installer (v20 LTS x64)
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi' -OutFile 'node-installer.msi'"
    
    if not exist "node-installer.msi" (
        echo.
        echo ❌ ERROR: Failed to download Node.js installer. Please ensure the PC has internet access.
        pause
        exit /b 1
    )

    echo 📦 Installing Node.js silently in the background (this may take a minute)...
    msiexec /i node-installer.msi /quiet /norestart
    del node-installer.msi

    :: Update PATH environment variables in current session
    set "PATH=%ProgramFiles%\nodejs\;%APPDATA%\npm;%PATH%"
    
    echo ✅ Node.js successfully installed!
)

echo.

:: ---------------------------------------------------------
:: STEP 2: INSTALL DEPENDENCIES
:: ---------------------------------------------------------
echo [2/5] Installing project dependencies...
if exist "package.json" (
    call npm install --no-audit --no-fund
)

echo.

:: ---------------------------------------------------------
:: STEP 3: INSTALL PM2
:: ---------------------------------------------------------
echo [3/5] Installing PM2 background service manager globally...
call npm install -g pm2 pm2-windows-startup --no-audit --no-fund
if %errorLevel% neq 0 (
    echo.
    echo ❌ ERROR: Failed to install PM2 tools via npm.
    pause
    exit /b 1
)

echo.

:: ---------------------------------------------------------
:: STEP 4: CONFIGURE WINDOWS STARTUP SERVICE
:: ---------------------------------------------------------
echo [4/5] Registering Windows Auto-Start Service...
call pm2-startup install >nul 2>&1

echo.

:: ---------------------------------------------------------
:: STEP 5: START STREAMING BRIDGE
:: ---------------------------------------------------------
echo [5/5] Registering and launching Orbits Stream Bridge...
call pm2 start bridge/orbits-stream.js --name "kartsport-bridge"
if %errorLevel% neq 0 (
    echo.
    echo ❌ ERROR: Could not start 'bridge/orbits-stream.js'. Ensure the file is present in this folder.
    pause
    exit /b 1
)

call pm2 save

echo.
echo ========================================================
echo ✅ SUCCESS! KartSport Timing Bridge is completely set up!
echo ========================================================
echo.
echo The timing bridge is now running silently in the background.
echo It will launch automatically every time this PC boots up.
echo.
echo You can close this window now.
echo ========================================================
echo.
pause

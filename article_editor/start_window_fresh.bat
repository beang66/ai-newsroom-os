@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Builds the web UI first, then opens the desktop window. Use it after editing web\src.
rem If only the core (Python) changed, start_window.bat is enough - no build needed.
rem Comments stay ASCII on purpose: cmd.exe can misread UTF-8 text in batch files.
where npm >nul 2>nul
if errorlevel 1 (
    echo npm was not found. Install Node.js, or use start_window.bat to open the last build.
    pause
    exit /b 1
)
if not exist "web\node_modules" (
    echo Installing web dependencies ^(first run only^)...
    call npm --prefix web install
    if errorlevel 1 (
        echo npm install failed.
        pause
        exit /b 1
    )
)
echo Building the web UI...
call npm --prefix web run build
if errorlevel 1 (
    echo Web build failed. The window was not started.
    pause
    exit /b 1
)
call "%~dp0start_window.bat" %*

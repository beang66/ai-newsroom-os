@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
    py -3 launcher.py %*
) else (
    python launcher.py %*
)
if errorlevel 1 (
    echo Could not start the editor. Please check the error above.
    pause
)

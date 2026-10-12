@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
rem Open the desktop shell. Extra arguments are passed to the launcher.
call "%~dp0scripts\ensure_storage_deps.bat"
if errorlevel 1 goto startup_failed
"%AI_NEWSROOM_PYTHON%" app\launcher.py --window %*
if errorlevel 1 goto startup_failed
exit /b 0

:startup_failed
echo Could not start the editor window. Please check the error above.
pause
exit /b 1

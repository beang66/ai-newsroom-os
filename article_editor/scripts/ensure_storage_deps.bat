@echo off
rem Install storage packages into a project-local target directory.
for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
set "AI_NEWSROOM_RUNTIME=%PROJECT_ROOT%\.runtime"

set "AI_NEWSROOM_PYTHON="
where py >nul 2>nul
if errorlevel 1 goto find_python
for /f "usebackq delims=" %%P in (`py -3 -c "import sys; print(sys.executable)"`) do set "AI_NEWSROOM_PYTHON=%%P"

:find_python
if defined AI_NEWSROOM_PYTHON goto python_found
for /f "usebackq delims=" %%P in (`python -c "import sys; print(sys.executable)"`) do set "AI_NEWSROOM_PYTHON=%%P"

:python_found
if not defined AI_NEWSROOM_PYTHON goto python_failed
if not exist "%AI_NEWSROOM_PYTHON%" goto python_failed

if defined PYTHONPATH (
    set "PYTHONPATH=%AI_NEWSROOM_RUNTIME%;%PYTHONPATH%"
) else (
    set "PYTHONPATH=%AI_NEWSROOM_RUNTIME%"
)

"%AI_NEWSROOM_PYTHON%" -c "import keyring; import sqlcipher3" >nul 2>nul
if not errorlevel 1 exit /b 0

echo Installing encrypted-storage dependencies ^(first run only^)...
"%AI_NEWSROOM_PYTHON%" -m pip install --target "%AI_NEWSROOM_RUNTIME%" -r "%PROJECT_ROOT%\requirements-storage.txt"
if errorlevel 1 goto install_failed
"%AI_NEWSROOM_PYTHON%" -c "import keyring; import sqlcipher3" >nul 2>nul
if errorlevel 1 goto install_failed
exit /b 0

:python_failed
echo Could not find Python 3.10 or newer. Install Python and try again.
exit /b 1

:install_failed
echo Could not install keyring and SQLCipher. Check the network connection and try again.
exit /b 1

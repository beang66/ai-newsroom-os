@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem 데스크톱 창(pywebview)으로 실행 — 브라우저를 쓰지 않습니다.
rem 추가 인자는 그대로 전달됩니다(예: start_window.bat --debug).
where py >nul 2>nul
if %errorlevel%==0 (
    py -3 app\launcher.py --window %*
) else (
    python app\launcher.py --window %*
)
if errorlevel 1 (
    echo Could not start the editor window. Please check the error above.
    pause
)

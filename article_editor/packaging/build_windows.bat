@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo === 기사 작업실 배포본 빌드 (article_editor) ===

where py >nul 2>nul
if %errorlevel%==0 (set PY=py -3) else (set PY=python)

echo [1/3] 빌드 도구 확인
%PY% -m pip install --disable-pip-version-check -r packaging\requirements-build.txt
if errorlevel 1 goto fail

echo Preparing bundled Node and platform generator
%PY% packaging\prepare_platform.py
if errorlevel 1 goto fail

echo [2/3] 이전 빌드 정리
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

echo [3/3] exe 빌드 (몇 분 걸립니다)
%PY% -m PyInstaller --noconfirm --clean packaging\AINewsroom.spec
if errorlevel 1 goto fail

echo.
echo 빌드 완료: %CD%\dist\AINewsroom\
echo   창 모드 실행   : dist\AINewsroom\AINewsroom.exe
echo   진단(콘솔)     : dist\AINewsroom\AINewsroom-debug.exe --check
echo   창 검증        : dist\AINewsroom\AINewsroom-debug.exe --smoke write
echo.
pause
exit /b 0

:fail
echo.
echo 빌드에 실패했습니다. 위 메시지를 확인해 주세요.
pause
exit /b 1

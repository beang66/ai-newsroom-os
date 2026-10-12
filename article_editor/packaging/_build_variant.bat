@echo off
rem 내부용: build_ipc.bat / build_http.bat 이 부른다. 인자: ipc 또는 http
chcp 65001 >nul
set VARIANT=%1
cd /d "%~dp0.."
echo === 기사 작업실 배포본 빌드 (%VARIANT%) ===

where py >nul 2>nul
if %errorlevel%==0 (set PY=py -3) else (set PY=python)

echo [1/3] 빌드 도구 확인
%PY% -m pip install --disable-pip-version-check -r packaging\requirements-build.txt
if errorlevel 1 goto fail

echo [2/3] 플랫폼 변환 번들 준비
%PY% packaging\prepare_platform.py
if errorlevel 1 goto fail
%PY% packaging\write_build_info.py

echo [3/3] exe 빌드 (몇 분 걸립니다) - 결과: dist\%VARIANT%\AINewsroom\
if exist build\%VARIANT% rmdir /s /q build\%VARIANT%
if exist dist\%VARIANT% rmdir /s /q dist\%VARIANT%
%PY% -m PyInstaller --noconfirm --clean --distpath dist\%VARIANT% --workpath build\%VARIANT% packaging\AINewsroom.spec
if errorlevel 1 goto fail

rem HTTP 빌드는 EXE 옆에 transport.txt 를 두어 창에서도 HTTP 로 코어를 부르게 한다(IPC 빌드는 파일 없음)
if /i "%VARIANT%"=="http" (>dist\http\AINewsroom\transport.txt echo http)

echo.
echo 빌드 완료 (%VARIANT%): %CD%\dist\%VARIANT%\AINewsroom\
echo   창 모드 실행 : dist\%VARIANT%\AINewsroom\AINewsroom.exe
echo   진단(콘솔)   : dist\%VARIANT%\AINewsroom\AINewsroom-debug.exe --check
echo   창 검증      : dist\%VARIANT%\AINewsroom\AINewsroom-debug.exe --smoke write
echo.
if not defined NOPAUSE pause
exit /b 0

:fail
echo.
echo 빌드에 실패했습니다. 위 메시지를 확인해 주세요.
if not defined NOPAUSE pause
exit /b 1

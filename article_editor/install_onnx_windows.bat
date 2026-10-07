@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ONNX packages: Python 3.10-3.12 recommended. Tested on Python 3.12.
if not exist ".onnx-env\Scripts\python.exe" (
  py -3 -m venv .onnx-env
  if errorlevel 1 goto failure
)
.onnx-env\Scripts\python.exe -m pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 goto failure
.onnx-env\Scripts\python.exe -m pip install -r requirements-onnx.txt
if errorlevel 1 goto failure
.onnx-env\Scripts\python.exe scripts\verify_onnx.py
if errorlevel 1 goto failure
echo OK. Set USE_LOCAL_MODELS=true, FLOW_SUMMARY_PROVIDER=kobart and LOCAL_MODEL_RUNTIME=onnx in .env.
pause
exit /b 0
:failure
echo Setup failed. Keep the messages above and check model folders or Python version.
pause
exit /b 1

@echo off
rem IPC build: the window calls the core through the pywebview bridge (default). Output dist\ipc\AINewsroom
call "%~dp0_build_variant.bat" ipc

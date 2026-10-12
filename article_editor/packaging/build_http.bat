@echo off
rem HTTP build: the window calls the core over local HTTP (for comparison / troubleshooting). Output dist\http\AINewsroom
call "%~dp0_build_variant.bat" http

@echo off
echo Stopping Super Bowl Squares server (port 3000)...
echo.

setlocal enabledelayedexpansion
set FOUND=0

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    set FOUND=1
    echo Killing process ID %%P ...
    taskkill /PID %%P /F >nul 2>&1
)

echo.
if "%FOUND%"=="0" (
    echo No server was running on port 3000.
) else (
    echo Server stopped.
)

pause

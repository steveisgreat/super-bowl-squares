@echo off
cd /d "%~dp0"
echo Starting Super Bowl Squares...
echo.

start "Super Bowl Squares Server" cmd /k node server.js

echo Waiting for server to come up...
timeout /t 2 /nobreak >nul

start "" http://localhost:3000

echo.
echo The app should now be open in your browser.
echo A separate "Super Bowl Squares Server" window is running the server - leave it open while you play.
echo (Use stop-server.bat to shut it down when you're done.)
echo.
pause

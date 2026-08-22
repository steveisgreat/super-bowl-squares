@echo off
cd /d "%~dp0"
title Super-Squares - Server
echo Starting Super-Squares server...
echo.
node server.js
echo.
echo Server stopped.
pause

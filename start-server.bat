@echo off
cd /d "%~dp0"
title Super Bowl Squares - Server
echo Starting Super Bowl Squares server...
echo.
node server.js
echo.
echo Server stopped.
pause

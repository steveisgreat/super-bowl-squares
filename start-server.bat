@echo off
cd /d "%~dp0"
title $uper-$quares - Server
echo Starting $uper-$quares server...
echo.
node server.js
echo.
echo Server stopped.
pause

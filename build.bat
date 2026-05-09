@echo off
cd /d "%~dp0"
npm run build
if %errorlevel% neq 0 pause

@echo off
cd /d "%~dp0"
npm run dev
if %errorlevel% neq 0 pause

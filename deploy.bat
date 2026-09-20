@echo off
node deploy.js
if %errorlevel% neq 0 (
    echo [ERROR] Deployment failed.
    pause
    exit /b %errorlevel%
)

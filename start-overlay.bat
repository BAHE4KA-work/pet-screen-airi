@echo off
title Airi - Screen Overlay Launcher
color 0B
echo =============================================
echo   Airi - Native Screen Overlay Launcher
echo =============================================

echo [*] Launching transparent desktop overlay...
npx --yes electron electron/main.cjs
pause

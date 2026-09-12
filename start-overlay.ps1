# Airi Desktop Overlay Launcher for Windows
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Airi - Native Screen Overlay Launcher     " -ForegroundColor White
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Check if backend is running on port 3000
$portActive = Test-NetConnection -ComputerName "localhost" -Port 3000 -InformationLevel Quiet -WarningAction SilentlyContinue

if (-not $portActive) {
    Write-Host "[*] Backend is not active on port 3000. Launching docker-compose..." -ForegroundColor Yellow
    docker-compose up -d
    Write-Host "[*] Waiting for backend to initialize on http://localhost:3000..." -ForegroundColor Cyan
    $attempts = 0
    while ($attempts -lt 30) {
        Start-Sleep -Seconds 1
        $portActive = Test-NetConnection -ComputerName "localhost" -Port 3000 -InformationLevel Quiet -WarningAction SilentlyContinue
        if ($portActive) { break }
        $attempts++
    }
}

if ($portActive) {
    Write-Host "[+] Local backend online! Launching transparent screen overlay..." -ForegroundColor Green
    Write-Host "[i] Hotkeys:" -ForegroundColor White
    Write-Host "    Alt+Space : Toggle HUD overlay" -ForegroundColor Gray
    Write-Host "    Ctrl+Shift+Q : Exit overlay" -ForegroundColor Gray
    
    # Run Electron directly via npx without requiring manual global install
    npx --yes electron electron/main.cjs
} else {
    Write-Host "[!] Could not connect to http://localhost:3000. Please start docker-compose up first." -ForegroundColor Red
}

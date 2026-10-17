# SafeRoute: starts backend + website in their own windows and opens the browser.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "saferoute-backend"
$frontend = Join-Path $root "saferoute"
$jbr = "C:\Program Files\Android\Android Studio\jbr"

# Pull the latest code from GitHub and install any new website packages.
if (Test-Path (Join-Path $root ".git")) {
    Write-Host "GitHub se latest code le rahe hain..." -ForegroundColor Yellow
    git -C $root pull --ff-only
    if ($LASTEXITCODE -ne 0) { Write-Host "git pull nahi hua, purane code se chala rahe hain." -ForegroundColor Red }
}
$lock = Join-Path $frontend "package-lock.json"
$stamp = Join-Path $frontend "node_modules\.package-lock.json"
if (-not (Test-Path $stamp) -or (Get-Item $lock).LastWriteTime -gt (Get-Item $stamp).LastWriteTime) {
    Write-Host "Website packages install ho rahe hain..." -ForegroundColor Yellow
    Push-Location $frontend
    npm.cmd install --no-audit --no-fund
    Pop-Location
}

Write-Host "1/3 Backend start ho raha hai (naya window)..." -ForegroundColor Yellow
$backendCmd = @"
`$env:JAVA_HOME = '$jbr'
`$env:Path = "`$env:JAVA_HOME\bin;`$env:Path"
`$env:SAFEROUTE_ADMIN_TOKEN = 'Holymolly'
Set-Location '$backend'
.\gradlew.bat --stop
.\gradlew.bat bootRun
"@
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $backendCmd

Write-Host "2/3 Backend ka wait (pehli baar 1-3 min lag sakte hain)..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Seconds 5
    try {
        $status = Invoke-RestMethod "http://localhost:8080/api/v1/status" -TimeoutSec 3
        $ready = $true; break
    } catch { Write-Host "." -NoNewline }
}
Write-Host ""
if (-not $ready) { Write-Host "Backend start nahi hua. Backend window ka error dekho." -ForegroundColor Red; Read-Host "Enter dabao"; exit 1 }
Write-Host "Backend ready." -ForegroundColor Green

# Load 1 year of crime history once (skipped if already running/done).
try {
    $bf = Invoke-RestMethod "http://localhost:8080/api/v1/admin/backfill" -TimeoutSec 5
    Write-Host "Abhi crimes stored: $($status.incidentsInWindow)"
    if ($bf.state -ne "running" -and $status.incidentsInWindow -lt 50) {
        Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/admin/backfill?months=12" -Headers @{ "X-Admin-Token" = "Holymolly" } | Out-Null
        Write-Host "1 saal ka crime data load hona shuru (background mein chalega)." -ForegroundColor Green
    }
} catch { Write-Host "Backfill check skip: $($_.Exception.Message)" }

Write-Host "3/3 Website start ho rahi hai (naya window)..." -ForegroundColor Yellow
$frontCmd = "Set-Location '$frontend'; npm.cmd run dev"
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $frontCmd
Start-Sleep -Seconds 12
Start-Process "http://localhost:3000"
Write-Host "Ho gaya! Browser me http://localhost:3000 khula hai." -ForegroundColor Green
Write-Host "Crime data progress: Invoke-RestMethod http://localhost:8080/api/v1/admin/backfill"
Read-Host "Ye window band karne ke liye Enter dabao"

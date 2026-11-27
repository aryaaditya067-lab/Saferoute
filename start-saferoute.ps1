# SafeRoute: starts backend + website in their own windows and opens the browser.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "saferoute-backend"
$frontend = Join-Path $root "saferoute"
$jbr = "C:\Program Files\Android\Android Studio\jbr"

# Windows strips the double quotes from a plain -Command argument, which turned the backend
# commands into a parse error so none of them ran. An encoded command arrives unchanged.
function Encode-Command([string]$script) {
    [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
}

# Pull the latest code from GitHub and install any new website packages.
if (Test-Path (Join-Path $root ".git")) {
    Write-Host "Getting the latest code from GitHub..." -ForegroundColor Yellow
    git -C $root pull --ff-only
    if ($LASTEXITCODE -ne 0) { Write-Host "Could not pull from GitHub; starting the code already on this PC." -ForegroundColor Red }
}
$lock = Join-Path $frontend "package-lock.json"
$stamp = Join-Path $frontend "node_modules\.package-lock.json"
if (-not (Test-Path $stamp) -or (Get-Item $lock).LastWriteTime -gt (Get-Item $stamp).LastWriteTime) {
    Write-Host "Installing website packages..." -ForegroundColor Yellow
    Push-Location $frontend
    npm.cmd install --no-audit --no-fund
    Pop-Location
}

# Admin token: never stored in the repo. Uses SAFEROUTE_ADMIN_TOKEN if set, otherwise a random
# token made once on this PC and kept in .saferoute-admin-token (git ignores that file).
$tokenFile = Join-Path $root ".saferoute-admin-token"
if ($env:SAFEROUTE_ADMIN_TOKEN) {
    $adminToken = $env:SAFEROUTE_ADMIN_TOKEN
} else {
    if (-not (Test-Path $tokenFile)) {
        $bytes = New-Object byte[] 32
        [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        Set-Content -Path $tokenFile -Value (($bytes | ForEach-Object { $_.ToString("x2") }) -join "") -NoNewline -Encoding ascii
        Write-Host "Created a new admin token: $tokenFile" -ForegroundColor Yellow
    }
    $adminToken = (Get-Content $tokenFile -Raw).Trim()
}

# Database settings (PostgreSQL) live in saferoute-backend\.env, which git ignores. The backend
# window inherits them; without the file the backend uses its built-in H2 file database.
$envFile = Join-Path $backend ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { Set-Item "env:$($matches[1])" $matches[2].Trim() }
    }
    Write-Host "Database: $env:SAFEROUTE_DB_URL" -ForegroundColor Yellow
} else {
    Write-Host "saferoute-backend\.env not found: using the built-in H2 file database." -ForegroundColor Yellow
}

Write-Host "1/3 Starting the backend (new window)..." -ForegroundColor Yellow
$backendCmd = @"
`$env:JAVA_HOME = '$jbr'
`$env:Path = "`$env:JAVA_HOME\bin;`$env:Path"
`$env:SAFEROUTE_ADMIN_TOKEN = '$adminToken'
Set-Location '$backend'
.\gradlew.bat --stop
.\gradlew.bat bootRun
"@
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-EncodedCommand", (Encode-Command $backendCmd)

Write-Host "2/3 Waiting for the backend (the first start can take 1-3 minutes)..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Seconds 5
    try {
        $status = Invoke-RestMethod "http://localhost:8080/api/v1/status" -TimeoutSec 3
        $ready = $true; break
    } catch { Write-Host "." -NoNewline }
}
Write-Host ""
if (-not $ready) { Write-Host "The backend did not start. Check the backend window for the error." -ForegroundColor Red; Read-Host "Press Enter to close"; exit 1 }
Write-Host "Backend ready." -ForegroundColor Green

# Load 3 years of crime history, at most once a day: a load cut short by closing the windows
# resumes next time, and articles already read are skipped quickly.
$backfillDay = Join-Path $root ".saferoute-backfill-day"
$today = Get-Date -Format "yyyy-MM-dd"
try {
    $bf = Invoke-RestMethod "http://localhost:8080/api/v1/admin/backfill" -TimeoutSec 5
    Write-Host "Crime reports stored: $($status.incidentsInWindow)"
    $lastDay = if (Test-Path $backfillDay) { (Get-Content $backfillDay -Raw).Trim() } else { "" }
    if ($bf.state -ne "running" -and $lastDay -ne $today) {
        Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/admin/backfill?months=36" -Headers @{ "X-Admin-Token" = $adminToken } | Out-Null
        Set-Content -Path $backfillDay -Value $today -NoNewline -Encoding ascii
        Write-Host "Started loading 3 years of crime reports (runs in the background)." -ForegroundColor Green
    }
} catch { Write-Host "Skipped the crime data check: $($_.Exception.Message)" }

Write-Host "3/3 Starting the website (new window)..." -ForegroundColor Yellow
$frontCmd = "Set-Location '$frontend'; npm.cmd run dev"
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-EncodedCommand", (Encode-Command $frontCmd)
Start-Sleep -Seconds 12
Start-Process "http://localhost:3000"
Write-Host "Done! SafeRoute is open in your browser at http://localhost:3000." -ForegroundColor Green

# Route factors (main roads, shops, police, hospitals) need the city's OpenStreetMap copy once per PC.
if (-not (Test-Path (Join-Path $backend "data\osm\roads.json"))) {
    Write-Host "Downloading map data (OpenStreetMap), this can take 1-5 minutes..." -ForegroundColor Yellow
    try {
        $osm = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/admin/osm-snapshot" -Headers @{ "X-Admin-Token" = $adminToken } -TimeoutSec 900
        Write-Host "Map data ready: $($osm.roads) roads, $($osm.places) places, $($osm.police) police stations." -ForegroundColor Green
    } catch {
        Write-Host "Could not download map data right now (Overpass is busy). It will try again next time you start SafeRoute." -ForegroundColor Red
    }
}
Write-Host "Crime data progress: Invoke-RestMethod http://localhost:8080/api/v1/admin/backfill"
Read-Host "Press Enter to close this window"

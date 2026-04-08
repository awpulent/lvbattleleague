# LVBL Tournament Sync Tool
# Run this after a tournament finishes on start.gg

Write-Host ""
Write-Host "=============================" -ForegroundColor Yellow
Write-Host "  LVBL Tournament Sync Tool" -ForegroundColor Yellow
Write-Host "=============================" -ForegroundColor Yellow
Write-Host ""

# Check for saved secret
$configPath = "$env:USERPROFILE\.lvbl-sync.txt"
if (Test-Path $configPath) {
    $savedSecret = Get-Content $configPath -Raw
    $savedSecret = $savedSecret.Trim()
    Write-Host "Using saved admin secret." -ForegroundColor DarkGray
    $secret = $savedSecret
} else {
    $secret = Read-Host "Enter admin secret"
    $save = Read-Host "Save secret for next time? (y/n)"
    if ($save -eq "y") {
        $secret | Out-File $configPath -NoNewline
        Write-Host "Secret saved to $configPath" -ForegroundColor DarkGray
    }
}

Write-Host ""

# Get tournament slug
Write-Host "Paste the start.gg tournament URL or just the slug." -ForegroundColor Cyan
Write-Host "Example: https://www.start.gg/tournament/fight-night-169-las-vegas-nv" -ForegroundColor DarkGray
$slugInput = Read-Host "Tournament URL or slug"

# Extract slug from URL if needed
if ($slugInput -match "start\.gg/tournament/([^/\?]+)") {
    $slug = $matches[1]
} else {
    $slug = $slugInput.Trim()
}
Write-Host "Using slug: $slug" -ForegroundColor Green

Write-Host ""

# Season ID
$seasonId = Read-Host "Season number (e.g. 2)"

# Week number
$weekNumber = Read-Host "Week number (e.g. 3)"

# Custom event name
Write-Host ""
Write-Host "Optional: custom event name (leave blank for 'Week $weekNumber')" -ForegroundColor Cyan
$eventName = Read-Host "Event name (or press Enter to skip)"

Write-Host ""
Write-Host "---" -ForegroundColor DarkGray

# Build the request body
$body = @{
    tournamentSlug = $slug
    seasonId = [int]$seasonId
    weekNumber = [int]$weekNumber
}

if ($eventName -ne "") {
    $body.eventName = $eventName
}

$jsonBody = $body | ConvertTo-Json -Compress

# Confirm
Write-Host ""
Write-Host "Ready to sync:" -ForegroundColor Yellow
Write-Host "  Tournament: $slug"
Write-Host "  Season: $seasonId"
Write-Host "  Week: $weekNumber"
if ($eventName -ne "") {
    Write-Host "  Display Name: $eventName"
}
Write-Host ""
$confirm = Read-Host "Proceed? (y/n)"

if ($confirm -ne "y") {
    Write-Host "Cancelled." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit
}

Write-Host ""
Write-Host "Syncing..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest `
        -Uri "https://lvbattleleague.com/admin/sync?secret=$secret" `
        -Method POST `
        -ContentType "application/json" `
        -Body $jsonBody

    $result = $response.Content | ConvertFrom-Json

    if ($result.success) {
        Write-Host ""
        Write-Host "Sync complete!" -ForegroundColor Green
        Write-Host "  Tournament: $($result.result.tournament)"
        Write-Host "  Event: $($result.result.event)"
        Write-Host "  Players: $($result.result.players)"
        Write-Host "  Sets: $($result.result.sets)"
        Write-Host "  Games: $($result.result.games)"
    } else {
        Write-Host "Sync failed: $($result.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close"

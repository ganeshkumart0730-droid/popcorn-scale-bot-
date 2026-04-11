# Popcorn Scale - One-Click Migration Script
# Run this on your new PC to instantly set up All Schedulers and Folders

$CurrentDir = Get-Location
$BatTrailer = Join-Path $CurrentDir "run_trailers.bat"
$BatWeekly = Join-Path $CurrentDir "run_weekly.bat"

# 1. Update the Batch files to point to the NEW location
"@echo off
cd /d `"$CurrentDir`"
node extract_trailers.js
exit" | Out-File -FilePath $BatTrailer -Encoding ascii

"@echo off
cd /d `"$CurrentDir`"
node extract_weekly_releases.js
exit" | Out-File -FilePath $BatWeekly -Encoding ascii

# 2. Delete existing Popcorn tasks if they exist
Write-Host "Cleaning up any old tasks..." -ForegroundColor Cyan
schtasks /delete /tn "PopcornScale*" /f 2>$null

# 3. Create the new 4-times-a-day schedule for Trailers
Write-Host "Creating Daily Trailer Tasks (9AM, 1PM, 5PM, 9PM)..." -ForegroundColor Green
schtasks /create /tn "PopcornScale_Trailers_9AM" /tr "$BatTrailer" /sc daily /st 09:00 /f
schtasks /create /tn "PopcornScale_Trailers_1PM" /tr "$BatTrailer" /sc daily /st 13:00 /f
schtasks /create /tn "PopcornScale_Trailers_5PM" /tr "$BatTrailer" /sc daily /st 17:00 /f
schtasks /create /tn "PopcornScale_Trailers_9PM" /tr "$BatTrailer" /sc daily /st 21:00 /f

# 4. Create the Wednesday Weekly Task
Write-Host "Creating Wednesday Theater & OTT Task (9AM)..." -ForegroundColor Green
schtasks /create /tn "PopcornScale_Weekly_Wed" /tr "$BatWeekly" /sc weekly /d WED /st 09:00 /f

Write-Host "`n✅ MIGRATION SUCCESSFUL!" -ForegroundColor Yellow
Write-Host "The bot is now scheduled and ready on this machine."
Write-Host "Remember to run 'npm install' and 'node whatsapp_setup.js' to finish!"
pause

@echo off
cd /d "%~dp0"
echo [SENTINEL - WEEKLY PICKS] Starting task...
node extract_weekly_picks.js
echo [SENTINEL - WEEKLY PICKS] Task complete.
pause

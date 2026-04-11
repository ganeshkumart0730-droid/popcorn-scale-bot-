# 🍿 Popcorn Scale: Automation Setup Guide

This guide will help you move your movie trailer scraper to the cloud (**GitHub**) so it runs every 30 minutes even when your computer is off.

## 🚀 Step 1: Create a GitHub Repository
1. Log in to [GitHub](https://github.com/).
2. Click **New** (green button) to create a repository.
3. Name it `popcorn-scale-bot`.
4. Set it to **Private** (recommended to keep your files hidden).
5. Click **Create repository**.

## 🔑 Step 2: Add your Telegram Secrets
This is the most important step! We need to give GitHub your bot information safely:
1. In your new GitHub repository, click on **Settings** (top tab).
2. On the left sidebar, click **Secrets and variables** -> **Actions**.
3. Click **New repository secret**.
4. Add the first one:
   - **Name**: `TELEGRAM_BOT_TOKEN`
   - **Secret**: `8365346880:AAEHlLsosZUJMVJzWC6x5-wZXm8wkVFktdw`
5. Click **New repository secret** again and add the second one:
   - **Name**: `TELEGRAM_CHAT_ID`
   - **Secret**: `868461525`

## 📂 Step 3: Upload your files
1. Open your repository on GitHub.
2. Click **Upload files** (under the "Add file" button).
3. Drag and drop these files from your computer:
   - `extract_trailers.js`
   - `extract_weekly_releases.js` (The New Weekly Guide)
   - `package.json`
   - `.github` (the entire folder)
4. Click **Commit changes** at the bottom.

## ✅ Step 4: Verify it's working
1. Click the **Actions** tab at the top of your GitHub page.
2. You will see a workflow named "**Popcorn Scale Automations**".
3. This will now run **two** separate tasks:
   - **Daily Check**: Runs every 30 minutes to find new trailers.
   - **Weekly Guide**: Runs every Monday at 00:00 UTC to preview Theatre & OTT releases for the week.
4. **To test the Weekly Guide right now**: Click "Popcorn Scale Automations" -> "Run workflow" -> "Run workflow".

---

### How the "Silent" Mode works (for trailers):
- The scraper saves a file called `last_sent.json`. 
- If it finds trailers that are already in that file, **it stays silent**.
- It only pings your phone when a brand new trailer is detected!

### How the Weekly Guide works:
- It automatically calculates the dates for the current Monday to Sunday.
- It scans Nokio and categories releases into **🍿 In Theatres** and **📺 OTT Premieres**.
- It sends this as a separate special post once a week.

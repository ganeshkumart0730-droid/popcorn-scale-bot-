const { chromium, devices } = require('playwright-chromium');
const { MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { getCloudClient } = require('./cloud_auth');

// ⚙️ SETTINGS
const WHATSAPP_GROUP_ID = "120363425401883129@g.us";
const SCRAPE_URL        = "https://nokioapp.com/in/new-releases";
const STATE_FILE        = path.join(__dirname, 'last_sent_weekly.json');
const MESSAGE_DELAY     = 3000;

function log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] 🗓️ [WEEKLY-BOT] ${msg}`);
}

const PLATFORM_ICONS = {
    'netflix': '🔴  NETFLIX', 'prime': '🔵  PRIME VIDEO', 'hotstar': '⭐  JIOHOTSTAR',
    'jio': '⭐  JIOHOTSTAR', 'zee5': '🟣  ZEE5', 'sony': '🟠  SONY LIV',
    'apple': '  APPLE TV+', 'theatres': '🎬  IN THEATRES'
};

function getWeekWindow() {
    const now = new Date();
    const day = now.getDay();
    let diff = day - 3; // Wednesday
    if (diff < 0) diff += 7;
    const start = new Date(now);
    start.setDate(now.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return { monday: start, weekKey: start.toISOString().split('T')[0] };
}

function parseNokioDate(dateStr) {
    if (!dateStr || dateStr.toLowerCase().includes('soon')) return null;
    const parts = dateStr.trim().split(' ');
    if (parts.length < 2) return null;
    const day = parseInt(parts[0], 10);
    const months = { 'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11 };
    const monthStr = parts[1].toLowerCase().substring(0, 3);
    if (months[monthStr] === undefined) return null;
    const d = new Date();
    d.setMonth(months[monthStr], day);
    return d;
}

async function scrapeDetails(context, url) {
    const page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(6000);
        return await page.evaluate(() => {
            const r = { language: null, genre: null, imdbRating: null, synopsis: null, platformKey: 'theatres', posterUrl: null };
            const detailsDiv = document.querySelector('div[class*="MovieInfo_movie-details"]');
            if (detailsDiv) {
                const lines = detailsDiv.innerText.split('\n').map(l => l.trim().filter(l => l.length > 0));
                const langs = ['Hindi','Tamil','Telugu','Malayalam','Kannada','English','Japanese','Korean','Bengali','Marathi'];
                const langLine = lines.find(l => l.match(/\d{4}/));
                if (langLine) { for (const lang of langs) { if (langLine.includes(lang)) { r.language = lang; break; } } }
            }
            const img = document.querySelector('img[class*="Poster_image"], img[class*="MovieCard_image"]');
            if (img) r.posterUrl = img.src.split('?')[0] + '?h=1000&q=90';
            const tabContainer = document.querySelector('div[class*="MovieInfoTabItems_container"]');
            if (tabContainer) {
                const parts = tabContainer.innerText.split('\n').filter(l => l.trim().length > 0);
                const synLine = parts.find(l => l.length > 50 && !l.includes('Synopsis') && !l.includes('Cast'));
                if (synLine) r.synopsis = synLine.trim();
            }
            return r;
        });
    } catch { return null; } finally { await page.close(); }
}

(async () => {
    log('🚀 Starting Cloud Weekly Bot (Session: popcorn-main)');
    const { client, mongoose } = await getCloudClient('popcorn-main');

    let isNewSession = false;
    client.on('qr', (qr) => {
        isNewSession = true;
        log('📲 SCAN THIS QR CODE IN YOUR GITHUB LOGS:');
        qrcode.generate(qr, { small: true });
    });

    client.on('remote_session_saved', () => {
        log('💾 Session successfully saved to MongoDB Atlas!');
        if (isNewSession) log('✅ First-time setup complete. You won\'t need to scan again.');
    });

    client.on('ready', async () => {
        log('✅ Connected! Processing weekly guide...');
        try {
            const { monday, weekKey } = getWeekWindow();
            let state = { lastSentWeek: '' };
            if (fs.existsSync(STATE_FILE)) { try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {} }

            if (state.lastSentWeek === weekKey) {
                log(`⏭️ Already sent this week's guide (${weekKey}). Skipping.`);
            } else {
                const browser = await chromium.launch({ headless: true });
                const context = await browser.newContext(devices['iPhone 12']);
                const page    = await context.newPage();

                try {
                    await page.goto(SCRAPE_URL, { waitUntil: 'load', timeout: 60000 });
                    await page.waitForTimeout(6000);
                    const list = await page.evaluate(() => {
                        const containers = Array.from(document.querySelectorAll('a[class*="MovieItem_container"]'));
                        return containers.map(c => {
                            const info = c.querySelector('div > div:last-child');
                            return {
                                title: info?.querySelector('div:nth-child(1)')?.innerText.trim() || c.querySelector('img')?.alt || 'Untitled',
                                url: c.href,
                                dateText: info?.querySelector('div:nth-child(3) div:first-child')?.innerText.trim() || ''
                            };
                        });
                    });

                    const thisWeek = list.filter(item => {
                        const d = parseNokioDate(item.dateText);
                        return (d && d >= monday && d <= new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000)) || item.dateText === '';
                    });

                    if (thisWeek.length > 0) {
                        await client.sendMessage(WHATSAPP_GROUP_ID, `━━━━━━━━━━━━━━━\n🎬  *THIS WEEK'S RELEASES*  \n━━━━━━━━━━━━━━━\n_Latest movies dropping this week!_`);
                        for (let item of thisWeek) {
                            const details = await scrapeDetails(context, item.url);
                            if (!details) continue;
                            let caption = `🔥  *${item.title.toUpperCase()}*\n${PLATFORM_ICONS[details.platformKey] || '🎬  IN THEATRES'}\n🗓  ${item.dateText}\n`;
                            if (details.language) caption += `🌐  ${details.language}\n`;
                            if (details.synopsis) caption += `\n📝  ${details.synopsis.substring(0, 300)}...\n`;
                            caption += `━━━━━━━━━━━━━━━━━━━━━━`;
                            if (details.posterUrl) {
                                try {
                                    const media = await MessageMedia.fromUrl(details.posterUrl, { unsafeMime: true });
                                    await client.sendMessage(WHATSAPP_GROUP_ID, media, { caption });
                                } catch { await client.sendMessage(WHATSAPP_GROUP_ID, caption); }
                            } else { await client.sendMessage(WHATSAPP_GROUP_ID, caption); }
                            await new Promise(r => setTimeout(r, MESSAGE_DELAY));
                        }
                        state.lastSentWeek = weekKey;
                        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
                    }
                } catch (e) { log(`❌ Scrape Error: ${e.message}`); } finally { await browser.close(); }
            }
        } catch (e) { log(`❌ Error: ${e.message}`); }

        log('🏁 Work complete. Waiting for session sync...');
        if (isNewSession) {
            log('⏳ Syncing session to cloud (this takes 30s)...');
            await new Promise(r => setTimeout(r, 45000)); 
        }

        await client.destroy();
        await mongoose.disconnect();
        process.exit(0);
    });

    client.initialize().catch(err => { log(`❌ Fatal: ${err.message}`); process.exit(1); });
})();

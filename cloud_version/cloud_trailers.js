const { chromium, devices } = require('playwright-chromium');
const { MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { getCloudClient } = require('./cloud_auth');

// ⚙️ SETTINGS
const WHATSAPP_GROUP_ID = "120363410812901879@g.us";
const SCRAPE_URL        = "https://nokioapp.com/in/trailers";
const STATE_FILE        = path.join(__dirname, 'last_sent_trailers.json');
const MESSAGE_DELAY     = 3000;

function log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] 🎬 [TRAILER-BOT] ${msg}`);
}

const PLATFORM_ICONS = {
    'netflix': '🔴  NETFLIX', 'prime': '🔵  PRIME VIDEO', 'hotstar': '⭐  JIOHOTSTAR',
    'jio': '⭐  JIOHOTSTAR', 'zee5': '🟣  ZEE5', 'sony': '🟠  SONY LIV',
    'apple': '  APPLE TV+', 'youtube': '▶️  YOUTUBE', 'theatres': '🎬  IN THEATRES'
};

async function scrapeDetails(context, url) {
    const page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(6000);
        return await page.evaluate(() => {
            const r = { language: null, genre: null, imdbRating: null, synopsis: null, platformKey: 'theatres', trailer: null };
            const detailsDiv = document.querySelector('div[class*="MovieInfo_movie-details"]');
            if (detailsDiv) {
                const lines = detailsDiv.innerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const langs = ['Hindi','Tamil','Telugu','Malayalam','Kannada','English','Japanese','Korean','Bengali','Marathi'];
                const langLine = lines.find(l => l.match(/\d{4}/));
                if (langLine) { for (const lang of langs) { if (langLine.includes(lang)) { r.language = lang; break; } } }
                const genreLine = lines.find(l => !l.match(/\d{4}/) && l.length > 2 && l.length < 50);
                if (genreLine) r.genre = genreLine;
            }
            const imdbSpan = document.querySelector('span[class*="ImdbRating_rating"]');
            if (imdbSpan) { const m = imdbSpan.innerText.match(/(\d\.\d)/); if (m) r.imdbRating = m[1]; }
            const tabContainer = document.querySelector('div[class*="MovieInfoTabItems_container"]');
            if (tabContainer) {
                const parts = tabContainer.innerText.split('\n').filter(l => l.trim().length > 0);
                const synLine = parts.find(l => l.length > 50 && !l.includes('Synopsis') && !l.includes('Cast'));
                if (synLine) r.synopsis = synLine.trim();
            }
            const iframe = document.querySelector('iframe[src*="youtube.com"]');
            if (iframe && iframe.src.match(/\/embed\/([^?]+)/)) {
                r.trailer = `https://www.youtube.com/watch?v=${iframe.src.match(/\/embed\/([^?]+)/)[1]}`;
            }
            return r;
        });
    } catch (e) { log(`⚠️ Scrape Error: ${e.message}`); return null; } finally { await page.close(); }
}

async function scrapeTrailers() {
    log(`📡 Scouting New Trailers...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(devices['iPhone 12']);
    const page    = await context.newPage();
    try {
        await page.goto(SCRAPE_URL, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(6000);
        const items = await page.evaluate(() => {
            const containers = Array.from(document.querySelectorAll('a[class*="MovieItem_container"]'));
            return containers.slice(0, 15).map(c => {
                const info = c.querySelector('div > div:last-child');
                return {
                    title: info?.querySelector('div:nth-child(1)')?.innerText.trim() || c.querySelector('img')?.alt || 'Untitled',
                    url: c.href.split('?')[0].split('/trailers')[0].split('/reviews')[0],
                    date: info?.querySelector('div:nth-child(3) div:first-child')?.innerText.trim() || ''
                };
            });
        });
        await browser.close();
        return items;
    } catch (e) { log(`❌ Scrape Crash: ${e.message}`); await browser.close(); return []; }
}

(async () => {
    log('🚀 Starting Cloud Trailer Bot (Session: popcorn-main)');
    const { client, mongoose } = await getCloudClient('popcorn-main');

    let isNewSession = false;

    client.on('qr', (qr) => {
        isNewSession = true;
        log('📲 SCAN THIS QR CODE IN YOUR GITHUB LOGS:');
        qrcode.generate(qr, { small: true });
    });

    client.on('remote_session_saved', () => {
        log('💾 Session successfully saved to MongoDB Atlas!');
        if (isNewSession) {
            log('✅ First-time setup complete. You won\'t need to scan again.');
        }
    });

    client.on('ready', async () => {
        log('✅ Connected! Processing...');
        try {
            let sentUrls = [];
            if (fs.existsSync(STATE_FILE)) { 
                try { 
                    sentUrls = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); 
                    if (!Array.isArray(sentUrls)) sentUrls = []; 
                } catch { sentUrls = []; } 
            }

            const items = await scrapeTrailers();
            const fresh = items.filter(i => !sentUrls.includes(i.url));

            if (fresh.length > 0) {
                log(`🔥 Found ${fresh.length} NEW trailers!`);
                const browser = await chromium.launch({ headless: true });
                const context = await browser.newContext(devices['iPhone 12']);

                for (let item of fresh) {
                    const details = await scrapeDetails(context, item.url);
                    if (!details || !details.trailer) continue;

                    let caption = `🎬  *NEW TRAILER RELEASE*\n🔥  *${item.title.toUpperCase()}*\n${PLATFORM_ICONS[details.platformKey] || '🎬  IN THEATRES'}\n────────────────────\n`;
                    let meta = [];
                    if (details.language) meta.push(`🌐  ${details.language}`);
                    if (details.genre) meta.push(`🎭  ${details.genre}`);
                    if (details.imdbRating) meta.push(`⭐  IMDb: ${details.imdbRating}`);
                    if (meta.length > 0) caption += meta.join(' | ') + '\n';
                    if (details.synopsis) caption += `\n📝  ${details.synopsis.substring(0, 350)}...\n`;
                    caption += `\n🎥  ${details.trailer}\n━━━━━━━━━━━━━━━━━━━━━━`;

                    await client.sendMessage(WHATSAPP_GROUP_ID, caption);
                    await new Promise(r => setTimeout(r, MESSAGE_DELAY));
                }
                await browser.close();
                const updated = [...new Set([...sentUrls, ...fresh.map(i => i.url)])];
                fs.writeFileSync(STATE_FILE, JSON.stringify(updated.slice(-100), null, 2));
            }
        } catch (e) {
            log(`❌ Error during task: ${e.message}`);
        }

        log('🏁 Work complete. Waiting for session sync...');
        // Wait a bit to ensure RemoteAuth syncs if it's a new session
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

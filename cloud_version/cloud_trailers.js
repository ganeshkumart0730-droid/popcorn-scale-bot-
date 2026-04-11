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

    client.on('authenticated', () => {
        log('🛡️  AUTHENTICATED! Session loaded from cloud.');
    });

    client.on('auth_failure', (msg) => {
        log(`❌ AUTHENTICATION FAILURE: ${msg}`);
    });

    client.on('remote_session_saved', () => {
        log('💾 Session successfully saved/synced to MongoDB Atlas! (popcorn_sessions collection)');
    });

    client.on('ready', async () => {
        log('✅ Client is Ready! Starting scrape cycle...');
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
                    const page = await context.newPage();
                    try {
                        log(`🎬 Processing: ${item.title}`);
                        await page.goto(item.url, { waitUntil: 'load', timeout: 60000 });
                        await page.waitForTimeout(6000);

                        const data = await page.evaluate(() => {
                            const result = { platformKey: 'theatres', language: null, genre: null, imdbRating: null, synopsis: null, trailer: null };
                            
                            // 1. Better Platform Detection from Overlay Text
                            const bar = document.querySelector('div[class*="DetailsBar_info"]');
                            if (bar) {
                                const parts = bar.innerText.split('|').map(p => p.trim());
                                if (parts.length > 2) {
                                    const raw = parts[parts.length - 1].toLowerCase();
                                    if (raw.includes('netflix')) result.platformKey = 'netflix';
                                    else if (raw.includes('prime')) result.platformKey = 'prime';
                                    else if (raw.includes('hotstar') || raw.includes('jio')) result.platformKey = 'hotstar';
                                    else if (raw.includes('zee5')) result.platformKey = 'zee5';
                                    else if (raw.includes('sony')) result.platformKey = 'sony';
                                    else if (raw.includes('apple')) result.platformKey = 'apple';
                                }
                            }

                            // 2. Details Scrape
                            const detailsDiv = document.querySelector('div[class*="MovieInfo_movie-details"]');
                            if (detailsDiv) {
                                const lines = detailsDiv.innerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                                const langs = ['Hindi','Tamil','Telugu','Malayalam','Kannada','English','Japanese','Korean'];
                                for (const line of lines) {
                                    if (line.match(/\d{4}/)) {
                                        for (const l of langs) { if (line.includes(l)) { result.language = l; break; } }
                                    } else if (line.length > 2 && line.length < 50 && !result.genre) {
                                        result.genre = line;
                                    }
                                }
                            }

                            const imdbSpan = document.querySelector('span[class*="ImdbRating_rating"]');
                            if (imdbSpan) { const m = imdbSpan.innerText.match(/(\d\.\d)/); if (m) result.imdbRating = m[1]; }

                            const tabContainer = document.querySelector('div[class*="MovieInfoTabItems_container"]');
                            if (tabContainer) {
                                const parts = tabContainer.innerText.split('\n').filter(p => p.trim().length > 50);
                                if (parts.length > 0) result.synopsis = parts[0].trim();
                            }

                            const iframe = document.querySelector('iframe[src*="youtube.com"]');
                            if (iframe && iframe.src.match(/\/embed\/([^?]+)/)) {
                                result.trailer = `https://www.youtube.com/watch?v=${iframe.src.match(/\/embed\/([^?]+)/)[1]}`;
                            }

                            return result;
                        });

                        if (data.trailer) {
                            let caption = `🎬  *NEW TRAILER RELEASE*\n🔥  *${item.title.toUpperCase()}*\n${PLATFORM_ICONS[data.platformKey] || '🎬  IN THEATRES'}\n────────────────────\n`;
                            let meta = [];
                            if (data.language) meta.push(`🌐  ${data.language}`);
                            if (data.genre) meta.push(`🎭  ${data.genre}`);
                            if (data.imdbRating) meta.push(`⭐  IMDb: ${data.imdbRating}`);
                            if (meta.length > 0) caption += meta.join(' | ') + '\n';
                            if (data.synopsis) caption += `\n📝  ${data.synopsis.substring(0, 350)}...\n`;
                            caption += `\n🎥  ${data.trailer}\n━━━━━━━━━━━━━━━━━━━━━━`;

                            await client.sendMessage(WHATSAPP_GROUP_ID, caption);
                            log(`🚀 Message Sent: ${item.title}`);
                            await new Promise(r => setTimeout(r, MESSAGE_DELAY));
                        }
                    } catch (err) {
                        log(`⚠️ Error detailing ${item.title}: ${err.message}`);
                    } finally {
                        await page.close();
                    }
                }
                await browser.close();
                const updated = [...new Set([...sentUrls, ...fresh.map(i => i.url)])];
                fs.writeFileSync(STATE_FILE, JSON.stringify(updated.slice(-100), null, 2));
            }
        } catch (e) {
            log(`❌ Global Scrape Error: ${e.message}`);
        }

        log('🏁 Tasks Finished. Waiting for cloud sync backup...');
        if (isNewSession) {
            log('⏳ New session detected! Waiting 45s for first cloud upload...');
            await new Promise(r => setTimeout(r, 45000)); 
        }

        await client.destroy();
        await mongoose.disconnect();
        log('💤 Bot Shutdown Cleanup Complete.');
        process.exit(0);
    });

    log('🛠️ Initializing Bot...');
    client.initialize().catch(err => { log(`❌ Fatal Startup Error: ${err.message}`); process.exit(1); });
})();

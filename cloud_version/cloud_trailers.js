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

async function runTrailers(client) {
    log('🎬 Starting Trailers Task...');
    try {
        let sentUrls = [];
        if (fs.existsSync(STATE_FILE)) { 
            try { 
                sentUrls = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); 
                if (!Array.isArray(sentUrls)) sentUrls = []; 
            } catch { sentUrls = []; } 
        }

        // 🇮🇳 Regional Emulation to ensure correct India UI
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            ...devices['iPhone 12'],
            locale: 'en-IN',
            timezoneId: 'Asia/Kolkata',
            geolocation: { longitude: 77.2090, latitude: 28.6139 }, // New Delhi
            permissions: ['geolocation']
        });

        const tempPage = await context.newPage();
        log(`📡 Scouting for new trailers...`);
        await tempPage.goto(SCRAPE_URL, { waitUntil: 'load', timeout: 60000 });
        await tempPage.waitForTimeout(6000);

        const items = await tempPage.evaluate(() => {
            const list = document.querySelector('div[id*="trending-trailers"]');
            if (!list) return [];
            return Array.from(list.querySelectorAll('a[href*="/movie/"]')).map(c => ({
                title: c.querySelector('img')?.alt || 'Untitled',
                url: c.href.split('?')[0].split('/trailers')[0].split('/reviews')[0],
            }));
        });
        await tempPage.close();

        const fresh = items.filter(i => !sentUrls.includes(i.url));
        if (fresh.length > 0) {
            log(`🔥 Found ${fresh.length} NEW trailers!`);
            for (let item of fresh) {
                const page = await context.newPage();
                try {
                    log(`🎬 Processing: ${item.title}`);
                    await page.goto(item.url, { waitUntil: 'load', timeout: 60000 });
                    await page.waitForTimeout(6000);

                    const data = await page.evaluate(() => {
                        const result = { platformKey: null, language: null, genre: null, imdbRating: null, synopsis: null, trailer: null };
                        
                        // 1. DYNAMIC Platform Detection from Text (No Hardcoding)
                        const bar = document.querySelector('div[class*="DetailsBar_info"]');
                        if (bar) {
                            const text = bar.innerText.toLowerCase();
                            const parts = text.split('|').map(p => p.trim());
                            const lastPart = parts[parts.length - 1];

                            if (lastPart.includes('theater') || lastPart.includes('cinema')) result.platformKey = 'theatres';
                            else if (lastPart.includes('netflix')) result.platformKey = 'netflix';
                            else if (lastPart.includes('prime')) result.platformKey = 'prime';
                            else if (lastPart.includes('hotstar') || lastPart.includes('jio')) result.platformKey = 'hotstar';
                            else if (lastPart.includes('zee5')) result.platformKey = 'zee5';
                            else if (lastPart.includes('sony')) result.platformKey = 'sony';
                            else if (lastPart.includes('apple')) result.platformKey = 'apple';
                        }

                        // 2. Metadata Extraction
                        const detailsDiv = document.querySelector('div[class*="MovieInfo_movie-details"]');
                        if (detailsDiv) {
                            const lines = detailsDiv.innerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                            const langs = ['Hindi','Tamil','Telugu','Malayalam','Kannada','English','Japanese','Korean','Bengali'];
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
                        let caption = `🎬  *NEW TRAILER RELEASE*\n🔥  *${item.title.toUpperCase()}*\n${PLATFORM_ICONS[data.platformKey] || '🎬  COMMING SOON'}\n────────────────────\n`;
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
            const updated = [...new Set([...sentUrls, ...fresh.map(i => i.url)])];
            fs.writeFileSync(STATE_FILE, JSON.stringify(updated.slice(-100), null, 2));
        } else {
            log('⏭️ No new trailers found.');
        }
        await browser.close();
    } catch (e) {
        log(`❌ Scrape Error: ${e.message}`);
    }
}

module.exports = { runTrailers };

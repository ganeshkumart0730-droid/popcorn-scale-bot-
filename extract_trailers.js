const { chromium, devices } = require('playwright-chromium');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// ⚙️  SETTINGS (Trailer Sentinel V7 — Hardened Build)
// ─────────────────────────────────────────────────────────────
const STATE_FILE        = path.join(__dirname, 'last_sent.json');
const WHATSAPP_GROUP_ID = "120363410812901879@g.us";
const SCRAPE_URL        = "https://nokioapp.com/in/trailers";
const MESSAGE_DELAY     = 3000; 

function log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

const PLATFORM_ICONS = {
    'netflix': '🔴  NETFLIX',
    'prime': '🔵  PRIME VIDEO',
    'hotstar': '⭐  JIOHOTSTAR',
    'jio': '⭐  JIOHOTSTAR',
    'zee5': '🟣  ZEE5',
    'sony': '🟠  SONY LIV',
    'apple': '  APPLE TV+',
    'youtube': '▶️  YOUTUBE',
    'theatres': '🎬  IN THEATRES'
};

// ─────────────────────────────────────────────────────────────
// 🔍  DETAIL PAGE SCRAPER (V7 Selectors)
// ─────────────────────────────────────────────────────────────
async function scrapeDetails(context, url) {
    const page = await context.newPage();
    try {
        log(`      🌐 Loading: ${url}`);
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(6000);

        const data = await page.evaluate(() => {
            const r = {
                language: null,
                genre: null,
                imdbRating: null,
                nokioScore: null,
                synopsis: null,
                platformKey: 'theatres',
                trailer: null
            };

            // ── MovieInfo_movie-details ──
            const detailsDiv = document.querySelector('div[class*="MovieInfo_movie-details"]');
            if (detailsDiv) {
                const lines = detailsDiv.innerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const langs = ['Hindi','Tamil','Telugu','Malayalam','Kannada','English','Japanese','Korean','Bengali','Marathi'];
                const langLine = lines.find(l => l.match(/\d{4}/));
                if (langLine) {
                    for (const lang of langs) {
                        if (langLine.includes(lang)) { r.language = lang; break; }
                    }
                }
                const genreLine = lines.find(l => 
                    !l.match(/\d{4}/) && l !== lines[0] && 
                    !l.includes('POWERED') && !l.includes('Synopsis') && !l.includes('Cast') &&
                    !l.match(/^\d+\.?\d*$/) && l.length > 2 && l.length < 50
                );
                if (genreLine) r.genre = genreLine;
            }

            // ── ImdbRating_rating ──
            const imdbSpan = document.querySelector('span[class*="ImdbRating_rating"]');
            if (imdbSpan) {
                const m = imdbSpan.innerText.match(/(\d\.\d)/);
                if (m) r.imdbRating = m[1];
            }

            // ── Synopsis ──
            const tabContainer = document.querySelector('div[class*="MovieInfoTabItems_container"]');
            if (tabContainer) {
                const parts = tabContainer.innerText.split('\n').filter(l => l.trim().length > 0);
                const synLine = parts.find(l => l.length > 50 && !l.includes('Synopsis') && !l.includes('Cast'));
                if (synLine) r.synopsis = synLine.trim();
            }
            if (!r.synopsis) {
                const pTags = Array.from(document.querySelectorAll('p'));
                const synP = pTags.find(p => p.innerText.length > 80 && !p.innerText.includes('rating that you see'));
                if (synP) r.synopsis = synP.innerText.trim();
            }

            // ── YouTube Trailer ──
            const iframe = document.querySelector('iframe[src*="youtube.com"]');
            if (iframe && iframe.src.match(/\/embed\/([^?]+)/)) {
                r.trailer = `https://www.youtube.com/watch?v=${iframe.src.match(/\/embed\/([^?]+)/)[1]}`;
            } else {
                const a = document.querySelector('a[href*="youtube.com"], a[href*="youtu.be"]');
                if (a) r.trailer = a.href;
            }

            // ── Platforms ──
            const pDiv = document.querySelector('div[class*="MovieInfo_platforms"]');
            if (pDiv) {
                const imgs = Array.from(pDiv.querySelectorAll('img')).map(i => i.src.toLowerCase());
                if (imgs.some(s => s.includes('netflix'))) r.platformKey = 'netflix';
                else if (imgs.some(s => s.includes('prime'))) r.platformKey = 'prime';
                else if (imgs.some(s => s.includes('hotstar') || s.includes('jio'))) r.platformKey = 'hotstar';
                else if (imgs.some(s => s.includes('zee5'))) r.platformKey = 'zee5';
                else if (imgs.some(s => s.includes('sony'))) r.platformKey = 'sony';
                else if (imgs.some(s => s.includes('apple'))) r.platformKey = 'apple';
            }

            return r;
        });

        await page.close();
        return data;
    } catch (e) {
        log(`      ⚠️ Scrape Error: ${e.message}`);
        await page.close();
        return null;
    }
}

// ─────────────────────────────────────────────────────────────
// 📡  MAIN PIPELINE
// ─────────────────────────────────────────────────────────────
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
                const titleStr = info?.querySelector('div:nth-child(1)')?.innerText.trim() || c.querySelector('img')?.alt || 'Untitled';
                const dateStr = info?.querySelector('div:nth-child(3) div:first-child')?.innerText.trim() || '';

                return {
                    title: titleStr,
                    url: c.href.split('?')[0].split('/trailers')[0].split('/reviews')[0],
                    date: dateStr
                };
            });
        });

        await browser.close();
        return items;
    } catch (e) {
        log(`❌ Scrape Crash: ${e.message}`);
        await browser.close();
        return [];
    }
}

// ─────────────────────────────────────────────────────────────
// 📤  WHATSAPP DELIVERY (Hardened)
// ─────────────────────────────────────────────────────────────
async function deliver(trailers) {
    return new Promise((resolve) => {
        log(`🤖 Booting WhatsApp (Trailer Build)...`);
        const client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
        });

        client.on('qr', (qr) => {
            log('📲 QR Code received. Please scan to login.');
            qrcode.generate(qr, { small: true });
        });

        client.on('loading_screen', (percent, msg) => log(`🔌 WhatsApp Loading: ${percent}% - ${msg}`));
        client.on('auth_failure', (msg) => { log(`❌ Auth Failure: ${msg}`); resolve(false); });
        client.on('disconnected', (reason) => log(`📵 Disconnected: ${reason}`));

        client.on('ready', async () => {
            log(`✅ WhatsApp Connected! Processing ${trailers.length} new items...`);
            const browser = await chromium.launch({ headless: true });
            const context = await browser.newContext(devices['iPhone 12']);

            try {
                for (let item of trailers) {
                    log(`  🎬 Analyzing: ${item.title}`);
                    const details = await scrapeDetails(context, item.url);
                    if (!details || !details.trailer) {
                        log(`      ⚠️ No trailer link found, skipping.`);
                        continue;
                    }

                    let caption = `🎬  *NEW TRAILER RELEASE*\n`;
                    caption += `🔥  *${item.title.toUpperCase()}*\n`;
                    caption += `${PLATFORM_ICONS[details.platformKey] || '🎬  IN THEATRES'}\n`;
                    caption += `────────────────────\n`;
                    
                    let meta = [];
                    if (details.language) meta.push(`🌐  ${details.language}`);
                    if (details.genre) meta.push(`🎭  ${details.genre}`);
                    if (details.imdbRating) meta.push(`⭐  IMDb: ${details.imdbRating}`);
                    if (meta.length > 0) caption += meta.join(' | ') + '\n';

                    if (details.synopsis) {
                        const cleanSyn = details.synopsis.replace(/Read more|rating that you see.*/gi, '').trim();
                        if (cleanSyn.length > 10) caption += `\n📝  ${cleanSyn.substring(0, 350)}${cleanSyn.length > 350 ? '...' : ''}\n`;
                    }
                    caption += `\n🎥  ${details.trailer}\n`;
                    caption += `━━━━━━━━━━━━━━━━━━━━━━`;

                    await client.sendMessage(WHATSAPP_GROUP_ID, caption);
                    log(`      📤 Delivered.`);
                    await new Promise(r => setTimeout(r, MESSAGE_DELAY));
                }
                log('✨ Trailer cycle complete!');
                await browser.close();
                await client.destroy();
                resolve(true);
            } catch (err) {
                log(`❌ Delivery Error: ${err.message}`);
                await browser.close();
                await client.destroy();
                resolve(false);
            }
        });

        client.initialize().catch(err => { log(`❌ Init: ${err.message}`); resolve(false); });
    });
}

// 🚀 MAIN
(async () => {
    log('🍿 Popcorn Scale Trailer Sentinel V7 — Hardened 🚀');
    
    let sentUrls = [];
    if (fs.existsSync(STATE_FILE)) {
        try { 
            const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            sentUrls = Array.isArray(data) ? data : [];
        } catch (e) {
            log(`⚠️ State load fail: ${e.message}`);
        }
    }

    const items = await scrapeTrailers();
    const fresh = items.filter(i => !sentUrls.includes(i.url));

    if (fresh.length > 0) {
        log(`🔥 Found ${fresh.length} NEW trailers!`);
        const ok = await deliver(fresh);
        if (ok) {
            const updated = [...new Set([...sentUrls, ...fresh.map(i => i.url)])];
            fs.writeFileSync(STATE_FILE, JSON.stringify(updated.slice(-100), null, 2));
        }
    } else {
        log('✨ No new trailers found.');
    }

    log('🏁 Trailer cycle finished.');
    process.exit(0);
})();

// Cleanup
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

const { chromium, devices } = require('playwright-chromium');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// ⚙️  SETTINGS (Weekly Releases V5 — World Class Hardened)
// ─────────────────────────────────────────────────────────────
const WHATSAPP_GROUP_ID = "120363425401883129@g.us";
const STATE_FILE        = path.join(__dirname, 'weekly_releases_state.json');
const SCRAPE_URL        = "https://nokioapp.com/in/new-releases";
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
    'theatres': '🎬  IN THEATRES'
};

function getWeekWindow() {
    const now = new Date();
    const day = now.getDay();
    let diff = day - 3; // Wednesday
    if (diff < 0) diff += 7;
    const start = new Date(now);
    start.setDate(now.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    end.setHours(23, 59, 59, 999);
    return { monday: start, sunday: end };
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
    if (d < new Date(new Date().setMonth(new Date().getMonth() - 6))) d.setFullYear(d.getFullYear() + 1);
    return d;
}

function languagePriority(lang) {
    const l = (lang || 'Various').toLowerCase();
    if (l.includes('telugu')) return 1;
    if (l.includes('tamil')) return 2;
    if (l.includes('hindi')) return 3;
    if (l.includes('malayalam')) return 4;
    if (l.includes('kannada')) return 5;
    if (l.includes('english')) return 6;
    return 10;
}

// ─────────────────────────────────────────────────────────────
// 🔍  DETAIL SCRAPER (V7 Standard)
// ─────────────────────────────────────────────────────────────
async function scrapeDetails(context, url) {
    const page = await context.newPage();
    try {
        log(`      🌐 Verifying: ${url}`);
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(6000);

        const data = await page.evaluate(() => {
            const r = {
                language: null,
                genre: null,
                imdbRating: null,
                synopsis: null,
                platformKey: 'theatres',
                posterUrl: null
            };

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
                const genreLine = lines.find(l => !l.match(/\d{4}/) && l.length > 2 && l.length < 50);
                if (genreLine) r.genre = genreLine;
            }

            const imdbSpan = document.querySelector('span[class*="ImdbRating_rating"]');
            if (imdbSpan) {
                const m = imdbSpan.innerText.match(/(\d\.\d)/);
                if (m) r.imdbRating = m[1];
            }

            const tabContainer = document.querySelector('div[class*="MovieInfoTabItems_container"]');
            if (tabContainer) {
                const parts = tabContainer.innerText.split('\n').filter(l => l.trim().length > 0);
                const synLine = parts.find(l => l.length > 50 && !l.includes('Synopsis') && !l.includes('Cast'));
                if (synLine) r.synopsis = synLine.trim();
            }

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

            const img = document.querySelector('img[class*="Poster_image"], img[class*="MovieCard_image"]');
            if (img) r.posterUrl = img.src.split('?')[0] + '?h=1000&q=90';

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
// 📤  WHATSAPP DELIVERY (Hardened)
// ─────────────────────────────────────────────────────────────
async function deliver(payloads) {
    return new Promise((resolve) => {
        log(`🤖 Booting WhatsApp (Weekly Guide Build)...`);
        const client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
        });

        client.on('qr', (qr) => {
            log('📲 QR Code for Weekly Guide. Please scan if prompted.');
            qrcode.generate(qr, { small: true });
        });

        client.on('loading_screen', (percent, msg) => log(`🔌 WhatsApp Loading: ${percent}% - ${msg}`));
        client.on('auth_failure', (msg) => { log(`❌ Auth Failure: ${msg}`); resolve(false); });
        client.on('disconnected', (reason) => log(`📵 Disconnected: ${reason}`));

        client.on('ready', async () => {
            log(`✅ Connected! Delivering guide with ${payloads.length} movies...`);
            try {
                // Intro Message
                const intro = `━━━━━━━━━━━━━━━\n🎬  *THIS WEEK'S RELEASES*  📺\n━━━━━━━━━━━━━━━\n_Latest movies dropping in Theatres and OTT!_\n\n────────────────────`;
                await client.sendMessage(WHATSAPP_GROUP_ID, intro);
                await new Promise(r => setTimeout(r, 2000));

                for (let item of payloads) {
                    log(`  📤 Delivering: ${item.title}`);
                    let caption = `🔥  *${item.title.toUpperCase()}*\n`;
                    caption += `${PLATFORM_ICONS[item.platformKey] || '🎬  IN THEATRES'}\n`;
                    caption += `🗓  ${item.date}\n`;
                    
                    let meta = [];
                    if (item.language) meta.push(`🌐  ${item.language}`);
                    if (item.genre) meta.push(`🎭  ${item.genre}`);
                    if (item.imdbRating) meta.push(`⭐  IMDb: ${item.imdbRating}`);
                    if (meta.length > 0) caption += meta.join(' | ') + '\n';

                    if (item.synopsis) {
                        caption += `\n📝  ${item.synopsis.substring(0, 350)}${item.synopsis.length > 350 ? '...' : ''}\n`;
                    }
                    caption += `━━━━━━━━━━━━━━━━━━━━━━`;

                    if (item.posterUrl) {
                        try {
                            const media = await MessageMedia.fromUrl(item.posterUrl, { unsafeMime: true });
                            await client.sendMessage(WHATSAPP_GROUP_ID, media, { caption });
                        } catch (err) {
                            await client.sendMessage(WHATSAPP_GROUP_ID, caption);
                        }
                    } else {
                        await client.sendMessage(WHATSAPP_GROUP_ID, caption);
                    }
                    await new Promise(r => setTimeout(r, MESSAGE_DELAY));
                }
                log('✨ Weekly Guide delivered successfully!');
                await client.destroy();
                resolve(true);
            } catch (err) {
                log(`❌ Delivery Crash: ${err.message}`);
                await client.destroy();
                resolve(false);
            }
        });

        client.initialize().catch(err => { log(`❌ Init: ${err.message}`); resolve(false); });
    });
}

// 🚀 EXECUTION
(async () => {
    log('🍿 Popcorn Scale Weekly Guide V5 — Hardened 🚀');
    const { monday, sunday } = getWeekWindow();
    const weekKey = monday.toISOString().split('T')[0];

    let state = { lastSentWeek: '' };
    if (fs.existsSync(STATE_FILE)) {
        try { 
            const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            if (data && typeof data === 'object') state = { ...state, ...data };
        } catch (e) {
            log(`⚠️ State load fail: ${e.message}`);
        }
    }

    if (state.lastSentWeek === weekKey) {
        log(`⏭️  Already sent this week's guide (${weekKey}). Skipping delivery.`);
        process.exit(0);
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(devices['iPhone 12']);
    const page    = await context.newPage();

    try {
        log(`🌍 Scouting Nokio for this week's releases...`);
        await page.goto(SCRAPE_URL, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(6000);

        const list = await page.evaluate(() => {
            const containers = Array.from(document.querySelectorAll('a[class*="MovieItem_container"]'));
            return containers.map(c => {
                const info = c.querySelector('div > div:last-child');
                const titleStr = info?.querySelector('div:nth-child(1)')?.innerText.trim() || c.querySelector('img')?.alt || 'Untitled';
                const dateStr = info?.querySelector('div:nth-child(3) div:first-child')?.innerText.trim() || '';
                
                return {
                    title: titleStr,
                    url: c.href,
                    dateText: dateStr
                };
            });
        });

        const thisWeek = list.filter(item => {
            const d = parseNokioDate(item.dateText);
            return (d && d >= monday && d <= sunday) || item.dateText === '';
        });

        log(`📊 Found ${thisWeek.length} headliners. Deep scraping...`);

        const finalData = [];
        for (let item of thisWeek) {
            const details = await scrapeDetails(context, item.url);
            if (details && details.language && details.synopsis) {
                finalData.push({ ...item, ...details, date: item.dateText || "Out Now" });
            }
        }

        const sorted = finalData.sort((a, b) => languagePriority(a.language) - languagePriority(b.language));

        if (sorted.length > 0) {
            const ok = await deliver(sorted);
            if (ok) {
                state.lastSentWeek = weekKey;
                fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
            }
        } else {
            log('✨ No valid releases found for the window.');
        }

    } catch (e) {
        log(`❌ Scrape Crash: ${e.message}`);
    } finally {
        await browser.close();
        log('🏁 Done.');
        process.exit(0);
    }
})();

// Cleanup Handlers
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

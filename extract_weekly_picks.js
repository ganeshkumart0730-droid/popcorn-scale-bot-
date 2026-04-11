const { chromium, devices } = require('playwright-chromium');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// ⚙️  SETTINGS (V7 — The Search-and-Scrape Build)
// ─────────────────────────────────────────────────────────────
const WHATSAPP_GROUP_ID = "120363409136720699@g.us"; 
const STATE_FILE        = path.join(__dirname, 'last_sent_picks.json');
const SCRAPE_URL        = "https://nokioapp.com/in?v=1";
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
    'apple': '  APPLE TV+',
    'youtube': '▶️  YOUTUBE',
    'theatres': '🎬  IN THEATRES'
};

// ─────────────────────────────────────────────────────────────
// 🔎  SEARCH for detail URL on Nokio
// ─────────────────────────────────────────────────────────────
async function findDetailUrl(context, title, retryCount = 0) {
    const page = await context.newPage();
    try {
        const searchUrl = `https://nokioapp.com/movies?order=popularity&q=${encodeURIComponent(title)}`;
        await page.goto(searchUrl, { waitUntil: 'load', timeout: 40000 });
        await page.waitForTimeout(4000);

        const url = await page.evaluate((searchTitle) => {
            const links = Array.from(document.querySelectorAll('a[href*="/movie/"], a[href*="/series/"]'));
            // Prefer a 2025/2026 result, else take the first
            const best = links.find(a => a.href.includes('2026') || a.href.includes('2025'));
            return (best || links[0])?.href || null;
        }, title);

        await page.close();
        
        // Retry if nothing found on 1st attempt
        if (!url && retryCount < 1) {
            log(`      🔄 Retrying search for "${title}"...`);
            return await findDetailUrl(context, title, retryCount + 1);
        }
        
        return url;
    } catch (e) {
        log(`      ⚠️ Search error for "${title}": ${e.message}`);
        await page.close();
        if (retryCount < 1) return await findDetailUrl(context, title, retryCount + 1);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────
// 🔍  DETAIL PAGE SCRAPER (Debug-Proven Selectors)
// ─────────────────────────────────────────────────────────────
async function scrapeDetails(context, url) {
    const page = await context.newPage();
    try {
        log(`      🌐 Loading: ${url}`);
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(8000);

        const data = await page.evaluate(() => {
            const r = {
                language: null,
                genre: null,
                imdbRating: null,
                nokioScore: null,
                synopsis: null,
                platformKey: 'theatres'
            };

            // ── MovieInfo_movie-details → Language & Genre ──
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

            // ── ImdbRating_rating → IMDb ──
            const imdbSpan = document.querySelector('span[class*="ImdbRating_rating"]');
            if (imdbSpan) {
                const m = imdbSpan.innerText.match(/(\d\.\d)/);
                if (m) r.imdbRating = m[1];
            }

            // ── NokioRating_rating → Nokio Score ──
            const nokioDiv = document.querySelector('div[class*="NokioRating_rating"]');
            if (nokioDiv) {
                const score = nokioDiv.innerText.trim();
                if (score.match(/^\d+$/)) r.nokioScore = score;
            }

            // ── MovieInfoTabItems_container → Synopsis ──
            const tabContainer = document.querySelector('div[class*="MovieInfoTabItems_container"]');
            if (tabContainer) {
                const parts = tabContainer.innerText.split('\n').filter(l => l.trim().length > 0);
                const synLine = parts.find(l => l.length > 50 && !l.includes('Synopsis') && !l.includes('Cast') && !l.match(/^\d+\.?\d*$/));
                if (synLine) r.synopsis = synLine.trim();
            }
            if (!r.synopsis) {
                const pTags = Array.from(document.querySelectorAll('p'));
                const synP = pTags.find(p => p.innerText.length > 80 && !p.innerText.includes('rating that you see'));
                if (synP) r.synopsis = synP.innerText.trim().split('\n')[0];
            }

            // ── Platform Detection (Multi-Strategy) ──
            // Strategy 1: MovieInfo_platforms container (primary)
            const pDiv = document.querySelector('div[class*="MovieInfo_platforms"]');
            if (pDiv) {
                const imgs = Array.from(pDiv.querySelectorAll('img')).map(i => i.src.toLowerCase());
                if (imgs.some(s => s.includes('netflix'))) r.platformKey = 'netflix';
                else if (imgs.some(s => s.includes('prime'))) r.platformKey = 'prime';
                else if (imgs.some(s => s.includes('hotstar') || s.includes('jio'))) r.platformKey = 'hotstar';
                else if (imgs.some(s => s.includes('zee5'))) r.platformKey = 'zee5';
                else if (imgs.some(s => s.includes('sony'))) r.platformKey = 'sony';
                else if (imgs.some(s => s.includes('apple'))) r.platformKey = 'apple';
                else if (imgs.some(s => s.includes('youtube') || s.includes('yt'))) r.platformKey = 'youtube';
            }
            
            // Strategy 2: If no platform found, scan ALL page images
            if (r.platformKey === 'theatres') {
                const allImgs = Array.from(document.querySelectorAll('img')).map(i => (i.src + ' ' + (i.alt || '')).toLowerCase());
                if (allImgs.some(s => s.includes('youtube') && s.includes('platform'))) r.platformKey = 'youtube';
            }
            
            // Strategy 3: If still no platform, check for YouTube-exclusive content
            // (Standup specials, YouTube Originals often have only a YouTube embed)
            if (r.platformKey === 'theatres') {
                const bodyText = document.body.innerText.toLowerCase();
                if (bodyText.includes('youtube') || bodyText.includes('youtube premium') || bodyText.includes('youtube original')) {
                    r.platformKey = 'youtube';
                }
            }

            return r;
        });

        log(`      ✅ Lang=${data.language} | Genre=${data.genre} | IMDb=${data.imdbRating} | Nokio=${data.nokioScore} | Platform=${data.platformKey} | Syn=${data.synopsis ? 'YES(' + data.synopsis.length + ')' : 'NONE'}`);
        await page.close();
        return data;
    } catch (e) {
        log(`      ⚠️ Scrape Error: ${e.message}`);
        await page.close();
        return null;
    }
}

// ─────────────────────────────────────────────────────────────
// 📡  MAIN SCRAPE PIPELINE
// ─────────────────────────────────────────────────────────────
async function scrapePicks() {
    log(`📡 Scouting Weekly Picks...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(devices['iPhone 12']);
    const page    = await context.newPage();

    try {
        await page.goto(SCRAPE_URL, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(6000);

        const pickTitles = await page.evaluate(() => {
            const ct = document.querySelector('[class*="PickOfTheWeek_content"]');
            if (!ct) return [];
            return Array.from(ct.children).map((item, idx) => ({
                rank: (idx + 1).toString().padStart(2, '0'),
                title: item.querySelector('img')?.alt || `Pick #${idx + 1}`,
                posterUrl: item.querySelector('img') ? item.querySelector('img').src.split('?')[0] + '?h=1000' : ''
            }));
        });

        log(`🧩 Found ${pickTitles.length} picks. Searching & scraping each...`);
        const fullPicks = [];

        for (const item of pickTitles.slice(0, 10)) {
            log(`  📦 #${item.rank}: ${item.title}`);

            // Step 1: Find the detail URL via search
            const detailUrl = await findDetailUrl(context, item.title);
            if (!detailUrl) {
                log(`      ⚠️ No URL found, skipping details.`);
                fullPicks.push(item);
                continue;
            }

            // Step 2: Scrape the detail page
            const details = await scrapeDetails(context, detailUrl);
            fullPicks.push({ ...item, ...(details || {}) });
        }

        await browser.close();
        return fullPicks;
    } catch (e) {
        log(`❌ Scrape Crash: ${e.message}`);
        await browser.close();
        return [];
    }
}

// ─────────────────────────────────────────────────────────────
// 📤  WHATSAPP DELIVERY
// ─────────────────────────────────────────────────────────────
async function deliver(picks) {
    return new Promise((resolve) => {
        log(`🤖 Booting WhatsApp...`);
        const client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
        });

        client.on('qr', (qr) => {
            log('📲 QR Code received. Please scan with WhatsApp to login.');
            qrcode.generate(qr, { small: true });
        });

        client.on('loading_screen', (percent, message) => {
            log(`🔌 WhatsApp Loading: ${percent}% - ${message}`);
        });

        client.on('auth_failure', (msg) => {
            log(`❌ WhatsApp Auth Failure: ${msg}. You may need to delete the .wwebjs_auth folder and re-scan.`);
            resolve(false);
        });

        client.on('disconnected', (reason) => {
            log(`📵 WhatsApp Disconnected: ${reason}`);
        });

        client.on('ready', async () => {
            log(`✅ WhatsApp Connected! Delivering ${picks.length} Postcards...`);
            try {
                for (let i = 0; i < picks.length; i++) {
                    const p = picks[i];
                    log(`  📤 #${p.rank}: ${p.title}`);

                    let caption = `🌟  *WEEKLY PICK #${p.rank}*\n`;
                    caption += `🔥  *${p.title.toUpperCase()}*\n`;
                    caption += `${PLATFORM_ICONS[p.platformKey] || '🎬  IN THEATRES'}\n`;
                    caption += `────────────────────\n`;
                    
                    let meta = [];
                    if (p.language) meta.push(`🌐  ${p.language}`);
                    if (p.genre) meta.push(`🎭  ${p.genre}`);
                    if (p.imdbRating) meta.push(`⭐  IMDb: ${p.imdbRating}`);
                    else if (p.nokioScore) meta.push(`✨  Nokio: ${p.nokioScore}/100`);
                    if (meta.length > 0) caption += meta.join(' | ') + '\n';

                    if (p.synopsis) caption += `\n📝  ${p.synopsis}\n`;
                    caption += `━━━━━━━━━━━━━━━━━━━━━━`;

                    if (p.posterUrl) {
                        try {
                            const media = await MessageMedia.fromUrl(p.posterUrl, { unsafeMime: true });
                            await client.sendMessage(WHATSAPP_GROUP_ID, media, { caption });
                        } catch (err) {
                            log(`    ⚠️ Media fail, text only.`);
                            await client.sendMessage(WHATSAPP_GROUP_ID, caption);
                        }
                    } else {
                        await client.sendMessage(WHATSAPP_GROUP_ID, caption);
                    }
                    await new Promise(r => setTimeout(r, MESSAGE_DELAY));
                }
                log('✨ All Weekly Picks delivered!');
                await client.destroy();
                resolve(true);
            } catch (err) {
                log(`❌ Delivery Error: ${err.message}`);
                await client.destroy();
                resolve(false);
            }
        });

        client.initialize().catch(err => { log(`❌ Init: ${err.message}`); resolve(false); });
    });
}

// ─────────────────────────────────────────────────────────────
// 🚀  MAIN
// ─────────────────────────────────────────────────────────────
(async () => {
    log('🏆 Weekly Picks V7 — Search & Scrape Build 🚀');
    
    let state = { lastSentWeek: '' };
    if (fs.existsSync(STATE_FILE)) {
        try { 
            const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            if (data && typeof data === 'object') {
                state = { ...state, ...data };
            }
        } catch (e) {
            log(`⚠️ State load fail: ${e.message}`);
        }
    }

    const picks = await scrapePicks();
    if (picks.length > 0) {
        // Prevent sending duplicate weeks
        if (state.lastSentWeek === picks[0].title) {
            log(`⏭️  Already sent this week's picks (${picks[0].title}). Skipping delivery.`);
        } else {
            const ok = await deliver(picks);
            if (ok) {
                state.lastSentWeek = picks[0].title;
                fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
            }
        }
    }

    log('🏁 Weekly Picks Final Cycle Complete.');
    process.exit(0);
})();

// ─────────────────────────────────────────────────────────────
// 🛑  CLEANUP HANDLERS
// ─────────────────────────────────────────────────────────────
process.on('SIGINT', async () => {
    log('👋 Termination received. Cleaning up...');
    process.exit(0);
});
process.on('SIGTERM', async () => {
    log('👋 System termination received.');
    process.exit(0);
});

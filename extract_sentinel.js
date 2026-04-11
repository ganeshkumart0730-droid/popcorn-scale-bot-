const { chromium } = require('playwright-chromium');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// ⚙️  SETTINGS (Sentinel V9 - World Class Hardened)
// ─────────────────────────────────────────────────────────────
const WHATSAPP_GROUP_ID = "120363425759350259@g.us"; 
const STATE_FILE        = path.join(__dirname, 'sentinel_state.json');
const FETCH_COUNT       = 10;   
const SCRAPE_URL        = "https://inshorts.com/en/read/entertainment";

function log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

// ─────────────────────────────────────────────────────────────
// 📡  GOD-LEVEL JSON EXTRACTION
// ─────────────────────────────────────────────────────────────
async function fetchInShortsGodLevel() {
    log(`🛰️  Popcorn Sentinel: Extracting cinematic news...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        await page.goto(SCRAPE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        const newsItems = await page.evaluate(() => {
            const state = window.__STATE__;
            if (state && state.news_list && state.news_list.list) {
                return state.news_list.list.map(n => ({
                    title: n.news_obj.title,
                    body:  n.news_obj.content,
                    image: n.news_obj.image_url,
                    url:   n.news_obj.source_url
                }));
            }
            return Array.from(document.querySelectorAll('.news-card')).map(card => {
                const titleStr = card.querySelector('.news-card-title span[itemprop="headline"]')?.textContent || '';
                const bodyStr  = card.querySelector('.news-card-content div[itemprop="articleBody"]')?.textContent || '';
                return {
                    title: titleStr.trim(),
                    body: bodyStr.trim(),
                    image: card.querySelector('.news-card-image')?.getAttribute('style')?.match(/url\(['"]?([^'"]+)['"]?\)/)?.[1] || '',
                    url: card.querySelector('.source')?.getAttribute('href') || ''
                };
            });
        });

        await browser.close();
        return newsItems;
    } catch (e) {
        log(`❌  Fetch Error: ${e.message}`);
        await browser.close();
        return [];
    }
}

// ─────────────────────────────────────────────────────────────
// 📤  WHATSAPP DELIVERY (Hardened)
// ─────────────────────────────────────────────────────────────
async function deliver(payloads) {
    return new Promise((resolve) => {
        log(`🤖 Booting WhatsApp (Buzz Sentinel)...`);
        const client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
        });

        client.on('qr', (qr) => {
            log('📲 QR Code received. Please scan to login for Sentinel updates.');
            qrcode.generate(qr, { small: true });
        });

        client.on('loading_screen', (percent, msg) => log(`🔌 WhatsApp Loading: ${percent}% - ${msg}`));
        client.on('auth_failure', (msg) => { log(`❌ Auth Failure: ${msg}`); resolve(false); });
        client.on('disconnected', (reason) => log(`📵 Disconnected: ${reason}`));

        client.on('ready', async () => {
            log(`✅ Connected! Delivering ${payloads.length} God-Level updates...`);
            try {
                for (let i = 0; i < payloads.length; i++) {
                    const item = payloads[i];
                    log(`  📤 [${i+1}/${payloads.length}] Delivering: ${item.title.substring(0, 40)}...`);

                    let card = `━━━━━━━━━━━━━━━━━━━━━━\n`;
                    card    += `🍿  *POPCORN SCALE BUZZ*\n`;
                    card    += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                    card    += `🎬  *${item.title.toUpperCase()}*\n\n`;
                    card    += `${item.body}\n\n`;
                    if (item.url) card += `🔗  _Full coverage:_ ${item.url}\n`;
                    card    += `━━━━━━━━━━━━━━━━━━━━━━`;

                    if (item.image) {
                        try {
                            const media = await MessageMedia.fromUrl(item.image, { unsafeMime: true });
                            await client.sendMessage(WHATSAPP_GROUP_ID, media, { caption: card });
                        } catch (err) {
                            await client.sendMessage(WHATSAPP_GROUP_ID, card);
                        }
                    } else {
                        await client.sendMessage(WHATSAPP_GROUP_ID, card);
                    }
                    
                    await new Promise(r => setTimeout(r, 4000));
                }

                log('✨ All news cards delivered!');
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
    log('🛰️  Popcorn Scale Buzz Sentinel V9 — God-Level Hardened 🚀');

    let sentUrls = [];
    if (fs.existsSync(STATE_FILE)) {
        try { 
            const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            sentUrls = Array.isArray(data) ? data : [];
        } catch (e) {
            log(`⚠️ State load fail: ${e.message}`);
        }
    }

    try {
        const items = await fetchInShortsGodLevel();
        const fresh = items.filter(i => i.title && !sentUrls.includes(i.title)).slice(0, FETCH_COUNT);

        if (fresh.length > 0) {
            log(`🔥 Found ${fresh.length} fresh cinematic stories.`);
            const ok = await deliver(fresh);
            if (ok) {
                const updated = [...new Set([...sentUrls, ...fresh.map(i => i.title)])];
                fs.writeFileSync(STATE_FILE, JSON.stringify(updated.slice(-300), null, 2));
            }
        } else {
            log('✨ No fresh news stories at this time.');
        }
    } catch (err) {
        log(`❌ Fatal: ${err.message}`);
    }

    log('🏁 Sentinel cycle finished.');
    process.exit(0);
})();

// Cleanup Handlers
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

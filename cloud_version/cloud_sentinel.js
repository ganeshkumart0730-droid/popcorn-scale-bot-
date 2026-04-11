const { chromium } = require('playwright-chromium');
const { MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { getCloudClient } = require('./cloud_auth');

// ⚙️ SETTINGS
const WHATSAPP_GROUP_ID = "120363425759350259@g.us"; 
const STATE_FILE        = path.join(__dirname, 'last_sent_sentinel.json');
const FETCH_COUNT       = 10;   
const SCRAPE_URL        = "https://inshorts.com/en/read/entertainment";

function log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] 🛰️ [SENTINEL-BOT] ${msg}`);
}

async function fetchNews() {
    log(`🛰️ Extracting news...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
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
            return Array.from(document.querySelectorAll('.news-card')).map(card => ({
                title: card.querySelector('.news-card-title span[itemprop="headline"]')?.textContent.trim() || '',
                body: card.querySelector('.news-card-content div[itemprop="articleBody"]')?.textContent.trim() || '',
                image: card.querySelector('.news-card-image')?.getAttribute('style')?.match(/url\(['"]?([^'"]+)['"]?\)/)?.[1] || '',
                url: card.querySelector('.source')?.getAttribute('href') || ''
            }));
        });
        await browser.close();
        return newsItems;
    } catch (e) { log(`❌ Fetch Error: ${e.message}`); await browser.close(); return []; }
}

(async () => {
    log('🚀 Starting Cloud Sentinel Bot');
    const { client, mongoose } = await getCloudClient('sentinel-bot');

    client.on('qr', (qr) => {
        log('📲 SCAN THIS QR CODE IN YOUR GITHUB LOGS:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', async () => {
        log('✅ Connected!');
        let sentTitles = [];
        if (fs.existsSync(STATE_FILE)) { try { sentTitles = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); if(!Array.isArray(sentTitles)) sentTitles=[]; } catch { sentTitles = []; } }

        const items = await fetchNews();
        const fresh = items.filter(i => i.title && !sentTitles.includes(i.title)).slice(0, FETCH_COUNT);

        if (fresh.length > 0) {
            log(`🔥 Found ${fresh.length} fresh stories.`);
            for (let item of fresh) {
                let card = `━━━━━━━━━━━━━━━━━━━━━━\n🍿  *POPCORN SCALE BUZZ*\n━━━━━━━━━━━━━━━━━━━━━━\n\n🎬  *${item.title.toUpperCase()}*\n\n${item.body}\n\n`;
                if (item.url) card += `🔗  _Full coverage:_ ${item.url}\n`;
                card += `━━━━━━━━━━━━━━━━━━━━━━`;

                if (item.image) {
                    try {
                        const media = await MessageMedia.fromUrl(item.image, { unsafeMime: true });
                        await client.sendMessage(WHATSAPP_GROUP_ID, media, { caption: card });
                    } catch { await client.sendMessage(WHATSAPP_GROUP_ID, card); }
                } else { await client.sendMessage(WHATSAPP_GROUP_ID, card); }
                await new Promise(r => setTimeout(r, 4000));
            }
            const updated = [...new Set([...sentTitles, ...fresh.map(i => i.title)])];
            fs.writeFileSync(STATE_FILE, JSON.stringify(updated.slice(-300), null, 2));
        }
        await client.destroy();
        await mongoose.disconnect();
        process.exit(0);
    });

    client.initialize().catch(err => { log(`❌ Fatal: ${err.message}`); process.exit(1); });
})();

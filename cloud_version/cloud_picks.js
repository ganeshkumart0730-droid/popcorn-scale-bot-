const { chromium, devices } = require('playwright-chromium');
const { MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { getCloudClient } = require('./cloud_auth');

// ⚙️ SETTINGS
const WHATSAPP_GROUP_ID = "120363409136720699@g.us"; 
const STATE_FILE        = path.join(__dirname, 'last_sent_picks.json');
const SCRAPE_URL        = "https://nokioapp.com/in?v=1";
const MESSAGE_DELAY     = 3000;

function log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] 🌟 [PICKS-BOT] ${msg}`);
}

const PLATFORM_ICONS = {
    'netflix': '🔴  NETFLIX', 'prime': '🔵  PRIME VIDEO', 'hotstar': '⭐  JIOHOTSTAR',
    'jio': '⭐  JIOHOTSTAR', 'zee5': '🟣  ZEE5', 'sony': '🟠  SONY LIV',
    'apple': '  APPLE TV+', 'youtube': '▶️  YOUTUBE', 'theatres': '🎬  IN THEATRES'
};

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
        await browser.close();
        return pickTitles;
    } catch (e) { log(`❌ Scrape Crash: ${e.message}`); await browser.close(); return []; }
}

async function runPicks(client) {
    log('🌟 Starting Weekly Picks Task...');
    try {
        let state = { lastSentWeek: '' };
        if (fs.existsSync(STATE_FILE)) { try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {} }

        const picks = await scrapePicks();
        if (picks.length > 0) {
            if (state.lastSentWeek === picks[0].title) {
                log(`⏭️ Already sent this week's picks (${picks[0].title}). Skipping.`);
            } else {
                log(`🔥 Sending ${picks.length} weekly picks!`);
                for (let p of picks) {
                    let caption = `🌟  *WEEKLY PICK #${p.rank}*\n🔥  *${p.title.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
                    if (p.posterUrl) {
                        try {
                            const media = await MessageMedia.fromUrl(p.posterUrl, { unsafeMime: true });
                            await client.sendMessage(WHATSAPP_GROUP_ID, media, { caption });
                        } catch { await client.sendMessage(WHATSAPP_GROUP_ID, caption); }
                    } else { await client.sendMessage(WHATSAPP_GROUP_ID, caption); }
                    await new Promise(r => setTimeout(r, MESSAGE_DELAY));
                }
                state.lastSentWeek = picks[0].title;
                fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
            }
        } else {
            log('⏭️ No picks found to send.');
        }
    } catch (e) {
        log(`❌ Picks Error: ${e.message}`);
    }
}

module.exports = { runPicks };

(async () => {
    log('🚀 Starting Cloud Picks Bot (Session: popcorn-main)');
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
        log('💾 Session successfully saved to MongoDB Atlas!');
        if (isNewSession) log('✅ First-time setup complete. You won\'t need to scan again.');
    });

    client.on('ready', async () => {
        log('✅ Connected! Processing weekly picks...');
        await runPicks(client);

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

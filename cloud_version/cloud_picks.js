const { chromium, devices } = require('playwright-chromium');
const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

// ⚙️ SETTINGS
const WHATSAPP_GROUP_ID = "120363409136720699@g.us"; 
const STATE_FILE        = path.join(__dirname, 'last_sent_picks.json');
const SCRAPE_URL        = "https://nokioapp.com/in?v=1";

function log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] 🌟 [PICKS-BOT] ${msg}`);
}

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
            return Array.from(ct.children).map((item, idx) => {
                const img = item.querySelector('img');
                const link = item.querySelector('a');
                let title = img?.alt || '';
                
                // Fallback: Extract title from URL if Alt tag is missing (Nokio update)
                if (!title || title.toLowerCase() === 'untitled' || title.length < 2) {
                    const href = link?.href || '';
                    if (href.includes('/movie/')) {
                        const slug = href.split('/movie/')[1].split('?')[0].split('/')[0];
                        title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    }
                }
                
                return {
                    rank: (idx + 1).toString().padStart(2, '0'),
                    title: title || `Pick #${idx + 1}`,
                    posterUrl: img ? img.src.split('?')[0] + '?h=1000' : ''
                };
            });
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
            // Use the top pick's title as the unique key for the week
            const currentWeekKey = picks[0].title;

            if (state.lastSentWeek === currentWeekKey) {
                log(`⏭️ Already sent this week's picks (${currentWeekKey}). Skipping.`);
            } else {
                log(`🔥 Sending consolidated weekly picks list!`);
                
                let caption = `👑  *POPCORN SCALE: TOP PICKS*  👑\n_Trending updates this week!_\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                
                picks.forEach(p => {
                    caption += `🏆  *${p.rank}* | ${p.title.toUpperCase()}\n`;
                });
                
                caption += `\n━━━━━━━━━━━━━━━━━━━━━━\n🍿 _Stay tuned for more updates!_`;

                // Send the #1 Pick's poster as the header image for the list
                const topPick = picks[0];
                if (topPick.posterUrl) {
                    try {
                        const media = await MessageMedia.fromUrl(topPick.posterUrl, { unsafeMime: true });
                        await client.sendMessage(WHATSAPP_GROUP_ID, media, { caption });
                    } catch (err) {
                        log(`⚠️ Media failed, sending text only: ${err.message}`);
                        await client.sendMessage(WHATSAPP_GROUP_ID, caption);
                    }
                } else {
                    await client.sendMessage(WHATSAPP_GROUP_ID, caption);
                }

                state.lastSentWeek = currentWeekKey;
                fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
                log(`🚀 Consolidated Picks list sent!`);
            }
        } else {
            log('⏭️ No picks found to send.');
        }
    } catch (e) {
        log(`❌ Picks Error: ${e.message}`);
    }
}

module.exports = { runPicks };

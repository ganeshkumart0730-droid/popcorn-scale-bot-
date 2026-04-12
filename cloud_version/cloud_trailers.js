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

async function runTrailers(client) {
    log('🎬 Starting Trailers Task...');
    try {

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
                        
                        // 1. DYNAMIC Platform Detection & Release Date from Text
                        const bar = document.querySelector('div[class*="DetailsBar_info"]');
                        if (bar) {
                            const text = bar.innerText.toLowerCase();
                            const parts = text.split('|').map(p => p.trim());
                            
                            // Extract Release Date (looks for "Released: [date]" or just a date string)
                            const releasePart = parts.find(p => p.includes('release') || p.match(/\d{1,2}\s+[a-z]{3}\s+\d{4}/i));
                            if (releasePart) {
                                result.releaseDate = releasePart.replace(/released:?\s*/i, '').trim();
                            }

                            // Identify Platform
                            if (text.includes('theater') || text.includes('cinema')) result.platformKey = 'theatres';
                            else if (text.includes('netflix')) result.platformKey = 'netflix';
                            else if (text.includes('prime')) result.platformKey = 'prime';
                            else if (text.includes('hotstar') || text.includes('jio')) result.platformKey = 'hotstar';
                            else if (text.includes('zee5')) result.platformKey = 'zee5';
                            else if (text.includes('sony')) result.platformKey = 'sony';
                            else if (text.includes('apple')) result.platformKey = 'apple';
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
                        
                        if (data.releaseDate) caption += `📅  *Release:* ${data.releaseDate}\n`;
                        
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

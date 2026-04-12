const { chromium, devices } = require('playwright-chromium');
const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

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
            geolocation: { longitude: 77.2090, latitude: 28.6139 }, 
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
                        const result = { platformKey: null, language: null, genre: null, imdbRating: null, synopsis: null, trailer: null, releaseDate: null };
                        
                        const bar = document.querySelector('div[class*="DetailsBar_info"]');
                        if (bar) {
                            const text = bar.innerText.toLowerCase();
                            console.log(`DEBUG [META]: ${text}`); 

                            const parts = text.split('|').map(p => p.trim());
                            
                            // Extract Release Date
                            const releasePart = parts.find(p => p.includes('release') || p.match(/\d{1,2}\s+[a-z]{3}\s+\d{4}/i));
                            if (releasePart) {
                                result.releaseDate = releasePart.replace(/released:?\s*/i, '').trim();
                            }

                            // Identify Platform (PRIORITY)
                            if (text.includes('netflix')) result.platformKey = 'netflix';
                            else if (text.includes('prime')) result.platformKey = 'prime';
                            else if (text.includes('hotstar') || text.includes('jio')) result.platformKey = 'hotstar';
                            else if (text.includes('zee5')) result.platformKey = 'zee5';
                            else if (text.includes('sony')) result.platformKey = 'sony';
                            else if (text.includes('apple')) result.platformKey = 'apple';
                            else if (text.includes('theater') || text.includes('cinema')) result.platformKey = 'theatres';
                        }

                        // Metadata Extraction
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
                            const parts = tabContainer.innerText.split('\n').filter(p => l => l.trim().length > 50); // Fixed filter
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

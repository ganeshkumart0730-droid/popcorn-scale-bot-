const cron = require('node-cron');
const tmdb = require('./tmdb_service');
const wa = require('./whatsapp_service');
const db = require('./db_service');

const BROADCAST_SCHEDULES = {
    MORNING: '0 9 * * *',   // 9 AM
    AFTERNOON: '0 13 * * *', // 1 PM
    EVENING: '0 17 * * *',   // 5 PM
    NIGHT: '0 21 * * *'      // 9 PM
};

/**
 * 📢 Universal Broadcast Dispatcher
 */
async function runBroadcast(title, dataFn) {
    console.log(`📡 Starting Broadcast: ${title}`);
    const subscribers = await db.getSubscribers();
    if (subscribers.length === 0) return console.log('⚠️ No subscribers found.');

    const movies = await dataFn();
    let message = `━━━━━━━━━━━━━━━\n🎬 *POPCORN SCALE UPDATE*\n━━━━━━━━━━━━━━━\n*${title}*\n\n`;
    
    for (let m of movies) {
        message += `⭐ *${m.title}*\n📅 ${m.release_date || 'TBA'}\n📊 IMDb: ${m.vote_average.toFixed(1)}\n\n`;
    }
    
    for (let user of subscribers) {
        await wa.sendText(user.phone, message);
        await new Promise(r => setTimeout(r, 2000)); // Rate limiting
    }
    console.log(`✅ ${title} Broadcast delivered to ${subscribers.length} users.`);
}

// 🕒 MORNING: Latest Releases
cron.schedule(BROADCAST_SCHEDULES.MORNING, () => {
    runBroadcast('🔥 TODAY\'S FRESH RELEASES', () => tmdb.getLatestMovies('en'));
});

// 🕒 AFTERNOON: Trending Buzz
cron.schedule(BROADCAST_SCHEDULES.AFTERNOON, () => {
    runBroadcast('📺 TRENDING NOW', () => tmdb.getTrending());
});

// 🕒 NIGHT: Telugu Picks
cron.schedule(BROADCAST_SCHEDULES.NIGHT, () => {
    runBroadcast('🍿 WEEKEND TELUGU PICKS', () => tmdb.getLatestMovies('telugu'));
});

console.log('🕒 Scheduler initialized. 4 daily broadcasts active.');

const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const { processMessage } = require('./nlp_engine');
const tmdb = require('./mock_tmdb'); // 🍿 Using Mock Data for Demo
const wa = require('./whatsapp_service');
const db = require('./db_service');

// Initialize Scheduler
require('./scheduler');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "popcorn_scale_verify";

// ─────────────────────────────────────────────────────────────
// 🔗 WEBHOOK VERIFICATION (Meta Requirement)
// ─────────────────────────────────────────────────────────────
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook Verified Successfully!');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// ─────────────────────────────────────────────────────────────
// 📩 INCOMING MESSAGES
// ─────────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        const entry = body.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const message = value?.messages?.[0];

        if (message && message.type === 'text') {
            const sender = message.from;
            const text = message.text.body;

            console.log(`📩 New Message from ${sender}: "${text}"`);
            
            // 0. Register/Update User in DB
            await db.registerUser(sender);

            // 1. Process NLP Intent
            const result = await processMessage(text);
            console.log(`🤖 Intent Identified: ${result.intent} (${(result.score * 100).toFixed(1)}%)`);

            // 2. Handle Action Based on Intent
            try {
                await handleBotAction(sender, result);
            } catch (err) {
                console.error('❌ Error handling action:', err.message);
                await wa.sendText(sender, "Oops! Something went wrong while fetching that movie for you. 🍿");
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

// ─────────────────────────────────────────────────────────────
// 🤖 BOT ACTION HANDLER
// ─────────────────────────────────────────────────────────────
async function handleBotAction(sender, result) {
    switch (result.intent) {
        case 'movie.latest':
        case 'movie.latest.telugu':
            const lang = result.intent.includes('telugu') ? 'telugu' : 'en';
            const latest = await tmdb.getLatestMovies(lang);
            let latestMsg = `🎬 *LATEST ${lang === 'telugu' ? 'TELUGU ' : ''}RELEASES*\n\n`;
            for (let m of latest) {
                const ott = await tmdb.getWatchProviders(m.id);
                latestMsg += `⭐ *${m.title}*\n📅 ${m.release_date}\n📺 ${ott}\n\n`;
            }
            await wa.sendText(sender, latestMsg);
            break;

        case 'movie.trending':
            const trending = await tmdb.getTrending();
            let trendingMsg = `🔥 *TRENDING WORLDWIDE*\n\n`;
            trending.forEach((m, i) => {
                trendingMsg += `${i + 1}. *${m.title}* (${m.vote_average.toFixed(1)} ⭐)\n`;
            });
            await wa.sendText(sender, trendingMsg);
            break;

        default:
            await wa.sendText(sender, "Hello! 🍿 I'm the Popcorn Scale Bot. Try asking about *'latest movies'* or *'what is trending'*!");
    }
}

app.listen(PORT, () => {
    console.log(`🚀 Popcorn Scale Conversational Engine Running on Port ${PORT}`);
    console.log(`🔗 Local Webhook URL: http://localhost:${PORT}/webhook`);
});

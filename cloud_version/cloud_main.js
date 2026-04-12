const { getCloudClient } = require('./cloud_auth');
const { runTrailers } = require('./cloud_trailers');
const { runSentinel } = require('./cloud_sentinel');
const { runWeekly } = require('./cloud_weekly');
const { runPicks } = require('./cloud_picks');
const qrcode = require('qrcode-terminal');

const CLIENT_ID = 'popcorn-final-v1';

function log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] 🚀 [MAIN-CONTROLLER] ${msg}`);
}

// 🛡️ [GLITCH PROTECTOR] Ignore minor Chromium cleanup errors on shutdown
process.on('uncaughtException', (err) => {
    if (err.code === 'ENOENT') {
        // Suppress harmless file-not-found errors during browser cleanup
        return;
    }
    log(`❌ Uncaught Exception: ${err.message}`);
    process.exit(1);
});

(async () => {
    log('🎬 Starting Popcorn Bot (RemoteAuth Mode)...');
    
    const { client, mongoose } = await getCloudClient(CLIENT_ID);

    client.on('qr', (qr) => {
        log('📲 SCAN THIS QR CODE (Session will be saved to cloud automatically):');
        qrcode.generate(qr, { small: true });
    });

    client.on('remote_session_saved', () => {
        log('💾 Session successfully synced to MongoDB!');
    });

    client.on('authenticated', () => {
        log('🛡️  AUTHENTICATED! Session is active.');
    });

    client.on('auth_failure', (msg) => {
        log(`❌ AUTHENTICATION FAILURE: ${msg}`);
    });

    client.on('ready', async () => {
        log('✅ WhatsApp Connection Ready! Starting all tasks...');

        try {
            // 1. Trailers & Sentinel
            await runTrailers(client);
            await new Promise(r => setTimeout(r, 5000));
            
            await runSentinel(client);
            await new Promise(r => setTimeout(r, 5000));
            
            // 2. Weekly Releases & Picks (Monday or Manual trigger)
            const isMonday = new Date().getDay() === 1;
            const isManual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';

            if (isMonday || isManual) {
                log('🗓️ Weekly run detected! Executing Weekly + Picks tasks...');
                await runWeekly(client);
                await new Promise(r => setTimeout(r, 5000));
                await runPicks(client);
            }
            
            log('🎉 ALL TASKS COMPLETED SUCCESSFULLY!');
        } catch (e) {
            log(`❌ Task Error: ${e.message}`);
        }

        // RemoteAuth handles session saving automatically.
        // Give it a moment to complete the final background sync.
        log('⏳ Waiting for final session sync...');
        await new Promise(r => setTimeout(r, 15000));

        log('🏁 Shutting down...');
        await client.destroy();
        await mongoose.disconnect();
        process.exit(0);
    });

    log('🛠️ Initializing Client...');
    client.initialize().catch(err => {
        log(`❌ Fatal Startup Error: ${err.message}`);
        process.exit(1);
    });
})();

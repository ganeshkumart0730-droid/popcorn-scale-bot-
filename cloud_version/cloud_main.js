const { getCloudClient, saveSession } = require('./cloud_auth');
const { runTrailers } = require('./cloud_trailers');
const { runSentinel } = require('./cloud_sentinel');
const { runWeekly } = require('./cloud_weekly');
const { runPicks } = require('./cloud_picks');
const qrcode = require('qrcode-terminal');

const CLIENT_ID = 'popcorn-final-v1';

function log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] 🚀 [MAIN-CONTROLLER] ${msg}`);
}

// 🛡️ [GLITCH PROTECTOR] Ignore minor cleanup errors
process.on('uncaughtException', (err) => {
    if (err.code === 'ENOENT' && err.path && err.path.includes('.wwebjs_auth') && err.path.endsWith('.zip')) {
        log('🏁 Ignored minor library cleanup error.');
    } else {
        log(`❌ Uncaught Exception: ${err.message}`);
        process.exit(1);
    }
});

(async () => {
    log('🎬 Starting Consolidated Popcorn Bot (Manual Mode)...');
    
    // getCloudClient now handles the "Download and Extract" automatically
    const { client, mongoose } = await getCloudClient(CLIENT_ID);

    client.on('qr', (qr) => {
        log('📲 SCAN THIS QR CODE (MANUAL PERSISTENCE ENABLED):');
        qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => {
        log('🛡️  AUTHENTICATED! Session files restored successfully.');
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
            
            // 2. Weekly Releases & Picks
            const isMonday = new Date().getDay() === 1;
            const isManual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';

            if (isMonday || isManual) {
                log('🗓️ Run detected! Executing weekly tasks...');
                await runWeekly(client);
                await new Promise(r => setTimeout(r, 5000));
                await runPicks(client);
            }
            
            log('🎉 ALL TASKS COMPLETED SUCCESSFULLY!');
        } catch (e) {
            log(`❌ Fatal Error during task execution: ${e.message}`);
        }

        // 🛡️ [MANUAL BACKUP] Force a zip and upload of the updated session
        log('📤 Backing up session files to MongoDB Atlas...');
        try {
            await saveSession(CLIENT_ID);
            log('✅ CLOUD BACKUP COMPLETE. Future runs will be autonomous.');
        } catch (err) {
            log(`❌ Cloud Backup Failed: ${err.message}`);
        }

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

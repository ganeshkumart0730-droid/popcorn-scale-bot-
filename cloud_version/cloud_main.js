const { getCloudClient } = require('./cloud_auth');
const { runTrailers } = require('./cloud_trailers');
const { runSentinel } = require('./cloud_sentinel');
const { runWeekly } = require('./cloud_weekly');
const { runPicks } = require('./cloud_picks');
const qrcode = require('qrcode-terminal');

function log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] 🚀 [MAIN-CONTROLLER] ${msg}`);
}

(async () => {
    log('🎬 Starting Consolidated Popcorn Bot...');
    const { client, mongoose } = await getCloudClient();

    let isNewSession = false;

    client.on('qr', (qr) => {
        isNewSession = true;
        log('📲 SCAN THIS QR CODE IN YOUR GITHUB LOGS (ONE SCAN COVERS ALL BOTS):');
        qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => {
        log('🛡️  AUTHENTICATED! Shared session loaded from cloud.');
    });

    client.on('auth_failure', (msg) => {
        log(`❌ AUTHENTICATION FAILURE: ${msg}`);
    });

    client.on('remote_session_saved', () => {
        log('💾 Session successfully synced to MongoDB Atlas!');
        if (isNewSession) log('✅ SETUP COMPLETE. You won\'t need to scan again for any of the bots.');
    });

    client.on('ready', async () => {
        log('✅ WhatsApp Connection Ready! Starting all tasks...');

        try {
            // 1. Trailers & Sentinel (Run Every Time)
            await runTrailers(client);
            await new Promise(r => setTimeout(r, 5000));
            
            await runSentinel(client);
            await new Promise(r => setTimeout(r, 5000));
            
            // 2. Weekly Releases & Picks (Only if Monday or Manually triggered)
            const isMonday = new Date().getDay() === 1; // 1 = Monday
            const isManual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';

            if (isMonday || isManual) {
                log('🗓️ Monday detected! Running weekly tasks...');
                await runWeekly(client);
                await new Promise(r => setTimeout(r, 5000));
                await runPicks(client);
            } else {
                log('⏭️ Skipping weekly tasks (only Monday).');
            }
            
            log('🎉 ALL TASKS COMPLETED SUCCESSFULLY!');
        } catch (e) {
            log(`❌ Fatal Error during task execution: ${e.message}`);
        }

        if (isNewSession) {
            log('⏳ New session detected! Waiting 45s for full cloud synchronization...');
            await new Promise(r => setTimeout(r, 45000));
        }

        log('🏁 Closing connection and shutting down...');
        await client.destroy();
        await mongoose.disconnect();
        process.exit(0);
    });

    log('🛠️ Initializing Unified Client...');
    client.initialize().catch(err => {
        log(`❌ Fatal Startup Error: ${err.message}`);
        process.exit(1);
    });
})();

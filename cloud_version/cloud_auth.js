const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');

/**
 * 🔐 Cloud Auth Manager
 * Connects to MongoDB Atlas and returns a WhatsApp Client with RemoteAuth.
 */
async function getCloudClient(clientId) {
    if (!process.env.MONGODB_URI) {
        throw new Error('❌ MONGODB_URI is not defined in environment variables.');
    }

    console.log(`🔌 [${clientId}] Connecting to MongoDB Atlas...`);
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 15000, // Timeout after 15s instead of 30s
        });
        console.log(`✅ [${clientId}] MongoDB Connected!`);
    } catch (err) {
        console.error(`❌ [${clientId}] MongoDB Connection Error:`, err.message);
        if (err.message.includes('Server selection timed out')) {
            console.error('👉 TIP: Check your MongoDB Atlas "Network Access" settings. You MUST add "0.0.0.0/0" (Allow from Anywhere) to let GitHub connect.');
        }
        process.exit(1);
    }
    
    const store = new MongoStore({ mongoose: mongoose });
    
    // 🧹 Clean up local session folder to avoid conflicts in cloud environments
    const sessionPath = path.join(process.cwd(), '.wwebjs_auth');
    if (fs.existsSync(sessionPath)) {
        console.log(`🧹 [${clientId}] Cleaning up local session cache...`);
        try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (e) {}
    }

    const client = new Client({
        authStrategy: new RemoteAuth({
            clientId: clientId, 
            store: store,
            backupSyncIntervalMs: 300000 
        }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    return { client, mongoose };
}

module.exports = { getCloudClient };

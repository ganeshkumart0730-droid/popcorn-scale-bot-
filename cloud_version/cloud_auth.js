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
    await mongoose.connect(process.env.MONGODB_URI);
    
    const store = new MongoStore({ mongoose: mongoose });
    
    const client = new Client({
        authStrategy: new RemoteAuth({
            clientId: clientId, // Unique ID for each bot's session
            store: store,
            backupSyncIntervalMs: 300000 // Backup every 5 mins
        }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    return { client, mongoose };
}

module.exports = { getCloudClient };

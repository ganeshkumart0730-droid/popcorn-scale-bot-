const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

/**
 * 🔐 Cloud Auth Manager
 * Connects to MongoDB Atlas and returns a WhatsApp Client with RemoteAuth.
 */
async function getCloudClient(clientId = 'popcorn-stable-v1') {
    if (!process.env.MONGODB_URI) {
        throw new Error('❌ MONGODB_URI is not defined in environment variables.');
    }

    if (mongoose.connection.readyState === 0) {
        console.log(`🔌 [${clientId}] Connecting to MongoDB Atlas...`);
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(`✅ [${clientId}] MongoDB Connected!`);
    }

    const store = new MongoStore({ 
        mongoose: mongoose,
        collection: 'whatsapp_sessions' 
    });
    
    // 🛡️ [IMPORTANT] REMOVED the manual cache deletion. 
    // We must let RemoteAuth manage the .wwebjs_auth folder so it can correctly 
    // download and use the session from MongoDB Atlas.

    const client = new Client({
        authStrategy: new RemoteAuth({
            clientId: clientId, 
            store: store,
            backupSyncIntervalMs: 60000 // Fast sync (every minute)
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });

    return { client, mongoose };
}

module.exports = { getCloudClient };

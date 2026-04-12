const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('@wwebjs/mongo');
const mongoose = require('mongoose');

/**
 * 🔐 Official MongoDB RemoteAuth Client Factory
 * Uses the battle-tested @wwebjs/mongo library.
 * No manual zip/unzip. No lock files. No size limits.
 */
async function getCloudClient(clientId = 'popcorn-final-v1') {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI environment variable is not set!');
    }

    // 1. Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ [${clientId}] MongoDB connected.`);

    // 2. Initialise the official MongoStore
    const store = new MongoStore({ mongoose: mongoose });

    // 3. Build the client with RemoteAuth
    const client = new Client({
        authStrategy: new RemoteAuth({
            clientId: clientId,
            store: store,
            backupSyncIntervalMs: 300000  // Sync every 5 min while running
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

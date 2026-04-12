const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

/**
 * 🔐 Cloud Auth Manager
 * Connects to MongoDB Atlas and returns a WhatsApp Client with RemoteAuth.
 */
async function getCloudClient(clientId = 'popcorn-final-v1') {
    if (!process.env.MONGODB_URI) {
        throw new Error('❌ MONGODB_URI is not defined in environment variables.');
    }

    // 🛡️ Ensure steady connection
    if (mongoose.connection.readyState === 0) {
        console.log(`🔌 [${clientId}] Connecting to MongoDB Atlas...`);
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        console.log(`✅ [${clientId}] MongoDB Connected!`);
    }

    // Wait for the connection to be fully 'open' to avoid "collection of undefined" errors
    if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }

    const store = new MongoStore({ 
        mongoose: mongoose,
        collection: 'whatsapp_sessions' 
    });
    
    const client = new Client({
        authStrategy: new RemoteAuth({
            clientId: clientId, 
            store: store,
            backupSyncIntervalMs: 60000 
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

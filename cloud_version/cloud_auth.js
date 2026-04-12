const { Client, RemoteAuth } = require('whatsapp-web.js');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream/promises');

const BUCKET_NAME = 'whatsapp_remote_sessions';

/**
 * 🗄️ Custom MongoGridFSStore
 * Implements the RemoteAuth Store interface using MongoDB GridFS.
 * RemoteAuth handles ALL zip creation/extraction timing.
 * We just handle upload/download to the cloud — no size limits.
 */
class MongoGridFSStore {
    async sessionExists({ session }) {
        const db = mongoose.connection.db;
        const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
        const files = await bucket.find({ filename: `${session}.zip` }).toArray();
        return files.length > 0;
    }

    async save({ session }) {
        const db = mongoose.connection.db;
        const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });

        // RemoteAuth places the zip here before calling save()
        const zipPath = path.join('.wwebjs_temp', `${session}.zip`);

        if (!fs.existsSync(zipPath)) {
            throw new Error(`RemoteAuth zip not found at: ${zipPath}`);
        }

        // Delete old version first
        const existing = await bucket.find({ filename: `${session}.zip` }).toArray();
        for (const f of existing) await bucket.delete(f._id);

        // Stream directly into GridFS (no size limit)
        const uploadStream = bucket.openUploadStream(`${session}.zip`);
        const readStream = fs.createReadStream(zipPath);
        await pipeline(readStream, uploadStream);

        const stats = fs.statSync(zipPath);
        console.log(`☁️  Session "${session}" saved to GridFS (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    }

    async extract({ session, path: destPath }) {
        const db = mongoose.connection.db;
        const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });

        const files = await bucket.find({ filename: `${session}.zip` }).toArray();
        if (!files.length) {
            throw new Error(`No session found in GridFS for: "${session}"`);
        }

        fs.mkdirSync(path.dirname(destPath), { recursive: true });

        const downloadStream = bucket.openDownloadStreamByName(`${session}.zip`);
        const writeStream = fs.createWriteStream(destPath);
        await pipeline(downloadStream, writeStream);

        console.log(`📥 Session "${session}" downloaded from GridFS (${(files[0].length / 1024 / 1024).toFixed(2)} MB)`);
    }

    async delete({ session }) {
        const db = mongoose.connection.db;
        const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
        const files = await bucket.find({ filename: `${session}.zip` }).toArray();
        for (const f of files) await bucket.delete(f._id);
    }
}

/**
 * 🔐 Cloud Client Factory
 * Uses RemoteAuth + our custom MongoGridFSStore.
 * No external packages needed.
 */
async function getCloudClient(clientId = 'popcorn-final-v1') {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set!');

    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB connected.`);

    const store = new MongoGridFSStore();

    const client = new Client({
        authStrategy: new RemoteAuth({
            clientId: clientId,
            store: store,
            backupSyncIntervalMs: 300000  // Auto-sync every 5 min while running
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu'
            ]
        }
    });

    return { client, mongoose };
}

module.exports = { getCloudClient };

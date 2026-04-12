const { Client, LocalAuth } = require('whatsapp-web.js');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const archiver = require('archiver');

const SESSION_DIR = path.join(__dirname, '.wwebjs_auth');

/**
 * 📥 MANUALLY Restore session from MongoDB
 */
async function restoreSession(clientId) {
    if (!process.env.MONGODB_URI) return false;
    
    try {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI);
        }
        
        const db = mongoose.connection.db;
        const collection = db.collection('whatsapp_sessions');
        
        // RemoteAuth-popcorn-final-v1 -> This is how RemoteAuth usually saves it
        const sessionData = await collection.findOne({ _id: `session-${clientId}` });
        
        if (sessionData && sessionData.data) {
            console.log(`📥 [${clientId}] Found cloud session. Restoring...`);
            
            const zipPath = path.join(__dirname, 'session.zip');
            fs.writeFileSync(zipPath, sessionData.data.buffer);
            
            const zip = new AdmZip(zipPath);
            const extractPath = path.join(SESSION_DIR, `session-${clientId}`);
            
            if (!fs.existsSync(extractPath)) fs.mkdirSync(extractPath, { recursive: true });
            zip.extractAllTo(extractPath, true);
            
            fs.unlinkSync(zipPath);
            console.log(`✅ [${clientId}] Session extracted and ready!`);
            return true;
        }
        
        console.log(`ℹ️ [${clientId}] No cloud session found. QR code will be needed.`);
        return false;
    } catch (err) {
        console.error(`⚠️ [${clientId}] Restore failed:`, err.message);
        return false;
    }
}

/**
 * 📤 MANUALLY Save session to MongoDB
 */
async function saveSession(clientId) {
    if (!process.env.MONGODB_URI) return;
    
    const sourceDir = path.join(SESSION_DIR, `session-${clientId}`);
    if (!fs.existsSync(sourceDir)) {
        console.log(`⚠️ [${clientId}] Nothing to save (folder missing).`);
        return;
    }

    return new Promise((resolve, reject) => {
        const zipPath = path.join(__dirname, 'save.zip');
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', async () => {
            try {
                console.log(`📤 [${clientId}] Zipping complete. Uploading to MongoDB...`);
                const buffer = fs.readFileSync(zipPath);
                
                const db = mongoose.connection.db;
                const collection = db.collection('whatsapp_sessions');
                
                await collection.updateOne(
                    { _id: `session-${clientId}` },
                    { $set: { _id: `session-${clientId}`, clientId: clientId, data: buffer, updatedAt: new Date() } },
                    { upsert: true }
                );
                
                console.log(`✅ [${clientId}] Cloud session updated!`);
                fs.unlinkSync(zipPath);
                resolve();
            } catch (err) {
                console.error(`❌ [${clientId}] Upload failed:`, err.message);
                reject(err);
            }
        });

        archive.on('error', (err) => reject(err));
        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

/**
 * 🔐 Unified Client Factory (uses LocalAuth + Manual Restore)
 */
async function getCloudClient(clientId = 'popcorn-final-v1') {
    // 1. Manually restore before doing anything
    await restoreSession(clientId);

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: clientId,
            dataPath: SESSION_DIR
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

module.exports = { getCloudClient, saveSession };

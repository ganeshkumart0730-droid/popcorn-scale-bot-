const { Client, LocalAuth } = require('whatsapp-web.js');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const archiver = require('archiver');
const { pipeline } = require('stream/promises');

const SESSION_DIR = path.join(__dirname, '.wwebjs_auth');
const BUCKET_NAME = 'whatsapp_sessions_files';

/**
 * 📥 [GridFS] Restore session from MongoDB
 */
async function restoreSession(clientId) {
    if (!process.env.MONGODB_URI) return false;
    
    try {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI);
        }
        
        const db = mongoose.connection.db;
        const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
        
        const fileName = `session-${clientId}.zip`;
        const files = await bucket.find({ filename: fileName }).toArray();
        
        if (files.length > 0) {
            console.log(`📥 [${clientId}] Found GridFS session (${(files[0].length / 1024 / 1024).toFixed(2)}MB). Restoring...`);
            
            const zipPath = path.join(__dirname, 'session.zip');
            const downloadStream = bucket.openDownloadStreamByName(fileName);
            const writeStream = fs.createWriteStream(zipPath);
            
            await pipeline(downloadStream, writeStream);
            
            const zip = new AdmZip(zipPath);
            const extractPath = path.join(SESSION_DIR, `session-${clientId}`);
            
            if (!fs.existsSync(extractPath)) fs.mkdirSync(extractPath, { recursive: true });
            zip.extractAllTo(extractPath, true);
            
            // 🛡️ [LOCK BREAKER] Remove Chromium lock files to prevent startup errors
            const lockPath = path.join(extractPath, 'Default', 'SingletonLock');
            if (fs.existsSync(lockPath)) {
                try { fs.unlinkSync(lockPath); } catch (e) { console.log('⚠️ Could not remove lock file'); }
            }
            
            fs.unlinkSync(zipPath);
            console.log(`✅ [${clientId}] Session extracted and ready!`);
            return true;
        }
        
        console.log(`ℹ️ [${clientId}] No GridFS session found. QR code will be needed.`);
        return false;
    } catch (err) {
        console.error(`⚠️ [${clientId}] Restore failed:`, err.message);
        return false;
    }
}

/**
 * 📤 [GridFS] Save session to MongoDB (Handles files > 16MB)
 */
async function saveSession(clientId) {
    if (!process.env.MONGODB_URI) return;
    
    const sourceDir = path.join(SESSION_DIR, `session-${clientId}`);
    if (!fs.existsSync(sourceDir)) {
        console.log(`⚠️ [${clientId}] Nothing to save (folder missing).`);
        return;
    }

    const zipPath = path.join(__dirname, 'save.zip');
    const fileName = `session-${clientId}.zip`;

    // 1. Zip the folder
    await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);
        
        // Exclude heavy/unnecessary folders
        archive.glob('**/*', {
            cwd: sourceDir,
            ignore: [
                '**/Cache/**', '**/Code Cache/**', '**/GPUCache/**',
                '**/Service Worker/**', '**/Media/**', '**/Storage/ext/*/def/GPUCache/**',
                '**/*.log', '**/*.tmp', '**/crash_reporter.cfg'
            ]
        });
        archive.finalize();
    });

    // 2. Upload to GridFS
    try {
        const db = mongoose.connection.db;
        const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
        
        // Cleanup old files
        const oldFiles = await bucket.find({ filename: fileName }).toArray();
        for (const file of oldFiles) {
            await bucket.delete(file._id);
        }

        console.log(`📤 [${clientId}] Uploading to GridFS...`);
        const uploadStream = bucket.openUploadStream(fileName);
        const readStream = fs.createReadStream(zipPath);
        
        await pipeline(readStream, uploadStream);
        
        const stats = fs.statSync(zipPath);
        console.log(`✅ [${clientId}] GridFS backup complete! Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    } catch (err) {
        console.error(`❌ [${clientId}] GridFS Upload failed:`, err.message);
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        throw err;
    }
}

/**
 * 🔐 Unified Client Factory (uses LocalAuth + Manual GridFS Restore)
 */
async function getCloudClient(clientId = 'popcorn-final-v1') {
    // 1. Manually restore from GridFS before initialization
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

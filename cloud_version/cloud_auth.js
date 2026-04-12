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
            
            // 🛡️ Integrity Check: Verify zip header
            try {
                const zip = new AdmZip(zipPath);
                const extractPath = path.join(SESSION_DIR, `session-${clientId}`);
                
                if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
                zip.extractAllTo(SESSION_DIR, true);
                
                // 🛡️ [DEEP LOCK BREAKER] Remove all possible Chromium lock files
                const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'Default/SingletonLock'];
                lockFiles.forEach(file => {
                    const fullPath = path.join(extractPath, file);
                    if (fs.existsSync(fullPath)) {
                        try { fs.unlinkSync(fullPath); } catch (e) {}
                    }
                });

                fs.unlinkSync(zipPath);
                console.log(`✅ [${clientId}] Session verified and extracted!`);
                return true;
            } catch (zipErr) {
                console.error(`❌ [${clientId}] Session zip is corrupted: ${zipErr.message}`);
                if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
                return false;
            }
        }
        
        console.log(`ℹ️ [${clientId}] No GridFS session found.`);
        return false;
    } catch (err) {
        console.error(`⚠️ [${clientId}] Restore failed:`, err.message);
        return false;
    }
}

/**
 * 📤 [IRON-CLAD] Save session DIRECTLY to GridFS (No intermediate zip file)
 */
async function saveSession(clientId) {
    if (!process.env.MONGODB_URI) return;
    
    const sourceDir = path.join(SESSION_DIR, `session-${clientId}`);
    if (!fs.existsSync(sourceDir)) {
        console.log(`⚠️ [${clientId}] Nothing to save.`);
        return;
    }

    const db = mongoose.connection.db;
    const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
    const fileName = `session-${clientId}.zip`;

    console.log(`📤 [${clientId}] Streaming session directly to Cloud...`);

    try {
        // 1. Cleanup old files first
        const oldFiles = await bucket.find({ filename: fileName }).toArray();
        for (const file of oldFiles) {
            await bucket.delete(file._id);
        }

        // 2. Setup Direct Upload Stream
        const uploadStream = bucket.openUploadStream(fileName);
        const archive = archiver('zip', { zlib: { level: 9 } });

        // 3. Coordinate streams
        const archiveFinished = new Promise((resolve, reject) => {
            uploadStream.on('finish', resolve);
            uploadStream.on('error', reject);
            archive.on('error', reject);
        });

        archive.pipe(uploadStream);

        // 🛡️ [ZIP CONFIG] Keep the root folder structure intact
        // Exclude huge/unnecessary data
        archive.directory(sourceDir, `session-${clientId}`, (file) => {
            const ignoreList = [
                'Cache', 'Code Cache', 'GPUCache', 'Service Worker', 'Media', 
                'Storage/ext', '.log', '.tmp', 'crash_reporter.cfg'
            ];
            if (ignoreList.some(pattern => file.name.includes(pattern))) return false;
            return file;
        });

        await archive.finalize();
        await archiveFinished;

        console.log(`✅ [${clientId}] Cloud stream confirmed! Session is safe.`);
    } catch (err) {
        console.error(`❌ [${clientId}] Stream failed:`, err.message);
        throw err;
    }
}

/**
 * 🔐 Unified Client Factory
 */
async function getCloudClient(clientId = 'popcorn-final-v1') {
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

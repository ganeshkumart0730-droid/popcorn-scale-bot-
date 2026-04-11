const fs = require('fs');
const path = require('path');
const https = require('https');

const GITHUB_TOKEN = 'YOUR_GITHUB_TOKEN';
const REPO_OWNER = 'ganeshkumart0730-droid';
const REPO_NAME = 'popcorn-scale-bot-';

async function httpRequest(url, options = {}, body = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch(e) { resolve({ ok: false, error: 'Invalid JSON' }); }
            });
        });
        req.on('error', (e) => reject(e));
        if (body) {
            const content = typeof body === 'string' ? body : JSON.stringify(body);
            req.write(content);
        }
        req.end();
    });
}

async function run() {
    console.log('🚀 Final Fix: Adding Permissions to Workflow...');

    // 1. Get SHA
    const existing = await httpRequest(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/.github/workflows/scrape.yml`, {
        headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Uploader' }
    });
    
    if (!existing.sha) {
        console.error('❌ Could not find existing file SHA. Response:', existing);
        return;
    }
    console.log(`🔍 Found SHA: ${existing.sha}`);

    // 2. Read new content
    const workflowPath = path.join(__dirname, '.github/workflows/scrape.yml');
    const content = fs.readFileSync(workflowPath, 'utf8');
    const base64Content = Buffer.from(content).toString('base64');

    // 3. Update File
    const update = await httpRequest(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/.github/workflows/scrape.yml`, {
        method: 'PUT',
        headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Uploader', 'Content-Type': 'application/json' }
    }, {
        message: 'fix: add write permissions for logs',
        content: base64Content,
        sha: existing.sha,
        branch: 'main'
    });

    if (update.content) {
        console.log('✅ Workflow updated successfully!');
        
        // 4. Trigger Trigger
        await httpRequest(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/scrape.yml/dispatches`, {
            method: 'POST',
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Uploader', 'Content-Type': 'application/json' }
        }, {
            ref: 'main'
        });
        console.log('📡 Run triggered!');
    } else {
        console.error('❌ Failed update:', update);
    }
}

run();

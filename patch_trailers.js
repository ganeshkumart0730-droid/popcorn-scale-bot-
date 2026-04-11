const https = require('https');
const TOKEN = 'YOUR_GITHUB_TOKEN';
const REPO = 'ganeshkumart0730-droid/popcorn-scale-bot-';

function get(path) {
    return new Promise((resolve) => {
        https.get({ hostname: 'api.github.com', path, headers: { 'Authorization': 'token ' + TOKEN, 'User-Agent': 'Checker' } }, (res) => {
            let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
        });
    });
}

function put(path, body) {
    return new Promise((resolve) => {
        const payload = JSON.stringify(body);
        const req = https.request({ hostname: 'api.github.com', path, method: 'PUT', headers: { 'Authorization': 'token ' + TOKEN, 'User-Agent': 'Checker', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
            let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
        });
        req.write(payload); req.end();
    });
}

(async () => {
    const f = await get('/repos/' + REPO + '/contents/extract_trailers.js');
    let content = Buffer.from(f.content, 'base64').toString('utf8');
    
    // Fix require
    content = content.split("require('puppeteer')").join("require('puppeteer-core')");
    
    // Add executablePath if not present
    if (!content.includes('executablePath')) {
        content = content.split("headless: 'new',\n        args:").join(
            "headless: 'new',\n        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',\n        args:"
        );
    }
    
    const r = await put('/repos/' + REPO + '/contents/extract_trailers.js', {
        message: 'fix: puppeteer-core + system chrome for trailers',
        content: Buffer.from(content).toString('base64'),
        sha: f.sha
    });
    
    if (r.content) console.log('OK trailers updated!');
    else console.error('FAIL trailers:', r.message);
})();

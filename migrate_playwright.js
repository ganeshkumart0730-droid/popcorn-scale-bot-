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
    // 1. Update package.json to use playwright
    const pkgFile = await get('/repos/' + REPO + '/contents/package.json');
    const newPkg = JSON.stringify({
        name: 'nokio-trailer-scraper',
        version: '1.0.0',
        description: 'Automated movie trailer scraper for Popcorn Scale Channel',
        main: 'extract_trailers.js',
        dependencies: {
            'playwright-chromium': '1.43.1'
        },
        scripts: { start: 'node extract_trailers.js' }
    }, null, 2);
    const r0 = await put('/repos/' + REPO + '/contents/package.json', {
        message: 'fix: switch to playwright-chromium for reliable CI',
        content: Buffer.from(newPkg).toString('base64'),
        sha: pkgFile.sha
    });
    console.log(r0.content ? 'OK package.json' : 'FAIL package.json: ' + r0.message);

    // 2. Update extract_trailers.js
    const trailerFile = await get('/repos/' + REPO + '/contents/extract_trailers.js');
    let trailerContent = Buffer.from(trailerFile.content, 'base64').toString('utf8');
    // Switch from puppeteer-core to playwright  
    trailerContent = trailerContent.split("require('puppeteer-core')").join("require('playwright-chromium').chromium");
    trailerContent = trailerContent.split("require('puppeteer')").join("require('playwright-chromium').chromium");
    // playwright uses launch() same way but headless syntax is different
    trailerContent = trailerContent.split("headless: 'new'").join("headless: true");
    // Remove executablePath (playwright handles this automatically)
    trailerContent = trailerContent.split(",\n        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome'").join('');
    // playwright uses page.goto() and $ same as puppeteer - compatible!
    const r1 = await put('/repos/' + REPO + '/contents/extract_trailers.js', {
        message: 'fix: migrate from puppeteer to playwright-chromium',
        content: Buffer.from(trailerContent).toString('base64'),
        sha: trailerFile.sha
    });
    console.log(r1.content ? 'OK extract_trailers.js' : 'FAIL trailers: ' + r1.message);

    // 3. Update extract_weekly_releases.js  
    const weeklyFile = await get('/repos/' + REPO + '/contents/extract_weekly_releases.js');
    let weeklyContent = Buffer.from(weeklyFile.content, 'base64').toString('utf8');
    weeklyContent = weeklyContent.split("require('puppeteer-core')").join("require('playwright-chromium').chromium");
    weeklyContent = weeklyContent.split("require('puppeteer')").join("require('playwright-chromium').chromium");
    weeklyContent = weeklyContent.split("headless: 'new'").join("headless: true");
    weeklyContent = weeklyContent.split(",\n        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome'").join('');
    const r2 = await put('/repos/' + REPO + '/contents/extract_weekly_releases.js', {
        message: 'fix: migrate from puppeteer to playwright-chromium',
        content: Buffer.from(weeklyContent).toString('base64'),
        sha: weeklyFile.sha
    });
    console.log(r2.content ? 'OK extract_weekly_releases.js' : 'FAIL weekly: ' + r2.message);

    // 4. Trigger new run
    const req2 = https.request({ hostname: 'api.github.com', path: '/repos/' + REPO + '/actions/workflows/scrape.yml/dispatches', method: 'POST', headers: { 'Authorization': 'token ' + TOKEN, 'User-Agent': 'Checker', 'Content-Type': 'application/json' } }, (res) => {
        res.on('data', () => {}); res.on('end', () => console.log('Run triggered! Status:', res.statusCode));
    });
    req2.write(JSON.stringify({ ref: 'main' })); req2.end();
})();

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
    const [trailerFile, weeklyFile] = await Promise.all([
        get('/repos/' + REPO + '/contents/extract_trailers.js'),
        get('/repos/' + REPO + '/contents/extract_weekly_releases.js')
    ]);

    let trailerContent = Buffer.from(trailerFile.content, 'base64').toString('utf8');
    let weeklyContent = Buffer.from(weeklyFile.content, 'base64').toString('utf8');

    // Switch from puppeteer to puppeteer-core
    trailerContent = trailerContent.replace("require('puppeteer')", "require('puppeteer-core')");
    weeklyContent = weeklyContent.replace("require('puppeteer')", "require('puppeteer-core')");

    // Add executablePath to puppeteer.launch() - GitHub Actions has Chrome at /usr/bin/google-chrome
    const oldTrailerLaunch = "puppeteer.launch({ \n        headless: 'new',\n        args: ['--no-sandbox', '--disable-setuid-sandbox']\n    })";
    const newTrailerLaunch = "puppeteer.launch({ \n        headless: 'new',\n        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',\n        args: ['--no-sandbox', '--disable-setuid-sandbox']\n    })";
    trailerContent = trailerContent.replace(oldTrailerLaunch, newTrailerLaunch);

    const oldWeeklyLaunch = "puppeteer.launch({ \n        headless: 'new',\n        args: ['--no-sandbox', '--disable-setuid-sandbox']\n    })";
    const newWeeklyLaunch = "puppeteer.launch({ \n        headless: 'new',\n        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',\n        args: ['--no-sandbox', '--disable-setuid-sandbox']\n    })";
    weeklyContent = weeklyContent.replace(oldWeeklyLaunch, newWeeklyLaunch);

    const [r1, r2] = await Promise.all([
        put('/repos/' + REPO + '/contents/extract_trailers.js', {
            message: 'fix: puppeteer-core + system chrome',
            content: Buffer.from(trailerContent).toString('base64'),
            sha: trailerFile.sha
        }),
        put('/repos/' + REPO + '/contents/extract_weekly_releases.js', {
            message: 'fix: puppeteer-core + system chrome',
            content: Buffer.from(weeklyContent).toString('base64'),
            sha: weeklyFile.sha
        })
    ]);

    if (r1.content) console.log('✅ extract_trailers.js updated!');
    else console.error('❌ trailers failed:', r1.message);

    if (r2.content) console.log('✅ extract_weekly_releases.js updated!');
    else console.error('❌ weekly failed:', r2.message);

    // Trigger new run
    const req2 = https.request({ hostname: 'api.github.com', path: '/repos/' + REPO + '/actions/workflows/scrape.yml/dispatches', method: 'POST', headers: { 'Authorization': 'token ' + TOKEN, 'User-Agent': 'Checker', 'Content-Type': 'application/json' } }, (res) => {
        res.on('data', () => {}); res.on('end', () => console.log('🚀 New run triggered! Status:', res.statusCode));
    });
    req2.write(JSON.stringify({ ref: 'main' })); req2.end();
})();

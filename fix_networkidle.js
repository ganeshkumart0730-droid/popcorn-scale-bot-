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

    // Fix: playwright uses 'networkidle' not 'networkidle2'
    trailerContent = trailerContent.split('networkidle2').join('networkidle');
    weeklyContent = weeklyContent.split('networkidle2').join('networkidle');

    const [r1, r2] = await Promise.all([
        put('/repos/' + REPO + '/contents/extract_trailers.js', {
            message: 'fix: use networkidle (playwright syntax)',
            content: Buffer.from(trailerContent).toString('base64'),
            sha: trailerFile.sha
        }),
        put('/repos/' + REPO + '/contents/extract_weekly_releases.js', {
            message: 'fix: use networkidle (playwright syntax)',
            content: Buffer.from(weeklyContent).toString('base64'),
            sha: weeklyFile.sha
        })
    ]);

    console.log(r1.content ? 'OK trailers' : 'FAIL trailers: ' + r1.message);
    console.log(r2.content ? 'OK weekly' : 'FAIL weekly: ' + r2.message);

    // Trigger run
    const req = https.request({ hostname: 'api.github.com', path: '/repos/' + REPO + '/actions/workflows/scrape.yml/dispatches', method: 'POST', headers: { 'Authorization': 'token ' + TOKEN, 'User-Agent': 'Checker', 'Content-Type': 'application/json' } }, (res) => {
        res.on('data', () => {}); res.on('end', () => console.log('Run triggered! Status:', res.statusCode));
    });
    req.write(JSON.stringify({ ref: 'main' })); req.end();
})();

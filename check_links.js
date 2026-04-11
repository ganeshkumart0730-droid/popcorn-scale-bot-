const { chromium, devices } = require('playwright-chromium');

(async () => {
    const b = await chromium.launch({ headless: false });
    const c = await b.newContext(devices['iPhone 12']);
    const p = await c.newPage();
    await p.goto('https://nokioapp.com/movie/samay-raina-still-alive-2026', { waitUntil: 'load' });
    await p.waitForTimeout(8000);

    const result = await p.evaluate(() => {
        // Check ALL images on the page for platform keywords
        const allImgs = Array.from(document.querySelectorAll('img')).map(i => ({ src: i.src, alt: i.alt || '' }));
        const platformImgs = allImgs.filter(i => {
            const s = (i.src + i.alt).toLowerCase();
            return s.includes('netflix') || s.includes('prime') || s.includes('hotstar') || s.includes('youtube') || s.includes('yt') || s.includes('zee5') || s.includes('sony') || s.includes('apple') || s.includes('jio') || s.includes('platform');
        });

        // Check ALL links for youtube
        const ytLinks = Array.from(document.querySelectorAll('a')).filter(a => a.href.includes('youtube')).map(a => a.href);
        
        // Check for any "Platform" related divs
        const platformDivs = Array.from(document.querySelectorAll('div')).filter(d => {
            const cls = d.className?.toString() || '';
            return cls.includes('latform') || cls.includes('Watch') || cls.includes('Stream');
        }).map(d => ({ class: d.className?.toString().substring(0, 80), text: d.innerText.substring(0, 100) }));

        // Full body search for "youtube"
        const bodyText = document.body.innerText.toLowerCase();
        const hasYouTube = bodyText.includes('youtube');

        return { platformImgs, ytLinks, platformDivs: platformDivs.slice(0, 10), hasYouTube };
    });
    console.log(JSON.stringify(result, null, 2));
    await b.close();
    process.exit(0);
})();

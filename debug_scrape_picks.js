const { chromium, devices } = require('playwright-chromium');

(async () => {
    console.log('=== DEEP DEBUG: What does the bot ACTUALLY see? ===\n');
    
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext(devices['iPhone 12']);
    const page = await context.newPage();

    // STEP 1: Go to homepage and get the pick links
    console.log('--- STEP 1: Homepage Picks ---');
    await page.goto('https://nokioapp.com/in?v=1', { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(6000);

    const picks = await page.evaluate(() => {
        const container = document.querySelector('[class*="PickOfTheWeek_content"]');
        if (!container) return { error: 'NO CONTAINER FOUND', allClasses: Array.from(document.querySelectorAll('*')).map(e => e.className).filter(c => c && typeof c === 'string' && c.includes('Pick')).slice(0, 20) };
        return Array.from(container.children).slice(0, 3).map((item, i) => ({
            rank: i + 1,
            title: item.querySelector('img')?.alt || 'NO ALT',
            href: item.querySelector('a')?.href || 'NO HREF',
            imgSrc: item.querySelector('img')?.src || 'NO IMG'
        }));
    });
    console.log('PICKS:', JSON.stringify(picks, null, 2));

    // STEP 2: Visit Thrash detail page (the one user has open)
    console.log('\n--- STEP 2: Visiting Thrash Detail Page ---');
    const thrashUrl = 'https://nokioapp.com/movie/thrash-2026';
    await page.goto(thrashUrl, { waitUntil: 'load', timeout: 60000 });
    console.log('Waiting 10 seconds for full hydration...');
    await page.waitForTimeout(10000);

    const thrashData = await page.evaluate(() => {
        const result = {};
        
        // A. What is the page title?
        result.h1 = document.querySelector('h1')?.innerText || 'NO H1';
        
        // B. ALL div class names that contain "Movie" or "Header" or "Meta"
        result.relevantClasses = Array.from(document.querySelectorAll('*'))
            .map(e => e.className)
            .filter(c => c && typeof c === 'string' && (c.includes('Movie') || c.includes('Header') || c.includes('Meta') || c.includes('Info') || c.includes('Synopsis') || c.includes('Score') || c.includes('Rating') || c.includes('Platform') || c.includes('Watch')))
            .filter((v, i, a) => a.indexOf(v) === i) // unique
            .slice(0, 30);
        
        // C. All text blocks > 30 chars (potential synopsis/metadata)
        result.allTextBlocks = Array.from(document.querySelectorAll('div, p, span'))
            .map(e => ({ tag: e.tagName, class: e.className?.toString().substring(0, 60) || '', text: e.innerText?.trim().substring(0, 200) || '' }))
            .filter(t => t.text.length > 30 && t.text.length < 500)
            .filter(t => !t.text.includes('Accept') && !t.text.includes('cookie'))
            .slice(0, 15);
        
        // D. All images with "netflix", "prime", "hotstar" etc in src
        result.platformImages = Array.from(document.querySelectorAll('img'))
            .map(i => i.src)
            .filter(s => s.toLowerCase().match(/netflix|prime|hotstar|jio|zee5|sony|apple/))
            .slice(0, 5);
        
        // E. Any IMDb or rating links
        result.ratingElements = Array.from(document.querySelectorAll('a[href*="imdb"], [class*="Imdb"], [class*="Rating"], [class*="Score"], [class*="rating"], [class*="score"]'))
            .map(e => ({ tag: e.tagName, class: e.className?.toString().substring(0, 60) || '', text: e.innerText?.trim().substring(0, 100) || '', href: e.href || '' }))
            .slice(0, 10);
        
        // F. Full body text (first 2000 chars for inspection)
        result.bodyTextPreview = document.body.innerText.substring(0, 2000);
        
        return result;
    });

    console.log('\n--- THRASH PAGE ANALYSIS ---');
    console.log('H1:', thrashData.h1);
    console.log('\nRELEVANT CLASSES:', JSON.stringify(thrashData.relevantClasses, null, 2));
    console.log('\nTEXT BLOCKS:', JSON.stringify(thrashData.allTextBlocks, null, 2));
    console.log('\nPLATFORM IMAGES:', JSON.stringify(thrashData.platformImages, null, 2));
    console.log('\nRATING ELEMENTS:', JSON.stringify(thrashData.ratingElements, null, 2));
    console.log('\n--- BODY TEXT PREVIEW ---');
    console.log(thrashData.bodyTextPreview);

    // STEP 3: Visit Thaai Kizhavi too
    console.log('\n\n--- STEP 3: Visiting Thaai Kizhavi Detail Page ---');
    await page.goto('https://nokioapp.com/movie/thaai-kizhavi-2026', { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(10000);

    const tkData = await page.evaluate(() => {
        return {
            h1: document.querySelector('h1')?.innerText || 'NO H1',
            relevantClasses: Array.from(document.querySelectorAll('*'))
                .map(e => e.className)
                .filter(c => c && typeof c === 'string' && (c.includes('Movie') || c.includes('Header') || c.includes('Meta') || c.includes('Info') || c.includes('Synopsis') || c.includes('Score') || c.includes('Rating') || c.includes('Platform') || c.includes('Watch')))
                .filter((v, i, a) => a.indexOf(v) === i)
                .slice(0, 30),
            textBlocks: Array.from(document.querySelectorAll('div, p, span'))
                .map(e => ({ tag: e.tagName, class: e.className?.toString().substring(0, 60) || '', text: e.innerText?.trim().substring(0, 200) || '' }))
                .filter(t => t.text.length > 30 && t.text.length < 500)
                .filter(t => !t.text.includes('Accept') && !t.text.includes('cookie'))
                .slice(0, 15),
            platformImages: Array.from(document.querySelectorAll('img'))
                .map(i => i.src)
                .filter(s => s.toLowerCase().match(/netflix|prime|hotstar|jio|zee5|sony|apple/))
                .slice(0, 5),
            ratingElements: Array.from(document.querySelectorAll('a[href*="imdb"], [class*="Imdb"], [class*="Rating"], [class*="Score"], [class*="rating"], [class*="score"]'))
                .map(e => ({ tag: e.tagName, class: e.className?.toString().substring(0, 60) || '', text: e.innerText?.trim().substring(0, 100) || '', href: e.href || '' }))
                .slice(0, 10),
            bodyTextPreview: document.body.innerText.substring(0, 2000)
        };
    });

    console.log('H1:', tkData.h1);
    console.log('\nRELEVANT CLASSES:', JSON.stringify(tkData.relevantClasses, null, 2));
    console.log('\nTEXT BLOCKS:', JSON.stringify(tkData.textBlocks, null, 2));
    console.log('\nPLATFORM IMAGES:', JSON.stringify(tkData.platformImages, null, 2));
    console.log('\nRATING ELEMENTS:', JSON.stringify(tkData.ratingElements, null, 2));
    console.log('\n--- BODY TEXT PREVIEW ---');
    console.log(tkData.bodyTextPreview);

    await browser.close();
    console.log('\n=== DEBUG COMPLETE ===');
    process.exit(0);
})();

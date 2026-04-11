const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const { exec } = require('child_process');

// ─────────────────────────────────────────────────────────────
// 🚀 POPCORN SCALE BROWSER RECONNECT
// ─────────────────────────────────────────────────────────────

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

console.log('--- 🛰️  INITIALIZING RECONNECT ENGINE ---');

client.on('qr', (qr) => {
    const html = `
    <html>
    <head>
        <title>Popcorn Scale - WhatsApp Reconnect</title>
        <style>
            body { background: #1a1a1a; color: white; font-family: sans-serif; text-align: center; padding-top: 50px; }
            .container { background: white; padding: 30px; display: inline-block; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            h1 { margin-bottom: 20px; color: #f39c12; }
            p { margin-bottom: 30px; opacity: 0.8; font-size: 1.1em; }
            #qrcode { margin: 0 auto; }
            #qrcode img { margin: 0 auto; }
        </style>
    </head>
    <body>
        <h1>🍿 POPCORN SCALE 🍿</h1>
        <p>Your session timed out. Please scan the code below to reconnect the bot.</p>
        <div class="container">
            <div id="qrcode"></div>
        </div>
        <p style="margin-top: 40px; color: #2ecc71;"><b>Bot will auto-connect once scanned!</b></p>

        <script src="https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs/qrcode.min.js"></script>
        <script>
            new QRCode(document.getElementById("qrcode"), {
                text: "${qr}",
                width: 300,
                height: 300
            });
        </script>
    </body>
    </html>
    `;

    fs.writeFileSync('qr_login.html', html);
    console.log('✅ QR CODE GENERATED!');
    console.log('🚀 OPENING QR IN YOUR BROWSER NOW...');
    
    // Open in browser
    exec('start qr_login.html');
});

client.on('ready', () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ RECONNECTED SUCCESSFULLY!');
    console.log('🔥 ALL SYSTEMS GO. YOU CAN CLOSE THIS WINDOW.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // We exit here so the user knows they are done. 
    // The actual bot runs via the scheduled tasks or other scripts.
    process.exit(0);
});

client.initialize().catch(err => {
    console.error('❌ Initialization Error:', err.message);
});

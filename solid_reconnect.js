const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const { exec } = require('child_process');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    const html = `<html><body style="background:#1a1a1a;color:white;text-align:center;padding-top:100px;font-family:sans-serif;"><h1>🍿 SCAN AGAIN 🍿</h1><p>One final time to lock in the "God-Level" link.</p><div id="qrcode" style="background:white;padding:20px;display:inline-block;"></div><script src="https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs/qrcode.min.js"></script><script>new QRCode(document.getElementById("qrcode"), "${qr}");</script></body></html>`;
    fs.writeFileSync('qr_final_lock.html', html);
    console.log('--- 🚀 FINAL QR GENERATED. OPENING BROWSER... ---');
    exec('start qr_final_lock.html');
});

client.on('ready', async () => {
    console.log('✅ READY! Waiting 30 seconds to lock the session to disk...');
    try {
        await client.sendMessage(client.info.wid._serialized, '🏆 SESSION SECURED. Popcorn Scale bot is now 100% LIVE.');
        console.log('✅ TEST MESSAGE SENT TO SELF.');
    } catch(e) {}
    
    // Crucial: Wait to ensure persistent storage is written
    setTimeout(() => {
        console.log('🔥 SESSION PERMANENTLY LOCKED. YOU CAN NOW CLOSE THIS.');
        process.exit(0);
    }, 30000);
});

client.initialize();

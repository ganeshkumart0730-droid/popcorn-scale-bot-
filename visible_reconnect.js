const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const { exec } = require('child_process');

console.log('--- 📺 STARTING VISIBLE DEBUG MODE ---');
console.log('🚀 A CHROME WINDOW SHOULD OPEN ON YOUR SCREEN MOMENTARILY...');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false, // THIS IS THE KEY: MAKE IT VISIBLE
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('👀 QR CODE DETECTED. PLEASE SCAN IT IN THE OPENED BROWSER OR TERMINAL.');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ READY! WATCH YOUR SCREEN - ATTEMPTING DELIVERY...');
    
    const TARGET_ID = '120363409136720699@g.us'; // Popcorn Scale Weekly Picks
    
    try {
        console.log(`📡 Targeting Group ID: ${TARGET_ID}`);
        const chat = await client.getChatById(TARGET_ID);
        console.log(`✅ Group Found: ${chat.name}`);
        
        const testMsg = '🛰️ VISIBLE DEBUG TEST: If you see this on your screen, the bot is truly sending.';
        const response = await client.sendMessage(TARGET_ID, testMsg);
        
        console.log(`🚀 MESSAGE SENT IN BROWSER STATE. ID: ${response.id._serialized}`);
        console.log('--- 🛑 CHECK YOUR PHONE/BROWSER NOW! 🛑 ---');
        console.log('I am keeping the browser open for 2 minutes so you can inspect it.');
        
        setTimeout(() => {
            console.log('🏁 Debug session finished. Closing...');
            process.exit(0);
        }, 120000);

    } catch (err) {
        console.error('❌ DEBUG DELIVERY FAILED:', err.message);
        process.exit(1);
    }
});

client.initialize().catch(err => {
    console.error('❌ CRITICAL INIT ERROR:', err.message);
});

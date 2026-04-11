const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false, 
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('\n\n👆 SCAN THIS QR CODE WITH YOUR WHATSAPP TO LINK THE BOT!');
});

client.on('ready', () => {
    console.log('✅ WHATSAPP BOT IS SUCCESSFULLY ENABLED AND READY!\nSession saved permanently! You can now safely hit Ctrl+C to close this terminal.');
    process.exit(0);
});

console.log('Booting WhatsApp Engine (give it ~15 seconds)...');
client.initialize();

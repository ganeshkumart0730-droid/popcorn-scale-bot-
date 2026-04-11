const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const TEST_GROUP_ID = "120363425759350259@g.us"; 

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('⚠️ QR CODE GENERATED - SESSION IS NOT AUTHENTICATED');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ Client is ready!');
    
    try {
        console.log(`Attempting to find chat: ${TEST_GROUP_ID}`);
        const chat = await client.getChatById(TEST_GROUP_ID);
        console.log(`Found chat: "${chat.name}"`);
        
        console.log('Sending test message...');
        const msg = await client.sendMessage(TEST_GROUP_ID, '🚨 DEBUG TEST: Is this bot reaching the group?');
        console.log('Message sent! ID:', msg.id._serialized);
        
        await client.destroy();
        process.exit(0);
    } catch (err) {
        console.error('❌ ERROR during debug send:', err.message);
        await client.destroy();
        process.exit(1);
    }
});

console.log('Initializing test...');
client.initialize();

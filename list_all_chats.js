const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: 'new',
        args: ['--no-sandbox']
    }
});

client.on('ready', async () => {
    console.log('✅ Connected!');
    const chats = await client.getChats();
    console.log('--- SCANNING ALL CHATS ---');
    for (let c of chats) {
        console.log(`CHAT: "${c.name}" | ID: ${c.id._serialized}`);
    }
    console.log('--- END SCAN ---');
    process.exit(0);
});

client.initialize();

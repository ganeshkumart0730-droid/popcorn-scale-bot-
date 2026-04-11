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
    console.log('--- FOUND CHATS ---');
    chats.forEach(c => console.log(`- Type: ${c.isGroup ? 'Group' : 'Direct'} | Name: ${c.name}`));
    process.exit(0);
});

client.initialize();

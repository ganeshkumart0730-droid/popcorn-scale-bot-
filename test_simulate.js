const axios = require('axios');

async function simulateMessage(text) {
    console.log(`\n👤 USER SENDS: "${text}"`);
    try {
        await axios.post('http://localhost:3000/webhook', {
            object: 'whatsapp_business_account',
            entry: [{
                changes: [{
                    value: {
                        messages: [{
                            from: '919876543210',
                            type: 'text',
                            text: { body: text }
                        }]
                    }
                }]
            }]
        });
    } catch (err) {
        console.error('❌ Simulation Error:', err.message);
    }
}

// 🍿 Run a few test queries
(async () => {
    console.log('🧪 Starting Popcorn Scale Bot Simulation...');
    await new Promise(r => setTimeout(r, 2000)); // Wait for server to boot
    
    await simulateMessage('latest movies');
    await new Promise(r => setTimeout(r, 1000));
    
    await simulateMessage('latest telugu movies');
    await new Promise(r => setTimeout(r, 1000));
    
    await simulateMessage('what is trending today?');
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('\n✅ Simulation Finished. You can see the bot replies above!');
})();

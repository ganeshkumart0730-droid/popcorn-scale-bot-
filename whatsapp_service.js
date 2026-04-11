const axios = require('axios');

// ⚙️ SETTINGS - Fill these from your Meta Dashboard
const ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN || "YOUR_META_ACCESS_TOKEN_HERE";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "YOUR_PHONE_NUMBER_ID_HERE";
const VERSION         = "v18.0";

const api = axios.create({
    baseURL: `https://graph.facebook.com/${VERSION}/${PHONE_NUMBER_ID}`,
    headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

/**
 * 📲 Send a structured text message
 */
async function sendText(to, body) {
    // 🎭 DEMO MODE: If keys aren't set, log to console instead!
    const isPlaceholder = (str) => !str || str.toLowerCase().includes("your_") || str.toLowerCase().includes("token_here");
    if (isPlaceholder(ACCESS_TOKEN) || isPlaceholder(PHONE_NUMBER_ID)) {
        console.log(`\n📱 [WHATSAPP DEMO TO ${to}]:\n${body}\n`);
        return true;
    }

    try {
        const resp = await api.post('/messages', {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: to,
            type: "text",
            text: { body: body }
        });
        console.log(`✅ Message sent to ${to}: ${resp.data.messages[0].id}`);
        return true;
    } catch (err) {
        console.error('❌ WhatsApp Send Error:', err.response?.data || err.message);
        return false;
    }
}

/**
 * 🖼️ Send an image with a caption
 */
async function sendImage(to, imageUrl, caption) {
    try {
        await api.post('/messages', {
            messaging_product: "whatsapp",
            to: to,
            type: "image",
            image: { link: imageUrl, caption: caption }
        });
        return true;
    } catch (err) {
        return false;
    }
}

module.exports = { sendText, sendImage };

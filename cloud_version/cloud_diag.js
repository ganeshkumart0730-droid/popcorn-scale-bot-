const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' }); // Adjust path if needed

(async () => {
    const uri = process.env.MONGODB_URI || "MISSING";
    console.log(`🔍 Connection URI present: ${uri !== "MISSING"}`);
    
    try {
        await mongoose.connect(uri);
        console.log("✅ MongoDB Connected!");
        
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        console.log("📂 Collections found:", collections.map(c => c.name));
        
        const sessionsCol = db.collection('whatsapp_sessions');
        const docs = await sessionsCol.find({}).toArray();
        
        console.log(`📊 Found ${docs.length} session chunks.`);
        docs.forEach(d => {
            console.log(` - ID: ${d._id} | Client: ${d.clientId} | Type: ${d.metadata?.type || 'unknown'}`);
        });

        process.exit(0);
    } catch (err) {
        console.error("❌ Diagnostic Error:", err.message);
        process.exit(1);
    }
})();

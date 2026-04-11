const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
let client;
let db;

async function connectDB() {
    if (db) return db;
    if (!uri || uri.includes('your_')) {
        console.log('💡 Demo Mode: Skipping MongoDB (No URI found)');
        return null;
    }
    try {
        client = new MongoClient(uri);
        await client.connect();
        db = client.db('popcorn_bot');
        console.log('✅ Connected to MongoDB Atlas');
        return db;
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        return null;
    }
}

/**
 * 👤 Register User for Broadcasts
 */
async function registerUser(phone, name = 'Community Member') {
    const database = await connectDB();
    if (!database) return;
    const users = database.collection('users');
    await users.updateOne(
        { phone },
        { $set: { phone, name, lastActive: new Date(), subscribed: true } },
        { upsert: true }
    );
}

/**
 * 📢 Get All Subscribed Users
 */
async function getSubscribers() {
    const database = await connectDB();
    if (!database) return [];
    const users = database.collection('users');
    return await users.find({ subscribed: true }).toArray();
}

module.exports = { connectDB, registerUser, getSubscribers };

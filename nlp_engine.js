const { NlpManager } = require('node-nlp');
const fs = require('fs');
const path = require('path');

const manager = new NlpManager({ languages: ['en'], forceNER: true, nlp: { log: false } });
const modelPath = path.join(__dirname, 'model.nlp');

async function trainBot() {
    console.log('🧠 Training Popcorn Scale NLP Brain...');
    manager.addDocument('en', 'latest movies', 'movie.latest');
    manager.addDocument('en', 'upcoming films', 'movie.latest');
    manager.addDocument('en', 'new movies', 'movie.latest');
    manager.addDocument('en', 'latest releases', 'movie.latest');
    manager.addDocument('en', 'telugu movies', 'movie.latest.telugu');
    manager.addDocument('en', 'trending', 'movie.trending');
    manager.addDocument('en', 'what is popular', 'movie.trending');
    
    await manager.train();
    await manager.save(modelPath);
}

async function processMessage(text) {
    // Auto-load if model exists
    if (fs.existsSync(modelPath)) {
        await manager.load(modelPath);
    } else {
        await trainBot();
    }
    
    const response = await manager.process('en', text);
    
    // Fallback for simple keywords if NLP fails
    const lower = text.toLowerCase();
    let intent = response.intent;
    if (intent === 'None') {
        if (lower.includes('latest')) intent = 'movie.latest';
        if (lower.includes('telugu')) intent = 'movie.latest.telugu';
        if (lower.includes('trending')) intent = 'movie.trending';
    }

    return {
        intent: intent,
        score: response.score,
        entities: response.entities
    };
}

module.exports = { trainBot, processMessage };

if (require.main === module) {
    trainBot();
}

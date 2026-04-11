// 🍿 POPCORN SCALE MOCK DATA SERVICE
// Use this for testing while you wait for your TMDB keys!

async function getLatestMovies(language = 'en') {
    return [
        { id: 1, title: 'Pushpa 2: The Rule', release_date: '2024-12-05', vote_average: 8.9 },
        { id: 2, title: 'Game Changer', release_date: '2025-01-10', vote_average: 8.5 },
        { id: 3, title: 'Devara: Part 1', release_date: '2024-09-27', vote_average: 7.9 },
        { id: 4, title: 'Sikandar', release_date: '2025-03-28', vote_average: 0.0 }
    ].slice(0, 5);
}

async function getTrending() {
    return [
        { id: 101, title: 'Leo', vote_average: 8.2 },
        { id: 102, title: 'Jailer', vote_average: 8.0 },
        { id: 103, title: 'Salaar', vote_average: 7.8 }
    ];
}

async function getTrailer() {
    return "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; // Demo link
}

async function getWatchProviders(movieId) {
    const providers = ['Netflix', 'Prime Video', 'JioHotstar', 'Zee5'];
    return providers[movieId % providers.length];
}

module.exports = { getLatestMovies, getTrending, getTrailer, getWatchProviders };

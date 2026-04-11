const axios = require('axios');

// ⚙️ SETTINGS - Replace with your key once ready!
const TMDB_API_KEY = process.env.TMDB_API_KEY || "YOUR_TMDB_API_READ_TOKEN_HERE";
const BASE_URL     = "https://api.themoviedb.org/3";

const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        Authorization: `Bearer ${TMDB_API_KEY}`,
        accept: 'application/json'
    }
});

/**
 * 🎬 Get Latest Releases (Theatrical + OTT)
 */
async function getLatestMovies(language = 'en') {
    try {
        const resp = await api.get('/discover/movie', {
            params: {
                include_adult: false,
                include_video: false,
                language: 'en-US',
                page: 1,
                sort_by: 'primary_release_date.desc',
                with_original_language: language === 'telugu' ? 'te' : 'en',
                'primary_release_date.lte': new Date().toISOString().split('T')[0]
            }
        });
        return resp.data.results.slice(0, 5);
    } catch (err) {
        console.error('❌ TMDB Error (Latest):', err.message);
        return [];
    }
}

/**
 * 🔥 Get Trending Buzz
 */
async function getTrending() {
    try {
        const resp = await api.get('/trending/movie/day');
        return resp.data.results.slice(0, 5);
    } catch (err) {
        console.error('❌ TMDB Error (Trending):', err.message);
        return [];
    }
}

/**
 * 🎥 Get Trailer for Movie ID
 */
async function getTrailer(movieId) {
    try {
        const resp = await api.get(`/movie/${movieId}/videos`);
        const trailer = resp.data.results.find(v => v.site === 'YouTube' && v.type === 'Trailer');
        return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
    } catch (err) {
        return null;
    }
}

/**
 * 🏥 Get Watch Providers (OTT Platforms)
 */
async function getWatchProviders(movieId) {
    try {
        const resp = await api.get(`/movie/${movieId}/watch/providers`);
        const providers = resp.data.results.IN; // India Specific
        if (!providers || !providers.flatrate) return 'Theatres';
        return providers.flatrate.map(p => p.provider_name).join(', ');
    } catch (err) {
        return 'Theatres';
    }
}

module.exports = { getLatestMovies, getTrending, getTrailer, getWatchProviders };

const express = require('express');
const router = express.Router();
const { getSeasons, getActiveSeason, getStandings, getWeekResults, getSeasonStats } = require('../queries/standings');
const { getSeasonSponsor } = require('../queries/sponsors');

router.get('/', async (req, res) => {
    try {
        const seasons = await getSeasons();
        if (!seasons.length) {
            return res.render('home', { seasons: [], currentSeason: null, standings: [], weeks: {}, stats: null, sponsor: null });
        }

        // Determine current season: query param or active/most recent
        let currentSeason;
        if (req.query.season) {
            currentSeason = seasons.find(s => s.id === parseInt(req.query.season)) || seasons[0];
        } else {
            currentSeason = seasons.find(s => s.is_active) || seasons[0];
        }

        const [standings, weeks, stats, sponsor] = await Promise.all([
            getStandings(currentSeason.id, currentSeason.drop_worst_week),
            getWeekResults(currentSeason.id),
            getSeasonStats(currentSeason.id, currentSeason.drop_worst_week),
            getSeasonSponsor(currentSeason.id)
        ]);

        res.render('home', {
            seasons,
            currentSeason,
            standings,
            weeks,
            stats,
            sponsor
        });
    } catch (err) {
        console.error('Home page error:', err);
        res.status(500).render('home', {
            seasons: [],
            currentSeason: null,
            standings: [],
            weeks: {},
            stats: null,
            sponsor: null,
            error: 'Failed to load rankings data.'
        });
    }
});

module.exports = router;

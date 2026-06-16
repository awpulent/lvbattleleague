const express = require('express');
const router = express.Router();
const { getSeasons, getActiveSeason, getStandings, getWeekResults, getSeasonStats } = require('../queries/standings');
const pool = require('../db/pool');

router.get('/', async (req, res) => {
    try {
        const seasons = await getSeasons();
        if (!seasons.length) {
            return res.render('home', { seasons: [], currentSeason: null, standings: [], weeks: {}, stats: null, sponsors: [] });
        }

        // Determine current season: query param or active/most recent
        let currentSeason;
        if (req.query.season) {
            currentSeason = seasons.find(s => s.id === parseInt(req.query.season)) || seasons[0];
        } else {
            currentSeason = seasons.find(s => s.is_active) || seasons[0];
        }

        const [standings, weeks, stats, sponsors] = await Promise.all([
            getStandings(currentSeason.id, currentSeason.drop_worst_week),
            getWeekResults(currentSeason.id),
            getSeasonStats(currentSeason.id, currentSeason.drop_worst_week),
            pool.query('SELECT * FROM sponsors WHERE is_active = true ORDER BY display_order ASC')
        ]);

        res.render('home', {
            seasons,
            currentSeason,
            standings,
            weeks,
            stats,
            sponsors: sponsors.rows
        });
    } catch (err) {
        console.error('Home page error:', err);
        res.status(500).render('home', {
            seasons: [],
            currentSeason: null,
            standings: [],
            weeks: {},
            stats: null,
            sponsors: [],
            error: 'Failed to load rankings data.'
        });
    }
});

module.exports = router;

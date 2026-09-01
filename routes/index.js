const express = require('express');
const router = express.Router();
const { getSeasons, getActiveSeason, getStandings, getWeekResults, getSeasonStats } = require('../queries/standings');
const { getSeasonSponsor } = require('../queries/sponsors');
const pool = require('../db/pool');

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

// Sponsor logos are stored in the sponsors table (see routes/admin.js) so they
// survive deploys. Cached for an hour; express adds an ETag so a replaced logo
// revalidates after that.
router.get('/sponsors/:id/logo', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        if (Number.isNaN(id)) return res.status(404).end();
        const { rows } = await pool.query('SELECT logo_data, logo_mime FROM sponsors WHERE id = $1', [id]);
        if (!rows.length || !rows[0].logo_data) return res.status(404).end();
        res.set('Content-Type', rows[0].logo_mime || 'application/octet-stream');
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(rows[0].logo_data);
    } catch (err) {
        console.error('Sponsor logo error:', err);
        next(err);
    }
});

module.exports = router;

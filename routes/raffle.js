const express = require('express');
const router = express.Router();
const { getSeasons, getStandings } = require('../queries/standings');
const adminAuth = require('../middleware/auth');

// Prize raffle — a single self-contained page gated by admin auth.
//
// Each player's seasonal points become their weighted raffle entries, matching
// exactly what the public scoreboard shows (drop-worst-week applied per the
// season's own setting). The entries are baked into the rendered page so the
// whole draw runs client-side and keeps working even if venue wifi drops after
// the page has loaded. Defaults to the active season; ?season=<id> overrides.
router.get('/', adminAuth, async (req, res, next) => {
    try {
        const seasons = await getSeasons();
        if (!seasons.length) {
            return res.status(404).render('raffle', { season: null, entries: [] });
        }

        let season;
        if (req.query.season) {
            season = seasons.find(s => s.id === parseInt(req.query.season)) || seasons[0];
        } else {
            season = seasons.find(s => s.is_active) || seasons[0];
        }

        const standings = await getStandings(season.id, season.drop_worst_week);
        const entries = standings
            .map(r => ({ name: r.display_name, points: Math.round(parseFloat(r.total_points)) }))
            .filter(e => Number.isFinite(e.points) && e.points > 0);

        res.render('raffle', { season, entries });
    } catch (err) {
        console.error('Raffle page error:', err);
        next(err);
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const overlayAuth = require('../middleware/overlay-auth');
const rateLimit = require('../middleware/rate-limit');
const pool = require('../db/pool');
const { getOverallRecord, getHeadToHead, getCharacterUsage } = require('../queries/players');
const { CHARACTER_ICONS } = require('../sync/characters');

// All API routes require overlay key + rate limiting
router.use(overlayAuth);
router.use(rateLimit);

// Search players by name (fuzzy match for autocomplete)
router.get('/players/search', async (req, res) => {
    try {
        const { name } = req.query;
        if (!name || name.length < 2) {
            return res.json([]);
        }

        // Prefer players with start.gg IDs (real synced data) over historical shells
        const { rows } = await pool.query(`
            SELECT p.id, p.display_name
            FROM players p
            LEFT JOIN player_aliases pa ON pa.player_id = p.id
            WHERE p.display_name ILIKE $1 OR pa.alias ILIKE $1
            GROUP BY p.id, p.display_name, p.startgg_id
            ORDER BY (p.startgg_id IS NOT NULL) DESC, p.display_name
            LIMIT 10
        `, [`%${name}%`]);

        res.json(rows);
    } catch (err) {
        console.error('Player search error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Get player stats for overlay display
router.get('/players/:id/stats', async (req, res) => {
    try {
        const playerId = parseInt(req.params.id);

        const [playerRow, record, characters] = await Promise.all([
            pool.query('SELECT id, display_name FROM players WHERE id = $1', [playerId]),
            getOverallRecord(playerId),
            getCharacterUsage(playerId)
        ]);

        if (!playerRow.rows.length) {
            return res.status(404).json({ error: 'Player not found' });
        }

        const player = playerRow.rows[0];
        const wins = parseInt(record.wins);
        const losses = parseInt(record.losses);
        const winrate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0';

        // Get current season rank
        const rankResult = await pool.query(`
            WITH season AS (
                SELECT id FROM seasons WHERE is_active = true
                UNION ALL
                SELECT id FROM seasons ORDER BY id DESC LIMIT 1
            ),
            player_scores AS (
                SELECT
                    p.player_id,
                    p.points,
                    ROW_NUMBER() OVER (PARTITION BY p.player_id ORDER BY p.points ASC) as rn,
                    COUNT(*) OVER (PARTITION BY p.player_id) as total_weeks
                FROM placements p
                JOIN tournaments t ON p.tournament_id = t.id
                WHERE t.season_id = (SELECT id FROM season LIMIT 1)
            ),
            standings AS (
                SELECT
                    player_id,
                    SUM(points) as total_points
                FROM player_scores
                WHERE rn > 1 OR total_weeks = 1
                GROUP BY player_id, total_weeks
                ORDER BY SUM(points) DESC
            )
            SELECT
                ROW_NUMBER() OVER (ORDER BY total_points DESC) as rank,
                player_id,
                total_points
            FROM standings
        `);

        const rankRow = rankResult.rows.find(r => r.player_id === playerId);

        res.json({
            id: player.id,
            name: player.display_name,
            wins,
            losses,
            winrate,
            rank: rankRow ? parseInt(rankRow.rank) : null,
            seasonPoints: rankRow ? parseFloat(rankRow.total_points) : 0,
            characters: characters.slice(0, 3).map(c => ({
                name: c.character,
                count: parseInt(c.times_used),
                icon: CHARACTER_ICONS[c.character] || null
            }))
        });
    } catch (err) {
        console.error('Player stats error:', err);
        res.status(500).json({ error: 'Stats lookup failed' });
    }
});

// Get head-to-head between two players
router.get('/h2h/:id1/:id2', async (req, res) => {
    try {
        const p1 = parseInt(req.params.id1);
        const p2 = parseInt(req.params.id2);

        const { rows } = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE winner_id = $1) as p1_wins,
                COUNT(*) FILTER (WHERE winner_id = $2) as p2_wins
            FROM sets
            WHERE (winner_id = $1 AND loser_id = $2) OR (winner_id = $2 AND loser_id = $1)
        `, [p1, p2]);

        const [p1Name, p2Name] = await Promise.all([
            pool.query('SELECT display_name FROM players WHERE id = $1', [p1]),
            pool.query('SELECT display_name FROM players WHERE id = $1', [p2])
        ]);

        res.json({
            p1: { id: p1, name: p1Name.rows[0]?.display_name, wins: parseInt(rows[0].p1_wins) },
            p2: { id: p2, name: p2Name.rows[0]?.display_name, wins: parseInt(rows[0].p2_wins) }
        });
    } catch (err) {
        console.error('H2H error:', err);
        res.status(500).json({ error: 'H2H lookup failed' });
    }
});

module.exports = router;

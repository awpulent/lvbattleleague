const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const adminAuth = require('../middleware/auth');
const pool = require('../db/pool');

// Sponsor logo upload config
const storage = multer.diskStorage({
    destination: path.join(__dirname, '..', 'public', 'img', 'sponsors'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = file.originalname.replace(ext, '').replace(/\s+/g, '-').toLowerCase();
        cb(null, `${name}-${Date.now()}${ext}`);
    }
});
const upload = multer({ storage });

// Admin page
router.get('/', adminAuth, async (req, res) => {
    try {
        const seasons = await pool.query('SELECT * FROM seasons ORDER BY id DESC');
        const sponsors = await pool.query('SELECT * FROM sponsors ORDER BY display_order ASC');
        res.render('admin', { seasons: seasons.rows, sponsors: sponsors.rows });
    } catch (err) {
        console.error('Admin page error:', err);
        res.status(500).json({ error: 'Failed to load admin page' });
    }
});

// Find duplicate players (same name, case-insensitive)
router.get('/duplicates', adminAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                LOWER(display_name) as name_lower,
                json_agg(json_build_object(
                    'id', id,
                    'display_name', display_name,
                    'startgg_id', startgg_id,
                    'has_placements', (SELECT COUNT(*) FROM placements WHERE player_id = players.id),
                    'has_sets', (SELECT COUNT(*) FROM sets WHERE winner_id = players.id OR loser_id = players.id)
                )) as players
            FROM players
            GROUP BY LOWER(display_name)
            HAVING COUNT(*) > 1
            ORDER BY LOWER(display_name)
        `);
        res.json(rows);
    } catch (err) {
        console.error('Duplicates error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Merge two players: moves all data from source to target, deletes source
router.post('/merge-players', adminAuth, async (req, res) => {
    try {
        const { keepId, removeId } = req.body;
        if (!keepId || !removeId) return res.status(400).json({ error: 'keepId and removeId required' });

        const keep = parseInt(keepId);
        const remove = parseInt(removeId);

        // Move placements (skip conflicts)
        await pool.query(`
            UPDATE placements SET player_id = $1
            WHERE player_id = $2
            AND tournament_id NOT IN (SELECT tournament_id FROM placements WHERE player_id = $1)
        `, [keep, remove]);
        await pool.query('DELETE FROM placements WHERE player_id = $1', [remove]);

        // Move sets
        await pool.query('UPDATE sets SET winner_id = $1 WHERE winner_id = $2', [keep, remove]);
        await pool.query('UPDATE sets SET loser_id = $1 WHERE loser_id = $2', [keep, remove]);

        // Move games
        await pool.query('UPDATE games SET winner_id = $1 WHERE winner_id = $2', [keep, remove]);

        // Move aliases
        await pool.query(`
            INSERT INTO player_aliases (player_id, alias)
            SELECT $1, alias FROM player_aliases WHERE player_id = $2
            ON CONFLICT DO NOTHING
        `, [keep, remove]);
        // Add the removed player's display name as an alias
        const removedPlayer = await pool.query('SELECT display_name FROM players WHERE id = $1', [remove]);
        if (removedPlayer.rows.length) {
            await pool.query(
                'INSERT INTO player_aliases (player_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [keep, removedPlayer.rows[0].display_name]
            );
        }

        // Delete removed player's aliases and the player itself
        await pool.query('DELETE FROM player_aliases WHERE player_id = $1', [remove]);
        await pool.query('DELETE FROM players WHERE id = $1', [remove]);

        res.json({ success: true, kept: keep, removed: remove });
    } catch (err) {
        console.error('Merge error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Rename a season
router.post('/rename-season', adminAuth, async (req, res) => {
    try {
        const { seasonId, name } = req.body;
        if (!seasonId || !name) return res.status(400).json({ error: 'seasonId and name required' });
        await pool.query('UPDATE seasons SET name = $1 WHERE id = $2', [name, parseInt(seasonId)]);
        res.json({ success: true });
    } catch (err) {
        console.error('Rename season error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Rename a tournament
router.post('/rename-tournament', adminAuth, async (req, res) => {
    try {
        const { seasonId, weekNumber, name } = req.body;
        if (!seasonId || !weekNumber || !name) return res.status(400).json({ error: 'seasonId, weekNumber, and name required' });
        const result = await pool.query(
            'UPDATE tournaments SET name = $1 WHERE season_id = $2 AND week_number = $3',
            [name, parseInt(seasonId), parseInt(weekNumber)]
        );
        res.json({ success: true, updated: result.rowCount });
    } catch (err) {
        console.error('Rename tournament error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Clear a season's tournament data (placements, sets, games, tournaments) so it can be re-synced
router.post('/clear-season', adminAuth, async (req, res) => {
    try {
        const { seasonId } = req.body;
        if (!seasonId) return res.status(400).json({ error: 'seasonId required' });

        const tournIds = await pool.query('SELECT id FROM tournaments WHERE season_id = $1', [parseInt(seasonId)]);
        const ids = tournIds.rows.map(r => r.id);

        if (ids.length) {
            await pool.query('DELETE FROM games WHERE set_id IN (SELECT id FROM sets WHERE tournament_id = ANY($1))', [ids]);
            await pool.query('DELETE FROM sets WHERE tournament_id = ANY($1)', [ids]);
            await pool.query('DELETE FROM placements WHERE tournament_id = ANY($1)', [ids]);
            await pool.query('DELETE FROM tournaments WHERE season_id = $1', [parseInt(seasonId)]);
        }

        res.json({ success: true, tournamentsCleared: ids.length });
    } catch (err) {
        console.error('Clear season error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Sync trigger
router.post('/sync', adminAuth, async (req, res) => {
    try {
        const { tournamentSlug, seasonId, weekNumber, eventName } = req.body;
        const ingest = require('../sync/ingest');
        const result = await ingest.syncTournament(tournamentSlug, parseInt(seasonId), parseInt(weekNumber), eventName || null);
        res.json({ success: true, result });
    } catch (err) {
        console.error('Sync error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Add sponsor
router.post('/sponsors', adminAuth, upload.single('logo'), async (req, res) => {
    try {
        const { name, website_url, display_order } = req.body;
        const logo_url = `/img/sponsors/${req.file.filename}`;
        await pool.query(
            'INSERT INTO sponsors (name, logo_url, website_url, display_order) VALUES ($1, $2, $3, $4)',
            [name, logo_url, website_url || null, parseInt(display_order) || 0]
        );
        res.redirect(`/admin?secret=${process.env.ADMIN_SECRET}`);
    } catch (err) {
        console.error('Add sponsor error:', err);
        res.status(500).json({ error: err.message });
    }
});

// One-time migration from Google Sheets
router.post('/migrate', adminAuth, async (req, res) => {
    try {
        // Check if data already exists
        const check = await pool.query('SELECT COUNT(*) FROM seasons');
        if (parseInt(check.rows[0].count) > 0) {
            return res.json({ message: 'Data already exists. Skipping migration.' });
        }

        const SHEET_ID = '1OiI_pznUCPgfcgoMpd5HhTCTqx4QR30RhtZljftCiWA';
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Sheet fetch failed: ${response.status}`);
        const text = await response.text();

        // Parse CSV
        const rows = text.split('\n').map(line => {
            const cols = []; let current = ''; let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') inQuotes = !inQuotes;
                else if (char === ',' && !inQuotes) { cols.push(current.trim()); current = ''; }
                else current += char;
            }
            cols.push(current.trim());
            return cols;
        });

        // Parse into seasons
        const seasons = []; let currentSeasonName = ''; let weekData = [];
        rows.forEach(cols => {
            if (!cols || !cols.length || !cols[0]) return;
            const firstCell = cols[0].toString().trim();
            if (firstCell.toLowerCase().startsWith('season')) {
                if (currentSeasonName && weekData.length > 0) seasons.push({ name: currentSeasonName, entries: weekData });
                currentSeasonName = firstCell; weekData = [];
            } else if (firstCell.toLowerCase().startsWith('week')) {
                // skip header
            } else if (cols.length >= 3 && firstCell) {
                weekData.push({ player: firstCell, placement: parseInt(cols[1]) || 0, points: parseFloat(cols[2]) || 0, week: (cols[3] || 'Week 1').trim() });
            }
        });
        if (currentSeasonName && weekData.length > 0) seasons.push({ name: currentSeasonName, entries: weekData });

        // Insert into DB
        for (let si = 0; si < seasons.length; si++) {
            const season = seasons[si];
            const isActive = si === seasons.length - 1;
            const seasonResult = await pool.query(
                'INSERT INTO seasons (name, is_active) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET is_active = $2 RETURNING id',
                [season.name, isActive]
            );
            const seasonId = seasonResult.rows[0].id;

            const weekSet = new Set(season.entries.map(e => e.week));
            const weekNames = Array.from(weekSet).sort();
            const weekIdMap = {};

            for (let wi = 0; wi < weekNames.length; wi++) {
                const weekName = weekNames[wi];
                const tournResult = await pool.query(
                    'INSERT INTO tournaments (season_id, name, week_number) VALUES ($1, $2, $3) RETURNING id',
                    [seasonId, weekName, wi + 1]
                );
                weekIdMap[weekName] = tournResult.rows[0].id;
            }

            for (const entry of season.entries) {
                let playerResult = await pool.query('SELECT id FROM players WHERE display_name = $1', [entry.player]);
                let playerId;
                if (playerResult.rows.length) {
                    playerId = playerResult.rows[0].id;
                } else {
                    const insert = await pool.query('INSERT INTO players (display_name) VALUES ($1) RETURNING id', [entry.player]);
                    playerId = insert.rows[0].id;
                }
                const tournamentId = weekIdMap[entry.week];
                if (tournamentId) {
                    await pool.query(
                        'INSERT INTO placements (tournament_id, player_id, placement, points) VALUES ($1, $2, $3, $4) ON CONFLICT (tournament_id, player_id) DO UPDATE SET placement = EXCLUDED.placement, points = EXCLUDED.points',
                        [tournamentId, playerId, entry.placement, entry.points]
                    );
                }
            }
        }

        res.json({ success: true, seasons: seasons.length, message: 'Migration complete' });
    } catch (err) {
        console.error('Migration error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete sponsor
router.post('/sponsors/:id/delete', adminAuth, async (req, res) => {
    try {
        await pool.query('DELETE FROM sponsors WHERE id = $1', [req.params.id]);
        res.redirect(`/admin?secret=${process.env.ADMIN_SECRET}`);
    } catch (err) {
        console.error('Delete sponsor error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

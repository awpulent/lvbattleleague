const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const adminAuth = require('../middleware/auth');
const safeEqual = require('../middleware/safe-equal');
const pool = require('../db/pool');
const { getSponsorsWithSeasons } = require('../queries/sponsors');

// --- Auth: cookie-based login so the admin secret never travels in a URL ---
router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

router.post('/login', (req, res) => {
    const secret = process.env.ADMIN_SECRET || '';
    const supplied = req.body?.adminSecret || '';
    if (secret && safeEqual(supplied, secret)) {
        res.cookie('lvbl_admin', '1', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            signed: true,
            maxAge: 8 * 60 * 60 * 1000,
        });
        return res.redirect('/admin');
    }
    return res.status(401).render('login', { error: 'Invalid secret' });
});

router.post('/logout', (req, res) => {
    res.clearCookie('lvbl_admin');
    res.redirect('/admin/login');
});

// Sponsor logo upload config. Logos are buffered in memory and written to the
// sponsors table (logo_data / logo_mime), never to disk: App Platform rebuilds
// the container filesystem on every deploy, so a file under public/ vanished
// with the next push. They are served back by GET /sponsors/:id/logo.
const storage = multer.memoryStorage();

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 10, parts: 12 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, ALLOWED_MIME.has(file.mimetype) && ALLOWED_EXT.has(ext));
    }
});

// Wrap multer so size/type rejections and missing files return clean 400s
// instead of throwing (which previously 500'd on req.file.filename).
function uploadLogo(req, res, next) {
    upload.single('logo')(req, res, (err) => {
        if (err instanceof multer.MulterError) return res.status(400).json({ error: `Upload error: ${err.code}` });
        if (err) return res.status(400).json({ error: 'Invalid upload' });
        if (!req.file) return res.status(400).json({ error: 'No valid logo file (png, jpg, webp, gif; max 2MB)' });
        next();
    });
}

// Admin page
router.get('/', adminAuth, async (req, res, next) => {
    try {
        const seasons = await pool.query('SELECT * FROM seasons ORDER BY id DESC');
        const sponsors = await getSponsorsWithSeasons();
        res.render('admin', { seasons: seasons.rows, sponsors });
    } catch (err) {
        console.error('Admin page error:', err);
        res.status(500).json({ error: 'Failed to load admin page' });
    }
});

// Find duplicate players (same name, case-insensitive)
router.get('/duplicates', adminAuth, async (req, res, next) => {
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
        next(err);
    }
});

// Merge two players: moves all data from source to target, deletes source
router.post('/merge-players', adminAuth, async (req, res, next) => {
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
        next(err);
    }
});

// Create a new season
router.post('/create-season', adminAuth, async (req, res, next) => {
    try {
        const { name, isActive } = req.body;
        if (!name) return res.status(400).json({ error: 'name required' });

        const makeActive = isActive === true || isActive === 'true';
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (makeActive) {
                await client.query('UPDATE seasons SET is_active = false');
            }
            const result = await client.query(
                'INSERT INTO seasons (name, is_active) VALUES ($1, $2) RETURNING id, name, is_active',
                [name, makeActive]
            );
            await client.query('COMMIT');
            res.json({ success: true, season: result.rows[0] });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Create season error:', err);
        if (err.code === '23505') {
            return res.status(409).json({ error: `Season "${req.body.name}" already exists` });
        }
        next(err);
    }
});

// Update per-season settings (dropWorstWeek, isActive, etc.)
router.post('/update-season', adminAuth, async (req, res, next) => {
    try {
        const { seasonId, dropWorstWeek, isActive, sponsorId } = req.body;
        if (!seasonId) return res.status(400).json({ error: 'seasonId required' });

        const updates = [];
        const values = [];

        if (dropWorstWeek !== undefined) {
            updates.push(`drop_worst_week = $${values.length + 1}`);
            values.push(dropWorstWeek === true || dropWorstWeek === 'true');
        }
        if (isActive !== undefined) {
            updates.push(`is_active = $${values.length + 1}`);
            values.push(isActive === true || isActive === 'true');
        }
        // sponsorId: null or "" clears the season's presenting sponsor.
        if (sponsorId !== undefined) {
            let sponsor = null;
            if (sponsorId !== null && sponsorId !== '') {
                sponsor = parseInt(sponsorId);
                if (Number.isNaN(sponsor)) {
                    return res.status(400).json({ error: 'sponsorId must be an integer or null' });
                }
                const exists = await pool.query('SELECT 1 FROM sponsors WHERE id = $1', [sponsor]);
                if (!exists.rows.length) {
                    return res.status(404).json({ error: `Sponsor ${sponsor} not found` });
                }
            }
            updates.push(`sponsor_id = $${values.length + 1}`);
            values.push(sponsor);
        }

        if (!updates.length) return res.status(400).json({ error: 'no fields to update' });

        const id = parseInt(seasonId);
        if (Number.isNaN(id)) return res.status(400).json({ error: 'seasonId must be an integer' });
        values.push(id);

        // Activating a season deactivates the others in the same transaction,
        // matching create-season, so there is never more than one active season.
        const makeActive = isActive === true || isActive === 'true';
        const client = await pool.connect();
        let rows;
        try {
            await client.query('BEGIN');
            if (makeActive) {
                await client.query('UPDATE seasons SET is_active = false WHERE id <> $1', [id]);
            }
            ({ rows } = await client.query(
                `UPDATE seasons SET ${updates.join(', ')} WHERE id = ${values.length} RETURNING id, name, is_active, drop_worst_week, sponsor_id`,
                values
            ));
            await client.query(rows.length ? 'COMMIT' : 'ROLLBACK');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
        if (!rows.length) return res.status(404).json({ error: `Season ${seasonId} not found` });
        // The /admin Seasons list posts a plain form; send it back to the page.
        // JSON callers (curl, scripts) keep getting the updated row.
        if (req.is('application/x-www-form-urlencoded')) return res.redirect('/admin');
        res.json({ success: true, season: rows[0] });
    } catch (err) {
        console.error('Update season error:', err);
        next(err);
    }
});

// Rename a season
router.post('/rename-season', adminAuth, async (req, res, next) => {
    try {
        const { seasonId, name } = req.body;
        if (!seasonId || !name) return res.status(400).json({ error: 'seasonId and name required' });
        await pool.query('UPDATE seasons SET name = $1 WHERE id = $2', [name, parseInt(seasonId)]);
        res.json({ success: true });
    } catch (err) {
        console.error('Rename season error:', err);
        next(err);
    }
});

// Apply a points multiplier to all placements in a tournament (by name)
router.post('/multiply-points', adminAuth, async (req, res, next) => {
    try {
        const { tournamentName, multiplier } = req.body;
        if (!tournamentName || !multiplier) return res.status(400).json({ error: 'tournamentName and multiplier required' });

        const m = parseFloat(multiplier);
        if (isNaN(m) || m <= 0) return res.status(400).json({ error: 'multiplier must be a positive number' });

        // Find tournaments by name
        const tournaments = await pool.query('SELECT id, name, season_id FROM tournaments WHERE name = $1', [tournamentName]);
        if (!tournaments.rows.length) return res.status(404).json({ error: `No tournament found named "${tournamentName}"` });

        // Update placements — round up to match league scoring rules
        const result = await pool.query(
            `UPDATE placements SET points = CEIL(points * $1) WHERE tournament_id = ANY($2)`,
            [m, tournaments.rows.map(t => t.id)]
        );

        res.json({
            success: true,
            tournaments: tournaments.rows,
            placementsUpdated: result.rowCount,
            multiplier: m
        });
    } catch (err) {
        console.error('Multiply points error:', err);
        next(err);
    }
});

// Rename a tournament
router.post('/rename-tournament', adminAuth, async (req, res, next) => {
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
        next(err);
    }
});

// Clear a season's tournament data (placements, sets, games, tournaments) so it can be re-synced
router.post('/clear-season', adminAuth, async (req, res, next) => {
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
        next(err);
    }
});

// Sync trigger
router.post('/sync', adminAuth, async (req, res, next) => {
    try {
        const { tournamentSlug, seasonId, weekNumber, eventName, useMultiplier, attendancePoint } = req.body;
        const options = {
            // multiplier on unless explicitly disabled (backwards compatible)
            useMultiplier: useMultiplier !== false && useMultiplier !== 'false',
            // attendance point off unless explicitly enabled
            attendancePoint: attendancePoint === true || attendancePoint === 'true'
        };
        const ingest = require('../sync/ingest');
        const result = await ingest.syncTournament(tournamentSlug, parseInt(seasonId), parseInt(weekNumber), eventName || null, options);
        res.json({ success: true, result });
    } catch (err) {
        console.error('Sync error:', err);
        next(err);
    }
});

// Add sponsor
router.post('/sponsors', adminAuth, uploadLogo, async (req, res, next) => {
    try {
        const { name, website_url } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
        // Adding a sponsor only registers it. Assign it to a season from the
        // Seasons list on /admin, or POST /update-season { seasonId, sponsorId }.
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(
                'INSERT INTO sponsors (name, logo_url, website_url, logo_data, logo_mime) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [name.trim(), '', website_url || null, req.file.buffer, req.file.mimetype]
            );
            await client.query('UPDATE sponsors SET logo_url = $1 WHERE id = $2', [`/sponsors/${rows[0].id}/logo`, rows[0].id]);
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
        res.redirect('/admin');
    } catch (err) {
        console.error('Add sponsor error:', err);
        next(err);
    }
});

// One-time migration from Google Sheets
router.post('/migrate', adminAuth, async (req, res, next) => {
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
        next(err);
    }
});

// Replace a sponsor's logo, keeping its id and season assignments
router.post('/sponsors/:id/logo', adminAuth, uploadLogo, async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid sponsor id' });
        const { rowCount } = await pool.query(
            'UPDATE sponsors SET logo_data = $1, logo_mime = $2, logo_url = $3 WHERE id = $4',
            [req.file.buffer, req.file.mimetype, `/sponsors/${id}/logo`, id]
        );
        if (!rowCount) return res.status(404).json({ error: `Sponsor ${id} not found` });
        res.redirect('/admin');
    } catch (err) {
        console.error('Replace logo error:', err);
        next(err);
    }
});

// Delete sponsor
router.post('/sponsors/:id/delete', adminAuth, async (req, res, next) => {
    try {
        await pool.query('DELETE FROM sponsors WHERE id = $1', [req.params.id]);
        res.redirect('/admin');
    } catch (err) {
        console.error('Delete sponsor error:', err);
        next(err);
    }
});

module.exports = router;

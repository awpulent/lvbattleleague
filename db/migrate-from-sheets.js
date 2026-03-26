/**
 * One-time migration: import historical data from Google Sheets CSV
 * into the PostgreSQL database.
 *
 * Usage: node db/migrate-from-sheets.js
 */

require('dotenv').config();
const pool = require('./pool');

const SHEET_ID = '1OiI_pznUCPgfcgoMpd5HhTCTqx4QR30RhtZljftCiWA';

function parseCSV(csvText) {
    return csvText.split('\n').map(line => {
        const cols = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                cols.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        cols.push(current.trim());
        return cols;
    });
}

async function migrate() {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
    console.log('Fetching Google Sheets data...');

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
    const text = await res.text();

    const rows = parseCSV(text);

    // Parse into seasons/weeks/players (same logic as original index.html)
    const seasons = [];
    let currentSeasonName = '';
    let weekData = [];

    rows.forEach(cols => {
        if (!cols || !cols.length || !cols[0]) return;
        const firstCell = cols[0].toString().trim();

        if (firstCell.toLowerCase().startsWith('season')) {
            if (currentSeasonName && weekData.length > 0) {
                seasons.push({ name: currentSeasonName, entries: weekData });
            }
            currentSeasonName = firstCell;
            weekData = [];
        } else if (firstCell.toLowerCase().startsWith('week')) {
            // Skip header rows
        } else if (cols.length >= 3 && firstCell) {
            const player = firstCell;
            const placement = parseInt(cols[1]) || 0;
            const points = parseFloat(cols[2]) || 0;
            const week = (cols[3] || 'Week 1').trim();
            weekData.push({ player, placement, points, week });
        }
    });

    // Save last season
    if (currentSeasonName && weekData.length > 0) {
        seasons.push({ name: currentSeasonName, entries: weekData });
    }

    console.log(`Found ${seasons.length} seasons`);

    // Insert into database
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (let si = 0; si < seasons.length; si++) {
            const season = seasons[si];
            const isActive = si === seasons.length - 1; // last = most recent

            const seasonResult = await client.query(
                'INSERT INTO seasons (name, is_active) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET is_active = $2 RETURNING id',
                [season.name, isActive]
            );
            const seasonId = seasonResult.rows[0].id;
            console.log(`  Season: ${season.name} (ID: ${seasonId}, active: ${isActive})`);

            // Get unique weeks in this season
            const weekSet = new Set(season.entries.map(e => e.week));
            const weekNames = Array.from(weekSet).sort();

            const weekIdMap = {};
            for (let wi = 0; wi < weekNames.length; wi++) {
                const weekName = weekNames[wi];
                const weekNum = wi + 1;
                const tournResult = await client.query(
                    `INSERT INTO tournaments (season_id, name, week_number)
                     VALUES ($1, $2, $3)
                     ON CONFLICT DO NOTHING
                     RETURNING id`,
                    [seasonId, weekName, weekNum]
                );
                if (tournResult.rows.length) {
                    weekIdMap[weekName] = tournResult.rows[0].id;
                } else {
                    // Already exists, fetch it
                    const existing = await client.query(
                        'SELECT id FROM tournaments WHERE season_id = $1 AND week_number = $2',
                        [seasonId, weekNum]
                    );
                    weekIdMap[weekName] = existing.rows[0].id;
                }
            }

            // Insert players and placements
            for (const entry of season.entries) {
                // Upsert player (without start.gg ID — historical data)
                let playerResult = await client.query(
                    'SELECT id FROM players WHERE display_name = $1',
                    [entry.player]
                );
                let playerId;
                if (playerResult.rows.length) {
                    playerId = playerResult.rows[0].id;
                } else {
                    const insert = await client.query(
                        'INSERT INTO players (display_name) VALUES ($1) RETURNING id',
                        [entry.player]
                    );
                    playerId = insert.rows[0].id;
                }

                const tournamentId = weekIdMap[entry.week];
                if (tournamentId) {
                    await client.query(
                        `INSERT INTO placements (tournament_id, player_id, placement, points)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (tournament_id, player_id) DO UPDATE SET
                            placement = EXCLUDED.placement,
                            points = EXCLUDED.points`,
                        [tournamentId, playerId, entry.placement, entry.points]
                    );
                }
            }

            console.log(`    ${weekNames.length} weeks, ${new Set(season.entries.map(e => e.player)).size} players`);
        }

        await client.query('COMMIT');
        console.log('Migration complete!');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});

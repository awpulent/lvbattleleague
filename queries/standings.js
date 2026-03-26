const pool = require('../db/pool');

async function getSeasons() {
    const { rows } = await pool.query(
        'SELECT * FROM seasons ORDER BY id DESC'
    );
    return rows;
}

async function getActiveSeason() {
    const { rows } = await pool.query(
        'SELECT * FROM seasons WHERE is_active = true LIMIT 1'
    );
    if (rows.length) return rows[0];
    // Fallback: most recent season
    const fallback = await pool.query('SELECT * FROM seasons ORDER BY id DESC LIMIT 1');
    return fallback.rows[0] || null;
}

async function getStandings(seasonId) {
    // Get all placements for this season, grouped by player
    // Drop worst week (lowest score) per player
    const { rows } = await pool.query(`
        WITH player_scores AS (
            SELECT
                p.player_id,
                pl.display_name,
                pl.id as player_db_id,
                p.points,
                ROW_NUMBER() OVER (PARTITION BY p.player_id ORDER BY p.points ASC) as rn,
                COUNT(*) OVER (PARTITION BY p.player_id) as total_weeks
            FROM placements p
            JOIN players pl ON p.player_id = pl.id
            JOIN tournaments t ON p.tournament_id = t.id
            WHERE t.season_id = $1
        )
        SELECT
            player_db_id,
            display_name,
            SUM(points) as total_points,
            total_weeks as weeks_attended
        FROM player_scores
        WHERE rn > 1 OR total_weeks = 1
        GROUP BY player_db_id, display_name, total_weeks
        ORDER BY SUM(points) DESC
    `, [seasonId]);
    return rows;
}

async function getWeekResults(seasonId) {
    const { rows } = await pool.query(`
        SELECT
            t.id as tournament_id,
            t.name as week_name,
            t.week_number,
            t.date,
            p.placement,
            p.points,
            pl.display_name as player_name,
            pl.id as player_db_id
        FROM placements p
        JOIN tournaments t ON p.tournament_id = t.id
        JOIN players pl ON p.player_id = pl.id
        WHERE t.season_id = $1
        ORDER BY t.week_number ASC, p.points DESC
    `, [seasonId]);

    // Group by week
    const weeks = {};
    rows.forEach(row => {
        const key = row.week_name || `Week ${row.week_number}`;
        if (!weeks[key]) weeks[key] = [];
        weeks[key].push({
            player_name: row.player_name,
            player_id: row.player_db_id,
            placement: row.placement,
            points: parseFloat(row.points)
        });
    });
    return weeks;
}

async function getSeasonStats(seasonId) {
    const standings = await getStandings(seasonId);
    const weeks = await getWeekResults(seasonId);

    const weekCount = Object.keys(weeks).length;
    const totalPlayers = standings.length;
    const leader = standings[0]?.display_name || '-';

    const totalAttendance = Object.values(weeks).reduce((sum, w) => sum + w.length, 0);
    const avgAttendance = weekCount > 0 ? (totalAttendance / weekCount).toFixed(1) : '0';

    return { leader, weekCount, totalPlayers, avgAttendance };
}

module.exports = { getSeasons, getActiveSeason, getStandings, getWeekResults, getSeasonStats };

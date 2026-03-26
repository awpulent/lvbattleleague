const pool = require('../db/pool');

async function getPlayer(playerId) {
    const { rows } = await pool.query(
        'SELECT * FROM players WHERE id = $1',
        [playerId]
    );
    return rows[0] || null;
}

async function getOverallRecord(playerId) {
    const { rows } = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE s.winner_id = $1) as wins,
            COUNT(*) FILTER (WHERE s.loser_id = $1) as losses
        FROM sets s
        WHERE s.winner_id = $1 OR s.loser_id = $1
    `, [playerId]);
    return rows[0] || { wins: 0, losses: 0 };
}

async function getHeadToHead(playerId) {
    const { rows } = await pool.query(`
        SELECT
            opponent_id,
            p.display_name as opponent_name,
            COUNT(*) FILTER (WHERE result = 'win') as wins,
            COUNT(*) FILTER (WHERE result = 'loss') as losses
        FROM (
            SELECT loser_id as opponent_id, 'win' as result FROM sets WHERE winner_id = $1
            UNION ALL
            SELECT winner_id as opponent_id, 'loss' as result FROM sets WHERE loser_id = $1
        ) matches
        JOIN players p ON p.id = matches.opponent_id
        GROUP BY opponent_id, p.display_name
        ORDER BY (COUNT(*) FILTER (WHERE result = 'win') + COUNT(*) FILTER (WHERE result = 'loss')) DESC
    `, [playerId]);
    return rows;
}

async function getCharacterUsage(playerId) {
    // games table has winner_id + winner_char + loser_char but no loser_id
    // When player won the game: their char is winner_char
    // When player lost the game: join to sets to confirm they're in the set, their char is loser_char
    const { rows } = await pool.query(`
        SELECT character, SUM(times_used) as times_used FROM (
            SELECT winner_char as character, COUNT(*) as times_used
            FROM games
            WHERE winner_id = $1 AND winner_char IS NOT NULL
            GROUP BY winner_char
            UNION ALL
            SELECT g.loser_char as character, COUNT(*) as times_used
            FROM games g
            JOIN sets s ON g.set_id = s.id
            WHERE g.winner_id != $1
              AND (s.winner_id = $1 OR s.loser_id = $1)
              AND g.loser_char IS NOT NULL
            GROUP BY g.loser_char
        ) combined
        GROUP BY character
        ORDER BY SUM(times_used) DESC
    `, [playerId]);
    return rows;
}

async function getMatchHistory(playerId, limit = 50) {
    const { rows } = await pool.query(`
        SELECT
            s.id as set_id,
            s.winner_score,
            s.loser_score,
            s.round_text,
            CASE WHEN s.winner_id = $1 THEN 'win' ELSE 'loss' END as result,
            CASE WHEN s.winner_id = $1 THEN pl.display_name ELSE pw.display_name END as opponent_name,
            CASE WHEN s.winner_id = $1 THEN pl.id ELSE pw.id END as opponent_id,
            t.name as tournament_name,
            t.date as tournament_date,
            se.name as season_name
        FROM sets s
        JOIN players pw ON s.winner_id = pw.id
        JOIN players pl ON s.loser_id = pl.id
        JOIN tournaments t ON s.tournament_id = t.id
        JOIN seasons se ON t.season_id = se.id
        WHERE s.winner_id = $1 OR s.loser_id = $1
        ORDER BY t.date DESC, s.id DESC
        LIMIT $2
    `, [playerId, limit]);
    return rows;
}

async function getSeasonPlacements(playerId) {
    const { rows } = await pool.query(`
        SELECT
            se.name as season_name,
            se.id as season_id,
            COUNT(*) as weeks_attended,
            SUM(p.points) as total_points,
            MIN(p.placement) as best_placement
        FROM placements p
        JOIN tournaments t ON p.tournament_id = t.id
        JOIN seasons se ON t.season_id = se.id
        WHERE p.player_id = $1
        GROUP BY se.id, se.name
        ORDER BY se.id DESC
    `, [playerId]);
    return rows;
}

module.exports = { getPlayer, getOverallRecord, getHeadToHead, getCharacterUsage, getMatchHistory, getSeasonPlacements };

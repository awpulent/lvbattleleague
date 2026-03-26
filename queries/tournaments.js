const pool = require('../db/pool');

async function getTournamentsBySeason(seasonId) {
    const { rows } = await pool.query(
        'SELECT * FROM tournaments WHERE season_id = $1 ORDER BY week_number ASC',
        [seasonId]
    );
    return rows;
}

async function getTournamentById(id) {
    const { rows } = await pool.query(
        'SELECT * FROM tournaments WHERE id = $1',
        [id]
    );
    return rows[0] || null;
}

module.exports = { getTournamentsBySeason, getTournamentById };

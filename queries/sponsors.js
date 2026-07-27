const pool = require('../db/pool');

// The presenting sponsor for a season, or null if none is assigned.
// Assignment happens through POST /admin/update-season { sponsorId }.
//
// Deliberately ignores sponsors.is_active: the season pointer is the only
// switch. Filtering on both would let deactivating a sponsor silently strip
// them from past seasons they actually did sponsor.
async function getSeasonSponsor(seasonId) {
    const { rows } = await pool.query(
        `SELECT s.id, s.name, s.logo_url, s.website_url
         FROM seasons se
         JOIN sponsors s ON s.id = se.sponsor_id
         WHERE se.id = $1`,
        [seasonId]
    );
    return rows[0] || null;
}

// Every sponsor plus the seasons each one presents, for the admin page.
async function getSponsorsWithSeasons() {
    const { rows } = await pool.query(
        `SELECT s.*,
                COALESCE(
                    ARRAY_AGG(se.name ORDER BY se.id) FILTER (WHERE se.id IS NOT NULL),
                    '{}'
                ) AS season_names
         FROM sponsors s
         LEFT JOIN seasons se ON se.sponsor_id = s.id
         GROUP BY s.id
         ORDER BY s.id ASC`
    );
    return rows;
}

module.exports = { getSeasonSponsor, getSponsorsWithSeasons };

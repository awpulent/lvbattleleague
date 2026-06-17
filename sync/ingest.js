const pool = require('../db/pool');
const { getTournamentEvent, getEventStandings, getEventSets } = require('./startgg-client');
const { placementToPoints } = require('./points');

// SF6 character ID to name mapping (from start.gg videogame query)
// Update when new DLC characters are added
const CHARACTER_MAP = {
    2271: 'Blanka',
    2272: 'Cammy',
    2273: 'Chun-Li',
    2274: 'Dee Jay',
    2275: 'Dhalsim',
    2276: 'E. Honda',
    2277: 'Guile',
    2278: 'Jamie',
    2279: 'JP',
    2280: 'Juri',
    2281: 'Ken',
    2282: 'Kimberly',
    2283: 'Lily',
    2284: 'Luke',
    2285: 'Manon',
    2286: 'Marisa',
    2287: 'Ryu',
    2288: 'Zangief',
    2314: 'Rashid',
    2342: 'A.K.I.',
    2442: 'Ed',
    2495: 'Akuma',
    2506: 'M. Bison',
    2596: 'Terry',
    2602: 'Random',
    2616: 'Mai',
    2699: 'Elena',
    2745: 'Sagat',
    2798: 'C. Viper',
    2946: 'Alex'
};

function resolveCharacter(selectionValue) {
    return CHARACTER_MAP[selectionValue] || `Character ${selectionValue}`;
}

// Upsert a player by their start.gg ID
async function upsertPlayer(startggId, gamerTag) {
    // Defense-in-depth: strip control chars + HTML metacharacters and cap length so
    // an attacker-chosen start.gg gamerTag can never carry markup into the DB.
    gamerTag = String(gamerTag || '').replace(/[<>\x00-\x1F\x7F]/g, '').trim().slice(0, 64);

    // Try to find existing player
    let result = await pool.query(
        'SELECT id FROM players WHERE startgg_id = $1',
        [startggId]
    );

    let playerId;
    if (result.rows.length) {
        playerId = result.rows[0].id;
    } else {
        // Check if there's a player with this name but no startgg_id (from historical data)
        result = await pool.query(
            'SELECT id FROM players WHERE display_name = $1 AND startgg_id IS NULL',
            [gamerTag]
        );
        if (result.rows.length) {
            // Link historical player to start.gg ID
            await pool.query(
                'UPDATE players SET startgg_id = $1 WHERE id = $2',
                [startggId, result.rows[0].id]
            );
            playerId = result.rows[0].id;
        } else {
            // Create new player
            const insert = await pool.query(
                'INSERT INTO players (startgg_id, display_name) VALUES ($1, $2) RETURNING id',
                [startggId, gamerTag]
            );
            playerId = insert.rows[0].id;
        }
    }

    // Add alias if it doesn't exist
    await pool.query(
        'INSERT INTO player_aliases (player_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [playerId, gamerTag]
    );

    return playerId;
}

async function syncTournament(tournamentSlug, seasonId, weekNumber, eventName, options = {}) {
    const { useMultiplier = true, attendancePoint = false } = options;
    console.log(`Syncing tournament: ${tournamentSlug} (multiplier: ${useMultiplier}, attendancePoint: ${attendancePoint})`);

    // 1. Get tournament and find the event (pick the first/largest event if multiple)
    const tournament = await getTournamentEvent(tournamentSlug);
    if (!tournament) throw new Error(`Tournament not found: ${tournamentSlug}`);

    const events = tournament.events;
    if (!events || !events.length) throw new Error('No events found in tournament');

    // Pick the SF6 event, or the first event if there's only one
    const event = events.length === 1
        ? events[0]
        : events.find(e => e.videogame?.name?.toLowerCase().includes('street fighter')) || events[0];

    console.log(`Using event: ${event.name} (ID: ${event.id}, ${event.numEntrants} entrants)`);

    // 2. Create or update tournament record
    const tournamentDate = tournament.startAt ? new Date(tournament.startAt * 1000) : null;
    // Use custom name if provided, otherwise default to "Week N"
    const displayName = eventName || `Week ${weekNumber}`;

    const tournResult = await pool.query(`
        INSERT INTO tournaments (season_id, startgg_tournament_id, startgg_event_id, name, week_number, date, entrant_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (startgg_event_id) DO UPDATE SET
            name = EXCLUDED.name,
            entrant_count = EXCLUDED.entrant_count,
            synced_at = NOW()
        RETURNING id
    `, [seasonId, tournament.id, event.id, displayName, weekNumber, tournamentDate, event.numEntrants]);
    const tournamentId = tournResult.rows[0].id;

    // 3. Get standings and create placements
    const entrantToPlayer = {}; // maps start.gg entrant ID to our player ID
    let standingsPage = 1;
    let totalStandingsPages = 1;

    while (standingsPage <= totalStandingsPages) {
        const standings = await getEventStandings(event.id, standingsPage);
        totalStandingsPages = standings.pageInfo.totalPages;

        for (const node of standings.nodes) {
            if (!node.entrant?.participants?.length) continue;

            const participant = node.entrant.participants[0];
            const startggPlayerId = participant.player.id;
            const gamerTag = participant.player.gamerTag;
            const placement = node.placement;

            const playerId = await upsertPlayer(startggPlayerId, gamerTag);
            entrantToPlayer[node.entrant.id] = playerId;

            const points = placementToPoints(placement, event.numEntrants, { useMultiplier, attendancePoint });

            await pool.query(`
                INSERT INTO placements (tournament_id, player_id, placement, points)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (tournament_id, player_id) DO UPDATE SET
                    placement = EXCLUDED.placement,
                    points = EXCLUDED.points
            `, [tournamentId, playerId, placement, points]);
        }

        standingsPage++;
    }

    // 4. Get sets and games
    // Clear existing sets for this tournament (re-sync safe)
    await pool.query('DELETE FROM games WHERE set_id IN (SELECT id FROM sets WHERE tournament_id = $1)', [tournamentId]);
    await pool.query('DELETE FROM sets WHERE tournament_id = $1', [tournamentId]);

    let setsPage = 1;
    let totalSetsPages = 1;
    let setsInserted = 0;
    let gamesInserted = 0;

    while (setsPage <= totalSetsPages) {
        const setsData = await getEventSets(event.id, setsPage);
        totalSetsPages = setsData.pageInfo.totalPages;

        for (const set of setsData.nodes) {
            if (!set.slots || set.slots.length < 2) continue;

            // Resolve player IDs from entrant IDs
            const slot0 = set.slots[0];
            const slot1 = set.slots[1];
            if (!slot0.entrant || !slot1.entrant) continue;

            const player0Id = entrantToPlayer[slot0.entrant.id];
            const player1Id = entrantToPlayer[slot1.entrant.id];
            if (!player0Id || !player1Id) continue;

            // Determine winner/loser
            const score0 = slot0.standing?.stats?.score?.value;
            const score1 = slot1.standing?.stats?.score?.value;

            let winnerId, loserId, winnerScore, loserScore;
            // start.gg winnerId is the entrant ID, not player ID
            if (set.winnerId === slot0.entrant.id) {
                winnerId = player0Id;
                loserId = player1Id;
                winnerScore = score0;
                loserScore = score1;
            } else if (set.winnerId === slot1.entrant.id) {
                winnerId = player1Id;
                loserId = player0Id;
                winnerScore = score1;
                loserScore = score0;
            } else {
                continue; // Skip DQs or incomplete sets
            }

            // Determine bracket phase from round text
            let bracketPhase = null;
            if (set.fullRoundText) {
                const rt = set.fullRoundText.toLowerCase();
                if (rt.includes('grand')) bracketPhase = 'grands';
                else if (rt.includes('losers') || rt.includes('elimination')) bracketPhase = 'losers';
                else bracketPhase = 'winners';
            }

            const setResult = await pool.query(`
                INSERT INTO sets (tournament_id, startgg_set_id, winner_id, loser_id, winner_score, loser_score, round_text, bracket_phase)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            `, [tournamentId, set.id, winnerId, loserId, winnerScore, loserScore, set.fullRoundText, bracketPhase]);
            const setId = setResult.rows[0].id;
            setsInserted++;

            // Insert games with character data
            if (set.games && set.games.length) {
                for (const game of set.games) {
                    if (!game.winnerId) continue;

                    let gameWinnerId;
                    // game.winnerId is also an entrant ID
                    if (game.winnerId === slot0.entrant.id) {
                        gameWinnerId = player0Id;
                    } else if (game.winnerId === slot1.entrant.id) {
                        gameWinnerId = player1Id;
                    } else {
                        continue;
                    }

                    let winnerChar = null;
                    let loserChar = null;

                    if (game.selections && game.selections.length) {
                        for (const sel of game.selections) {
                            if (!sel.entrant) continue;
                            const selPlayerId = entrantToPlayer[sel.entrant.id];
                            const charName = sel.selectionValue ? resolveCharacter(sel.selectionValue) : null;
                            if (selPlayerId === gameWinnerId) {
                                winnerChar = charName;
                            } else {
                                loserChar = charName;
                            }
                        }
                    }

                    await pool.query(`
                        INSERT INTO games (set_id, game_number, winner_id, winner_char, loser_char)
                        VALUES ($1, $2, $3, $4, $5)
                    `, [setId, game.orderNum || 1, gameWinnerId, winnerChar, loserChar]);
                    gamesInserted++;
                }
            }
        }

        setsPage++;
    }

    // Update synced timestamp
    await pool.query('UPDATE tournaments SET synced_at = NOW() WHERE id = $1', [tournamentId]);

    const summary = {
        tournament: tournament.name,
        event: event.name,
        entrants: event.numEntrants,
        sets: setsInserted,
        games: gamesInserted,
        players: Object.keys(entrantToPlayer).length,
        useMultiplier,
        attendancePoint
    };
    console.log('Sync complete:', summary);
    return summary;
}

module.exports = { syncTournament };

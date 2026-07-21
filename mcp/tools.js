const pool = require('../db/pool');
const jobs = require('./jobs');
const { getSeasons, getActiveSeason, getStandings } = require('../queries/standings');
const { getTournamentsBySeason } = require('../queries/tournaments');

// Tool definitions for the LVBL MCP server.
//
// Scope is deliberately narrow: the weekly sync plus read-only lookups. The
// destructive admin endpoints (clear-season, merge-players, multiply-points)
// have no undo and are intentionally NOT exposed here — they stay on an
// authenticated request from a machine the operator controls.

// Errors safe to show the caller: bad arguments, missing records, and the two
// conditions sync/ingest.js raises for a bad tournament slug. Everything else is
// collapsed to a generic message by the caller in ./index.js, so pg and start.gg
// internals (DB host, port, role name, raw upstream bodies) never leave the
// process — same posture as the global error handler in server.js.
class ToolError extends Error {}

// --- argument helpers -------------------------------------------------------
// Hand-rolled to match the manual validation style used in routes/, and to keep
// zod out of the dependency list (it is only a transitive dep of the SDK).

function requireString(args, name) {
    const v = args[name];
    if (typeof v !== 'string' || !v.trim()) throw new ToolError(`${name} is required`);
    return v.trim();
}

function requireInt(args, name) {
    const v = args[name];
    const n = typeof v === 'number' ? v : parseInt(v, 10);
    // Bound to Postgres INTEGER: Number.isInteger(1e21) is true, but pg would
    // serialize it as "1e+21" and the driver error would echo back to the caller.
    if (!Number.isInteger(n) || n < -2147483648 || n > 2147483647) {
        throw new ToolError(`${name} must be an integer`);
    }
    return n;
}

function optionalInt(args, name) {
    if (args[name] === undefined || args[name] === null || args[name] === '') return null;
    return requireInt(args, name);
}

function optionalBool(args, name, fallback) {
    const v = args[name];
    if (v === undefined || v === null) return fallback;
    if (typeof v === 'boolean') return v;
    return v === 'true';
}

// Accept either a bare slug or a full start.gg URL, matching what
// tools/sync-tournament.ps1 does with pasted links.
function normalizeSlug(input) {
    const m = input.match(/start\.gg\/tournament\/([^/?#]+)/i);
    return m ? m[1] : input.replace(/^\/+|\/+$/g, '');
}

function text(payload) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    return { content: [{ type: 'text', text: body }] };
}

// sync/ingest.js raises these two for a slug the operator got wrong — by far the
// most common sync failure, and useless to the operator if hidden behind a
// correlation ID. Everything else out of the sync path (start.gg responses, pg
// errors) is internal and gets collapsed.
const SAFE_SYNC_ERRORS = [/^Tournament not found:/, /^No events found in tournament/];

function classifySyncError(err, jobId) {
    const message = err && err.message ? err.message : String(err);
    if (SAFE_SYNC_ERRORS.some(re => re.test(message))) return new ToolError(message);
    // Log the original here — the caller only ever sees the classified error, so
    // this is the last point where the real cause is available.
    console.error(`[mcp] sync job ${jobId} failed (original):`, err);
    return new ToolError(
        `Sync failed — see the server log for job ${jobId}. ` +
        'Usually a start.gg API problem or a bad tournament slug.'
    );
}

// --- tools ------------------------------------------------------------------

const definitions = [
    {
        name: 'sync_tournament',
        title: 'Sync a tournament from start.gg',
        description:
            'Import a finished start.gg tournament into the league as a week: players, ' +
            'placements with computed points, sets, and games. Starts a background job and ' +
            'returns a jobId — poll get_sync_status for the result. Idempotent: re-running ' +
            'the same tournament overwrites its placements and DELETES then replaces its sets ' +
            'and games. Re-running with different useMultiplier/attendancePoint flags silently ' +
            'rewrites that week\'s scoring — confirm the flags match the rest of the season first.',
        // Destructive in the MCP sense: the sync deletes and replaces the target
        // event's sets and games and overwrites its placement points. Idempotent
        // for identical inputs, but not additive.
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
        inputSchema: {
            type: 'object',
            properties: {
                tournamentSlug: {
                    type: 'string',
                    description: 'start.gg tournament slug, or the full tournament URL.',
                },
                seasonId: { type: 'integer', description: 'League season ID to file this week under.' },
                weekNumber: { type: 'integer', description: 'Week number within the season.' },
                eventName: {
                    type: 'string',
                    description: 'Optional display name. Defaults to "Week {weekNumber}".',
                },
                useMultiplier: {
                    type: 'boolean',
                    description:
                        'Apply the entrant-count multiplier to placement points. Default true. ' +
                        'Must match the rest of the season.',
                },
                attendancePoint: {
                    type: 'boolean',
                    description:
                        'Award 1 point to every entrant on top of placement points. Default false. ' +
                        'Must match the rest of the season.',
                },
            },
            required: ['tournamentSlug', 'seasonId', 'weekNumber'],
        },
        handler: async args => {
            const slug = normalizeSlug(requireString(args, 'tournamentSlug'));
            const seasonId = requireInt(args, 'seasonId');
            const weekNumber = requireInt(args, 'weekNumber');
            const eventName = typeof args.eventName === 'string' && args.eventName.trim()
                ? args.eventName.trim()
                : null;
            const useMultiplier = optionalBool(args, 'useMultiplier', true);
            const attendancePoint = optionalBool(args, 'attendancePoint', false);

            const season = await pool.query('SELECT id, name FROM seasons WHERE id = $1', [seasonId]);
            if (!season.rows.length) throw new ToolError(`Season ${seasonId} does not exist`);

            const params = { slug, seasonId, weekNumber, eventName, useMultiplier, attendancePoint };
            const jobId = jobs.create(params);

            // Required lazily so a failure inside the sync module cannot take down
            // MCP tool listing.
            const { syncTournament } = require('../sync/ingest');
            jobs.run(jobId, async () => {
                try {
                    return await syncTournament(slug, seasonId, weekNumber, eventName, {
                        useMultiplier,
                        attendancePoint,
                    });
                } catch (err) {
                    // classifySyncError logs the original; only its safe message
                    // is stored for get_sync_status to hand back.
                    throw classifySyncError(err, jobId);
                }
            });

            return text({
                jobId,
                status: 'running',
                message:
                    `Syncing ${slug} into season "${season.rows[0].name}" as week ${weekNumber}. ` +
                    'Poll get_sync_status with this jobId — typically 10-60s depending on bracket size.',
                params,
            });
        },
    },

    {
        name: 'get_sync_status',
        title: 'Check a sync job',
        description:
            'Check the status of a sync started by sync_tournament. Returns running, ' +
            'succeeded (with entrant/set/game/player counts), or failed (with the error).',
        annotations: { readOnlyHint: true, destructiveHint: false },
        inputSchema: {
            type: 'object',
            properties: { jobId: { type: 'string', description: 'jobId returned by sync_tournament.' } },
            required: ['jobId'],
        },
        handler: async args => {
            const id = requireString(args, 'jobId');
            const job = jobs.get(id);
            if (!job) {
                throw new ToolError(
                    `No job ${id}. Jobs are held in memory and are lost when the app restarts; ` +
                    're-run sync_tournament (it is idempotent) if the week is not showing on the site.'
                );
            }
            return text(job);
        },
    },

    {
        name: 'list_seasons',
        title: 'List seasons',
        description:
            'List every league season with its ID, name, active flag, and drop-worst-week setting. ' +
            'Use this to resolve a season ID before syncing.',
        annotations: { readOnlyHint: true, destructiveHint: false },
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
            const seasons = await getSeasons();
            return text(
                seasons.map(s => ({
                    id: s.id,
                    name: s.name,
                    isActive: s.is_active,
                    dropWorstWeek: s.drop_worst_week,
                }))
            );
        },
    },

    {
        name: 'get_standings',
        title: 'Get season standings',
        description:
            'Season standings in rank order with points and weeks attended. Drop-worst-week is ' +
            'applied per that season\'s setting, so these match the public site. Defaults to the ' +
            'active season.',
        annotations: { readOnlyHint: true, destructiveHint: false },
        inputSchema: {
            type: 'object',
            properties: {
                seasonId: { type: 'integer', description: 'Season ID. Omit for the active season.' },
            },
        },
        handler: async args => {
            const seasonId = optionalInt(args, 'seasonId');

            let season;
            if (seasonId === null) {
                season = await getActiveSeason();
                if (!season) throw new ToolError('No seasons exist yet');
            } else {
                const { rows } = await pool.query('SELECT * FROM seasons WHERE id = $1', [seasonId]);
                if (!rows.length) throw new ToolError(`Season ${seasonId} does not exist`);
                season = rows[0];
            }

            const standings = await getStandings(season.id, season.drop_worst_week);
            return text({
                season: { id: season.id, name: season.name, dropWorstWeek: season.drop_worst_week },
                standings: standings.map((r, i) => ({
                    rank: i + 1,
                    playerId: r.player_db_id,
                    name: r.display_name,
                    points: parseFloat(r.total_points),
                    weeksAttended: parseInt(r.weeks_attended, 10),
                })),
            });
        },
    },

    {
        name: 'list_recent_tournaments',
        title: 'List a season\'s weeks',
        description:
            'List the tournaments (weeks) recorded for a season, with week number, date, entrant ' +
            'count, and when each was last synced. Use this to confirm a sync landed, or to check ' +
            'which week numbers are already taken.',
        annotations: { readOnlyHint: true, destructiveHint: false },
        inputSchema: {
            type: 'object',
            properties: {
                seasonId: { type: 'integer', description: 'Season ID. Omit for the active season.' },
            },
        },
        handler: async args => {
            const seasonId = optionalInt(args, 'seasonId');

            let id = seasonId;
            if (id === null) {
                const active = await getActiveSeason();
                if (!active) throw new ToolError('No seasons exist yet');
                id = active.id;
            }

            const tournaments = await getTournamentsBySeason(id);
            return text(
                tournaments.map(t => ({
                    id: t.id,
                    name: t.name,
                    weekNumber: t.week_number,
                    date: t.date,
                    entrantCount: t.entrant_count,
                    syncedAt: t.synced_at,
                    startggEventId: t.startgg_event_id,
                }))
            );
        },
    },
];

// Wire format for tools/list — annotations and inputSchema go over as-is.
const listing = definitions.map(({ name, title, description, inputSchema, annotations }) => ({
    name,
    title,
    description,
    inputSchema,
    annotations,
}));

const byName = new Map(definitions.map(d => [d.name, d]));

module.exports = { listing, byName, ToolError };

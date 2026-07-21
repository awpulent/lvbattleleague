# Architecture

Express 5 app, server-rendered with EJS, backed by PostgreSQL. No client
framework and no build step — `public/js/main.js` and `public/js/raffle.js` are
plain scripts loaded by the templates.

## Layout

```
server.js           app wiring, security middleware, migrate-then-listen
routes/             HTTP handlers, one file per surface
queries/            SQL for reads (standings, players, tournaments)
sync/               start.gg ingest, scoring, character maps
db/                 pool, connection config, one-off scripts
middleware/         auth, rate limits, constant-time compare
mcp/                MCP server for the Cowork connector
migrations/         node-pg-migrate files
views/              EJS templates and partials
public/             CSS, JS, character art, sponsor logos
overlay/            OBS browser source (StreamControl-driven)
scoreboard-app/     Electron app (self-hosted overlay + control UI)
```

The split between `queries/` and `sync/` is read vs. write: `queries/` only
reads for page rendering and the API, `sync/` is the only thing that writes
tournament data.

## Startup

`server.js` runs migrations before it listens, and exits non-zero if they fail.
A deploy that can't migrate never starts serving. There's no separate migrate
step in the deploy pipeline — booting is the migration.

Migrations use `getDbConfig()` directly; the app uses a bounded pool
(`db/pool.js`, max 10, 10s statement and query timeouts) so a stalled query
can't exhaust connections.

## Data model

Eight tables, created in `migrations/001_initial_schema.js`.

```
seasons ──< tournaments ──< placements >── players
                  │                          │  ^
                  └──< sets ──< games        │  │
                        │  │                 │  │
                        └──┴─────────────────┘  │
                                                │
                          player_aliases ───────┘
sponsors  (standalone)
```

**`players`** — `startgg_id` is unique but nullable. Rows imported from the old
Google Sheet have no start.gg ID; the ingest links them by matching display name
the first time that player appears in a synced bracket.

**`player_aliases`** — every gamertag a player has used. Powers fuzzy search in
the overlay, so a name change mid-season doesn't break lookups.

**`tournaments`** — one row per week. `startgg_event_id` is unique and is the
conflict target for re-syncs, which is what makes sync idempotent.

**`sets` / `games`** — `sets` is the match, `games` is the individual game with
character picks. Note `games` has `winner_id` but no `loser_id`; the loser is
derived by joining back to `sets`. That shape is why `getCharacterUsage()` in
`queries/players.js` is a UNION rather than a straight group-by.

**`placements`** — placement and final points, unique per (tournament, player).
Points are stored, not computed on read. See [`scoring.md`](scoring.md).

**`seasons.drop_worst_week`** — added in migration 002, default true.

`db/schema.sql` is only used to seed the docker-compose Postgres container.
Migrations are the source of truth for schema changes.

## Request flow

`server.js` applies, in order: Helmet (with `crossOriginResourcePolicy:
cross-origin` so the OBS browser source can fetch API JSON), a global 120
req/min limit, CORS headers on `/api`, 32 KB body limits, signed cookies, then
static files, then routes.

`app.set('trust proxy', 1)` matches the single DigitalOcean edge proxy hop.
It must stay `1`, not `true` — `true` would let a client spoof `X-Forwarded-For`
and defeat IP-based rate limiting.

The error handler is last, logs full detail server-side, and returns a generic
message for 5xx so database errors never reach a client.

## Auth

Two independent secrets, no user accounts.

**Admin** (`middleware/auth.js`) gates `/admin` and `/raffle`. Accepts either a
signed `lvbl_admin` cookie from the login form, or `Authorization: Bearer
<ADMIN_SECRET>` for scripted callers. Never read from the query string — that
leaks into proxy logs and shell history. Failed attempts are counted per IP for
observability and the counter map is bounded so a flood of distinct IPs can't
grow it without limit.

**Overlay** (`middleware/overlay-auth.js`) gates `/api`. Header only:
`Authorization: Bearer <OVERLAY_API_KEY>`. There is no query-string fallback.

**MCP** (`mcp/index.js`) gates `/mcp`, the Claude Cowork connector. Header only:
`Authorization: Bearer <MCP_API_TOKEN>`. Returns 503 when the token isn't
configured, so an unset variable disables the endpoint rather than opening it.

All three use `middleware/safe-equal.js`, which HMACs each side to a fixed-length
digest before `timingSafeEqual`. That avoids throwing on length mismatch and
stops the secret's length leaking through timing.

Rate limits are layered: 120/min globally, 60/min on `/api` keyed on the auth
header, and 10 failed attempts per 15 minutes on `/admin`
(`skipSuccessfulRequests`, so normal admin work is never throttled).

## MCP server

`mcp/` serves a Model Context Protocol endpoint at `/mcp` so Claude Cowork can
run the weekly sync and read standings from any surface. It runs in-process, so
its tools call `sync/ingest.js` and `queries/` directly rather than looping back
through HTTP — `ADMIN_SECRET` is never involved.

Transport is stateless Streamable HTTP (`sessionIdGenerator: undefined`), with a
fresh `Server` and transport per request. No session state, so it stays correct
if App Platform runs more than one instance.

`sync_tournament` returns a `jobId` immediately and runs the sync detached
(`mcp/jobs.js`); the caller polls `get_sync_status`. A large bracket can page
through start.gg for over a minute, which is too long to hold a tool call open.
Jobs are in-memory and lost on restart — acceptable because sync is idempotent.

Tool scope is deliberately narrow. `clear-season`, `merge-players`, and
`multiply-points` are not exposed: no undo, so they stay on the admin surface.

See [`tool-split.md`](tool-split.md) for how this fits the Cowork split.

## start.gg ingest

`sync/startgg-client.js` wraps the GraphQL API with a sliding-window limiter
capped at 75 requests/minute, under start.gg's 80 to leave headroom.

`sync/ingest.js` runs the sync:

1. Resolve the tournament slug, pick the Street Fighter event if there are several
2. Upsert the tournament row on `startgg_event_id`
3. Page through standings, upsert players, write placements with computed points
4. Delete and re-insert sets and games for that tournament, then stamp `synced_at`

Step 4 is a full replace rather than an upsert, which keeps re-syncs clean when a
bracket is corrected on start.gg after the fact.

Gamertags are stripped of control characters and HTML metacharacters and capped
at 64 chars on the way in, so an attacker-chosen start.gg tag can't carry markup
into the database.

Character IDs are mapped to names in `sync/ingest.js` and names to art in
`sync/characters.js`. **Both need updating when Capcom ships a new DLC
character** — icons come from start.gg's CDN, banners are local files in
`public/img/characters/`.

## Overlay and scoreboard app

Two ways to drive the stream graphics, sharing the same `overlay/` HTML:

**StreamControl** — the original path. Drop `overlay/` next to StreamControl's
`sc/` folder, put the API key in `overlay/config.js`, and point OBS at
`scoreboard.html` as a local file. The overlay polls `streamcontrol.json` twice
a second and only calls the API when player names actually change.

**Scoreboard app** (`scoreboard-app/`) — an Electron app that replaces
StreamControl. It runs its own Express server on `127.0.0.1:4455` serving the
overlay plus `/state` and `/config`, and provides a control UI for names and
scores. Bound to loopback specifically so the API key and scoreboard state
aren't reachable from the venue LAN.

Config lives in the Electron user-data directory, not the repo, so the packaged
build ships without secrets.

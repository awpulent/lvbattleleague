# LV Battle League — project context

Rankings site and stream tooling for a weekly SF6 league in Las Vegas.
Express 5 + EJS + PostgreSQL, deployed to DigitalOcean App Platform at
lvbattleleague.com.

## Scope of this repo

**This repo is the site, and league operations run from here too.** Code,
schema, config, builds, deploys, plus the weekly sync, season admin, and the
raffle — through `/admin`, `tools/sync-tournament.ps1`, or the MCP endpoint
(see [`docs/mcp.md`](docs/mcp.md)). There is no separate Cowork skill or ops
folder any more; this repo and its docs are the single source of truth.

Destructive league admin (`clear-season`, `merge-players`, `multiply-points`)
has no undo, so run it from a machine you control, never from a chat surface on
a phone.

## Read these before changing things

- [`docs/architecture.md`](docs/architecture.md) — data model, request flow, auth
- [`docs/scoring.md`](docs/scoring.md) — points math, drop-worst-week
- [`docs/operations.md`](docs/operations.md) — sync, season admin, deploys

## Hazards

**`DATABASE_URL` in `.env` points at production.** `db/config.js` reads only that
variable; `LOCAL_DATABASE_URL` is present but unused. `server.js` migrates
whatever it connects to before listening, so `npm run dev` can migrate prod. Use
`docker compose up`, or override per-command:

```bash
DATABASE_URL="$LOCAL_DATABASE_URL" npm run dev
```

**Don't run destructive admin endpoints against production without asking.**
`/admin/clear-season`, `/admin/merge-players`, and `/admin/multiply-points` have
no undo.

**`multiply-points` matches tournaments by name**, and week names repeat across
seasons. It will happily scale "Week 4" in every season at once.

**Local `.env` has no plain `ADMIN_SECRET` or `OVERLAY_API_KEY`** — only the
`_PROD` variants for curling production. A local server starts with admin
rejecting everything and `/api` returning 401.

## Conventions

- Reads go in `queries/`, writes to tournament data go in `sync/`. Keep the split.
- `mcp/tools.js` is the MCP connector's entire surface. Adding a tool there
  gives any connected Claude client a new capability — keep destructive
  operations out, and set
  `readOnlyHint`/`destructiveHint` on everything.
- Parameterized SQL only. No string interpolation into queries, anywhere.
- Secrets travel in the `Authorization` header, never the query string. This was
  a deliberate change during the security review — don't reintroduce `?key=`.
- `app.set('trust proxy', 1)` must stay `1`. `true` lets clients spoof
  `X-Forwarded-For` and defeats IP rate limiting.
- Schema changes go in `migrations/` via `node-pg-migrate`. `db/schema.sql` only
  seeds the compose container and is not the source of truth.
- Points are written at sync time, not computed on read. Changing scoring rules
  means re-syncing or using `multiply-points`.
- No client framework, no build step for the web app. Keep it that way.

## Testing

There is no test suite. Verification is syntax checks and hitting endpoints:

```bash
node -c server.js
curl -H "Authorization: Bearer $OVERLAY_API_KEY_PROD" \
  "https://lvbattleleague.com/api/players/search?name=PRO7OTYPE"
```

**npm resolves to the Windows install under WSL** (`/mnt/c/Program Files/nodejs/`,
Windows prefix) and there is no Linux npm. Install and audit through a container
instead, which also matches production's Node 20:

```bash
docker run --rm -v "$PWD":/app -w /app --user "$(id -u):$(id -g)" \
  node:20-alpine npm install --save <pkg>
```

## Not in git

`security/` (review artifacts), `.env`, `public/img/sponsors/*`, `node_modules/`,
`scoreboard-app/dist/`. The security review from 2026-06-16 lives in `security/`
and its fixes are already applied on `beta`.

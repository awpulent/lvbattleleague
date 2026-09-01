# LV Battle League

Rankings site and stream tooling for a weekly Street Fighter 6 league in Las Vegas.

Tournament results come from start.gg. The site turns them into season standings,
per-player pages, and a live API that feeds the stream overlay during events.

Live at **lvbattleleague.com** (DigitalOcean App Platform).

## What's in here

| Surface | Path | What it is |
|---|---|---|
| Public site | `/` | Season standings, week-by-week results, the season's presenting sponsor |
| Player pages | `/player/:id` | Record, win rate, head-to-head, character usage, match history |
| Admin | `/admin` | Sync tournaments, manage seasons, merge duplicate players, upload sponsor logos |
| Raffle | `/raffle` | Points-weighted prize draw, runs client-side so it survives venue wifi dropping |
| Overlay API | `/api` | JSON for the stream overlay — player search, stats, head-to-head |
| MCP endpoint | `/mcp` | Lets a Claude MCP client run the weekly sync and read standings |
| Scoreboard app | `scoreboard-app/` | Electron app that drives the OBS overlay from a laptop at the venue |

## Stack

Node 20 · Express 5 · EJS · PostgreSQL 16 · `node-pg-migrate`

No build step for the web app — EJS renders server-side, static assets are served
straight out of `public/`.

## Running it

```bash
npm install
cp .env.example .env      # then fill in the values
docker compose up         # app on :3000, Postgres on the internal network
```

Migrations run automatically on server start, so there's no separate migrate step
for a normal boot.

> **Read [`docs/operations.md`](docs/operations.md) before running against a local
> database.** `DATABASE_URL` in the working `.env` points at production, and the
> app migrates whatever it connects to on startup.

## Documentation

- [`docs/scoring.md`](docs/scoring.md) — how points are calculated, drop-worst-week
- [`docs/architecture.md`](docs/architecture.md) — data model, request flow, auth
- [`docs/operations.md`](docs/operations.md) — running a tournament night, sync, deploys
- [`docs/mcp.md`](docs/mcp.md) — the MCP connector: tools, token, connecting a client
- [`CLAUDE.md`](CLAUDE.md) — context for Claude Code

## Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. `sslmode=` in the string switches SSL on |
| `STARTGG_API_TOKEN` | start.gg GraphQL API token |
| `ADMIN_SECRET` | Gates `/admin` and `/raffle`. 16+ random chars |
| `OVERLAY_API_KEY` | Gates `/api`. 24+ random chars |
| `MCP_API_TOKEN` | Gates `/mcp`, the MCP connector. 32+ random chars. Unset disables the endpoint |
| `NODE_ENV` | `production` enables secure cookies |
| `PORT` | Defaults to 3000 |

`POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` are only used by
`docker-compose.yml`; compose refuses to start without a password set.

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

# Claude Code vs Cowork

LVBL runs across two tools. This is the boundary and how to set both sides up.

## The rule

> **Does the task change what the site *is*, or record what the league *did*?**
>
> Changes the site → **Claude Code**
> Records the league → **Cowork**

Code, schema, config, builds, and deploys ship. Recaps, sponsor material, social
copy, and week-to-week results get published or sent. Different jobs, different
tools.

## Two folders

| | `~/projects/lvbattleleague/` | `~/projects/lvbl-league/` |
|---|---|---|
| Contents | Site code, migrations, overlay, scoreboard app | Recaps, sponsor docs, event notes, season plans |
| Claude Code | read/write | never opens it |
| Cowork | read-only, via GitHub connector | read/write, attached folder |
| In git | yes | no (add one if you want history) |

Cowork attaches **only** the ops folder. The repo reaches Cowork through the
GitHub connector, which retrieves file names, file contents, and branch content —
and cannot write. That's what keeps the boundary from eroding: Cowork can read
the code to answer a question, but has no path to edit it.

## Where a task goes

| Task | Tool | Why |
|---|---|---|
| Sync the week's tournament | **Cowork** | Data entry, not code |
| Write the weekly recap | **Cowork** | Published output |
| Sponsor one-pager, outreach, follow-up | **Cowork** | Published output |
| Season recap and standings analysis | **Cowork** | Published output |
| Decide next season's rules | **Cowork** | A league decision |
| *Implement* that rule change | **Claude Code** | It's `sync/points.js` |
| Add a new SF6 DLC character | **Claude Code** | Three code edits |
| Change the overlay or scoreboard app | **Claude Code** | Code |
| Merge duplicate players | **Claude Code** | Destructive, no undo |
| Clear or re-scale a season | **Claude Code** | Destructive, no undo |
| Schema change or migration | **Claude Code** | Code |
| Deploy | **Claude Code** | Code |
| Upload a sponsor logo | **both** | Cowork preps the file in `sponsors/`; you upload it through `/admin` in a browser |

The two edge cases worth internalising:

**Rule changes split.** Deciding that next season drops two weeks instead of one
is league work. Implementing it is a code change in `sync/points.js` plus a doc
change in `docs/scoring.md` plus a skill rebuild. Cowork decides, Claude Code
implements.

**Destructive admin stays here.** `clear-season`, `merge-players`, and
`multiply-points` have no undo. They're rare, they're dangerous, and they belong
on an authenticated curl from a machine you control — not in a chat surface you
might be driving from a phone.

## Cowork setup

### 1. Install the skill

The skill carries league knowledge — scoring rules, the sync workflow, recap and
sponsor templates. It's account-level, so it works in every Cowork session
regardless of which folder is attached.

```bash
./skills/build.sh
```

Syncs `docs/scoring.md` into the skill, validates the frontmatter against
claude.ai's limits, and writes `skills/dist/lv-battle-league.zip`. Upload at
**claude.ai → Settings → Capabilities → Skills** and enable it.

Cowork does **not** read this repo's `CLAUDE.md`, and does not read Claude Code's
`~/.claude` directory. The skill is how league knowledge reaches it.

### 2. Create the project

Cowork → **Projects** → **+** → **Use an existing folder** → `~/projects/lvbl-league`.

Paste the block in [Project instructions](#project-instructions) into the
project's Instructions panel. Add `https://lvbattleleague.com` under Links.

**Attach the ops folder only.** Attaching the repo would put site code inside
Cowork's writable scope and collapse the boundary.

### 3. Connect GitHub

Settings → Connectors → GitHub → add `awpulent/lvbattleleague`. Read-only context
for code questions. It does not retrieve commit history, PRs, or issues.

### A note on surfaces

A project with a local folder starts Cowork sessions on **desktop only**. Once a
session is running it follows your account, so you can check in and steer from
your phone — local files stay reachable through the desktop app as long as it's
running on your machine.

If you want to start sessions from anywhere, the ops folder is what you'd drop.
The skill and the GitHub connector work on every surface either way.

## Weekly event sync from Cowork

**Built.** The app serves an MCP endpoint at `/mcp` (`mcp/`), so Cowork can run
the weekly sync from any surface. What remains is connecting it — see
[Connecting it](#connecting-it).

### How it works

`POST /admin/sync` needs `ADMIN_SECRET`, and Cowork can't read your `.env`.
Putting that secret into project instructions or a skill would store it in the
cloud in plaintext.

Instead the MCP server runs **in-process in the same Express app**, so its tools
call `sync/ingest.js` directly rather than looping back through HTTP. The result:
`ADMIN_SECRET` is not involved at all. The only credential this surface accepts
is `MCP_API_TOKEN`, scoped to the five tools in `mcp/tools.js` and nothing else.

That's a real improvement on the status quo — `sync-tournament.ps1` keeps full
`ADMIN_SECRET` in plaintext at `%USERPROFILE%\.lvbl-sync.txt`, and that secret can
do everything `/admin` can.

| Tool | Hints |
|---|---|
| `sync_tournament(tournamentSlug, seasonId, weekNumber, eventName?, useMultiplier?, attendancePoint?)` | `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: true` |
| `get_sync_status(jobId)` | `readOnlyHint: true` |
| `list_seasons()` | `readOnlyHint: true` |
| `get_standings(seasonId?)` | `readOnlyHint: true` |
| `list_recent_tournaments(seasonId?)` | `readOnlyHint: true` |

`sync_tournament` accepts a bare slug or a full start.gg URL, and returns a
`jobId` immediately rather than holding the request open — a large bracket can
take past a minute, which is too long for a tool call. Poll `get_sync_status`.

Jobs live in process memory and are lost on restart or redeploy. That's fine:
sync is idempotent, so a lost job is re-run rather than repaired.

`sync_tournament` is annotated **destructive** — it deletes and replaces the
event's sets and games and overwrites its placement points. Idempotent for
identical inputs, but re-running with different `useMultiplier` or
`attendancePoint` flags silently rewrites that week's scoring.

Tool errors return only deliberately-raised messages (bad arguments, missing
records, a bad slug). Anything else is logged against a correlation ID and the
caller gets `Tool call failed (ref …)`, so pg and start.gg internals stay in the
process — the same posture as the global error handler.

The destructive admin endpoints are deliberately absent. They have no undo and
stay on an authenticated request from a machine you control.

### Setting the token

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Set it as `MCP_API_TOKEN` in the App Platform dashboard. Leave it unset and
`/mcp` returns 503 for everything — that's how you disable the connector.

### Connecting it

| Type | What it means | Availability |
|---|---|---|
| `static_headers` | Fixed bearer token entered once when adding the connector | **Beta** — gated rollout |
| `oauth_dcr` | OAuth 2.0 + Dynamic Client Registration | Out of the box |
| `oauth_cimd` | OAuth 2.0 + Client ID Metadata Document | Out of the box |
| `none` | Authless | Not appropriate here |

**Status as of 2026-07-21: blocked on Anthropic.** The Add custom connector
dialog offers only Name, Remote server URL, and Advanced settings (OAuth Client
ID / Secret). There is no **Request headers** section, so `static_headers` is not
enabled on this account — it's in beta with a gated rollout.

Early access has been requested from `mcp-review@anthropic.com`. The server
already implements that mode (bearer token, `401` + `WWW-Authenticate`), so if
it's enabled the connector works with no further code: choose header
`authorization` and enter `Bearer <MCP_API_TOKEN>`, **including the word `Bearer`
and the space** — Claude sends the value verbatim and adds no scheme.

### Fallback: OAuth with pre-registered credentials

If early access is declined, the Advanced settings fields are the path. Anthropic
accepts "a `registration_endpoint` (DCR), `client_id_metadata_document_supported:
true` (CIMD), **or** pre-registered credentials" — so supplying a client ID and
secret there means **neither DCR nor CIMD is needed**, which removes the largest
part of the build.

What would still have to be built:

| Piece | Detail |
|---|---|
| Protected resource metadata | `/.well-known/oauth-protected-resource/mcp` and the unsuffixed path |
| Auth server metadata | `/.well-known/oauth-authorization-server`, advertising `code_challenge_methods_supported: ["S256"]` |
| `/oauth/authorize` | Consent + authorization code, bound to the PKCE challenge and the `resource` value |
| `/oauth/token` | `authorization_code` and `refresh_token` grants, form-urlencoded, verifies PKCE and client secret |
| `401` change | Add `resource_metadata="…"` to the `WWW-Authenticate` header |
| Token storage | A migration — in-memory tokens would force a reconnect after every deploy |

Consent can reuse the existing admin login, so there's no user system to build.
`mcp/tools.js` wouldn't change at all; this is entirely `mcp/index.js` plus new
routes. Keep `MCP_API_TOKEN` working alongside it so a broken OAuth flow can't
lock the operator out.

Never put the token in the connector URL. The MCP spec prohibits it and URLs leak
through logs and history.

### If it doesn't connect

- Anthropic's outbound traffic comes from `160.79.104.0/21`
- The site's global limit is 120 req/min and `/mcp` adds its own 60/min keyed on
  the auth header. Polling `get_sync_status` sits well inside both
- `/mcp` returns 503 when `MCP_API_TOKEN` is unset — check the App Platform env
- Transport is stateless Streamable HTTP, so no session affinity is needed if
  App Platform scales to more than one instance

### Before it's connected

The skill handles both states. With no LVBL tools in the session it tells you to
run `tools/sync-tournament.ps1`, then picks up afterwards — confirming the week
landed and writing the recap.

## Project instructions

Paste into the Cowork project's Instructions panel. The skill carries the detail;
this is the project layer on top.

```
LV Battle League (LVBL) is a weekly Street Fighter 6 league in Las Vegas. I run
it. Rankings are public at lvbattleleague.com.

Use the lv-battle-league skill for league work — it has the scoring rules, the
sync workflow, and the recap and sponsor templates.

This folder is league operations: event notes, recaps, sponsor material, season
plans. Save work in the matching subfolder, named with the season and week it
covers, like recaps/s3-w4.md.

You are not working on the site itself. Site code, deploys, migrations, schema,
the overlay, and the scoreboard app are handled in Claude Code on my machine. You
can read the repo through the GitHub connector to answer questions about how
something works, but if a task needs the code changed, tell me — don't work
around it.

Destructive league admin (clearing a season, merging duplicate players, rescaling
points) is also not yours. Hand those to me.

Check player tags against lvbattleleague.com before publishing anything. Never
put real secrets in a document. If you can't source a number, leave it out and
tell me what's missing.
```

## Maintenance

The skill is a snapshot on your account, not a live link to this repo. After
changing scoring rules or league workflows:

```bash
./skills/build.sh
```

then re-upload and re-enable. `references/scoring.md` is synced from
`docs/scoring.md` by the build, so the repo stays the source of truth for rules.

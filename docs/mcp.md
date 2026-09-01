# MCP connector

The app serves a Model Context Protocol endpoint at `/mcp` (`mcp/`), so a
Claude client — a claude.ai custom connector, or Claude Code with a remote MCP
server configured — can run the weekly sync and read standings without ever
holding the admin secret.

## How it works

`POST /admin/sync` needs `ADMIN_SECRET`, and a chat client can't read your
`.env`. Putting that secret into project instructions would store it in the
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

## Setting the token

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Set it as `MCP_API_TOKEN` in the App Platform dashboard. Leave it unset and
`/mcp` returns 503 for everything — that's how you disable the connector.

## Connecting it

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

## Fallback: OAuth with pre-registered credentials

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

## If it doesn't connect

- Anthropic's outbound traffic comes from `160.79.104.0/21`
- The site's global limit is 120 req/min and `/mcp` adds its own 60/min keyed on
  the auth header. Polling `get_sync_status` sits well inside both
- `/mcp` returns 503 when `MCP_API_TOKEN` is unset — check the App Platform env
- Transport is stateless Streamable HTTP, so no session affinity is needed if
  App Platform scales to more than one instance

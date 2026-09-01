# Operations

Running a league night, syncing results, and deploying.

## The one thing that will bite you

`DATABASE_URL` in the working `.env` points at **production**, and `db/config.js`
reads only that variable. `LOCAL_DATABASE_URL` sits in the same file but nothing
reads it.

So `npm start` or `npm run dev` on your machine connects to the live database —
and because `server.js` migrates whatever it connects to before listening, a
local run can migrate production.

To work against local Postgres, either use `docker compose up` (which sets
`DATABASE_URL` to the compose service and never sees your `.env` value for it),
or override explicitly for the command:

```bash
DATABASE_URL="$LOCAL_DATABASE_URL" npm run dev
```

The `.env` also has `ADMIN_SECRET_PROD` and `OVERLAY_API_KEY_PROD` for curling
production, but no plain `ADMIN_SECRET` or `OVERLAY_API_KEY`. A local server
therefore starts with the admin surface rejecting everything and `/api` returning
401. That's intentional, but it means you have to set them yourself to exercise
either surface locally.

## Tournament night

1. Run the bracket on start.gg as usual
2. Drive the stream graphics with the scoreboard app (or StreamControl + `overlay/`)
3. After the bracket finishes, sync it
4. Check the standings on the site
5. Run `/raffle` if there's a prize draw

### Syncing a finished tournament

The friendly path is `tools/sync-tournament.ps1` from Windows PowerShell. It
prompts for the start.gg URL, season, week, and scoring flags, remembers the
admin secret in `%USERPROFILE%\.lvbl-sync.txt`, and shows a confirmation before
firing.

The same thing by hand:

```bash
curl -X POST https://lvbattleleague.com/admin/sync \
  -H "Authorization: Bearer $ADMIN_SECRET_PROD" \
  -H "Content-Type: application/json" \
  -d '{"tournamentSlug":"fight-night-169-las-vegas-nv","seasonId":2,"weekNumber":3,"useMultiplier":true,"attendancePoint":false}'
```

`eventName` is optional and overrides the default "Week N" label.

Sync is idempotent — re-running it overwrites placements and fully replaces sets
and games for that tournament. Safe to re-run if a bracket gets corrected on
start.gg after the fact.

Expect a summary back with entrant, set, game, and player counts. If the counts
look wrong, the usual cause is the wrong event being picked from a multi-event
tournament; check the `event` field in the response.

## Season management

All of these need `Authorization: Bearer $ADMIN_SECRET_PROD` and
`Content-Type: application/json`, posted to `https://lvbattleleague.com`.

| Task | Endpoint | Body |
|---|---|---|
| Create a season | `POST /admin/create-season` | `{"name":"Season 3","isActive":true}` |
| Toggle drop-worst-week | `POST /admin/update-season` | `{"seasonId":3,"dropWorstWeek":false}` |
| Make a season active | `POST /admin/update-season` | `{"seasonId":3,"isActive":true}` |
| Rename a season | `POST /admin/rename-season` | `{"seasonId":3,"name":"Season 3 - Summer"}` |
| Rename a week | `POST /admin/rename-tournament` | `{"seasonId":3,"weekNumber":4,"name":"Anniversary Special"}` |
| Scale a week's points | `POST /admin/multiply-points` | `{"tournamentName":"Week 4","multiplier":2}` |
| Wipe a season's results | `POST /admin/clear-season` | `{"seasonId":3}` |

Creating a season with `isActive: true` deactivates the others in the same
transaction, so there's never more than one active season.

`clear-season` deletes tournaments, placements, sets, and games for that season.
Players and their aliases survive. There is no undo — the only way back is
re-syncing every week.

`multiply-points` matches tournaments **by name**, and week names aren't unique
across seasons. If "Week 4" exists in more than one season it will scale all of
them. Check the `tournaments` array in the response to confirm what it touched.

## Duplicate players

Historical Sheet imports and start.gg accounts drift apart, especially when
someone changes their tag. Find them:

```bash
curl -H "Authorization: Bearer $ADMIN_SECRET_PROD" \
  https://lvbattleleague.com/admin/duplicates
```

Each group shows placement and set counts per candidate. Keep the one with real
data — normally the one with a `startgg_id` — and merge the other into it:

```bash
curl -X POST https://lvbattleleague.com/admin/merge-players \
  -H "Authorization: Bearer $ADMIN_SECRET_PROD" \
  -H "Content-Type: application/json" \
  -d '{"keepId":68,"removeId":142}'
```

The merge moves placements (skipping weeks where both already have a result),
sets, games, and aliases, adds the removed player's display name as an alias,
then deletes the source row. Not reversible.

## The raffle

`/raffle` is admin-gated and defaults to the active season. Each player's season
points become weighted entries, using the same drop-worst-week setting the public
standings use, so what's drawn matches what's on screen.

Entries are baked into the rendered HTML and the draw runs entirely client-side.
Once the page has loaded it keeps working if venue wifi drops. There's a "not
present" redraw for winners who've already left.

`?season=<id>` draws from a different season.

## Deploying

Push to the branch DigitalOcean App Platform watches and it builds from the
`Dockerfile`. Migrations run on boot; if one fails the process exits non-zero and
the deploy doesn't go live.

Secrets are set in the App Platform dashboard, not in the repo. `.env` is
gitignored and stays that way.

`Dockerfile` builds on `node:20-alpine`. Local development on Node 18 mostly
works but isn't what ships — if something behaves differently in production,
check the Node version first.

## Adding a new SF6 character

Capcom DLC drops require three edits:

1. `sync/ingest.js` — add the start.gg character ID to `CHARACTER_MAP`
2. `sync/characters.js` — add the start.gg CDN icon URL to `CHARACTER_ICONS`
3. `public/img/characters/` — drop in the banner art, then map it in
   `CHARACTER_BANNERS`

Get the ID and icon URL from start.gg's `videogame` GraphQL query. Without step
1 the character shows up as "Character 2946" in match history.

## Sponsors

Each season shows exactly one presenting sponsor, rendered under a "proudly
sponsored by" heading below the season selector. This is two steps: register the
sponsor, then point a season at it.

Upload logos through the `/admin` page rather than by hand. Uploads are capped at
2 MB, restricted to png/jpg/webp/gif by both MIME type and extension, and land in
`public/img/sponsors/` — which is gitignored, so logos live only on the deployed
volume. Re-uploading after a rebuild may be necessary.

Registering a sponsor does not put it on the site. Assign it from the Seasons
list on the `/admin` page: pick the sponsor in that season's dropdown and save,
or choose "No sponsor" to clear it. The same thing by hand:

```bash
curl -X POST https://lvbattleleague.com/admin/update-season \
  -H "Authorization: Bearer $ADMIN_SECRET_PROD" \
  -H "Content-Type: application/json" \
  -d '{"seasonId": 3, "sponsorId": 2}'
```

`"sponsorId": null` clears it, and the block disappears from that season. A
sponsor can present more than one season without re-uploading its logo — point
each season at the same ID.

Sponsors are a registry, not a per-season record: deleting one nulls out every
season pointing at it (`ON DELETE SET NULL`), so a sponsor that presented a past
season should be left in place rather than deleted. The `is_active` and
`display_order` columns are leftovers from the old all-seasons logo bar and no
longer affect rendering.

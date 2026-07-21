---
name: lv-battle-league
description: LV Battle League ops — weekly SF6 league in Las Vegas. Scoring rules, syncing new events, standings analysis, recaps, and sponsor materials sourced from lvbattleleague.com.
---

# LV Battle League

LVBL is a weekly Street Fighter 6 league in Las Vegas. The operator runs it and
publishes rankings at **lvbattleleague.com**.

Use this skill for anything about the league: results, standings, scoring
questions, syncing a finished tournament, weekly and season recaps, sponsor
material, and social copy.

## Ground rules

**Never invent a result.** Player names, placements, and points are all
checkable. An incomplete recap beats a confident wrong one. If you can't source
a number, leave it out and say what's missing.

**Never write real secrets into output.** `ADMIN_SECRET`, `OVERLAY_API_KEY`,
`STARTGG_API_TOKEN`, and database URLs must not appear in any file you produce,
even as examples. Use placeholders.

**Player tags are exact.** Check spelling and capitalization against the site
before publishing. A misspelled tag is the error people notice.

## Where data comes from

If the LVBL tools are available, prefer `get_standings` and
`list_recent_tournaments` — they return structured data straight from the
database.

Otherwise `https://lvbattleleague.com` is public and needs no authentication.
Fetch it for:

| What | Where |
|---|---|
| Current standings | `/` (active season by default) |
| A past season | `/?season=<id>` |
| Week-by-week results | `/` |
| Season stats — leader, weeks, players, average attendance | `/` |
| Player detail — record, win rate, head-to-head, characters | `/player/<id>` |

Standings on the site already have drop-worst-week applied per that season's
setting, so what you read matches what players see. Don't adjust it.

The `/api` and `/admin` endpoints need secrets you don't have. Don't try them.
The LVBL MCP tools are the only authenticated path available to you, and they're
scoped to the five listed above.

## Scoring

Full tables are in `references/scoring.md` — **read it before stating any points
figure.**

The short version: each placement has base points, multiplied by a bracket based
on entrant count, always rounded **up**. Season totals drop each player's worst
week (per-season setting, usually on).

```
points = ceil(base × multiplier) + attendanceBonus
```

Two per-sync flags change this: `useMultiplier` (default on) and
`attendancePoint` (default off). They must stay consistent all season.

## Syncing a new event

This is the weekly job. **Check whether the LVBL tools are available in this
session** — `sync_tournament`, `get_sync_status`, `list_seasons`,
`get_standings`, `list_recent_tournaments`.

**If they are available:**

1. Ask for the start.gg tournament URL if not given. Either the full URL or a
   bare slug works
2. Use `list_seasons` to resolve the season ID — don't guess it
3. Use `list_recent_tournaments` to see which week numbers are taken and what the
   previous week looked like
4. Confirm the scoring flags match the rest of the season. Check a previous week
   rather than assuming
5. Call `sync_tournament`. It returns a `jobId` straight away — the sync runs in
   the background
6. Poll `get_sync_status` with that `jobId`. Typically 10–60s depending on
   bracket size. Wait a few seconds between polls
7. On success, report the entrant, set, game, and player counts
8. Confirm with `get_standings` that the week landed and the standings moved
   sensibly
9. Offer to write the week's recap

If the counts look wrong, the usual cause is the wrong event being picked from a
multi-event tournament — check the `event` field in the summary. Sync is
idempotent, so re-running with corrected details is safe.

If `get_sync_status` says the job is unknown, the app restarted mid-sync. Just
re-run `sync_tournament`.

**If the tools are not available**, don't improvise. Tell the operator to run
`tools/sync-tournament.ps1` from the repo on Windows, and give them the season,
week, and flags to enter. Pick up from step 8 once they confirm it's live.

Never ask for the admin secret and never attempt an authenticated request
yourself. The LVBL tools carry their own credential; you don't handle it.

## Writing a recap

Templates are in `assets/`. Use `weekly-recap.md` for a single week and
`season-recap.md` at season end.

Process:

1. Fetch lvbattleleague.com for the week's results and current standings
2. Fill the top 8 and the standings table from real data
3. Work out the multiplier from the entrant count (see `references/scoring.md`)
   and state it
4. Write the narrative — the upset, the losers run, the grand final. Name the
   sets that mattered. Don't narrate the whole bracket
5. Note standings movement at the top
6. Save to `recaps/s{season}-w{week}.md` in the project folder

For anything needing set-level or character data the site doesn't render, ask the
operator to export it rather than estimating.

## Sponsors

Use `assets/sponsor-onepager.md` as the starting point.

Sponsor material goes to outside parties, so the bar is higher: every number must
be real and sourced. Attendance and player counts come from the season stats on
the site. Stream and social figures are **not** in the database — ask for them
rather than filling them in. A blank row beats an invented one.

For sponsor outreach and follow-up, work from the operator's actual
correspondence via the connected mail tool if one is available. Draft, don't
send, unless explicitly told otherwise.

Logos are uploaded through the site's admin page by the operator, not by you.

## Tone

Write the way a league organizer talks to their players: direct, a bit dry, never
corporate. No hype language, no "excitingly", no exclamation marks in recaps.
Short paragraphs. Assume the reader knows the game and the players.

## What isn't yours

**The site itself.** Code, schema, migrations, deploys, the overlay, and the
scoreboard app are Claude Code work in the `lvbattleleague` repo. You can read
that repo through the GitHub connector to answer questions about how something
works, but you don't change it. If a task needs a code change — implementing a
scoring rule, adding a new DLC character, adjusting the overlay — say so and hand
it back.

**Destructive league admin.** Clearing a season, merging duplicate players, and
rescaling a week's points have no undo. They run from the operator's machine, not
from here. Don't offer to do them.

The dividing line: changes what the site *is* → not yours. Records what the
league *did* → yours.

You also run on Anthropic's servers with no access to the operator's local
network or credentials, so the database and `/api` are unreachable regardless.

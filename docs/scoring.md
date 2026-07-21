# Scoring

The league scores each week on placement, scaled by how many people showed up.
Season standings are the sum of weekly points, usually with each player's worst
week dropped.

Implementation: [`sync/points.js`](../sync/points.js) for per-week points,
[`queries/standings.js`](../queries/standings.js) for the season roll-up.

## Base points by placement

| Placement | Points |
|---|---|
| 1st | 25 |
| 2nd | 18 |
| 3rd | 13 |
| 4th | 10 |
| 5th–6th | 7 |
| 7th–8th | 5 |
| 9th–12th | 3 |
| 13th and below | 0 |

## Attendance multiplier

Bigger brackets are worth more. The multiplier is picked from the entrant count:

| Entrants | Multiplier |
|---|---|
| 20+ | 1.5 |
| 18–19 | 1.3 |
| 16–17 | 1.2 |
| 12–15 | 1.0 |
| 8–11 | 0.8 |
| 6–7 | 0.75 |
| Under 6 | 0.5 |

## The formula

```
points = ceil(base × multiplier) + attendanceBonus
```

Rounding is always **up**, so a 0.75 multiplier on a 13-point 3rd place gives 10,
not 9.75.

Two flags change this, both set per-sync:

- **`useMultiplier`** (default on) — turn it off to award flat base points. Used
  when a week shouldn't be weighted by turnout.
- **`attendancePoint`** (default off) — adds 1 point to everyone who entered,
  including players who finished 13th or lower and otherwise score zero.

Pick one answer for each and keep it the same all season. Changing mid-season
makes weeks incomparable, and there's no automatic re-scoring.

### Worked examples

| Situation | Math | Result |
|---|---|---|
| 1st, 22 entrants | ceil(25 × 1.5) | 38 |
| 3rd, 14 entrants | ceil(13 × 1.0) | 13 |
| 5th, 9 entrants | ceil(7 × 0.8) | 6 |
| 15th, 20 entrants | no base points | 0 |
| 15th, 20 entrants, attendance point on | 0 + 1 | 1 |

## Drop worst week

Each season carries a `drop_worst_week` flag, default **on**. When on, a player's
single lowest-scoring week is excluded from their season total.

Players with only one recorded week keep it — otherwise attending once would
score zero and they'd vanish from the standings entirely.

The flag is per-season and can be toggled from `/admin` at any time. Standings
recompute on read, so flipping it takes effect immediately with no re-sync.

## Fixing points after a sync

Points are written to the `placements` table at sync time, not computed on the
fly. If a week was synced with the wrong settings:

- **Wrong multiplier setting** — re-sync the tournament with the right flags.
  Sync is idempotent, so placements are overwritten in place.
- **One-off adjustment** — `POST /admin/multiply-points` scales every placement
  in a named tournament by a factor, rounding up to match league rules.
- **Start over** — `POST /admin/clear-season` wipes tournaments, placements, sets,
  and games for a season so it can be rebuilt from scratch. Players survive.

See [`docs/operations.md`](operations.md) for the commands.

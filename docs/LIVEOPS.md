# LIVEOPS.md — the deterministic event calendar

Client-side, UTC-deterministic (every player sees the same calendar, no server):
`src/core/liveops.ts` is a registry of `{window predicate, reward-lane multipliers}` rows
plus a generic **schedule engine** that turns those pure predicates into live countdowns
and an upcoming-window forecast. The hub's **LIVE OPERATIONS console**
(`LiveEventsStrip`) is the broadcast desk: what's live now (with exact boosts + "ends in"
countdowns) and the UP NEXT rail.

## The calendar

| Event | Window (UTC) | Effect |
|---|---|---|
| Weekend Surge | Sat + Sun | Daily Run clear cores ×1.5 |
| Gauntlet Week | week rotation ⅓ | Boss Rush cores ×1.25 |
| Depth Week | week rotation ⅓ | Infinite cores ×1.25 |
| Campaign Offensive | week rotation ⅓ | Campaign stage cores ×1.15 |
| Mutation Wednesday | every Wed | Gene Essence income ×1.5 |
| Harvest Moon | 1st–3rd of each month | container material drops ×1.5 |
| Bloom Cycle | 21st–27th of Mar/Jun/Sep/Dec | all core lanes ×1.1 · Gene Essence ×1.25 |

Exactly one weekly spotlight is always live (`spotlightOf` rotates on a stable week
index), so the console never sits empty; Wednesday gives the mid-week beat, the month
opens with a materials peak, and the quarterly Bloom is the festival — overlapping
windows **stack multiplicatively** (a weekend inside the Bloom IS the event).

## Reward lanes (`LiveEventMods`)

`dailyCoreMult · rushShardMult · endlessShardMult · campaignShardMult` fold in
`meta.finishRun` (mode-matched core income). `essenceMult` folds where essence is BORN —
`openContainer`'s duplicate conversion / Essence Trace / Gene Bleed and finishRun's
doctrine essence — and `materialsMult` folds the container bonus material drop. Each
fold scales the SOURCE scalar before it feeds both the reveal item and the grant, so
the ceremony always shows exactly what was banked. `LANE_LABELS` + `eventBoosts()` derive
the console's "×1.5 Daily Cores" chips from the mods bag — a new lane surfaces in the UI
with zero UI work.

## The schedule engine (§forecast)

Generic over ANY pure predicate — window edges are found by scanning forward in UTC-hour
steps (every shipped window is day-granular, so hour scanning lands the exact midnight
edge), preserving "adding an event = one registry row":

- `liveWindows(d)` → each active event + its `endsAt` (the console's countdowns).
- `upcomingWindows(d, horizonDays = 35)` → every inactive event's next window, soonest
  first (the UP NEXT rail). Beyond-horizon events (a far-off quarterly) simply drop out.
- `windowEnd` / `nextWindow` / `untilText` ("2d 14h", hour-resolution by design).

## The console (`LiveEventsStrip`, Command Center `main` zone)

Pulsing LIVE dot · live event cards (accent icon medallion, data-driven boost chips, an
"ends in" pill, a slow broadcast sheen — disabled under `prefers-reduced-motion`) · the
muted dashed UP NEXT chips. A 60-second heartbeat keeps countdowns honest; the forecast
scan memoizes per UTC hour. `.liveops-head/-k/-next` styles are shared with the
Contracts + Infestation cards.

## Discipline

- **Adding an event = one registry row** (pure predicate + mods bag). Seasonal
  date-range events use the same shape (Bloom Cycle is the shipped example).
- **×1 baseline everywhere**: an empty calendar is byte-identical to no framework.
- **Tests never ride the wall clock**: the module clock pins to Tue 2026-01-06 under
  vitest — and every calendar addition MUST keep that Tuesday spotlight-only (a pinned
  test asserts it), so gameplay tests never see a live bonus.
- Display is data-driven from the same defs — new events appear in the console (cards,
  boosts, countdowns, forecast) with zero UI work.

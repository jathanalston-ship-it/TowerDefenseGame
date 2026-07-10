# LIVEOPS.md — the deterministic event calendar

Client-side, UTC-deterministic (every player sees the same calendar, no server):
`src/core/liveops.ts` is a registry of `{window predicate, reward-lane multipliers}` rows
plus a generic **schedule engine** that turns those pure predicates into live countdowns
and an upcoming-window forecast. The hub's **LIVE OPERATIONS console**
(`LiveEventsStrip`) is the broadcast desk: what's live now (with exact boosts + "ends in"
countdowns) and the UP NEXT rail.

## The calendar

Every row is a `{category, window predicate, mods bag}` — the console groups + sorts by
`category` (peak → spotlight → hunt → surge) and the headline band names the heaviest live one.

| Event | Category | Window (UTC) | Effect |
|---|---|---|---|
| Weekend Surge | surge | Sat + Sun | Daily Run clear cores ×1.5 |
| Gauntlet Week | spotlight | week rotation ¼ | Boss Rush cores ×1.25 |
| Depth Week | spotlight | week rotation ¼ | Infinite cores ×1.25 |
| Campaign Offensive | spotlight | week rotation ¼ | Campaign stage cores ×1.15 |
| Apex Week | spotlight | week rotation ¼ | Mega Boss Ichor ×1.4 |
| Mutation Wednesday | surge | every Wed | Gene Essence income ×1.5 |
| Spore Tide | surge | Tue + Thu | in-run loot ×1.3 |
| Prime Hunt | hunt | every Fri | Mega Boss Ichor ×1.5 |
| Harvest Moon | peak | 1st–3rd of each month | container material drops ×1.5 |
| Reclamation Days | peak | 11th–13th of each month | materials ×1.35 · loot ×1.2 |
| Bloom Cycle | peak | 21st–27th of Mar/Jun/Sep/Dec | all core lanes ×1.1 · Gene Essence ×1.25 · Mega Ichor ×1.25 |

Exactly one weekly spotlight is always live (`spotlightOf` rotates a **4-way** stable week
index — the 4th slot, Apex Week, spotlights the raid roster instead of a mode's core lane),
so the console never sits empty; the recurring surge/hunt beats fill the weekdays, the month
opens with a materials peak and refreshes mid-month, and the quarterly Bloom is the festival —
overlapping windows **stack multiplicatively** (a weekend inside the Bloom IS the event).

## Reward lanes (`LiveEventMods`)

`dailyCoreMult · rushShardMult · endlessShardMult · campaignShardMult` fold in
`meta.finishRun` (mode-matched core income); `megaIchorMult` fatuens every Mega Boss bounty
there too. `essenceMult` folds where essence is BORN — `openContainer`'s duplicate conversion /
Essence Trace / Gene Bleed and finishRun's doctrine essence — `materialsMult` folds the
container bonus material drop, and `lootMult` folds the run-end loot-point income (the
reconciliation point over live banking). Each fold scales the SOURCE scalar before it feeds
both the reveal item and the grant, so the ceremony always shows exactly what was banked.
`LANE_LABELS` + `eventBoosts()` derive the console's "×1.5 Daily Cores" chips from the mods bag
— a new lane surfaces in the UI with zero UI work.

## Weekly Directives (§directives) — the cumulative ladder

The retention layer BETWEEN the passive calendar and the single-run Champion Contracts. Where
a Contract is "do X in ONE run", a Directive is "do X ACROSS the week": `src/core/directives.ts`
holds a pool of cumulative objectives (kills / wins / waves / boss + mega kills / weak points /
damage / flawless wins / towers), **three rotate per UTC week** on the same `weekIndex` (a
different stride from Contracts so the boards don't move in lockstep), and progress banks from
every run's FACTS at `finishRun` via `accrueDirectives`. Milestone rewards (cores/essence/a
Bio-Container) claim per completed row in the console; clearing all three unlocks the shared
weekly **CAPSTONE**. The ledger is `save.directives { week, progress, claimed }` (v32) — a
rolled-over week resets the board; a claim is idempotent and guarded by the security registry
(`directive.claim`). Golden-safe by construction: a fresh save has zero progress and every
reward is meta-only, so no pinned-seed run moves. The board is a home widget (`DirectivesCard`,
progress bars + claim), gated behind the Daily reveal like Contracts.

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
- **Tests never ride the wall clock**: the module clock pins to **Mon 2026-01-19** under
  vitest — chosen so the ONLY active window is the `depth` spotlight, whose sole lane
  (endless cores) a stage-mode gameplay run never reads. Every calendar addition MUST keep
  that Monday to that one spotlight (a pinned test asserts each gameplay lane is ×1), so
  golden/meta/persona runs never see a live bonus on a lane they consume.
- Display is data-driven from the same defs — new events appear in the console (cards,
  boosts, countdowns, forecast) with zero UI work.

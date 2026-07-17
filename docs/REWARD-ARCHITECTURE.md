# REWARD-ARCHITECTURE.md — the Reward Loop Initiative (master pass)

**Philosophy: Reward Frequency > Reward Quantity.** The hub should be as engaging as the
battlefield because progression loops interlock — every session flows through unlocking,
claiming, opening, upgrading, and collecting before returning to play. This pass did NOT
add rewards or inflate progression speed: it classified every existing reward pathway into
five loops, made the no-dead-end law machine-enforced, rebalanced two lumps into drips at
exactly equal value, and taught the guidance layer to hand sessions across loops.

## §loops — the five-loop map (`src/core/rewardLoops.ts`)

One registry row per reward pathway (~40 rows): `{id, name, loop, feeds[], cadence, nav,
gives, at}`. The `loop` is where the ACTION lives; `feeds` are the loops its OUTPUT
advances. The five loops and their members:

| Loop | Sources (action surfaces) |
|---|---|
| **Reward** | five run modes, Bio-Containers, Run Caches, Bio-Roulette, Daily Bio-Cache, Hive Production, Expeditions, Field Research |
| **Progression** | Battle Pass, Quests, Weekly Directives, Contracts, Evolution Tracks, Achievements, Genome Rank, Account Level, feature unlocks, tutorial milestones |
| **Upgrade** | Tower Lab, Hero Lab, Evolution HQ, Gene Archive, Armory, Mulligans, Hive organs, Adaptation Chamber |
| **Collection** | codex rank-ups, gene discovery, Wardrobe, boss trophies, Gear Codex |
| **Economy** | Splice Market, Ichor Exchange, Auction House, Premium Store, Infestation passives |

**Machine-enforced laws** (`rewardLoopProblems()`, pinned in `rewardLoops.test.ts`):
- **No dead ends** — every source feeds ≥1 loop besides its own; a future source that
  feeds nothing fails the build.
- **Multi-timescale** — every loop pays at ≥2 cadences (perRun beside daily/passive/
  milestone), so something is always close to ready.
- **Cross-fed** — every loop is fed by another loop's output.
- **Full cycle** — from any starting loop, a chain can visit all five (`fullLoopChain`),
  which is the spec's Boss Rush → Roulette → Genes → Collection → Rank → Mastery →
  Upgrade → Campaign figure, derived live so it can never drift.

## §chaining — sessions flow across loops

- **Loop rotation** (`state/recommendations.ts` + `state/loopFlow.ts`): every
  recommendation now carries its loop (derived from its nav — sources can't
  mis-classify). After the player touches a loop (`Hub.go` notes it, session-scoped,
  never saved), other loops' actions get +8 and same-loop actions −6 — deliberately
  INSIDE one rank band, so a waiting claim still outranks a rotated browse. Rotation
  breaks ties toward flowing across loops; it never nags toward empty screens.
- **Post-claim handoffs** (`NextUp`): already on the Vault and Harvest; now also on the
  Quest Board (everything claimed) and the Season Pass (nothing claimable) — a finished
  claim surface points at the next loop's ready action instead of dead-ending. `NextUp`
  passes `rotateFrom: loopOfNav(exclude)` so the handoff prefers a different loop.
- The Command Center's Recommended-Now strip rotates from the session's last-touched loop.

## §rebalance — value-neutral frequency increases

1. **Sector Survey drip** (`campaignSurveyBonus`, config.ts): the old "+100 ◆ every 5th
   stage" milestone lump now pays `milestoneCore/milestoneEvery` (= 20 ◆) on EVERY first
   clear. Any 5-stage window totals exactly the old lump (pinned to 9 decimal places in
   `rewardLoops.test.ts`), but bonus payout events go 1 → 5 per window. The every-5th
   LANDMARK cadence (map landmarks, authored event finales, Evolution-Cap copy) is
   deliberately untouched — money cadence and landmark cadence are decoupled. The three
   payout previews (meta.finishRun, homeModel, missionControl) share the one helper.
2. **Hive arrival ceremony threshold 30 → 20 min** (`IDLE.ceremonyMinutes`): a returning
   session is greeted by a ripe hopper more often. Pure presentation frequency — accrual
   math and yields untouched (and the threshold stays remote-tunable via
   `ui.arrivalMinMinutes`).

Explicitly NOT touched: loot-meter costs/EV (pinned economy), mode reward lanes
(docs/MODE-IDENTITY.md identity), first-clear/attempt formulas (BALANCE_ARCHITECTURE
protocol), weekly cadences (weekly identity is the point).

## §validation — `npm run sim:rewards`

Four personas × 14 days (daily-commuter, grinder, weekender, idle-farmer), event-level
model over the registry + real config numbers. All bars pass:

| Law | Result |
|---|---|
| Value FLAT | 800 ◆ new vs 800 ◆ old over 40 first clears — exact |
| Frequency UP | 5× survey payout events; arrival ceremonies never decrease |
| Sessions cross loops | touched 1.94–2.03 (≥1.9 bar; the ~8% single-lit-wing sessions correctly stay put) |
| Cross-feed law | session output advances 4.96–5.00 of the 5 loops |
| Rotation | never reduces loop coverage for any persona |
| No terminal loop | every loop hands value onward |

The registry suite additionally pins the architecture laws structurally, and every nav in
the registry is validated against the real hub screens.

## Extension points

- **New reward source** = one `REWARD_SOURCES` row declaring its loop + feeds — the
  build fails if it dead-ends, and rotation/handoffs/docs pick it up automatically.
- **New claim surface** = render `<NextUp exclude={nav}/>` in its "all claimed" state.
- **Future shaping** of the survey drip: `campaignSurveyBonus(stage)` keeps the stage arg
  so a curve can replace the flat drip without touching call sites (the neutrality test
  guards any window's total).

## Known limitations

- Loop rotation is session-scoped presentation state — a reload forgets the last-touched
  loop (by design: it never rides the save or sims).
- The persona sim models the recommendation layer, not pixel-level UI; its readiness
  probabilities are documented assumptions, and the structural laws are separately pinned
  by unit tests that don't depend on them.
- `loopOfNav` maps each hub screen to ONE loop (first registry claimant) — screens hosting
  multiple loops' actions (e.g. bossrush hosts runs and the Roulette) classify by their
  primary identity.

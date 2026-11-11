# HIVE-MIND.md — Hive Intelligence, the in-run best-upgrade executive

> Player-facing name: **HIVE INTELLIGENCE** (the in-run button). Internal name: **hive mind**
> (`src/core/hivemind.ts`) — distinct from `state/hiveIntel.ts`, the HUB's standing intel FEED
> (docs/HIVE-INTEL.md). Same fiction, two organs: the feed ADVISES between runs; the mind ACTS
> inside one. The objective is not automation — it is removing repetitive decision-making while
> the player keeps complete manual control.

## The player contract

Complete Campaign Stage 5 on any difficulty to unlock **HIVE INTELLIGENCE**. Its ON/OFF button
starts off each run — docked on the build console beside Auto Wave / Auto Gene while the console is
up (prep; it used to sit on the board's top edge over the spawn lane — owner playtest 2026-11-11),
in the run-controls strip mid-wave, and on the draft as **◈ Enable Hive Intelligence** / **Stop**.
While on, the hive buys through the existing planner every two simulation seconds, starts waves
after the normal setup countdown, **calls the next wave early** when its forecast says the board
holds the overlap with a wide margin (the HIVE CALL — §hive-call; also with Auto Wave on), and picks
the recommended gene after its visible **three-second** countdown (owner ask 2026-11-11; was ten).
Manual gene picks override the recommendation. Stop Hive Intelligence in the draft or toggle it off
on the battlefield to take control. Pause freezes purchases and wave starts; draft auto-picks wait
while paused. Standalone Auto Wave and Auto Gene preferences are preserved. Each purchase retains its
normal effects and the action ticker. The toggle ends with the run; it does not launch the next
campaign stage or spend hub currencies.

## Architecture (the foundation rule: new systems join for free)

`src/core/hivemind.ts` is a PURE planner over a structural `HiveGame` interface (public Game
members only — no Game import at runtime, no cycles, unit-testable with a stub).

- **`HiveProvider`** — one per purchasable system: `{ id, enumerate(g): HiveAction[] }`.
  A provider returns every legal action with its cost, its **gain**, and an `exec(g)` that
  performs the purchase through the SAME public API the player's click uses (so Power audit,
  ceremonies, stats, determinism all ride the normal path).
- **`registerHiveProvider()`** — the extension point. A future Biomass sink ships its provider
  next to its system and is evaluated from then on; the planner, ranking, execution loop, UI
  and validation never change. Built-in providers:
  1. `branch` — every deployed tower's next branch tier (uncommitted towers: the strongest
     opening branch by authored tier-power, deterministic).
  2. `heroEvo` — every Hero Evolution category's next level (abilities/stats/autocast family).
  3. `autocast` — the one-time hero auto-cast unlock.
  4. `deploy` — every READY conveyor organism onto the best open slot (§placement).
  5. `merge` — every READY organism strain-merged into its best same-kind target.
  6. `favorite` — the account's FAVORITE organism onto the best open slot, on the universal deploy
     curve — OPENING ONLY, while the board is thin (§opening — before Batch G the mind could only place
     what the conveyor offered; past the opening the conveyor keeps the board varied).
  7. `splice` — a SPLICE (docs/CARDS.md §splice) when the bank reaches its price: valued at the run's
     own average drafted card (`Game.spliceGainEstimate` × `HIVE_MIND.spliceGainMult`), so at its price
     it ranks as the overflow sink — real purchases first. It OPENS a draft, so `hivePulse` ends the
     pulse there: the Hive buys the choice, the player (or Auto Gene) makes it. No card drafted yet ⇒ no
     estimate ⇒ no splice.
- **`hivePlan(g)`** — enumerate all providers → apply context (§scoring) → drop actions the
  reserve can't afford → sort by `value` (deterministic tie-break by id).
- **`Game.hivePulse()`** — execute-best / re-plan loop (costs move as it buys — the deploy
  curve, evo totals and tier ladders all shift), capped by `HIVE.maxActionsPerPulse`;
  returns the action report the HUD renders as a ticker.

## §scoring — power first, context second, never raw stats alone

- **Exact where exactness exists**: branch tiers, strains and hero evolution fold into the
  live run-Power bucket (`powerEffects()` → `effectsPower`), so their gain is the EXACT
  power delta of the hypothetical purchase (same math as the meta Best-Purchase advisor —
  no heuristics where the truth is computable).
- **Honest heuristics where power is silent**: a fresh deployment adds inherent strength the
  temp-Power bucket deliberately doesn't score, so `deploy` gains come from authored combat
  stats (damage/interval, splash, class weight in `HIVE.deployGain`), and `autocast` carries
  a small fixed QoL gain. All tunables live in `config.ts HIVE` — one reviewable table.
- **Context multipliers** (the "intelligent build decisions" layer, each one documented):
  - **Sparse board** (< `HIVE.sparseBoardCount` towers): deploy/favorite/merge actions ×
    `sparseDeployMult` — guns on the ground beat luxury tiers early.
  - **Thin board** (< `HIVE_MIND.thinBoardTowers` towers, capped at the open slots): the
    `thinHoldProviders` (Hero Evolution + auto-cast) are held at `thinHoldMult` (0) — "board too thin —
    towers first" (§opening).
  - **Boss prep**: when the next wave carries a boss/elite (the same preview the prep bar
    shows), strength actions ×`bossPrepMult`.
  - **Economy reserve**: the pulse never spends below `reserveFrac` × current Biomass
    (+`reserveMin` floor) — free actions (the gift organism) are always allowed.
  - The seam for deeper context (enemy damage types, lane pressure, gene synergies) is the
    single `applyContext()` — additive, and every multiplier must name its reason in
    `HiveAction.detail` (the tooltip/toast explains WHY).

## §solved-content — stage-5 unlock (revised)

The previous replay-only rule is replaced by account completion of Campaign Stage 5.
Campaign (including new stages) and Infinite allow automation after that milestone. Tutorial,
Daily, Boss Rush and Quick Skirmish remain manual; Threat levels above the mode's cleared record
remain locked. The stage is configured in HIVE_MIND.unlockStage. save/derive.ts automationFor
uses highestCampaignStage and passes the verdict as RunOptions.automationAllowed (omitted = false).

Game.setHiveActive controls a run-local toggle. The fixed-step loop calls hivePulse at the
configured cadence; Auto Wave reads the toggle without overwriting the standalone preference.
DraftModal uses a live override of its existing countdown, with a Stop button and pause handling.
No save-schema migration is needed. The input recorder includes setHiveActive.

## §opening — the first Biomass goes into towers (Batch G, 2026-11)

G1's live S29 replay pressed the glowing button at run start: the pulse spent ~90 % of the opening
Biomass on Hero Evolution because it had no way to place the favorite tower — 1 tower at wave 1, run
lost at wave 3, while Power rose 83k → 106k. Three changes, all data (`config.ts HIVE_MIND`):

1. **The `favorite` provider** places the favorite organism (always deployable) while the board is
   thin — gain from its authored combat stats like any deployment, ×`sparseDeployMult` on a sparse
   board. Opening only: an always-on favorite filled endless boards with one kind and measured WORSE
   on `sim:hive` (hive cohort 19.3 → 17.3 depth); gated to the opening it measures 20.5.
2. **Thin-board hold** — while the board has fewer than `thinBoardTowers` = 6 towers (capped at the
   open slots), Hero Evolution and the auto-cast unlock are worth 0 to the planner. With too little
   Biomass for a tower the pulse SAVES instead of leaking it into hero stats.
3. **The glow follows** — `hiveReady` is the same plan, so at run start the button now glows only
   for a real opening move (the free gift, an affordable tower), never for a hero level.

Placement adds one context read: when the next wave's preview carries FLIERS (they ignore the lanes
and dive the Nucleus), combat organisms rank open slots by nearness to the Nucleus instead of
forwardness (`flierCoreBias`).

## §placement — where the mind puts a tower

Deterministic slot scoring in `hiveBestSlot` (data-driven, no per-kind code):
- **Support organisms** (authored `damage === 0` — reactors, siphons): the open slot with the
  most occupied neighbors (aura/overcharge adjacency is their whole job).
- **Combat organisms**: the most FORWARD open slot (lowest y — meets the wave first), tie-broken
  toward the horizontal center (route coverage), with a small penalty for stacking next to the
  same kind (spread beats a monoculture — and Myriad punishes single-kind lines by design).
  When the next wave previews FLIERS, the slot NEAREST the Nucleus instead (§opening).

## §hive-call — the hive calls the next wave early when the board holds comfortably (2026-11-11)

Owner ask: "it calls waves early if it calculates that you'll survive the wave significantly".
Rides the player's **Auto Wave** toggle (no new control) and the SAME automation gate as Auto Gene
(`RunOptions.automationAllowed` — solved content only; frontier, Boss Rush, Daily, Skirmish and the
tutorial never get it). `Game.hiveCallSystem` runs every `HIVE_CALL.sampleEvery` (0.25 s sim) while
a wave is live and both switches are on; the decision is the pure `hiveCallForecast` (core/hivemind.ts).

- **The read:** the deepest point any enemy reached this wave (`nav.goalDistanceAt` ÷ the spawn
  row's path cost — 0 spawn row … 1 at the Core; a sieging enemy is 1), kills since launch, the
  share of the wave already spawned, the HP still on/coming to the field and the wave's total HP
  (summed from what actually spawned), Core integrity since launch, bosses.
- **The forecast:** `load = (remaining HP + next wave HP) ÷ this wave's HP`, the next wave assumed
  `nextWaveGrowth` (×1.3) heavier. Only the distance PAST FIRST CONTACT scales with load (no board
  kills an enemy before it walks into range): `front` = the shallowest depth any tower's effective
  reach covers (`Game.hiveFront`), `projected = front + max(deepest − front, depthFloor) × load`.
  Calling is comfortable when the overlapped field still dies within `safeShare` (60 %) of the
  stretch from first contact to the Core; `margin` = allowed stretch ÷ projected stretch is what
  the HUD shows ("holds ×1.4").
- **Calibration** (scratch harness — calls FORCED whenever every other rule passed, then the
  forecast compared with what the overlapped field really did; 401 calls on opening / strong /
  dominant Infinite boards):

  | projected depth | calls | Core hit | Hive lost |
  |---|---|---|---|
  | < 0.6 | 35 | 0 | 0 |
  | 0.6–0.7 | 48 | 1 | 0 |
  | 0.7–0.8 | 68 | 4 | 1 |
  | 0.8–1.0 | 130 | 15 | 6 |
  | ≥ 1.0 | 120 | 52 | 34 |

  The forecast is predictive (risk rises steadily with it); `safeShare` 0.6 is the widest setting
  that never cost the Core in the data.
- **Hard holds:** a boss on the field or due next (Infinite director cadence + Mega schedule; a
  stage's finale, mini-boss, per-wave bosses, Mega arrival; every Boss Rush wave), ANY Core damage
  this wave, Core below `minIntegrityFrac` (60 %), fewer than `minKills` kills or `minSpawnedFrac`
  of the wave on the field, a call already stacked (`calledAhead > 0` — at most ONE hive call per
  cycle), and every Early Call rule (it calls through `callWaveEarly` itself: minimum elapsed,
  the bonus, §owed drafts — docs/EARLY-CALL.md).
- **Visible:** a board float "◈ HIVE CALL — holds ×M" and the hive ticker ("Called Wave N early ·
  +B Biomass / Forecast: the board holds ×M") from `HudSnapshot.hiveCall`.
- **Determinism:** the read is sim state only; Auto Wave is a recorded input (`setAutoStart`), so a
  replay re-makes every call. Off on the golden path (Auto Wave off) ⇒ byte-identical.
- **Measured with safeShare 0.6** (scratch harness — 20 Infinite seeds × 600 s per cohort, the hive
  pulsing every prep, Auto Wave on; the same runs with the call disabled as the control):

  | board | hive calls | overlaps that cost the Core | runs lost (calls / none) | mean depth (calls / none) |
  |---|---|---|---|---|
  | strong (10 towers) | 39 | 3 | 7 / 11 | 22.4 / 20.9 |
  | dominant (10 towers, ×3 account damage) | 58 | 0 | 8 / 9 | 23.1 / 23.0 |

  No hive-called overlap ever killed the Hive; the Early Call Biomass it banks fed the board, and
  runs with calls lost less often. Weak boards (sim:hive's 4-tower openings) never reach a
  comfortable forecast and make no calls. `npm run sim:hive` now reports calls per cohort and gates
  Core damage in ≤ 5 % of hive-called overlaps.
- **Verified live** (real client, Infinite, debug-built strong board): the hive called Wave 2 early
  ("holds ×1.6", +22 Biomass) with the board float + ticker, and Auto Gene drafted after 3 s.

Auto Gene's countdown is **3 s** since the same ask (was 10 s) — any manual pick still wins.

## §golden-safety & determinism

The mind only ever acts inside `hivePulse()`, which the enabled toggle calls — golden
autoplay never presses it, so every golden seed is untouched by construction. A pulse itself
is deterministic: same run state ⇒ same plan ⇒ same purchases (pinned by test).

## §modes (future seam)

`hivePulse(opts)` already accepts `{ maxActions }` — "one purchase" mode is `maxActions: 1`;
profiles (defensive/offensive/economy/boss-prep) are tunable overlays on `HIVE` passed through
`hivePlan`. Not shipped as UI yet; the seam is the options object.

## §validation — scripts/sim-hive.ts (`npm run sim:hive`)

Headless batch comparison on real runs (endless, multiple seeds): **manual baseline** (fixed
opening board, no purchases) vs **Hive Intelligence** (same opening + a pulse every prep) vs
**mixed** (pulse every other prep). Measured per cohort: survival depth, final live Power,
biomass efficiency (spent/earned), actions taken, reserve violations (must be 0). The gate:
HI ≥ baseline mean depth (the mind must never make a run worse), and no reserve violation.
Latest results live at the bottom of this file; re-run after balance changes.

## Results (re-run 2026-11-04 after §opening — 6 endless seeds, 900 s cap, identical 4-tower openings)

| cohort | mean depth | mean live Power | biomass spent | actions/run | reserve violations |
|---|---|---|---|---|---|
| manual (no purchases) | 12.5 | 1.98 | 0 % | 0 | 0 |
| **hive (pulse every prep)** | **20.5** | **50.2** | 91 % | 78.5 | **0** |
| mixed (every 2nd prep) | 18.8 | 26.0 | 82 % | 66.8 | 0 |

(2026-11-03, before §opening: manual 12.3 · hive 19.3 · mixed 20.8.) The mind lifts survival ~64 %
over a purchase-less baseline and never raids the reserve. The 4-tower opening is now THIN, so a pulse
fills two more slots before any hero buy; pulsing every prep now edges out banking two waves (the
mixed cohort's first pulse lands a wave later on a thin board). Campaign (G1/GR2 harness, live
progression-sim accounts, pressing only the glowing button, 6 seeds): towers at wave 2 went 2 → 5
(8 h, S29) and 2 → 6–7 (100 h, S80); wins 5/6 → 6/6 and 2/6 → 4/6, losses by wave 3 1 → 0 and 4 → 2.
Lesson baked into the code: the pulse pins its reserve ONCE from the starting wallet
(per-iteration recomputation on a shrinking wallet asymptotically spends to zero — the
first sim draft caught 87 violations/cohort before the pin).

## Hero combat and manual takeover

While enabled, the lead hero uses the existing ability targeting/cooldown path during combat,
without purchasing the separate Auto-Cast upgrade. Other roster heroes and star skills already
act autonomously. Each purchase pulse rallies the lead hero toward the deepest live threat.
Turning Hive Intelligence off stops this steering and ability automation; previously purchased
standalone Auto-Cast remains as the player left it. The planner skips that redundant purchase
while the toggle is on. Upgrades, conveyor deployment/merges and extra Splice drafts already
use the planner. Conveyor overflow already recycles automatically. No automatic selling,
relocation, early-call overlaps, paid rerolls, hub spending or next-run launch is introduced.

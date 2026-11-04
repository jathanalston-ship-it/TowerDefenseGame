# HIVE-MIND.md — Hive Intelligence, the in-run best-upgrade executive

> Player-facing name: **HIVE INTELLIGENCE** (the in-run button). Internal name: **hive mind**
> (`src/core/hivemind.ts`) — distinct from `state/hiveIntel.ts`, the HUB's standing intel FEED
> (docs/HIVE-INTEL.md). Same fiction, two organs: the feed ADVISES between runs; the mind ACTS
> inside one. The objective is not automation — it is removing repetitive decision-making while
> the player keeps complete manual control.

## The player contract

- One clearly visible HUD button in every run's prep + combat phases: **◈ HIVE INTELLIGENCE**.
  It GLOWS when at least one worthwhile purchase is affordable (the `hiveReady` snapshot flag).
  It lives in the run-controls strip beside speed + Pause (docs/HUD.md §layout; phones show
  the short key "◈ HIVE"); the pulse report ticker rides the strip's free end as a two-line log
  (phones: a toast over the board) — it never covers the wave briefing or ▶ Start Wave.
  It ACTS only on **solved content** (§solved-content) — elsewhere it is visibly off and says why.
- Pressing it runs one **pulse**: evaluate every currently-available Biomass purchase, execute
  the best ones (multi-buy) until nothing worthwhile remains or Biomass hits the reserve.
- Every action it takes is announced on the battlefield ("◈ Evolved Bone Mortar", "◈ Placed
  Parasite Nest") and each purchase fires its own existing ceremony (mutation spectacle,
  arrival, splice cue) — the hive visibly does the work; gameplay is never interrupted.
- Manual play is untouched: every surface the mind buys from remains fully manual, and the
  mind never acts on its own — a pulse happens only when the player asks for one.
  (Future seam: optional modes — one-purchase / spend-all / boss-prep profiles — ride the
  same planner with different tunables; see §modes.)

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

## §solved-content — automation never replaces a frontier decision (2026-11)

`npm run sim:hive` shows the mind out-surviving the scripted manual policy by ~57% — so on a
FRONTIER stage, unrestricted, the best play would be pressing one button. Hive Intelligence and
**Auto Gene** (automatic draft picks) therefore run only on content the account has already beaten:

| Run | Hive Intelligence + Auto Gene | Why |
|---|---|---|
| **Infinite** | ON | the farm — solved content by design |
| **Campaign replay** (stage ≤ cleared on that difficulty track) | ON | farming / replaying a beaten stage |
| Campaign **frontier** stage | off — *"Unlocks on stages you've cleared"* | the decisions ARE the content |
| **Boss Rush** | off — *"every run chases a record"* | its payouts are new-record lanes; every run is a frontier |
| **Daily** | off — *"one shared, fair board"* | a worldwide, replay-verified leaderboard |
| **Quick Skirmish** | off — *"practice is played by hand"* | the practice sandbox |
| **Tutorial** | off (button hidden) | the lesson is the decisions |
| Any **Threat** level above the mode's best cleared (docs/THREAT.md) | off — *"Unlocks at Threat levels you've cleared"* | a new rung is a frontier |

Wiring (the sim never reads the save): the pure policy is `automationGate()` in
`core/hivemind.ts` (`AUTOMATION_POLICY` — one data row per mode); `save/derive.ts automationFor()`
evaluates it from the save once at run mount (GameView) and threads ONE run option,
**`RunOptions.automationAllowed`** — **fail-closed** (omitted ⇒ false). With it false,
`hiveEvaluate()` returns `[]` (the button never glows) and `hivePulse()` is a no-op; GameView
disables the pill and prints the reason inside it, forces the draft manual (`DraftModal
forceManual`), and BuildControls shows Auto Gene as **LOCKED** with the reason. **Auto Wave and game
speed stay available everywhere** (pure convenience); the purchased hero **auto-cast** is an in-run
upgrade, not governed here. Headless instruments that model solved content (sim-hive, the hivemind
tests) pass `automationAllowed: true` explicitly.

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

## §golden-safety & determinism

The mind only ever acts inside `hivePulse()`, which only the player's button calls — golden
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
progression-sim accounts, pressing only the glowing button): towers at wave 2 went 2 → 5 (8 h,
S29) and 2 → 6–7 (100 h, S80); wins 5/6 → 5/6 and 2/6 → 4/6, losses by wave 3 1 → 0 and 4 → 2.
Lesson baked into the code: the pulse pins its reserve ONCE from the starting wallet
(per-iteration recomputation on a shrinking wallet asymptotically spends to zero — the
first sim draft caught 87 violations/cohort before the pin).

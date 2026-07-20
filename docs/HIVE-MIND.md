# HIVE-MIND.md — Hive Intelligence, the in-run best-upgrade executive

> Player-facing name: **HIVE INTELLIGENCE** (the in-run button). Internal name: **hive mind**
> (`src/core/hivemind.ts`) — distinct from `state/hiveIntel.ts`, the HUB's standing intel FEED
> (docs/HIVE-INTEL.md). Same fiction, two organs: the feed ADVISES between runs; the mind ACTS
> inside one. The objective is not automation — it is removing repetitive decision-making while
> the player keeps complete manual control.

## The player contract

- One clearly visible HUD button, live in every phase of every run: **◈ HIVE INTELLIGENCE**.
  It GLOWS when at least one worthwhile purchase is affordable (the `hiveReady` snapshot flag).
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
  - **Sparse board** (< `HIVE.sparseBoardCount` towers): deploy/merge actions ×
    `sparseDeployMult` — guns on the ground beat luxury tiers early.
  - **Boss prep**: when the next wave carries a boss/elite (the same preview the prep bar
    shows), strength actions ×`bossPrepMult`.
  - **Economy reserve**: the pulse never spends below `reserveFrac` × current Biomass
    (+`reserveMin` floor) — free actions (the gift organism) are always allowed.
  - The seam for deeper context (enemy damage types, lane pressure, gene synergies) is the
    single `applyContext()` — additive, and every multiplier must name its reason in
    `HiveAction.detail` (the tooltip/toast explains WHY).

## §placement — where the mind puts a tower

Deterministic slot scoring in `hiveBestSlot` (data-driven, no per-kind code):
- **Support organisms** (authored `damage === 0` — reactors, siphons): the open slot with the
  most occupied neighbors (aura/overcharge adjacency is their whole job).
- **Combat organisms**: the most FORWARD open slot (lowest y — meets the wave first), tie-broken
  toward the horizontal center (route coverage), with a small penalty for stacking next to the
  same kind (spread beats a monoculture — and Myriad punishes single-kind lines by design).

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

## Results (2026-07-19 — 6 endless seeds, 900 s cap, identical 4-tower openings)

| cohort | mean depth | mean live Power | biomass spent | actions/run | reserve violations |
|---|---|---|---|---|---|
| manual (no purchases) | 12.3 | 1.87 | 0 % | 0 | 0 |
| **hive (pulse every prep)** | **19.3** | **37.9** | 88 % | 79 | **0** |
| mixed (every 2nd prep) | 20.8 | 35.6 | 81 % | 77.5 | 0 |

The mind lifts survival ~57 % over a purchase-less baseline and never raids the reserve.
**No dominant exploit**: banking two waves between pulses (mixed) slightly out-survives
pulsing every prep — cadence remains a real player choice, not strictly-better spam.
Lesson baked into the code: the pulse pins its reserve ONCE from the starting wallet
(per-iteration recomputation on a shrinking wallet asymptotically spends to zero — the
first sim draft caught 87 violations/cohort before the pin).

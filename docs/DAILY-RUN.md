# DAILY-RUN.md — one seed, one world, every player

The **fourth pillar** beside Campaign, Infinite, and Boss Rush. One UTC day ⇒ one deterministic
seed ⇒ **the SAME 20-wave run worldwide**: a rolled biome, a seeded 3-boss roster, TWO gameplay
modifiers, a 3-tower trial Conveyor pool, and the day's champion. No difficulty selector — one
shared ruleset; the bragging rights are the clear and the **streak**.

Everything is derived, never stored: `generateDaily(dailyKey())` is pure + deterministic in the
day key, so the plan re-derives anywhere (UI, sim boot, tests) and never desyncs.

---

## §plan — what a day rolls (`src/core/daily.ts`)

`generateDaily(key) → DailyPlan`, every roll off a **dedicated sub-stream** XOR'd from the day seed
(`hashStr('daily:'+key)`) so fields never perturb each other and stay stable across releases:

| Field | Roll |
|---|---|
| `biomeId` | one **fixed** biome for the whole run, from the `BIOMES` registry |
| `stage` | a 20-wave `StageConfig` built by the **campaign machinery** (`composeStagePlan`, effective stage 12–20, ×0.9–1.25 HP variance) so waves feel authored |
| `stage.bossWaves` | §bosses: two seeded mid-bosses (waves 7 & 14); the finale rides `stage.boss` (wave 20) |
| `towerPool` | 3 independent rolls over the FULL tower registry (dupes allowed) — the trial Conveyor |
| `modifierIds` | TWO distinct ids from the modifier **registry** (§modifiers) |
| `musicTrack` / `difficultyEstimate` / `recommendedPower` | seeded flavour + the readiness heuristics (universal Power index) |

`pickDailyHero(seed, unlockedHeroes)` — the day dictates the champion (roster-order-stable).

## §modifiers — the expandable framework (`src/core/dailyModifiers.ts`)

A modifier is **pure data** (`DailyModifierDef` on `dailyModifierRegistry`): id, blurb, severity
1–3, and a declarative `ModifierEffects` bag. Magnitudes live in `DAILY.mod` (config.ts). The core
ten: Overrun, Blood Frenzy, Famine, Myopia, Scarcity, Ironhide, Dormancy, Infestation, Overclock,
Regeneration. **A new modifier is one data row** — the generator rolls from the registry.

The sim reads ONE resolved struct — `combinedEffects(ids) → ResolvedEffects` — whose defaults are
**neutral** (mults 1 / adds 0). Boot-time mults fold into the run's existing modifier buckets
(hero damage, income, tower damage/rate, tower range); per-tick knobs (hero drain, hive regen),
spawn knobs (armor add, speed mult, elite promotion off a **dedicated rng**), the branch-cost
multiplier, and the Dormancy draft cadence are read at their hooks from `Game.dailyFx`.

## §gates / §rewards / records

- **Unlock**: clear Campaign Stage `MODE_UNLOCKS.daily` (5); `isDailyUnlocked` (save/derive.ts)
  grandfathers any account with daily history. The Hub seals the screen with the standard briefing.
- **Clear reward** (once per UTC day, `rewardedKey`-gated): `DAILY.reward.clearCores` Genome Cores
  + a capped consecutive-day **streak** kicker (`streakBonus × min(cap, streak−1)`), Ascendant
  core-gain riding on top. Replays after the clear are for the record only.
- **Ledger** (`save.daily`, additive — old saves get a fresh one): `lastKey/lastWave` (today),
  `bestWave` (lifetime), `completions`, `streak`, `rewardedKey`. The Daily **never** moves the
  Infinite `bestWave` record (mode identity, like Boss Rush).
- `finishRun` lane keys off `RunResult.dailyKey` (set by App); `RunOutcome.dailyProgress` carries
  the run's cores/streak/cleared for Results.
- **Sibling system**: the Daily Run rewards PLAY; the **Daily Bio-Cache** (DAILY-LOGIN.md)
  rewards SHOWING UP — a separate login-streak faucet with its own `save.login` ledger. The
  two streaks are independent by design (its `isPrevDayKey` day math is reused from here).

## Boot path (worldwide identity)

`App.startDaily`: gate → `generateDaily(dailyKey())` → **seed = plan.seed** (the day seed — not the
usual random roll, so spawn jitter and every downstream roll are identical worldwide) → hero =
`pickDailyHero` → single-hero roster → `begin('daily', plan.stage)`. GameView passes
`daily: { modifierIds }` plus the pool as `unlocked` (+ `favorite` = pool[0]) — the existing roster
gate restricts placement, the Conveyor's kind rolls, and the card draft pool to the day's trio.
`mode: 'daily'` disables the Run-Identity event layer: the day's identity IS its two modifiers.

## Golden-safety & determinism

- Without `opts.daily`, `Game.dailyFx === NEUTRAL_EFFECTS` — every hook read is ×1/+0 and the
  Infestation rng is **never consumed** ⇒ all other modes are byte-identical (golden pinned).
- `stage.bossWaves` is undefined outside the Daily ⇒ the campaign path never fires the lookup.
- The plan is pure data; the sim stays headless. Pinned by `daily.test.ts` (generator) +
  `dailySim.test.ts` (integration: determinism, pool gate, boss roster, per-modifier effects).

## Extension points

- **New modifier** → one `DAILY_MODIFIERS` row (+ a `DAILY.mod` magnitude). Behaviours beyond
  scalars get the reserved `hooks` seam (`onWaveStart(game)`), invoked when first needed.
- **New reward lane** (cosmetics, leaderboard) → ride `dailyProgress` / the ledger.
- **Ownership/trial gating** for un-owned pool towers (Phase-2 note in daily.ts) → the pool already
  flows through `unlocked`, so a reward-side trial flag is additive.

# BOSS RUSH — the gauntlet (the third pillar)

> Status: **live** (2026-07). Sim: `src/core/game.ts` (`startBossRushWave`, `rushSpawnSystem`) ·
> tunables: `RUSH` + `MODE_REWARDS.*.bossRush` in `src/core/config.ts` · rewards/records:
> `src/state/meta.ts` (`finishRun`) · terminal: `src/ui/BossRushScreen.tsx` · tests:
> `src/core/bossrush.test.ts`, `src/state/bossrushMeta.test.ts`.

## The contract

**Wave N deploys N procedurally assembled bosses.** They arrive as a staggered siege COLUMN
(`RUSH.bossStagger` seconds apart — readable arrivals, never one simultaneous wall), screened by a
THINNED AI-Director escort (every `RUSH.escortKeepEvery`-th scheduled spawn survives the cut; the
bosses ARE the wave). A Gene Card drafts every **2nd** cleared wave (`RUSH.draftEvery`). The run
never "wins" — like Infinite it only ends when the Nucleus falls. The mode is **sealed until
Campaign Stage 12 falls** (`MODE_UNLOCKS.bossRush`, ≈ 1h of play — docs/MODE-IDENTITY.md §gates; 10 → 9
in the 2026-07 stage-gate review, 9 → 12 in the 2026-11 reveal re-pace, docs/PROGRESSION-GATING.md §timeline).

Mode identity next to the other pillars (docs/MODE-IDENTITY.md):

| Pillar | Identity | Primary payout |
|---|---|---|
| Campaign | authored progression | Genome Cores (first clears) |
| Infinite | endurance experiment | Loot meter + Mastery |
| **Boss Rush** | **boss-slaying stress test** | **per-boss bounty (Cores + loot), ~N² with depth** |

## Sim architecture (`src/core/game.ts`)

- `RunMode` gained `'bossRush'`. `startWave()` dispatches to `startBossRushWave()`.
- `startBossRushWave()`: `waveIndex++` = depth = boss count; `enterBiome(biomeForDepth(depth))`
  rotates ecosystems like Infinite; the Director schedules a normal wave which is then thinned
  deterministically; bosses are queued into `rushPending` (`{ at, tl }`, time-sorted).
- `rushSpawnSystem()` (ticked right after `spawnSystem`, gated on `rushPending.length > 0` — a
  zero-cost no-op in every other mode) deploys due bosses via `spawnProceduralBoss(tl, strength)`.
- **Threat Level curve:** `tl = RUSH.bossTlBase + RUSH.bossTlPerWave × (depth − 1)` — depth raises
  boss QUALITY (modules/phases/HP/damage via `assembleBoss`) while the count raises pressure.
- **Strength curve** (`rushStrength(depth)`, config.ts — §wall): boss HP × `strengthBase +
  strengthPerWave × (min(depth, geoFromWave) − 1)` (0.4 → 1.0 at wave 4 → 2.2 at wave 10), then
  **× geoGrowth (1.25) per wave past geoFromWave, uncapped**; contact damage rides the same curve
  but caps at `damageCap` (1.5) so deep walls are out-tanked, not one-shot roulette. TL alone can't
  wall a run: its module and phase counts saturate, and its bounty used to self-fund the defense.
- **Sized to the account** (§wall): boss HP also × `S^t`, `S = max(powerScaleMin, (Power /
  powerRef)^powerExp)` with the Power the run starts at (`RunOptions.rushPower`, recorded in replay
  ctor args), `t` ramping 0 → 1 across waves `powerRampFrom → powerRampTo` (4 → 10) — the opening
  duels stay the warm-up, the column catches up to the account by wave 10.
- **The column doesn't wait** (§wall): `columnGraceSec` (28 s) after a wave's LAST boss deploys,
  the next column marches in on top of whatever still stands (`startBossRushWave(overlap)`: escort
  and bosses MERGE time-sorted, the doctrine warp touches only the new escort; no prep, no draft).
  The HUD counts it down on every layout (`HudSnapshot.rushColumnIn` → "next column in Ns"; the
  desktop anticipation chip reads "Wave N marches in Ns — clear the column").
- **Decoupled economy:** rush bosses pay a FLAT `RUSH.bossBounty` (95) instead of the TL-scaled
  assembled bounty (income ∝ N while threat ∝ N × strength — otherwise every difficulty lever was
  self-cancelling), and the run opens with `RUSH.openingBiomass` extra build funds so wave 1's
  duel meets a real board instead of 3 towers.
- **Entry legality:** the ramped columns (waves 1–3) re-roll a `burrower` vanguard — tunneling
  under the whole defense line is uncounterable on an opening board. From wave 4 every module is
  legal.
- **Escort intensity** rides the endless speed/damage curves (`spawnOne` mode gate widened), and
  the escort's HP/bounty use `endlessHpMult/endlessBountyMult` — one scaling backbone, no fork.
- **Id uniquify:** two same-chassis bosses at the same ⌊TL⌋ used to collide in `procBosses`
  (`proc_<chassis>_<tl>`) and swap defs mid-fight; `spawnProceduralBoss` now suffixes a colliding
  id with the next entity id. (Latent Endless bug too — fixed at the seam.)
- Wave completion counts `rushPending` (a wave with bosses still due can't settle); the never-won
  gates in `checkWaveEnd`/`endWave` treat `bossRush` like `endless`; `getNextWavePreview()` is
  null; `shouldDraftThisWave()` runs a fixed every-2nd-wave counter; `nextAnticipation()` dreads
  the next column ("`N` bosses at wave `N`") and names the next Gene Card wave.
- `runBossKills` increments on every boss-entity death (splits count — each split IS a boss) and
  lands in `RunStats.bossKills`.
- **Golden safety:** every new branch is mode-gated; standard/stage runs are byte-identical
  (goldens unchanged).

## Rewards & records (`src/state/meta.ts` finishRun)

- **Per-boss lanes:** `+RUSH.corePerBoss` (3) Genome Cores and `+RUSH.lootPerBoss` (27) loot points per
  boss defeated (×1.5 with §wall — runs end in minutes now, so per-minute pay holds its old band) (× difficulty economy scalar × prestige gain mults). Wave N holds N bosses, so a
  push to wave N pays on ~N(N+1)/2 bosses — slaying is the payout, not surviving.
- The wave/kill formulas still run under token mode mults (`MODE_REWARDS.core/loot/mastery
  .bossRush`) so the mode can't out-farm the other pillars' lanes.
- **Own records, never Infinite's:** `save.rushBestWave` (depth record) and `save.rushBestBoss`
  (most bosses felled in a SINGLE run — the lifetime-record band base P3's Ichor faucet keys on).
  `save.bestWave` is untouched by rush runs.
- **Qualify gate:** like Infinite, a run must reach ≥ `INFINITE_REWARD_QUALIFY_FRAC` (50%) of
  `min(rushBestWave, RUSH.qualifyRecordCap)` (14) to bank ANY container (`rewardBlocked.reason:
  'rush-short'`) — the cap keeps a pre-§wall veteran record (waves 30+) from locking the
  containers forever.
- **Lifetime ledgers:** `stats.rushRuns`, `stats.rushBossKills` (additive `LifetimeStats` fields).
- **Prediction:** its own self-calibrating channel (`prediction.bossRush`, `predictBossRush`) with
  baselines noted at launch — since §wall the base model is the measured sized wall:
  `predictWall (10) + predictPerDoubling (0.15) × log2(Power / powerRef)`; a record floors it only
  up to model + 3 (a pre-wall veteran record never inflates it).
- Timeline: a `☠ Boss Rush record — Wave N` milestone per 5-wave record band.

## UI surfaces

- **`BossRushScreen`** (Play group, `Hub` nav `bossrush`; Command Center Modes tile routes here):
  the gauntlet terminal — escalation-ladder artwork (wave N drawn as N skulls), the three-rule
  contract, difficulty (own `difficultyPref('bossrush')`), `PredictionPanel mode="bossRush"`,
  records (deepest wave / best single run / lifetime bosses / runs), forecast panel, and the
  gauntlet milestones with live progress bars.
- **In-run:** wave banner reads `WAVE N — N BOSSES`; pause vitals drop the `/12` total; the outro
  reads RUN ENDED (never VICTORY); Results explains a `rush-short` forfeiture.
- **Help:** mechanics entry `boss-rush` (auto-feeds the Help wiki + What's New).

## Achievements

`rush_first` (settle a run) · `rush_wave5` / `rush_wave10` (depth records) · `rush_boss15`
(15 bosses in one run) · `rush_bosses50` / `rush_bosses250` (lifetime kills). All progress-barred
on the save ledgers, surfaced in the terminal's milestone panel and the global gallery.

## Balance (probe: 10-seed autoplay persona sweep, 2026-07)

Autoplay floor (naive full-board placement, first-card drafts, standard difficulty — real players
with hero micro and deliberate builds land a few waves deeper):

| Account (probe persona) | towerDamageMult | Median fall | Bosses felled (med) | Wave-1 losses |
|---|---|---|---|---|
| Fresh | ×1.0 | wave 7 | ~25 | 0/10 |
| Mid | ×2.0 | wave 8 | ~35 | 0/10 |
| Late | ×3.5 | wave 10 | ~50 | 0/10 |

Probe findings baked into the tunables above: (1) a full-strength wave-1 boss vs the 220-biomass
opening board was a coin-flip wipe → strength curve ease-in + `openingBiomass`; (2) wave-1
burrowers were an uncounterable insta-loss → entry re-roll; (3) TL-scaled bounty made the mode
self-funding (fresh autoplay cruised past wave 10 at ANY TL slope) → flat `bossBounty`; (4) the
uncapped damage overload one-shot every persona equally → `damageCap` restores the power ladder.

Intent holds: runs are SHORT and dense (~5–10 sim-minutes), records move in single waves, and the
per-boss payout makes every extra kill visible. Tune `strengthPerWave` first (the wall), then
`bossBounty` (the snowball), then the payout lanes. *(The table above is the 2026-07 probe on
power-less personas; §wall below supersedes it for real accounts.)*

## §wall — every account meets a wall (2026-11)

**The audit (G1):** real progression-simulated accounts never fell — 8h / 60h / 100h accounts sat at
waves 28–36 with ~100% integrity when a 30-minute cap stopped the bot (doc target: falling at wave
7–10 within 5–10 min), 82–87% of the run idle, 6–7 decisions/min. The 2026-07 probe personas
(`towerDamageMult` ×1/×2/×3.5 on fresh saves) were far weaker than real accounts (14k → 600k Power),
the linear strength curve capped at ×2.6 by wave 12, and a wave that could not be cleared just
waited.

**The wall** = the geometric curve past wave 10 + the Power sizing + the column that doesn't wait
(all in the sim contract above; tunables in `RUSH`). Re-tuned on G1's FROZEN progression-sim
accounts (the same saves before/after; competent-player autopilot, instant prep, 30-minute cap):

| Account (Power) | Before: fall wave · minutes | After: fall wave (5 seeds) · median minutes | Rush Cores/min before → after | Decisions/min · idle share before → after |
|---|---|---|---|---|
| 1h (15k) | 25* / 10 / 8 · 7.5 | 10 / 9 / 12 / 12 / 16 · 6.8 | 14.5 → 30 | 13.5 · 0.68 → 14.5 · 0.67 |
| 4h (14k, post-Molt) | 31* / 10 / 8 · 7.0 | 9 / 7 / 7 / 11 / 8 · 3.9 | 16 → 24 | 12.9 · 0.68 → 17.8 · 0.54 |
| 8h (92k) | 31* / 29* / 32* · 30 | 12 / 8 / 8 / 10 / 9 · 3.8 | 33 → 26 | 7.0 · 0.82 → 18.9 · 0.51 |
| 60h (452k) | 36* / 35* / 36* · 30 | 10 / 12 / 9 / 14 / 9 · 4.2 | 42 → 35 | 6.1 · 0.87 → 19.2 · 0.55 |
| 100h (611k) | 35* / 35* / 36* · 30 | 10 / 12 / 10 / 15 / 10 · 4.2 | 42 → 38 | 6.3 · 0.86 → 20.0 · 0.53 |

\* still standing at the 30-minute cap. Minutes are bot time with INSTANT prep and drafts — a human
adds their build beats. Cores/min = the per-boss lane at its tuning (2 before, 3 after). The
Boss Rush mega at wave 5 is often where a mid account's first overlap starts — the organism holds
its wave while the next column marches in. Tests: `bossrush.test.ts` (§wall: curve, sizing,
overlap), `bossrushMeta.test.ts` (capped qualify gate), `predict.test.ts`.

**Known risk:** `rushBestBoss` records set under the stall (400–650 bosses) are out of reach now, so
those veterans' Ichor record bands stay silent until a record epoch exists (a save-field decision).

## §stamina — the session fuel (2026-07)

`save.rushStamina { value, updatedAt, freeDay }`, all math in `meta.rushStamina /
spendRushEntry / grantRushStamina` (lazy — nothing ticks; the value derives from
`updatedAt` on read):

- **Ceiling 100** (`RUSH.staminaMax`), **+1 per 3 min** (`staminaRegenSec`), **entry 20**
  (`staminaCost`). The **FIRST entry of each UTC day is FREE** (`freeDay` ledger) — the daily
  hook. Grants (Splice Market pack: +20 for 8 Ichor, a 5th premium stock row) may **overflow
  to 120** (`staminaOverflowMax`); above the ceiling regen pauses.
- Tamper posture: negative elapsed clamps to zero regen; a forged future `freeDay` self-heals
  by waiting (ISO keys compare lexically). Same leniency class as the market's max-window rule.
- Surfaces: the terminal's stamina bar (live 1s countdown, FREE chip, disabled CTA when short);
  `BossRushScreen.start()` pays via `spendRushEntry` before launching.
- Tests: `state/rushStamina.test.ts` (regen, costs, free day, overflow, tamper, market pack).

## §ichor — the lifetime-record bands (2026-07)

Boss Rush is the **primary repeatable Ichor lane** (docs/MARKET.md §ichor). Keyed to the
single-run boss RECORD (`save.rushBestBoss`) — the same un-farmable construction as the
Infinite depth lane:

- Every NEW **5-band** of the record bleeds **2 Ichor** (`ichorForBossRecord`); every NEW
  **10-band** additionally drops a **weighted-common Bio-Container** (`vaultsForBossRecord`,
  weights 55/28/12/4/1) banked unopened with the run's loot.
- **Record semantics (the worked example, pinned in tests):** record 10 → an 11-boss run pays
  nothing (band 15 unreached); a 15-boss run pays one band. Matching or trailing the record
  pays zero, so the lane can't be farmed.
- Progress shows everywhere: the terminal's "Ichor bleed" panel (**Lifetime Bosses 13/15 ·
  next +2 Ichor**), the Profile's Boss Rush section, and Results (`outcome.rushProgress` —
  record line + an "Ichor Bled" row on a new record).

## §roulette — the Bio-Roulette (2026-07; game-wide spore engine 2026-07)

The game's slot-ceremony reward engine — an enormous living wheel of flesh: twelve reward
pods ring a central orifice that launches **Bio-Spores** one by one. Born Boss Rush-exclusive;
now a game-wide **spore economy** (the ceremony still pops after spore-earning rush runs, and
the banked lane spins from the Vault). Model: `state/bioRoulette.ts` (pure); ceremony:
`ui/BioRoulette.tsx` (canvas); collection: `meta.grantRouletteRewards`.

- **THE SPORE BANK (v48, `save.bioSpores`)** — every source deposits into one account-wide
  bank (cap 999 = the sanitizer clamp); a wheel session withdraws exactly what it plays.
  Sources:
  - **Boss Rush** (below — the founding lane): earned spores bank in `App.handleEnd` via
    `meta.addBioSpores`, THEN the ceremony opens with `min(bank, sporeCap)` — carried
    quest/pass spores ride along in the same session.
  - **First-kill chassis (any mode):** the idempotent `bossesSlain` registrar in meta banks
    **+1 the first time each boss chassis ever dies** — campaign/infinite/daily all feed the
    wheel.
  - **Quest finales:** every weekly finale pays `{ kind: 'bioSpores' }` (+1); the main
    questline escalates I/II/III → 1/2/3.
  - **Battle Pass milestones:** the season tables push a spore lane AFTER the filler fallback
    (free track: levels %25 → 4/season; premium: %20 → 5/season) — additive, nothing displaced.
  `PassReward` gained the `bioSpores` kind (labels ✺), `applyRewardList` banks it, and
  `eventsForPassRewards` + the `REWARD_TYPES` row placard it (nav → "Spin the Bio-Roulette").
- **THE VAULT BAY (`ui/GeneticVault.tsx`)** — the wheel's hub door, beside the Daily
  Bio-Cache: shows the bank, pulses when loaded, **Spin the Wheel** fires `rouletteBus.open()`
  (`state/navBus.ts`) → App opens a session on the bank (menu-only guard; no-op at 0) and the
  exit returns TO the Vault (`from: 'vault'` → `navBus.go('vault')`). The `vault.spores`
  notification source lights the vault badge/Ready-Chain while spores sit banked. Headless
  probe: seed bank → bay → spin → collect → bank 0 / ledger advanced / bay disarmed (the
  wheel's first full headless verification).
- **Spores** (`sporesFor` / `sporesFromParts`): **1 per NEW lifetime-record boss** (the
  `rushBestBoss` delta finishRun already computes — `rushProgress.newRecordBosses`) **+ 1 per
  5 bosses felled that run** (volume lane), capped at 40 per session. Zero EARNED spores ⇒ no
  forced ceremony (a carried bank stays spendable from the Vault).
- **The board is FRESH every run** (`rollBoard(rng, roster, tier)`): 12 weighted pods —
  tower/hero shards dominate, cores/scrap/essence fill the middle, a small Ichor pod tempts,
  **Bio-Gear is VERY rare (weight 2)** and a **Bio-Container EXTREMELY rare (weight 1)**.
  **§tier — DEPTH TIERS (2026-07 overhaul):** every QUANTITY scales with the account's
  `rushBestWave` record (`boardTier`: ×1 below wave 5, +0.25 per 5 waves, cap ×3) — the organ's
  payouts keep pace with progression (gear/container rarities never scale). Labels roll ONCE and
  reuse the same quantity they pay (a former double-roll could lie by ±1).
  **§surge — MUTATION SURGE (pity):** `rollOutcomesWithSurge` guarantees a streak of
  `ROULETTE.surgeAt` (5) common landings mutates the NEXT spore — it is forced into the
  **premium pool** (pods at weight ≤ 6: the big shard/core pods, Bio-Gear, the Container). The
  ceremony renders surge spores viral-magenta with a bigger comet + shockwave, and a live pity
  arc fills around the orifice. Every spore still pays; the surge only decides WHERE.
  **§jackpot:** one QUANTITY pod per ceremony (never gear/containers) is crowned ×3
  (`rollJackpot` + `tripleReward`) — gold double-ring on the wheel, tagged in the tally.
  Pod count and reward
  vocabulary are extension points (the renderer + outcome roll are count-agnostic).
- **Pre-rolled outcomes** (`rollOutcomes`): the physics is presentation — spheres launch
  ~0.55s apart, spin the organ under cubic-decel momentum, wobble to rest at their pod, get
  ABSORBED (pod flare + tally tick). **Reveal All** resolves the remainder instantly; **Absorb
  All** collects in one persist. Even "Collect & Skip" collects — spores are never lost.
- **Flow:** `App.handleEnd` banks then arms the ceremony from `rushProgress`; while pending,
  EVERY Results exit routes through it; a rush-launched exit returns to the menu, a
  vault-launched one to the Vault. The stamina entry pay moved to `App.startBossRush` so
  terminal launches and Results replays pay exactly once.
- **Ledgers:** `stats.rouletteSpores` (lifetime, additive; `grantRouletteRewards` also debits
  the bank by the session spend) + achievements `roulette_first` / `roulette_50` + a timeline
  beat; Help entry `bio-roulette` (auto What's New).
- Tests: `state/bioRoulette.test.ts` (spore math, board composition/weights, 20k-roll
  distribution, collection grants incl. the achievements composite, the banked-spore economy:
  cap/consume/clamp, the pass-claim interpreter path, season+finale source coverage).

## Extension seams (deliberate)

- Weekly gauntlet modifiers, chassis-banned weeks, leaderboards — all parameterize
  `startBossRushWave`'s TL curve + escort policy; the roulette board grows by pushing pods.
- Future: weekly gauntlet modifiers, chassis-banned weeks, leaderboards — all parameterize
  `startBossRushWave`'s TL curve + escort policy.

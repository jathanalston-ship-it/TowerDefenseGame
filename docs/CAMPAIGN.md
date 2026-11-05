# CAMPAIGN.md — Procedural Campaign Framework

The Campaign is **not** hand-authored. There are no scripted levels. Every stage is
**procedurally generated from deterministic rules**, so stage N (on a given difficulty)
is always the same — predictable enough to balance, unique enough to feel fresh — and the
ladder is endless without anyone authoring a level.

This file documents the generation algorithm (written before the implementation, per the
brief). Implementation: `src/core/campaign.ts` (pure generator) + a `'campaign'` run mode
in `src/core/game.ts`. Builds on `difficulty.ts` (the scalar levers), `boss.ts`
(`assembleBoss`), and the `WaveDef`/`SpawnDirector` spawn layer.

---

## 1. Inputs → a StageConfig

`generateStage(stage: number, difficultyId: string): StageConfig` is a **pure function**.
It seeds one `Rng` from `(stage, difficultyId)` and derives everything from it + smooth
formulas:

```
seed   = hash(stage, difficultyId)          // mulberry32 via Rng — same inputs ⇒ same stage
diff   = resolveDifficulty(difficultyId)    // the variant's 6 scalar levers (registry)
```

A `StageConfig` carries: `stage`, `biome`, `difficulty`, `waveCount`, `waves: WaveDef[]`
(pre-rolled, inspectable), `enemyPool`, `eliteFrequency`, `miniBoss`/`miniBossWave`,
`boss`, `scaling` (the difficulty levers for this stage), `enemySpeedMult`, `rewardMult`,
`lootQuality`, and the biome `modifier` + `hazard`.

---

## 2. Biome (deterministic, rotating)

`biome = BIOMES[(stage - 1) % BIOMES.length]` — every stage has a fixed biome that cycles,
so the player learns the rotation while each stage still varies (the rng drives the roster
+ composition within the biome). Biomes are **data** (self-registered in `biomeRegistry`),
each with: an `accent` color, an **enemy bias** (weight multipliers per derived category), a
telegraphed **modifier** name, and an **environmental hazard**. A biome's *mechanical*
identity is its roster bias + hazard; the modifier/hazard are telegraphed labels and
**deliberately do not perturb the scaling curve** (so HP/damage/speed/reward stay a pure,
monotonic, spike-free function of stage — see §3). A battlefield hazard-zone sim is a future
hook. Adding a biome = one data row.

### 2b. Arena layout

`layout = layoutForStage(stage)` — the battlefield's obstacle geometry (docs/MAP-LAYOUTS.md).
Stages 1–3 are authored onboarding pins (`CAMPAIGN_LAYOUT_PINS`: the tutorial's classic arena,
then one new routing idea per stage); every later stage draws a biome-flavored layout
(native ×3, minStage-gated, never the previous stage's), independent of difficulty. The stage
preview names it; the Game builds its flow field from it.

---

## 3. Smooth scaling (no spikes)

All scaling is **continuous + monotonic** in `stage` (geometric or capped-linear — never a
step jump), then multiplied by the chosen difficulty variant and the biome modifier:

```
hpMult     = (1 + HP_GROWTH)   ^ (stage-1)              // geometric, gentle (HP_GROWTH≈0.05)
damageMult = 1                                          // DMG_GROWTH = 0 — see below
speedMult  = min(SPEED_CAP,  1 + SPEED_GROWTH *(stage-1))  // capped — fast enemies stay fair
spawnMult  = min(SPAWN_CAP,  1 + SPAWN_GROWTH *(stage-1))
rewardMult = 1 + REWARD_GROWTH*(stage-1)
```

**Leak/contact damage does not scale with stage** (`dmgGrowth: 0`): player integrity never
grows, so a scaled leak would make "a bit of chip damage" cost 3× more integrity at stage 24
than at stage 1 — breaking the difficulty contract (docs/DIFFICULTY.md §contract). A leak is
a UNIT property (mite −2, apex −18); stage danger is expressed through hp/speed/count/elites.
The **recommendedPower index** is therefore exactly `hpMult × biome-toughness ratchet ×
variant` — the damage multiple that keeps time-to-kill stage-invariant, so a player at ratio
r of recommended kills at speed r on EVERY stage.

Each is a **pure function of stage** ⇒ strictly monotonic and spike-free (no biome term, so a
low-flavor biome can never dip the curve). `scaling` is then `combineDifficulty(diff,
stageScalars)` — a derived `DifficultyDef` (health/damage/spawn/elite/reward/boss). The Game
folds it through the **existing** difficulty application points, so stage mode is
byte-identical (every lever ×1 at stage 1 / standard) and golden runs are unaffected. Enemy
**speed** is the one lever the DifficultyDef doesn't carry, so it rides on `enemySpeedMult`
(default 1).

Reward quality / loot quality / currency all scale off `rewardMult` (bounty + biomass
in-run via the reward lever; end-of-run shards + loot points × `rewardMult` in `finishRun`).

---

## 4. Enemy roster (stage-gated + biome-biased)

The pool is derived from `ENEMY_DEFS` — **no manual per-stage lists** (future-proof: a new
enemy auto-slots by its stats):

```
effectiveHp(e) = hp + 12·regen/s + 6·armor + shield     // what the unit ACTUALLY denies
unlockStage(e) = max( clamp(1 + floor((effectiveHp(e) - BASE_HP) / HP_PER_TIER), 1, …),
                      mechanicsGate(e) )                // tougher ⇒ later
mechanicsGate  = flying/explode ≥ 3 · regen ≥ 4 · shield ≥ 5 · burrow ≥ 6 · siege ≥ 7
               | aura ≥ 8 · summon ≥ 9                  // learning cliffs enter staggered
category(e)    = special (has a trait: shield/regen/summon/siege/explode/aura)
               | heavy   (hp ≥ HEAVY_HP or armor ≥ HEAVY_ARMOR)
               | fast    (speed ≥ FAST_SPEED)
               | swarm   (otherwise)
pool   = { e ∈ ENEMY_KINDS \ {boss-visual 'tyrant'} : unlockStage(e) ≤ stage }
weight(e) = biome.bias[category(e)] ?? 1 · SIGNATURE_BOOST if biome-signature
```

So early stages field swarm/fast chaff; heavy + special enemies phase in as the curve rises,
and each biome leans its mix (e.g. a heavy biome over-weights `heavy`).

---

## 5. Wave composition (threat budget)

```
waveCount = min(WAVE_MAX, BASE_WAVES + floor((stage-1)/WAVE_INC_EVERY))
top       = BASE_BUDGET × budgetGrace(stage)            // STAGE_BUDGET_GROWTH = 0: density is
                                                        // FLAT — per-enemy hp growth carries
                                                        // the curve (recommendedPower honest)
open      = OPEN_BUDGET                                 // the wave-1 anchor (see §grace)
for w in 1..waveCount, t = (w-1)/(waveCount-1):
  budget_w = open + (top - open) · t^RAMP_EXP           // ramps to the stage's true pressure
             (× 0.55 on the finale — the boss carries it)
  unitCap  = UNIT_CAP_BASE + t·UNIT_CAP_RAMP            // early waves: SMALL units only —
  dmgCap   = DMG_CAP_BASE  + t·DMG_CAP_RAMP             // budget alone can't see that one
                                                        // 25-cost apex ≠ 25 mites vs 2 towers
  wavePool = { e : cost(e) ≤ unitCap, e.damage ≤ dmgCap }
             (w = 1 additionally requires speed ≤ 100 and no siege — still building)
  spend budget_w on weighted picks from wavePool → SpawnGroup[]:
     cost(e) = max(1, round(effectiveHp(e)/THREAT_DIVISOR · √(speed/60)))  // fast+regen+armor
     count   = clamp(floor(share/cost), 1, GROUP_MAX); spacing/delay by category
  each group rolls ELITE with probability eliteFrequency · min(1, t/0.35) — elites ramp in
  with the same progress axis (a ×3-HP body vs a 2-tower build is an auto-leak at any power);
  an elite group HALVES its count (fewer-but-stronger); exploders never roll elite.
```

The finale wave's boss + any mini-boss are spawned by the Game (framework bosses aren't
enemy-kinds), escorted by that wave's chaff.

---

## 5b. The grace window (§grace)

The in-run economy **resets every stage**, so wave 1 is always fought with the same
~220-Biomass opening build (2 towers) — while stage number keeps rising. Every opening aid
below exists to keep "start of ANY campaign run" answerable; all fade within a few stages:

| Mechanism | Shape | Gone by |
|---|---|---|
| `budgetGrace` | stage-1 waves spend 80 % of the base budget, linear → 100 % | stage 8 |
| `paceGrace` | spawn spacing/delays ×1.15 at stage 1, easing to ×1 | stage 5 |
| `stageStartAid` | +50 starting Biomass at stage 1, fading linearly | stage 6 |
| `openBudget` anchor | wave 1 ≈ 11 threat (≈ a dozen chaff) at EVERY stage (creep 0) | never |
| mini-boss gate | no mini-bosses before `MB_MIN_STAGE` (4) — a wave-3 summoner vs an opening build is unanswerable | stage 4 |
| onboarding finale | reduced boss (×0.5 → ×1 body + kit, `campaignBossStrength`) whose kit channels the core-shot instead of fielding sustain (§curve) | stage 5 |
| invasion gate | Run-Identity Rare Invasions draw from the STAGE's roster (`enemyPool`), never the whole bestiary | never |
| unit/dmg caps + elite ramp | every stage's early waves are small-unit, low-leak, elite-free (see §5) | per-wave t |

Calibrated empirically (autopilot probe at ×0.75/×1.0/×1.25/×1.7 of `recommendedPower`
across stages 1–24) to the contract in docs/DIFFICULTY.md §contract; the first three rows were
re-tuned in 2026-11 against the fresh-account probe (§curve) — the old 30 % / ×1.7 / +170 made
Stages 1–3 flawless for a 5-tower board, so the first real test was a binary finale.

---

## 5c. The Stage 1–3 curve (§curve)

**Evidence (2026-11 fresh-account playtest):** Stages 1–2 cleared flawlessly with a 5-tower
board (0 Hive damage, 600–900 Biomass banked), then a loss at the Stage-3 finale — *trivial,
trivial, wall*. The headless probe reproduced it: a fresh post-tutorial account built through
the real meta layer (exactly as `App.begin` + `GameView` boot a run), 30 seeds per stage, four
personas (`core/sim.testutil.ts` `playPersona` + the probe's two extra):

- **modest** — the playtest persona: the free gift + the favorite (needle) to a 5-tower board, banks the rest;
- **lazy5** — a 5-tower board that also deploys belt organisms; **steady** — one paid deploy per prep;
- **builder** — spends every prep on belt organisms + the favorite.

Three causes:
1. **Grace too generous** — 30 % budget × 1.7 pacing + 170 aid: waves never threatened even a
   5-tower board, so nothing taught the player to build.
2. **Binary finale** — a full-strength procedural boss (armor 14; heal / shield / harden kits)
   vs a needle-heavy board either died or out-healed the board and crushed the Hive: integrity
   median 100 %, p10 0 %.
3. **Rare Invasion from the whole bestiary** — Run Identity could drop 8 colossi into a stage-1
   wave (≈ 3 % of runs at stages 1–4: a guaranteed wipe).

**Fixes:** grace → 80 % / ×1.15 / +50 (§grace); the onboarding finale (`campaignBossStrength`
×0.5 → ×1 by stage 5 on body AND kit — docs/DIFFICULTY_DIRECTOR.md §onboarding — and
`onboardingKit`: sustain swapped for the telegraphed core-shot, which every onboarding finale
channels, so integrity loss GRADES with kill speed); campaign Rare Invasions draw from the
stage's own roster; the onboarding layouts are pinned (classic → open maw → twin lanes).

**Measured** (30 seeds; win % / mean integrity; stages 1 · 2 · 3; BEFORE = HEAD, AFTER = with layouts on):

| Persona | BEFORE | AFTER |
|---|---|---|
| modest (playtest) | 97/89 · 77/75 · 80/79 (median 100, p10 0 — binary) | 97/90 · 100/89 · 90/82 (median 94 · 93 · 89, p10 92 · 78 · 71) |
| lazy5 | 97/97 · 97/97 · 93/93 | 100/97 · 100/96 · 100/94 |
| steady | 97/97 · 97/96 · 97/96 | 100/99 · 100/98 · 100/97 |
| builder | 97/97 · 97/97 · 97/97 (every loss = the colossus invasion) | 100/100 · 100/98 · 100/99 |

Stages 4–5 (unchanged design: the stage-5 milestone boss is the first real dip) read modest
80/64 · 80/61, lazy5 100/90 · 100/77, builder 100/97 · 100/88 — the curve keeps rising after
the onboarding instead of inverting. Probe: `curve.ts` pattern over `playPersona` (the persona
harness in `core/sim.testutil.ts`); re-run it before touching any §grace / onboarding tunable.

Pinned by `src/state/campaignCurve.test.ts` (12 seeds): the modest persona wins ≥ 10/12 of
every stage with mean integrity inside 60–93 % and a median below 100 % (no longer flawless),
medians that never ease stage to stage, stage 3 the hardest of the three, and no stage-to-stage
drop of 15 points or more (no wall); the builder clears all three with integrity ≥ the modest
persona's. (The BEFORE curve fails it: the modest median was a flawless 100 % at every stage.)

**Limitations.** Full spenders stay near-flawless on Stages 1–3: grace levers cannot push a
builder below ~96 % (zero-grace probe) without inverting the 4–8 band, where the base curve is
equally easy for them — the 60–90 % band targets the playtest persona. Stage 4–5 remain the
first real dips (the stage-5 milestone boss), as before. The grace change re-rolls the procedural
finales of stages 1–7 (waves and boss share the stage rng stream).

---

## 5d. The opening — no more wave-1 coin flips (§opening — Batch G)

**Evidence (the G1 grind audit — ~560 headless Campaign runs on progression-sim accounts at
0.75 h / 8 h / 100 h, harness in the Batch G scratch `audit-grind/g1`):** runs were DECIDED in
waves 1–3 — 90 % of losses by wave 3 (median wave-1 death 15.9 s), 93 % of Hive damage there, 78 %
of wins flawless, boss/Mega waves ~2.7 integrity on average. The opening was a seed coin-flip:
the belt's first organisms depend only on the run seed, wave 1 admitted airborne packs, and a
Mega-hosting stage's organism surfaced WITH wave 1 (Stage 30: 0/3, dead in ~18 s).

Four levers, all Campaign-only (the Daily and the golden `stage` path never see them):

| Lever | Where | Rule |
|---|---|---|
| Airborne opening cap | `CAMPAIGN_OPENING.flyingUnitCap` → `composeStagePlan(…, opening)` | wave 1: fliers excluded from the pool (the budget goes to ground units); wave 2: flying groups trimmed to ≤ 4 units (a pure post-pass, no rng) |
| Mega arrival | `CAMPAIGN_OPENING.megaArrivalWave` (3) → `game.ts` wave launch | the organism surfaces with wave 3 (clamped to the stage), never with the opening build |
| The gift answers | `core/conveyor.ts` §opening (docs/STRAIN.md) | stage ≥ 4: the free run-start organism is an owned kind that answers the opening's threats (area DAMAGE for packs; never a summoner vs fliers), data-derived |
| The finale answers the snowball | `DIRECTOR_ADAPTIVE` live path (docs/DIFFICULTY_DIRECTOR.md §6a) | waves ≥ 4 + every boss body scale with the run's live Power ratio (upward only, capped) |

Stages 1–3 (`campaignCurve.test`) stay green: no fliers before Stage 3 anyway, the gift rule starts
at Stage 4, and the live multiplier is booted exactly as GameView boots it in that test.

**Measured (G1 harness, fixed account saves, frozen clock; the full GR1 set = replay + frontier+1/2/3/5/8 ×
4 seeds + a 17–25-stage curve × 3 seeds per account + a 12-seed deep stage). Columns: pre-Batch-G →
the first live release (caps 3/4) → v2 (board term + speed split) → v3 (cards out of the live ratio + the
live probe composition) → v4 (the coverage-graded probe, finale-weighted — docs/DIFFICULTY_DIRECTOR.md §6a):**

| metric | 8 h (S29): pre → v1 → v2 → v3 → v4 | 100 h (S80): pre → v1 → v2 → v3 → v4 |
|---|---|---|
| win % (all campaign runs) | 68 → 92 → 82 → 80 → 82 | 52 → 86 → 71 → 64 → 67 |
| frontier win % (stages past cleared) | 51 → 87 → 73 → 70 → 73 | 41 → 82 → 59 → 59 → 60 |
| frontier+1..3 / +5,8 win % (4 seeds each — noisy) | 58/75 → 75/88 → 75/50 → 58/62 → 67/50 | 50/50 → 83/75 → 67/75 → 67/62 → 67/62 |
| losses after wave 3 | 3 % → 67 % → 90 % → 91 % → 90 % | 13 % → 64 % → 83 % → 87 % → 86 % |
| wave-1 losses | 15 → 0 → 0 → 0 → 0 | 15 → 0 → 0 → 0 → 0 |
| flawless wins | 72 % → 80 % → 73 % → 69 % → 63 % | 55 % → 76 % → 67 % → 73 % → 62 % |
| Hive damage taken in waves 1–3 | 95 % → 33 % → 16 % → 14 % → 15 % | 88 % → 50 % → 32 % → 27 % → 28 % |
| curve wins past cleared per seed (s1/s2/s3) | 7/4/3 → 13/13/11 → 13/11/9 → 12/11/8 → 13/11/10 of 13 | 0/12/3 → 9/11/8 → 10/8/1 → 6/9/3 → 9/9/4 of 12 |
| winning wave-seconds on MATCHED (stage, seed) pairs | ×1.08 → ×1.01 → ×0.99 → ×0.98 | ×1.73 → ×1.76 → ×1.78 → ×1.73 (median pair ×1.73 → ×1.66 → ×1.81 → ×1.74) |
| median winning wave-seconds (all wins — the mix shifts) | 286 → 361 → 337 → 348 → 337 | 307 → 728 → 712 → 762 → 694 |
| draft-pick spread, 8 h frontier (strongest − weakest policy: win · flawless · end integrity, pts) | −2 · −6 · −4 → −6 · +2 · −5 → +4 · −4 · +3 → +16 · +6 · +10 → **+16 · 0 · +11** | — |

Pooled over all three accounts (v2 / v3 / v4): losses after wave 3 **9 % → 86 % / 89 % / 88 %**, Hive damage in
waves 1–3 **92 % → 22 % / 20 % / 20 %**, flawless wins 78 % → 78 % / 79 % / 73 % (v1: 84 %). The 0.75 h account
still clears its whole curve (99 % wins).

**Honest read.** The opening is no longer a coin flip (wave-1 losses 0) and the losses that remain come
in waves 4+ and on bosses. v2 brings frontier wins most of the way back toward pre-Batch-G (8 h 87 → 73 %,
100 h 82 → 59 %) and cuts flawless wins without lengthening runs (matched pairs ×1.01 at 8 h; 100 h on
par with v1). Still short of the targets: flawless ≤ ~55 % (73 / 67 %), and the 8 h +1..3 frontier sits
at the top of 55–70 % on the screen set (67 %) but at 75 % on the noisier full set. Seed spread is wide
again at 100 h past the cleared stage (10/8/1) — losses now track the board a seed's belt builds after
the opening, not a wave-1 lottery.

**v3 read.** Drafted cards no longer feed the live threat, and the live waves swap some chaff for the role
the board covers least (same threat budget, shown in the briefing) — so a draft pick now changes the
outcome: at the 8 h frontier the strongest pick policy beats the weakest by **+16 pts win** (+10 pts end
integrity), where every earlier version measured ~0 or negative. 8 h +1..3 lands in band (58 %), flawless
eases at 8 h (73 → 69 %), runs stay the same length (matched pairs ×0.99 / ×1.78 — parity with v2).
Not reached: flawless ≤ ~55 % (8 h 69 %, 100 h 73 %) — at 100 h the two sets disagree (screen set 76 →
61 %, full set 67 → 73 %), so treat 100 h flawless as unchanged within noise. Readiness 0.7 re-checked
under v3 (docs/PROGRESSION-LOOP.md §readiness): still holds.

**v4 read.** The probe now reads the board: each tower is graded on reach, area, pierce, burst and
control from its own numbers, and the live wave sends the role the board is thinnest against — in
practice ARTILLERY (it bleeds boards that lack killing power; reach does not answer it), with air packs
or sprinters where a board is clearly thinner there — weighted toward the finale, where the chip
survives the run's heals. Flawless wins fall on the full set (8 h 69 → 63 %, 100 h 73 → 62 %; pooled
with the screen set 65 → 59 % / 69 → 68 % — the 100 h screen sample is small and read v3 lucky), the
100 h +1..3 frontier lands in band (67 %), runs get no longer (matched pairs ×0.98 / ×1.73) and the pick
spread holds (+16 pts). Not reached: flawless ≤ ~55 % (pooled 59 / 68 %); the 8 h frontier is a touch
easier than v3 (70 → 73 %). Readiness 0.7 re-checked under v4: still holds. Next:
docs/DIFFICULTY_DIRECTOR.md §7.

---

## 6. Elites, mini-boss, boss

```
eliteFrequency = clamp(ELITE_BASE + ELITE_PER_STAGE*stage, 0, ELITE_CAP) * diff.eliteChanceMult
miniBossChance = clamp(MB_BASE   + MB_PER_STAGE  *stage, 0, MB_CAP)     * diff.bossFrequencyMult
miniBoss       = stage ≥ MB_MIN_STAGE && rng.chance(miniBossChance)
                 ? assembleBoss(rng, stage*MB_TIER_FRAC) : null   // §grace: none before stage 4
miniBossWave   = a middle wave (≈ ceil(waveCount/2))
boss           = assembleBoss(rng, stage)        // finale; boss difficulty scales via the tier `tl`
```

`assembleBoss` (boss.ts) is the boss **pool** (chassis archetypes) + **selection** (seeded)
+ **difficulty** (hp/damage scale with the tier). Both bosses spawn via `Game.spawnBoss`.

---

## 7. Completion & progression

- Persisted per difficulty: `save.campaign.cleared[difficultyId]` = highest stage cleared
  (0 = none). `withDefaults` fills `{}` for old saves (schema bump; additive).
- **Unlock:** clearing stage N sets `cleared = max(cleared, N)` ⇒ stage N+1 unlocks.
- **Replay:** any stage `≤ cleared + 1` is playable (cleared stages + the next).
- **Highest saved** always (the record drives the stage-select rail).
- **Difficulty variants** are just more `DifficultyDef` rows + their own `cleared` track —
  nothing else changes (the request's "easy to add").

---

## 8. Determinism & balance guarantees (tested)

- `generateStage(n, d)` is a pure function of its inputs ⇒ identical every call
  (`campaign.test.ts` pins this).
- Scaling is monotonic non-decreasing in `stage` and free of jumps (tested: no
  stage-to-stage spike beyond a small bound).
- Stage 1 / standard ≈ the baseline curve; the authored Stage mode is untouched (golden).

## 8b. The stage panel (§panel — UI, `ui/CampaignScreen.tsx`)

The focused stage's side panel splits into a BODY (sector/biome, modifiers, event + Mutation
choice, **Danger** ◆1–5 + `rewards ×N`, enemy forecast, boss/waves/scaling, unlocks,
Recommended Power, rewards, the frontier field note) and a FOOT: the pre-run **LoadoutStrip**
(heroes · gear · starting genes · doctrine, each a deep link), the **Threat** picker (cleared
stages only) and **Deploy/Replay**. On desktop (≥ 821px wide, ≥ 600px tall) the foot is
`position: sticky; bottom: 0` — at 1366×768 and 1440×900 the picker and the launch button are on
screen on arrival and stay pinned while the stage facts scroll under them. Phones and short
landscape keep the natural flow (the deploy ends the panel). The run estimate
(PredictionPanel) folds into a one-line `◇ Estimated stage ≈ N · likely a–b` summary that
expands to the full panel. Naming: the stage's own rating is **Danger** — "Threat" is only the
opt-in ladder (docs/THREAT.md §naming).

**§mission-card — Wave 1 (Batch G).** Under the enemy forecast, a **Wave 1** row names what the
first wave actually sends (`state/missionBrief.ts waveOneThreats` over the SAME generated plan the
Game spawns): the Mega Boss that arrives with wave 1 on Mega stages (and any boss mapped to wave 1)
first, then FLIERS (✈ — they skip the lanes and dive the Nucleus), then the biggest packs, ≤ 4 chips
with real integer counts. G1: openings decide Campaign runs (~90 % of losses in waves 1–3), and the
S30 frontier opened with a Mega + fliers the card never mentioned.

## 9. Known limitations / future hooks

- Environmental hazards are telegraphed + expressed as scalar tweaks today; a battlefield
  hazard-zone sim (acid rain, static fields as real field effects) is a future hook.
- "Loot quality" scales via reward/loot points (more & better boxes), not yet an explicit
  rarity-tier bias.
- Biome topology / node-graph routes (STAGES.md §5) are out of scope here — this framework
  is the seeded stage generator they would build on. Battlefield GEOMETRY per stage is live
  (docs/MAP-LAYOUTS.md).

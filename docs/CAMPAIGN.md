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
| `budgetGrace` | stage-1 waves spend 30 % of the base budget, linear → 100 % | stage 8 |
| `paceGrace` | spawn spacing/delays ×1.7 at stage 1, easing to ×1 | stage 5 |
| `stageStartAid` | +170 starting Biomass at stage 1, fading linearly | stage 6 |
| `openBudget` anchor | wave 1 ≈ 11 threat (≈ a dozen chaff) at EVERY stage (creep 0) | never |
| mini-boss gate | no mini-bosses before `MB_MIN_STAGE` (4) — a wave-3 summoner vs an opening build is unanswerable | stage 4 |
| unit/dmg caps + elite ramp | every stage's early waves are small-unit, low-leak, elite-free (see §5) | per-wave t |

Calibrated empirically (autopilot probe at ×0.75/×1.0/×1.25/×1.7 of `recommendedPower`
across stages 1–24) to the contract in docs/DIFFICULTY.md §contract.

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

## 9. Known limitations / future hooks

- Environmental hazards are telegraphed + expressed as scalar tweaks today; a battlefield
  hazard-zone sim (acid rain, static fields as real field effects) is a future hook.
- "Loot quality" scales via reward/loot points (more & better boxes), not yet an explicit
  rarity-tier bias.
- Biome topology / node-graph routes (STAGES.md §5) are out of scope here — this framework
  is the seeded stage generator they would build on.

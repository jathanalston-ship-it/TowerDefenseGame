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
hpMult     = (1 + HP_GROWTH)   ^ (stage-1)              // geometric, gentle (HP_GROWTH≈0.07)
damageMult = (1 + DMG_GROWTH)  ^ (stage-1)              // ≈0.05
speedMult  = min(SPEED_CAP,  1 + SPEED_GROWTH *(stage-1))  // capped — fast enemies stay fair
spawnMult  = min(SPAWN_CAP,  1 + SPAWN_GROWTH *(stage-1))
rewardMult = 1 + REWARD_GROWTH*(stage-1)
```

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
unlockStage(e) = clamp(1 + floor((e.hp - BASE_HP) / HP_PER_TIER), 1, …)  // tougher ⇒ later
category(e)    = special (has a trait: shield/regen/summon/siege/explode/aura)
               | heavy   (hp ≥ HEAVY_HP or armor ≥ HEAVY_ARMOR)
               | fast    (speed ≥ FAST_SPEED)
               | swarm   (otherwise)
pool   = { e ∈ ENEMY_KINDS \ {boss-visual 'tyrant'} : unlockStage(e) ≤ stage }
weight(e) = biome.bias[category(e)] ?? 1
```

So early stages field swarm/fast chaff; heavy + special enemies phase in as the curve rises,
and each biome leans its mix (e.g. a heavy biome over-weights `heavy`).

---

## 5. Wave composition (threat budget)

```
waveCount = min(WAVE_MAX, BASE_WAVES + floor((stage-1)/WAVE_INC_EVERY))
budget0   = BASE_BUDGET * (1 + STAGE_BUDGET_GROWTH*(stage-1))
for w in 1..waveCount:
  budget_w = budget0 * (1 + INTRA_BUDGET*(w-1))         // pressure ramps across the stage
  spend budget_w on weighted picks from the pool → SpawnGroup[]:
     cost(e) = max(1, round(e.hp / THREAT_DIVISOR))
     count   = clamp(round(share / cost), 1, GROUP_MAX); spacing/delay by category
  each group is promoted to ELITE with probability eliteFrequency (rng) — reusing the
  Director's in-place elite buff (no new archetype).
```

The finale wave's boss + any mini-boss are spawned by the Game (framework bosses aren't
enemy-kinds), escorted by that wave's chaff.

---

## 6. Elites, mini-boss, boss

```
eliteFrequency = clamp(ELITE_BASE + ELITE_PER_STAGE*stage, 0, ELITE_CAP) * diff.eliteChanceMult
miniBossChance = clamp(MB_BASE   + MB_PER_STAGE  *stage, 0, MB_CAP)     * diff.bossFrequencyMult
miniBoss       = rng.chance(miniBossChance) ? assembleBoss(rng, stage*MB_TIER_FRAC) : null
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

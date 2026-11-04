# DIFFICULTY_DIRECTOR.md — the Universal Difficulty Director

> **Permanent reference.** The single composition layer for every scaling policy in
> ASSIMILATION. No gameplay system composes balance factors inline anymore: the sim, the
> campaign generator, the settle layer, and the UI all **ask the director**
> (`src/core/difficultyDirector.ts`). Parity/identity pins: `src/core/difficultyDirector.test.ts`.
> Companions: `docs/DIFFICULTY.md` (the variant data), `docs/ENDLESS-SCALING.md` (curve design),
> `docs/MODE-IDENTITY.md` (mode rewards + doctrines).

---

## 1. Objective

One place that answers **"how hard is this content, and how richly does it pay?"** for any
combination of mode, difficulty variant, doctrine protocol, campaign stage, depth, and (in the
future) player-relative state. Adding content — a new mode, difficulty, doctrine, biome band,
or a new scaling factor — is a **data/factor edit here**, never a formula hunt across systems.

## 2. Architecture — policy vs. application

```
                         ┌──────────────────────────────────────┐
  DifficultyDef ────────▶│                                      │
  DoctrineWarp ─────────▶│   UNIVERSAL DIFFICULTY DIRECTOR      │──▶ threat curves (per wave/depth)
  Stage scaling ────────▶│   (core/difficultyDirector.ts)       │──▶ queue warps (hp/bounty/elite/count)
  WAVE_*/ENDLESS curves ▶│   pure composition, zero state       │──▶ economy view (settle multipliers)
  MODE_REWARDS ─────────▶│                                      │──▶ hazard rating / power targets
  AdaptiveInputs ───────▶└──────────────────────────────────────┘
        (weights 0 today — see §6)
```

- **The director owns POLICY** — which factors exist, how they compose, what the number is.
- **Owning systems keep APPLICATION** — *where* a factor lands (per-spawn, per-wave, at settle)
  is simulation/settle mechanics. The sim multiplies the director's factors at its existing
  sites **in the existing order**, which is what keeps the golden runs byte-identical.

### The composition map (who asks what)

| Consumer | Asks the director for | Applied at |
|---|---|---|
| `game.ts` constructor | `difficulty` (warp-damage folded once), `queueWarp()`, `enemySpeedStatic()` | run boot |
| `game.ts` scripted waves | `waveHpMult(idx0)`, `waveBountyMult(idx0)` | wave scheduling (× run-state HP mod) |
| `game.ts` endless waves | `endlessHpMult/BountyMult/SpeedMult/DamageMult(depth)` | depth scheduling + per-spawn |
| `game.ts` doctrine step | `queueWarp()` hp/bounty/elite/count | after each wave is scheduled (runEventRng) |
| AI Director (`director.ts`) | the same `DifficultyDef` (eliteChanceMult, bossFrequencyMult) | wave composition budget |
| `campaign.ts` generator | `composeStageDifficulty(variant, stageScaling)`, `campaignBossStrength(stage)` + `scaleBossStrength(def, s)` (§onboarding) | stage generation |
| `meta.ts` settle | `economyFor(id)`, `modeCoreMult/modeLootMult/modeMasteryMult`, `doctrineEconomy(id)`, `lootQualityTier(...)` | finishRun / loot bias / mastery XP |
| `InfiniteScreen` (any picker) | `hazardRating(difficulty, doctrine)`, `modeLootMult × doctrineEconomy` | display |

Division of labor with the other "directors": the **Difficulty Director** decides *how much*
(scaling policy); the **AI Director** (`core/director.ts`) decides *what* (wave composition
under a threat budget); the **Spawn Director** decides *when/where* (emission mechanics).

## 3. Inputs and axes

**`DirectorInputs`**: `difficulty` (resolved `DifficultyDef` — campaign passes its combined
per-stage def), `warp` (doctrine protocol), `stageEnemySpeedMult`, `adaptive` (§6), `threat` (the
Threat ladder level — `threatWarp(level)` composes LAST onto `warp` via `composeWarps`; 0/omitted is a
referential passthrough — docs/THREAT.md). `threatEconomy(level)` is the ladder's run-end reward policy.

**Threat axes** (per run): enemy HP, damage (folded once into the run's difficulty), speed
(static stage×variant product + endless depth curve), spawn rate, queue warps (hp/bounty/
elite-chance/count), elite/boss frequency (consumed by the AI Director via `DifficultyDef`).

**Curve families**: scripted/campaign waves ride the linear `WAVE_HP_GROWTH`/`WAVE_BOUNTY_GROWTH`
curves; Infinite rides the `ENDLESS` family (geometric HP — the wall; linear damage; clamped
speed; lagging bounty). A doctrine's `scalingRateMult` accelerates the **depth term** of all
four endless curves.

**Economy axes** (settle): difficulty economy scalars (`rewardMult, xpMult, lootQualityMult,
containerRateMult, equipQualityMult, powerTargetMult`), mode reward identity (`MODE_REWARDS`
— which mode pays which currency), doctrine run-end economy (reward mult + essence/wave),
loot-quality tier (difficulty tilt + prestige Fortune + codex bonus on one scale).

## 4. Identity guarantees (why this refactor changed nothing)

- `standard` difficulty + no doctrine + fresh account ⇒ **every axis is exactly ×1** over the
  base curves. The golden characterization suite (6 seeds) pins the whole sim byte-identical.
- The director returns factors that the consumers multiply **in the same order** as the old
  inline code — IEEE-754 association preserved (pinned per-formula in
  `difficultyDirector.test.ts`, which reproduces the legacy expressions verbatim).
- Neutral factors are composed as exact `×1` multiplications (bit-exact identity in IEEE-754),
  so a seam can *exist in the formula* without perturbing anything until it is weighted.

## 5. Extension guide

- **New difficulty variant** → add a `DifficultyDef` (data). Every mode + the director inherit it.
- **New doctrine protocol** → add a `DoctrineWarp` (data). Sim warps + run-end economy follow.
- **New mode** → resolve a `DifficultyDef`, create a director, read `economy()` at settle, and
  add one entry per `MODE_REWARDS` table. No mode re-implements "harder/richer".
- **New scaling factor** (e.g. seasonal modifier, mutator, weekly affix) → add an input +
  compose it into the relevant axis methods here; consumers change **zero** lines.
- **New consumer** (simulator, forecast UI, balance validator) → construct `DirectorInputs`
  and query; the module is pure and state-free.

## 6. Adaptive seams — present, neutral, simulator-gated

`DIRECTOR_ADAPTIVE` (config.ts) weights two player-relative factors into the chains:

| Seam | Formula | Composed into | Weight today |
|---|---|---|---|
| `threatPerPowerRatio` | `×(1 + w·(powerRatio − 1))` | wave/endless HP, endless damage | **0** |
| `rewardPerPerformance` | `×(1 + w·recentPerformance)` | wave/endless bounty | **0** |

`powerRatio` = actual/expected account power for the content; `recentPerformance` = a signed
recent-outcome score. The progression-loop engine supplies `AdaptiveInputs`; the **weights may
only be tuned from progression-simulator evidence** (docs/BALANCE roadmap), never intuition —
that rule is pinned by a test asserting the weights are 0 until a simulator report ships.
The endless **speed** curve deliberately takes no adaptive term (its readability cap must bind).

## 6b. Campaign onboarding boss strength (§onboarding)

The first campaign stages' finale bosses field a **reduced** body: `campaignBossStrength(stage)`
ramps linearly from `CAMPAIGN_ONBOARDING.bossStrengthFloor` at stage 1 to exactly ×1 at
`bossFullStage` (config.ts), and `scaleBossStrength(def, s)` applies it to the boss's HP, contact
damage, armor (default `BOSS.baseArmor`) AND every kit `amount` (heal, shield, adds, core-shot).
Scaling the kit matters: a weaker body that keeps a full-strength healer still out-heals an
opening board — the fresh-account Stage-3 wall (docs/CAMPAIGN.md §curve). The helper returns the
same def object at ×1, so every stage from `bossFullStage` on — and every authored milestone
boss — is byte-identical. This is the campaign analogue of the Boss Rush strength ramp
(`RUSH.strength*`) and Infinite's `endlessBossStrength`.

## 7. Future factors (reserved compositions)

Campaign stage, infinite depth, difficulty, doctrine, mode, and stage-speed are live inputs
today. Reserved, in priority order: biome threat bands (biome mods already apply per-spawn —
promoting them to director inputs is additive), boss-presence weighting, prestige tier,
seasonal/weekly modifiers, per-mutator warps. Each lands as **one input + one factor** here.

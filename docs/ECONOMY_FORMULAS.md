# ECONOMY_FORMULAS.md — the adaptive economy framework

> **Permanent reference.** Every income formula, every sink curve, every multiplier axis, and
> the health mechanisms that keep the economy stable as content grows. Source of truth:
> `src/core/economyDirector.ts` (income compositions, factor traces) with the per-axis
> policies in `src/core/difficultyDirector.ts`. Parity + health pins:
> `src/core/economyDirector.test.ts`. Companions: `DIFFICULTY_DIRECTOR.md`,
> `PROGRESSION-LOOP.md`, `PROGRESSION_REPORT.md` (simulated pacing), `SHARD-ECONOMY.md`.

---

## 1. Architecture

```
 run outcome (wave, kills, mode, stage, doctrine)
        │
        ▼                    policies (difficultyDirector)
 economyDirector income chains ◀── mode identity · difficulty economy · doctrine economy
        │                          prestige/collection bonuses (save-derived, passed in)
        ▼
 settle (meta.finishRun) — applies floors/flat bonuses, persists
```

- **One composition per currency**, expressed as `base × factor₁ × factor₂ × …` applied
  left-to-right (float order is part of the contract — settles must not re-associate).
- **Factor traces**: every payout can be explained (`explainIncome`) — "base 620 ×
  prestige.lootGain ×1.1 × mode.loot ×1.0 …" — for debugging, reports, and future UI.
- New progression system that pays or scales a currency ⇒ **one named factor added here**,
  never an inline multiplier in a settle.

## 2. Income formulas (the complete set)

| Resource | Formula (factors apply left-to-right) | Where |
|---|---|---|
| **Genome Cores** (account currency) | `⌊(wave·ECON.shardsPerWave + kills·ECON.shardsPerKill) × prestige.shardGain × prestige.coreGain × campaign.stageReward × difficulty.endlessReward × mode.core × doctrine.reward × threat.reward × adaptive⌋ + firstClearBonus` — `threat.reward` is the Threat ladder's bonus (docs/THREAT.md; ×1 at Threat 0) | `coreShardIncome` |
| **Loot points** (Bio-Container meter) | `⌊(wave·LOOT_EARN.pointsPerWave + kills·pointsPerKill) × prestige.lootGain × campaign.stageReward × mode.loot × difficulty.containerRate × collection.bossLoot × endless.taper × threat.reward × adaptive⌋` — banked LIVE at `base × prestige.lootGain` during the run (syncRunLoot), remainder at settle. **DORMANT until the account's first Mega Boss kill** (docs/LOOTBOX.md §meter): both legs bank 0 while `megaProgress.slain` is empty — run/stage caches still pay | `lootPointIncome` |
| **First-clear bonus** | `⌊(firstClearCore + perStage·stage + milestone every Nth) × collection.campaignReward⌋`, once per never-cleared stage | `CAMPAIGN_REWARDS` |
| **Mastery XP** | `masteryXpRaw(usage) × mode.mastery × difficulty.xp × prestige.masteryXp × collection.towerXp/heroXp` | `masteryXpMults` |
| **Gene Essence** | container drops (rarity-scaled, `GENE_ESSENCE` tables) + duplicate conversion + doctrine `essencePerWave × waves` | `openContainer` / `doctrineEconomy` |
| **Tower/Hero Shards** | per-container rolls: `RARITIES[r].reward` (rolls × shard ranges × hero-shard chance; hero rolls biased toward locked heroes) | `rollLoot` |
| **Crafting materials** | run-cache tables (mutagen/scrap; catalyst pity-protected) | `rollChest` |
| **Equipment** | per container: `EQUIP_DROP_CHANCE`, item level from `powerItemLevel(powerScore)` — drops track account power | `rollItemForPower` |
| **Biomass** (in-run) | bounty curves owned by the Difficulty Director (`waveBountyMult`/`endlessBountyMult`) × the player's build (`biomassMult`) | sim |
| **Ascendant Cells** | on Molt: `⌊cellGain·√(cycleShards/cellScale)⌋`, gated by campaign stage | `cellsForCycle` |

**Container quality** (which rarity drops): weight table (`RARITIES.weight`) × the
progression-aware catch-up bias (`lootBias`) tilted by `lootQualityTier` (difficulty tilt +
prestige Fortune + codex bonus) — policy in the Difficulty Director; pity ceilings guarantee
epic/legendary/mythic floors.

## 3. Sink curves (the anti-inflation side)

| Sink | Curve | Shape |
|---|---|---|
| Tower stars | `towerStarCost(s)` | geometric (≥ +15%/star — pinned) |
| Hero stars | `heroStarCost(s)` | geometric (≥ +10%/star — pinned) |
| Meta upgrades | `baseCost × costMult^level` | geometric (pinned) |
| Gene levels | per-card authored cost tables (essence) | rising per level |
| Gene slots | rising slot costs | rising |
| Reforge/craft | material costs per action | flat per action, bounded outputs |
| Molt | resets Shards + upgrade levels → compounding cells | the long-range sink |

Every spendable currency must keep ≥ 1 sink whose cost compounds; every farmable currency
must keep ≥ 1 positive per-run source — both pinned in `economyDirector.test.ts`. The known
design debt (sinks thinning in the mid-late band — `EA-DESIGN-AUDIT.md` §4) shows up in the
simulator's `sinkExhaustion` detector and is the balance milestone's docket, with evidence.

## 4. Health mechanisms

- **Anti-starvation:** pity ceilings (guaranteed epic/legendary/mythic floors), locked-hero
  shard bias, catch-up loot bias for behind-the-curve accounts, positive per-run sources
  (pinned), and the `catchUpPerPowerGap` income seam (below).
- **Anti-inflation:** geometric sinks (pinned), the Infinite qualify gate
  (`INFINITE_REWARD_QUALIFY_FRAC` — short runs pay nothing), diminishing endless bounty
  (bounty lags HP with depth), and the `aheadTaperPerPowerGap` income seam (below).
- **Anti-exploit:** campaign caches only on wins; Infinite forfeits below the qualify bar;
  abandon forfeits everything.

## 5. Adaptive seams (`ECONOMY_ADAPTIVE`, config.ts) — **ACTIVATED 2026-07**

| Seam | Formula | Weight |
|---|---|---|
| `catchUpPerPowerGap` | `×(1 + w·gap)` when behind the frontier's power bar (gap > 0) | **0.35** |
| `aheadTaperPerPowerGap` | `÷(1 + w·|gap|)` when far ahead (gap < 0) | **0.5** |

Activated per the §4 protocol on `PROGRESSION_REPORT.md` evidence (`BALANCE_ARCHITECTURE.md`
§7 round 3): the post-liveops faucet stack ran optimal-play molt cadence ~+50% past the tuned
target while deep bands hit dead-progression zones (farm income under the next geometric sink
price) and a ×16 deep p10–p90 luck spread. Mechanics:

- **`powerGap`** `= recommendedPowerScore(frontier)/accountPower − 1`, computed once per settle
  in `meta.finishRun` and composed into BOTH the core and loot chains as the `adaptive.income`
  factor. The gap is **clamped** (`maxCatchUpGap` 2 / `maxAheadGap` 0.9), so catch-up saturates
  at ×1.7 and the taper at ÷1.45 — extremes bend, never break.
- **Onboarding floor** (`minStage` 10): below it no inputs are passed — the chain multiplies by
  an exact ×1 (IEEE-754 identity), so fresh-account settles stay byte-identical (pinned).
- **Surfacing:** the catch-up side ships on Results as **Momentum** (`RunOutcome.momentum`,
  present only when >×1.005); the taper is silent by design (it reads as natural pacing) but
  fully visible in the factor trace (`explainIncome`).
- Re-tuning either weight remains a §4 protocol change: regenerate the simulator evidence first.
  `DIRECTOR_ADAPTIVE` (threat-side) stays at 0 — economy-side pacing sufficed.

## 6. Scale guarantees (content growth doesn't destabilize)

- New **towers/heroes**: shard income is content-agnostic (random-kind rolls); per-kind sinks
  arrive with the content. No formula changes.
- New **containers/rarities**: register a `RarityDef` (weight/cost/reward/pity) — the queue,
  meter, bias, and pity inherit it.
- New **currencies**: add a source composition here + a compounding sink; the framework's
  test template pins both.
- New **modes**: one `MODE_REWARDS` row + a resolved difficulty — every chain inherits.
- New **progression systems**: pay through a named factor; never an inline multiplier.

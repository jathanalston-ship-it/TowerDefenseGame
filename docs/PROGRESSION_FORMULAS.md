# PROGRESSION_FORMULAS.md — every progression curve, in one place

> **Permanent reference.** The mathematical spine of player progression: requirement curves,
> reach curves, power composition, and each permanent system's growth formula. Sources of
> truth are the modules cited per row; the loop-level relationships are enforced by
> `src/state/progressionLoop.test.ts`. Companions: `BALANCE_ARCHITECTURE.md` (how the pieces
> govern each other), `DIFFICULTY_DIRECTOR.md` (scaling policy), `ECONOMY_FORMULAS.md`
> (income/sinks), `PROGRESSION_REPORT.md` (simulated pacing).

---

## 1. Requirement curves (what the world demands)

| Curve | Formula | Source |
|---|---|---|
| Campaign stage scaling | HP ×(1.07)^(s−1) · damage ×(1.05)^(s−1) · spawn ×min(1.5, 1+0.01(s−1)) · speed ×min(1.6, 1+0.012(s−1)) · reward ×(1+0.05(s−1)) | `core/campaign.ts` C |
| Recommended Power (the readiness bar) | `POWER_BASE × √(hpMult×diffHp × dmgMult×diffDmg) × powerTargetMult` — geometric ≈ ×1.06/stage, doubles every ~11 stages | `recommendedPowerScore` |
| Scripted wave curves (in-run) | HP ×(1 + 0.12·wave₀) · bounty ×(1 + 0.05·wave₀) | Difficulty Director |
| Endless depth curves (in-run) | HP ×1.12^(d−1) (geometric wall) · damage +5%/d · speed +0.4%/d cap ×1.5 · bounty +3%/d (lags HP) | Difficulty Director / `ENDLESS` |
| Difficulty variants | Relaxed→Nightmare threat ×0.8→×2.6 HP with economy ×0.9→×2.0 riding | `core/difficulty.ts` |

## 2. Reach curves (what power buys)

| Curve | Formula | Notes |
|---|---|---|
| Campaign reach | `≈ 4 + 6·log₂(1+powerMult) ÷ difficultyHp` stages | +6 stages per power doubling |
| Infinite reach | `≈ 5 + 9·log₂(1+powerMult) ÷ difficultyHp` waves | +9 waves per doubling |
| Self-calibration | `bias += 0.35·(actual − estimate)` per finished run | `core/predict.ts` |

Geometric requirements + logarithmic reach ⇒ **each stage band costs geometrically more
power** — the loop's resistance (PROGRESSION-LOOP.md invariant 1).

## 3. Power composition (how systems become strength)

`PowerScore = POWER_BASE × meta × towers × heroes × equipment × collection × temporary`
(`accountPowerParts` — every bucket ×1 on a fresh account.)

| Bucket | Growth formula | Cap / gate |
|---|---|---|
| Upgrades (meta) | per-upgrade linear effects; cost `base × costMult^level` (geometric) | Molt resets levels |
| Prestige (meta) | `1 + multPerCell·√lifetimeCells` — **unbounded**, compounding across Molts | Molt gated on campaign stage (`prestigeStageReq` grows per molt) |
| Ascendant tree (meta) | per-node authored bonuses; cells from `⌊cellGain·√(cycleShards/scale)⌋` | permanent across Molts |
| Collections (meta) | codex tier bonuses (`collectionBonusEffects`) | content-bounded |
| Gene levels (meta) | per-card authored levels → `geneCollectionPowerMult` | level cap gated by stage (`geneLevelCapForStage`) |
| Hero slots (meta) | `1 + HERO_SLOT_POWER × (slots−1)` | slots gated by stage (`HERO_SLOTS`) |
| Tower stars | per-star damage tiers (geomean over kinds) | ★cap gated by stage (`campaignStarCap`), ★10 max |
| Tower/hero mastery | level = f(XP) with rising `masteryReq`; +damage/level | **saturates in Power** (log): a texture lever, never the carry — pinned |
| Equipment | item level `powerItemLevel(powerScore)` — drops track account power | multiplicative buffer, self-scaling |

**Interlock (pinned):** no single bucket suffices deep (mastery-only plateaus below stage
31's bar); the stage-cap basket clears every next stage with ≥50% slack through stage 90;
prestige is the unbounded deep lever. `progressionLoop.test.ts` invariants 3–5.

## 4. Per-system progression formulas

| System | Formula | Source |
|---|---|---|
| Mastery level | XP thresholds via `masteryReq(level)` (rising); XP = `masteryXpRaw(usage) × xpMults` | `core/mastery.ts` |
| Tower star cost | steep smooth exponential `towerStarCost(s)` (≥ +15%/star pinned) | `state/meta.ts` |
| Hero star cost | `heroStarCost(s)` (≥ +10%/star pinned) | `state/meta.ts` |
| Hero unlock | Apex Genome ≥ per-hero cost; drops biased toward locked heroes | `unlockHero` |
| Gene level | per-card authored essence costs; global cap by stage gates | `core/geneCards.ts` |
| Molt requirement | `firstStage`, then `req = max(req+1, ⌈req × growth⌉)` per molt | `prestigeStageReq` |
| Loot queue | box cost per rarity (`RARITIES.cost`); progress = settle loot points; pity ceilings 40/90/200 | `core/lootQueue.ts` |
| Collection tiers | kills/usage thresholds per category | `core/collection.ts` |

## 5. The loop, quantified

1. **Push** while `power ≥ recommendedPowerScore(frontier)` (loop engine phase).
2. **Wall** re-forms geometrically (each +6-stage band needs another power doubling).
3. **Farm** Infinite at `≈ 5 + 9·log₂(1+powerMult)` — loot ×1.0, mastery ×1.35 premiums.
4. **Convert** farm income through the sinks (§4) — multiple systems, by design.
5. **Break through**; caps (stars/genes/slots) rise with the new stages; repeat.
6. Deep game: **Molt** cadence takes over (√cells compounding, stage-gated).

Time-per-band lives in `PROGRESSION_REPORT.md` (simulated); structural guarantees live in
`progressionLoop.test.ts`. Tuning any row above = change the cited source constant, re-run
`npm test` (invariants) and `npm run sim:progression` (pacing evidence) — in that order.

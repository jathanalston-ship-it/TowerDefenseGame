# PRIME-STRAINS.md — the per-unit infinite ladder past max Stars

> Status: **SHIPPED** (save v39). Core math `src/core/prime.ts` · tunables `config.PRIME` ·
> purchases `meta.buyTowerPrime` / `meta.buyHeroPrime` (the star seam continued) · fold
> `towerProgress` / `heroProgress` damageMult lane · UI Tower Lab / Hero Lab star panels ·
> tests `state/prime.test.ts`, `state/directShardGrants.test.ts`.

Past ★max, every tower (Strain Samples) and hero (Apex Genome) opens a **PRIME ladder**:
repeatable levels with steeply geometric shard costs and small, honestly diminishing damage
returns. Prime is the endgame answer to "my favorite unit is finished": the unit is never
finished, but each next step costs more and gives less — a sink that can absorb unbounded
income without breaking the power curve.

## §curves — the closed forms (config.PRIME)

**Cost** (per level, the unit's own shard lane):

```
cost(L → L+1) = round(finalStarCost × costMult × costGrowth^L)
              = round(5120 × 1.0 × 1.4^L)   (towers; heroes anchor at heroStarCost(★9))
```

- `costMult 1.0` — Prime L1 costs exactly the ladder's final star: the grind *continues*, no cliff.
- `costGrowth 1.4` per level (requirement ≥ 1.35). Opening rungs (towers): **5,120 · 7,168 ·
  10,035 · 14,049 · 19,669 …** — ten levels in, a single level costs ~148k samples.

**Bonus** (the ONE multiplier lane folded into the star/mastery pipeline):

```
mult(L) = 1 + b·L₀·ln(1 + L/L₀)        b = bonusPerLevel = 0.005, L₀ = softCapLevels = 40
```

- `mult(0) = 1` **exactly** — a save with no Prime levels folds byte-identically (golden-safe,
  pinned by the fold-identity test).
- The curve's slope at 0 is `b` — the first level grants ≈ **+0.5%** damage.
- Marginal gain of level L ≈ `b / (1 + L/L₀)`: at L₀ (=40) each level is worth **half** the
  first; at 3·L₀ a quarter. Unbounded but logarithmic — L40 ≈ +5.9%, L100 ≈ +12.5%,
  L400 ≈ +48% — while costs at those depths are astronomically geometric. Power can never
  run away through Prime; wallets can always be emptied into it.

**Catalyst cross-link** (`catalystTiers`): buying a TARGET level ≥ 6 also consumes **1 Catalyst**;
≥ 26 consumes **2** — the material economy (salvage, container pity) gates the deep ladder, so
Prime depth is throttled by play breadth, not just shard hoarding. The purchase is **atomic**:
shards and Catalyst leave together or not at all (pinned).

## §seam — purchases

`meta.buyTowerPrime(kind)` / `meta.buyHeroPrime(kind)` mirror `buyStar` exactly: guarded by the
same `progress.star` security policy, one atomic persist, factor-traced costs from the pure
closed forms, account-XP acquisition fold, Power announcement. **Refused below max Stars** —
Prime is the continuation of the star seam, never a bypass. Locked units refuse too (their
shards still bank toward the unlock).

## §fold — runs and Power

Prime rides the SAME per-kind pipeline stars and mastery already use — one extra factor on
`damageMult` in `towerProgress` / `heroProgress` (`× primeMult(level)`), so every consumer
(sim towers, heroes, Power, previews, lab stats) inherits it with no new plumbing. Power gains
the prime contribution through the existing `towers`/`heroes` geomean buckets — no new
POWER_RELEVANT_FIELDS entry (the coverage test stays green by construction).

## §economy — the conversion decision (deliberate tension)

With Prime live, a max-Star unit's shards are spendable again. The interaction with the
duplicate→Essence conversions is now:

| Lane | Behavior with Prime |
|---|---|
| **Container opens** | STILL convert maxed duplicates to Gene Essence (rarity-scaled, window-boosted — the dominant Essence source, unchanged); since 2026-11 also a below-★max tower's SURPLUS past its whole remaining ladder (docs/SHARD-ECONOMY.md §7) |
| **Direct lanes** (level-ups, quest/season/pass claims, milestones, premium packs) | **BANK** — the old `settleDirectShardGrants` "leak closer" is retired; grants keep flowing into the unit's shard lane as Prime fuel |

That split is the design: the player *chooses* between holding direct income for Prime depth
and cracking containers for Essence (opens auto-convert their maxed dupes — you cannot have
both from the same container). We do NOT auto-convert outside containers anymore: auto-conversion
would silently rob the new sink, and "shards became Essence you didn't ask for" reads as a bug
once a visible Prime button wants those shards. Documented in GENE-EVOLUTION.md §Economy;
pinned by `directShardGrants.test.ts` (banking) + the lootbox suite (container conversion).

## §simulation — 1,000-hour accrual delta (progression simulator, 8 seeds × 1,000 h)

The virtual-account simulator's greedy spend policy now buys Prime levels after stars
(`progressionSim.spendEverything`, small per-pass caps; `progressSignature` counts prime
levels). `PROGRESSION_REPORT.md` regenerated 2026-07-11; the 1,000-hour band vs. the
previous committed report (generated 2026-07-02, pre-Prime):

| Metric (1,000 h, p50) | 2026-07-02 report | 2026-07-11 report | Delta |
|---|--:|--:|--:|
| Power | 12,449,217 | 79,185,747 | ×6.4 |
| Campaign stage | 163 | 232 | +69 |
| Molts | 52 | 75 | +23 |
| **Sink exhaustion** (flagged bands) | **4** | **0** | **cleared** |

**Attribution — read honestly.** The two reports bracket NINE intervening systems (cosmetics
v2, battle pass, quests, weekly directives, nemesis/vows, hive construction, nucleus mulligans,
daily bio-cache … all Power-moving), so the Power/stage rows measure the cumulative envelope
shift, NOT Prime alone. Prime's own damage share is provably small by construction: the log
curve caps a unit at ≈+2.5–4.4% at the sim's typical endgame depths (L10–20), geomean-diluted
across the roster — a low-single-digit % of account Power. **The Prime-specific result is the
last row:** the pre-Prime report flagged sink exhaustion in 4 deep bands (shard wallets
compounding with nothing to buy); with Prime the detector reads 0 — the infinite ladder
absorbs deep-band shard income exactly as designed, while the wall-stall detector stayed at 0
(the sink adds no new walls). Full tables in `docs/PROGRESSION_REPORT.md`.

## §ui

- **Tower Lab / Hero Lab**: below ★max the panel teases the ladder ("◈10 opens the PRIME
  ladder — infinite levels, ever-diminishing gains"). At ★max the star button is replaced by
  the PRIME section: current level, banked bonus %, the NEXT level's honest gain
  (+x.xx%), shard price + Catalyst requirement when a tier applies, and a Power preview.
  The buy plays the same StarCeremony choreography (full pip track, level reveal, next-level
  preview).
- **Profile**: the Collection section shows total Prime levels across the account once > 0.
- **Roster filters**: "Upgradeable" includes a maxed unit with an affordable Prime level.

## §invariants

1. `primeMult(0) === 1` — byte-identical fold for any save without Prime (golden-safe).
2. Purchases are atomic across shards + Catalyst, and refused below ★max.
3. Costs grow ≥ 1.35× per level; the bonus's marginal gain is strictly decreasing.
4. Prime never adds a run-mod field — Power coverage holds by construction.
5. Direct shard lanes bank; only container opens convert duplicates.

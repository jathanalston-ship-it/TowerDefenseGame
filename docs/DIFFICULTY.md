# Difficulty & the economic rebalance

Difficulty is the game's primary economic lever. Rather than a single "make enemies tankier"
slider, each preset re-tunes the **whole ecosystem** — threat *and* reward — so a harder track is a
genuine risk/reward trade, not a wall. `src/core/difficulty.ts` is the single source of truth;
every mode references the same `DifficultyDef` instead of hardcoding balance math.

## Selection lives inside each mode

Difficulty is **not** chosen on the Main Menu. It is selected where it applies and each mode
remembers its **own** choice independently (persisted in `localStorage` via `state/prefs.ts`):

- **Campaign** difficulty → chosen in the Campaign screen (`difficultyPref('campaign')`).
- **Infinite** difficulty → chosen in the Infinite screen (`difficultyPref('infinite')`).
- The Home screen shows the campaign difficulty **read-only** ("set in Campaign").

`App` reads the per-mode pref at run start; `finishRun` reads the run's difficulty to settle the
economy. Campaign progress (`campaign.cleared`) is already keyed per difficulty, so each track has
its own ladder.

## The 12 levers

`standard` is **full identity** (every scalar = 1), so the shipping game and the golden tests are
byte-identical. Both groups rise monotonically easy→hard.

| Lever | Axis | Consumed by |
|---|---|---|
| `enemyHealthMult` | Enemy HP | sim / campaign / director |
| `enemyDamageMult` | Enemy Damage | sim |
| `enemySpeedMult` | Enemy Speed | sim (`stageSpeedMult`, both modes) |
| `spawnRateMult` | spawn pressure | sim |
| `eliteChanceMult` | elite promotion | campaign / director |
| `bossFrequencyMult` | Boss frequency | campaign / director |
| `rewardMult` | Reward multipliers (Genome Cores, bounty) | `finishRun` (campaign via stage scalar; endless via `endlessRewardMult`) |
| `xpMult` | Experience (Mastery XP) | `finishRun` mastery |
| `lootQualityMult` | Loot quality | `lootBiasFor` → progression-loot rarity bias |
| `containerRateMult` | Container rates | `finishRun` loot points |
| `equipQualityMult` | Equipment quality | *(reserved — see below)* |
| `powerTargetMult` | Power Score scaling | `recommendedPower` (the readiness bar) |

### Preset band

| | relaxed | standard | hardened | brutal | nightmare |
|---|--:|--:|--:|--:|--:|
| Enemy HP | 0.80 | 1.00 | 1.35 | 1.80 | 2.60 |
| Enemy Speed | 0.92 | 1.00 | 1.08 | 1.18 | 1.30 |
| Reward | 0.90 | 1.00 | 1.25 | 1.50 | 2.00 |
| XP | 0.90 | 1.00 | 1.20 | 1.45 | 1.80 |
| Loot quality | 0.90 | 1.00 | 1.20 | 1.50 | 2.00 |
| Container rate | 0.90 | 1.00 | 1.15 | 1.30 | 1.50 |
| Power target | 0.85 | 1.00 | 1.20 | 1.50 | 2.00 |

## How this rebalances the ecosystem (not just HP)

The request was to rebalance the whole loop for the expanded progression **without** simply
inflating enemy health. The economy was already centralized (`config.ts` `ECON` / `MODE_REWARDS` /
`STAR` / `CAMPAIGN_REWARDS`, the shard ladders, evolution caps, the Power Score and
progression-loot systems); the rebalance therefore works through the **difficulty scalars** layered
on top of those curves, keeping `standard` as the calibrated baseline:

- **Campaign / Infinite** — threat and reward scale together per the table; mode identity
  (`MODE_REWARDS`: Campaign = currency, Infinite = loot/mastery) is preserved and multiplied by the
  chosen difficulty.
- **Loot / Containers** — harder difficulty tilts the progression-loot bias richer and fills the
  container meter faster; on-par/standard is an exact no-op.
- **Power Score growth** — the recommended-power bar scales with `powerTargetMult`, so the
  readiness gauge stays meaningful as difficulty rises.
- **Equipment / Heroes / Tower upgrades / Gene Cards / Permanent progression** — these are earned
  through the currency/loot/XP streams above, so scaling those streams rebalances acquisition rate
  without touching the (golden-locked) base combat numbers.

## The difficulty contract (§contract)

The player-facing promise that all campaign tuning serves (retuned 2026-07 on player
feedback — "stage 1 unclearable at 1700/1000 power"):

| Power vs recommended | Experience |
|---|---|
| **above** (≥ ~1.25×) | pretty much no damage — a rare leak at worst |
| **even** (~1.0×) | a bit of early-run chip damage and/or some boss-round damage |
| **≤ 0.75×** | a bad time — heavy integrity loss, real risk of failure |

**How it holds by construction.** `recommendedPower(stage) = hpMult × biomeBar × variant`:
the exact damage multiple that keeps time-to-kill stage-invariant (stage `dmgGrowth` is 0 —
a leak costs the same integrity at every depth, so "chip damage" means the same thing at
stage 1 and stage 40). `biomeBar` is a RATCHET — the hardest biome region encountered so far
(Frostbound ≈ ×1.22) — so the bar never understates a harsh region and never tells the
player a later stage needs *less* power (strictly rising, tested). Density is FLAT across
stages; wave budgets are opening-anchored (docs/CAMPAIGN.md §grace) because the in-run
economy resets every stage.

**Verified empirically**, not by formula alone: an autopilot probe plays real generated
stages at ×0.75 / ×1.0 / ×1.25 / ×1.7 of `recommendedPower` (5 seeds × stages 1–24). As of
the 2026-07 retune: all ratios win everywhere; avg integrity lost at ×1.0 ranges 0 (stages
1–3, 24) to ~35 (Frostbound); ×0.75 loses 33–74 mid-band. Re-run the probe after any change
to campaign scaling, wave composition, enemy stats, or tower balance.

## Balancing assumptions & limitations

- **`standard` is the calibrated baseline** and stays identity — all rebalancing is relative to it,
  so golden/sim tests never move.
- **Monotonic, bounded.** Threat and economy both rise with difficulty; the top tier
  (`nightmare`) roughly doubles the richest economy axes — a premium, not a jackpot.
- **`equipQualityMult` is reserved (data + validated, not yet wired).** Equipment now drops inside
  banked containers that are cracked later in the Vault, decoupled from the run's difficulty, so
  applying it correctly needs the container to remember the difficulty it was earned at — a small,
  localized follow-up. The lever exists so that change is data-only.
- **Endless enemy speed** now honors difficulty (via the sim's `stageSpeedMult`); all other threat
  axes already flowed through the shared `DifficultyDef` for both modes.
- **Tunables:** the whole surface is the `DIFFICULTIES` table — re-tuning the economy is a data edit
  with zero call-site changes.

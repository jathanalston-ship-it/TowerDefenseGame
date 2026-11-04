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

## The campaign curve (§curve) — 2026-07 re-anchor

The flat geometric +5%/stage EHP curve was trivial against the early economy: bio-containers
compound a reinvesting account ~×25 across its first ~10 stages of income (live data: 45k
power at stage 10 vs a 1.9k bar; the pre-change simulator's Fresh bot cleared stage 62 in 10
hours). The late tail already converged — only the early anchor was wrong. The curve is now
**piecewise geometric** (`campaign.ts C.compFromStage/compToStage/compGrowth`):

| Segment | Growth | Why |
|---|---|---|
| Stages 1–8 | +5%/stage | onboarding — unchanged |
| Stages 9–25 | **+20%/stage** | the COMPENSATION BAND — a one-time steep climb fit against the post-container-gate simulator arrival medians |
| Stages 26+ | +5%/stage | resumes from the elevated baseline (net ×~9.8 ≈ a one-time +45-stage shift) |

`recommendedPower` still derives from the same `hpMult`, so the label and real enemy EHP move
together by construction. Displayed ladder: ~1.5k @8 · ~2.2k @10 (×1.15 raid premium ⇒ ~2.5k
shown) · ~6.2k @15 · ~15k @20 · ~38k @25 (the optimized-account wall) · ~137k @50 · ~968k @90.

**Mega-stage raid premium** (`C.megaStagePremium`, ×1.15 — was ×1.8): every 10th stage hosts a
Mega Boss. The old ×1.8 came from a pre-raid-targeting probe; the 2026-11 re-measure on real
accounts (docs/MEGA-BOSS.md §hunt) found a mega stage wins as often as the same stage with its mega
suppressed (9/18 vs 9/18), so the bar keeps only a small spike for the finale's longer hold — the
~day-long wall before every 10th stage is gone. The premium keeps the DISPLAYED bar honest; enemy stats never read it
(label + readiness only — the same never-understate principle as the biome ratchet). The
ladder is therefore a rising curve with authored SPIKES on mega stages: strictly rising across
wave stages, a spike up onto each raid, strictly rising over any decade
(`progressionLoop.test.ts` invariant 1).

**Hive-guardian override** (`game.ts megaRaidYield`, docs/MEGA-BOSS.md §targeting): while the
Core is threatened (attackers locked on, or enemies inside the final-defense zone) every
tower/beam yields raid duty to normal targeting. Without it a sparse early board tunneled an
open organ while wave 1 walked into an undefended Hive — the original stage-10 probe wipe
(0/3 at ×3.0 of the bar; 3/3 at ×1.5 after the override).

**Measured acceptance** (progression simulator, 5 seeds/persona, post-gate + post-curve):
Average first-walls at ~stage 25 at 0.90× the bar; Efficient at ~25 at 0.96×; the Fresh bot
reaches stage 29 in 10h (was 62) with its wall at the band. Every farm outlet is open before
the first wall (Infinite @3, Daily @5, Boss Rush @9 — moved from 10 so the stage-10 raid never
strands a walled account with a locked outlet).

**Stage-gate review under the new hour-cost** (2026-07, recorded decisions): Gene level gates
15/30/50/75 KEPT — they now span the journey (≈2–5h / ≈10h / ≈35–50h / ≈100–120h Average)
instead of collapsing into a weekend. Hero slot 2 @25 KEPT (the wall's reward); slot 3 @90
KEPT DELIBERATELY as a long-horizon endgame goal (≈150h+). Nucleus trials @40/@75 KEPT
(endgame chambers by design). Deep-Strain gate @15 KEPT (a mid-band chase). Boss Rush 10→9
(above). Prestige's linear +3-stages/molt requirement KEPT — the slower deep frontier slows
the molt gate proportionally, preserving relative pacing.

**Watch item:** non-mega deep stages just past the band exit (probe: stage 28 at ×1.0 lost
1-of-3 with ~71 integrity) run hot — pre-existing speed/elite gradient, within the owner's
"never under-difficult" doctrine; revisit if player data agrees.

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

**Siege semantics (2026-07, docs/HIVE-SIEGE.md):** enemies no longer deal one breach burst —
they ATTACK the Core (damage/interval DPS until killed), so "integrity lost" = sustained
pressure × how long attackers survive. The same contract table holds (re-verified below);
per-hit damage remains a stage-flat unit property.

**Verified empirically**, not by formula alone: an autopilot probe plays real generated
stages at ×0.75 / ×1.0 / ×1.25 of `recommendedPower` (3 seeds × a stage lattice through the
compensation band, 1–30). The pilot is a FAIR one — it keeps converting income into towers
mid-wave, forward pads first, the way a live player does; a prep-only pilot understates every
board. As of the 2026-07 re-anchor (§curve): ×1.25 wins everywhere (0–39 lost, worst at the
tier-3 raid); ×1.0 wins everywhere with chip-to-boss-round damage (0–21 on wave stages, 2–18
on mega stages against their premium'd bar; stage 28 is the recorded watch item); ×0.75 is a
bad time (49–111 lost, losses on raid/deep stages). Ratios on mega stages are measured
against the DISPLAYED (premium) bar — what the player actually reads. Re-run the probe after
any change to campaign scaling, wave composition, enemy stats, or tower balance.

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

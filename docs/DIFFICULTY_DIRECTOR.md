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

## 6. Adaptive seams — simulator-gated

`DIRECTOR_ADAPTIVE` (config.ts) weights two player-relative factors into the chains:

| Seam | Formula | Composed into | Weight today |
|---|---|---|---|
| `threatPerPowerRatio` | `×(1 + w·(powerRatio − 1))` | wave/endless HP, endless damage (static input) · Campaign LIVE board power (§6a) | **0.1** (live path only — see §6a) |
| `rewardPerPerformance` | `×(1 + w·recentPerformance)` | wave/endless bounty | **0** |

`powerRatio` = actual/expected power for the content; `recentPerformance` = a signed
recent-outcome score. The **weights may only be tuned from progression-simulator / harness
evidence** (docs/BALANCE roadmap), never intuition — pinned by `difficultyDirector.test.ts`.
Nothing supplies the STATIC boot-time `AdaptiveInputs.powerRatio`, so with the threat weight now
non-zero every static curve is still bit-exact ×1 (pinned). The endless **speed** curve
deliberately takes no adaptive term (its readability cap must bind).

## 6a. LIVE board power — the Campaign finale answers the snowball (Batch G)

**Why.** The grind audit (G1, ~560 headless Campaign runs on progression-sim accounts) found runs
DECIDED in waves 1–3: 90 % of losses happened by wave 3, 93 % of Hive damage landed there, 78 % of
wins were flawless, boss/Mega waves cost 2.7 integrity on average. The in-run snowball (cards,
Hero Evolution, branches, strains — the run's temporary Power reaches ×60–90 by a 12-wave finale)
out-scales the scripted wave curve (`WAVE_HP_GROWTH`, linear) many times over.

**What.** A Campaign run whose app passes `RunOptions.livePowerBase` (= account Power ÷ the stage's
recommended Power, `GameView`) re-feeds the SAME seam at every wave launch:

```
liveRatio      = livePowerBase × effectsPower(game.powerEffects())   // = live run Power ÷ recommended
liveThreatMult = r ≤ 1 ? 1 : min(liveCap,     1 + threatPerPowerRatio·(r − 1))   // chaff waves ≥ liveFromWave
liveBossMult   = r ≤ 1 ? 1 : min(liveBossCap, 1 + threatPerPowerRatio·(r − 1))   // every boss body, any wave
liveThreatParts(m) = { hp: m^(1−s), pace: m^s }    s = livePaceShare            // "pace, not sponge"
```

Shipped: `threatPerPowerRatio` 0.5 · `liveFromWave` 4 · `liveCap` 16 · `livePaceShare` 0.5 ·
`liveBossCap` 16 (config.ts `DIRECTOR_ADAPTIVE`).

- **Where it lands:** a wave ≥ 4 schedules its chaff at HP × m^½ and spawn rate × m^½ (the work the
  board must do per second rises ×m, half of it as pressure instead of a slower slog); every boss
  body (mini-boss, finale, gauntlet bosses — `spawnBoss(def, hpScale)`) takes the whole boss
  multiplier — a boss can't be paced, and pull auras don't move it. The opening (waves 1–3) and the
  Mega (its own tier curve) are untouched.
- **Upward only:** an at- or under-powered board (r ≤ 1) is never propped up.
- **Visible:** the wave briefing shows `▲ ADAPTED ×N` (`HudSnapshot.liveThreat` — in prep, the
  multiplier the NEXT wave would launch with right now, so the preview equals the outcome while the
  board is unchanged); Help row `hive-adapts`.
- **Golden / replay safety:** omitted ⇒ exactly ×1 (`stage`, Daily, Arena, every probe that doesn't
  pass it; `liveThreatParts(1)` is exactly {1, 1}). The input is ctor data (recorded by replays) and
  the ratio is sim state ⇒ deterministic.

Paired with the Campaign OPENING rules (docs/CAMPAIGN.md §opening — no fliers in wave 1, ≤ 4 in
wave 2, the Mega no earlier than wave 3, the gift answers the opening), the tension moves from a
wave-1 seed coin-flip to waves 4+ and the bosses.

**The fit (G1 harness, "tune" subset = replay + frontier+1..3 × 4 seeds + the curve past the cleared
stage × 3 seeds; 8 h account S29 / 100 h account S80; all with the opening rules + answer gift):**

| variant | 8 h win % | 100 h win % | losses after w3 (8/100) | flawless wins (8/100) | median win wave-sec (8/100) |
|---|---|---|---|---|---|
| before (no levers) | 45 | 44 | 0 % / 0 % | 76 % / 48 % | 329 / 320 |
| w 0.1, HP only, cap 3 | 85 | 62 | 75 / 87 | 100 / 84 | 588 / 1080 |
| w 0.25, ½ pace, cap 4, boss 10 | 93 | 83 | 25 / 25 | 88 / 72 | 475 / 995 |
| w 1, ¾ pace, cap 64, boss 16 | 91 | 63 | 40 / 73 | 84 / 79 | 510 / 859 |
| w 0.5, ½ pace, cap 32, boss 32 | 75 | 35 | 77 / 84 | 71 / 89 | 656 / 1233 |
| w 1, ½ pace, cap 64, boss 64 | 58 | 25 | 86 / 83 | 62 / 85 | 802 / 1225 |

Lessons: an answering gift removes the opening lottery, which WAS most of the difficulty — every
variant wins far more than before unless the live threat is large; pace-heavy splits are EASIER
(area boards love clumps); HP is what bites, and it lengthens waves. One weight can't fit both
accounts (w 1 suits 8 h, crushes 100 h) because the Power Score's temporary bucket doesn't track the
board's real growth (18 towers vs 2 isn't in it). The shipped 0.5 / 16 is the compromise; the full
before/after is in docs/CAMPAIGN.md §opening. Known limitation → §7 (a board-size input).

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
today (plus the §6a live board-power ratio).
**Next for §6a:** a BOARD-SIZE term in the live ratio (towers fielded vs the opening build) —
the Power Score's temporary bucket misses it, which is why one weight can't fit every account. Reserved, in priority order: biome threat bands (biome mods already apply per-spawn —
promoting them to director inputs is additive), boss-presence weighting, prestige tier,
seasonal/weekly modifiers, per-mutator warps. Each lands as **one input + one factor** here.

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
board          = max(1, towersFielded / liveBoardOpening) ^ liveBoardExp           // §7 board term
invested       = effectsPower(Hero Evolution + branches + strains)               // the Biomass investment
liveRatio      = livePowerBase × invested × cards^liveCardExp × board            // live board ÷ recommended (cards: 0 ⇒ out)
liveThreatMult = r ≤ 1 ? 1 : min(liveCap,     1 + threatPerPowerRatio·(r − 1))   // chaff waves ≥ liveFromWave
liveBossMult   = r ≤ 1 ? 1 : min(liveBossCap, 1 + threatPerPowerRatio·(r − 1))   // every boss body, any wave
liveThreatParts(m, staticSpeed) = { hp: m^(1−p−s), pace: m^p, speed: min(m^s, liveSpeedCeiling ÷ staticSpeed) }
liveWave(plan, board, m) = promoteEliteShare(swapInProbe(plan, liveProbeKind(pool, board), liveProbeShare·(1−1/m)),
                                             liveEliteShare·(1−1/m))                // v3 COMPOSITION
```

Shipped (v3, "picks matter"): `threatPerPowerRatio` 0.6 · `liveCardExp` 0 · `liveProbeShare` 0.3 ·
`liveEliteShare` 0 · `liveFromWave` 4 · `liveFromStage` 4 · `liveCap` 8 · `livePaceShare` 0.2 ·
`liveSpeedShare` 0.5 · `liveSpeedCeiling` 1.85 · `liveBossCap` 4 · `liveBoardOpening` 3 ·
`liveBoardExp` 1 (config.ts `DIRECTOR_ADAPTIVE`). History: v1 w 0.5 · ½ pace · caps 16/16 (no board,
no speed) → caps 3/4 (run length) → v2 board term + speed share, w 0.3 → v3 below.

- **Where it lands:** a wave ≥ 4 schedules its chaff at HP × m^0.3, spawn rate × m^0.2 and enemy
  SPEED × m^0.5 — speed adds threat while SHORTENING waves, so it is bounded by readability: the
  stage's own speed × the live part never exceeds `liveSpeedCeiling` (1.85 = `ENDLESS.speedCap`).
  When speed hits that ceiling the applied multiplier is below m. Every boss body (mini-boss,
  finale, gauntlet bosses — `spawnBoss(def, hpScale)`) takes the whole boss multiplier — a boss
  can't be paced or sped past its chassis, and pull auras don't move it. The opening (waves 1–3),
  Stages 1–3 (`liveFromStage` — the onboarding curve, `campaignCurve.test`) and the Mega (its own
  tier curve) are untouched.
- **The board term (§7 follow-up):** the Power Score's temporary bucket (cards, Hero Evolution,
  branches, strains) never sees board SIZE — a run grows 2 → 18 towers. `board` counts towers fielded
  vs the opening build (2 deploys + the gift = 3): board power ∝ per-tower power × towers is the
  physical model, and it is what made one weight fit both accounts.
- **Cards out (v3):** the drafted gene cards are excluded from the ratio (`liveCardExp` 0). A stronger
  pick used to raise the threat with it — the pick spread at 8 h was +4 points. Hero Evolution,
  branches and strains stay in: they are Biomass INVESTMENT that tracks the board's real growth (and
  the economy that drives it), not the draft's choice quality.
- **Threat by COMPOSITION (v3):** part of the live answer changes what the wave IS. `liveWave` (Game)
  swaps `liveProbeShare × (1 − 1/m)` of the wave's plain groups — at the SAME threat budget, keeping
  each group's delay — for the board's PROBE kind: `campaign.ts LIVE_PROBE_ROLES` are data predicates
  (airborne packs vs a board with no area damage — the conveyor's `damagesArea` answer class — else
  artillery, else burrowers: roles no board fully answers); of the first unanswered role in the stage
  pool, the LIGHTEST body (the probe threatens by its role, not its bulk). A live ELITE share
  (`promoteEliteShare`, the campaign's fewer-but-stronger rule) is also wired but shipped at 0 (it
  added run time for little chip damage). Deterministic, a copy of the plan, and the prep preview
  calls the same `liveWave` — the briefing lists every swapped-in kind (with its role tag) and every
  elite (★N) before the wave launches.
- **Upward only:** an at- or under-powered board (r ≤ 1) is never propped up.
- **Visible:** the wave briefing shows `▲ ADAPTED ×N` = the APPLIED product hp × pace × speed
  (`HudSnapshot.liveThreat` — in prep, what the NEXT wave would launch with right now, so the preview
  equals the outcome while the board is unchanged); Help row `hive-adapts`.
- **Golden / replay safety:** omitted ⇒ exactly ×1 (`stage`, Daily, Arena, every probe that doesn't
  pass it; `liveThreatParts(1)` is exactly {1, 1, 1}; a queued spawn only carries `speedMult` when
  it is ≠ 1). The input is ctor data (recorded by replays) and the ratio is sim state ⇒ deterministic.

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
| w 0.5, ½ pace, cap 16, boss 16 (first release) | 78 | 50 | 75 / 79 | 77 / 77 | 586 / 1230 |
| w 0.5, ¾ pace, cap 16, boss 6 | 95 | 79 | 0 / 57 | 87 / 76 | 444 / 946 |
| w 0.5, ½ pace, cap 6, boss 6 | 80 | 58 | 73 / 77 | 84 / 77 | 518 / 890 |
| **w 0.5, ½ pace, cap 3, boss 4 (shipped)** | 91 | 77 | 40 / 57 | 84 / 75 | 441 / 876 |

Lessons: an answering gift removes the opening lottery, which WAS most of the difficulty — every
variant wins far more than before unless the live threat is large; pace-heavy splits are EASIER
(area boards love clumps); HP is what bites, and it lengthens waves. One weight can't fit both
accounts (w 1 suits 8 h, crushes 100 h) because the Power Score's temporary bucket doesn't track the
board's real growth (18 towers vs 2 isn't in it). Known limitation → §7 (a board-size input).

**Where the run length comes from — matched (stage, seed) pairs** (pairs that WIN both before and
with the first release: 56 at 8 h, 43 at 100 h; same job order for every row, frozen clock; ratio =
Σ winning wave-seconds ÷ the same pairs before):

| lever stack | 8 h ratio | 100 h ratio | 100 h pairs still won | wave-1 losses |
|---|---|---|---|---|
| (a) opening rules only (flier caps + Mega wave 3; plain gift; live off) | ×1.01 | ×1.02 | 39/43 | 1 / 0 |
| (b) + answering gift (drag aura first) | ×0.86 | ×1.18 | 42/43 | 0 / 0 |
| (b′) + answering gift, AREA first | ×0.86 | ×1.14 | 38/43 | 0 / 1 |
| (c) + live threat, first release (caps 16/16) | ×1.63 | ×2.67 | 35/43 | 0 / 0 |
| (c′) area-first gift + caps 16/16 | ×1.63 | ×2.34 | 23/43 | 0 / 1 |
| **(c″) + live threat, shipped caps 3/4** | ×1.08–1.10 | ×1.61–1.73 (run-order noise) | 41–42/43 | 0 / 0 |

The ×3.6 headline at 100 h (first release) was ~¼ mix — more long, deep stages now winning — and
~¾ the live threat's HP (waves 4+ went 238 → 725 s per run; the drag-aura gift added ~+16 %, an
area-first order saved only 4 points while costing 100 h wins). Caps 3/4 keep the opening fix
(wave-1 losses 0), keep losses mostly late (40 % / 57 % of losses after wave 3 vs 0 % before) and
the Hive damage mostly past wave 3, at the price of a softer finale: frontier win rates rise more
than with 16/16. The full before/after is in docs/CAMPAIGN.md §opening.

**v2 — restore the frontier without padding runs (board term + speed).** Screen set = frontier+1/2/3/5/8
× 4 seeds + the curve past the cleared stage × 3 seeds + the matched pairs; same job order for every
row; "pairT" = matched-pair winning wave-time vs pre-Batch-G:

| variant (all with the opening rules + gift) | 8 h F+1..3 / F+5,8 / curve | 8 h flawless · pairT | 100 h F+1..3 / F+5,8 / curve | 100 h flawless · pairT |
|---|---|---|---|---|
| pre-Batch-G | 58 / 75 / 36 % | 74 % · ×1.00 | 50 / 62 / 42 % | 69 % · ×1.00 |
| shipped v1 (w 0.5, ½ pace, caps 3/4) | 92 / 75 / 87 % | 86 % · ×1.14 | 83 / 88 / 67 % | 85 % · ×1.92 |
| v1 + board term only | 92 / 75 / 90 % | 83 % · ×1.16 | 92 / 75 / 78 % | 76 % · ×1.94 |
| board, w 0.1, cap 8, ¼ pace + ½ speed | 92 / 75 / 92 % | 77 % · ×0.99 | 67 / 75 / 69 % | 77 % · ×1.71 |
| … + caps × readiness² (ready accounts get fuller caps) | 92 / 62 / 92 % | 69 % · ×1.15 | (= row above — 100 h is never "ready") | |
| … readiness² caps + 0.15 pace (HP share 0.35) | 58 / 62 / 82 % | 61 % · ×1.28 | 75 / 62 / 64 % | 65 % · ×2.01 |
| board, w 0.3, cap 8, ¼ pace + ½ speed | 83 / 62 / 87 % | 67 % · ×0.97 | 75 / 50 / 56 % | 82 % · ×1.79 |
| **board, w 0.3, cap 8, 0.2 pace + ½ speed (shipped v2)** | **67 / 50 / 85 %** | **64 % · ×1.02** | **75 / 75 / 61 %** | **76 % · ×1.86** |

Lessons: with caps 3/4 the cap binds by wave ~5 anyway, so the board term alone changes nothing — it
matters once the multiplier has room (w 0.3, cap 8). Speed is the lever that adds threat without
length (×0.97–1.02 run time at 8 h); readability bounds it (only ×1.16 of room at 100 h, where stage
speed is already 1.6), so 100 h keeps leaning on HP. Opening the caps for "ready" accounts helped 8 h
flawless but cost run time — not shipped. Draft-pick spread at 8 h (strongest vs weakest pick, 51
runs each): pre-G −2 pts, v1 −6, v2 +4 — wins left the ceiling but picks still barely decide runs.

**v3 — make picks matter and wins less flawless (cards out + composition).** Same screen set and run
order; "pick spread" = 8 h frontier (+1..3 and the curve past cleared, 51 runs per policy), the
harness's strongest-Power pick vs its weakest, as win % / flawless % / mean end integrity:

| variant (all with the v2 board term + speed split) | 8 h F+1..3 / curve · flawless · pairT | 100 h F+1..3 / curve · flawless · pairT | pick spread (win · flawless · integrity) |
|---|---|---|---|
| live v2 (cards IN, w 0.3) | 67 / 85 % · 64 % · ×1.02 | 75 / 61 % · 76 % · ×1.86 | +4 · −4 · +3 |
| cards out, w 0.3 | 83 / 85 % · 75 % · ×1.04 | 67 / 58 % · 74 % · ×1.87 | +6 · +14 · +9 |
| cards out, w 0.6 | 67 / 87 % · 72 % · ×1.03 | 75 / 67 % · 72 % · ×1.80 | +4 · +14 · +6 |
| … + elite share 0.4 | 58 / 82 % · 70 % · ×1.11 | 83 / 61 % · 65 % · ×2.03 | +6 · +2 · +9 |
| **… + probe share 0.3 (shipped v3)** | **58 / 82 % · 59 % · ×0.99** | **83 / 58 % · 61 % · ×1.91 (median ×1.68)** | **+16 · +6 · +10** |
| … + probe share 0.6 | 42 / 64 % · 59 % · ×1.06 | 58 / 42 % · 88 % · ×1.86 | +18 · +10 · +13 |
| … + probe 0.4 + elite 0.25 | 58 / 69 % · 67 % · ×0.99 | 83 / 50 % · 62 % · ×1.97 | +8 · +16 · +9 |
| w 0.5, probe 0.4 | 50 / 74 % · 68 % · ×1.00 | 83 / 58 % · 66 % · ×1.79 | +16 · +16 · +9 |
| w 0.6, probe 0.35, cap 6 | 58 / 72 % · 61 % · ×0.99 | 75 / 42 % · 81 % · ×1.76 | +10 · +4 · +11 |

Lessons: excluding the cards alone opens an INTEGRITY gap between strong and weak picks (+14 flawless)
but not a win gap — the threat must also stop being "more of the same". Composition is the lever that
moves both: a probe share of 0.3 turns ~0.2 of a late wave into the role the board covers least and
cuts flawless wins at no run-length cost (8 h ×0.99), while the pick spread opens to +16 win points.
Elites cost time for little chip; a probe share past ~0.4 crushes 100 h (curve 42 %).

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
today (plus the §6a live board-power ratio, whose BOARD-SIZE term shipped in v2).
**Next for §6a:** (v3 shipped the cards-excluded ratio and the live probe.) The probe's board read is
deliberately coarse — one reliable coverage axis (area damage) plus roles no board fully answers; a
richer coverage model (reach vs artillery standoff, armor shred vs plated kinds) needs per-tower kit
data the sim applies in code today (e.g. the needle's Fracture is not in its derived kit). The 100 h
account still wins the +1..3 frontier ~4 in 5 on the small label sample. Reserved, in priority order: biome threat bands (biome mods already apply per-spawn —
promoting them to director inputs is additive), boss-presence weighting, prestige tier,
seasonal/weekly modifiers, per-mutator warps. Each lands as **one input + one factor** here.

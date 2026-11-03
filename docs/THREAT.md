# THREAT.md — The Threat Ladder (canonical)

> The opt-in difficulty ladder that is the main replay axis (Hades Heat / Slay the Spire
> Ascension). Code: `src/core/threat.ts` (the ladder + pure settle), `src/core/difficultyDirector.ts`
> (composition), `src/core/economyDirector.ts` (the `threat.reward` factor), `src/save/derive.ts`
> (save-aware reads), `src/ui/components/ThreatPicker.tsx` (picker / Results line / Profile record).
> Tests: `src/core/threat.test.ts`, `src/state/threatMeta.test.ts`.

## The player contract

- Before a run on **solved content** — a Campaign **replay** of a stage you have already cleared
  (on that difficulty track), an **Infinite** run, or a **Boss Rush** — pick a **THREAT** level
  0..10 on the pre-run screen. Threat 0 is exactly today's run.
- Each level **stacks one named modifier** on every level below it and adds a modest bonus to the
  run's Genome Cores + loot points.
- **Clearing** a level in a mode opens the next one *in that mode* (each mode keeps its own record).
- The active level shows as a **☣ THREAT N** chip in the battle header, on the deploy line, and on
  **Results** (level, reward ×, cleared / next rung, titles earned). The best cleared level per mode
  lives on the **Profile**.

Not on the ladder (by design): the **Daily** (one shared, fair worldwide board), the **Arena**
(wave-vs-wave PvP), **Quick Skirmish** (practice), the **tutorial**, and Campaign **frontier**
stages (a first clear is already the hardest version of that stage).

## §ladder — the rungs (data: `THREAT_LEVELS`)

| Lv | Name | Stacked modifier (existing `DoctrineWarp` lever) | Reward bonus | Milestone |
|---|---|---|---|---|
| 1 | Thickened Membranes | enemy HP ×1.10 (`hpMult`) | +0.05 | |
| 2 | Quickened Pulse | enemy speed ×1.06 (`speedMult`) | +0.05 | |
| 3 | Brood Surge | spawns ×1.12 (`countMult`) | +0.05 | title *Threat-Tempered* |
| 4 | Serrated Mandibles | Nucleus contact damage ×1.20 (`damageMult`) | +0.06 | |
| 5 | Apex Promotion | +5% elite promotion (`eliteChance`) | +0.06 | title *Swarmbreaker* · frame *Threat Crown* |
| 6 | Lean Harvest | bounty ×0.88 (`bountyMult`) | +0.06 | |
| 7 | Calcified Hides | enemy HP ×1.12 | +0.07 | title *Apex Hunter* |
| 8 | Endless Legion | spawns ×1.12 | +0.07 | |
| 9 | Frenzy | enemy speed ×1.08 | +0.07 | |
| 10 | The Apex Horde | +8% elites, HP ×1.10 | +0.08 | title *Unbroken Under Threat* · frame *Apex Threat Halo* |

Reward multiplier at level L = `1 + Σ rewardBonus(1..L)` ⇒ ×1.15 at 3, ×1.33 at 6, **×1.62 at 10**.
Cumulative world at 10: HP ×1.355, speed ×1.145, spawns ×1.254, contact damage ×1.2, +13% elites,
bounty ×0.88. `threatProblems()` enforces the shape: contiguous rungs, a real handicap on an
existing lever (mult axes in (1, 1.3], bounty in [0.7, 1), elite chance in (0, 0.2]), a reward
bonus in (0, 0.15], and ≥ 10 rungs. Adding a rung is one row.

## §unlock — benchmarks (data: `THREAT_BENCHMARK`)

| Mode | Clears a level when… | Threat-0 baseline (derived, never re-earned) |
|---|---|---|
| Campaign | you **win** a replay **within 5 stages of your frontier** on that difficulty (so Stage 1 at Threat 10 is not a free clear) | any cleared stage |
| Infinite | you **reach Depth 15** | `bestWave ≥ 15` |
| Boss Rush | you **reach wave 5** | `rushBestWave ≥ 5` |

Selectable ceiling = baseline met ? `min(10, bestCleared + 1)` : 0 (`threatMaxSelectable`). The
picker pref is a device pref (`state/prefs.ts threatPref`) clamped to the ceiling at launch
(`chosenThreat`), and `finishRun` clamps the settled level again against the PRE-run ceiling.

## §composition — directors, no inline factor math

- **World:** `RunOptions.threat` → `createDirector({ …, threat })`. The director composes
  `threatWarp(level)` LAST onto doctrine × vows × sector warp through the same `composeWarps` seam
  vows use; the sim applies the warp exactly as it does a doctrine's (queue hp/bounty/elite/count,
  spawn speed, the one damage fold). Threat 0 ⇒ `threatWarp` is `undefined` ⇒ referential
  passthrough ⇒ zero extra RNG ⇒ **goldens byte-identical**.
- **Economy:** `finishRun` asks `threatEconomy(level)` (difficulty director) and passes
  `threatRewardMult` into `coreShardIncome` / `lootPointIncome`, which carry it as the named
  **`threat.reward`** factor (visible in `explainIncome` traces). Exactly ×1 at Threat 0.

## §power — Threat grants no Power

Threat is a world handicap, a currency multiplier and cosmetic recognition. No rung touches
`RunModifiers`, no Power bucket reads the record, and the titles / profile frames / achievements
are recognition only (achievements pay their usual small Genome Core reward — a currency). The
Power rule (GAME_CONSTITUTION #1) holds by construction; `threatMeta.test.ts` pins that a cleared
Threat run leaves `meta.power()` unchanged.

## §automation — frontier Threat is played by hand

Hive Intelligence and Auto Gene run only on solved content (docs/HIVE-MIND.md §solved-content). A
Threat level **above the mode's best cleared level** counts as a frontier even on cleared content
(`automationGate` → *"Unlocks at Threat levels you've cleared"*); the picker says so in advance.

## §save — v55

`SaveData.threat: { campaign, endless, bossRush }` — the best CLEARED level per mode (0 = none
above the baseline). Pre-v55 saves (`version < 55`) fill zeros; `sanitizeThreat` clamps every mode
to whole numbers in [0, 10] and drops unknown keys; account merges take per-mode maxima
(`save/merge.ts`). v54 is reserved by a parallel track.

## Surfaces

| Surface | Where | Mount |
|---|---|---|
| ThreatPicker | Campaign deploy panel (cleared stages only), Infinite terminal, Boss Rush terminal | one line each |
| Deploy line | `App.begin` deploy sub (`· ☣ Threat N`) | — |
| Header chip | `Hud` wave-module chips (`hud.threat` from the snapshot) | `wm-threat` |
| ThreatResult | Results cliffhanger (plays the `levelup` cue on a new clear) | one line |
| ThreatRecord | Player Profile | one line |
| Help | `MECHANICS` row `threat` (Modes) | — |
| Achievements | `threat_3`, `threat_5`, `threat_10` | data rows |
| Frames / titles | `PROFILE_FRAMES` `threat5`/`threat10`; `THREAT_TITLES` via `titleName` | data rows |

## Known limitations / future hooks

- Bosses (every mode, and Boss Rush's whole siege column) spawn from their own chassis/strength
  ramps, so the per-spawn levers (HP, speed, elite promotion) reach the regular and escort queue,
  not the bosses — exactly the doctrine warp's reach. Boss Rush therefore feels Threat mostly through
  its escort and the contact-damage fold. A `bossHpMult` lever would be a new warp axis.
- No per-stage Threat records yet (the ladder is per MODE); a per-stage best would be a
  `Record<stage, level>` beside the mode record.
- Leaderboards do not tag Threat (Daily is excluded anyway).

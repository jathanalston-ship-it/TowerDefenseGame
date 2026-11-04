# Mode Identity — Campaign vs Infinite

How the two endgame modes earn their keep. Both are equally valuable; they serve **different
purposes**, and the reward economy is split so players *alternate* instead of farming one forever.
Authoritative over the code: `MODE_REWARDS` / `CAMPAIGN_REWARDS` in `config.ts` and `meta.finishRun`
implement §2; `core/campaign.ts` + `CampaignScreen` implement §3.

> Status: **active**. Before this, every reward (Genome Cores, loot points, mastery XP, the run
> cache, best-wave) scaled identically with `wave × kills`, so **Infinite was the best source of
> everything** and Campaign only unlocked stages. Now each mode owns a lane.

---

## 1. The intended loop

```
Campaign → Permanent Progression → Infinite → Personal Best → Soft Wall → Campaign → repeat
```

- **Campaign** pays out the **account currency** (Genome Cores) — most of it on **first clears** —
  which buys Permanent Upgrades + prestige. It is the venue for **boss fights, biome discovery,
  milestones, and stage progression**.
- **Infinite** pays out the **Loot Box Meter** (→ Tower/Hero Shards) and **Mastery XP**, and owns
  the **high-score / endurance** chase. You farm star-currency and mastery here, and find your wall.
- Because the two progression inputs (Genome Cores ↔ Tower/Hero Shards) come from **different
  modes**, fully powering up *requires both* — so you alternate. Hit the Infinite wall → go earn
  Genome Cores in Campaign → upgrade → push Infinite deeper → repeat.

---

## 2. Reward audit + redistribution

Every run-end reward source, and where it now lives. Multipliers are applied in `finishRun` on top
of the existing formulas; **Stage** (the legacy Play→Start Run quick-run, golden-pinned) stays ×1
across the board so the characterization tests don't move.

| Source | Old (all modes) | **Campaign** | **Infinite** | Stage |
|---|---|---|---|---|
| **Genome Cores** (account currency) | `(wave·8 + kills·0.4)·…` | **×1.0 on first clear**, ×0.3 replay, **+ first-clear & milestone bonuses** | ×0.2 (token — can't be farmed for currency) | ×1.0 |
| **Loot points** (Loot Box Meter → Tower/Hero Shards) | `(wave·14 + kills·1)·…` | ×0.35 (a trickle) | **×1.0 (the farm)** | ×1.0 |
| **Mastery XP** (tower + hero, from use) | use-based | ×1.0 | **×1.35 (endurance bonus)** | ×1.0 |
| **Run cache** (`chestForWave`) | per run | per run + **flawless first-clear Stage Cache** (no-damage clears only) | per run | per run |
| **High score** (`bestWave`) | `max(wave)` | (tracks stage via `campaign.cleared`) | **the leaderboard metric** | — |
| **Stage unlock** | — | **clearing unlocks the next** | — | — |
| Lifetime stats · achievements · mastery titles/lore | all modes | all modes | all modes | all modes |

### Campaign-exclusive grants (the "first-time completion rewards")
On a **brand-new** stage clear (`campaignStage > campaign.cleared[diff]`):
- **First-clear Genome Cores** = `CAMPAIGN_REWARDS.firstClearCore + firstClearCorePerStage × stage`
  (deeper stages pay more — the discovery reward).
- **Milestone bonus** every `milestoneEvery` (5) cleared stages: `+ milestoneCore` Genome Cores.
- **A Flawless Stage Cache** container (banked to the Vault) — awarded **only if the Nucleus took zero
  integrity damage** all run (`RunStats.integrityLost === 0`). Regen can't redeem a hit; any damage
  forfeits it, and replays never qualify. The Results screen shows an earned/missed verdict either way.
- **Biome discovery + boss encounter** are surfaced here too — the boss is the stage finale, and the
  world map (§3) reveals the biome as you arrive. Replays grant loot/mastery but only ×0.3 currency
  (the completion reward is claimed), so progress — not grinding old stages — is what pays.

### Why this alternates (worked example, ~stage/depth 30)
- Campaign stage 30 **first clear**: ~570 base + 175 first-clear + 150 milestone ≈ **~900 Genome
  Cores** + a Flawless Stage Cache *if cleared without taking damage*, little loot.
- Infinite depth 30: **~130 Genome Cores** (×0.2) but **full loot meter** (many containers →
  Tower/Hero Shards) + ×1.35 mastery.
- ⇒ Currency ⇒ Campaign; shards/mastery/score ⇒ Infinite. Neither alone maxes the account.

### §anti-grind — the Infinite depth-camping taper

Infinite is the loot/mastery farm (×1.0 loot, ×1.35 mastery), so a strong enough board could camp
arbitrarily deep and grind the Loot Box meter + Mastery XP forever — deep-camping *out-earning*
re-running. To close that, both Infinite reward streams **diminish past a depth** via one central
curve (`config.ENDLESS_TAPER = { startWave: 30, floor: 0.25, halfLife: 15 }`, full spec +
per-wave table in `docs/ENDLESS-SCALING.md §taper`):

- **Loot meter** — live banking (`meta.syncRunLoot`, endless flag from `GameView`) and run-end
  (`lootPointIncome`) scale by the average per-wave taper `endlessLootTaper(wave)`; the meter stays
  monotonic while deep waves visibly bank *less per wave*.
- **Mastery XP** — the endless XP multiplier is folded by `endlessTaper(result.wave)` at run end, so
  a deep run keeps only a fraction of its Mastery multiplier.

Identity (×1) at/below wave 30 ⇒ shallow Infinite and **every other mode are byte-unchanged**. Boss
Rush reward lanes and `INFINITE_REWARD_QUALIFY_FRAC` are untouched. Net: past the wall a run still
pays, but re-running from the top out-earns camping ever deeper.

---

## 3. Campaign World Map — a living, infected planet

Campaign is **not** a numbered list. It is a **descent map**: a winding path of stage nodes
plunging *deeper into an infected planet*, revealed as you clear it.

### Principles
- **Procedural + windowed.** Stages are generated (`generateStage(n)`), so the map is too. The
  layout is a **pure deterministic function of stage number** (a serpentine: `y` grows with depth,
  `x` meanders by `sin`). The view renders only a **window** around your frontier
  (`[cleared−N … cleared+M]`), so it supports **thousands** of stages with no redesign and no
  per-stage authoring — new content slots into the unexplored depths automatically.
- **Biomes are regions.** Consecutive stages of one biome form a colored **band** the path crosses;
  the band carries the biome name/accent. New biomes appended to `BIOMES` extend the world with zero
  map changes.
- **It grows.** Cleared nodes light up behind you; the frontier (next stage) pulses; locked depths
  fade into the dark ahead — you’re always *pushing the frontier down*, never picking "Level 27".

### Always visible
- **Current location** — the frontier biome + stage, centered.
- **Highest cleared** — the deepest lit node (per difficulty track).
- **Upcoming biome** + **upcoming boss** — read off the next node(s).
- Per node (focused): **stage rewards** (first-clear Genome Cores + flawless-clear Stage Cache), **difficulty**,
  **Recommended Power** (`recommendedPower(stage)`, compared to the account’s Power Score), the
  biome **hazard**, boss + mini-boss, wave count, HP/damage scaling.

### Recommended Power
`recommendedPower(stage)` is a smooth monotonic read-out derived from the stage’s combined
HP×damage scaling, normalized to the account **Power Score** scale, so "am I strong enough?" is a
glance: your Power Score ≥ the node’s recommendation ⇒ comfortable; well below ⇒ a wall (go earn).

### Future-proofing
Pure windowed layout + registry-driven biomes + formula-driven scaling/recommendation ⇒ stages,
biomes, and bosses are all data. Hundreds or thousands of procedural stages need **no** map
redesign; authored set-pieces can later override specific stage numbers without touching the layout.


---

## §campaign-roadmap (2026-07) — the screen became the long-term ROADMAP

- **Roadmap rail**: gate chips (next Gene Tier / Evolution Cap / Hero Slot stages — clicking
  JUMPS the map there) + the top Next-Goal chips with live progress bars (shared engine).
- **Mission card** (focused stage): biome + modifiers, THREAT rating (◆ scale from the stage
  scaling) + reward multiplier, enemy forecast chips (stage enemyPool + elite %), boss +
  mini-boss, waves/HP/damage, "Clearing unlocks" chips (stageUnlocks: gene tiers, evolution
  caps, hero slots), first-clear reward, recommended vs your Power, and the FASTEST CLEAR
  record (campaign.bestTime, schema v21 — folded on wins from result.durationSec).
- **QoL**: ⌖ Frontier jump + Stage № search (Enter jumps the window); the gate chips double
  as reward-anchored filters over the infinite ladder. Future seams: endless campaign =
  the ladder already never ends; seasonal campaign = a parallel `cleared` track keyed by a
  season id (the per-difficulty map generalizes).
- "Highest score" was deliberately NOT invented: campaign stages are win/clear moments —
  completion + fastest time ARE the records.


## §doctrines (2026-07) — protocols that reshape the WORLD

> **Superseded by docs/DOCTRINES.md** (2026-07 overhaul): three families (build/protocol/PACT),
> 19 pickable doctrines, campaign unlock gates, mastery ranks over the doctrineWins/BestWave
> ledgers, drought/elite hazard axes, and the shared `DoctrinePicker`. This section stays as
> the original protocol design record.

Two doctrine families now coexist (12 total + none):
- **Build-shaping** (the original five): Glass/Swarm/Ascetic/Cascade/Resonance — they bend the
  PLAYER's math via CardEffect, unchanged.
- **PROTOCOLS** (new; `DoctrineWarp`): they reshape the ENEMY WORLD — Adaptive Evolution
  (scaling ×1.5 accel, +15% HP/dmg, rewards ×1.35), Swarm Protocol (spawns ×1.8, HP ×0.55),
  Titan Protocol (spawns ×0.45, HP ×2.6, dmg ×1.3, bounty ×2.2), Biological Frenzy (speed
  ×1.35, biomass ×1.4), Experimental Mutation (25% elites, rewards ×1.3), Corrupted Genome
  (HP ×1.6, dmg ×1.5, spawns ×1.15, speed ×1.1, +3 Essence/wave, rewards ×1.5).

Integration: warps ride the SAME deterministic queue transforms as run events (hp/bounty
buffs, elite promotion on runEventRng, scaleSpawnCount), fold damage into the run difficulty
once at construction, accelerate the four ENDLESS curves via a (depth−1) rate multiplier,
and pay run-end rewards in meta.finishRun (rewardMult × shards/loot; essencePerWave →
geneEssence). 'none' has NO warp — zero RNG draws, golden run byte-identical (test-pinned:
swarm floods / titan thins / warped runs deterministic).

The Infinite screen is the EXPERIMENT TERMINAL: doctrine cards with full readouts, a
composite HAZARD rating (difficulty × protocol), and the forecast panel (HP ramp, boss
cadence every DIRECTOR.bossEvery, biome rotation, speed cap, loot rate). Weekly challenges /
season modifiers / mutators / leaderboards are parameterizations of this same terminal.

---

## §boss-rush (2026-07) — the THIRD pillar

The two-mode loop above grew a third lane: **Boss Rush** (docs/BOSS-RUSH.md). Wave N deploys N
procedurally assembled bosses (staggered column + thinned escort); a Gene Card drafts every 2nd
wave; the run never wins. Its reward identity keeps the triangle honest:

- **Per-boss bounty, not per-wave survival:** `RUSH.corePerBoss` Genome Cores + `RUSH.lootPerBoss`
  loot points per boss DEFEATED (~N² with depth). The wave/kill lanes run under token mults
  (`MODE_REWARDS.*.bossRush`: core ×0.25, loot ×0.5, mastery ×1.2) so it can't out-farm
  Campaign's currency lane or Infinite's meter lane.
- **Own records:** `rushBestWave` / `rushBestBoss` — never folded into `bestWave`, so Infinite's
  qualify gate + prediction floor stay clean. Boss Rush runs its own qualify gate (≥50% of
  `rushBestWave`, reason `rush-short`) and its own prediction channel.
- **Gates (`MODE_UNLOCKS`, 2026-07):** the pillars open in order — **Infinite unlocks after
  Campaign Stage 3**, **Boss Rush after Campaign Stage 12** (≈ 1h of play) — 10 → 9 in the 2026-07 stage-gate
  review, then 9 → 12 in the 2026-11 reveal re-pace (docs/PROGRESSION-GATING.md §timeline: one wing per
  beat; the stage-10 wall keeps two farm outlets, Infinite and Daily) (`save/derive.ts`
  `isInfiniteUnlocked`/`isBossRushUnlocked`; enforced at the meta/UI layer only, the sim stays
  ungated for tests/tutorial/debug). Locked modes stay VISIBLE (sealed nav item, unlock briefing
  screen, sealed Command Center tiles/dashboard card all routing to the Campaign). Pre-gate Boss
  Rush accounts grandfather in via their rush ledgers — and so does any account whose Boss Rush wing
  already revealed (latched) under the older stage-9 gate; Infinite has no bestWave grandfather —
  that record also moves on campaign runs, so the stage gate is authoritative.
- **The triangle:** Campaign pays Cores → power → push Infinite for Shards/Mastery → your built
  board gets stress-tested in Boss Rush for burst payouts (and, next: the primary Ichor faucet) →
  its wall sends you back to Campaign. Each mode feeds a hunger the other two can't.

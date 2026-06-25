# STAGES.md — Procedural Infinite Stage System (canonical spec)

How a run's **world** is generated, scaled, and kept fresh forever. Companion to
`DESIGN.md §6` (The Run), `PROGRESSION.md` (the power/economy math this difficulty
curve must match), `TOWERS.md`/`HEROES.md` (what fights inside it). Enemy *content*
(factions, kits, visuals) is canonical in `ENEMIES.md` (forthcoming); **this doc owns
the *container*** — generation, difficulty, rewards, pacing, and anti-stagnation —
and treats enemies/bosses as data slotted into that container.

> **Status:** v0 spec. Every constant is an **illustrative starting point** for the
> central balance config (`PROGRESSION §9` simulation harness validates them). The
> *structure* — seeded generation, the Threat Level scalar, sector banding, the
> reward-efficiency frontier, the anti-stagnation budget — is the durable part.
>
> **Anti-inflation oath (inherited from `PROGRESSION §0`):** infinity lives in
> **depth**, not in the size of a player number. Enemy HP may grow without bound, but
> it is **never a player-facing power figure** — the player reasons in **Threat Level
> / Depth** (a clean leaderboard integer). The damage number stays in ~3–4 orders of
> magnitude; the *frontier* is what's infinite.

---

## Table of Contents

1. [Design goals & pillar alignment](#1-design-goals--pillar-alignment)
2. [Vocabulary](#2-vocabulary)
3. [Stage anatomy — the node graph](#3-stage-anatomy)
4. [Biomes](#4-biomes)
5. [The generation pipeline (seeded)](#5-the-generation-pipeline)
6. [Wave composition & the designed→endless transition](#6-wave-composition)
7. [Difficulty scaling — Threat Level](#7-difficulty-scaling)
8. [Stage modifiers](#8-stage-modifiers)
9. [Elite modifiers](#9-elite-modifiers)
10. [Boss generation](#10-boss-generation)
11. [Reward scaling](#11-reward-scaling)
12. [Progression pacing](#12-progression-pacing)
13. [Anti-stagnation systems](#13-anti-stagnation-systems)
14. [Infinite progression, kept legible](#14-infinite-progression-kept-legible)
15. [Centralized tunables](#15-centralized-tunables)
16. [Open tuning questions](#16-open-tuning-questions)

---

## 1. Design goals & pillar alignment

The stage system is the **generator** the whole economy depends on (`DESIGN §6`). It
must:

| Requirement | How this doc delivers it |
|---|---|
| **Infinite scaling** | A single master scalar — **Threat Level (TL)** — drives all enemy stats on bounded-per-step but unbounded-in-total curves (§7). |
| **Endless mode** | Every stage transitions from an authored band to procedural **endless sectors** that never stop (§6). |
| **Procedural stages** | Deterministic, **seeded** assembly of biome → topology → node graph → wave script → modifiers (§5). |
| **Biomes** | Visual + **ruleset** environments that rotate to force build variety (§4). |
| **Stage modifiers** | Global run-rules rolled per stage/sector; the procedural "shake-up" (§8). |
| **Elite modifiers** | Affix system that re-authors elites every encounter (§9). |
| **Boss generation** | Authored bosses at shallow gates; **procedurally assembled** bosses forever after (§10). |

Pillar alignment (`DESIGN §1`): biome rotation + modifier rolls serve **Legible
Depth** and **anti-homogenization**; the TL frontier serves **Active Beats Idle**
(skill decides how deep you hold); the authored→endless seam serves **Mechanics-First**
(named beats early, infinite hum later). Nothing here introduces a new player-facing
number — it only deepens the *space* the existing buckets play in.

---

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **Stage** | One full run's world: an ordered sequence of **Sectors** under one **Biome**, ending in endless. |
| **Sector** | A band of ~10 waves sharing a sub-theme, a **stage-modifier roll**, and capped by a **Boss/Gate** node. The unit of "shake-up." |
| **Wave** | One spawn cycle of enemies against the Nucleus (`DESIGN §6.1`). The unit of reward cadence. |
| **Node** | A choosable point on the run's **overworld graph** (Combat/Elite/Cache/Gene Lab/Mutation Altar/Boss). Route choice = the strategic layer. |
| **Depth** | Total waves cleared this run. The **primary leaderboard axis**. |
| **Threat Level (TL)** | The master difficulty scalar (a clean integer ≈ depth + corruption + Ω). Drives all enemy stats. **The number the player reads**, not enemy HP. |
| **Seed** | The integer that deterministically reproduces a whole stage (run seed → all sub-seeds). |
| **Frontier** | The depth at which the player's time-to-kill exceeds their survivability — where the run *ends*. Pushing the frontier is the core endless skill expression. |

---

## 3. Stage anatomy

A stage is **two layers**: a **node graph** (the roguelite overworld you route
through, `DESIGN §6.2`) and, inside each Combat-type node, the **tactical map** (paths
+ buildable cells where the TD actually happens).

### 3.1 The node graph (strategic layer)

Each Sector is a small directed graph of **3–5 columns**; the player picks one node
per column, so a Sector is a **route choice**, not a fixed line.

| Node | Content | Why route to it |
|---|---|---|
| **Combat** | A standard wave-set on a tactical map. | Bread-and-butter biomass + mastery. |
| **Elite** | Fewer enemies, ≥1 elite with **rolled affixes** (§9). | Targeted gear/shard drops; risk. |
| **Cache** | No combat; pick a reward (gear / biomass / catalyst / shard). | Economy / itemization. |
| **Gene Lab** | An **extra card draft** (`DESIGN §6.3`) + a reroll. | Steer the run's build. |
| **Mutation Altar** | Apply a **Corruption** (`DESIGN §6.4`) for multiplied rewards + rarer cards. | Voluntary risk/reward; the dopamine valve. |
| **Boss / Gate** | The Sector's capstone fight; required to advance. | Sector reward package + depth milestone. |

Generation constraints (so routes are *choices*, not noise):
- Every column offers **≥2 distinct node types**.
- A Sector guarantees **≥1 economy-flavored** node (Cache/Gene Lab) and **≥1
  risk-flavored** node (Elite/Mutation Altar) reachable on *some* path — but never all
  on *one* path, so "greedy vs safe" is a real fork.
- The Boss node is the single sink all paths converge on.

### 3.2 The tactical map (combat layer)

Generated per Combat/Elite/Boss node:
- **Path topology** (`DESIGN §6.2`): `single` → `branching` → `looping` →
  `multi-lane`. Multi-lane is **gated** (unlocks at the Hivemind prestige, `DESIGN §12`)
  — until then the generator's topology pool excludes it. This keeps onboarding maps
  legible and makes multi-lane a *transformative* later unlock.
- **Buildable cells**: free-place model (`DESIGN §16.3` assumption) — cells flanking
  paths, with biome-specific exceptions (Drowned Dome floods some; Arcology mazes
  restrict to chokepoints).
- **Path metrics** exposed to the sim: length, chokepoints, branch count, build-cell
  count → these feed difficulty (a short path = less DPS-uptime = harder).

---

## 4. Biomes

A **Biome** is a visual skin **and a ruleset** that bends the optimal build, so the
meta *rotates by environment* (`DESIGN §6.2`, anti-homogenization risk #4). Each stage
rolls one biome (deeper stages may **layer a second** at high TL — see §13).

### 4.1 Launch biome set

| Biome | Visual | Ruleset (the part that matters) | Build pressure |
|---|---|---|---|
| **Arcology Sublevel** | Corpo maze, tight neon corridors | Long mazy paths, many chokepoints; build cells only at junctions | Rewards AoE/zoning (Bone Mortar, DoT); punishes pure single-target |
| **Drowned Dome** | Flooded bio-dome | Cells periodically **flood** (disable the tower on them for a few s) | Rewards spread/mobile value (heroes, Parasite spread); punishes fragile adjacency stacks (Flesh Reactor) |
| **Neural Jungle** | Overgrown server-jungle | Enemies spawn with **shields** (absorb before HP) | Rewards shield-strip (Caustic Dissolve, Neural) & sustained DPS; punishes burst-only |
| **Fungal Megastructure** | Bioluminescent fungal sprawl | **Biomass-rich** (+economy) but enemies **+speed** | Rewards fast-firing / slows (Neural); punishes slow artillery uptime |
| **Corpo Arcology Roof** *(stretch)* | Open rooftop, wind | Long sightlines, **projectile drift**; fliers common | Rewards homing/aura & anti-air; punishes slow arcs (Bone Mortar) |

> Biomes are **faction-agnostic containers**: any faction (`ENEMIES.md` — Parasites,
> Machine Cult, Corporate Security, Hive Organisms, Neural Aberrations) can populate
> any biome. The generator pairs a biome with a *faction theme* per stage (§5), so
> "Machine Cult in the Drowned Dome" and "Parasites in the Neural Jungle" feel
> distinct — biome × faction is a first multiplier of stage variety.

### 4.2 Biome ruleset framework

Every biome is data: a set of **environment modifiers** drawn from a shared
vocabulary, so new biomes are *authored as data*, not code:

```
Biome = {
  pathProfile,            # length/chokepoint/branch weighting
  buildCellRule,          # flood / restrict / open / hazard-tiles
  spawnModifiers[],       # +shield | +speed | +armor | flier-weight | swarm-weight
  economyModifier,        # biomass income ±, cache rarity ±
  hazardModifiers[],      # tile damage, fog (vision), drift (projectiles)
  factionWeights,         # which factions are common here
  vfxTheme, sfxTheme, palette
}
```

This is the same data-driven stance as towers/cards: **balance lives in config**, the
generator just composes it.

---

## 5. The generation pipeline

**Fully deterministic from a single run seed** — required for replays, the simulation
harness (`PROGRESSION §9`), daily/seasonal seeds, and save integrity (a run can be
reconstructed from `seed + TL + player inputs`, so we never serialize live entities).

```
runSeed
  └─ split into independent sub-seeds (one per stage element — never reuse a stream):
       biomeSeed · topologySeed · nodeGraphSeed · waveSeed · modifierSeed ·
       eliteAffixSeed · bossSeed · lootSeed
```

Pipeline (each step pure: `(seed, context) → data`):

1. **Pick Biome** (`biomeSeed`, weighted by player progress + anti-repeat history §13).
2. **Pick Faction theme(s)** (`biomeSeed`): 1 primary faction + a minor "intrusion"
   faction for variety.
3. **Roll Stage Modifier(s)** (`modifierSeed`, §8) — the run-long rule(s).
4. **For each Sector** (until endless, then forever):
   a. **Generate node graph** (`nodeGraphSeed`, §3.1) under the column constraints.
   b. **Roll a Sector modifier** (`modifierSeed`) — the per-sector shake-up.
   c. **Generate tactical maps** (`topologySeed`) per combat node, honoring biome
      `pathProfile`/`buildCellRule`.
   d. **Author the wave script** (`waveSeed`, §6) from the faction roster at this TL.
   e. **Roll elite affixes** (`eliteAffixSeed`, §9) for Elite/Boss nodes.
   f. **Assemble the Boss** (`bossSeed`, §10) for the gate.
5. **Loot tables** for every node resolve from `lootSeed` × TL (§11, `EQUIPMENT §8`).

**Determinism rule:** the same seed + the same content version = the same stage,
byte-for-byte. Content version is part of the save (`ARCHITECTURE` save section) so a
balance patch can't silently change a leaderboard run.

---

## 6. Wave composition

### 6.1 The threat-budget model

A wave is **not** a hand-placed list of enemies; it's a **budget** spent from the
faction roster. Each enemy archetype has a **threat cost**; the generator spends a
per-wave budget on a composition that respects pacing rules.

```
WaveBudget(W) = baseBudget × ThreatLevelMult(W) × biomeDensityMod × corruptionMod
spend the budget on roster picks subject to:
  - composition rules (a "shape": swarm / mixed / armored-column / elite-led / boss)
  - the biome's spawnModifiers/factionWeights
  - an anti-monotony rule: consecutive waves must differ in shape (§13)
```

Composition **shapes** rotate so the player retunes targeting/build constantly:

| Shape | Feels like | Counters it |
|---|---|---|
| **Swarm** | many weak, dense | AoE / DoT / spread |
| **Armored column** | few tanky, armored | armor-strip / single-target / Shred |
| **Mixed** | balanced | a rounded build |
| **Elite-led** | a few elites + chaff | burst / control / hijack |
| **Rush** | fast, low-HP | slows / chokepoint zoning |
| **Boss** | one capstone (§10) | the whole build |

### 6.2 The designed → endless seam

| Band | Waves | Authoring | Purpose |
|---|---|---|---|
| **Designed band** | ~1–40 (≈3–5 sectors) | Hand-tuned templates per sector; named bosses at gates | Onboarding, the "standard run" the economy is balanced against (`PROGRESSION §1.5`), progressive disclosure |
| **Endless band** | 41+ (infinite) | **Fully procedural** sectors; TL keeps climbing; bosses procedurally assembled | The forever-frontier and the leaderboard axis |

The seam is invisible in feel: the last designed sector hands off to the first
procedural sector at the same TL, so difficulty is continuous. Designed templates are
just **pinned seeds** the generator would otherwise have produced — i.e., the
procedural system can generate the whole game; we *author the first 40 waves by
choosing good seeds + overrides* for a guaranteed-great onboarding.

---

## 7. Difficulty scaling

### 7.1 Threat Level (the master scalar)

All enemy stats derive from one integer:

```
TL = depthWaves
   + corruptionTier × CORRUPTION_TL_STEP      # voluntary risk (DESIGN §6.4)
   + Ω_tier × OMEGA_TL_STEP                    # prestige depth (PROGRESSION §5.2)
   + dailySeasonOffset                          # seasonal/leaderboard cut-ins
```

TL is the **only** difficulty knob; everything below is a function of TL. This keeps
the system legible (one dial) and the leaderboard honest (one comparable number).

### 7.2 Enemy stat curves

Three curves, **deliberately split** so difficulty is *HP-led*, not *unfair-speed-led*
(fast/erratic difficulty feels cheap; tanky difficulty rewards build power):

```
HP(TL)      = baseHP    × hpGrowth^TL          # geometric — the unbounded frontier
Density(TL) = baseCount × (1 + dLog·ln(1+TL))  # logarithmic — soft, capped feel
Speed(TL)   = baseSpeed × (1 + sLog·ln(1+TL))  # logarithmic, hard-capped at +~60%
Armor/Shield(TL) = stepwise unlocks at TL gates (biome/faction-flavored)
```

- **HP is the frontier.** `hpGrowth ≈ 1.04` per wave in the designed band, ramping to
  `≈1.06–1.08` deep in endless (a gentle acceleration so the frontier always
  eventually arrives no matter how strong the account). Because HP is matched to the
  player's multiplicative buckets (`PROGRESSION §5.3`), **time-to-kill stays roughly
  flat in the comfort band and rises sharply past the frontier** — which is exactly
  where the run ends.
- **Density/Speed use logs** so swarms get *busier* but never instantly overwhelming —
  the player's reflexes scale slower than their damage, so we don't let the twitch
  axis run away.
- **Armor/Shield arrive as gated unlocks** (e.g., "shields appear at TL 25 in Neural
  Jungle") so they're a *build-counter event*, not a smooth fog.

### 7.3 Why this can't inflate the player

Enemy HP is **not** a player number. The player sees **TL / Depth** (e.g., "Depth 312,
Threat Level 340"); enemy HP is rendered in the same tiered scientific-notation UI as
damage and is informational, not a score. The score is **how deep you held**. This is
the core trick that lets enemy stats be mathematically infinite while the player's
mental model stays a small, comparable integer (`DESIGN §15` risk #1).

### 7.4 The efficiency frontier (the self-balancing loop)

Define **clear-rate** = waves cleared per real minute. As TL rises, TTK rises, so
clear-rate falls. Rewards scale with TL (§11) but **reward-per-minute peaks at a
depth just below your frontier** and falls past it. Result:

> The optimal place to farm is **right at the edge of what you can comfortably hold** —
> which is exactly where the game is most engaging. Get stronger → frontier moves out →
> you farm deeper. No "park at trivial depth and idle for linear reward" exploit,
> because deeper waves cost more time per reward once you're past your comfort band.

This is the anti-stagnation engine at the math level (more in §13).

---

## 8. Stage modifiers

**Stage modifiers** are global run-rules rolled at generation — the procedural
"shake-up" that makes two same-biome runs play differently. Three sources, clearly
separated so the player always knows *why* a rule is in effect:

| Source | Chosen by | Reward effect | Examples |
|---|---|---|---|
| **Biome-intrinsic** | the biome (§4) | none (it's the theme) | flooding cells, shields, projectile drift |
| **Procedural (rolled)** | the generator | small built-in bonus | "Frenzy Fog: enemies +15% speed, +10% biomass"; "Brittle Lattice: towers +10% dmg, Nucleus −10% integrity" |
| **Corruption (voluntary)** | the player at Altars | **large** multiplied rewards (`DESIGN §6.4`) | "Armored Horde", "Elites split on death", "Fog hides paths" |

Procedural modifiers are drawn from a pool with **paired upside/downside** (à la
`EQUIPMENT` relics) so they're *interesting*, not just harder — and each interacts with
builds (an "Armored Horde" roll is a *boon* for a penetration build, a wall for a swarm
build), which feeds variety. **Sector modifiers** (§5.4b) are a lighter, shorter-lived
version rolled every Sector so the shake-up cadence is ~every 10 waves, never stale.

Modifier rules:
- The designed band rolls only **gentle** procedural modifiers (progressive
  disclosure); spicy ones unlock by progress.
- Corruptions stack (the seed of the Apex "Corruption Tiers" axis, `DESIGN §12`); each
  added tier bumps **TL** (§7.1) *and* the reward multiplier (§11).
- Every modifier is **telegraphed** on the pre-stage screen with its exact rule and
  reward delta (legibility, `DESIGN §14`).

---

## 9. Elite modifiers

Elites are **normal enemies wearing rolled affixes** — a Diablo-style modifier system
so every elite is a fresh tactical puzzle and a targeted-loot piñata.

- **Affix count by TL/node:** 1 affix early → up to 4 deep; Elite nodes guarantee a
  higher floor than random combat elites.
- **Affix pool** (paired offensive/defensive/utility, like gear affixes):

| Kind | Examples |
|---|---|
| **Offensive** | *Volatile* (death explosion), *Hexed* (curses the nearest tower), *Marksman* (ranged poke at heroes) |
| **Defensive** | *Bulwark* (shielded), *Regenerator* (heals if not pressured), *Reflective* (returns a % to towers), *Warded* (immune to one status type — forces build flex) |
| **Utility** | *Teleporter* (skips ahead on the path), *Summoner* (spawns chaff), *Hastening* (speeds nearby enemies), *Anchor* (slow but immune to slows) |
| **Reaction-flavored** | *Inoculated* (resists Infection), *Insulated* (resists Disruption) — directly pressure the synergy matrix so no single reaction is always-on |

- **Constraints:** no contradictory pairs; **at most one "immunity" affix** (so a build
  is never hard-locked); affixes that punish a *specific* build are balanced by drops
  that reward *switching* to counter them.
- **Rewards:** elite affixes raise the elite's **threat cost** (so the wave budget gives
  fewer of them) and its **loot floor** (guaranteed rarity bump, affix-themed drops —
  e.g., a *Warded* elite is more likely to drop status-cap gear). Killing affixed
  elites also feeds **Codex** entries faster (`DESIGN §10`).
- **Faction flavor:** factions bias the affix pool (Machine Cult → shields/regen;
  Neural Aberrations → status-immunity; canonical mapping in `ENEMIES.md`).

---

## 10. Boss generation

Bosses cap every Sector (~every 10 waves) and gate advancement. **Authored bosses
anchor the shallow gates; procedurally assembled bosses fill infinite depth.**

### 10.1 Authored bosses (designed band)

Named, hand-built encounters at the first ~3–5 gates (e.g., the **Stage-5 Apex** that
gates Hero Slot 2, `HEROES.md §slot-2`). These teach boss vocabulary, drop guaranteed
first-kill rewards (hero unlocks, signature gear), and set the tone. Each is a *pinned
seed + overrides* on the procedural system (§6.2) so they live in the same code path.

### 10.2 Procedural boss assembly (endless band)

A boss = **Chassis + Mechanic Modules + Modifiers + Faction skin + Reward package**,
all rolled from `bossSeed` × TL:

```
Boss = {
  chassis,          # body plan: Bruiser | Artillery | Swarmlord | Controller | Juggernaut
  mechanicModules[2..4],   # telegraphed behaviors (see below), count rises with TL
  modifiers[],      # the same elite affix pool (§9), scaled up
  phases,           # 1 phase early → up to 3 at high TL (HP-gated transitions)
  factionSkin,      # visual + which module variants (ENEMIES.md)
  rewardPackage,    # scaled by TL & corruption (§11)
}
```

**Mechanic modules** are the heart — discrete, **telegraphed**, counterable behaviors
drawn from a shared pool so bosses are *readable*, never random damage:

| Module | Behavior | Counter (build pressure) |
|---|---|---|
| **Spawner** | periodically births adds | AoE / chaff clear |
| **Shieldphase** | becomes invulnerable until adds/objective cleared | burst windows / add priority |
| **Charger** | telegraphed dash down a lane | hero peel / knockback / slows |
| **Suppressor** | disables towers in an area (must reposition value) | mobile value / spread placement |
| **Enrager** | speeds/empowers on a timer (soft DPS check) | front-loaded damage / execute |
| **Splitter** | divides into smaller bosses on phase | sustained AoE |
| **Channeler** | a "raid" cast that hits the Nucleus if not interrupted | control / hijack / focus burst |

**Scaling:** module **count and phase count** rise with TL (a Depth-300 boss is a
3-phase, 4-module monster); stats follow the §7 curves. **Generation constraints**
keep bosses fair: no two "uninterruptible" modules together; always ≥1 telegraphed
window; phase transitions reset add-pressure so it can't snowball into an unwinnable
state. Bosses are a **DPS-and-mechanics check** that validates the *whole* build, which
is why they gate Sectors.

### 10.3 The Devourer hook

Codex-completed boss types can later be *summoned as allies* (`EQUIPMENT` relic #29,
`DESIGN §10` Bestiary-as-Arsenal) — so procedural bosses you kill enough of become
*your* procedural units at Apex. Collection ↔ combat closes the loop.

---

## 11. Reward scaling

Rewards must scale with TL **without** breaking the economy's "thousands of hours,
never stagnant" goal (`PROGRESSION §1.5`, the forthcoming `ECONOMY.md`). The rule:
**rewards rise with depth, but reward *efficiency* peaks at your frontier** (§7.4).

### 11.1 Per-wave & per-node yield

```
WaveReward(TL)  = baseReward × (1 + rLog·ln(1+TL)) × modifierMult × corruptionMult
NodeReward(node)= nodeBase × biomeEconomyMod × lootDepthWeight(TL)
```

- **Biomass** (in-run, `DESIGN §6.1`) scales so mid-run economy keeps pace with rising
  enemy HP — a deep wave funds deep towers.
- **Permanent currencies** (shards, mastery XP, essence, gear, codex ticks — the run's
  *output*, `PROGRESSION §1.1`) scale with **depth reached**, biased toward *used*
  towers/heroes, and gated by **loot depth weight** (rarer gear deeper).
- **Corruption multiplier** is the big lever: voluntary corruption tiers multiply
  *permanent* yield (the risk/reward engine and the Apex currency faucet,
  `PROGRESSION §5.2`).

### 11.2 The diminishing-efficiency curve (anti-farm-parking)

Reward **per wave** uses a **log** of TL (slow growth), while **time per wave** rises
with HP (geometric past the comfort band). So:

```
RewardPerMinute(TL) ∝ ln(1+TL) / TTK(TL)
```

peaks near the frontier and **falls** past it. Combined with §7.4, the only way to earn
*more per minute* is to **get permanently stronger and push the frontier out** — never
to idle at a trivial depth. This is the economic guarantee against stagnation.

### 11.3 Extraction vs. death

`DESIGN §6.1`: a run ends by Nucleus death **or voluntary extraction**. Extraction
banks a **depth-scaled bonus** (a clean "cash out now" decision); dying still banks
everything earned but forfeits the extraction bonus. This makes "push one more sector
or extract?" a recurring, juicy risk decision every run.

---

## 12. Progression pacing

How stages pace the 1000-hour curve (`DESIGN §13`, `PROGRESSION §7`):

| Phase | Hrs | Stage experience | New stage systems disclosed |
|---|---|---|---|
| **0 Onboarding** | 0–2 | Designed band only; 1 biome; single-path; gentle modifiers | The node graph, then Caches, then the first Boss |
| **1 Foundation** | 2–15 | All launch biomes rotate; Gene Lab/Altar nodes; first endless tastes | Corruptions (Altars); branching topology; the Stage-5 Apex boss |
| **2 Specialization** | 15–80 | Endless routinely; procedural bosses; deeper modifier pool | Layered modifiers; harder elite affixes |
| **3 Expansion** | 80–250 | **Multi-lane** unlocks (Hivemind); idle Hive Network feeds from held nodes | Multi-lane topology; node-holding meta |
| **4 Mastery** | 250–600 | **Corruption Tiers** become the core push axis (Apex) | Deep corruption stacking; bestiary boss-allies |
| **5 Transcendence** | 600–1000 | Meta-Laws reshape generation globally (Singularity) | Player-authored stage rules |
| **6 Endless** | 1000+ | **Omega procedural seasons** + leaderboards; new modifiers/biomes per Ω cycle | Seasonal generation, ranked depth |

**Progressive disclosure of the generator** mirrors the rest of the game: the first
20 minutes are a single path, one biome, no modifiers — *pure TD* (`DESIGN §13.1`,
risk #8). Each subsequent system (route choice → corruptions → multi-lane → seasons)
unlocks one at a time.

---

## 13. Anti-stagnation systems

The promise is "thousands of hours, never stale." Stagnation is fought at **four
timescales**, each with a concrete mechanism:

**1. Within a run (every ~10 waves): the Sector shake-up.**
- A fresh **Sector modifier** (§8) and a re-rolled **node graph** every Sector.
- **Wave-shape rotation** (§6.1): the generator forbids repeating a composition shape
  twice running, so targeting/positioning decisions stay live.
- **Build-counter pressure**: elite affixes and biome rules that punish one-dimensional
  builds (a *Warded* wave resists your only status; a swarm wave drowns a single-target
  build) — directly the mitigation for homogenization risk #4 (`DESIGN §15`).

**2. Across runs (every session): procedural variety budget.**
- **Biome × faction × topology × modifier** roll independently → combinatorial freshness
  before any content is added.
- **Anti-repeat history**: the generator tracks your recent biomes/modifiers and
  **down-weights** repeats (a sliding window), so you don't get the same stage twice in
  a row by luck.
- **Corruption as a build lever**: choosing *which* corruptions to take (some builds
  *want* "Armored Horde") makes the player author difficulty for variety, not just
  challenge.

**3. Across the meta (weeks): escalation + new toys.**
- **Layered biomes** at high TL (two rulesets at once — "flooded Neural Jungle") for
  novel combined pressure.
- **Prestige unlocks change generation**: multi-lane (Hivemind), corruption tiers
  (Apex), Meta-Laws that *rewrite* generation (Singularity) — each makes the *same*
  generator produce a *different game*.
- **Milestone depth gates**: authored "first clear of Depth 50/100/250…" rewards punctuate
  the infinite hum with discrete dopamine beats and roadmap goals (retention, `DESIGN §5`).

**4. Forever (the honest infinite): externally-refreshed goals.**
- **Daily/weekly seeds**: a shared fixed seed + modifier set → a global "everyone plays
  the same stage today" leaderboard (skill comparison without new content).
- **Omega procedural seasons** (`DESIGN §12` Layer 6): each Ω cycle *generates* new
  modifiers, biome variants, and a challenge ladder with leaderboards — the only
  content engine that outlasts authored content. This is where "infinite" is *honest*:
  the generator itself becomes the content pipeline.

> **The throughline:** freshness is **renewable, not authored-finite**. Authored content
> seeds quality; the generator + seasons supply quantity forever. Every anti-stagnation
> mechanism above is a *generation constraint or a re-roll cadence*, not a pile of
> hand-made levels we'd eventually exhaust.

---

## 14. Infinite progression, kept legible

Tying back to the anti-inflation oath (`PROGRESSION §0`, `DESIGN §15` risk #1):

1. **The infinite axis is Depth/TL — a clean integer**, not a damage figure. "Depth
   312" is as legible at hour 1000 as at hour 10.
2. **Enemy HP scales geometrically but is never a score.** It's matched to the player's
   bounded (~3–4 OOM) multiplicative power so TTK — not the HP number — is what the
   player feels.
3. **Ω-tiers are countable** (`PROGRESSION §1.3`): each Ω adds a clean ×1.5 to both
   sides (player mult and enemy HP), so the *frontier moves* without the *numbers
   becoming unreadable* — "Ω20" reads as a rank, not `1.5e30`.
4. **Reward efficiency self-limits** (§11.2) so infinite depth doesn't mean infinite
   trivial farming — you must grow permanent power to advance the frontier, which keeps
   all the *other* progression systems engaged.
5. **One number to compare:** Depth (and within a season, ladder rank). The Power Score
   (`PROGRESSION §1.4`) summarizes your strength; Depth summarizes your achievement. Two
   legible integers carry the entire infinite game.

---

## 15. Centralized tunables

Per repo convention (`CLAUDE.md` — centralize tunables; `PROGRESSION §0`), **every
constant here lives in one balance config**, not in generator logic. Illustrative
starting values:

| Constant | Symbol | Start value | Governs |
|---|---|---|---|
| Wave HP growth (designed) | `hpGrowth₀` | 1.04 | early difficulty ramp |
| Wave HP growth (endless) | `hpGrowth∞` | 1.06–1.08 | frontier acceleration |
| Density log coeff | `dLog` | 0.25 | swarm growth |
| Speed log coeff | `sLog` | 0.10 (cap +60%) | rush growth |
| Reward log coeff | `rLog` | 0.30 | per-wave yield growth |
| Sector length | `sectorWaves` | 10 | shake-up cadence |
| Designed band length | `designedWaves` | ~40 | onboarding/standard run |
| Corruption→TL step | `CORRUPTION_TL_STEP` | +5 TL/tier | risk→difficulty |
| Ω→TL step | `OMEGA_TL_STEP` | +50 TL/tier | prestige depth |
| Anti-repeat window | `repeatWindow` | last 3 biomes/mods | variety guarantee |
| Elite affix floor/ceiling | `eliteAffix[min,max]` | 1 → 4 | elite difficulty |
| Boss module floor/ceiling | `bossModules[min,max]` | 2 → 4 | boss complexity |

The **simulation harness** (`PROGRESSION §9`, `ROADMAP` M-balance) validates these
against the §12 pacing targets — especially that TTK stays flat in the comfort band and
that reward-per-minute genuinely peaks at the frontier.

---

## 16. Open tuning questions

To resolve with the simulation harness during prototyping (per repo convention,
resolved when implementation reaches them — *not* pre-deferred to the backlog):

- **`hpGrowth` acceleration shape** — confirm the frontier always arrives in finite
  depth for *any* account power, without the comfort band feeling like a wall.
- **Reward-efficiency peak sharpness** — tune so "push vs. extract" and "push vs. farm"
  are real decisions, not obvious always-answers (the §11.2 curve must peak, not
  plateau).
- **Modifier spice schedule** — when each procedural/corruption modifier unlocks, so
  Phase 0–1 stays pure-TD and disclosure is one-at-a-time.
- **Biome layering threshold** — the TL at which double-biome stages begin, and whether
  combined rulesets ever produce an unfair (un-counterable) intersection.
- **Boss fairness constraints** — validate the module-pairing rules never generate an
  uninterruptible/unwinnable boss at any TL.
- **Daily/seasonal seed fairness** — ensure shared seeds don't favor specific maxed
  loadouts so hard that the leaderboard becomes a build-check rather than a skill-check.

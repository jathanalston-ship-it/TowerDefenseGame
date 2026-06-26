# ECONOMY.md — Reward Economy & Currencies (canonical spec)

The definitive currency and reward design. Companion to `PROGRESSION.md` (where the
currencies are *spent*), `ENEMIES.md` (where they *drop*), `CARDS.md`, `TOWERS.md`,
`HEROES.md`, `EQUIPMENT.md`. **This doc is canonical for currency names.**

> **Goal:** support *thousands of hours without stagnation*. The method (detailed in
> §5): **every phase opens a new sink** so currency never "caps out," **prestige
> multiplies income** so old grinds trivialize, **parallel currencies** mean you're
> never blocked, and **infinite sinks** absorb overflow forever.

---

## ⭐ IMPLEMENTED — v1 reward tables (canonical for the code)

> This section documents the economy **as it exists in code today** (`src/core/config.ts`,
> `src/state/meta.ts`, `src/save/saveStore.ts`). The rest of the doc is the long-term
> vision. The two reconcile in §0. **Each mode pays in different currencies toward
> different sinks**, so the modes pull toward different playstyles (the design goal).

### Currencies (implemented)

| Code field | Canonical name | Earned by | Spent on (sink) |
|---|---|---|---|
| `shards` | Genome Samples (power) | Stage + Classic | **Core** upgrades (damage / biomass / integrity / hero dmg) |
| `components` | Equipment Components | Stage clears | **Equipment** track (integrity / splash / biomass) |
| `essence` | Neural Fragments (mastery) | Endless | **Mastery** track (fire-rate / hero speed / start biomass) |
| `catalyst` | Splice Threads (prestige) | Endless, deep waves | prestige progression (tracked; reset mechanic = future) |

`lifetimeShards` counts only Shards. Records: `bestStage`, `stagesCleared`,
`bestEndlessScore`, `bestEndlessWave`.

### Reward formulas (per mode — `meta.recordRun`)

**Stage Mode** (encourages: optimize objectives + reward multiplier; build the
Core + Equipment power base):
```
base       = wave*10 + kills*0.5
objMult    = objectiveDone ? 1 + objectiveBonus : 1     // bonus 0.25–0.5
completion = won ? 1 : 0.4                              // partial credit on a loss
shards     = floor(base * stageRewardMultiplier * objMult * completion)
components = floor((stageNumber*1.5 + (won?4:0)) * (objectiveDone?1.5:1))
on win: stagesCleared++, bestStage = max(bestStage, stageNumber)
```
`stageRewardMultiplier` (0.8–3.0) comes from the stage's env modifiers + depth
(see `stage.ts`). So harder/deeper stages and completed objectives pay the most.

**Endless Mode** (encourages: survive deep for leaderboard + Mastery/Prestige):
```
essence  = floor(wave*3*(1 + wave*0.04) + kills*0.15)   // depth-escalating
catalyst = floor(wave / 10)                             // prestige: 1 per 10 waves
score    = wave² * 100 + kills*5 + floor(time)          // leaderboard (game.ts)
records: bestEndlessScore, bestEndlessWave
```
Endless pays **no Shards** — its progression is the separate Mastery/Prestige path.

**Classic Mode** (the original baseline):
```
shards = floor(wave*ECON.shardsPerWave + kills*ECON.shardsPerKill)   // 8 / 0.4
```

### Upgrade-cost curve (all tracks)
`cost(level) = round(baseCost * costMult^level)`, capped at `maxLevel`. Core base
25–35 / mult 1.45–1.5 / cap 10; Mastery base 30–40 / mult 1.5 / cap 6–8; Equipment
base 25–30 / mult 1.45–1.5 / cap 6–8. Tuned in `BALANCE-LOG.md`.

### Long-term balance guarantees
- **No dead currency:** every earned currency has a live sink (Shards→Core,
  Components→Equipment, Essence→Mastery; Catalyst→prestige meter, future reset).
- **Parallel progression:** you're never blocked — Stage and Endless advance
  independent trees, so a wall in one is progress in the other.
- **Modest power:** the three trees are additive and capped; maxing all is a
  meaningful but non-trivializing boost (see BALANCE-LOG for the totals).

---

## 0. Currency reconciliation (read once)

Task-3 currency names are now **canonical**; earlier docs used working names. This
table is the single source of truth:

| Canonical (this doc) | Was called (earlier docs) | What it is |
|---|---|---|
| **Biomass** | Biomass | in-run build currency |
| **Genome Samples** | Tower Shards | tower star currency |
| **Hero Essence** | Hero Shards | hero star currency |
| **Neural Fragments** | Essence (Hive Tree) | global meta-tree currency |
| **Mutation Fragments** | *(new)* | card pool & mutation meta currency |
| **Equipment Components** | Catalysts / Mutagen / Resonance / Scrap (umbrella) | gear-currency family |
| **Splice Threads** | Genome Threads | Speciation (P2) prestige currency |

(DESIGN.md and PROGRESSION.md have been updated to these names.)

---

## 1. The currency map

Currencies sort into four bands by *velocity* (how fast they cycle):

| Band | Currencies | Velocity |
|---|---|---|
| **Volatile** (resets each run) | Biomass | seconds–minutes |
| **Core progression** | Genome Samples, Hero Essence, Neural Fragments, Mutation Fragments, Equipment Components | runs–weeks |
| **XP tracks** (auto, not spent) | Mastery XP, Class XP | continuous |
| **Prestige ladder** | Ascendant Cells, Splice Threads, Synaptic Cores, Apex Genes, Singularity Shards, Omega Strain | weeks–months |

Each maps to exactly one system (the legible "currency ladder" of `PROGRESSION §9`).

---

## 2. Core currencies — full definitions

### Biomass *(volatile / in-run)*
- **Source.** Enemy kills during a run (more from elites/bosses; economy cards & Flesh
  Reactor multiply it).
- **Purpose.** Build and upgrade towers *within the run*.
- **Sinks.** Tower placement, in-run upgrades, in-run abilities.
- **Scaling.** Resets every run; per-run pool scales with depth + economy build. Never
  banked — runs are about *spending well*, not hoarding. (No stagnation risk: it's
  consumed continuously.)

### Genome Samples *(tower progression)*
- **Source.** Runs (biased to *used* towers), **Hive Organisms** (rival genetics),
  codex completions, chests, prestige, gear-salvage trickle. Tower-specific (e.g.,
  *Needle Spitter Genome Samples*) + a rare universal **Prime Genome** wildcard.
- **Purpose.** Tower **stars** (1→10).
- **Sinks.** Star upgrades (~950 to max one tower, `PROGRESSION §2.2`); the universal
  wildcard prevents drought-locking.
- **Scaling.** Per-tower demand is finite (caps at ★10), but **roster growth** + future
  towers keep it relevant; income multiplied by prestige. Overflow → converts via the
  **Transmuter** (§6) so it's never dead.

### Hero Essence *(hero progression)*
- **Source.** Runs (used heroes), **Corporate Security** (elite operatives), boss
  first-kills, unlocks, chests, prestige. Hero-specific + universal **Pure Essence**.
- **Purpose.** Hero **stars** (1→10).
- **Sinks.** Hero star upgrades.
- **Scaling.** ~30% rarer than Genome Samples (heroes are fewer/stronger); demand grows
  as the hero roster + slots expand. Overflow → Transmuter.

### Neural Fragments *(global meta-tree)*
- **Source.** Runs (primary: **Neural Aberrations**), milestones, a trickle from the
  Hive Tree's own economy nodes.
- **Purpose.** The **Hive Tree** — global permanent upgrades (economy, draft, survival,
  roster, automation).
- **Sinks.** Hive Tree nodes; **resets at Molt** and re-spent each prestige cycle
  (returning faster under multipliers — the classic incremental re-climb).
- **Scaling.** The Hive Tree *deepens* with each prestige (new branches), so the sink
  grows forever; income scales with prestige multipliers.

### Mutation Fragments *(card & mutation meta)*
- **Source.** Runs (primary: **Parasites** & **Hive Organisms**), **corruption clears**
  (deeper corruption → more), codex, milestones.
- **Purpose.** Shape the **card pool** and **Mutation Strains** (`CARDS.md §3`).
- **Sinks.** Unlock new cards into the pool, raise card **weights**, buy permanent
  **reroll/banish** tokens & **draft upgrades** (1-of-4, second pick), unlock & upgrade
  **Mutation Strains**, level **Card Mastery**.
- **Scaling.** The card pool grows for *months* (progressive unlocks); card-weight &
  Card-Mastery are **infinite** soft sinks → never caps out.

### Equipment Components *(gear-currency family)*
An umbrella of four sub-currencies so gear has texture without bloat:
| Sub-currency | Source | Purpose / sink |
|---|---|---|
| **Scrap** | salvage, all drops | raw feedstock; craft bases, fuels the others |
| **Catalysts** | **Machine Cult**, salvage, chests | upgrade item level (+0→+20; +30 via Ascension) |
| **Mutagen** | elite/boss drops, salvage | **reroll affixes** (the infinite optimization sink) |
| **Resonance** | bosses, codex, prestige | **attune relics** (deepen relic effects) |
- **Source (family).** **Machine Cult** & **Corporate Security** drops, salvage of
  unwanted gear, chests.
- **Purpose.** All of `EQUIPMENT.md` — upgrade, craft, reroll, relic attune.
- **Scaling.** Vertical use is bounded (caps), but **affix reroll (Mutagen)** is an
  *infinite* chase for perfect rolls; Ascension (post-Apex) reopens the cap. Never dead:
  surplus Scrap feeds everything.

### XP tracks — Mastery & Class *(earned, auto-applied, not spent)*
- Earned from kills/usage; **auto-level** (no spending decision). Infinite (Mastery) and
  deep→Paragon (Class). Listed here for completeness; they're *tracks*, not *sinks*.
  (Full math: `PROGRESSION §2.3–2.4`.)

### Prestige ladder *(the thousand-hour engine)*
- **Ascendant Cells → Splice Threads → Synaptic Cores → Apex Genes → Singularity Shards
  → Omega Strain.** Earned on prestige resets; spent on each layer's tree.
- **Scaling.** √-gain + log/√ multipliers (`PROGRESSION §5`); the **infinite** top end
  (Omega Ω-tiers) is the ultimate overflow sink.

---

## 3. Reward structures

### Wave rewards
- **Per kill:** Biomass (in-run).
- **End of wave:** a small trickle of the *biome's* faction currency + Mutation Fragment
  dust; a **card draft** (`CARDS.md`).
- **Milestone waves (5/10/15/…):** a **Chest** (§3.3) and a guaranteed rarity-floor
  card pick. Each milestone wave ups the stakes/odds.

### Boss rewards
The run's payday. A boss kill grants:
- A **guaranteed gear drop** (faction-themed base, elevated rarity floor).
- A **large lump** of the faction's primary currency (`ENEMIES.md §7`).
- **Hero Essence** bonus on **first-ever kill** of that boss (+ codex entry).
- A chance at a **relic** or **Exotic** (scales with corruption depth).
- **Boss tokens** → spend at the boss-specific reward track for targeted farming.

### Loot boxes & Chests *(earned, never purchased)*
All chests are *earned* (waves, bosses, milestones, dailies) — **no paid power**.
Weighted contents with **duplicate protection** and **pity**:

| Chest | Source | Leans toward |
|---|---|---|
| **Common Cache** | frequent (waves) | Biomass-equivalent, Scrap, small mixed |
| **Genome Vault** | Hive/biome milestones | Genome Samples (tower-specific weighting) |
| **Essence Reliquary** | Corporate/boss | Hero Essence + gear |
| **Component Crate** | Machine/Corporate | Equipment Components + gear |
| **Neural Vault** | Neural biomes/bosses | Neural Fragments |
| **Mutation Cache** | Parasite/Hive, corruptions | Mutation Fragments + card unlocks |
| **Hive Chest** *(rare)* | big milestones, dailies | mixed jackpot, guaranteed Epic+ gear |

- **Pity & dupe protection:** a guaranteed "highlight" item by N opens; duplicates
  convert to the matching currency so a chest is *never* a dud.
- **Player agency:** you choose biomes/factions to farm the chest type you need (§ ties
  to `ENEMIES.md`).

### Milestone rewards
The backbone of "always a goal":
- **Account milestones** — stages cleared, **codex %**, **Mastery Ranks**, prestige
  layers reached → big lump currency + **unlocks** (heroes, **hero slots**, features,
  card-pool tiers).
- **Daily** — 3 rotating tasks → Mutation/Component/Essence + a chest. Light, habit-
  forming, no FOMO on power (cosmetic streak rewards only).
- **Weekly** — a **mutator challenge** (fixed seed/corruption) → big chest + cosmetics +
  leaderboard placement.
- **Seasonal (Omega)** — procedural season ladder → Exotics + cosmetics + ranked rewards
  (`DESIGN §12`).

---

## 4. Reward sizing (illustrative, per phase)

Numbers are starting points; the *shape* is the point — income and sinks rise together,
and prestige periodically resets the curve downward in absolute terms but upward in
*rate*.

| Phase | Std run yields (core currencies) | Typical biggest sink open |
|---|---|---|
| 0 Onboarding (0–2h) | ~10–15 Genome Samples, ~1k Neural Fragments | first stars |
| 1 Foundation (2–15h) | +Hero Essence, +Mutation Fragments, gear | Hive Tree, ★5s, **Slot 2** |
| 2 Specialization (15–80h) | all core, ×~3 via Molt | ★10s, gear perfection, **Slot 3** |
| 3 Expansion (80–250h) | ×~10 via Hivemind idle income | hybrids, Network nodes |
| 4 Mastery (250–600h) | corruption-boosted, Apex | Paragon, Ascension, bestiary |
| 5 Transcendence (600–1000h) | automation income | meta-laws, pantheon |
| 6 Endless (1000h+) | Ω-scaled | infinite Ω ladder, seasons |

---

## 5. Anti-stagnation architecture

The seven mechanisms that keep thousands of hours fresh:

1. **Staggered sinks.** Each phase *opens a new place to spend* (stars → class → Hive
   Tree → gear → hybrids → Ascension → Paragon → meta-laws → Omega). Currency is never
   "maxed" because a new sink is always arriving.
2. **Prestige income multipliers.** Every prestige multiplies currency *income*, so
   yesterday's wall is today's trickle — constant felt growth, no permanent grind wall.
3. **Parallel currencies.** 5 core currencies + prestige ladder mean **you're never
   blocked on one** — stalled on Genome Samples? pour Neural/Mutation/Components.
4. **Infinite soft sinks.** Mastery, Paragon, Card-weight/Card-Mastery, affix reroll
   (Mutagen), and Omega tiers absorb *unlimited* overflow forever (all logarithmic, so
   they never bloat — `PROGRESSION §1`).
5. **Faction-farming agency.** Each faction farms a different currency (`ENEMIES §7`),
   so "what do I need?" → "where do I fight?" — directed, non-random grinding.
6. **The Transmuter (exchange).** A meta-building converts surplus of one currency into
   another at a tax (rate improves via Hive Tree). No currency is ever *dead*; overflow
   always has a use.
7. **No hard caps; diminishing overflow.** Currencies don't cap; instead deep overflow
   yields diminishing *value* (asymptotic), nudging spend without the bad feeling of a
   "FULL" wall.

**What we deliberately avoid:** energy/stamina gates, paid power, FOMO power timers,
and any single currency that, once maxed, ends progression. Cosmetic and seasonal
ladders are the only time-bound rewards.

---

## 6. The Transmuter & dupe-conversion (overflow plumbing)

- **Transmuter** — convert surplus → needed currency at a tax (e.g., 3:1, improving via
  Hive Tree). Lets veterans redirect a maxed track into an active one.
- **Duplicate conversion** — maxed tower's Genome Samples / owned-relic dupes / capped
  gear auto-convert to the relevant universal currency (Prime Genome / Pure Essence /
  Resonance / Scrap). Nothing earned is ever wasted — a key "respect the player's time"
  rule that underpins long-term retention.

---

## 7. How it all connects

- **Enemies** drop **currencies** (faction-mapped) → spent on **towers/heroes/gear/Hive
  Tree/cards** → which clear **deeper enemies** → which drop **more/better currency**.
- **Cards** (temporary) spend **Biomass** in-run and are *shaped permanently* by
  **Mutation Fragments**.
- **Prestige** multiplies all income and opens new sinks, looping the whole economy at a
  higher tier.
- **The throughline:** income, sinks, and challenge **all scale together**, and a new
  *kind* of sink always sits just ahead — so the number going up never stops *meaning*
  something. That is how the economy backs 1000+ hours without going stale.

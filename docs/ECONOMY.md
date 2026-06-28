# ECONOMY.md — Reward Economy & Currencies (canonical spec)

The definitive currency and reward design. Companion to `PROGRESSION.md` (where the
currencies are *spent*), `ENEMIES.md` (where they *drop*), `CARDS.md`, `TOWERS.md`,
`HEROES.md`, `EQUIPMENT.md`. **This doc is canonical for currency names.**

> **Goal:** support *thousands of hours without stagnation*. The method (detailed in
> §5): **every phase opens a new sink** so currency never "caps out," **prestige
> multiplies income** so old grinds trivialize, **parallel currencies** mean you're
> never blocked, and **infinite sinks** absorb overflow forever.

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
  Reactor multiply it). Per-kill bounty grows `WAVE_BOUNTY_GROWTH`/wave; the spawn director
  ramps enemy *count* → income compounds with depth (see the curve below).
- **Purpose.** Build and upgrade towers *within the run*.
- **Sinks.** **(1) Building towers** (the early sink) and **(2) Tower Branch upgrades** (the
  primary *late* sink — `TOWER-BRANCHES.md`). Gene cards are *free* between-wave drafts
  (their pool is shaped by Mutation Fragments, not Biomass); tower slots are bought with
  **Shards** / a Gene Card (a separate system), not Biomass.
- **Scaling.** Resets every run; never banked — runs are about *spending well*.

#### The in-run Biomass curve (build → branch alternation)

The economy is shaped so Biomass **always has a meaningful home**: building seeds the board,
then the (uncapped-cost) branch ladder absorbs everything income can throw at it deep into
endless. Measured income (a full board, god-mode endless, seed 7 — *banked Biomass by wave*):

| Wave | ~Banked | Player is doing | Affordable sink |
|---|--:|---|---|
| 1–8 | 50–1.8k | **Building** the board (towers 100–180 each) | tower placement — income ≈ build cost (building is the binding sink) |
| 10–15 | 3k–7k | board filling out; first mutations | **Branch T1** (600–900) on several towers |
| 16–22 | 10k–35k | committing branch paths | **T2–T3** (3k–15k) |
| 23–30 | 50k–170k | deepening one or two carries | **T4** (45k–55k); first **T5** (~150k) by ~W30 |
| 35–45 | 320k–1M | maxing carries; widening the board | **T5** (150k–200k) every ~2–3 waves |

**Why Biomass never goes meaningless.** The branch ladder is the scaling sink: a single tower
costs **~220–275k Biomass** to take 1→5 (the T5 capstone is 160k–200k of that), and a full
damage board (~18 towers) is **~4–5M** — which income only reaches around **wave ~55–60**. Until then every wave you choose between *another
tower*, *the next branch tier on a carry*, or *banking toward a capstone*. Tower-slot
progression (Shards/Gene-card, separate system) adds more towers to build **and** branch,
pushing the "fully-evolved board" point deeper still. (At extreme depth, once your whole board
is maxed, Biomass does saturate — that's the intended "build complete" state; endless then
becomes a pure survival/score push. New repeatable in-run sinks can extend this if wanted.)

**Design intent (the four-way loop).** Each prep the player weighs: **Build** (more coverage)
· **Branch** (deepen a carry — the dominant late spend) · **draft a Gene card** (free, but a
real opportunity cost in attention) · **unlock a slot** (Shards/card). Income is paced so none
of these is ever trivially solved: early you can't afford everything, late the branch ladder
keeps a six-figure goal in front of you.

**Levers (all data).** `ECON` (`startingBiomass`, `reactorBiomassPerSec`), `WAVE_BOUNTY_GROWTH`
+ enemy `bounty` (income); `TOWER_DEFS[*].cost` (build sink); `BRANCH_COSTS[*]` = `[t1..t5]`
(the branch ladder — the primary late sink, tuned to the curve above). Income is intentionally
**not** capped; the *sink* scales to meet it.

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

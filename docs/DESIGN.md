# DESIGN.md — Game Design Bible

**Title:** *ASSIMILATION* (final — matches assimilationtowerdefense.com; standardized 2026-07, replacing the old ASSIMILATE codename)
**Genre:** Cyberpunk biological-horror Tower Defense × Incremental × Roguelite-draft × Collection × Endless
**One-line vision:** *You are a rogue biotech hive intelligence. Grow, mutate, and assimilate hostile ecosystems — forever.*

> **Document status:** the design bible — the source of truth for *why* the numbers exist, not the runtime values (those live in `core/config.ts`). The core game it describes **is implemented and tested** (deterministic sim, towers/heroes/enemies, economy, modes); treat specific numbers here as illustrative intent, and `GAME-STATE.md` as the record of what's actually built vs. still planned.
>
> **Companion spec:** detailed permanent-progression formulas, costs, rates, and
> pacing live in [`PROGRESSION.md`](PROGRESSION.md).

---

## Table of Contents

1. [Design Pillars](#1-design-pillars)
2. [Fiction & Fantasy](#2-fiction--fantasy)
3. [Core Gameplay Loop](#3-core-gameplay-loop)
4. [Progression Philosophy](#4-progression-philosophy)
5. [Long-Term Retention Philosophy](#5-long-term-retention-philosophy)
6. [The Run (TD core, cards, mutations, procedural stages)](#6-the-run)
7. [Towers](#7-towers)
8. [Heroes](#8-heroes)
9. [Meta-Progression & Currencies](#9-meta-progression--currencies)
10. [Collection Systems](#10-collection-systems)
11. [Build Diversity Systems](#11-build-diversity-systems)
12. [Prestige Layers](#12-prestige-layers)
13. [Progression Pacing](#13-progression-pacing)
14. [Keeping It Understandable](#14-keeping-it-understandable)
15. [Major Risks & Solutions](#15-major-risks--solutions)
16. [Appendix: Goal Compliance & Glossary](#16-appendix)

---

## 1. Design Pillars

Five pillars. Every system decision must serve at least one and contradict none.

1. **Mechanics-First Progression.** Every progression track has *mechanic-unlock milestones*, not just stat ramps. Numbers grow between milestones to give moment-to-moment dopamine; **milestones change how you play.** If an upgrade only makes a number bigger, it must sit *between* two milestones, never replace one.
2. **Many Loops, One Fantasy.** TD, incremental, roguelite, collection, and idle are not bolted together — they are nested expressions of "the hive grows and assimilates." Each loop feeds the next.
3. **Legible Depth.** Complexity is *revealed*, never *dumped*. The player should always understand the layer they're on and see exactly one layer ahead.
4. **Trophies Are Forever, Engines Reset.** Permanent identity (collection, stars, cosmetics, mastery records) is never taken away. Only the *power engines* (trees, multipliers, class levels) reset on prestige — and they regrow fast. This kills loss-aversion dread.
5. **Active Beats Idle, But Idle Always Pays.** Skilled active play is always strictly stronger, preserving a high skill ceiling; idle/automation always yields *something* so lapsed or casual sessions still advance the player.

---

## 2. Fiction & Fantasy

The player is a **rogue hive intelligence** — a lab-born biotech swarm that slipped its corporate leash. Each stage is a captured **biome node** of a hostile ecosystem: corporate arcology sublevels, drowned bio-domes, fungal megastructures, neural server-jungles. The ecosystem fights back with **fauna, flora-horrors, corpo-security mechs, and rival strains.**

Mechanical translation of the fantasy (theme drives systems, never the reverse):

| Fiction | Mechanic |
|---|---|
| The hive's exposed heart | **The Nucleus** — the objective you defend; enemies that reach it deal Nucleus damage |
| Growing biological weapons | **Towers** — grown from biomass on the map |
| Devouring the dead | **Biomass** — in-run currency; kills convert to biomass |
| Evolving under pressure | **Cards / Mutation Strains** — in-run roguelite power |
| Cataloguing all life | **Assimilation Atlas** — the collection/codex |
| Shedding a husk to grow bigger | **Prestige** — molting into a larger organism |

Tone: clinical body-horror meets neon corpo-tech. Progression is framed as *evolution and infection*, which makes "infinite numbers go up" feel diegetic — a hive is *supposed* to grow without limit.

---

## 3. Core Gameplay Loop

Six nested loops, fastest to slowest. The dopamine design goal: **a reward lands every 30–90 seconds; a meaningful unlock every session; a transformative unlock every few sessions.**

**Loop 1 — Moment-to-moment (seconds).** Place/upgrade towers, set target priority, trigger hero abilities, react to enemy mutations and reactions firing. *Skill expression lives here.*

**Loop 2 — Wave (1–3 min).** Survive a wave → earn biomass + a **card draft** → adapt the build → next wave. Tension/release cadence.

**Loop 3 — Run (20–40 min, endless after).** Pick 3 towers + 1–3 heroes → push a procedural stage gauntlet → bank permanent progression (Genome Samples, Hero Essence, mastery, class XP, Neural Fragments, gear, codex entries). Death/extraction ends the run; *everything earned persists.*

**Loop 4 — Session (15–60 min real-time).** Spend earned currencies: raise tower/hero stars, push class levels, buy Hive Tree nodes, craft/equip gear, unlock the next hero. Plan the next run's loadout.

**Loop 5 — Meta (days–weeks).** Unlock heroes and hero slots 2 & 3, complete collections, climb difficulty, reach your first prestige.

**Loop 6 — Prestige (weeks–months).** Reset an engine layer for a permanent multiplier **and a new mechanic**, transforming how all the loops above play.

```
        ┌────────────── PRESTIGE (months) ─────────────┐
        │   ┌────────── META (weeks) ──────────┐        │
        │   │   ┌────── SESSION (mins) ─────┐   │        │
        │   │   │   ┌── RUN (20–40m) ──┐    │   │        │
        │   │   │   │  wave → draft →   │    │   │        │
        │   │   │   │  adapt → wave …   │    │   │        │
        │   │   │   └──────────────────┘    │   │        │
        │   │   └ spend currencies, plan ───┘   │        │
        │   └ unlock heroes/slots/content ──────┘        │
        └ reset engine, gain new mechanic + multiplier ──┘
```

---

## 4. Progression Philosophy

**Parallel tracks, never a single bar.** At any moment the player is advancing 5–8 tracks at once (a tower's stars, its mastery, its class, a hero, the Hive Tree, the codex, a prestige currency). When one track stalls behind a wall, three others are mid-flight. **There is never a moment where progress on *everything* is blocked** — this is the core anti-grind guarantee.

**Three speeds of reward, deliberately interleaved:**
- **Fast & frequent** (every wave): biomass, card drafts, mastery ticks. Pure dopamine drip.
- **Medium & earned** (every session): a new star, a class keystone, a gear upgrade, a codex completion bonus.
- **Slow & transformative** (every few sessions → months): a new hero, a hero slot, a hybrid tower, a prestige layer. These *change the game*, not the numbers.

**Mechanics-First Rule, applied per track:**
- *Stars* → each of the 10 unlocks an ability/behavior.
- *Class levels* → keystones and class-wide rule changes at milestones.
- *Hive Tree* → branches that unlock systems (reroll, banish, automation, new draft slots), not only % nodes.
- *Prestige* → a brand-new subsystem every layer.
- Only **Mastery** is allowed to be primarily numeric — because it is the *infinite* track, and infinite tracks must be simple to stay legible. Even then it grants a perk every milestone.

**Infinite where appropriate, soft-capped for legibility.** Infinite tracks (mastery, paragon trees, endless stage depth, prestige multipliers) use **asymptotic / logarithmic returns** so a number being "twice as big" never means "twice as confusing." The *interesting* decisions stay in the finite, mechanic-rich tracks; the infinite tracks are the steady background hum that lets a 1000-hour player still gain something every run.

---

## 5. Long-Term Retention Philosophy

Designing for 1000+ hours means **the reason to log in tomorrow must change shape over time.**

- **Early (0–60h): discovery.** New systems unlock constantly. Retention = "what's behind the next door."
- **Mid (60–400h): optimization & collection.** Systems are known; mastering their interactions and completing collections drives play. Retention = "I can make this build *so much* stronger / I'm 3 entries from a set bonus."
- **Late (400–1000h): mastery & prestige.** Retention = "this prestige rewrites the rules" and "I want a deeper corruption clear than last week."
- **Endless (1000h+): seasons & competition.** Procedural Omega seasons + leaderboards + escalating challenge ladders give *externally refreshed* goals so content never fully runs dry.

**Retention mechanisms layered in:**
1. **Overlapping incompletion** — you are always mid-progress on many tracks (Zeigarnik effect, ethically: no dark-pattern timers).
2. **Collection completionism** — the Atlas and gear sets create a "gotta finish it" itch with real power payoffs.
3. **Build curiosity** — the synergy matrix means there is *always* an untried combination worth a run.
4. **Periodic fresh starts** — prestige delivers the "new save file" rush *without* losing your trophies.
5. **Externalized goals** — dailies, weekly mutators, seasonal ladders, leaderboards.

Anti-pattern guardrails: **no energy systems, no pay-to-skip-grind, no FOMO timers on power.** Cosmetics and seasonal cosmetic ladders are fine; *power is never gated behind the clock.*

---

## 6. The Run

A run is one TD gauntlet through a **procedural stage**. It is the engine that mints every permanent currency.

### 6.1 TD Core

- **Nucleus** with a health pool (Integrity). Enemies that reach it deal Integrity damage. Hitting 0 ends the run (with extraction rewards based on depth).
- **Biomass** is the in-run economy. Kills drop biomass; biomass builds and upgrades towers *within the run only*. It resets every run — runs are about *spending well*, not hoarding.
- **Towers** are placed on buildable cells along/around procedural paths. Each placed tower can be upgraded in-run along a short branching path (in-run upgrades are distinct from meta star/mastery progression).
- **Heroes** are mobile, directly-commanded units with cooldown abilities and an ultimate. They are the active-skill expression on the field.

### 6.2 Procedural Stages

Each stage is assembled from:
- **Biome** (visual + ruleset): e.g., *Arcology Sublevel* (tight maze paths), *Drowned Dome* (flooding cells that disable towers), *Neural Jungle* (enemies gain shields), *Fungal Megastructure* (biomass-rich, fast enemies). Biomes shift the optimal build → enforced variety.
- **Path topology**: single, branching, looping, or multi-lane (multi-lane unlocks at the Hivemind prestige, see §12).
- **Node map** (roguelite overworld within the run): the player chooses a route through nodes — *Combat*, *Elite*, *Cache* (gear/biomass), *Gene Lab* (extra card draft), *Mutation Altar* (corruption trade), *Boss*. Route choice = strategic layer before tactics.
- **Scaling**: waves escalate; after the "designed" wave count (~30–50) the stage goes **endless**, scaling enemy HP/speed/density on a curve and multiplying rewards. Endless depth is a primary skill leaderboard axis.

### 6.3 Cards (temporary, reset every run)

The roguelite draft layer. After each wave (or at Gene Lab nodes) the player drafts **1 of 3 Gene Cards**.

- **Rarities:** Common → Rare → Epic → Mythic → **Corrupted** (powerful but attaches a drawback).
- **Card types:** stat injectors, *behavior changers* (e.g., "Needle Spitter shots ricochet"), *synergy enablers* (e.g., "applying Corrosion also applies a Viral stack"), *economy* (biomass gain), *hero augments*, *meta-shapers* (alter the draft itself — extra picks, rerolls, rarity weighting).
- **Build-around mechanics:** rerolls, banish (remove a card from the pool this run), and **card synergy chains** — some cards explicitly amplify others, rewarding drafting toward a plan. Cards reset between runs; the *library of discovered cards* is permanent (collection).
- A run's card deck is the **temporary build identity** layered on top of your permanent loadout.

### 6.4 Mutation Strains & Corruptions (temporary)

Two run-modifier flavors, both reset per run:

- **Hive Mutation Strains (player-positive):** a slow-building run-long evolution. At wave milestones you choose a strain to evolve (e.g., *Acid Lineage*, *Vital Lineage*, *Swarm Lineage*) that grants escalating effects — a secondary, slower draft alongside cards that defines the run's *macro* direction.
- **Corruptions (risk/reward gambling):** at Mutation Altars you may *voluntarily* apply enemy buffs (e.g., "enemies +40% HP," "elites split on death," "fog hides paths") in exchange for multiplied rewards and rarer card weighting. **This is the dopamine-rich risk valve** — pushing corruption depth is its own metagame, and it's the seed of the late-game Corruption Stacking prestige system (§12).

> **Why cards + mutations are temporary but progression persists:** the run is a *generator*. Volatile, high-variance fun (cards/corruptions) lives inside the run; durable growth (Genome Samples, Hero Essence, mastery, class XP, Neural Fragments, gear, codex) is the *output* the run deposits into permanence. This separation lets us make the in-run layer wild and experimental without destabilizing the long-term economy.

---

## 7. Towers

**5 towers at launch. The player selects 3 for a run.** (Roster grows post-launch; the systems below are built to scale to dozens.) Each tower anchors one **Combat Class** at launch.

### 7.1 The Launch Five

> **Canonical detail:** full kits, star ladders, and the reaction framework live in
> [`TOWERS.md`](TOWERS.md). Launch classes are **Kinetic · Caustic · Viral · Neural ·
> Vital** (Cryo was retired pre-launch — see TOWERS.md).

| Tower | Class | Role | Identity |
|---|---|---|---|
| **Needle Spitter** | Kinetic | Single-target executioner | Rapid bone needles; stacking Fracture (armor shred + crit); deletes elites/bosses. |
| **Bone Mortar** | Caustic | AoE artillery / zoner | Arcing marrow-bombs leave caustic pools; armor melt + area denial; anti-cluster. |
| **Parasite Nest** | Viral | DoT / spread / summon | Ramping infection that leaps between enemies; births Crawlers; scales with density. |
| **Neural Obelisk** | Neural | Control / hijack | Psionic field: slow + Vulnerability + hijack; force-multiplier support. |
| **Flesh Reactor** | Vital | Economy / support | Generates biomass, overcharges neighbors, repairs the Nucleus — the hive's engine. |

Deliberate coverage: one of each TD archetype (burst, AoE, control, ramp/DoT, support) so any 3-pick is viable but flavored. **C(5,3) = 10** distinct base loadouts at launch — multiplied enormously by the systems below.

### 7.2 Tower Progression — Three Axes

Each tower advances on **three independent permanent tracks**, exactly as specified:

**A) Stars (1→10) — via Genome Samples.** Each star unlocks an **ability or mechanic** (mechanics-first), not raw stats. Generic star ladder (each tower themes its own):

| Star | Unlock archetype | Example (Needle Spitter) |
|---|---|---|
| ★1 | Tower usable | Base needle shot |
| ★2 | Quality-of-life mechanic | Auto-targets highest-HP enemy; ramps faster while held |
| ★3 | New on-hit behavior | Fracture stacks (armor shred + crit) |
| ★4 | Resource/economy hook | Crits refund biomass |
| ★5 | **Branch choice A/B** (build fork) | *Penetrate* (pierce line) **or** *Execute* (bonus dmg <25% HP) |
| ★6 | Synergy enabler | *Fracture* enables Kinetic reactions (Shred/Hemorrhage/…) |
| ★7 | New active/triggered ability | *Overdraw*: charged rail-needle every Nth attack |
| ★8 | **Branch choice A/B** | *Railgun* (slow, +range, +pierce) **or** *Autocannon* (fast, higher Fracture cap) |
| ★9 | Class-defining capstone | *Overflow*: a Fractured enemy's death flings its stacks onward |
| ★10 | Signature transformation | *Singularity Round*: re-triggers every crit dealt to that target this wave |

The **A/B branch choices at ★5 and ★8** mean a single tower has 4 endgame configurations — and those choices are *re-selectable between runs* (loadout-level, not permanent lock), so the same maxed tower supports multiple builds.

**B) Mastery (infinite) — from kills & usage.** Every kill and every second of active use feeds that tower's Mastery. Mastery is the **infinite background ramp**:
- Each level: small asymptotic bonus (e.g., damage `+`, capped contribution via `bonus = K·(1 − e^(−level/τ))`-style soft curve so it never bloats illegibly).
- **Milestone perks every 25 levels** (so even the infinite track is mechanics-touched): unlock a passive (e.g., M25 "Needle Spitter ignores the first 10% of armor"), M50, M100… then **Paragon** rules unlock far later via prestige.
- Mastery is **permanent through all prestige** — it's a trophy of how much you've used a tower. (XP-to-next grows ~`×1.12`/level; with prestige multipliers it accelerates so veterans climb fast.)

**C) Class Levels — the shared specialization path.** Each tower belongs to a **Combat Class**; using any tower of that class earns **Class XP** for the class. Class levels are where *specialization* is rewarded:
- Per level: a class-wide stat (all your Kinetic towers benefit).
- **Class Keystones** at milestones (Lv 10/25/50…): powerful, build-defining passives you **slot** before a run (limited keystone slots → choice, not stacking). E.g., Kinetic keystone *Overpenetration*, Vital keystone *Transfusion*, Neural keystone *Puppeteer*.
- Classes are designed to hold **multiple towers** as the roster grows — leveling a class makes *every future tower in it* stronger, so the investment compounds. (Post-Speciation, classes can fuse — §12.)

> **Why three axes?** Stars = *what the tower can do* (deliberate, currency-gated). Class = *how you specialize* (slottable, build-shaping). Mastery = *how much you've used it* (infinite, automatic). They never compete for the same currency, so all three advance in parallel — no false choice between them.

### 7.3 Class Synergy Matrix (the build engine)

Towers apply **status types**; combining two on one enemy triggers a **Reaction** — high-value burst that rewards *mixing classes*. This is the single biggest driver of build variety (§11).

| + | Kinetic | Caustic | Viral | Neural | Vital |
|---|---|---|---|---|---|
| **Kinetic** | — | **Shred** | Hemorrhage | Overstrike | Harvest |
| **Caustic** | **Shred** | — | **Plague** | Dissolve | Ferment |
| **Viral** | Hemorrhage | **Plague** | — | **Mind Rot** | Bloom Rot |
| **Neural** | Overstrike | Dissolve | **Mind Rot** | — | Synaptic Bloom |
| **Vital** | Harvest | Ferment | Bloom Rot | Synaptic Bloom | — |

(Full reaction definitions in [`TOWERS.md`](TOWERS.md).)

Mono-class builds are valid (deep specialization via class levels), but reactions make **mixed builds** spike — so the meta is genuinely "specialize *or* combo," not one dominant answer.

---

## 8. Heroes

Heroes are mobile, actively-controlled avatars of the hive — the **active-skill** layer.

- **Start with 1 hero. Hero slots 2 and 3 unlock through progression** (slot 2 via early meta milestone, slot 3 via mid-game prestige — see pacing §13). Running 2–3 heroes multiplies active complexity and synergy.
- Heroes are themselves **unlocked through gameplay progression** (boss first-kills, collection milestones, prestige rewards, class milestones) — never random gacha pulls; every hero is *earned and visible* on a roadmap.

### 8.1 Launch Roster

> **Canonical detail:** full kits, star ladders, and the autonomous-unit model live in
> [`HEROES.md`](HEROES.md).

| Hero | Class | Role | Hook |
|---|---|---|---|
| **Ravager** (starter) | Kinetic | Dive bruiser DPS | Charges in, cleaves, stacks Fracture to set up reactions. |
| **Shepherd** | Vital | Support / summoner | Heals towers/Nucleus, commands a Flock of bio-drones, overcharges the hive. |
| **Overseer** | Neural | Controller / hijacker | Slows, applies Vulnerability, converts enemies to fight for you. |

Launch trio = damage / sustain / control across 3 of the 5 classes; **Caustic** and
**Viral** heroes are post-launch unlocks (every class has a tower; not every class has
a launch hero — a deliberate chase).

### 8.2 Hero Progression — Four Axes

Mirrors towers, plus equipment:

**A) Stars — via Hero Essence.** Each star unlocks a hero ability/mechanic (passive, new active, ultimate upgrade, or A/B branch), same mechanics-first ladder as towers. 10 stars = full kit with branch forks.

**B) Mastery (infinite)** — from hero usage/kills; asymptotic stat ramp + milestone perks every 25; permanent through prestige.

**C) Class Levels** — heroes share the same Combat Classes as towers, so **a hero and a tower of the same class co-level the class**, and class keystones buff both. (This tightly couples hero and tower build identity — choosing a Kinetic hero deepens a Kinetic tower build.)

**D) Equipment — Weapon, Armor, Relic.** Three gear slots per hero:
- **Weapon** — offense profile (and often an attack *behavior*, e.g., chaining, piercing).
- **Armor** — survivability + utility (e.g., aura that buffs nearby towers).
- **Relic** — *build-defining passive* (the spiciest slot; e.g., "your reactions deal +100% but you can't crit").
- Gear has **rarity, item levels (upgradeable), affixes, and set bonuses** (collection §10). Gear is the hero's *horizontal* build lever — same hero, wildly different feel depending on loadout.

> Heroes intentionally have **more** axes than towers (4 vs 3) because they're fewer in number and more personally "owned" — concentrating customization on heroes keeps the per-tower UI lean while still offering deep hero theorycrafting.

---

## 9. Meta-Progression & Currencies

A **legible currency ladder** — each tier maps to one system, and the prestige currencies (§12) extend the same ladder so the player never sees an unexplained resource.

| Currency | Source | Spent on | Infinite? | Persists prestige? |
|---|---|---|---|---|
| **Biomass** | In-run kills | In-run tower build/upgrade | n/a (resets per run) | n/a |
| **Genome Samples** | Runs, codex, prestige | Tower stars (1→10) | no (10 caps) | ✅ trophy |
| **Hero Essence** | Runs, unlocks, prestige | Hero stars (1→10) | no | ✅ trophy |
| **Mastery XP** (per tower/hero) | Kills & usage | Mastery levels | ✅ | ✅ trophy |
| **Class XP** (per class) | Using class units | Class levels + keystones | ✅ (paragon late) | ❌ resets @ Speciation |
| **Neural Fragments** | Runs (esp. Neural Aberrations) | **Hive Tree** (global tree) | spend-sink | ❌ resets @ Molt |
| **Mutation Fragments** | Runs (Parasites/Hive), corruptions | Card pool & Mutation Strains | ✅ (soft) | ✅ trophy |
| **Equipment Components** | Drops, salvage, crafting | Equipment (`EQUIPMENT.md`) | n/a | ✅ trophy |
| **Ascendant Cells** | Prestige 1 | Ascendant Tree | ✅ | layer-scoped |
| **Splice Threads** | Prestige 2 | Speciation Web | ✅ | layer-scoped |
| **Synaptic Cores** | Prestige 3 | Hive Network | ✅ | layer-scoped |
| **Apex Genes** | Prestige 4 | Apex systems | ✅ | layer-scoped |
| **Singularity Shards** | Prestige 5 | Singularity systems | ✅ | layer-scoped |
| **Omega Strain** | Prestige 6 | Omega ladder | ✅ | top-level |

> Canonical currency reference (incl. **Mutation Fragments** & **Equipment Components**): [`ECONOMY.md`](ECONOMY.md).

### 9.1 The Hive Tree (global meta-progression backbone)

The incremental spine: a large branching tree bought with **Neural Fragments**, available from early game. Branches unlock **systems and QoL**, not only percentages:
- **Economy branch** — biomass gain, starting biomass, interest mechanics.
- **Draft branch** — extra card picks, rerolls, banish, rarity weighting, a second draft slot.
- **Survival branch** — Nucleus integrity, repair, emergency abilities.
- **Roster branch** — loadout slots, hero slot unlocks gated here, swap-mid-run.
- **Automation branch** (later) — auto-target presets, build templates, then full run automation (idle).

The Hive Tree resets at the first prestige (Molt) and is replaced/augmented by deeper trees — but each reset returns with a multiplier so re-buying is fast and satisfying (the classic incremental "blast through what took hours, in minutes").

---

## 10. Collection Systems

Collection is both a **completionist hook** and a **real power source** (so completionists and optimizers chase it together).

- **Assimilation Atlas (Codex):** every enemy/elite/boss you kill logs an entry; killing *enough* of a type completes it, granting a **permanent bonus vs that type** (e.g., +dmg, +biomass from it) and lore. Hundreds of entries → a slow, ever-present completion track that *also* makes you stronger. Permanent through all prestige.
- **Gear Sets:** equipment belongs to sets; equipping set pieces grants escalating bonuses. Crafting + drops + dismantle/upgrade economy. Drives "one more run for the last piece."
- **Card / Mutation Library:** discovering each card/strain logs it; full discovery grants meta bonuses and unlocks deck-shaping tools. Encourages trying unfamiliar cards.
- **Tower & Hero Variants/Skins:** mostly cosmetic (cosmetic prestige), with optional minor *Phenotype* tweaks unlocked via Speciation. Powers the cosmetic/seasonal economy without selling power.
- **Bestiary-as-Arsenal (late):** at Apex, completed Atlas entries can be *spent* to deploy assimilated enemies as units — collection literally becomes combat power.

---

## 11. Build Diversity Systems

"Extremely high build variety" is engineered, not hoped for. The diversity is **combinatorial** — sources multiply rather than add:

1. **Tower selection:** 3 of N (10 combos at launch; explodes as roster grows).
2. **Star branch forks:** each maxed tower has 4 configs (★5 × ★8 A/B), re-selectable per run.
3. **Class keystone slotting:** limited slots from a growing keystone pool → meaningful exclusions.
4. **Synergy matrix:** reactions reward specific class *pairings* → mixed builds feel distinct from mono builds.
5. **Hero selection (1–3) + 4-axis hero customization:** stars, class, and especially **gear/relics** create per-hero build identities.
6. **Hero↔Tower class coupling:** shared classes mean hero choice steers tower build and vice versa.
7. **Gene Card drafts:** large pool, synergy chains, rarities, build-around Mythics/Corrupted.
8. **Mutation Strains:** a slower macro-direction layered on the run.
9. **Corruption stacking:** voluntary difficulty as a build lever (some builds *want* certain corruptions).
10. **Procedural biome rulesets:** the *stage* invalidates some builds and rewards others — the meta rotates by environment.
11. **Hybrid Towers / Phenotypes (post-Speciation):** fuse classes into new towers — a multiplicative expansion of the roster itself.
12. **Paragon / infinite class trees (post-Apex):** late respec-able infinite trees for fine build tuning.

**Anti-homogenization built in:** diminishing returns on *stacking the same* effect, enemy mutations that punish one-dimensional builds, biome rotation, and keystone slot limits all push players *away* from a single dominant build and *toward* variety. (See risks §15.)

---

## 12. Prestige Layers

Six nested layers. **Each resets a specific engine and grants (a) a new currency + tree AND (b) a genuinely new mechanic that changes how the game is played** — never "+X% and continue." The nesting follows pillar #4: **trophies (stars, mastery, codex, gear) never reset; only engines do.**

> Design rule for every layer: *"You give up an engine you've mastered, and in return the game becomes a different, bigger game."*

### Layer 1 — **MOLT** *(first prestige, ~8–15h)*
- **Resets:** Hive Tree (Neural Fragments), in-run economy upgrades.
- **Keeps:** stars, mastery, class levels, codex, gear (everything else).
- **Grants:** **Ascendant Cells** → the **Ascendant Tree** (a stronger parallel tree) + a global production multiplier scaling with lifetime Cells.
- **New mechanic — Adaptive Mutation Slots:** every tower gains a small permanent slot that rolls a random beneficial mutation each run, adding controlled run-to-run variance. Early game now blasts by; the multiplier makes re-climbing the Hive Tree feel *great*.
- **Why it's the first:** teaches the prestige fantasy cheaply, with low loss (only the early tree) and immediate, obvious speed-up.

### Layer 2 — **SPECIATION** *(~40–80h)*
- **Resets:** Class levels + Ascendant Tree.
- **Keeps:** stars, mastery, codex, gear.
- **Grants:** **Splice Threads** → the **Speciation Web**.
- **New mechanic — Hybrid Towers (Subspecies) + Phenotypes:** permanently *fuse two Combat Classes* into a hybrid tower (e.g., Caustic+Viral → **Pestilence**, applying both statuses and auto-triggering **Plague**). This multiplies the roster and the synergy space. **Phenotypes** let you stamp a global build identity on a run. Also **unlocks Hero Slot 3** here.
- **Why here:** by now players understand class identity deeply — fusing classes is the natural "I want to break the rules" payoff, and it's a massive build-variety unlock right when the base combos start to feel explored.

### Layer 3 — **HIVEMIND** *(~150–250h)*
- **Resets:** Speciation Web + tower/hero Mastery levels (regrow fast under multipliers; mastery *records*/milestone unlocks are kept).
- **Keeps:** stars, codex, gear, hybrids unlocked.
- **Grants:** **Synaptic Cores** → the **Hive Network**.
- **New mechanic — The Hive Network (idle/incremental overworld):** the game expands from single runs to a **map of nodes** you assimilate and hold; held nodes generate resources passively (the explicit **idle layer**), and runs can now feature **multiple parallel lanes** (multi-lane stages). The hive becomes an empire that grows while you're away *and* rewards active conquest.
- **Why here:** introduces the idle dimension only after the active TD is fully mastered — so idle *amplifies* skill rather than replacing it (pillar #5). This is the layer that converts the game from "TD with progression" into "incremental empire."

### Layer 4 — **APEX PREDATOR** *(~400–600h)*
- **Resets:** Hive Network + all shallower trees.
- **Keeps:** the trophy spine + hybrids.
- **Grants:** **Apex Genes**.
- **New mechanics (a suite):**
  - **Corruption Tiers / Stacking** — voluntary world-corruptions become a *core progression axis* with exponential rewards; "how deep can you corrupt and still clear" is the late skill ladder.
  - **Paragon Trees** — infinite, respec-able class trees for fine optimization (the late-game "infinite numbers, but choiceful").
  - **Bestiary-as-Arsenal** — deploy assimilated enemies as units (collection → combat).
- **Why here:** mastery players want *optimization depth* and *self-imposed challenge*; this layer is built for theorycrafters and pushers.

### Layer 5 — **SINGULARITY** *(~700–1000h)*
- **Resets:** nearly all engines below.
- **Keeps:** trophy spine; everything regrows extremely fast.
- **Grants:** **Singularity Shards**.
- **New mechanics:**
  - **Run Automation** — the hive can now auto-run assimilation (full idle option); active play remains strictly stronger and is required for record pushes.
  - **Meta-Laws** — choose permanent rule alterations (e.g., "reactions chain twice," "no biomass interest but double base," "enemies always multi-lane") that reshape *every* run.
  - **Pantheon** — slot a few permanent global buffs from a large pantheon pool.
- **Why here:** the player has "solved" the active game; Singularity lets them *author* their own ruleset and choose how hands-on to be. Respects the 1000-hour veteran's time.

### Layer 6 — **OMEGA HIVE** *(endgame, 1000h+; infinitely repeatable)*
- **Resets:** everything, including Singularity.
- **Keeps:** trophy spine + cosmetic/seasonal records.
- **Grants:** **Omega Strain** (Ω1, Ω2, Ω3 … *infinite prestige tiers*).
- **New mechanic — Procedural Seasons & Endless Ascension:** each Omega cycle **procedurally generates new modifiers, biomes, and a challenge ladder**, with **leaderboards** per cycle. This is the *infinite, externally-refreshed* endgame: the game keeps generating fresh goals after all authored content is consumed. Competitive/seasonal layer lives here.
- **Why it's last:** it converts "finite authored content" into "infinite procedural content," which is the only honest way to back a *truly* endless 1000h+ promise.

**Prestige ladder summary:**

| Layer | ~Unlock | Resets | New Mechanic (the point) |
|---|---|---|---|
| Molt | 8–15h | Hive Tree | Adaptive mutation slots + Ascendant Tree |
| Speciation | 40–80h | Class levels | **Hybrid towers** + Hero Slot 3 |
| Hivemind | 150–250h | Speciation | **Idle Hive Network** + multi-lane |
| Apex | 400–600h | Hive Network | **Corruption stacking + Paragon + bestiary units** |
| Singularity | 700–1000h | most engines | **Automation + Meta-Laws + Pantheon** |
| Omega | 1000h+ ∞ | everything | **Procedural seasons + endless ladder + leaderboards** |

---

## 13. Progression Pacing

### 13.1 Phase Map (the 1000-hour curve)

| Phase | Hours | What unlocks | Player's "why I'm here" |
|---|---|---|---|
| **0 — Onboarding** | 0–2 | TD core, 1 hero, 3 towers, first stars, Mastery visible only | "This TD is fun." |
| **1 — Foundation** | 2–15 | Cards, Mutation Strains, Hive Tree, Class levels, **Hero Slot 2**, → **Molt** | "New systems every session." |
| **2 — Specialization** | 15–80 | Ascendant Tree, gear depth, codex push, → **Speciation** (hybrids, **Slot 3**) | "I can fuse classes / complete sets." |
| **3 — Expansion** | 80–250 | Hivemind: idle network, multi-lane | "My hive grows while I'm away *and* when I play." |
| **4 — Mastery** | 250–600 | Apex: corruption ladder, paragon, bestiary units | "How deep can I push?" |
| **5 — Transcendence** | 600–1000 | Singularity: automation, meta-laws, pantheon | "I author the rules." |
| **6 — Endless** | 1000+ | Omega seasons, leaderboards, ∞ tiers | "New season, new climb, ranked." |

**Progressive disclosure schedule:** at most **one new system introduced per session in Phase 0–1.** The first 20 minutes show *only* tower placement + biomass + one hero. Cards arrive ~run 2, Hive Tree ~run 3, classes ~run 4, etc. The player never faces more than one unfamiliar panel at a time.

### 13.2 Reward Cadence (the dopamine schedule)

- **Every 30–90s:** biomass, mastery tick, a card draft, a kill-streak/codex tick. (Variable-ratio juicy feedback — VFX, SFX, number pops.)
- **Every run (~20–40m):** measurable stars/class/essence/gear gains; a "results screen" that *shows the bars move*.
- **Every session:** at least one *medium* unlock (a star milestone, keystone, set bonus, hero unlock progress).
- **Every few sessions:** one *transformative* unlock (hero, hero slot, hybrid, prestige).

### 13.3 Curve Principles

- **Costs grow geometrically; player power grows geometrically + prestige multipliers** → wall → prestige → blast-through → new wall. Classic incremental rhythm, tuned so a wall is felt for *one or two sessions*, not weeks.
- **Catch-up multipliers:** every prestige currency multiplies *re-acquisition* of the layers below, so returning/lapsed players and post-prestige climbs are *fast*, never re-grinding at original speed.
- **Soft caps via asymptotes** on all infinite tracks keep numbers legible (a power-score abstraction summarizes total strength in one readable figure).
- **No hard stalls:** because 5–8 tracks run in parallel, "blocked on track A" always means "advancing tracks B–F." If telemetry ever shows a true all-tracks stall, that's a P0 pacing bug.

---

## 14. Keeping It Understandable

The hardest goal: 1000 hours of systems that stay legible. Tactics:

1. **Progressive disclosure** (above) — systems unlock one at a time, each with a focused, contextual tutorial.
2. **One layer of foresight** — the UI always shows the *next* unlock and its requirement, and *nothing further* by default (advanced players can expand a roadmap).
3. **Consistent currency ladder** — each currency maps to exactly one system; the ladder (§9) is visually a single ascending column. No mystery resources.
4. **Power Score** — a single summary number abstracts total strength for at-a-glance comparison, hiding the underlying spreadsheet unless the player opens it.
5. **Build templates / loadout presets** — save and name loadouts ("Kinetic-Shred," "Plague Swarm"); recommended starter templates lower the entry cost of deep customization.
6. **Reactions are taught, then surfaced** — the synergy matrix is introduced one reaction at a time, with clear on-hit telegraphs (you *see* Shred happen), not buried in tooltips.
7. **Codex as manual** — the Atlas doubles as the in-game encyclopedia; every mechanic is a lookup away.
8. **Prestige clarity screens** — every prestige shows *exactly* what resets, what persists, and what you gain, with a projected "you'll re-reach here in ~X" estimate to defuse loss-aversion.
9. **Mechanics-first means fewer "stat fog" upgrades** — because milestones change *behavior*, the player reasons about *what things do*, not just stacking opaque percentages.

---

## 15. Major Risks & Solutions

A lead designer's pre-mortem. Each risk gets a concrete mitigation already built into the design.

| # | Risk | Why it kills the game | Solution (designed-in) |
|---|---|---|---|
| 1 | **Number bloat / illegibility** | Players can't reason about 1e40 dmg | Asymptotic soft caps on infinite tracks; Power Score abstraction; prestige resets compress numbers; scientific-notation UI with readable tiers |
| 2 | **Complexity overwhelm** | New/returning players bounce | Progressive disclosure (1 system/session early); contextual tutorials; build templates; codex-as-manual; one-layer foresight |
| 3 | **Grind walls / all-track stalls** | Boredom, churn | 5–8 parallel tracks (never all blocked); catch-up multipliers; "every session advances *something*" guarantee; telemetry P0 on true stalls |
| 4 | **Build homogenization (one meta)** | Variety promise broken | Diminishing returns on same-effect stacking; keystone slot limits; biome rotation; enemy mutations punishing mono-builds; reaction matrix rewarding mixing; scheduled rebalance cadence |
| 5 | **Prestige feels like punishment** | Loss aversion → players refuse to prestige | Trophies-forever rule (stars/codex/gear/mastery persist); fast catch-up multipliers; explicit "what you keep vs lose" + re-reach estimate; generous, cheap first prestige (Molt) |
| 6 | **Idle vs active tension** | Either alienates skilled players or punishes casual ones | Active strictly stronger (skill ceiling preserved); idle always pays *something*; automation is opt-in and gated to late game when active is mastered |
| 7 | **Endgame content drought** | 1000h promise rings hollow | Omega procedural seasons + leaderboards + infinite ladder externalize goals; bestiary/paragon give optimization runway; weekly mutators |
| 8 | **Onboarding cliff** | First impression buried under systems | First 20 min are *pure TD*; no meta panels shown until run 2+; the core loop must be fun *before* any progression exists |
| 9 | **Tuning infinite systems** | One exponent wrong → trivial or impossible | All tunables centralized in data/config (repo convention); asymptotic formulas; simulation harness for curve validation; live ops rebalance cadence |
| 10 | **Reward fatigue / hollow dopamine** | Constant rewards stop feeling good | Three-speed reward interleave (fast/medium/slow); transformative unlocks *change play*, not just numbers; variable-ratio juice reserved for genuine gains, not noise |
| 11 | **Monetization corrupting design** (if F2P) | Pay-to-win destroys the progression fantasy | Power is *never* time- or cash-gated; monetization (if any) limited to cosmetics, cosmetic seasonal ladders, and convenience that doesn't sell power |
| 12 | **System interdependence fragility** | A balance tweak ripples unpredictably (TD systems are coupled) | Centralized tunables + documented design intent per number (this doc); change-impact noted in DESIGN/BUGFIX logs; simulate before ship |

---

## 16. Appendix

### 16.1 Goal Compliance Checklist

| Brief requirement | Where satisfied |
|---|---|
| 1000+ hours | Phase map §13.1; Omega infinite seasons §12 |
| Dopamine-rich loops | Reward cadence §13.2; three-speed rewards §4 |
| Most systems upgradeable | Towers (3 axes §7), heroes (4 axes §8), Hive Tree §9, gear §10, paragon §12 |
| Infinite where appropriate | Mastery, paragon, endless stages, prestige multipliers, Omega tiers |
| Unlock mechanics, not just numbers | Mechanics-First Rule §4; star/keystone/prestige milestones |
| Extremely high build variety | 12 combinatorial sources §11; synergy matrix §7.3 |
| Remains understandable | §14 in full; progressive disclosure; Power Score; currency ladder |
| 5 towers, pick 3 | §7.1 |
| 1 hero start, slots 2 & 3 via progression | §8 (slot 2 Phase 1, slot 3 @ Speciation) |
| Towers: Genome Samples, 10 stars (abilities), infinite mastery (kills/usage), class levels | §7.2 (three axes) |
| Heroes: unlocked via progression, Hero Essence→stars, mastery, class, weapon/armor/relic | §8.2 (four axes) |
| Runs: temporary cards + mutations, reset, contribute to permanent | §6.3–6.4 (generator model) |
| 5–7 prestige layers, each alters gameplay & progression | §12 (six layers, each a new mechanic) |

### 16.2 Glossary

- **Nucleus** — the objective you defend; loses Integrity when enemies reach it.
- **Biomass** — in-run economy; resets each run.
- **Genome Samples / Hero Essence** — permanent currencies for tower / hero **stars** (1→10).
- **Mastery** — infinite per-unit track from kills/usage; trophy (persists prestige).
- **Class / Class Level** — Combat Class (Kinetic/Caustic/Viral/Neural/Vital); shared by towers & heroes; grants keystones.
- **Reaction** — burst effect from combining two status types (synergy matrix).
- **Gene Card** — temporary drafted run power; resets each run.
- **Mutation Strain** — temporary run-long player evolution.
- **Corruption** — voluntary enemy buff for multiplied rewards (risk/reward).
- **Hive Tree** — global **Neural Fragments**-bought meta tree.
- **Atlas / Codex** — collection of assimilated enemies; completion grants permanent bonuses.
- **Hybrid / Subspecies** — fused two-class tower (post-Speciation).
- **Hive Network** — idle overworld of held nodes (post-Hivemind).
- **Paragon** — infinite respec-able class trees (post-Apex).
- **Prestige** — molt an engine layer for a new currency + new mechanic.

### 16.3 Open Questions / Assumptions (for future sessions)

- **Platform & monetization** unspecified — design assumes premium-or-fair-F2P (no pay-for-power). Revisit if platform dictates otherwise.
- **Tower placement model** (free-place vs node-slot vs lane) — assumed free-place on buildable cells; lock during prototype.
- **Real-time vs wave-pause** drafting — assumed brief between-wave pause for drafts; validate feel in prototype.
- **Exact curve constants** are placeholders pending a simulation harness.
- These belong in `docs/BACKLOG.md` only once they block work — per repo convention, the default is to resolve them when we reach them, not pre-defer.

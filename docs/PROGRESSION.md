# PROGRESSION.md — Permanent Progression Systems (detailed spec)

Companion to `DESIGN.md`. Where the bible says *what* the systems are, this doc
specifies *how they scale* — formulas, costs, rates, pacing, and the exact way
every permanent system plugs into every other.

> **Status:** v0 spec. Every constant here is an **illustrative starting point**
> for the eventual central balance config, not a final value. The *structure*
> (buckets, curve types, interaction rules) is the durable part; the numbers are
> tuning clay. This doc is the source of truth for the *why*.

> **Design oath (anti-inflation):** We reject the "1e300 damage" idle model.
> **Permanent power is deliberately kept inside ~3–4 orders of magnitude and is
> always summarized by a single Power Score.** Infinity lives in *depth* —
> endless waves, Ω-tiers, build combinations, gear rolls — **not** in the size of
> the damage number. Every formula below exists to make growth *feel* large while
> staying *legible*.

---

## Table of Contents

0. [Reading guide](#0-reading-guide)
1. [Foundational math & anti-inflation architecture](#1-foundational-math--anti-inflation-architecture)
2. [Towers](#2-towers)
3. [Heroes](#3-heroes)
4. [Equipment](#4-equipment)
5. [Prestige](#5-prestige)
6. [Master interaction matrix](#6-master-interaction-matrix)
7. [Progression pacing timeline](#7-progression-pacing-timeline)
8. [Infinite replayability without inflation](#8-infinite-replayability-without-inflation)
9. [Open tuning questions](#9-open-tuning-questions)

---

## 0. Reading guide

Every system below is specified against the same five-part template the brief
asked for:

- **Purpose** — what player need it serves.
- **Progression rate** — how fast it advances, in runs/days.
- **Upgrade costs** — the cost curve and its sources.
- **Scaling philosophy** — what curve type and *why* (anti-inflation).
- **Interactions** — how it touches **every** other permanent system.

All systems reference the **bucket model** in §1. Read §1 first; everything else
is an application of it.

---

## 1. Foundational math & anti-inflation architecture

### 1.1 The bucket model (master power equation)

A tower's permanent effective damage is the product of **independent
multiplicative buckets**, each fed by a *different* progression system:

```
EffectiveDPS = BaseDPS
             × S      ← Star bucket        (Genome Samples)
             × M      ← Mastery bucket      (kills/usage, INFINITE)
             × C      ← Class bucket        (Class XP, shared with heroes)
             × H      ← Hive Tree bucket    (Neural Fragments)
             × P      ← Prestige bucket     (Π of all prestige layers, INFINITE via Ω)
             × R      ← Run bucket          (cards/strains/reactions — TEMPORARY)

Heroes add one more permanent bucket:  × E  ← Equipment bucket (gear/relics)
```

**The two rules that make this legible and inflation-proof:**

1. **Within a bucket, contributions are *additive* (and damped).** Stacking the
   same source has diminishing marginal value. You can't tunnel one stat to
   infinity.
2. **Across buckets, contributions are *multiplicative*.** A *new system* is a
   *new bucket* — which is why new progression feels meaningful (it multiplies
   everything) without any single bucket exploding.

The big, exciting **spikes** come from the **R (run) bucket** — cards,
reactions, corruptions — which **resets every run**. This is deliberate: *excitement
is renewable without permanent inflation.* Permanent buckets are the slow, legible
floor; the run bucket is the renewable ceiling.

### 1.2 The five curve types (and where each is used)

| Curve | Shape | Used for | Why |
|---|---|---|---|
| **Additive-damped** | `1 + Σ small steps` | Star bucket, Class bucket | Bounded, legible, milestone-friendly |
| **Logarithmic** | `1 + k·ln(1+x)` | Mastery, prestige global mults | **Infinite but ever-slowing** → never bloats |
| **Square-root** | `B·√(x/S)` | Prestige *currency gain* | Diminishing within a cycle → "when to prestige" decision |
| **Geometric** | `base·r^n` | All **costs** (Genome Samples, Hero Essence, class XP, upgrades) | Each tier meaningfully pricier; paces the climb |
| **Bounded/asymptotic** | hard cap | Gear vertical power | Forces variety to come from *horizontal* (affixes/relics), not stat stacking |

**The principle:** *power* uses additive/log (legible, soft); *cost* uses
geometric (creates the climb); *currency* uses sqrt (creates timing decisions);
*gear* uses hard caps (forces horizontal variety). Inflation is impossible
because the only infinite power curves (log) grow slower than the eye can lose
track of.

### 1.3 What "infinite" actually means here

Three things are genuinely infinite — and **none of them is the damage number**:

- **Mastery** & **Paragon** & **prestige global mults** — infinite but *logarithmic*, so they contribute, e.g., +231% at mastery 1,000 and only +311% at 5,000. They are the gentle forever-hum.
- **Endless wave depth** — a *leaderboard* number, not a power number.
- **Ω-tiers** — each a clean, countable `×1.5` step (Ω20 reads as "Ω20", not "1.5e30").

### 1.4 Power Score

Every account surfaces one **Power Score** = `log₁₀(BaseDPS·S·M·C·H·P·E)` mapped
to a friendly scale. It lets a player compare loadouts and track growth without
ever reading the underlying spreadsheet. A maxed-but-not-Ω account sits around
**Power Score ~340×** base (worked example in §5.3) — three orders of magnitude,
comprehensible.

### 1.5 Baseline run yields (the economy's heartbeat)

All "progression rate" claims assume this **baseline standard run** (~25 min, ~wave 35,
pre-multipliers). Endless depth and prestige multipliers scale these up.

| Resource | Per standard run (baseline) |
|---|---|
| Genome Samples (of a *used* tower) | 10–15 |
| Hero Essence (of a *used* hero) | 1–3 |
| Mastery XP (per used unit) | scales with kills × depth |
| Class XP | scales with class units used |
| Neural Fragments | ~1,000 |
| Gear drops | 1–3 (rarity by depth) |
| Catalysts / dust | ~20 (plus dismantles) |

Assumed cadence: **~4–6 runs/session, 1 session/day** for a typical engaged player.

---

## 2. Towers

5 towers, pick 3 per run (`DESIGN.md §7`). Each advances on three permanent
tracks — **Stars (S)**, **Mastery (M)**, **Class (C)** — that never share a
currency, so all three progress in parallel.

### 2.1 Genome Samples (tower star currency)

- **Purpose.** The deterministic gate on Star progression. Choosing *which*
  tower's Genome Samples to chase is the player's first long-term investment decision.
- **Two Genome Sample types:**
  - **Tower-specific Genome Samples** (e.g., *Needle Spitter Genome Samples*) — the main currency; drop
    when that tower is used and from its codex/boss sources.
  - **Prime Genome** (universal wildcard) — substitutes for any tower's Genome Samples.
    Prevents hard-locking on an unlucky drought (earned ~1 per 4–5 runs + milestones).
- **Sources.** Run rewards (used-tower biased), node Caches, **codex-completion
  bonuses** (Atlas entries pay Genome Samples), prestige rewards, daily/weekly, and
  **salvage conversion** (dismantle duplicate gear → small Genome Sample trickle).
- **Progression rate.** ~10–15 Genome Samples/run for a focused tower → see star
  pacing below.
- **Scaling philosophy.** Income is **deterministic and forecastable** ("~5 runs to
  my next star"), never gacha-random. Respects the bible's "earned and visible"
  rule and lets players *plan* sessions — a key dopamine driver (anticipation).
- **Interactions.** Genome Samples → **Stars** only. Their *sources* tie them to **Codex**
  (completion pays Genome Samples), **Equipment** (dismantles → Scrap → Genome Samples), and
  **Prestige** (multiplies run yield). Genome Samples do **not** scale with mastery or
  class — keeping the three tower tracks independent.

### 2.2 Star progression (1→10)

- **Purpose.** Unlock the tower's **mechanics and build forks** — the *what it can
  do* axis. This is the anti-inflation heart of towers: stars are mostly *behavior*,
  only lightly *stats*.
- **Stat contribution (S bucket, additive-damped):** each star adds **+10% base
  damage**, so `S = 1 + 0.10 × (stars−1)` → **★10 = ×1.9** base. Modest on purpose —
  stars are not where big numbers live; mechanics and other buckets are.
- **Mechanic ladder (generic template, every tower themes it):**

| Star | Role of the unlock |
|---|---|
| ★1 | Tower **unlocks** (becomes playable) |
| ★2 | Quality-of-life / targeting mechanic |
| ★3 | New on-hit behavior |
| ★4 | Economy/resource hook (refunds, biomass) |
| **★5** | **Build fork A/B** (first identity split) |
| ★6 | **Synergy enabler** (lets it trigger Reactions — see matrix) |
| ★7 | New active/triggered ability |
| **★8** | **Build fork A/B** (second identity split) |
| ★9 | Class-defining capstone |
| ★10 | **Signature transformation** (run-defining) |

The two A/B forks (★5, ★8) are **re-selectable per run** (loadout-level, not a
permanent lock) → a single maxed tower has **4 endgame configurations**.

- **Per-tower signature milestones** (condensed; full kits are a future content doc):

| Tower | ★5 fork | ★8 fork | ★10 signature |
|---|---|---|---|
| Needle Spitter (Kinetic) | Penetrate / Execute | Railgun / Autocannon | Singularity Round (re-fires crits) |
| Bone Mortar (Caustic) | Saturation / Heavy Ordnance | Contagion Pools / Concentrated Acid | Marrow Cataclysm (lane-wide corrosion) |
| Parasite Nest (Viral) | Hatchery / Plaguebearer | Apex Strain / Pandemic Strain | Total Infestation (uncapped self-spread) |
| Neural Obelisk (Neural) | Hijack / Terror | Dominator / Suppressor | Hive Override (mass-converts a wave) |
| Flesh Reactor (Vital) | Furnace / Network | Heart / Engine | Apotheosis Bloom (hive-wide overcharge surge) |

- **Upgrade costs (Genome Samples per step):**

| Star | Step cost | Cumulative |
|---|---|---|
| ★2 | 3 | 3 |
| ★3 | 6 | 9 |
| ★4 | 12 | 21 |
| ★5 | 24 | 45 |
| ★6 | 45 | 90 |
| ★7 | 80 | 170 |
| ★8 | 140 | 310 |
| ★9 | 240 | 550 |
| ★10 | 400 | 950 |

  Formula: `cost(N→N+1) ≈ ⌈3 × 1.8^(N−2)⌉`. **~950 Genome Samples to fully max one tower.**

- **Progression rate.** At ~12 Genome Samples/run: ★5 in ~4 runs (≈1 session), ★7 in ~14
  runs (~3 days), ★10 in ~80 runs (**~2 weeks focused**). Full 5-tower roster to
  ★10 ≈ **2–3 months** — and stars are a **trophy that never resets**, so that
  investment is permanent.
- **Scaling philosophy.** Geometric cost + nearly-flat stat gain = the *pull* is
  the next *mechanic*, not the next *number*. ★10 being a 2-week goal makes it a
  satisfying medium-term carrot, not a wall.
- **Interactions.** Stars set the *base* every other bucket multiplies, so a star is
  worth more the more **Mastery/Class/Hive/Prestige/Equipment** you have (they
  compound it). ★6 gates **Reactions** (the synergy matrix) → stars unlock
  cross-**Class** build space. Forks interact with **Cards** (some cards are
  fork-specific). Stars are independent of Genome Sample *rate*, so they never compete with
  **Mastery/Class** for currency.

### 2.3 Tower Mastery (infinite)

- **Purpose.** The **infinite background ramp** and the veteran trophy — proof of
  how much you've *used* a tower. Guarantees every run advances *something* even
  when stars are maxed.
- **Source.** `MasteryXP = Σ kills × tierMult × depthMult + activeSeconds × trickle`.
  Endless depth multiplies kill XP, so mastery *keeps pace with endless scaling*.
- **Level cost (geometric-ish):** `XP(L→L+1) = 50 × L^1.6`. (L10→~2k, L100→~200k.)
  Combined with depth-scaled kill XP, early levels are seconds, deep levels are runs.
- **Power (M bucket, logarithmic — INFINITE):**
  `M = 1 + 0.5 × ln(1 + L/10)`

| Mastery L | M multiplier |
|---|---|
| 10 | ×1.35 |
| 50 | ×1.90 |
| 100 | ×2.20 |
| 500 | ×2.97 |
| 1,000 | ×3.31 |
| 5,000 | ×4.11 |

- **Milestone perks** every **25 levels** (a *mechanic*, not a stat — keeps even the
  infinite track honest to "mechanics-first"), e.g., M25 "ignore 10% armor". **Mastery
  Rank** every 100 (title/border + a stronger perk). Post-Apex, mastery also feeds
  **Paragon** points.
- **Progression rate.** ~L50–80 on a tower within its first week of heavy use; L300+
  is a months-long veteran badge; truly infinite thereafter.
- **Scaling philosophy.** Logarithmic = **infinite progression that never bloats**:
  +231% at L1,000 vs +311% at L5,000. The *fun* of high mastery is the milestone
  perks and the Rank flex, not the slowly-creeping %.
- **Interactions.** Multiplies the **Star** base; **persists through ALL prestige**
  (trophy). **Prestige** multiplies mastery *XP gain* (catch-up), so veterans
  re-ramp fast. Shares its "use the tower" source loop with **Class XP** (co-progress).
  **Hivemind** prestige *resets mastery levels* (not the milestone unlocks) — they
  regrow in days under multipliers, giving that prestige stakes without erasing the
  trophy.

### 2.4 Class levels

- **Purpose.** The **specialization** axis. Each tower belongs to a **Combat Class**
  (Kinetic/Caustic/Viral/Neural/Vital); *any* unit of that class earns its Class XP.
  Specializing a class is rewarded across your whole roster.
- **Source.** Class XP from using any tower **or hero** of that class (the key
  hero↔tower coupling).
- **Level cost (geometric):** `classXP(L→L+1) = 200 × 1.12^L`. Authored range **1→50**;
  **Paragon** makes it infinite post-Apex.
- **Power (C bucket, additive-damped):** `C = 1 + 0.015 × L` → **L50 = ×1.75** for
  *every* unit of that class.
- **Class Keystones** (the real payoff — build-defining, *slotted*, not stacked) at
  **L10/20/30/40/50**. **Keystone slots are limited:** 1 base, +1 @ L25, +1 via Hive
  Tree, +1 @ Speciation → **max ~4 slots** chosen from a large pool ⇒ exclusion, not
  accumulation.
- **Progression rate.** L50 in a class ≈ **3–4 weeks** of favoring it; deliberately
  slower than stars because it buffs the *whole class* (current + all future towers/heroes
  in it). Paragon then runs forever.
- **Scaling philosophy.** Bounded % + slotted keystones = specialization that *changes
  builds* rather than inflating one. Limited slots force the player to *choose an
  identity*, which is what generates build diversity instead of "equip everything."
- **Interactions.** The **shared currency between towers and heroes** — a Kinetic hero
  and Needle Spitter pump the same class. Keystones reshape **Reactions** and synergize with
  **Star forks** and **Relics**. **Speciation prestige resets class levels** (→ Genome
  Threads) and unlocks **Hybrid classes** (fusing two classes), multiplying the class
  space. Independent of Genome Sample/mastery currencies.

### 2.5 Tower scaling formulas (consolidated)

```
Permanent tower power = BaseDPS
  × (1 + 0.10·(stars−1))                 # S  → ★10 = 1.9
  × (1 + 0.5·ln(1 + masteryL/10))        # M  → infinite, log
  × (1 + 0.015·classL)                   # C  → L50 = 1.75
  × HiveTreeMult                          # H  → bounded, resets@Molt, returns w/ mult
  × ∏ prestigeLayerMult                   # P  → infinite via Ω, each log/sqrt
  ( × runBucket during a run )            # R  → temporary spikes
```

### 2.6 Unlock pacing (towers)

- **Onboarding (progressive disclosure):** start with **2 towers unlocked**; the
  other 3 unlock across the first ~hour via early milestones (so the player meets one
  new tower at a time, not five at once). All 5 available by end of Phase 0.
- **Stars:** ★5 of mains within the first session-or-two; ★10 of a favorite ~2 weeks;
  full roster ★10 ~2–3 months.
- **Mastery/Class:** begin immediately, never "finish" — the forever-tracks.

### 2.7 Interactions (summary)

Stars set the base → Mastery, Class, Hive, Prestige, Equipment(via heroes) all
multiply it. ★6 opens Reactions → couples to **other classes**. Class XP is the
bridge to **heroes**. Codex & dismantles feed **star currencies**. Prestige multiplies
star-currency/mastery/Neural-Fragment *income* and (Speciation/Hivemind) resets Class/Mastery
*levels* for new mechanics. (Full pairwise grid in §6.)

---

## 3. Heroes

Heroes mirror towers' three permanent tracks **plus equipment** (§4) — four axes
total. Start with 1 hero; **slot 2** unlocks in Phase 1, **slot 3** at Speciation
prestige (`DESIGN.md §8, §12`).

### 3.1 Unlock progression

- **Purpose.** Heroes are the **active-skill** layer and the headline "transformative
  unlock" — each new hero is a new playstyle, and each new *slot* multiplies active
  complexity.
- **How heroes unlock (visible, earned — never random):** boss first-kills, **codex**
  milestones, **prestige** rewards, **class** milestones, and specific challenges. Every
  hero shows its unlock condition on a roadmap.
- **Progression rate.** ~**1 new hero every 3–5 days** in Phases 1–2, slowing to
  "milestone gifts" later. Launch roster 5, growing post-launch toward ~8–12.
- **Slot pacing.** Slot 1 from start → **Slot 2** ~Phase 1 (Hive Tree Roster branch) →
  **Slot 3** @ Speciation. Going 1→2→3 heroes is a *step-change* in build space, not a
  number bump.
- **Scaling philosophy.** Unlocks are *content gates*, not stat gates — they expand
  *what you can do*. Spacing them out keeps the "next door" always visible (retention).
- **Interactions.** New heroes deepen their **Class** (shared with towers); new slots
  multiply **Equipment** demand (more gear matters) and **Reaction** potential (more
  status appliers on field).

### 3.2 Hero Essence & star progression

- **Purpose.** Same as tower stars — unlock the hero's **kit mechanics** (passives, new
  actives, ultimate upgrades, A/B forks). Heroes are *behavior-rich*, lightly statted.
- **Hero Essence sources.** The unlock grants a starter batch; then runs (used-hero
  biased), boss drops, codex, prestige, and an **Essence shop** (spend surplus universal
  currency). Hero Essence drops **~30% slower** than Genome Samples (heroes are fewer/stronger).
- **Star stat contribution:** `+8% per star` → **★10 = ×1.72** (lighter than towers;
  hero power leans on *kit + equipment*, not base stats).
- **Cost curve:** identical step table to towers (§2.2). With slower Hero Essence income,
  hero ★10 ≈ **3–4 weeks** of favoring that hero.
- **Scaling philosophy.** Mechanics-first again; the A/B forks at ★5/★8 give each hero
  ~4 endgame kits, re-selectable per run.
- **Interactions.** Hero stars set the hero's base that **Hero Mastery / Class /
  Prestige / Equipment** multiply. Some star forks are **gear- or relic-synergistic**
  (e.g., a fork that scales with weapon attack speed). Hero Essence sources tie to **Codex**
  and **Prestige**.

### 3.3 Hero mastery (infinite)

- Identical model to **tower mastery** (§2.3): log curve `M = 1 + 0.5·ln(1+L/10)`,
  XP `50·L^1.6`, perks every 25, Ranks every 100, infinite, **persists prestige**
  (reset only at Hivemind, regrows fast).
- **Purpose/rate/scaling:** the hero's forever-hum; ~L50–80 in a week of main-hero
  use; the same legible log ceiling.
- **Interactions.** Multiplies hero base; feeds **Paragon** post-Apex; **Prestige**
  boosts its XP gain; co-progresses with **Class** via the shared "use the hero" loop.

### 3.4 Hero class levels

- Heroes use the **same Combat Classes** as towers and **share the Class XP pool** —
  the single most important cross-system coupling: investing in Kinetic helps your
  Kinetic hero *and* Needle Spitter *and* future Kinetic units.
- Class coverage is intentionally asymmetric at launch: **every class has a tower**,
  but only Kinetic/Neural/Vital have a launch **hero** (Ravager/Overseer/Shepherd) —
  giving players a reason to chase future **Caustic** & **Viral** heroes.
- Curve, keystones, slots: identical to §2.4. Keystones buff **both** towers and heroes
  of the class.
- **Interactions.** This is the hero↔tower bridge; resets/extends with **Speciation**
  (Hybrid classes) and **Apex** (Paragon). Keystones interact with **Relics** and
  **Star forks** to define a build's spine.

### 3.5 Hero scaling formulas

```
Permanent hero power = BaseHero
  × (1 + 0.08·(stars−1))                 # ★10 = 1.72
  × (1 + 0.5·ln(1 + masteryL/10))        # infinite log
  × (1 + 0.015·classL)                   # L50 = 1.75 (shared pool)
  × EquipmentMult (E)                     # §4 — heroes only
  × HiveTreeMult × ∏ prestigeMult         # H, P
  ( × runBucket )                         # R
```

### 3.6 Interactions (summary)

Heroes are the **convergence point**: they share **Class XP** with towers, are the
**only** carrier of the **Equipment** bucket, multiply **Reaction** density on the
field, and gate behind **Codex/Prestige/Boss** unlocks. Slots 2–3 (from **Hive
Tree** and **Speciation**) scale every hero subsystem at once. (Grid in §6.)

---

## 4. Equipment

Equipment is the **hero-only horizontal build lever** (the **E** bucket). Three
slots per hero: **Weapon, Armor, Relic**. With up to 3 heroes that's up to **9
equipped pieces** in a loadout.

> **Anti-inflation stance for gear:** gear's *vertical* power is **hard-capped**;
> its value is **horizontal** — *which* affixes, *which* relics, *which* sets. This
> is what makes gear an engine of **build variety and infinite optional optimization**
> (chasing perfect rolls) rather than a stat-inflation treadmill.

### 4.0 Gear currencies & rarity

- **Rarities:** Common (1 affix) → Rare (2) → Epic (3) → Mythic (4) → **Exotic** (5 +
  one *unique* affix). Drop rarity is weighted by **run depth**.
- **Currencies:** **Catalysts** (upgrade item level), **Mutagen** (reroll affixes),
  **Scrap** (from dismantles → feeds Catalysts and a trickle of Genome Samples).
- **Drop rate.** 1–3 items/run → gear is a **fast/frequent** reward track (the
  every-run dopamine), while *perfecting* gear is a long sink.

### 4.1 Weapons

- **Purpose.** The hero's **offense profile** — and usually an attack *behavior*
  (chain, pierce, multi-shot), so weapons change *how* a hero fights, not just damage.
- **Progression rate.** New weapon most sessions; a *best-in-slot with good rolls* is a
  multi-week chase.
- **Costs.** Upgrade 0→+20 with Catalysts (geometric: `cat(n)=10·1.25^n`). Reroll
  affixes with Mutagen (flat-ish, repeatable → the optimization sink).
- **Scaling philosophy.** Base damage scales with rarity (bounded steps), upgrade adds
  `+5%/level` to **+100% at +20** (hard cap). Belongs to **weapon sets** (§4.5).
- **Interactions.** Multiplies hero base (E bucket); behaviors interact with **Reactions**
  (e.g., a piercing weapon spreads status to more enemies → more reactions); some
  **Star forks** scale off weapon stats.

### 4.2 Armor

- **Purpose.** Survivability **and team utility** — most armor carries an **aura** that
  buffs nearby towers or the Nucleus, so armor ties heroes to the **tower** layer.
- **Progression rate / costs.** Same drop/upgrade/reroll economy as weapons.
- **Scaling philosophy.** Bounded defensive stats; the *interesting* power is the **aura
  affix** (e.g., "+12% damage to towers in radius"), which makes hero *positioning*
  matter. Belongs to **armor sets**.
- **Interactions.** Auras multiply **tower** buckets in-radius → armor is a hero item
  that scales *towers* (a key cross-layer link). Sets combine across heroes (§4.5).

### 4.3 Relics

- **Purpose.** The **spice slot** — unique, build-defining artifacts (roguelite-style
  passives). Not a set; you **collect a library** and choose which to equip.
- **Progression rate.** Relics are *rare, earned* drops/unlocks (bosses, codex,
  prestige) → each new relic is a mini "transformative" unlock. ~1 every few days early.
- **Costs.** No item-level grind; instead **Attune** a relic (level it with
  relic-specific *Resonance*) to deepen its effect. Bounded attunement tiers.
- **Scaling philosophy.** Relics provide **conditional, mechanic-altering** effects
  ("reactions deal +100% but you cannot crit"; "every 5th hero ability is free and
  doubled") — *trade-offs and rule-bends*, not flat stats. This is where the wildest
  builds are born.
- **Interactions.** Relics hook into **everything**: amplify **Reactions** (Class
  matrix), scale with **Mastery** or **Class** thresholds, enable **Star fork**
  combos, and some only "come online" under specific **Prestige** mechanics (e.g., a
  relic that scales with Hive Network nodes). Relics are the primary **build-diversity
  multiplier** for heroes.

### 4.4 Sets (weapons + armor)

- **2 / 4 / 6-piece** bonuses, counted across all equipped weapons+armor (up to 6
  set-eligible slots over 3 heroes). Encourages **thematic loadouts** (e.g., a 6-piece
  "Predator" build) and trades raw flexibility for a powerful identity → another
  build-diversity axis with built-in opportunity cost.

### 4.5 Upgrade / affix / ascension math

```
ItemPower   = rarityBase × (1 + 0.05·upgradeLevel)      # +20 cap → ×2.0  (HARD CAP)
AffixValue  = roll within [min,max] per affix tier       # bounded; reroll to chase
E (bucket)  = ∏(equipped item multipliers) × setBonus × relicEffects
Ascension   = post-Apex: unlock +21..+30 and a 6th "ascended" affix (cap raised, not removed)
```

- **Affix perfection** is the **infinite *optional* optimization**: rolls are bounded,
  but a *perfect* set of rolls is astronomically rare → endless theorycraft chase that
  **adds no inflation** (the ceiling is fixed; you're climbing toward it, never past it…
  until Ascension nudges the cap).

### 4.6 Scaling philosophy (why gear can't inflate)

Vertical power is capped (+20, then +30 via Ascension). All *growth beyond the cap*
is **horizontal**: more relic combos, more set choices, better affix rolls. Gear thus
delivers **maximum build variety per unit of power** — the exact opposite of stat
inflation.

### 4.7 Interactions (summary)

Gear is **heroes-only** but reaches the **whole board**: armor auras scale **towers**;
weapon behaviors and relics amplify **Reactions** (Class matrix); relics gate off
**Mastery/Class/Prestige** states; dismantles feed **star currencies** (towers/heroes); affix
rerolls are the late-game **Mutagen** sink; Ascension is a **Prestige (Apex)** payoff.
(Grid in §6.)

---

## 5. Prestige

Six nested layers (`DESIGN.md §12`). Here: the **quantitative** design — currency
generation, multipliers, costs, pacing, retention, interactions. **Trophies
(stars, codex, gear, mastery *milestones*) never reset; only engines do.**

### 5.1 Generic currency-generation model

Every layer mints its currency on reset via the same **square-root** template
(diminishing-within-cycle → "when do I prestige?" becomes a real decision):

```
CurrencyGained = ⌊ B_layer × √( CycleMetric / S_layer ) ⌋
```

And every layer's currency provides a **logarithmic global multiplier** (infinite,
legible) plus a **spendable tree**:

```
GlobalMult_layer = 1 + c_layer × √(LifetimeCurrency_layer)      # or ·ln for the deepest
```

Square-root **gain** + (square-root/log) **multiplier** = currency that's exciting to
earn, never explosive to hold.

### 5.2 The six layers

#### Layer 1 — MOLT
- **Purpose.** Teach the prestige fantasy cheaply; convert early-game mastery into
  permanent speed. The "first ascension" rush.
- **Resets.** Hive Tree (Neural Fragments) + in-run economy upgrades. **Keeps everything else.**
- **Currency — Ascendant Cells:** `⌊1.5 × √(NeuralFragmentsThisCycle / 100)⌋`.
  (10k essence → 15 cells; 50k → 33.)
- **Multiplier.** `1 + 0.10 × √(LifetimeCells)` (100 lifetime cells → ×2.0) + the
  **Ascendant Tree** (cells buy nodes: Genome Sample gain, Neural Fragment gain, mechanic unlocks).
- **New mechanic.** Adaptive Mutation slots (per-tower random run buff).
- **Pacing.** First Molt ~**8–15h**; then every **1–3h** as you blast through; **dozens**
  of Molts in week 1.
- **Costs.** Ascendant Tree nodes priced geometrically in cells.
- **Retention loop.** "Re-climb the Hive Tree in minutes instead of hours, then push a
  little further" — the canonical incremental dopamine.
- **Interactions.** Multiplies **Neural Fragment / star-currency** income → speeds **Stars**; cells fund
  nodes that touch every bucket; sets the template all deeper layers extend.

#### Layer 2 — SPECIATION
- **Purpose.** Open the **build-space explosion** (class fusion) once base classes feel
  explored.
- **Resets.** **Class levels** + Ascendant Tree. Keeps stars/mastery/codex/gear.
- **Currency — Splice Threads:** `⌊1.2 × √(LifetimeCells_thisCycle / 50)⌋`.
- **Multiplier.** `1 + 0.08 × √(LifetimeThreads)` + the **Speciation Web**.
- **New mechanic.** **Hybrid Towers** (fuse 2 classes), **Phenotypes**, **+1 keystone
  slot**, and **unlocks Hero Slot 3**.
- **Pacing.** Every **few days**; deep resets ~weekly.
- **Retention loop.** "I can fuse Caustic+Viral into Pestilence" — a *new toy*, not a bigger
  number; re-leveling classes under the new multiplier is fast.
- **Interactions.** Resets **Class** (towers+heroes) for a mechanic gain; Hybrids
  multiply the **Reaction** matrix and **Star/Relic** combo space; Hero Slot 3 scales
  the entire **hero+equipment** layer.

#### Layer 3 — HIVEMIND
- **Purpose.** Add the **idle/empire dimension** after active play is mastered.
- **Resets.** Speciation Web + **Mastery levels** (milestone unlocks kept). Keeps
  stars/codex/gear/hybrids.
- **Currency — Synaptic Cores:** `⌊1.0 × √(CycleProduction / 1,000)⌋`, **plus passive
  Core generation** from held **Hive Network** nodes (the idle tap).
- **Multiplier.** `1 + 0.07 × √(LifetimeCores)` + the Network's node bonuses.
- **New mechanic.** **Hive Network** (idle overworld of conquered nodes) + **multi-lane**
  stages.
- **Pacing.** ~**weekly** active resets; idle accrues continuously between sessions.
- **Retention loop.** Two hooks at once: "my empire grew while I was away" (idle/return)
  **and** "an active run conquers nodes faster" (skill still wins).
- **Interactions.** Mastery reset (fast regrow under multipliers) for an idle engine;
  Network nodes can buff specific **Classes/towers**; multi-lane multiplies **Reaction**
  and **hero-positioning** value; idle Cores feed deeper prestige.

#### Layer 4 — APEX PREDATOR
- **Purpose.** Endgame **optimization + self-imposed challenge** for theorycrafters.
- **Resets.** Hive Network + all shallower trees. Keeps the trophy spine + hybrids.
- **Currency — Apex Genes:** **scales with voluntary corruption depth cleared** —
  `⌊0.5 × corruptionTier^1.5 × √(CycleProduction / 1,000)⌋`. (The risk/reward ladder
  *is* the currency faucet.)
- **Multiplier.** `1 + 0.06 × √(LifetimeGenes)` + Apex nodes.
- **New mechanics.** **Corruption Tiers** (core axis), **Paragon** (infinite respec-able
  class trees), **Bestiary-as-Arsenal** (deploy assimilated enemies), **Gear Ascension**
  (+21..+30).
- **Pacing.** Resets every **1–2 weeks**; corruption-depth pushing is the weekly chase.
- **Retention loop.** "How deep can I corrupt and still clear?" — an *infinite skill*
  ladder that pays prestige currency.
- **Interactions.** Ties **corruption (run risk)** → **currency**; **Paragon** makes
  **Class** infinite; **Bestiary** turns **Codex** into combat power; **Ascension**
  raises the **Equipment** cap. Touches nearly every system.

#### Layer 5 — SINGULARITY
- **Purpose.** Let the 1000h veteran **author the ruleset** and choose how hands-on to be.
- **Resets.** Nearly all engines below (trophy spine kept; everything regrows *very* fast).
- **Currency — Singularity Shards:** `⌊1.0 × √(LifetimeGenes_thisCycle / 5,000)⌋`.
- **Multiplier.** `1 + 0.05 × ln(1 + LifetimeShards)` (switches to **log** at this depth
  to stay legible).
- **New mechanics.** **Run Automation** (full idle option; active still strictly
  stronger), **Meta-Laws** (permanent rule alterations), **Pantheon** (slot global buffs).
- **Pacing.** ~**monthly** resets.
- **Retention loop.** "Design my own game variant via Meta-Laws," plus automation that
  keeps progress flowing during low-engagement weeks (lapsed-player insurance).
- **Interactions.** Automation can run *any* lower system idle; Meta-Laws rewrite
  **Reaction/economy/lane** rules globally; Pantheon buffs cross every bucket.

#### Layer 6 — OMEGA HIVE *(infinitely repeatable)*
- **Purpose.** Convert finite authored content into **infinite procedural content** —
  the honest backing for a "truly endless" promise.
- **Resets.** **Everything**, including Singularity (trophy + cosmetic/season records kept).
- **Currency — Omega Strain → Ω-tiers:** you ascend **Ω(n)→Ω(n+1)** when *total lifetime
  production* crosses a threshold that grows **×10 per tier** (geometric gate → each Ω is
  a real milestone). Infinite tiers.
- **Multiplier.** Each Ω-tier = clean **×1.5 global** (Ω20 ≈ ×3,325 — *read as "Ω20"*).
- **New mechanic.** **Procedural Seasons** (each Ω cycle generates new modifiers, biomes,
  and a **challenge ladder**) + **leaderboards**.
- **Pacing.** Early Ω-tiers weekly; deep Ω-tiers are seasonal (weeks–months each).
- **Retention loop.** Seasonal/competitive: "new season, new procedural ruleset, new
  ladder rank" — *externally refreshed* goals, the only durable 1000h+ engine.
- **Interactions.** Resets all to a clean slate that the **trophy spine** (stars/codex/
  gear/mastery-milestones) re-accelerates; Ω-mult is the one truly infinite *power* knob,
  kept countable on purpose.

### 5.3 Cross-layer scaling & total permanent budget

Worked example — a **deep but pre-Omega** account, showing power stays legible:

| Bucket | State | Multiplier |
|---|---|---|
| S (stars) | ★10 | ×1.9 |
| M (mastery) | L300 | ×2.72 |
| C (class) | L50 | ×1.75 |
| H (Hive/Ascendant) | fully bought cycle | ×3.0 |
| P (Molt+Spec+Hivemind+Apex) | deep | ×12 |
| **Permanent total** | | **≈ ×340** |

Add Equipment (heroes) ~×2–3 and the **temporary** run bucket ~×5–50 (cards/
reactions/corruptions) and a spike sits around **×1,700–17,000** over base — **four
orders of magnitude at the absolute peak**, fully summarized by Power Score, with
enemy HP in endless scaling to match. Omega then adds clean ×1.5 steps on top. **No
number ever leaves human-comprehensible range.**

---

## 6. Master interaction matrix

### 6.1 Bucket view (where each system plugs into power)

| System | Bucket it feeds | Multiplies what | Resets on |
|---|---|---|---|
| Genome Samples → Stars | **S** | own tower base | never (trophy) |
| Tower Mastery | **M** | own tower | Hivemind (levels only) |
| Class levels | **C** | all towers **+ heroes** of class | Speciation |
| Hero Essence → Stars | **S(hero)** | own hero | never (trophy) |
| Hero Mastery | **M(hero)** | own hero | Hivemind (levels only) |
| Equipment (W/A/R) | **E** | own hero (**armor auras → towers**) | never (trophy); cap raised @ Apex |
| Hive Tree | **H** | global | Molt |
| Codex/Collection | star currencies + flat bonuses + **Bestiary units** | global / vs-type | never (trophy) |
| Prestige (each layer) | **P** | global income + new mechanics | nests downward |

### 6.2 Key cross-system couplings (the ones that matter most)

- **Class XP is the hero↔tower bridge** — the single shared currency across the two
  unit types; specializing a class compounds both.
- **Armor auras + Relics are the hero→tower bridge** — hero gear that scales the board.
- **★6 + Class matrix = Reactions** — stars and classes jointly unlock the synergy
  engine that drives build variety.
- **Corruption (run) → Apex Genes (prestige)** — run-time risk converts directly into
  permanent currency.
- **Codex → star currencies, and (Apex) Codex → units** — collection feeds both progression and
  combat.
- **Prestige multiplies *income*, not just power** — so it accelerates Stars/Mastery/
  Class/Gear acquisition, which is why post-prestige re-climbs feel fast (anti-grind).
- **Trophies persist; engines reset** — Stars, Codex, Gear, and Mastery *milestones*
  survive every prestige; Class/Mastery *levels* and the trees are the renewable fuel.

---

## 7. Progression pacing timeline

| Phase | Hours | Permanent milestones reached | Active forever-tracks |
|---|---|---|---|
| 0 Onboarding | 0–2 | all 5 towers unlocked; first stars; hero 1 | Mastery, Class begin |
| 1 Foundation | 2–15 | mains ★5; **Hero Slot 2**; first **Molt** | Mastery L~50; Class climbing |
| 2 Specialization | 15–80 | favorite ★10; gear sets; **Speciation** (hybrids, **Slot 3**) | Class L~50; Mastery L~100 |
| 3 Expansion | 80–250 | roster ★10; **Hivemind** idle network | Mastery resets→regrow; Cores idle |
| 4 Mastery | 250–600 | **Apex**: Paragon, corruption ladder, bestiary, Ascension | Paragon infinite; Mastery L300+ |
| 5 Transcendence | 600–1000 | **Singularity**: automation, meta-laws, pantheon | all engines hyper-fast |
| 6 Endless | 1000+ | **Omega** Ω-tiers, seasons, leaderboards | infinite depth + Ω ladder |

**Reward cadence (unchanged from bible):** something every 30–90s; a medium unlock
every session; a transformative unlock every few sessions. The pacing guarantee:
**5–8 tracks always in flight, so no all-track stall is ever possible.**

---

## 8. Infinite replayability without inflation

How the design delivers "1000+ hours, infinitely replayable" while the damage
number stays readable:

1. **Variety is combinatorial, power is bounded.** Builds multiply (towers ×
   forks × classes × hybrids × heroes × gear × relics × cards × corruptions ×
   biomes); permanent power stays in ~3–4 orders of magnitude (§5.3).
2. **Excitement is renewable, not cumulative.** The biggest spikes live in the
   **temporary run bucket** (cards/reactions/corruptions) that resets every run —
   so the thrill returns each run without permanent inflation.
3. **Infinity is put where it's legible.** Mastery/Paragon/prestige mults are
   *logarithmic*; Ω-tiers are *countable*; endless depth is a *leaderboard*, not a
   stat. None of these bloat the damage number.
4. **Procedural seasons (Omega) outlast authored content.** When everything
   designed is consumed, the game *generates* new modifiers, biomes, and ladders —
   the only honest infinite-content engine.
5. **Optional perfection chases** (gear affix rolls, corruption depth, Ω-ladder,
   leaderboards) give self-directed goals with bounded power but unbounded skill
   expression.

The throughline: **meaningful progression = new buckets and new mechanics; shallow
inflation = stacking one bucket.** This spec is built to make the former easy and
the latter structurally impossible.

---

## 9. Open tuning questions

To resolve with a simulation harness during prototyping (not pre-deferred — these
are resolved when implementation reaches them, per repo convention):

- **Curve constants** (the `k`, `c`, `r`, exponents) need sim validation against the
  target pacing in §7 — especially that no permanent bucket runs away when stacked.
- **Genome Sample income vs. star cost** balance — confirm the "★10 in ~2 weeks focused"
  target holds across roster size growth.
- **Prestige reset-timing sweet spots** — verify the sqrt currency exponents create a
  *real* "prestige now vs. later" decision rather than an obvious always-answer.
- **Idle (Hivemind/Singularity) vs. active ratio** — tune so idle is meaningful but
  active stays strictly, satisfyingly stronger (pillar #5).
- **Equipment cap (+20/+30) vs. affix variance** — ensure horizontal variety
  out-values vertical grind so gear never becomes a stat treadmill.

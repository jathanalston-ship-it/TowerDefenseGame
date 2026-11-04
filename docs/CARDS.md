# CARDS.md — Roguelite Card Drafting (canonical spec)

The in-run roguelite layer. Companion to `DESIGN.md §6.3`, `TOWERS.md`,
`HEROES.md`, `ECONOMY.md`. **Cards are temporary (reset every run) and are the
primary source of run-to-run build diversity.** The *pool* you draw from is
permanent (shaped by **Mutation Fragments**, `ECONOMY.md`); the *draw* is per-run.

> **Core split:** the drafted **deck is temporary** (volatile run identity); what's
> **permanent** is which cards are *unlocked into your pool*, their *weights*, and
> your *draft upgrades* — all bought with **Mutation Fragments**. This keeps runs
> wild and experimental without inflating permanent power (`PROGRESSION.md §1`).
>
> **Shipped permanence — Gene Evolution (`GENE-EVOLUTION.md`).** Every card is now ALSO a
> permanent collectible: drafting it once adds it to the **Gene Archive**, where **Gene
> Essence** buys 3–5 permanent upgrade levels per card (campaign-gated globally at Stages
> 15/30/50/75). A card's levels apply **every time it is drafted** (and via **Starting Gene
> Loadouts**, up to five cards auto-activate at run start). The DRAFT stays the temporary,
> run-shaping act this doc describes; the permanent layer lives entirely in the Archive and
> is Power-Score-counted there.

> **Implementation status (this build).** The **framework is built to scale**; the catalog is
> seeded small on purpose (room to add systems early without re-balancing 150+ cards):
> - **Rarities (4):** common / rare / epic / legendary, with **data-driven draw weights**
>   (`CARD_RARITY_DEFS`, no hardcoded probabilities) and **depth scaling** (`weightPerWave` →
>   deep runs grow Epic/Legendary-rich). `rollCardRarity` walks the weighted pool (`core/cards.ts`).
> - **Categories (9):** a first-class `CardCategory` tag (`poison/summons/economy/crit/aoe/
>   control/hero/tower/mutation`) drives UI grouping today; the §2–4 per-category weighting/
>   synergy meta keys off it.
> - **Subject — "what it AFFECTS" (`CardSubject`):** a *separate* axis from the synergy category,
>   shown as the draft badge so a card's target reads at a glance: a **specific tower** (icon +
>   that tower's color + name, pulled from `TOWER_DEFS`), **HERO**, **GLOBAL** (army-wide),
>   **ECONOMY** (biomass), or **HIVE** (the Nucleus + build slots). It is **derived from the card's
>   effects** (`cardSubject` in `core/cards.ts`, via a single `FIELD_SUBJECT` map) — *not* authored
>   per card — so the badge can never drift from behaviour and a new card auto-classifies. One
>   distinct non-global subject ⇒ that subject; none or several ⇒ GLOBAL (e.g. "Sharpened Needles"
>   = +12% *all*-tower damage ⇒ GLOBAL, not Needle). **Future-proof:** a new tower just maps its
>   tower-specific `RunModifiers` fields in `FIELD_SUBJECT`; its color/name/icon come from
>   `TOWER_DEFS` with no UI change. `cards.test.ts` pins every card's derived subject.
> - **Effect vocabulary:** the declarative `CardEffect` (`mul/add/flag/set` + instant
>   `biomass/integrity/heroHp`) now also covers the behavioral **verbs** `grant`/`hook` for
>   cards — a drafted card can add a projectile mutator or a battlefield rule mid-run, sharing
>   equipment's live arrays. New content is a data row, no code.
> - **Catalog:** **53 cards** ship now, spanning all four rarities + the expansion-tower identities
>   (§5 lists the full ~200-card design target). **Every shipped card carries 3–5 permanent upgrade
>   levels** (`geneUpgrades.ts`; docs/GENE-EVOLUTION.md) — enforced by `cardProblems`, so no card
>   bypasses the upgrade system. Newest: **Carrion Bloom** (Epic · Economy) — *the swarm's death
>   feeds the hive*: +20% biomass and +2 biomass per kill, evolving to shed even more and to regrow
>   the Nucleus each wave (only the 2nd card to use the on-event behavioral-hook verbs). Golden
>   outcomes were re-pinned deliberately (the draft pool grew).
> - **Seams left open (designed, not yet built):** per-card weights, **pity timers**, **pool
>   unlocks** via Mutation Fragments (§3), Gene Lab floors, reroll/banish, and the category-wide
>   *multiplier* engine (waits on the systems some categories reference — crits, summons, strains).

---

## 1. Draft mechanics

- **Draft cadence — mode-dependent.** You draft **1 of 3** cards (and at **Gene
  Lab** route nodes). *When* a draft is offered depends on the run mode:
  - **Campaign (stage): every wave.** All 12 authored waves grant a draft —
    campaign is deliberately **generous** (the power-fantasy on-ramp), so a
    full clear yields ~12 cards plus any Gene Lab nodes.
  - **Infinite (endless): a widening drip.** Cards become **progressively less
    frequent** with depth so they stay *exciting* instead of *expected*, and so
    deep runs lean on **permanent progression** (tower upgrades, hero equipment,
    Mastery, Stars, prestige) rather than endless Gene Card stacking. The gap
    between drafts grows in 5-wave bands, capped at 5:

    | Depth | Cadence | Gap (waves between cards) |
    |---|---|---|
    | 1–5 | every wave | 1 |
    | 6–10 | every 2 waves | 2 |
    | 11–15 | every 3 waves | 3 |
    | 16–20 | every 4 waves | 4 |
    | 21+ | every 5 waves (cap) | 5 |

    Formally `interval(depth) = min(5, ceil(depth / 5))`. The implementation
    counts **waves since the last draft** and offers a card once that reaches
    the current depth's `interval` (a counter, not `depth % interval`), so the
    gap never momentarily *shrinks* at a band boundary — it only ever widens.
    Concretely, drafts land on depths **1·2·3·4·5·7·9·12·15·19·24·29·34…**
    (gaps `1·1·1·1·2·2·3·3·4·5·5·5…`). The exact curve is a balance tunable.
  - Over a ~35-wave run that's ~12–35 cards depending on mode — your temporary build.
- **Draft relevance (§draft relevance).** Every draft reads the **live board**: tower-subject
  cards are offered **only for kinds with a tower currently placed** (`game.fieldedKinds()` →
  `draftCards`' `allowedTowers`), so a card for an organism you aren't running is never a dead
  pick. Global / economy / hive / hero cards are unaffected and backfill the 3 choices when the
  board is thin (an empty board still fills the draft). The pool re-widens the moment a new kind
  is placed — each draft reflects the army as built. Deliberate sim change (2026-07): the golden
  seeds were re-pinned (wave/kills/won identical; only drafted-buff-dependent integrity/biomass
  moved), and pre-change replay codes skew at their first draft.
- **Reroll** — reroll the 3 options (limited charges; +charges from economy cards /
  Hive Tree / Mutation Fragments).
- **Banish** — remove a card from the pool *for this run* (thin your deck toward a
  plan). Charges from progression.
- **Gene Lab nodes** — bonus draft with a guaranteed rarity floor.
- **Auto Gene Selection** (opt-in Settings toggle, persisted via `state/prefs.ts`).
  When on, each draft shows a visible 10s countdown and auto-drafts the recommended
  **◆ PICK** (highest-rarity) card on expiry. Any manual pick (click / `1`–`N` / `Enter`)
  cancels the countdown immediately. UI-only — the deterministic sim is untouched.
- **Reset.** The deck, rerolls, banishes, and any run-stack effects **wipe at run
  end**. Only the *outcomes* (currencies, mastery, codex) persist.
- **Reroll (§reroll).** Every draft carries ONE paid re-deal: `game.rerollDraft()` swaps the
  open 3 for a fresh roll from the same live-board pool at `DRAFT_REROLL.base + perWave·wave`
  Biomass (config.ts). Never in the tutorial, never twice; the modal button hides once used
  (`HudSnapshot.draftRerollCost = -1`). Golden-safe: the extra rng draw exists only when a
  player invokes it — autoplay never rerolls.

---

## 2. Rarity system & weighting

Four rarities, escalating from *simple stat* → *rule-bending*:

| Rarity | Design role | Base draw weight (early) |
|---|---|---|
| **Common** | one clean effect; the build's mortar | 64% |
| **Rare** | stronger / two-part; first synergy hooks | 28% |
| **Epic** | build-shaping; category payoffs | 7% |
| **Legendary** | build-defining / rule-bending (relic-lite, temporary) | 1% |

**Weighting shifts (so late runs feel richer, not same-y):**
- **Run depth** — each wave nudges odds toward higher rarity (≈ +0.4% Epic, +0.1%
  Legendary per wave); deep endless runs are Legendary-rich.
- **Mutation Fragments (permanent)** — buy global **rarity-weight** upgrades and
  per-card **weight** boosts (make a beloved card appear more).
- **In-run luck** — cards/relics/corruptions that raise rarity odds (a draftable axis).
- **Pity timers** — guaranteed Epic+ every N picks without one; a Legendary pity over
  a run so a build-around eventually shows.
- **Gene Lab / boss picks** — guaranteed rarity floors at key nodes.

**No purchase of power.** Rarity is earned via play/depth/Mutation Fragments — never
bought with money (pillar: power is never sold).

---

## 3. Progression interactions

How the permanent game shapes the temporary draft (all via **Mutation Fragments**
unless noted):

- **Pool unlocks** — you start with a *subset* of cards; spend Mutation Fragments to
  **unlock more cards into the pool** (progressive disclosure → the draft deepens for
  months without overwhelming new players).
- **Card weights** — raise a specific card's draw weight (steer toward your style).
- **Draft upgrades** — buy permanent **+reroll**, **+banish**, **draft 1-of-4**, and a
  rare **second pick** node.
- **Card Mastery** — drafting/using a card earns it Mastery; at thresholds its base
  effect ticks up *and* a cosmetic foil unlocks (infinite, gentle — `PROGRESSION §1`).
- **Cross-system hooks** — cards reference everything: **classes/statuses** (Fracture/
  Corrosion/Infection/Disruption/Mark), **reactions** (Shred/Plague/Mind Rot/…),
  **towers** (per-tower forks), **heroes** (abilities), and **economy** (biomass).
- **Mutation Strains** — Mutation Fragments also unlock run-long **Strains** (the
  slower macro-draft, `DESIGN §6.4`); the **Mutation Synergy** card category amplifies
  them and reactions.
- **Corruptions** — risk/reward enemy buffs improve card rarity weighting in-run.

### 3.gates — Progression-gated cards (shipped)

A card may carry an optional **`unlock`** — a `CardUnlock` condition the meta layer evaluates
(`cardUnlocked` → `meta.unlockedCardIds()`), so the card enters the draft pool **only once the
account clears its milestone**. The earned ids are threaded into the run
(`RunOptions.unlockedCardIds`) and `draftCards` filters on them before rarity weighting, so
gating is pure data — it scales with the pool and never branches per-card. **A fresh account
earns none**, so headless/autoplay draws the ungated baseline (golden-safe). The `CardUnlock`
axes are `campaignStage` / `bestWave` / `towerUnlocked` (campaign depth, run depth, tower
ownership — the Coil and campaign-gated pools) plus the lifetime axes `totalRuns` /
`lifetimeKills` / `bossesSlain` / `totalBiomass`.

Five **behavioral** gated cards each open a NEW sim behavior (a live-knob hook, not just
numbers) and gate on their OWN distinct lifetime axis — the account earns them by playing
different ways:

| Card | Effect | Unlock (axis) |
|---|---|---|
| **Regenerative Carapace** | +30 Integrity each cleared wave | Finish 5 runs (`totalRuns`) |
| **Ambush Enzyme** | +45% damage vs full-health enemies | Reach wave 8 (`bestWave`) |
| **Culling Instinct** | Execute non-boss enemies < 10% HP | 1,000 lifetime kills (`lifetimeKills`) |
| **Viral Payload** | Kills spread 2 Fracture nearby | Slay 3 bosses (`bossesSlain`) |
| **Toxic Aura** | Hero radiates Corrosion (SHRED synergy) | Harvest 50,000 biomass (`totalBiomass`) |

They're **rare-tier** (the "unique" property is the *gate*, not a new rarity — epic/legendary
already exist here) and each carries a full 4-level permanent upgrade ladder like every card.

A second **Expansion II** gated pool opens design axes no prior card used — each rides an
already-wired, Power-scored `RunModifiers` field, so it needed zero new sim code, and each gates
on its own distinct axis:

| Card | Effect | Fresh axis | Unlock (axis) |
|---|---|---|---|
| **Predator Instinct** (epic) | +25% crit chance, +60% crit dmg, +10% hero dmg | hero crit | Reach wave 18 (`bestWave`) |
| **Entrenchment** (rare) | +6% tower dmg per EMPTY build slot, +5% tower dmg | per-empty-slot | Clear stage 22 (`campaignStage`) |
| **Vanguard Doctrine** (epic) | +class-resonance, +per-distinct-class, +6% tower dmg | composition | Slay 4 bosses (`bossesSlain`) |
| **Second Wind** (rare) | +90 hero HP, 12% damage reduction, +25% healing | hero mitigation | 2,000 lifetime kills (`lifetimeKills`) |
| **Salvage Enzymes** (rare) | tower sell refunds +10%, +15% biomass | salvage economy | Finish 15 runs (`totalRuns`) |

The **Expansion III** pool (10) pairs the Spire/Polyp signature sets with six more distinct-value
gates — every unlock VALUE is one no prior card used, so each is earned at a different moment of
an account's life:

| Card | Effect | Unlock |
|---|---|---|
| **Surplus Synapse** (rare) | +1 Spire arc hop | own the Spire (`towerUnlocked`) |
| **Standing Wave** (epic) | +2 Spire arc hops | own the Spire (`towerUnlocked`) |
| **Spring Tide** (rare) | Polyp fields ×1.3 reach | own the Polyp (`towerUnlocked`) |
| **King's Tide** (epic) | Polyp fields ×1.5 reach, +8% fire rate | own the Polyp (`towerUnlocked`) |
| **The Unmaker's Lesson** (epic) | +5% execute threshold, +8% tower dmg | Clear stage 45 (`campaignStage`) |
| **Tyrant's Grip** (epic) | Disruption +20% slow, +10% exposure | Clear stage 55 (`campaignStage`) |
| **Saturation Doctrine** (rare) | +30% splash radius, +15% pool damage | Reach wave 25 (`bestWave`) |
| **Veteran's Lattice** (rare) | +45 Integrity, +15 regen per wave | Finish 25 runs (`totalRuns`) |
| **Harvest of Ten Thousand** (epic) | kills splinter 2 Fracture, +10% fire rate | 10,000 lifetime kills (`lifetimeKills`) |
| **Golden Rot** (legendary) | +30% biomass, +2%/tower dmg, +10% sell refund | Harvest 150,000 biomass (`totalBiomass`) |

---

### §rules — Rule Genes: cards that change HOW you play (2026-11)

Of the first 106 genes, ~100 were stat multipliers. The **Rule Genes** block (25 cards, the tail of
`CARD_POOL`) adds build-defining choices that rewrite a run's rules through the **rule ops** —
`grant` (a run-wide capability), `hook` (a battlefield rule fired by an event), `set` (a string
stance) and `flag` (a boolean rule) — never a bare multiplier.

**Rule-changing is derived, not listed.** `isRuleChangingCard(def)` is true when any BASE effect
uses an op in `RULE_CHANGING_OPS` (`flag`/`set`/`grant`/`hook`). A future card classifies itself
from its effects; there is no hand-maintained list (31 of 131 cards qualify today).

**Gating (golden-safe).** Every Rule Gene carries a `campaignStage` unlock (Stage 2–25), so a
fresh account's pool — and the golden sim's — is byte-identical. Discovery still applies on top
(the rarity pools open at Campaign 0/8/15/30/60 — docs §discovery), so the commons arrive first.

**THE RULE SLOT (the draft guarantee).** `draftCards(..., ruleSlot)`: when armed and a deal holds no
rule-changing card while the eligible pool (discovered ∩ unlocked ∩ fielded) does, the LAST slot is
re-dealt from the eligible rule cards. The Game arms it only once the account has EARNED a
rule-changing gene (its `unlockedCardIds` holds one — i.e. Campaign Stage 2) ⇒ a fresh save and
every golden seed draw zero extra rng and deal exactly as before. When nothing rule-changing is
eligible, the armed deal is the unarmed deal (same rng stream — pinned by `ruleGenes.test.ts`).

**Four rule events** extend the hook verb (`HookEvent`), each fired from ONE sim seam with a
trigger POINT — a `spreadStatus` centers there (an event with no point, like a wave start, has
nothing to spread from):

| Event | Seam (game.ts) | Trigger point |
|---|---|---|
| `eliteKilled` | the kill block, after `enemyKilled`, when the corpse was an elite or boss | the corpse (excluded) |
| `nucleusHit` | `hiveStrike` + `detonate` — every blow that lands on the Nucleus | the attacker (included) |
| `towerDeployed` | `placeCore` — every tower placement (favorite deploy, conveyor, legacy) | the slot |
| `strainRaised` | `raiseStrain` — every Strain level-up (merge) | the tower |
| `abilityCast` *(now pointed)* | both hero cast sites | the cast point |

Spread SUBJECT (the draft badge) follows the event: cast-point bursts are the HERO's, Nucleus
retaliation is the HIVE's, deploy/strain bursts are army-wide; kill spreads keep the status's tower
identity (the `plague_vector` convention). Language rows live in `effectLanguage.ts EVENT_VOCAB`
(typed `Record<HookEvent, …>` — a new event cannot ship undescribed); hero stances read from
`ANCHOR_VOCAB`.

**Geared heroes get the rules too.** A drafted (or loadout-activated) gene's hero-scoped stat,
stance and on-hit grant now also fold into every PER-HERO bundle (`foldIntoHeroBundles`) — before
this, a geared hero's boot-time clone silently ignored mid-run hero cards. Gear-less runs (the
golden path) have no bundles ⇒ no-op.

| Archetype | Card (rarity · gate) | Rule |
|---|---|---|
| SHRED (Fracture × Corrosion) | **Splinter Venom** (C · 2) | hero strikes Fracture |
| | **Caustic Strikes** (C · 3) | hero strikes corrode |
| | **Acid Etching** (U · 4) | kills splash Corrosion |
| | **Shatter Lattice** (R · 10) | Mortar Fractures + kills splinter Fracture |
| | **Apex Contagion** (E · 18) | elite/boss deaths detonate Fracture + Corrosion |
| Infection | **Patient Zero** (U · 5) | hero strikes infect |
| | **Contagion Bloom** (C · 3) | elite/boss deaths burst Infection |
| | **Septic Breach** (R · 11) | Nucleus blows erupt Infection |
| Disruption / control | **Synaptic Burst** (C · 2) | ability casts Disrupt at the cast point |
| | **Static Wake** (U · 5) | deployments Disrupt around the slot — deploy INTO the wave |
| | **Cryo Fang** (U · 6) | hero strikes encase (refractory) |
| | **Dread Spores** (C · 4) | Nucleus blows panic nearby attackers |
| Conveyor / Strain economy | **Recycler Glands** (C · 2) | each deployment refunds 25 Biomass |
| | **Strain Tithe** (U · 6) | each Strain raise refunds 45 Biomass |
| | **Mutagenic Shock** (R · 12) | each Strain raise detonates Fracture + Disruption — merge mid-wave |
| Slot / placement | **Lancing Sinew** (U · 7) | every tower's shots pierce +1 — line the lane |
| | **Impaling Lattice** (E · 20) | pierce +3, −10% fire rate |
| | **Sapper Cradle** (R · 9) | +1 emplacement; each deployment heals the Nucleus |
| Hero stance | **Bulwark Instinct** (C · 3) | hero guards the Nucleus; wave starts shield it |
| | **Pack Leader** (U · 7) | hero holds among towers with a haste aura |
| | **Vanguard Stance** (R · 10) | hero holds the front line; strikes burst |
| | **Chain Reflex** (R · 14) | hero strikes arc to 2 more foes |
| Risk / reward | **Blood Tithe** (U · 6) | Nucleus blows pay Biomass; −10% kill biomass |
| | **Trophy Hunter** (R · 11) | elite/boss kills pay 60; enemies +8% HP |
| | **Hive Martyrdom** (L · 25) | Nucleus blows panic + pay; enemies +12% HP |

**Power.** Rule ops are unscored by design (behavior, not numbers); every PERMANENT level of a Rule
Gene carries a scored rider (`geneUpgrades.ts`), so the Power-visibility validator holds and
upgrading one always moves Power. Their maxed riders are deliberately lighter than the stat cards'
(avg +0.16 vs +0.21), lifting the maxed library from ≈×2.76 to ≈×3.08 on the meta bucket
(`GENE_POWER_SCALE` unchanged so no existing account's Power moves; geneArchive.test band ×2–3.2).

---

## 4. Synergy architecture (why cards *heavily* synergize)

Three layered synergy engines guarantee builds compound rather than add:

1. **Category stacking** — cards share a **category tag**; many cards buff *their whole
   category* ("+X% to all Poison effects"), so going deep in one category snowballs.
2. **Cross-category reactions** — categories are tuned to pair with the class reaction
   matrix: **Poison + AoE = spread plagues**, **Crit + Tower Buff = burst engines**,
   **CC + everything = vulnerability multiplies it**, **Summons + Economy = self-funding
   army**, **Mutation Synergy = amplifies all reactions**.
3. **Build-around Legendaries** — each Legendary defines an archetype that *lower-rarity
   cards feed* (e.g., *Extinction Strain* turns every Poison common into a payoff).

**The nine categories** (Poison spans Infection+Corrosion DoT):

| Tag | Category | Anchors | Pairs with |
|---|---|---|---|
| POI | Poison (DoT) | Parasite Nest, Bone Mortar, Plague | AoE, Mutation |
| SUM | Summons | Parasite Nest, Shepherd, Vital | Economy, AoE |
| ECO | Economy | Flesh Reactor, Harvest | Summons, Tower Buff |
| CRIT | Crits | Needle Spitter, Ravager, Kinetic | Tower Buff, CC |
| AOE | AoE | Bone Mortar | Poison, CC |
| CC | Crowd Control | Neural Obelisk, Overseer | everything |
| HERO | Hero Buffs | all heroes | CC, Crit |
| TWR | Tower Buffs | all towers | Crit, Economy |
| MUT | Mutation Synergy | reactions, strains | every category |

---

## 5. Card catalog (200)

Effects are per-rarity tier: Common = one clean effect · Rare = stronger/two-part ·
Epic = build-shaping · Legendary = rule-bending. All values are starting points.

### 5.1 Common (50)

| # | Card | Cat | Effect |
|---|---|---|---|
| 1 | Toxic Coating | POI | +15% Infection/Corrosion damage. |
| 2 | Virulent Spores | POI | Infection spreads to +1 enemy. |
| 3 | Caustic Edge | POI | Attacks apply +1 Corrosion stack. |
| 4 | Festering Wounds | POI | DoT duration +20%. |
| 5 | Necrotic Touch | POI | Poisoned enemies take +10% damage. |
| 6 | Spore Carriers | POI | Crawlers apply +1 Infection stack. |
| 7 | Brood Boost | SUM | +1 max Crawler. |
| 8 | Hardened Shells | SUM | Summons +25% HP. |
| 9 | Sharp Mandibles | SUM | Summons +20% damage. |
| 10 | Rapid Gestation | SUM | Summon spawn rate +15%. |
| 11 | Extra Drone | SUM | Shepherd starts with +1 drone. |
| 12 | Hive Call | SUM | Summons briefly taunt nearby enemies. |
| 13 | Efficient Metabolism | ECO | +10% biomass from kills. |
| 14 | Frugal Growth | ECO | Tower build cost −8%. |
| 15 | Compost | ECO | Selling/replacing towers refunds +25%. |
| 16 | Biomass Cache | ECO | Start each wave with bonus biomass. |
| 17 | Scavenger | ECO | Elite kills drop +20% biomass. |
| 18 | Interest | ECO | Hold ≥ threshold biomass → +5%/wave. |
| 19 | Keen Edge | CRIT | +8% crit chance. |
| 20 | Brutal Force | CRIT | +25% crit damage. |
| 21 | Fracture Point | CRIT | Crits apply +1 Fracture. |
| 22 | Steady Aim | CRIT | +10% crit chance vs full-HP enemies. |
| 23 | Exposed | CRIT | Crits ignore 15% armor. |
| 24 | Bloodlust | CRIT | Kills grant +2% crit chance (resets each wave). |
| 25 | Wide Blast | AOE | Splash radius +15%. |
| 26 | Shrapnel | AOE | Bone Mortar shells gain +1 mini-splash. |
| 27 | Chain Spark | AOE | Attacks chain to +1 enemy. |
| 28 | Concussive | AOE | AoE hits apply a brief slow. |
| 29 | Overspill | AOE | Overkill damage splashes to nearby. |
| 30 | Numbing Field | CC | Slows +10% stronger. |
| 31 | Synaptic Static | CC | Neural field radius +15%. |
| 32 | Heavy Rounds | CC | Attacks have 10% chance to stagger. |
| 33 | Sticky Spores | CC | Poisoned enemies move 10% slower. |
| 34 | Disorient | CC | Disrupted enemies +8% vulnerability. |
| 35 | Adrenaline | HERO | Hero +12% attack speed. |
| 36 | Thick Hide | HERO | Hero +20% max HP. |
| 37 | Combat Stims | HERO | Hero ability cooldowns −10%. |
| 38 | Killing Spirit | HERO | Hero +15% damage. |
| 39 | Quick Recovery | HERO | Hero revive timer −20%. |
| 40 | Reinforced Barrels | TWR | Towers +12% damage. |
| 41 | Long Sight | TWR | Tower range +12%. |
| 42 | Overdrive | TWR | Tower attack speed +10%. |
| 43 | Targeting Chip | TWR | Towers prioritize highest-HP target. |
| 44 | Twin Mount | TWR | A chosen tower occasionally fires +1 projectile. |
| 45 | Adaptive Cells | MUT | +10% to your active Mutation Strain's effect. |
| 46 | Reactive Genes | MUT | Reactions deal +12% damage. |
| 47 | Catalyst Primer | MUT | Statuses apply 10% faster. |
| 48 | Risk Tolerance | MUT | +5% rewards per active corruption tier. |
| 49 | Splice | MUT | Gain +1 Mutation Strain evolution this run. |
| 50 | Volatile Mix | MUT | Enemies with 2 statuses take +10% damage. |

### 5.2 Rare (50)

| # | Card | Cat | Effect |
|---|---|---|---|
| 1 | Plague Vector | POI | Infection spreads to +2 and on contact between enemies. |
| 2 | Acidic Decay | POI | Corrosion also reduces enemy healing 50%. |
| 3 | Compounding Toxin | POI | Poison stacks uncapped (each new stack 20% weaker). |
| 4 | Epidemic Onset | POI | Infection ramp starts at +30%. |
| 5 | Corrosive Synergy | POI | Corrosion+Infection on a target → +25% Plague damage. |
| 6 | Toxic Bloom | POI | Poisoned deaths leave a small poison pool. |
| 7 | Apex Brood | SUM | +2 Crawlers; they apply Corrosion. |
| 8 | Necromantic Hive | SUM | 25% of enemies slain near summons rise as brief Crawlers. |
| 9 | Pack Tactics | SUM | Summons +5% damage per nearby summon. |
| 10 | Elite Drone | SUM | Shepherd's strongest drone gains an ability. |
| 11 | Living Wall | SUM | Summons block more and reflect contact damage. |
| 12 | Hatch Frenzy | SUM | Burst-spawn 3 Crawlers at wave start. |
| 13 | Compound Interest | ECO | Biomass interest +12%/wave. |
| 14 | Recycler | ECO | Refund 50% on sold/replaced towers. |
| 15 | Harvest Engine | ECO | Harvest reactions yield +50% biomass. |
| 16 | Lean Hive | ECO | −15% all tower costs. |
| 17 | Surplus Shield | ECO | Overflow biomass becomes a small Nucleus shield. |
| 18 | Deadeye | CRIT | +18% crit chance, +40% crit damage. |
| 19 | Executioner | CRIT | Crits +50% vs enemies <30% HP. |
| 20 | Crit Cascade | CRIT | Crits 20% chance to fire a free shot. |
| 21 | Armor Breaker | CRIT | Crits strip 30% armor (stacks). |
| 22 | Lethal Precision | CRIT | Every 5th attack is a guaranteed crit. |
| 23 | Hemorrhagic Crits | CRIT | Crits apply Infection (enables Hemorrhage). |
| 24 | Cluster Munitions | AOE | Splash damage +40%. |
| 25 | Ricochet Matrix | AOE | Chains +2 and lose no damage. |
| 26 | Detonation | AOE | Killing blows cause a small explosion. |
| 27 | Saturation Fire | AOE | Bone Mortar fires +1 shell per volley. |
| 28 | Shockwave | AOE | AoE hits knock back and slow. |
| 29 | Pierce Protocol | AOE | Projectiles pierce +2 enemies. |
| 30 | Neural Lockdown | CC | Slows briefly root (0.5s) on a timer. |
| 31 | Mass Hysteria | CC | Fear/Terror affects +2 enemies. |
| 32 | Subjugation | CC | +1 hijack cap. |
| 33 | Vulnerability Field | CC | Disrupted enemies +18% vulnerability. |
| 34 | Static Chains | CC | Slowed enemies share slow with neighbors. |
| 35 | Berserk | HERO | Hero +30% damage below 50% HP. |
| 36 | Warlord's Presence | HERO | Hero aura: nearby towers +15% damage. |
| 37 | Second Wind | HERO | Hero heals 20% on kill streak. |
| 38 | Overclocked Abilities | HERO | Hero cooldowns −25%. |
| 39 | Lifelink | HERO | Hero lifesteal 10%. |
| 40 | Ultimate Charge | HERO | Hero ult charges 30% faster. |
| 41 | Heavy Caliber | TWR | Towers +30% damage, −5% attack speed. |
| 42 | Rapid Fire | TWR | Towers +25% attack speed. |
| 43 | Precision Optics | TWR | +20% range; +crit vs distant enemies. |
| 44 | Overload Capacitors | TWR | Every 10th shot deals ×3. |
| 45 | Adaptive Targeting | TWR | Towers auto-switch to the optimal target type. |
| 46 | Resonant Frequency | TWR | Adjacent same-class towers +10% each. |
| 47 | Catalyst Surge | MUT | Reactions +30% and apply a stack of their status. |
| 48 | Gene Splicer | MUT | Mutation Strain evolves twice as fast. |
| 49 | Corruptor | MUT | +1 corruption tier; corruption rewards +25%. |
| 50 | Reactive Plating | MUT | +3% tower damage per distinct status on the field. |

### 5.3 Epic (50)

| # | Card | Cat | Effect |
|---|---|---|---|
| 1 | Pandemic | POI | Infection that kills spreads at full strength (no decay). |
| 2 | Liquefaction | POI | Max-Corrosion enemies take +40% from all sources. |
| 3 | Patient Zero | POI | First enemy each wave becomes a super-spreader. |
| 4 | Virulent Cascade | POI | Each poison stack adds +1% to your AoE damage. |
| 5 | Caustic Detonation | POI | Corrosion pools explode when an enemy dies inside. |
| 6 | Viral Apex | POI | Plague reaction radius doubled. |
| 7 | Endless Swarm | SUM | Dead Crawlers respawn after 3s (capped). |
| 8 | Brood Mother Protocol | SUM | Every 10 kills spawns an elite Crawler. |
| 9 | Symbiotic Army | SUM | Summons inherit your towers' status types. |
| 10 | Hive Overmind | SUM | Summons +2% damage per tower on board. |
| 11 | Devouring Swarm | SUM | Summon kills heal the Nucleus. |
| 12 | Mitosis | SUM | Summons split into 2 weaker ones on death (once). |
| 13 | Biomass Singularity | ECO | +100% biomass, but only from elite kills. |
| 14 | Golden Hive | ECO | Every 5th tower built is free. |
| 15 | Exponential Growth | ECO | Biomass income +5% per wave survived (compounds). |
| 16 | Blood Bank | ECO | Convert excess biomass to Nucleus integrity each wave. |
| 17 | Harvest Doctrine | ECO | Harvest also speeds Genome Sample gain this run. |
| 18 | Guaranteed Carnage | CRIT | All attacks crit vs Fractured enemies. |
| 19 | Crit Overflow | CRIT | Crit overkill carries to the next enemy. |
| 20 | Bloodbath | CRIT | +1% crit damage per crit this wave (resets each wave). |
| 21 | Headhunter | CRIT | Crits vs elites refund ability cooldowns. |
| 22 | Precision Reactions | CRIT | Crits double reaction damage. |
| 23 | Shatterpoint | CRIT | At max Fracture, deal a guaranteed mega-crit. |
| 24 | Chain Apocalypse | AOE | Chains unlimited, −15% damage per jump. |
| 25 | Carpet Bomb | AOE | Bone Mortar covers 2× area. |
| 26 | Nova Core | AOE | Every 8s, a tower emits a damage nova. |
| 27 | Fragmentation Matrix | AOE | Every kill emits shrapnel (mini-AoE). |
| 28 | Conflagration | AOE | AoE leaves burning ground. |
| 29 | Epicenter | AOE | AoE damage scales with number of enemies hit. |
| 30 | Absolute Lockdown | CC | Neural fields periodically full-stun (1s). |
| 31 | Mind Control Matrix | CC | Hijacked enemies don't expire. |
| 32 | Mass Override | CC | Periodically hijack a small group. |
| 33 | Terror Cascade | CC | Feared enemies spread fear. |
| 34 | Gravity Well | CC | Slows pull enemies toward a point (cluster for AoE). |
| 35 | Avatar of War | HERO | Hero aura: all your units +15% damage. |
| 36 | Untouchable | HERO | Hero −50% damage while abilities on cooldown. |
| 37 | Twin Cast | HERO | Hero abilities cast twice. |
| 38 | Bloodthirster | HERO | Hero lifesteal 25%; overheal → shield. |
| 39 | Apex Frenzy | HERO | Kills extend Frenzy/ult duration. |
| 40 | Commander | HERO | Hero's class keystones also apply to towers. |
| 41 | Overcharged Grid | TWR | All towers gain Flesh Reactor overcharge. |
| 42 | Critical Mass | TWR | Every 20th shot is a map-wide line. |
| 43 | Class Resonance | TWR | Towers of your most-used class +30%. |
| 44 | Sentry Protocol | TWR | Towers holding one target ramp +5%/s. |
| 45 | Hyper-Targeting | TWR | Towers fire at +1 target simultaneously. |
| 46 | Symbiotic Towers | TWR | Adjacent towers share status types. |
| 47 | Reaction Chain | MUT | Reactions can trigger a second, different reaction. |
| 48 | Unstable Genome | MUT | +2 corruption tiers; +75% corruption rewards. |
| 49 | Hyper-Evolution | MUT | Gain 2 Mutation Strains this run. |
| 50 | Catalyst Engine | MUT | Each reaction grants +1% run-long damage (stacks). |

### 5.4 Legendary (50)

| # | Card | Cat | Effect (rule-bending) |
|---|---|---|---|
| 1 | Extinction Strain | POI | Infection never caps/decays, spreads infinitely; starts 40% weaker. |
| 2 | Total Corrosion | POI | Corrosion instantly zeroes armor; pools blanket the lane. |
| 3 | The Rot | POI | All damage becomes spreading Infection (no burst, pure plague). |
| 4 | Plague God | POI | Plague reactions chain across the entire wave. |
| 5 | Necrosis Engine | POI | Poisoned deaths emit a poison nova that re-poisons. |
| 6 | Doomspore | POI | Every enemy spawns pre-infected. |
| 7 | The Swarm Eternal | SUM | Uncapped summons; they don't die (despawn at wave end). |
| 8 | Hive Mind | SUM | Any kill has a chance to spawn a Crawler. |
| 9 | Living Hive | SUM | Summons count as towers (overcharge/auras/adjacency). |
| 10 | Broodfather | SUM | Spawn a permanent elite boss-ally for the run. |
| 11 | Devourer Protocol | SUM | Summons that kill grow permanently stronger (run). |
| 12 | Replication | SUM | Copy your best summon type onto all summon sources. |
| 13 | Infinite Biomass | ECO | No tower build costs; Nucleus −40% integrity. |
| 14 | Midas Hive | ECO | Each kill grants biomass = % of its max HP (scales endless). |
| 15 | Compound Empire | ECO | Biomass income doubles every 10 waves. |
| 16 | Blood Economy | ECO | Build with Nucleus HP instead of biomass. |
| 17 | The Great Harvest | ECO | Harvest +300%; elite Harvest fully heals the Nucleus. |
| 18 | Perfect Strike | CRIT | 100% crit chance; crit damage halved (consistency). |
| 19 | Critical Singularity | CRIT | Crits chain to all in range at reduced damage. |
| 20 | Executioner's Law | CRIT | Crits instakill non-bosses <20% HP. |
| 21 | Infinite Edge | CRIT | Crit damage uncapped, +2% per crit this run. |
| 22 | Death Mark | CRIT | Needle Spitter's target takes +100% from everything. |
| 23 | Reaction Crit | CRIT | Reactions always crit; crits trigger reactions. |
| 24 | Total Saturation | AOE | All towers become AoE; single-target bonuses halved. |
| 25 | Endless Chain | AOE | Chains never stop/decay (capped per enemy). |
| 26 | Meteor Doctrine | AOE | Bone Mortar bombards the whole lane continuously. |
| 27 | Singularity Rounds | AOE | Every 30s spawn a black hole pulling + damaging all. |
| 28 | Fission | AOE | Each kill explodes for % of nearby enemies' HP. |
| 29 | Apocalypse Field | AOE | The lane becomes a permanent damage zone scaling with waves. |
| 30 | Absolute Dominion | CC | Hijack cap removed; all hijacked enemies permanent. |
| 31 | Time Stop | CC | Periodically freeze the entire wave 2s. |
| 32 | Puppet Army | CC | Mass Override converts half the wave. |
| 33 | Event Horizon | CC | A permanent gravity well holds the wave in a kill-zone. |
| 34 | Mass Vulnerability | CC | All enemies share the highest vulnerability applied. |
| 35 | Apotheosis | HERO | Hero gains the default abilities of the other two heroes. |
| 36 | Immortal Avatar | HERO | Hero can't die (downs become brief stuns). |
| 37 | One-Man Army | HERO | Hero damage ×3; −2 tower slots. |
| 38 | Echo of War | HERO | Hero abilities trigger a second time at 50%. |
| 39 | Avatar Ascendant | HERO | Hero's Mastery counts double this run. |
| 40 | Unified Command | HERO | All heroes share all equipped relic effects. |
| 41 | Overcharge Singularity | TWR | One tower gets ×5 everything; others −20%. |
| 42 | Total War | TWR | All towers +100%; build cost ×2. |
| 43 | Class Ascension | TWR | Your main-class towers re-gain their ★10 signature behavior. |
| 44 | Perfect Grid | TWR | All towers act as if next to a maxed Flesh Reactor. |
| 45 | Hivemind Targeting | TWR | All towers focus the Overseer's mark for ×2. |
| 46 | Replicant Towers | TWR | Your strongest tower's type mirrors to all empty slots. |
| 47 | Chain Reaction Theory | MUT | Reactions cascade into ALL applicable reactions. |
| 48 | Apocalypse Genome | MUT | +5 corruption tiers; rewards ×3. |
| 49 | Living Mutation | MUT | Keep ALL Mutation Strains; evolve each every wave. |
| 50 | Singularity Catalyst | MUT | Each reaction permanently (run) buffs all reactions +2%. |

---

## 6. Example synergy builds (showcase)

- **Plague Spread** — POI + AOE + MUT: *Extinction Strain* + *Pandemic* + *Caustic
  Detonation* + *Viral Apex* + *Reaction Chain*. Parasite Nest + Bone Mortar → endless
  self-spreading **Plague**. Wants Parasites/Hive Organism enemies.
- **Crit Executioner** — CRIT + TWR + CC: *Perfect Strike*/*Infinite Edge* +
  *Shatterpoint* + *Death Mark* + *Vulnerability Field*. Needle Spitter + Ravager +
  Overseer → delete elites/bosses. Wants Machine Cult / Hive bosses.
- **Endless Swarm** — SUM + ECO: *The Swarm Eternal* + *Living Hive* + *Hive Mind* +
  *Midas Hive*. Shepherd + Parasite Nest → a self-funding, self-replacing army.
- **Idle Economy** — ECO + TWR + MUT: *Compound Empire* + *Golden Hive* + *Overcharged
  Grid* + *Class Resonance*. Flesh Reactor core → snowballs in long/endless runs.

Each archetype is anchored by a Legendary, fed by lower-rarity cards, and *wants*
different enemy factions (`ENEMIES.md`) — so the optimal draft rotates by run.

## §discovery (2026-07) — DISCOVER → COLLECT → UPGRADE → TRANSCEND (as built)

The acquisition layer was overhauled: cards are no longer "unlocked by drafting once" — they
are **DISCOVERED into a permanent Archive**, then drafted/upgraded/transcended exactly as
before (the upgrade/essence/transcendence systems are untouched by design).

### The five-tier rarity ladder
`CardRarity = common | uncommon | rare | epic | legendary` (core/types.ts). The uncommon
tier was added for pacing texture (8 gated rares re-tiered; ungated cards untouched so the
golden draft pools never moved). Rarity drives draft weights (CARDS.md §2), discovery drop
weights, essence costs (`ESSENCE_COST.baseByCardRarity` — uncommon 34), Archive visuals
(`--r-uncommon` token), and the reveal grade ladder (`LATENT`).

### Ownership = `save.genesDiscovered` (v46)
- A fresh account owns **STARTER_GENES** — 16 ungated commons spanning ≥4 categories
  (validator-enforced 10–20), so the tutorial's draft pool is exactly what a new account owns.
- Every other card is recovered from **Bio-Containers**: `openContainer` rolls the additive
  discovery lane (`rollGeneDiscovery`) — chance by container rarity
  (16/22/28/42/58/70%), then a weighted pick over the ELIGIBLE pool.
- **Pools open on campaign milestones** (`poolStageByCardRarity` 0/8/15/30/60) and a card's
  own `unlock` gate applies ON TOP — discovery never leaks a card the account hasn't met.
- **Duplicate protection**: undiscovered cards weigh ×(1 + 7·(1−completion)) — ×8 on a fresh
  archive fading to ×1 at completion; a roll that still lands on a known strand pays a Gene
  Essence **echo** (6/9/14/24/40 by rarity) — never a dead pull.
- v45→v46 migration seeds starters ∪ every card the account ever touched
  (stats.uniqueCards ∪ leveled genes) — veterans lose nothing.

### Golden safety (the invariant)
The deterministic sim NEVER rolls discovery. The draft pool is decided at LAUNCH:
GameView passes `RunOptions.draftPool = meta.discoveredGeneIds()`; the no-options path
(golden autoplay) keeps the legacy ungated catalog — goldens stay byte-identical by
construction. Never filter `draftCards` by discovery inside the sim.

### Pacing (scripts/sim-gene-discovery.ts — re-run after ANY tunable change)
40 seeds × 365 days against the real roll core, catalog 106 (16 starters):

| Profile | 30 strands | 60 strands | common set | first legendary | d30 | d90 | d365 | full |
|---|---|---|---|---|---|---|---|---|
| F2P (daily loops) | d33 | d97 | d37 | ~d237 | 27% | 53% | 87% | >365d |
| Regular (evenings) | d22 | d60 | d15 | d172 | 35% | 69% | 92% | >365d |
| Whale (stockpiles) | d13 | d33 | d5 | d92 | 54% | 85% | 97% | ~d363 |

P(discover | lane fired) fades 90% → 71% → 30% at 20/50/80% completion (echoes fill the
gap). Guardrails in the sim fail the script if F2P >75% at d30, F2P <30% at d90, F2P misses
a first legendary in >20% of years, or a whale finishes inside 2 months.

### Surfaces & integration
Archive silhouettes + honest per-card hints (`discoveryHint` — pool stage, unlock kind, or
container source) + the completion strip; the opening ceremony's NEW-strand celebration
(docs/LOOTBOX.md §clutch); Collections cards codex credits DISCOVERY (tier 1 = Discovered →
small permanent Power; a fresh account reads base × collection(starters) ≈ +5); achievements
collector(30)/deep_genome(60)/apex_find/common_set/full_genome; Profile "Strands
Discovered"; Mission Control gene goals. The Archive screen-reveal gate deliberately stays
DRAFTED-based (engagement) — starters make any discovered-count gate trivially true.

**Future cards need ONLY data**: a def (id/name/rarity/category/effects/unlock?) — discovery,
gating, hints, weighting, ceremony and Archive presentation all derive from it.

## §language (2026-07) — the universal effect-description system (as built)

**Module:** `src/core/effectLanguage.ts` (pure data + functions; the type back-edges to
cards.ts are type-only). **Consumed by:** `cardToOption` (cards.ts) → `CardOption.lines`
/ `CardOption.effects` → DraftModal. **Tests:** `src/core/effectLanguage.test.ts`.

### The contract
Primary card text is **generated, digit-free, standardized** — never hand-written stat
prose. `describeCard(def, effects)` folds the effects (`foldEffects`: same-field ×'s
compound, +'s sum, flags dedupe — exactly `applyCard` semantics) and renders each as an
`EffectLine { pre, keyword, post, cat, tier, good, exact }`. The UI bolds + colors the
keyword by category; drawbacks (`good: false`, e.g. Glass Genome's enemy-HP rider) phrase
as "But …" and sort last. The precise numbers live ONLY in `exact` (the detail expansion);
`CardDef.description` stays the technical line shown there. `CardDef.simple` is the single
hand-written override seam for cards whose essence can't be derived — nothing uses it yet.

### The impact scale (IMPACT_SCALE — 8 bands over normalized magnitude)
Very Slightly ≥0 · Slightly ≥0.08 · Moderately ≥0.15 · Significantly ≥0.25 · Greatly ≥0.4
· Massively ≥0.6 · Extremely ≥1.0 · Overwhelmingly ≥1.75. A ×1.12 mult normalizes to
0.12; a +8% fraction to 0.08; discrete effects (projectiles, mines, slots, instants)
normalize via their vocab `unit`. Retuning a band edge re-words the whole game at once.

### The category palette (EFFECT_CATEGORIES — 12, color + glyph + label)
Damage (deep red ▲) · Attack Speed (orange ≫) · Critical (gold ✦) · Biomass Economy
(green ⬢) · Genome Core Economy (teal ◈) · Gene Essence (purple ⟡) · Defense (blue ⬟) ·
Healing (emerald ✚) · Debuffs (magenta ▼) · Crowd Control (cyan ◇) · Hero Effects
(yellow ★) · Tower Effects (light blue ⌂). The glyph is the colorblind identity channel —
color is never the only signal. genomeCore/essence serve meta reward surfaces.

### Vocabulary totality (the future-proofing lock)
`FIELD_VOCAB` is a **total `Record` over `keyof RunModifiers`** — adding a run-modifier
field without authoring its vocab is a TYPE ERROR, so every future card auto-describes on
the day its field lands. Tests additionally pin: no digits in any pool card's primary text
at level 0 AND max level; identical generated text ⇒ identical effect shape; thresholds
monotonic; every numeric field covered.

### Draft surface (DraftModal)
Hierarchy: name → procedural art + subject badge → effect lines (first = primary, larger)
→ synergy tag → quiet rarity. Detail expansion (exact values + "YOUR GENE STACK"
before→after rows vs the run's drafted effects + Gene-stack Power diff + technical line):
hover-dwell 550ms or hold Shift on desktop, long-press 450ms on touch (the release click
is suppressed; the next tap dismisses before a pick can fire). Synergy chip ("Pairs with
your X build ×n") appears only when ≥2 drafted cards share the category. Keyword bloom is
a one-shot glow, `prefers-reduced-motion`-gated; short viewports drop the art.
The sim feeds the DTO **leveled** effects (`effectiveGeneEffects` at the player's
permanent level) so the language and comparisons describe exactly what the pick applies.

### Adoption path (remaining surfaces speak the old dialect)
The Gene Archive, equipment cards, mulligan/organ/symbiote inspections and the in-run buff
chips still render their own hand/technical text. They should migrate to
`describeEffects`/`EFFECT_CATEGORIES` — each is a rendering swap, no data change. New
systems MUST speak through this module from day one (DIL edge `system:gene-cards →
system:hub-shell` records the rule).

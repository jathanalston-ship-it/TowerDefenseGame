# Genome Core & Ascendant Progression

The two permanent-upgrade economies behind the **Evolution** tab. This doc is the design
reference: the architecture, every upgrade, and its intended purpose. Balance values are modest
by design — the point is **meaningful diversity of levers**, not number inflation.

- **Genome Core Upgrades** — bought with the account currency (Genome Cores). Capped, reset on a
  Molt (prestige). Data in `config.META_UPGRADES` (`UpgradeDef`).
- **Ascendant Tree** — bought with Ascendant Cells (minted by molting). Capped, **kept across every
  Molt**. Data in `ascendant.ts` (`AscendantNodeDef`).

Golden invariant: a fresh account has every upgrade at level 0 ⇒ every multiplier ×1 / flat 0 ⇒
runs are byte-identical.

---

## Architecture — how an upgrade takes effect

A permanent upgrade is **pure data**; two folding seams turn it into gameplay:

1. **Legacy meta stats (`effect`)** — the original 5 Genome upgrades target a field of the small
   `MetaModifiers` bundle (`towerDamageMult`, `biomassMult`, `heroDamageMult`, `integrityBonus`,
   `bonusSlots`), folded at `Game` construction. Unchanged.
2. **Run-effect bridge (`run`)** — NEW. An upgrade may instead declare
   `run: { field: keyof RunModifiers; op: 'mul' | 'add'; perLevel }`. `meta.genomeRunEffects()`
   turns owned levels into `CardEffect`s and threads them through the **existing** run-effects seam
   (the same path doctrine/collection/equipment use → `bootRunEffect` → `applyRunEffect`). Because
   `RunModifiers` already has ~40 sim-consumed fields, a new upgrade needs **zero new sim wiring** —
   it just names a field. This is what makes the system scale to **50+ Genome / 20+ Ascendant**
   without redesign.

Power Score folds `effectsPower(genomeRunEffects)` (and the ascendant equivalent) into the account
`meta` factor, so damage-relevant permanent upgrades raise Power Score (docs/POWER-SCORE.md).

`category` (Combat/Economy/Hero/Tower/Infrastructure/Utility) drives the Evolution tab's sectioning
(docs: the Evolution HQ redesign). Adding a category is a data change only.

---

## Genome Core Upgrades

### Legacy (unchanged, now categorized)
| id | name | category | effect |
|----|------|----------|--------|
| lethality | Lethal Spores | Combat | +8% tower damage / lvl |
| metabolism | Rich Biomass | Economy | +10% in-run biomass / lvl |
| apex | Apex Genome | Hero | +10% hero damage / lvl |
| nucleus | Reinforced Nucleus | Infrastructure | +25 max Integrity / lvl |
| emplacements | Hive Emplacements | Infrastructure | +1 permanent tower slot / lvl |

### New (run-effect bridge) — 16 upgrades

**Combat** — raise raw offense in distinct ways (not just "more damage").
- `adaptive_targeting` **Adaptive Targeting** — +4% tower fire rate/lvl (`towerFireRateMult`). Rate,
  not damage — rewards fast towers and DoT application.
- `aggressive_evolution` **Aggressive Evolution** — +5% splash radius/lvl (`splashRadiusMult`).
  AoE reach; makes Mortar/reactor clears wider.
- `overclocked_synapses` **Overclocked Synapses** — execute non-elites below +0.8%/lvl HP
  (`executeThreshold`). Trims the long tail of chip damage; scales with enemy count.

**Economy** — grow the run's income and refunds.
- `rapid_assimilation` **Rapid Assimilation** — +6% Flesh Reactor biomass/lvl (`reactorBiomassMult`).
  Rewards a reactor-economy build specifically.
- `expanded_biomass` **Expanded Biomass Storage** — +15 starting biomass/lvl (`startBiomassBonus`).
  Faster opening — get the first towers down sooner.
- `recycling_matrix` **Recycling Matrix** — +3% sell refund/lvl (`sellRefundFrac`). Lowers the cost
  of re-planning a layout; enables sell/rebuild pivots.

**Hero** — deepen each hero's independent power (stacks with per-hero gear, HEROES.md).
- `enhanced_genetics` **Enhanced Genetics** — +7% hero max HP/lvl (`heroMaxHpMult`). Survivability.
- `neural_efficiency` **Neural Efficiency** — −3% hero ability cooldown/lvl (`heroCooldownMult`).
  More ults — the throughput lever.
- `symbiotic_growth` **Symbiotic Growth** — +3% hero lifesteal/lvl (`heroLifestealFrac`). Sustain
  for aggressive front-line heroes.
- `reactive_armor` **Reactive Armor** — +5% hero thorns/lvl (`heroThornsFrac`). Punishes swarms
  that dogpile the hero.
- `predatory_instinct` **Predatory Instinct** — +6% hero aggro range/lvl (`heroAggroRangeMult`).
  Heroes engage sooner — more field control.

**Tower** — reward how you build the board.
- `hive_intelligence` **Hive Intelligence** — +0.3% tower damage per active tower/lvl
  (`damagePerTower`). Scales with a full board — a "go wide" payoff.
- `corrosive_saturation` **Corrosive Saturation** — +5% acid-pool DPS/lvl (`poolDpsMult`). Feeds
  the Acid/ground-hazard archetype.

**Infrastructure** — the core itself.
- `reinforced_lattice` **Reinforced Lattice** — +5% max Integrity (multiplicative)/lvl
  (`integrityMult`). Compounds with the flat `nucleus` node.

**Utility** — situational, high-value levers.
- `genetic_stability` **Genetic Stability** — −2% enemy HP in-run/lvl (`enemyHpRunMult`, floored).
  A universal soft-ramp against health scaling.
- `adaptive_reflexes` **Adaptive Reflexes** — +4% hero move speed/lvl (`heroSpeedMult`). Repositions
  faster → more effective uptime across lanes.

All fields are already sim-consumed (verified: `game.ts`), so each is golden-safe at level 0.

---

## Ascendant Tree

### Existing (unchanged)
`greed` (+15% cores/run), `metabolism` (+10% biomass), `harvest` (+12% loot/run),
`resonance` (+10% cells/Molt, compounds).

### New — 6 nodes (more impactful; each a distinct account-wide lever)
- `potency` **Ascendant Potency** — +5% permanent GLOBAL damage/lvl (tower+hero), max 10.
  → folds into `MetaModifiers` (raises Power Score). The universal "get stronger" node.
- `scholar` **Ascendant Scholar** — +12% Mastery XP/lvl, max 8 → `finishRun` mastery accrual.
  *(Campaign Experience.)* Speeds every tower + hero Mastery track.
- `fortune` **Ascendant Fortune** — +8% loot quality/lvl, max 6 → `lootBiasFor` rarity tilt.
  *(Legendary Container Chance.)* Richer containers over time.
- `infinity` **Ascendant Infinity** — +8% Infinite-mode cores/lvl, max 8 → `finishRun` (endless
  only). *(Infinite Scaling Bonus.)* Makes deep Infinite runs pay.
- `vitality` **Ascendant Vitality** — +5% permanent max Integrity/lvl, max 8 → `MetaModifiers`
  integrity. Account-wide survivability that survives every Molt.
- `opulence` **Ascendant Opulence** — +10% cores/run/lvl, max 8 → `finishRun` core reward. A
  deliberate second income lever, stacking multiplicatively with `greed` for a dedicated
  economy build.

New `AscendantBonuses` stats: `damageMult`, `masteryXpMult`, `lootQualityMult`, `endlessBonusMult`,
`integrityMult`, `coreGainMult` — each ×1 with no nodes (golden-safe).

---

## Future hooks / not yet wired
Named in the design but deferred (need their own seams): Boss Reward Multipliers, Tower Branch
Discount, Equipment Quality, Hero Slot Efficiency, Enemy Modifier Rewards. Each is a one-node,
one-seam addition when its target system grows a hook — the data shape already supports them.

## §runaway (2026-07) — the uncapped tier

`META_UPGRADES` gained six **Runaway** upgrades (one per category) with `infinite: true` +
`maxLevel: Infinity` — the late-game **Genome Core sink**. Cumulative effect folds at
**√level** via `upgradeEffectUnits(def, level)` (core/config) — diminishing but never zero,
so every level still moves the Power Score; cost keeps compounding geometrically forever
(validator requires `costMult ≥ 1.1` on infinite defs). Both fold seams route through the
units helper (`metaModifiers` for `effect`, `genomeRunEffects` for `run`). Completion
metrics everywhere count the capped catalog only. Full design: docs/EVOLUTION-HQ.md §runaway.

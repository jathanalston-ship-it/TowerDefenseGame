# PROJECT_MANIFEST.md — ASSIMILATE: the single source of truth

> **READ THIS FIRST.** This manifest is the entry point for every developer and every future
> Claude session. It maps every major system: what it's for, what it depends on, where it lives,
> what it touches, where it's going, and what to watch out for. Every future feature should
> reference this document — and update its row when it changes a system.
>
> Reading order: **this file** → `GAME_CONSTITUTION.md` (the mandatory rules) →
> `PROJECT_STATUS.md` + `AI_HANDOFF.md` (live state + last session's handoff) → `GAME-STATE.md`
> (what's actually built — the tiebreaker when a design doc and the build disagree) →
> `DEPENDENCY_GRAPH.md` (what breaks if I change this?) → `CODEMAP.md` (file-level orientation) →
> `ENGINEERING-AUDIT.md` (architecture health) → the per-system doc linked in each section.

**The game:** ASSIMILATE — a bio-horror tower defense. React 18 + TypeScript (strict) + Vite,
static SPA (Cloudflare Pages), browser-local saves. The deterministic simulation lives in
`src/core/` (no React/DOM — golden tests pin it byte-for-byte); React renders HUD/menus; a
Canvas2D renderer draws the battlefield. Data flows one way: **sim → snapshot → UI/render**;
input returns as intent methods on the `Game`.

**The invariants every change must respect**
1. `core/` never imports React/DOM/state/ui/render. 2. A fresh save must simulate byte-identical
(golden tests). 3. Content is data through `Registry<T>` + the `CardEffect` DSL — never `switch`
ladders. 4. Every permanent progression source must move the Power Score (validator-enforced).
5. Saves migrate additively (`withDefaults` + sanitizers) — never corrupt, never wipe.
6. Balance numbers live in `core/config.ts` (or the owning system's data tables), not in logic.

**Commands:** `npm run dev` · `npm test` (Vitest, 700+) · `npm run typecheck` · `npm run build`.

---

## System index

[Campaign](#campaign) · [Infinite](#infinite) · [Mega Bosses](#mega-bosses) · [Power Score](#power-score) ·
[Tower Stars](#tower-stars) · [Tower Mastery / Adaptation](#tower-mastery--adaptation) ·
[Heroes](#heroes) · [Hero Equipment](#hero-equipment) · [Gene Cards](#gene-cards) ·
[Equipment](#equipment) · [Crafting / Reforging](#crafting--reforging) · [Loot](#loot) ·
[Collections](#collections) · [Evolution (Genome Cores)](#evolution-genome-cores) ·
[Prestige (Molt / Ascendant)](#prestige-molt--ascendant) · [Currencies](#currencies) ·
[Splice Market (Ichor)](#splice-market-ichor) ·
[Achievements](#achievements) · [Tutorials & Onboarding](#tutorials--onboarding) · [HUD](#hud) ·
[Audio](#audio) · [Visual Effects](#visual-effects) · [Save Data](#save-data)

---

## Campaign

- **Purpose:** the spine of progression — authored-feeling procedural stages, cleared in
  sequence. Depth is the game's master gate: Star Caps, Hero Slots, Prestige, Gene levels, and
  Loadout slots all key off the highest stage cleared.
- **Dependencies:** procgen (seeded stage/biome/boss generation), difficulty defs, Power Score
  (recommended-power display), save (`campaign.cleared` per difficulty).
- **Files:** `core/campaign.ts` (stage generation, star caps, recommended power),
  `ui/CampaignScreen.tsx` (world map), `core/biomes.ts`, `core/boss.ts` + `CAMPAIGN_BOSSES`.
  Docs: `CAMPAIGN.md`, `CAMPAIGN-EVENTS.md`, `MODE-IDENTITY.md`, `STAGES.md`.
- **Related:** Infinite (shares the sim), Prestige (stage requirements), Gene Cards (level
  gates at stages 15/30/50/75), Heroes (slot gates at 25/90).
- **Campaign events (`campaignEvents.ts`):** the authoring seam — a `CampaignEventDef` registry
  `generateStage` samples deterministically so specific stages carry an authored identity (Elite
  Rush / Boss Gauntlet / Genome Cache / Mutation choice). Events LAYER on separate `StageConfig.event`
  fields + existing levers (`bossWaves`/`startBiomassBonus`/group-elite flags), never the base curve.
- **Future expansion:** more event archetypes (one registry row each), milestone bosses 2–4,
  biome-specific mechanics, difficulty tracks. The stage generator is seeded + windowed — deeper
  content is data.
- **Known limitations:** base stages are still procedural scaling between the authored events; a
  Mutation choice is pre-stage (mission card), not an in-run modal; events don't yet feed codex/achievements.
- **Developer tips:** the *one* way to read campaign progress is
  `highestCampaignStage(save)` from `save/derive.ts` — never re-derive from `campaign.cleared`.

## Infinite

- **Purpose:** the endless mode — an AI Director escalates waves forever; personal-best chasing
  and the richest loot-meter payout.
- **Dependencies:** the same `Game` sim (endless flag), endless scaling curves, loot meter.
- **Files:** endless scaling + director inside `core/game.ts` (budget cap, geometric HP,
  speed/damage drift), `ui/InfiniteScreen.tsx`. Docs: `ENDLESS-SCALING.md`, `MODE-IDENTITY.md`.
- **Related:** Loot (meter fills faster deep), Biomes (rotate with depth), Bosses (deep waves),
  Gene Cards (slower endless draft cadence — `CARDS.md §1`).
- **Future expansion:** Ascendant Infinity reward boosts; seasonal/challenge variants are
  FEATURES-flagged (`core/features.ts`) until built.
- **Known limitations:** depth is bounded in practice by the entity budget cap (intentional).
- **Developer tips:** endless tuning lives in config scaling constants — verify with the
  depth/biomass empirical tests (`draftcadence.test.ts`, endless scaling tests), not by feel.

## Mega Bosses

- **Purpose:** battlefield-scale RAID organisms — an anchored, persistent presence across the top
  of the field that manipulates the whole battle (enemy auras, tower suppression, economy leech,
  summons) while the player defeats it through modular WEAK POINTS whose destruction always
  changes the fight (interrupt / expose / disable — never just damage).
- **Dependencies:** engine chokepoints (`MegaFieldFx` folds, all ×1/+0 neutral ⇒ golden-safe),
  the boss framework (sibling pattern), registries, events bus, Daily generator, collection +
  achievements frameworks, Ichor economy.
- **Files:** `core/megaboss.ts` (defs · ability pool · `WEAK_POINT_DEFS` · registries ·
  scheduling · rewards), `game.ts` `megaBossSystem` (execution), `render/megaboss.ts`
  (procedural presentation), `save.megaProgress` (ledger). Docs: `MEGA-BOSS.md`.
- **Related:** Campaign (every 10th stage, forever), Infinite (every 20 waves), Boss Rush (every
  5 waves), Daily (the rare Mega variant replaces the wave plan), Collections (`megaBosses`
  category: Slain/Mastered/Dominated + passives + Power), Achievements (`mega_*`/`wp_*`),
  Splice Market (efficiency-scaled guaranteed Ichor).
- **Future expansion:** scripted first-encounter tutorial beat; per-mega codex art; procedural
  mega assembly from the verb/weak-point pools.
- **Known limitations:** rotation runs only during the wave phase; slow-motion payoffs are
  presentation-side (determinism is non-negotiable).
- **Developer tips:** a new mega is ONE `MegaBossDef` — the validator enforces telegraphs,
  reachable organs and a real reward; rotation slots, codex, achievements ceilings, daily pool,
  renderer and raid bar all pick it up automatically. Never bypass `MegaFieldFx` for a new
  manipulation — that seam is what keeps every other run byte-identical.

## Difficulty & the Universal Difficulty Director

- **Purpose:** difficulty variants (threat + economy scalars) AND the single composition layer
  for every scaling policy — no gameplay system combines balance factors inline; they ask the
  director (curves, doctrine warps, stage folds, mode economy, hazard, adaptive seams).
- **Dependencies:** difficulty defs, doctrine warps, config curve constants
  (`WAVE_*`, `ENDLESS`, `MODE_REWARDS`, `DIRECTOR_ADAPTIVE`).
- **Files:** `core/difficulty.ts` (variant data), `core/difficultyDirector.ts` (the director),
  consumers: `core/game.ts` (RunDirector), `core/campaign.ts` (`composeStageDifficulty`),
  `state/meta.ts` (settle economy), `ui/InfiniteScreen.tsx` (hazard/forecast).
  Docs: `DIFFICULTY.md`, `DIFFICULTY_DIRECTOR.md`.
- **Related:** AI Director (wave composition under these scalars), Spawn Director (emission),
  doctrines, campaign generator, loot bias, mastery XP, predictions.
- **Future expansion:** biome threat bands, boss-presence weighting, prestige tier, seasonal
  modifiers — each lands as one input + one factor in the director.
- **Known limitations:** adaptive seams (`powerRatio`, `recentPerformance`) ship weight-0 —
  tuning them requires progression-simulator evidence (pinned by test).
- **Developer tips:** never write `resolveDifficulty(...).x * warp.y` inline — add or use a
  director query. Parity tests reproduce the legacy formulas verbatim; goldens gate the sim.

## Progression Loop Engine

- **Purpose:** makes the Campaign↔Infinite macro-loop legible and keeps it mathematically
  enforced: geometric stage requirements × logarithmic reach ⇒ walls always re-form; uncapped
  farm income + stage-gated caps ⇒ walls always break and neither mode can be skipped.
- **Dependencies:** predict curves, Power Score, campaign requirement curve, mode rewards.
- **Files:** `state/progressionLoop.ts` (loopState/loopAdvice), `LoopDirective` in
  `ui/NextGoalBanner.tsx`; surfaced on Results, CampaignScreen, InfiniteScreen.
  Docs: `PROGRESSION-LOOP.md`.
- **Related:** Next-Goal engine (micro-goals; the loop is the macro-goal), prediction,
  prestige (the unbounded long-range ring), Difficulty Director (adaptive seams).
- **Future expansion:** the progression simulator calibrates the TIME axis (hours per band)
  and, with evidence, the `DIRECTOR_ADAPTIVE` weights.
- **Known limitations:** phase classification uses the campaign difficulty's requirement bar;
  per-attempt fail history isn't tracked (no "breakthrough" pseudo-state).
- **Developer tips:** loop-shape changes must keep `progressionLoop.test.ts` green — its 8
  invariants ARE the loop contract (resistance, wall, never-impossible, interlock, prestige
  ring, unskippable modes, engine classification).

## Economy Framework & Progression Simulator

- **Purpose:** ONE factor-traced income composition per currency (adaptive economy framework)
  + the PERMANENT simulation framework: player personas over the REAL meta layer measuring
  pacing, unlock cadence (dopamine gaps), dead zones, walls, grind, inflation and shortages,
  with automatic bottleneck detection → `BALANCE_REPORT.md` (report-only; humans review).
- **Dependencies:** Difficulty Director policies, progression-loop engine (the sim's player
  policy), meta settle layer (the simulator drives the real APIs).
- **Files:** `core/economyDirector.ts` (income chains + adaptive seams + explain),
  `dev/progressionSim.ts` (persona-aware engine + acquisition ledger), `dev/personas.ts`
  (the 11-persona roster), `dev/balanceReport.ts` (matrix + detectors + renderer),
  `scripts/sim-progression.ts` (`npm run sim:progression` → `PROGRESSION_REPORT.md`),
  `scripts/sim-balance-report.ts` (`npm run sim:report` → `BALANCE_REPORT.md`).
  Docs: `ECONOMY_FORMULAS.md`, `PROGRESSION_REPORT.md`, `SIMULATION-FRAMEWORK.md`,
  `BALANCE_REPORT.md` (generated).
- **Related:** loot (container tables), prestige/collections (factor inputs), currencies.
- **Future expansion:** weight `ECONOMY_ADAPTIVE` / `DIRECTOR_ADAPTIVE` from report evidence;
  new persona = one `PERSONAS` row; new detector = one `hit()` + diagnosis row.
- **Known limitations:** the run itself is a coarse world model (waves/kills/duration
  constants in `WORLD`); only the economy it feeds is production truth.
- **Developer tips:** never balance from intuition — regenerate the report and read the
  hour-band medians + detector table first. Income changes go through a named factor.

## Player Profile

- **Purpose:** the account dashboard — banner + unlockable frames, registry-driven career
  statistics, power breakdown, achievements showcase, milestone timeline, next milestones,
  performance analytics. Reinforces progression on every row.
- **Dependencies:** stats ledgers, Power model, achievements, collection, prestige,
  Next-Goal engine + loop directive (milestones section).
- **Files:** `state/profile.ts` (provider registry + banner/power/showcase read-models),
  `ui/PlayerProfile.tsx`; save v22 fields (`createdAt`, `profileName`, `profileFrame`,
  `timeline`, profile stat ledgers). Docs: `PROFILE.md`.
- **Related:** Mastery titles (worn badge), achievements gallery (embedded), vault ledger.
- **Future expansion:** any system adds a provider (`profileRegistry.register`) and appears —
  no UI edits; new frames/timeline recorders are data + one push call.
- **Known limitations:** sold/moved/reforge ledgers not tracked yet; v22 ledgers count
  forward from migration.
- **Developer tips:** never hardcode a stat into the screen — register a provider. The
  fresh-account contract (`profile.test.ts`): every section renders, no dead panels.

## Power Score

- **Purpose:** ONE number for account strength. Folds every permanent bucket (upgrades, stars,
  mastery, heroes, equipment, collection, genes, prestige) plus a temporary in-run bucket;
  drives recommended-power checks and progress prediction.
- **Dependencies:** every progression system feeds it; `effectsPower` scores `CardEffect[]`.
- **Files:** `core/power.ts` (buckets, `effectsPower`, FIELD_WEIGHT/ADD_POWER),
  `state/itemPower.ts` (per-item compare), `ui/components/PowerScore.tsx` / `PowerDelta.tsx`.
  Docs: `POWER-SCORE.md`.
- **Related:** everything permanent. Gene validator (Power-visibility), predictions.
- **Future expansion:** new scored fields join `FIELD_WEIGHT`/`ADD_POWER`; the engine-level
  `POWER_RELEVANT_FIELDS` coverage guarantee flags unscored additions.
- **Known limitations:** some behavioral effects (grants/hooks, some slows/auras) are invisible
  to scoring by design — content validators require a scored rider alongside them.
- **Developer tips:** `meta.power()` for the live score; `meta.previewPower(mutate)` for
  what-if previews — previews use the REAL model and must equal the post-change score
  (test-pinned pattern; copy it for new preview UI).

## Tower Stars

- **Purpose:** permanent per-tower power: Stars are capability EVOLUTIONS (targeting, projectile
  mutators, new attacks, forks) bought with Strain Samples; the Star Cap rises with Campaign.
- **Dependencies:** shards economy, Campaign (Evolution Cap), registry star paths.
- **Files:** `core/stars.ts` (StarPath → `ResolvedStarKit`), costs in `config.STAR` +
  `state/meta.ts` (`buyStar`, `towerStarCost`), `ui/TowerLab.tsx`, `ui/StarCeremony.tsx`.
  Docs: `TOWER-STARS.md`, `SHARD-ECONOMY.md`, `EVOLUTION-CAP.md`.
- **Related:** Tower Branches (in-run specialization on top), Mastery, Power, Collections.
- **Future expansion:** per-tower star paths are data — new towers add a path row; re-pickable
  forks exist for deeper choice.
- **Known limitations:** 5 towers built vs 100 target; the cost curve is tuned for the current
  roster size.
- **Developer tips:** max-star duplicates auto-convert to Gene Essence (`meta.openContainer`) —
  if you touch star caps or shard grants, re-run the essence economy tests.

## Tower Mastery / Adaptation

- **Purpose:** identity-through-use, in two layers. Mastery = **experience** (titles, procedural
  infinite ranks, halos, sparse milestone perks). Adaptation = **specialization**: per-tower
  GENERATED trees (4 branches × 10 tiers; mutually exclusive forks at 4/7; apex capstone) bought
  with **Antigen** — a multi-source, capped currency (mastery ranks + campaign depth + Legendary
  container Traces + achievements; never run-farmable). Deep tiers campaign-gate (15/30/50);
  keystones evolve the tower's battlefield FORM (stages 1–3); respec is priced (Genome Cores) and
  stage-gated.
- **Dependencies:** lifetime usage stats; campaign depth; folds into the per-kind kit channel
  (`meta.towerProgress`) and Power.
- **Files:** `core/mastery.ts`, `core/adaptation.ts` (trees + economy + rules),
  `ui/MasteryProfile.tsx`, `ui/components/AdaptationTree.tsx` (lab UI), halo rendering in
  `render/towerEvolution.ts`, FORM stages in `render/renderer.ts`. Docs: `MASTERY.md`,
  `ADAPTATION.md` (economy, anatomy, authoring).
- **Related:** Stars (parallel per-tower track), Collections (usage tiers), Power, Campaign.
- **Future expansion:** a new tower's tree = ONE `TOWER_THEMES` row (zero code); per-hero trees;
  new effect verbs (ricochet/spores) once added to the sim mutator vocabulary.
- **Known limitations:** heroes still share the legacy 3-branch tree; effect vocabulary rides the
  existing kit fields (no bespoke sim behaviors yet).
- **Developer tips:** mastery XP accrues in `accumulateStats`; adaptation is golden-safe because
  empty picks fold to the neutral effect — keep it that way for every new node field.

## Heroes

- **Purpose:** autonomous champions with per-behavior AI, an active ability, stars, mastery,
  equipment, and slot-gated multi-hero fielding (2nd/3rd slots at Campaign 25/90).
- **Dependencies:** ability-component system, hero shards (Apex Genome), Campaign gates.
- **Files:** `HERO_DEFS`/`HERO_SLOTS`/abilities in `core/config.ts`, per-behavior AI in
  `core/game.ts`, `core/heroLore.ts`, `state/heroView.ts`, `ui/HeroLab.tsx`,
  `ui/HeroSelectPanel.tsx`, `ui/components/HeroPortrait.tsx`. Docs: `HEROES.md`,
  `HERO-FRAMEWORK.md`, `HERO-EVOLUTION.md`, `HERO-SELECTION.md`, `SLOTS.md`.
- **Related:** Hero Equipment, Gene Cards (hero-subject cards), Power.
- **Future expansion:** roster growth (3 → 30 target) — a hero is a def + ability components +
  lore row; Hero Evolution adds an in-run Biomass sink.
- **Known limitations:** abilities are largely one-verb; 3 heroes cap team-comp depth today.
- **Developer tips:** hero identity = data (`HERO_PULSE`/`HERO_ULT` compose ability components).
  Never special-case a hero id inside the sim loop.

## Hero Equipment

- **Purpose:** per-hero loadouts — each hero keeps its OWN Weapon/Armor/Relic; equipment defines
  playstyle (behavioral verbs), not just stats.
- **Dependencies:** Equipment system (items), save (`equipment.loadouts` per hero), Power.
- **Files:** loadout state + apply in `state/meta.ts`, boot-fold in `core/game.ts`
  (equipment rides run-start knobs/grants), `ui/EquipmentPanel.tsx` (Armory).
  Docs: `EQUIPMENT-PHILOSOPHY.md` (behavioral verbs), `SLOTS.md`.
- **Related:** Heroes, Crafting (reforge targets equipped gear too), Power (item compare).
- **Future expansion:** set bonuses deepen; new verbs join the grant/hook vocabulary.
- **Known limitations:** equipment applies at RUN BOOT (boot-only fields are dead mid-run —
  the validator bans them in mid-run content like gene upgrades).
- **Developer tips:** `heroAttackStatus`, anchors, and AI-profile knobs are the behavioral
  surface — author HOW a hero plays; check `EQUIPMENT-PHILOSOPHY.md` before adding a stat-only
  item.

## Gene Cards

- **Purpose:** the drafted-card system AND a permanent progression pillar. In-run: draft 1-of-3
  between waves (temporary run shaping). Permanent: every card is a collectible with 3–5
  campaign-gated upgrade levels bought with Gene Essence in the **Gene Archive**; Starting Gene
  Loadouts auto-activate up to 5 cards at run start. Ascension backend is built (no gameplay).
- **Dependencies:** `CardEffect` DSL + registry, Gene Essence economy, Campaign gates, Power.
- **Files:** `core/cards.ts` (defs, DSL, `applyCard`, validator), `core/geneCards.ts` (permanent
  state, gates, effect/Power folds, ascension seams), `core/geneUpgrades.ts` (168 authored
  levels), `core/geneEssence.ts` (economy), `core/geneLoadout.ts` (slots),
  `state/geneArchive.ts` (read-model), `ui/GeneArchive.tsx`, `ui/DraftModal.tsx`,
  `ui/components/GeneCardArt.tsx`. Docs: **`GENE-EVOLUTION.md`** (canonical), `CARDS.md`
  (drafting), `GENE-AUDIT-REPORT.md` (final audit + stress test).
- **Related:** Loot (essence from containers), Stars (max-star duplicates → essence), Power,
  Collections (gene level labels), Next-Goal (gate surfacing).
- **Future expansion:** Card Ascension = author `def.ascension.tiers` + ONE wire (pass the saved
  tier at the run seams — Power already counts it); rarity tiers + skins have resolution seams
  (`geneEffectiveRarity`, `geneArtKey`).
- **Known limitations:** `GENE_POWER_SCALE` is calibrated for the 45-card library — the pinned
  ×2–2.6 test band fails loudly when the library grows (that's the recalibration reminder).
- **Developer tips:** a new card = one `CARD_POOL` row + one `GENE_UPGRADES` entry; the
  validator refuses anything without 3–5 Power-visible, non-boot-only levels. Never bypass
  `effectiveGeneEffects` when applying cards.

## Equipment

- **Purpose:** ~180 weapons/armor/relics with affixes and sets — the build-defining gear layer;
  drops from Bio-Containers, managed in the Armory.
- **Dependencies:** loot rarity framework, affix rolls, Power (item scoring), save inventory.
- **Files:** `core/equipment.ts` (items, affixes, sets, `RARITY_ORDER`), `state/itemPower.ts`,
  `ui/EquipmentPanel.tsx`, `ui/ItemDetails.tsx`, `ui/components/ItemArt.tsx`.
  Docs: `EQUIPMENT.md`, `EQUIPMENT-PHILOSOPHY.md`.
- **Related:** Hero Equipment (loadouts), Crafting (reforge), Loot (acquisition), Collections.
- **Future expansion:** 500-item target; behavioral affix vocabulary keeps growing.
- **Known limitations:** exotic rarity is loot-only in places (can't transmute past legendary).
- **Developer tips:** destruction safeguards + Undo Salvage exist (`EQUIPMENT.md §safeguards`) —
  route ALL item deletion through them, never delete inventory rows directly.

## Crafting / Reforging

- **Purpose:** the late-game materials sink — enhance, reroll, targeted-swap, and
  rarity-upgrade items with Mutagen/Scrap/Catalyst.
- **Dependencies:** Equipment (targets), materials from containers (pity-protected drops).
- **Files:** `core/reforge.ts` (operations + costs), `core/materialDrop.ts` (drop rolls +
  pity), reforge UI inside the Armory (`ui/EquipmentPanel.tsx`). Docs: `REFORGE.md`,
  `EQUIPMENT.md §8`.
- **Related:** Equipment, Loot (material acquisition), Currencies (materials family).
- **Future expansion:** affix locking exists; deeper crafting (transmog/skins) unbuilt.
- **Known limitations:** material faucets are container-only today.
- **Developer tips:** costs are `base + perRarity × rarityIndex` data — rebalance in
  `reforge.ts` tables, not in UI.

## Loot

- **Purpose:** the reward engine: runs fill a Loot Meter → pre-determined Bio-Containers bank
  UNOPENED → the Genetic Vault opens them ceremonially (equipment, shards, materials, essence).
  Pity + progression-aware catch-up keep droughts impossible.
- **Dependencies:** rarity framework, pity, progression bias (Power vs expected), reveal state.
- **Files:** `core/loot.ts` (rarity registry, `rollRarity`, pity), `core/lootQueue.ts`
  (pre-determined queue), `core/progressionLoot.ts` (catch-up bias), `core/materialDrop.ts`,
  `state/lootbox.ts` (chest reward tables), `state/vaultReveal.ts` (pull choreography model),
  `ui/GeneticVault.tsx`, `ui/VaultReveal.tsx`, `ui/LootMeter.tsx`, `ui/LootToaster.tsx`.
  Docs: `LOOTBOX.md`, `LOOT-PROGRESSION.md`, `REWARD-PRESENTATION.md`.
- **Related:** Equipment, Gene Essence (duplicate conversion + bonus drops), Crafting
  (materials), Currencies.
- **Future expansion:** new container types = chest rows; new reward classes join the reveal's
  category model (`PullView`).
- **Known limitations:** loot queue's seeded default is deterministic by design — don't "fix" it.
- **Developer tips:** duplicate max-star shards convert to Gene Essence at open time with the
  reason displayed — conversion math lives in `core/geneEssence.ts`, wiring in
  `meta.openContainer`. The reveal never collapses pull COUNT (only the summary merges).

## Collections

- **Purpose:** the codex — every enemy/boss/tower/hero/card/item/biome/cache discovered, with
  usage tiers, category ranks, completion rewards, and a small Power contribution.
- **Dependencies:** lifetime stats, all content registries.
- **Files:** `core/collection.ts` (view + tiers + bonuses + rewards), `ui/CollectionPanel.tsx`.
  Docs: `COLLECTION.md`.
- **Related:** every content system; Gene Cards (card entries show permanent Gene level —
  label only, completion untouched).
- **Future expansion:** category reward tracks extend as content grows (registry-driven counts).
- **Known limitations:** entry tier ladders are usage-count heuristics.
- **Developer tips:** `collectionView(collectionContextOf(save))` is the ONLY read path; its
  completion feeds Power — never change `tier/maxTier` semantics casually (label enrichment is
  the safe channel, see the cards precedent).

## Evolution (Genome Cores)

- **Purpose:** permanent, categorized account upgrades (damage/economy/hero/tower…) bought with
  Genome Cores in the Evolution HQ — the steady account-growth backbone.
- **Dependencies:** Genome Cores income (runs, first-clears), Prestige (cap interplay).
- **Files:** `META_UPGRADES` in `core/config.ts`, `metaModifiers()` fold in `state/meta.ts`,
  `state/evolutionHQ.ts`, `ui/EvolutionHQ.tsx`. Docs: `EVOLUTION-HQ.md`, `GENOME-CORE.md`,
  `PROGRESSION-SYSTEMS.md`.
- **Related:** Prestige (Molt sacrifices banked cores), Power, Currencies.
- **Future expansion:** 1000-upgrade target — upgrades are data rows folded generically.
- **Known limitations:** 21 upgrades built; categories will need paging at scale.
- **Developer tips:** an upgrade is `{ id, category, maxLevel, effect: { stat, perLevel } }` —
  `metaModifiers()` folds it with no new code.

## Prestige (Molt / Ascendant)

- **Purpose:** the reset loop — Molting sacrifices banked Cores + capped upgrades to mint
  Ascendant Cells (permanent compounding global multiplier) and unlocks the Ascendant Tree
  (permanent nodes kept across every Molt).
- **Dependencies:** Campaign depth requirements per Molt, Evolution (the sacrifice).
- **Files:** `core/prestige.ts` (mint + multiplier), `core/ascendant.ts` (tree),
  `ui/PrestigePanel.tsx`, Evolution HQ's Ascension section. Docs: `PROGRESSION-PHILOSOPHY.md
  §2.8`, `PROGRESSION-REDESIGN.md`.
- **Related:** Evolution, Campaign, Power (P bucket), Loot (Fortune node).
- **Future expansion:** 1 of 6 designed prestige layers built (Speciation etc. are spec-only).
- **Known limitations:** exactly that — deeper layers are documented, not implemented.
- **Developer tips:** the multiplier is sqrt-mint → log-fold; don't linearize it "for clarity."

## Currencies

- **Purpose:** one framework for every currency's identity (icon, color, glow, tooltip,
  formatting) — Biomass (run-only), Genome Cores, Strain Samples, Apex Genome, materials,
  Ascendant Cells, Gene Essence.
- **Dependencies:** none (leaf data module); every reward surface renders through it.
- **Files:** `core/currencies.ts` (defs), `ui/components/CurrencyIcon.tsx`.
  Docs: `ECONOMY.md` (canonical names + bands), `LEXICON.md` (display language).
- **Related:** Loot, Evolution, Gene Cards, Shards/Stars.
- **Future expansion:** a new currency is ONE def row — icon/tooltip/collection entry ride free.
- **Known limitations:** `ECONOMY.md` still contains aspirational currencies (marked as such).
- **Developer tips:** never hardcode a currency name/icon in UI — render `<CurrencyIcon id …>`.

## Splice Market (Ichor)

- **Purpose:** the refreshing store (deterministic 5-minute stock windows: 4 core-priced small
  bundles + a premium shelf + rotating Bio-Containers) and ICHOR, the premium currency —
  front-loaded faucets, an under-water container-gamble EV, a closed MTX seam.
- **Dependencies:** Currencies (identity), Loot (containers land in the Vault queue),
  Equipment (`rollItem` for gear slots), Achievements/Collection/Campaign/Infinite (faucets).
- **Files:** `core/market.ts` (tunables + pure stock/gamble rolls), `state/spliceMarket.ts`
  (read-model), `state/meta.ts` (seams + faucet folds), `ui/SpliceMarket.tsx`.
  Docs: `MARKET.md` (canonical). Tests: `core/market.test.ts`, `state/marketEconomy.test.ts`
  (EV bound + 100k-trial chain-death Monte Carlo).
- **Related:** Loot, Currencies, Achievements, Collections, Campaign, Infinite.
- **Future expansion:** a new good = one stock-pool row + a `describeGood` case; a new faucet =
  one tagged `grantIchor` call; MTX = flip `MARKET.mtxEnabled` and attach a payment flow to the
  existing seam.
- **Known limitations:** collection-rank Ichor pays at the promotion poll (Codex open), not the
  instant the rank is earned; the gamble is deliberately pity-less.
- **Developer tips:** never grant Ichor outside `grantIchor`/the audited faucet folds — the
  economy tests recompute their bounds from `ICHOR`/`MARKET`, so retunes break tests, not players.

## Achievements

- **Purpose:** milestone recognition with Shard rewards, surfaced in Profile and toasts.
- **Dependencies:** run summaries + lifetime stats; rewards auto-grant.
- **Files:** `state/achievements.ts` (defs + checker), `ui/AchievementPanel.tsx`,
  `ui/AchievementToaster.tsx`, inline strip in `ui/RewardReveal.tsx`.
- **Related:** Stats, Results (end-of-run reveal), notifications (profile badge).
- **Future expansion:** an achievement is a def row (`test`, `progress`, `reward`).
- **Known limitations:** flat list (no chains/categories yet).
- **Developer tips:** achievements check on run finish (`checkAchievements`) — a new stat needs
  to be in the run summary or lifetime stats first.

## Tutorials & Onboarding

- **Purpose:** teach through play — the 10-step Combat Tutorial over a LIVE simplified game, the
  one-time HUD Tour (13 stops), the mechanics-registry-driven Help wiki + "What's New?"
  announcements, loading tips, and in-place help (e.g. the Gene Archive collapsible).
- **Dependencies:** the game event bus (tutorial director), save (`help`, `tutorial`).
- **Files:** `core/tutorial.ts` (lesson content), `ui/TutorialRunner.tsx` + `ui/tutorial/*`
  (director, overlay, primitives), `state/mechanics.ts` (registry), `ui/HelpWiki.tsx`,
  `ui/WhatsNew.tsx`, `ui/HudTour.tsx`, `ui/tips.ts` (loading tips), `state/tutorial.ts`.
  Docs: `TUTORIAL.md`, `HELP.md`.
- **Related:** every teachable system (one `MechanicDef` each), notifications.
- **Future expansion:** new mechanic = one registry row (wiki + announcement ride free); media
  slots await art.
- **Known limitations:** media placeholders only; announcement order is registry order.
- **Developer tips:** tutorial rewards are idempotent (`grantTutorialRewards` ledger) — never
  grant onboarding rewards directly.

## HUD

- **Purpose:** the in-run interface — resources, wave state, tower rail, inspector, draft,
  build controls, live Power — and the Hub shell (nav, badges, rings, screens) around the game.
- **Dependencies:** `game.getSnapshot()` (~10 Hz) + `meta.use()`; notifications registry.
- **Files:** `ui/Hud.tsx`, `ui/Toolbar.tsx`, `ui/BuildControls.tsx`, `ui/Inspector.tsx`,
  `ui/BuildPanel.tsx`, `ui/DraftModal.tsx`, `ui/GameView.tsx` (rAF host), `ui/Hub.tsx` (nav
  shell), `ui/hubProgress.ts` (rings), `state/notificationSources.ts` (badges). The HOME
  screen is the Command Center (`ui/CommandCenter.tsx` + `ui/homeModel.ts` registry +
  `ui/WorldStatus.tsx` living centerpiece — `COMMAND-CENTER.md`): registry-driven widget
  zones (command strip, world status, mission control, forecast/roadmap rail, live army,
  command feed, dashboard); a future system's home widget = one register() + one renderer.
  Docs: `HUD.md`, `READABILITY.md`, `UI-MOTION.md`, `NOTIFICATIONS.md`, `COMMAND-CENTER.md`.
- **Related:** everything player-facing; the motion language in `index.css`.
- **Future expansion:** new Hub screen = NavKey + section entry + notification channel.
- **Known limitations:** `index.css` is one 5.3k-line stylesheet (see `ENGINEERING-AUDIT.md`).
- **Developer tips:** UI reads snapshots — never reach into live sim entities from React;
  intents go through `Game` methods.

## Audio

- **Purpose:** synthesized SFX bus (no audio assets) — cues for combat, UI, rewards, branch
  tiers; heartbeat tempo under pressure — plus the ADAPTIVE SOUNDTRACK: a motif-library score
  (15-track data library, 8 intensity-gated layers, scene/rotation/progression-weighted
  selection, stable per-boss themes, reward stingers, near-death duress, bar-aligned equal-power
  crossfades, mastering compressor).
- **Dependencies:** WebAudio; volume/on-off persisted (`audioOn` key); `core/events.ts`
  (`bossKilled` → the bossDown stinger).
- **Files:** `audio/sound.ts` (SFX bus + all synths + the cue→stinger `STING` bridge),
  `audio/music.ts` (pure composition core + the music manager), `ui/MusicDebug.tsx` (Settings
  dev console). Docs: `MUSIC.md`, `GAME-FEEL.md`.
- **Related:** HUD (UI cues), Loot reveals, Star ceremonies, branch evolution, Assimilation
  Index (intensity floor), Hub (menu scenes), GameView (category/boss/duress).
- **Future expansion:** new SFX cue = a synth function + a tag; new track/motif/stinger = one
  data row in `music.ts`; a new boss hash-assigns its theme (or one `BOSS_THEME_OVERRIDES`
  entry); real audio assets could layer in behind the same `audio.cue(tag)` / voice functions.
- **Known limitations:** fully procedural — distinctive but synthetic (choir is detuned
  triangles, not voices).
- **Developer tips:** SFX API is `audio.cue(tag)` / `audio.resume()` (autoplay policy); music
  API is `music.play(category, opts)` + `setIntensity`/`setDuress`/`setScene`/`setProgression`/
  `stinger` — callers never pick tracks (there is no `audio.play`). Audition everything in
  Settings → Music Console (dev builds).

## Visual Effects

- **Purpose:** battlefield juice — particles (muzzle, impacts, deaths, status auras), tower
  visual evolution (star/branch-driven), range/zone visualization, projectile fades, screen
  motion tokens.
- **Dependencies:** render state from the sim (particles are SIM entities for determinism);
  `render/` draws, never mutates.
- **Files:** `render/renderer.ts` (battlefield), `render/towerEvolution.ts` (evolving tower
  bodies), particle spawn in `core/game.ts` (`ParticleKind`s), CSS motion tokens in
  `index.css`. Docs: `TOWER-VISUAL-EVOLUTION.md`, `RENDER-PIPELINE.md`, `UI-MOTION.md`,
  `PLACEHOLDER-ART.md`.
- **Related:** Tower Stars/Branches (visual escalation), HUD readability rules.
- **Future expansion:** art lands behind the same procedural fallbacks (`GeneCardArt`,
  `ItemArt`, tower bodies) — swap-in by key, no system changes.
- **Known limitations:** everything is procedural placeholder art by design (EA).
- **Developer tips:** particles live in the SIM (golden-relevant!) — visual-only tweaks belong
  in the renderer; adding sim particles changes goldens.

## Assimilation Index

- **Purpose:** the hidden per-run MASTER STATE — one continuous `0..1` index measuring how thoroughly
  the player has assimilated the battlefield this run, and the single driver every dynamic
  presentation system keys on (music intensity, camera heartbeat, screen veil, HUD glow), so the
  whole game evolves together instead of each system inventing its own thresholds. 6 evolution tiers
  (Contained → Planetary Assimilation) blend continuously.
- **Dependencies:** consumes the live run **Power Score** (its universal contributor — so every
  progression system raises it for free) + run aggregates; render-only, never saved.
- **Files:** `core/assimilation.ts` (framework — signals, contribution profiles, tiers, step,
  presentation), `render/assimilationFx.ts` (screen veil), `ui/AssimilationDebug.tsx` (dev panel);
  consumed by `ui/GameView.tsx` (the run loop) + `core/game.ts` (`assimilationSignals()`). Docs:
  `ASSIMILATION.md`.
- **Related:** Power Score (contributor), Audio (music intensity), Visual Effects / Danger Camera
  (composes under them), HUD.
- **Future expansion:** a new system contributes with **no gameplay-code change** — implicitly via
  the Power Score, or explicitly by `registerAssimilationContribution()` reading a `custom` signal.
  New presentation consumers (towers/heroes/nucleus/enemies/mega/cinematics) read
  `assimilationPresentation(game.assimilation)` — never a private threshold.
- **Known limitations:** the `custom` seam is unused by content yet; several presentation consumers
  are documented seams, not yet wired (see `ASSIMILATION.md` §Known limitations).
- **Developer tips:** render-only by contract (the sim never reads it ⇒ golden-safe); the state is
  stepped in the view loop, not `advance()`. Open the Debug panel → 🧬 Assimilation Index to preview
  any depth via the manual override.

## Save Data

- **Purpose:** versioned, checksummed, browser-local persistence with additive migrations,
  per-field sanitizers, rotating backups, export/import, Developer Reset scopes.
- **Dependencies:** every system's sanitizer (genes, loadouts, queue, equipment…).
- **Files:** `save/saveStore.ts` (schema `CURRENT_VERSION`, `withDefaults`, SaveStore, backups),
  `save/saveFile.ts` (file I/O), `save/derive.ts` (shared pure derivations, e.g.
  `highestCampaignStage`), `state/devReset.ts` + `state/prefs.ts` (`DEVICE_PREF_KEYS` registry),
  `ui/SaveManager.tsx`. Docs: `DEV-RESET.md`, `SCALABILITY.md`.
- **Related:** literally everything permanent; Power recomputes on every persist.
- **Future expansion:** cloud saves/backend are a platform decision (see `GAME-STATE.md §Not
  built`); the schema is additive-ready.
- **Known limitations:** browser-local only; clearing site data loses the account (export
  exists).
- **Developer tips:** to add a field: bump `CURRENT_VERSION`, default it in `defaultSave`,
  sanitize it in `withDefaults` — and add a migration test (`saveStore.test.ts` has the
  pattern). NEVER read `localStorage` keys directly for prefs — register them in
  `DEVICE_PREF_KEYS`.

---

## Cross-cutting frameworks (referenced by systems above)

| Framework | Home | One-liner |
|---|---|---|
| `Registry<T>` | `core/registry.ts` | every content type self-registers; validation, versioning, aliases, modding-open |
| `CardEffect` DSL | `core/cards.ts` | the one declarative effect language (cards, equipment, collection, genes) |
| Ability components | `core/ability.ts` | tower/hero combat as data blocks run by one executor |
| Status engine | `core/status.ts` | stacking/duration/potency rules as data |
| Read-model pattern | `state/*.ts` | pure `f(save) → view` modules; UI stays logic-free |
| Notifications | `state/notifications.ts` | menu badges = registered `count(save)` sources |
| Mechanics registry | `state/mechanics.ts` | Help wiki + What's New + tour from one def list |
| Validation | `core/validate.ts` | dev-boot content invariants across all registries |

## Maintenance rules for THIS document

- **When you change a system, update its section** (files moved, limitations fixed, expansion
  shipped). Wrong manifests are worse than none.
- New systems get a section with the same seven fields.
- Keep each section ≤ ~15 lines — this is a map, not the territory (the linked doc is).

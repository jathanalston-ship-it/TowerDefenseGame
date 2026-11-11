# PROJECT_MANIFEST.md — ASSIMILATION: the single source of truth

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

**The game:** ASSIMILATION — a bio-horror tower defense. React 18 + TypeScript (strict) + Vite,
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

## Story film accessibility

`ui/CutscenePlayer.tsx` and `ui/InitCutscene.tsx` support manual reading, keyboard scene controls, modal focus restoration and reduced-motion repaint on viewport changes. See `docs/CUTSCENES.md`; reward/unlock data and simulation are unchanged.

## System index

[Campaign](#campaign) · [Infinite](#infinite) · [Arena (Live PvP)](#arena-live-pvp) ·
[Online Foundation](#online-foundation) · [Mega Bosses](#mega-bosses) · [Power Score](#power-score) ·
[Tower Stars](#tower-stars) · [Tower Mastery / Adaptation](#tower-mastery--adaptation) ·
[Heroes](#heroes) · [Hero Equipment](#hero-equipment) · [Hero Symbiotes](#hero-symbiotes) · [Gene Cards](#gene-cards) ·
[Equipment](#equipment) · [Crafting / Reforging](#crafting--reforging) · [Loot](#loot) ·
[Collections](#collections) · [Evolution (Genome Cores)](#evolution-genome-cores) ·
[Prestige (Molt / Ascendant)](#prestige-molt--ascendant) · [Currencies](#currencies) ·
[Splice Market (Ichor)](#splice-market-ichor) ·
[Achievements](#achievements) · [Tutorials & Onboarding](#tutorials--onboarding) · [HUD](#hud) ·
[Audio](#audio) · [Visual Effects](#visual-effects) · [Arena Layouts](#arena-layouts) ·
[Threat Ladder](#threat-ladder) · [First-Session Probe](#first-session-probe) · [Save Data](#save-data)

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
- **Batch G (2026-11) — the opening + the finale:** `CAMPAIGN_OPENING` keeps fliers out of wave 1 (≤ 4 in wave 2) and surfaces a stage's Mega with wave 3; from Stage 4 the free first organism answers the opening (`core/conveyor.ts`); waves ≥ 4 and every boss scale with the run's LIVE Power ratio (`DIRECTOR_ADAPTIVE`, §6a). Mission card shows wave 1 (`state/missionBrief.ts`). Docs: `CAMPAIGN.md` §opening, `DIFFICULTY_DIRECTOR.md` §6a.

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
- **Batch G squeeze (`ENDLESS_SQUEEZE`, RunOptions.squeeze):** flawless waves past depth 10 tighten enemy HP (≤ ×1.4), heavy leaks ease it; a per-wave damage ceiling makes runs end by attrition, not one wipe. Docs: `ENDLESS-SCALING.md`.

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
- **Mega Hunt (Batch G):** each raid earns a wound tier (`RunStats.megaHunt`); Hunt Ranks key off lifetime organs burst (`megaProgress.weakPoints`) and pay half a frontier first-clear in Cores once per rank; `C.megaStagePremium` re-measured to ×1.15. Docs: `MEGA-BOSS.md` §hunt.

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
- **Coverage model (§6a v4):** `core/coverage.ts` grades every tower kind on reach/area/pierce/burst/
  control from data; live waves probe the board's thinnest axis (`LIVE_PROBE_ROLES`), named in the
  briefing ("⌖ ARTILLERY · lacks burst").
- **LIVE board power (Batch G, §6a):** `RunOptions.livePowerBase` re-feeds `threatPerPowerRatio` (0.5) at every Campaign wave launch — upward only, capped; HUD `▲ ADAPTED ×N`. Known limit: the ratio ignores board size (§7).

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
- **Honest goals (Batch G, save v56):** `state/income.ts` keeps a per-run income ledger; `nextGoals` gives every goal an ETA in runs and sorts by it; "one more run" only when ETA ≤ `INCOME.honestRuns`; Home's CTA becomes "Farm Infinite" when under-powered. Docs: `ONE-MORE-RUN.md` §eta, `COMMAND-CENTER.md`.

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
  Detectors are Molt-aware (Power drops ×3–18 after each Molt) and compare band peaks; sim
  loot is seeded (`withSeededLoot`), so reruns agree. Decisions log: BALANCE_ARCHITECTURE §9.

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

Career statistic hints use explicit Details buttons and inline reading panels. Profile power categories use native expandable rows with 44px targets and inline explanations; multipliers display up to four decimal places. Attribution and score formulas are unchanged.

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

## Hero Symbiotes

- **Purpose:** the champion wing of the Mulligan pillar — per-hero grafted organisms (3 gated
  slots × 3 organ seats from a 36-species catalog) whose kit is BEHAVIOR VERBS only (strike
  toxins, kill plague/surge, ability echo, overheal carapace, revive cocoon, aura swell, summon
  nurture, adaptive AI); by type it can never duplicate Hero Equipment stats. Per-slot Complete
  Hero Adaptations, category-census Resonance across all three slots, per-hero identity trials
  (Ichor), staged visual mutation.
- **Dependencies:** Mulligans (rarity ladder/level caps), Heroes (HeroMods fold), Power
  (mulligans bucket), Genome Rank, Collections, save (`heroSymbiotes`, v41), Gene Essence + Ichor.
- **Files:** `core/heroSymbiote.ts` (catalog/adaptations/resonance/gates/resolver/sanitizer),
  `types.HeroSymbioteKit` + `HeroMods.symbiote`, seams in `core/game.ts` (foldHeroSymbiotes +
  presence-gated reads; killing-blow credit `Enemy.lastHitHero`), `render/heroSymbiotes.ts`
  (stage visuals), `ui/SymbioteChamber.tsx` (Hero Lab console). Docs: **`HERO-SYMBIOTES.md`**.
- **Related:** Hero Equipment (the contrast — external gear vs grafted biology), Nucleus
  Mulligans (the gate/console template), Mastery (hero kill credit now feeds `heroKills`).
- **Future expansion:** a new organ = one registry row; a new verb = one optional kit field +
  one gated seam; a fourth slot / new resonances are data (`SYMBIOTE_SLOTS`, the census table).
- **Known limitations:** hero kill credit lands on KILLING BLOWS from strike/ability paths only
  (deferred projectiles like siege shells carry no hero source — the pre-existing damage-credit
  semantic); gate thresholds are first-pass calibrations pending persona-simulator review.
- **Developer tips:** a NEW HERO must add its `HERO_SYMBIOTE_GATES` pair (compiler-enforced) and
  its `HERO_SYMBIOTE_VISUALS` stages (test-enforced). Never give the kit a stat field — that is
  equipment's language, and the separation is the system's identity.

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
- **Draft fit / opening draft / Splice (Batch G):** `RunOptions.draftFit|openingDraft|splice` (chosen by `cards.ts draftFeaturesFor`; golden path never sets them): deals weighted by live damage share, recency and bank; ◆PICK = fit × Power; Campaign from Stage 8 opens with a draft; Splice buys an extra draft with banked Biomass (a recorded input). All deals go through `Game.dealDraft`. Docs: `CARDS.md` §fit §opening §splice.

## Equipment

- **Purpose:** ~180 weapons/armor/relics with affixes and sets — the build-defining gear layer;
  drops from Bio-Containers, managed in the Armory.
- **Dependencies:** loot rarity framework, affix rolls, Power (item scoring), save inventory.
- **Files:** `core/equipment.ts` (items, affixes, sets, `RARITY_ORDER`), `state/itemPower.ts`,
  `ui/EquipmentPanel.tsx`, `ui/ItemDetails.tsx`, `ui/components/ItemArt.tsx`.
  Docs: `EQUIPMENT.md`, `EQUIPMENT-PHILOSOPHY.md`.
- **Related:** Hero Equipment (loadouts), Crafting (reforge), Loot (acquisition), Collections.
- **Card motion:** ItemArt honors live reduced motion/override and pauses offscreen or hidden; static lower rarities are unchanged. HeroGearPreview also pauses while retaining still-mode drag inspection and uses refresh-independent rotation. Native Left/Right buttons support keyboard inspection and pause automatic motion while focused.
- **Future expansion:** 500-item target; behavioral affix vocabulary keeps growing.
- **Known limitations:** exotic rarity is loot-only in places (can't transmute past legendary).
- **Developer tips:** destruction safeguards + Undo Salvage exist (`EQUIPMENT.md §safeguards`) —
  route ALL item deletion through them, never delete inventory rows directly. Item Details salvage confirmation is viewport-portaled, keyboard-contained and restores focus on cancellation. Favorite/item/affix locks expose their current toggle state to assistive tools. Disabled upgrades explain material deficits and affix/tier/rarity gates. Item Details manages keyboard entry, containment and return focus while deferring to nested confirmation. Armory filters remain recoverable after inventory changes, with a sort-preserving Clear filters action. Quick-Salvage reports eligible selections hidden by current filters.
- **Gear chase (Batch G):** item level follows depth on an uncapped log curve (`ITEM_LEVEL_CURVE`, T6 from ~Stage 100); rarity per item-level band (`GEAR_RARITY_BANDS`, `gearRarityOdds` is the one source for roll + Armory line); permanent Gear Codex (`equipment.discovered`, v56). Known limit: base effects dominate item Power. Docs: `EQUIPMENT.md` §gear-chase §codex.

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
  `ui/GeneticVault.tsx`, `ui/VaultReveal.tsx`, `ui/LootMeter.tsx`, `ui/LootToaster.tsx`. Container notices pause for reading and support keyboard dismissal with queue/final focus restoration. The HUD loot meter exposes named live progress derived from its visual fill and links keyboard focus to its explanation, which directs players to open completed containers in the Genetic Vault and shows zero remaining points when full. Loot celebration CSS honors the shared motion override even for the body-portaled flight.
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
- **Files:** `core/collection.ts` (view + tiers + bonuses + rewards), `ui/CollectionPanel.tsx`. Collection tabs and category drill-in preserve keyboard navigation/focus; undiscovered entry labels/tooltips conceal names while keeping status readable. Rank-up celebrations support keyboard focus, scrollable results and live reduced motion. Memory Archive supports revealed-copy search, recovery filters and accessible replay controls (see `CUTSCENES.md`).
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
  The MOLT IMPRINT (`moltImprint` / `imprintedUpgrades`, `PRESTIGE.molt.imprintPerMolt`/`imprintMax`)
  keeps round(level × min(0.7, 0.0125 × Molts done)) of each upgrade; `meta.ts moltedSave` builds
  both the Molt and `moltPowerPreview` — keep it the one builder (BALANCE_ARCHITECTURE §9.6).

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

- **Purpose:** milestone recognition with Genome Core rewards, surfaced in Profile and toasts. Gallery cards explicitly label earned/in-progress/undiscovered status, name reward currency and preview next ladder rewards without exposing secrets.
- **Dependencies:** run summaries + lifetime stats; rewards auto-grant.
- **Files:** `state/achievements.ts` (defs + checker), `ui/AchievementPanel.tsx`,
  `ui/AchievementToaster.tsx`, inline strip in `ui/RewardReveal.tsx`.
- **Related:** Stats, Results (end-of-run reveal), notifications (profile badge). The Profile Trophy Rack names mounted/owned/full/locked states and unlock sources; next-slot guidance derives from TROPHY_SLOT_THRESHOLDS.
- **Future expansion:** an achievement is a def row (`test`, `progress`, `reward`).
- **Gallery navigation:** shared search and All/Not earned/Earned chips filter authored milestones with a live count. Search uses only revealed name/description text; lifetime ladders remain a separate section.
- **Developer tips:** achievements check on run finish (`checkAchievements`) — a new stat needs
  to be in the run summary or lifetime stats first.
- **Ladders (Batch G):** `LADDER_FAMILIES` rows generate geometric rungs over lifetime ledgers (Cores-only rewards, kept out of authored totals; one gallery card per family); Results folds rungs crossed together into one line (`collapseLadderRungs`). Docs: `PROGRESSION-SYSTEMS.md` §ladders.

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
- **The first hour (pacing):** `state/mechanics.ts` (`isMechanicUnlocked` — the seal rule;
  `ANNOUNCE` + `pacedAnnouncements` — at most 2 What's New cards per finished run, a revealed screen's
  lesson first), `meta.whatsNew()` (the session-memory beat), `state/fieldNotes.ts` + `ui/FieldNote.tsx`
  (in-run controls taught mid-fight). Tests: `state/firstHour.test.ts`. Docs: PROGRESSION-GATING.md
- **Class Bonds (2026-11-06):** `core/classBonds.ts` (tables, fold, cost, Power, sanitizer) → `Game`
  (`RunOptions.classBonds`; `refreshBonds` + `towerAttackMods` / `heroDamageMult` / the wave-clear mend),
  `ui/BondsScreen.tsx` (Evolution Hub wing, level-ups via `meta.upgradeBond`), `ui/BuildPanel.tsx` (the
  in-run strip) + conveyor class marks; taught by mechanics `class-bonds` / `bonds-in-battle`, a GUIDES row
  and a FIELD_NOTES row. Docs: CLASS-BONDS.md
- **The first loop (2026-11-06):** `state/firstLoop.ts` (three coach beats — DEPLOY / GROW / COLLECT —
  as data: anchor, nav, click-or-next, `done`) + `ui/FirstLoopCoach.tsx` (lazy) walk a new account's
  first hub visits hands-on, replacing the passive HUD tour for new accounts; while a beat is due the
  coach owns the hub (What's New, briefings and placards wait) and the Command Center grows with it
  (homeRegistry `when` gates). Progress = tutorial milestones `first-loop:*`. A new early-game lesson =
  one step row. Tests: `state/firstLoop.test.ts`; e2e: the first-session probe plays the whole loop.
  Docs: TUTORIAL.md §first-loop
  §announcements, GUIDED-UNLOCKS.md §field-notes. A new in-run lesson = one `FIELD_NOTES` row.
- **The opening film (first boot, before the tutorial):** `ui/InitCutscene.tsx` (scene DATA:
  copy, `cin_*` beats, `copyAt`, the title's `eyebrowAt`/`ctaAt`) + `render/introScenes.ts` (six
  painters; the swarm + answer scenes draw the REAL roster through `render/enemyForms` /
  `render/towerForms` — cast tables `SWARM_CAST`/`DEFENDER_CAST`/`APEX_CAST`). Its own chunk:
  `ui/IntroMount.tsx` lazy-loads it (black hold; skips the film if the chunk fails); the boot side is
  `ui/introState.ts` (seen flag + `useIntroPlaying` for the tutorial banner). Docs: GAME-FEEL.md §intro.

## HUD

Post-run `RewardReveal` preserves Continue focus when its focused Skip control disappears, without moving focus from another control. See `docs/HUD.md`.

- InfestationBoard on The Front follows shared live motion preferences, keeps reduced-motion canvas/sector geometry aligned on resize and stops its loop while hidden. Feed buttons expose actual selection state, distinct from a region-resolved feed marker. See INFESTATION.md.

- Very narrow portrait Early Call uses a reserved second control row so it remains reachable without covering the battlefield. See EARLY-CALL.md.

- BuildControls exposes live Auto Wave/Auto Gene explanations through a44px help button and its existing briefing reader; no automation behavior changes. See HUD.md.

- HUD explanations open below their readouts with inward edge alignment and active stacking above run controls. Space while reading a focused HUD cell cannot start waves; Hero activation and board shortcuts retain their behavior. See HUD.md.

- Toolbar hero auto-cast exposes its toggle state after unlock and under Hive management; the initial unlock retains purchase-button semantics. Favorite/conveyor placement exposes armed state, and conveyor deploy names include organism/cost. Consumed cards restore keyboard focus; free starting organisms display their actual zero recycle refund. Sale/branch confirmations contain keyboard focus and cancel on Pause; completed/unaffordable upgrades return focus to their tier preview. See HUD.md.

- **Purpose:** the in-run interface — resources, wave state, tower rail, inspector, draft,
  build controls, live Power — and the Hub shell (nav, badges, rings, screens) around the game.
- **Dependencies:** `game.getSnapshot()` (~10 Hz) + `meta.use()`; notifications registry.
- Run Build drafted Gene Cards expand in-flow with exact saved descriptions, subject labels, wrapped names and explicit per-copy stack text. See CARDS.md.
- Run Build bond chips expand in-flow for touch/keyboard readers, retaining current effect, tier and next-threshold details during live updates. The HUD snapshot carries the run-resolved bond level so Daily base-strength descriptions stay accurate. See CLASS-BONDS.md.
- Run Build exposes existing doctrine/vow descriptions, active Threat rungs and current biome/event context through a keyboard/touch Run conditions disclosure; no simulation changes.
- Wave briefing chips open readable details outside the phone scroller, with keyboard focus and Escape/Close restoration. Base bounty/HP/armor labels distinguish reference values from modified run results; elite counts are inclusive. See HUD.md.
- **Files:** `ui/Hud.tsx`, `ui/Toolbar.tsx`, `ui/BuildControls.tsx`, `ui/Inspector.tsx`,
  `ui/BuildPanel.tsx`, `ui/DraftModal.tsx`, `ui/GameView.tsx` (rAF host), `ui/Hub.tsx` (nav
  shell), `ui/hubProgress.ts` (rings), `state/notificationSources.ts` (badges). The HOME
  screen is the Command Center (`ui/CommandCenter.tsx` + `ui/homeModel.ts` registry +
  `ui/WorldStatus.tsx` living centerpiece (live resolved motion preferences, still account/resize repaint) — `COMMAND-CENTER.md`): registry-driven widget
  zones (command strip, world status, mission control, forecast/roadmap rail, live army,
  command feed, dashboard); a future system's home widget = one register() + one renderer.
  Shell kit (2026-11): `ui/browserBack.ts` (Back/Escape + `useDismiss`), `components/
  ScreenBoundary.tsx`, `AdviceLink.tsx`, `SectionNav.tsx`, `LoadoutStrip.tsx`, `ChipPopover.tsx`,
  `ClaimAll.tsx`, `MotionSettings.tsx`, `CentreStage.tsx`.
  Docs: `HUD.md`, `READABILITY.md`, `UI-MOTION.md`, `NOTIFICATIONS.md`, `COMMAND-CENTER.md`, `HUB-FLOW.md`.
- **Related:** everything player-facing; the motion language in `index.css`.
- **Future expansion:** new Hub screen = NavKey + section entry + notification channel.
- **Known limitations:** `index.css` is still the largest stylesheet (~6.9k lines: tokens, shell, HUD-adjacent
  and shared rules); since 2026-11-05 each lazy module carries its own sheet (`src/ui/<Screen>.css`,
  docs/DEPLOYMENT.md §boot-css) and the boot CSS is budgeted by the first-session probe.
- **Developer tips:** UI reads snapshots — never reach into live sim entities from React;
  intents go through `Game` methods. A new modal joins Back/Escape with `useDismiss(close)`.
- **VFX pass (2026-11-05):** the combat damage language (`render/combatFx.ts` — one shot/burst form per
  combat class, striker-tinted; splash at true radius; damage-number + reaction-label crowd budgets), one
  telegraph language for bosses/Mega/hero casts (`render/telegraphs.ts` — WHERE/WHEN/LAND on the sim's real
  cooldowns), biome ground + tower deploy/evolve moments + the Hive Core integrity arc
  (`render/biomeGround.ts`, `render/towerMoments.ts`), and one rarity language for every item surface
  (`ui/components/RarityFx.tsx` + the RARITY FX css section). Docs: COMBAT-VISUAL-STANDARDS, BOSS-DESIGN
  §telegraphs, MEGA-BOSS, HERO-CINEMATICS, LIVING-BATTLEFIELD, GAME-FEEL, LOOTBOX §rarity-fx.
- **Early Call (Batch G):** `⏩ Call early +N` in the run-controls strip / Space mid-wave (`Game.callWaveEarly`, a recorded input; owed drafts dealt at the clear); Splice pill in the build phase. Docs: `EARLY-CALL.md`.

## Audio

- Music enable restores the latest looping scene requested while muted, including boss binding; explicit stop clears it and one-shot ceremonies are not replayed. Shared output mute covers scheduled flourishes and stays silent during volume/duress updates. See MUSIC.md.

- **Purpose:** synthesized SFX bus (no audio assets) — cues for combat, UI, rewards, branch
  tiers; heartbeat tempo under pressure — plus the ADAPTIVE SOUNDTRACK: a motif-library score
  (15-track data library, 8 intensity-gated layers, scene/rotation/progression-weighted
  selection, stable per-boss themes, reward stingers, near-death duress, bar-aligned equal-power
  crossfades, mastering compressor).
- **Dependencies:** WebAudio; volume/on-off persisted (`audioOn` key); `core/events.ts`
  (`bossKilled` → the bossDown stinger).
- **Files:** `audio/sound.ts` (SFX bus + all synths + the cue→stinger `STING` bridge),
  `audio/sfxMix.ts` (THE MIX as data: categories, loudness targets, the audit-derived trim table,
  variation, voice budgets, the master chain), `audio/music.ts` (pure composition core + the music
  manager), `ui/MusicDebug.tsx` (Settings dev console; 44px input/slider targets), `scripts/audio-audit.ts` (`npm run
  audio:audit` — renders every cue offline → `docs/AUDIO_REPORT.md`). Docs: `AUDIO.md`, `MUSIC.md`,
  `GAME-FEEL.md`. A new cue = a `case` + a `CUE_MIX` row (`sound.test.ts` enforces), its trim from
  `npm run audio:audit -- --only <tag> --suggest`.
- **Related:** HUD (UI cues), Loot reveals, Star ceremonies, branch evolution, Assimilation
  Index (intensity floor), Hub (menu scenes), GameView (category/boss/duress).
- **Future expansion:** new SFX cue = a synth function + a tag; new track/motif/stinger = one
  data row in `music.ts`; a new boss hash-assigns its theme (or one `BOSS_THEME_OVERRIDES`
  entry); real audio assets could layer in behind the same `audio.cue(tag)` / voice functions.
- **Known limitations:** fully procedural — distinctive but synthetic (choir is detuned
  triangles, not voices).
- **Touch settings:** Audio/motion switches keep44px coarse-pointer targets in Settings and the scrollable pause menu.
- **Developer tips:** SFX API is `audio.cue(tag)` / `audio.resume()` (autoplay policy); music
  API is `music.play(category, opts)` + `setIntensity`/`setDuress`/`setScene`/`setProgression`/
  `stinger` — callers never pick tracks (there is no `audio.play`). Audition everything in
  Settings → Music Console (dev builds).

## Visual Effects

- **Purpose:** battlefield juice — particles (muzzle, impacts, deaths), the STATUS EFFECT
  VISUALIZATION framework (trait-merged overlays/particles per afflicted body), hit-confirmation
  sparks + status-flavored death reactions, tower anticipation personalities, hero ability
  activation/ready cues, projectile power scaling, tower visual evolution (star/branch-driven),
  range/zone visualization, screen motion tokens.
- **Dependencies:** render state from the sim (sim particles are SIM entities for determinism);
  `render/` draws, never mutates; status fx TRAITS are data on `StatusEffectDef` (core).
- **Files:** `render/renderer.ts` (battlefield), `render/statusFx.ts` (status merge + painters),
  `render/towerForms.ts` (`FORM_ANTICIPATION`), `render/towerEvolution.ts` (evolving tower
  bodies), `render/feel.ts` (FEEL table + centre-stage `Announcer` + `LAST_KILL`), `render/impactFx.ts`
  (boss-fall rings, ult impact frames), the Batch 3 signature moments — `render/lastKill.ts` (the
  wave's last-kill beat), `render/runOutro.ts` + `ui/components/RunBackdrop.tsx` (victory wash /
  defeat cracks → Results on the final frame), `render/gutters.ts` + `ui/components/LivingGutters.tsx`
  (the biome past the board edge), `render/filmDirection.ts` + `megaboss.ts drawMegaPose` (films that
  move; premieres paint the real Mega) — see `SIGNATURE-MOMENTS.md`, particle spawn in `core/game.ts` (`ParticleKind`s), CSS motion tokens in
  `index.css`. Docs: **`COMBAT-VISUAL-STANDARDS.md`** (the feel contract + future-content
  checklist), `TOWER-VISUAL-EVOLUTION.md`, `RENDER-PIPELINE.md`, `UI-MOTION.md`,
  `PLACEHOLDER-ART.md`.
- **Related:** Status engine (every def carries a validator-MANDATORY `fx` trait block), Tower
  Stars/Branches (visual escalation), HUD readability rules, Audio (`statusApplied` cues).
- **Future expansion:** a new status authors ONE `fx` block and every visual (merge, synergy
  blend, intensity, death flavor, audio category cue) rides free; art lands behind the same
  procedural fallbacks — swap-in by key, no system changes.
- **Known limitations:** everything is procedural placeholder art by design (EA).
- **Developer tips:** sim particles live in the SIM (golden-relevant!) — visual-only tweaks
  belong in the renderer (statusFx pools/sparks are render-local, capped, deterministic). Never
  draw a bespoke per-status ring; add traits and let the merge compose them. Per-frame colours with a
  dynamic alpha go through the memoized `theme.rgba(token, a)` — never a template literal in a draw
  loop; `npm run perf` measures the loop (deterministic frozen scene + live fight + click handling) —
  `RENDER-PIPELINE.md` §6 has the frame budget and the levers not yet pulled.

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

## Online Foundation

Global standings offer retry/refresh with announced request status and labeled columns; changing modes clears stale results and ignores superseded requests. Submission and ranking rules are unchanged. Replay sharing has localized pending/success/failure feedback and a selectable manual-copy fallback when clipboard access is unavailable; outdated async results are ignored. Replay Theater manages modal focus, exposes playback state/progress and resumes pacing when skipping from pause; simulation and verification are unchanged. Skip-to-outcome drains/discards combat cues and suppresses delayed clear fanfares; normal playback audio remains active. Daily replay input accepts links/codes locally, supports Enter and ignores outdated decode results after edits or unmount.

- **Purpose:** the authoritative online architecture every online feature inherits — the
  replicated command vocabulary (ONE `applyArenaCommand` path onto Game intents), the versioned
  wire protocol (deterministic lockstep: only commands cross the wire; command-log replay IS
  rollback/reconnect), state digests (desync/tamper tripwire), the server-authority policy
  table, and the Auction House backend prep: per-item provenance stamps with self-healing
  load-time coverage + trade eligibility/fees/fraud heuristics in Ichor. NO trading gameplay/UI
  exists by design.
- **Dependencies:** the deterministic sim (the lockstep dividend), save v47 (`provenance`),
  Splice Market (Ichor identity), the Pages Functions backend.
- **Files:** `core/online.ts` (protocol/commands/digests/authority), `core/itemIdentity.ts`
  (stamps + reconcile), `core/trading.ts` (eligibility/economics/fraud), `net/arenaTransport.ts`
  (loopback network model + the dormant WebSocket relay), `net/arenaSession.ts` (beacons/resync/
  liveness). Docs: **`ONLINE-FOUNDATION.md`**, **`TRADING-PREP.md`**.
- **Related:** Arena (the first consumer), accounts/sync (reconciliation lane), leaderboards
  (the claims-with-bounds precedent it generalizes).
- **Future expansion:** a future online feature = one command union member + one
  `PROGRESSION_AUTHORITY` row + provenance stamps if it grants items; the Auction House needs
  ONLY a D1 schema + endpoints + UI (identity/eligibility/economics/fraud are done).
- **Known limitations:** no deployed realtime relay yet (the AI framework carries launch; the
  transport seam is config-away); trade heuristics are server-callable but not yet served.
- **Developer tips:** never mutate a remote sim directly — commands only; never trust a claim
  field the shared validators don't check; the mirror is frontier-bounded so commands land on
  exact ticks — keep it that way or live and replayed mirrors diverge.

## Arena (Live PvP)

- **Purpose:** the live-PvP pillar — the mirror SIEGE RACE (two sims, one shared escalating
  assault, no Mega Bosses), Power-bracket matchmaking with the honest 20s window → seamless
  procedural AI opponents, ranked divisions (Spore→Apex Strain; placements/streaks/decay/30-day
  soft resets), the wins-only 100-level Arena Pass with procedurally rotated seasonal tables and
  the alternating arena-exclusive crowns, and modest diminishing Idle-Harvest rank dividends.
- **Dependencies:** Online Foundation (protocol/authority), the sim (`RunOptions.noMega`),
  Battle Pass (the PassReward interpreter), Idle Harvest (the dividend params), Power (brackets).
- **Files:** `core/arena.ts` (divisions/rating/seasons/claims/rewards — shared with the server),
  `core/arenaPass.ts` (tracks/exclusives/season identity), `core/arenaAi.ts` (procedural
  accounts + the controller), `core/arenaMatch.ts` (orchestration/rollback/anti-cheat boot
  validation), `ui/ArenaScreen.tsx` (hub + queue), `ui/ArenaView.tsx` (the dual battlefield +
  PvP HUD), `net/arenaReport.ts`, `functions/api/arena/*`, `migrations/0005_arena.sql`,
  `save.arena` (v47). Docs: **`ARENA.md`**.
- **Related:** the exclusives (Basilisk Maw / Ossuary Choir / Chimera — full content pieces
  through every validator), Genome Rank (the zero-Power prestige-lane precedent rank follows).
- **Future expansion:** a real relay makes human matches a config value; seasonal rulesets hook
  `pvpLegality`; arena wardrobe cosmetics are one unlock-source row away.
- **Known limitations:** arena runs deliberately do NOT feed PvE ledgers (mastery XP, lifetime
  stats, loot meter) — PvP progression is its own lane; the match view is a lean command
  surface (no branch/strain console mid-match yet); wave composition can diverge between the
  two sims via combat-rng consumption (budgets identical by wave index — fair in expectation).
- **Developer tips:** settle ONLY through `meta.settleArenaMatch` (exactly-once, shared
  validators); grant exclusives ONLY through the level-100 claim (`grantArenaExclusive`); the
  `arenaExclusive` def flag must be honored by any new unlock/shard surface.

## Arena Layouts

- **Purpose:** varied battlefields as data — each layout is one registry row (obstacles,
  optional spawn spans); `classic` is the original `OBSTACLES` arena.
- **Dependencies:** `map.ts` `NavField` (flow field + goal distances per layout), campaign/daily/
  infinite stage selection, the renderer (`RenderState.layoutId`).
- **Files:** `core/mapLayouts.ts` (13 layouts + validator in `validateAllContent`), `core/map.ts`
  (`NavField`, module helpers still read the default field). Docs: `MAP-LAYOUTS.md`.
- **Related:** Campaign (Stages 1–3 pinned classic → open maw → twin lanes; later stages roll,
  biome-weighted, no repeat; flank/pincer from Stage 11), Daily (seeded roll), Infinite/Arena
  (rotate at each biome change, starting classic). Skirmish, tutorial, Boss Rush and golden
  autoplay stay classic.
- **Future expansion:** a new battlefield is one data row; the validator proves reachability,
  no pockets and clear spawn/defense rows.
- **Known limitations:** the board stays 18×24 / 27 slots; layouts change paths, not slot
  geometry. Solid walls steer enemies back out rather than upstream (upstream deadlocked).
- **Developer tips:** the Game owns its field — never call module flow helpers from new sim
  code; go through the Game's `NavField`. Old replays without a layout replay on classic.

## Threat Ladder

- **Purpose:** an opt-in difficulty ladder (Heat/Ascension style) for content the player has
  already beaten — 10 rungs, each one named lever, with cosmetic rewards only.
- **Dependencies:** difficulty director (`createDirector({threat})`), economy director
  (`threat.reward` factor), campaign/infinite/boss-rush records, profile cosmetics.
- **Files:** `core/threat.ts` (rungs, warp, reward), `state/meta.ts` (records, clamp on
  `finishRun`), `ui/components/ThreatPicker.tsx`; save field `threat` (v55). Docs: `THREAT.md`.
- **Related:** Hive Intelligence / Auto Gene are off above a mode's best cleared Threat
  (`hivemind.ts automationGate`); titles at 3/5/7/10, frames at 5/10, achievements `threat_3/5/10`.
- **Future expansion:** new rungs or levers are data rows; per-mode reward tables.
- **Known limitations:** Daily is excluded (shared board). The HUD already uses "THREAT" for a
  danger meter — naming overlap noted.
- **Developer tips:** Threat 0 is an identity pass-through — goldens depend on it.

## First-Session Probe

- **Purpose:** a repeatable, budgeted first-session playthrough so onboarding regressions are
  measured, not guessed.
- **Files:** `scripts/first-session-probe.ts` (`npm run probe:first-session`, `--offline`,
  `--shots`), `docs/FIRST-SESSION-PROBE.md` (how to run), `docs/FIRST_SESSION_REPORT.md`
  (generated).
- **Budgets:** 0 page errors, ≤3 modals after run 1, first tower ≤15 s (cutscene skipped), boot
  JS ≤560 KB gzip, session completes.
- **Related:** code-splitting (`ui/lazyNamed.ts` — every new hub screen must be lazy or the boot
  budget trips), the tutorial's DOM anchors (`.tut-callout`, `[data-tut]`, `.conveyor`,
  `.results-screen`).
- **Known limitations:** timing budgets are noisy on a loaded machine; rerun before trusting a
  1–2 s miss.

## Save Data

- **Purpose:** versioned, checksummed, browser-local persistence with additive migrations,
  per-field sanitizers, rotating backups, export/import, Developer Reset scopes.
- **Dependencies:** every system's sanitizer (genes, loadouts, queue, equipment…).
- **Files:** `save/saveStore.ts` (schema `CURRENT_VERSION`, `withDefaults`, SaveStore, backups,
  session/durable storage drivers + `swapStorage` — Guest Mode's seam, `ACCOUNTS.md §guest-mode`),
  `save/saveFile.ts` (file I/O), `save/derive.ts` (shared pure derivations, e.g.
  `highestCampaignStage`), `state/devReset.ts` + `state/prefs.ts` (`DEVICE_PREF_KEYS` registry),
  `ui/SaveManager.tsx`. Backups publish their index before pruning; failed writes preserve prior snapshots and report failure in the UI. Confirmed restores keep a live recovery snapshot, protect their source from pruning and respect tab ownership; successful replacements clear older pending writes. File imports validate into a cancellable, keyboard-accessible preview; confirmed imports preserve live recovery state and commit to storage before notifying the session, with stale-tab protection. Docs: `DEV-RESET.md`, `SCALABILITY.md`.
- **Related:** literally everything permanent; Power recomputes on every persist.
- **Future expansion:** cloud sync shipped as the accounts platform (`ACCOUNTS.md` — envelope,
  sync engine, conflict flow); the schema stays additive-ready.
- **Known limitations:** browser-local only; clearing site data loses the account (export
  exists).
- **Developer tips:** to add a field: bump `CURRENT_VERSION`, default it in `defaultSave`,
  sanitize it in `withDefaults` — and add a migration test (`saveStore.test.ts` has the
  pattern). NEVER read `localStorage` keys directly for prefs — register them in
  `DEVICE_PREF_KEYS`.

---
- **v56 (Batch G):** `equipment.discovered`, `genomeRank.peakPower`, `income`, `login.incomeCores`, and the Boss Rush record epoch (`migrate()` archives a pre-v56 `rushBestBoss` to `rushLegacyBestBoss`; the board re-keys under `RUSH_BOARD_EPOCH`). Tests: `save/v56.test.ts`.

## Cross-cutting frameworks (referenced by systems above)

| Framework | Home | One-liner |
|---|---|---|
| `Registry<T>` | `core/registry.ts` | every content type self-registers; validation, versioning, aliases, modding-open |
| `CardEffect` DSL | `core/cards.ts` | the one declarative effect language (cards, equipment, collection, genes) |
| Ability components | `core/ability.ts` | tower/hero combat as data blocks run by one executor |
| Status engine | `core/status.ts` | stacking/duration/potency rules as data |
| Read-model pattern | `state/*.ts` | pure `f(save) → view` modules; UI stays logic-free |
| Update prompts | `net/swRegister.ts`, `ui/components/UpdateToast.tsx`, `ui/App.tsx` | pending service-worker snapshot plus events; prompt held outside idle hub, explicit refresh, localized dismissal with focus restoration |
| Notifications | `state/notifications.ts` | menu badges = registered `count(save)` sources; `state/rewardToast.ts` + `RewardToaster` = the ONE claim-receipt popup every hub claim presents through |
| Mechanics registry | `state/mechanics.ts` | Help wiki + What's New + tour from one def list |
| Validation | `core/validate.ts` | dev-boot content invariants across all registries |
| Layout profiles + the browser shell | `ui/layoutProfile.ts`, `ui/mobileBrowser.ts`, `ui/components/BrowserShell.tsx` | desktop / landscape / portrait interfaces stamped on `<html>`; `--app-h` (the visible height a phone browser's toolbar leaves); first-tap full screen (Android/iPad) + ⛶; the iPhone Add to Home Screen card (RESPONSIVE-DESIGN.md §browser) |

## Maintenance rules for THIS document

- **When you change a system, update its section** (files moved, limitations fixed, expansion
  shipped). Wrong manifests are worse than none.
- New systems get a section with the same seven fields.
- Keep each section ≤ ~15 lines — this is a map, not the territory (the linked doc is).


## Hive Intelligence continuous toggle

Campaign Stage 5 completion unlocks a run-local ON/OFF helper in Campaign and Infinite, including new campaign stages. It buys through the existing planner, starts waves and chooses recommended genes with a visible countdown. Stop from the battlefield or draft; Pause suspends actions. Daily, Boss Rush, Quick Skirmish, tutorials and uncleared Threat levels remain excluded. See `docs/HIVE-MIND.md`.

Hive-aware tower confirmations: sale quotes derive from the live selected tower. Branch purchase intents include the displayed tier; GameView rejects an intent if the tower has advanced. A pending first-tier prompt reports a changed upgrade, disables Commit and focuses Cancel after a Hive upgrade. Selection changes clear stale prompts. Costs, refunds and simulation APIs are unchanged.

Run control accessibility: speed buttons expose aria-pressed from the same state that drives their visual selection and simulation speed, including F cycling and automatic slowdown. Early Call and Splice accessible names describe their live wave/reward or draft cost. No timing, costs, hotkeys or simulation changes.

Hero Ops ability wheel uses HudSnapshot.hero.abilityCdMax (the resolved live cooldown), with zero fill while recovering. Its named image and tooltip distinguish recovering/recharging/ready/armed, without live-region countdown chatter or changes to casting/cooldown simulation.

Selected-hero ability cooldown totals use the existing heroAbilityCooldownFor calculation; star-skill totals use the same progression multiplier as skill casts. HeroSelectPanel displays the live ability total to one decimal place and suppresses Ready/fill while downed. This is observational only: no cast timers, combat effects, saves or balance changed. Attack/pulse gauges use the observed cadence described below.

Observed attack/pulse cadence: Game keeps presentation-only WeakMaps keyed by hero, recording the unchanged timer immediately after each attack/pulse starts. Selected-hero gauges and attack-speed text read that interval, including siege/mega-raid transitions; before the first action they use the behavior baseline. These maps are never read by combat or serialized. Regression probes cover all12 heroes with haste and a Vitriol raid-to-siege transition.

Recovery display: Game.heroRecoverySeconds converts the internal recovery work by the same reviveSpeedMult used in updateHero. HUD/selected-hero snapshots, Combat Console and battlefield label use that simulation-second estimate. RenderState supplies an optional per-kind map only while a hero is down. Internal timers, revival behavior and saves are unchanged. Tests compare displayed time to actual revival at1x/2x.

Active ability cycle: presentation-only heroAbilityPeriods records each cast duration. HUD abilityCdMax and selected-hero ability total retain that duration while recharging, then show the resolved next-cast duration when ready. Overdrive purchases never rescale the combat timer; the gauge now preserves that existing rule without jumping backward.

Hero Ops ability explanation: the wheel is a44px disclosure button (aria-expanded/controls, named status and description). Click/Enter/Space toggle an inline paragraph; Escape closes it and stops propagation. Content remains in the scrolling panel instead of a clipped absolute tooltip. Opening does not arm/cast or start waves. Existing status/recovery/progress calculation is preserved.

Account-level notices: hover (non-touch) and focus pause expiry, then grant the original full3400ms/5200ms reading window on leave. A24px dismiss button supports Enter/Space; queued notices retain focus, final dismissal restores the prior connected control without stealing unrelated focus. Unlock-held notices clear reading flags and resume without replaying their cue. Timer callbacks verify the same front item before removing it. Reward grants, queue order and milestone duration are unchanged.

Reward-stack focus: dismissals capture the active stack control; after removal, only if focus fell to body, a layout effect focuses the next dismiss button or the previous connected external control. This covers the disappearing Dismiss All footer too. Navigation actions opt out so their destination owns focus. Unrelated focus, reading holds, pinning, merge windows, reward grants and queue rules are unchanged.

Update briefing presentation: ui/UpdateBriefing.css gives secondary release actions 44px minimum touch targets; see CHANGELOG-PIPELINE.md.

Update briefing keyboard lifecycle (ui/UpdateBriefing.tsx): visibility-based initial/restored focus, local Escape, contained Tab and focusable note regions; CHANGELOG-PIPELINE.md documents the behavior.

Mechanic introductions (ui/WhatsNew.tsx): one focus session across queued/summarized unlock cards, per-card dismiss focus and contained Tab/Escape; HELP.md and GUIDED-UNLOCKS.md document keyboard and settlement behavior.

HelpWiki search reports result counts and accurate no-result guidance, with keyboard-focused clear-search recovery. Reading navigation: index/Enter selection focuses the article, and Back to topics returns to its current index entry. Related links retain filter-clearing behavior; see HELP.md. Search ranking and progression visibility unchanged.

Tutorial text presentation: tutorial/primitives.tsx consumes meta-store device prefs for live resolved typewriter motion and keeps the full sentence accessible. See TUTORIAL.md and UI-MOTION.md; lesson logic/rewards unchanged.

GuidedUnlock completion (ui/GuidedUnlock.tsx, index.css): focus recovery, described result, local Escape and responsive touch controls; avoids stealing focus from real-action ceremonies. See GUIDED-UNLOCKS.md.

Story cutscene presentation: ui/CutscenePlayer.tsx follows live resolved motion/flash preferences, preserves scene clocks and avoids elapsed-beat catch-up; see CUTSCENES.md and UI-MOTION.md.

Opening cinematic (ui/InitCutscene.tsx): live resolved motion/flash preferences across gate/film/dive, elapsed-beat suppression on animation resume, safe reduced-motion dive exit. See GAME-FEEL.md and UI-MOTION.md.

CutscenePlayer visibility lifecycle preserves scene/coda remaining time, pauses caption/projector motion and resumes the visual/audio-cue clock without catch-up; see CUTSCENES.md. No global audio-setting or progression changes.

InitCutscene visibility lifecycle pauses scene holds, gate/film/dive clocks and caption animations while hidden, retaining once-only seen/completion behavior and live reduced-motion exits; GAME-FEEL.md and UI-MOTION.md document it.

## Quest Board accessibility

`ui/QuestBoard.tsx` names mission progress and claim controls with quest context and exposes reward descriptions. Progress accessibility values match the capped visible count; claims still use the existing meta pipeline. Successful focused mission claims preserve keyboard position on their completed row; successful focused batch claims return to the board heading, while rejected claims retain button focus. Keyboard claim celebrations originate at the activating control; pointer origins remain unchanged. Bursts follow live device/shared motion preferences, including the explicit override, and stop immediately when motion is disabled. See `docs/QUESTS.md`.

## Champion Contracts display clock

`ui/components/ContractsCard.tsx` refreshes its visible board every minute and on tab return, using one timestamp for roster, completion keys and countdown. See `docs/CONTRACTS.md`; no contract rule or reward changes.

`ui/MulliganLab.tsx` organism previews follow live shared/device motion preferences, pause when offscreen/hidden and redraw still graft changes. See `docs/MULLIGANS.md`; simulation, graft costs and Power are unchanged.

`ui/NucleusChambers.tsx` mutation previews follow live shared/device motion preferences, pause offscreen/hidden and retain current still mutation artwork. See `docs/NUCLEUS.md`; organ/chamber rules and Power are unchanged.

Reforge reveal accessibility (2026-11-10): MulliganLab uses the shared Popup portal to escape transformed lab panels. Its card fits the viewport and scrolls on short displays; keyboard focus enters the dialog, moves to Accept on landing, stays inside on Tab, and returns to the opener (or its programmatically focusable slot when unaffordable). Escape follows the existing landed-only backdrop dismissal. Roll, cost, binding and ceremony duration are unchanged.

Reforge wheel motion (2026-11-10): shared motion resolution honors Allow motion and listens to live preference/device changes. Reducing motion finishes the existing result immediately; a completed reveal never restarts. Animation and listener cleanup run on unmount; normal timing and roll/cost/binding remain unchanged.

Reward motion preferences (2026-11-10): RewardReveal resolves shared motion preferences at entry and subscribes to device/preference changes. Reduction reveals the already-applied reward summary immediately without restarting completed sequences; existing paused audio and focus rules remain. Shared useCountUp (results, vault summary, reward toasts) now uses the same resolver and subscriptions; completed counts do not restart. Reward amounts and actions are unchanged.

Nucleus socket accessibility (2026-11-10): both empty and filled socket controls expose aria-pressed and chamber/socket identity; armed filled sockets use a visible outline. A status line explains the selected destination. Organ-specific graft/extract labels disambiguate actions; category filters expose selection. Successful graft/extract restores focus to the destination socket after its DOM replacement. Guarded meta operations, costs, effects and adaptation cues are unchanged.

Nucleus opening focus (2026-11-10): the inline confirmation is a named group including chamber and Ichor cost. Opening focuses Not yet; cancellation restores the opener; successful guarded unlock focuses the new chamber first socket. Sequential gates, two-step confirmation, costs and XP fold remain unchanged.

Cross-platform regression launcher (2026-11-10): scripts/validate.ts invokes the installed TypeScript, Vitest and vite-node JavaScript CLIs through process.execPath, avoiding Windows npm/npx executable-shim failures without invoking a shell. The full suite uses two workers (one minimum) to bound memory; test selection and assertions are unchanged. Child failures report exit status, launch errors or terminating signals with the last twelve output lines. Mobile validation still runs the original build-and-probe path; MOBILECHECK_CHROMIUM selects the installed browser as before.

Complete class adaptation reveal (2026-11-10): shared Popup portal escapes transformed lab panels; scrollable card fits the app viewport. Continue receives focus without its former delayed entrance, Tab stays inside, and closing by Continue/backdrop/Escape restores the programmatically focusable host heading. Existing equip/adaptation completion and cue are unchanged.

Adaptation reveal decoration: rotating rays are clipped in their own inset layer so they cannot widen the overlay or create horizontal scrolling; the content card remains independently scrollable.

Graft-host keyboard navigation (2026-11-10): host tablist uses a single selected Tab stop, Arrow keys/Home/End with wrapping and nearest scrolling, and unique tab-to-panel ARIA links. Tab enters the named focusable showcase; class filters expose aria-pressed. Selection still uses the existing selectTower function; progression and graft operations are unchanged.

Mulligan currency guidance (2026-11-10): tower graft level/ascend UI and Help now name Mulligan Tissue, matching meta/model spending. Bound-organism guidance explains permanent graft binding and upgrade caps. Nucleus Gene Essence remains unchanged; no economy or save changes. See MULLIGANS.md and ECONOMY.md §8.

Harvest recommendation navigation (2026-11-10): the receipt CTA is named View next upgrade. In HarvestScreen, it closes the receipt then focuses and nearest-scrolls the corresponding named node card using the receipt recommendation id. HarvestArrival retains its existing onVisitHarvest callback. This action never calls buyIdleNode; collection, recommendation choice and upgrade prices remain unchanged.

Harvest receipt accessibility (2026-11-10): HarvestCeremony uses the shared Popup portal so transformed panels cannot displace it. The viewport-bounded card scrolls, receives initial focus, traps Tab across its actions and dismisses with shared Escape/Back. Closing restores the production heading or the arrival banner’s prior outside control when still connected. Explicit upgrade navigation skips restoration. Its backdrop uses fade-in rather than the arrival banner’s translated entrance. Collection and rewards are unchanged.

Validation environment isolation (2026-11-10): the validator explicitly launches Vitest with NODE_ENV=test, and mobilecheck explicitly builds with NODE_ENV=production. This overrides vite-node’s inherited development default only at the child boundary, preserving browser paths, compatibility preloads and other caller environment settings. Standalone mobilecheck and the nested validator now target the same production React runtime as deployment; --no-build requires a caller-provided production build.

Production growth focus (2026-11-10): NodeCard keeps its card and Grow button mounted; only the decorative ring and header restart per successful purchase. If Grow held focus before buying, focus remains on the enabled button or falls back to the named node group when the next level is gated/unaffordable. Pointer actions without focus do not steal it. Existing purchase costs, gates, sound and reduced-motion suppression are preserved.

Production upgrade guidance (2026-11-10): NodeCard receives the same idleView Chitin balance as the section header. Unaffordable, ungated nodes display max(0,cost-chitin) as a Chitin shortfall. Grow accessible names/tooltips specify node, next level and exact price. Stable useId descriptions associate the blurb and, when unavailable, shortfall/gate with the focusable group; its name includes current level. Browser accessibility snapshots verify post-purchase level1/81-Chitin shortfall and level9/CampaignStage25 gate, with unchanged debit/focus/animation.

Hive diagram motion lifecycle (2026-11-10): HiveOrganism resolves live OS reduction and allowMotion preferences through the shared prefs resolver. A layout-effect subscription controls local motion/active attributes, SVG pauseAnimations/unpauseAnimations, CSS animation play state and fill transitions. IntersectionObserver and document visibility suspend invisible work; cleanup removes subscriptions/listeners/observer. The first paint is static until preferences resolve. Motion opt-in overrides OS reduction consistently. Browser checks verify actual offscreen pause, stopped SVG timeline/CSS on simulated hidden-document events, rerender stability, resume and live preference changes. This is presentation only; production, storage and built-organ data are untouched.

Growth reveal focus (2026-11-10): HiveGrowth focuses the Return button on ceremony entry and traps Tab/ShiftTab there. The shared Popup handles Escape/Back. Effect cleanup restores the organ’s enabled Grow control or its named focusable tier group if maxed/unaffordable; missing/unmounted screens are ignored. The card is viewport-bounded and scrollable with a20px gutter. Actual-meta probes cover320x568/844x340, Escape/Return/backdrop, repeated-tier/fully-grown/insufficient-wallet fallback and byte-unchanged post-purchase save on dismissal. Purchase logic/audio unchanged.

Hosted-page keyboard navigation (2026-11-10): HostedScreen computes visible host/folded/teaser keys and gives the shared tab strip and content panel a stable useId relationship. Selected tab is the single strip Tab stop; arrows/Home/End focus and invoke the existing guarded click. Locked teasers remain arrow-focusable but cannot activate. Tab reaches a named focusable panel when a strip exists; a single-page host gets no orphan tabpanel relationship. Existing unlock predicates, deep links, badge acknowledgement, exposure and click audio remain unchanged. Actual-screen browser checks cover Hive/QuestBoard/EquipmentPanel/Wardrobe, phone widths, locked teaser Enter/deep-link guard and live Production deep links. Development probe must import the same Vite timestamped HostTabs module as the host to share its module-state request bus.

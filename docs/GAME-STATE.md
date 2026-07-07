# GAME-STATE.md — what actually exists, and its status

> **This is the canonical "is it built?" index.** (System map / first read:
> `PROJECT_MANIFEST.md`.) The design docs describe intent (some of it
> aspirational); this file tracks what the *shipped code* actually does. When a design doc and the
> build disagree, **the build wins and this file is the tiebreaker.** Prefer reading this over
> re-reading a system's implementation (per CLAUDE.md "Trust existing architecture").
>
> **Save schema:** `CURRENT_VERSION = 22` (additive migrations via `withDefaults` + per-field
> sanitizers; checksummed blob). **Stack:** React + TypeScript + Vite static SPA, deterministic sim
> core in `src/core/` (no React/DOM), Canvas renderer, browser-local saves. Tests: `npm test`
> (Vitest) — the golden characterization test pins the sim byte-for-byte.

**Status legend:** ✅ BUILT (shipped + tested) · 🟨 PARTIAL (works, but thinner than its doc) ·
📋 PLANNED (doc/spec only, little/no code).

---

## Content density (built vs. the CLAUDE.md target scale)

| Axis | Built | Target | Notes |
|---|---:|---:|---|
| Towers | 10 | 100 | each with stars + branches + mastery + Adaptation; the Coil + Siphon are locked/gated (below) |
| Heroes | 4 | 30 | Vitriol (Caustic siege) added; per-hero equipment loadouts |
| Enemies | 32 | 100 | + elites (Cyst Wraith fly+regen · Cinder Sapper burrow+suicide) |
| **Bosses** | **7 authored** | 50 | Progenitor + Milestone-1 line (6, pinned to Campaign stages 5–30) |
| Cards (genes) | 82 | 500 | effect DSL (mul/add/flag/set/grant/hook); 24 progression-`unlock`-gated (below) |
| Equipment | ~180 | 500 | weapons/armor/relics + behavioral affixes + sets |
| Meta upgrades (Genome) | 57 | 1,000 | `META_UPGRADES` |
| Ascendant (prestige) nodes | 11 | 20 | `ASCENDANT_NODES` |

Content — not systems — is the binding constraint (see EA-DESIGN-AUDIT). The frameworks below hold
20× this.

---

## Systems status

### Core sim & framework
- ✅ Deterministic tick + golden test (`core/game.ts`, `core/sim.testutil.ts`) — ARCHITECTURE.md
- ✅ **Command Center home** — registry-driven widget zones over pure read-models (`ui/homeModel.ts`);
  living World Status canvas organism (era/organs/FORM/readiness), command strip, feed (save
  timeline), unlock roadmap, forecast, live army — COMMAND-CENTER.md
- ✅ **Permanent simulation framework** — 11 player personas over the real meta layer; acquisition
  ledger (dopamine cadence), failed-push frustration model, 8 bottleneck detectors with
  severity/confidence/diagnosis; `npm run sim:report` → BALANCE_REPORT.md (**report-only** — humans
  review every bottleneck) — SIMULATION-FRAMEWORK.md
- ✅ Data-driven registries + content validator (`core/registry.ts`, `core/validate.ts`)
- ✅ Save: versioned blob, migrations, backups, export/import (`save/saveStore.ts`, UI `SaveManager`)
- ✅ Power Score index + coverage enforcement (`core/power.ts`, `POWER_RELEVANT_FIELDS`) — POWER-SCORE.md

### Towers
- ✅ **Resonance Coil** (9th tower, new `Resonant` class) — a `firing: 'beam'` MELTER: a locked,
  ramping channel on ONE target (heat 0→1 while focus holds, resets on switch; damage ×(1+heat·3)).
  The first new firing since launch; full stars + 2 branches + mastery + Adaptation. **Locked by
  default** (`unlockShards`) and **progression-gated** (`unlockStage`) — its shards only drop after
  Campaign Stage 15. See the compressed summary below.
- ✅ **Marrow Siphon** (10th tower; Vital) — the SECOND `firing: 'beam'` tower but a distinct identity:
  a CONTINUOUS drain ray that locks ONE target, RAMPS ("Gorge") while held, and siphons damage into
  Biomass (`game.beamSystem`, routed by kind alongside the Coil's `beamTowerSystem`). DOUBLE-gated —
  shards only drop after Campaign Stage 15 (`unlockStage`) and 200 must then bank (`unlockShards`).
  Ships a 7-node star path, two branches (Insatiable Gorge / Bloodwell), and a 7-card Deep-Strain gene
  set behind the same gate. **SIPHON.md**
- ✅ Stars / evolution ceremony, branches (Bloons-style), per-tower mastery — TOWER-*.md
- ✅ **Adaptation** — PER-TOWER generated trees (4 branches × 10 tiers; exclusive forks at 4/7; apex
  capstone) bought with multi-source capped **Antigen** (mastery ranks + campaign + container Traces +
  achievements); campaign gates at 15/30/50; battlefield FORM stages 1–3; priced stage-gated respec;
  a new tower's tree = one `TOWER_THEMES` row (`core/adaptation.ts`) — ADAPTATION.md
- ✅ Range identity + Final Defense Zone — RANGE.md
- ✅ **Premium combat HUD + feel pass** — phase-reactive skin (build/combat/danger), three
  aligned zones, power-gain celebration, glass depth system, premium tower cards (mastery ring,
  star pips), focal Start Wave + launch sweep, HERO OPS panel, objectives; wave banner + camera
  push, boss APEX-THREAT intro + sting, crit pop floats, placement rooting tendrils, draft
  rarity borders — HUD.md §0, GAME-FEEL.md §0
- ✅ **Danger Camera** (`core/dangerCamera.ts`) — hysteresis-gated state machine (calm→rising→
  danger→easing: confirmation window, min-hold, release confirmation, asymmetric ease) turning a
  weighted threat fold (proximity ramp × tier × health) into ONE smooth intensity that every
  tension effect keys on (vignette+heartbeat, red edge, saturation dip, banner, music — NO view scaling, retired on feedback);
  render-only (goldens untouched), targeting override stays instantaneous — CAMERA.md

### Heroes
- ✅ Roster slots (campaign-gated), per-hero equipment, mastery — HEROES.md, HERO-FRAMEWORK.md
- ✅ Adaptation for heroes (legacy shared 3-branch tree; per-hero trees are a later content pass — ADAPTATION.md)
- ✅ **In-run hero selection** — click a hero → non-modal live-state + profile panel — HERO-SELECTION.md
- ✅ **Hero Evolution** — in-run Biomass sink: 10 axes × 10 levels, all-heroes/new-heroes-inherit,
  Power-integrated, run-only — HERO-EVOLUTION.md
- 🟨 Hero abilities are largely one-verb; roster of 3 caps team-comp depth

### Bosses
- ✅ Module/phase framework + procedural assembly (`core/boss.ts`) — BOSS-DESIGN.md, STAGES.md §10
- ✅ **Role/boss battlefield visual language** — every enemy trait reads on the body (shield bubble +
  shatter, regen motes, summoner womb, aura reach, blast warning, artillery stance) and the boss
  runtime renders live (invuln shell, carapace plating, enrage rim, charge vector, channel tether,
  phase pips); Artillery fires REAL arcing shells with impact-timed Nucleus damage — ENEMIES.md §8–9
- ✅ **Wave Briefing console** (`ui/BuildControls.tsx`) — the prep popup as threat INTEL: named
  per-kind chips with tier highlighting + role tags (same vocabulary as §8), hostile count,
  wave/depth header, deploy button + LED automation switches; preview memoized per wave
- ✅ **Deployment interstitial** (`ui/DeployScreen.tsx`) — a mode-aware ~1.6s briefing breath
  between the Command Center and the battlefield (biome-tinted, spore loader, loading tip)
- ✅ **Milestone-1 line (bosses 1–6)** pinned to Campaign stages via `CAMPAIGN_BOSSES`; module spine
  `healer` / `carapace` / `splitter` fully sim-wired
- 📋 Milestones 2–4 (biome/prestige/∞ bosses + elite-variant overlay); per-boss Bestiary + first-kill
  capability rewards (see BACKLOG)

### Economy & loot
- ✅ Currencies: Genome Cores, Strain Samples (tower), Apex Genome (hero), Biomass, mats, Ascendant Cells, Ichor (premium — MARKET.md) — ECONOMY.md, currencies.ts
- ✅ Splice Market: deterministic 5-min stock windows (4 core slots + premium shelf + rotating Bio-Containers), Ichor faucets + under-water gamble EV — MARKET.md
- ✅ Genetic Vault: cinematic reveal, run-banked containers, ~50% power-scaled equipment drop
- ✅ **Crafting materials from containers** — low-chance, pity-protected Catalyst (`core/materialDrop.ts`) — EQUIPMENT.md §8
- 🟨 Mid/late-game currency SINKS cap out (star sink exhausts in tens of hours) — economy stagnation is the top P0 (EA-DESIGN-AUDIT §4)

### Equipment
- ✅ ~180 items, affixes/sets, Reforge (enhance/reroll/reforge/upgrade), salvage — EQUIPMENT.md, REFORGE.md
- ✅ **Simplified cards (Equip/Details/Favorite) + full Details screen** (`ui/ItemDetails.tsx`) — EQUIPMENT.md §4b
- ✅ **Destruction safeguards + Undo Salvage** (tiered confirms, higher-Power WARNING, NEW badge) — EQUIPMENT.md §safeguards

### Modes & progression
- ✅ Campaign (procedural stages, world map, evolution cap), Infinite (AI Director; **campaign-gated: unlocks at Stage 3**), Quick Skirmish — MODE-IDENTITY.md §gates, CAMPAIGN.md
- ✅ **HIVE SIEGE combat model** (2026-07): enemies attack the Hive Core as a live combat target
  (converge → crust rings → windup/cycle attack loops under all statuses; suicide fuses, artillery
  on the same gating, chassis boss cadence) + full contact-damage rebalance + under-attack
  presentation (damage states, shudder, groans/heartbeat, reactive HUD with attacker/DPS/survival
  readouts) — HIVE-SIEGE.md; goldens deliberately re-pinned (kills now 196/196)
- ✅ **Early-campaign difficulty contract** (2026-07): flat leak damage + EHP threat costs + per-wave
  unit/dmg/elite ramps + grace window (budget/pace/start-aid/mini-boss gate) + biome-ratchet
  `recommendedPower`; probe-verified ×0.75/×1.0/×1.25/×1.7 across stages 1–24 — DIFFICULTY.md §contract, CAMPAIGN.md §grace
- ✅ **BOSS RUSH** (2026-07; **campaign-gated: unlocks at Stage 10**): the third pillar — wave N = N procedural bosses (staggered siege
  column, thinned director escort, TL curve `RUSH.bossTlBase + bossTlPerWave·(N−1)`), Gene Card
  every 2nd wave, never-won; per-boss Core/loot bounty in `finishRun` under token mode mults;
  own records (`rushBestWave`/`rushBestBoss`), rush-short qualify gate, `prediction.bossRush`
  channel, lifetime ledgers (`rushRuns`/`rushBossKills`), 6 achievements, gauntlet terminal
  (`BossRushScreen`: ladder artwork, contract, forecast, milestones), Command Center tile,
  Help entry; proc-boss id uniquify fixes a latent concurrent-def collision; STAMINA session
  fuel (100 cap, 20/entry, +1/3min lazy regen, first-of-day FREE, market packs overflow to 120)
  and the PRIMARY Ichor lane (2 per NEW 5-boss single-run record band, weighted-common
  Bio-Container per 10-band, progress surfaced on terminal/Profile/Results); BIO-ROULETTE
  second reward ceremony (Bio-Spores = record delta + volume/5, fresh 12-pod weighted board,
  pre-rolled outcomes with momentum physics, Reveal All + one-click Absorb, spore ledger +
  2 achievements) — BOSS-RUSH.md
- ✅ Next-Goal engine + Results cliffhanger — ONE-MORE-RUN.md
- ✅ Prestige (MOLT → Ascendant) — 1 layer of a designed 6 (PROGRESSION-REDESIGN)
- ✅ Collection/Codex progression (ranks, reward tracks) — COLLECTION.md
- 📋 "Custom Challenge" / "Training" modes — hidden behind `core/features.ts` flags until built

### Balance architecture (the mathematical backbone) — BALANCE_ARCHITECTURE.md
- ✅ **Universal Difficulty Director** (`core/difficultyDirector.ts`) — ONE composition layer for
  every scaling policy (difficulty × doctrine × stage/endless curves × mode economy), byte-identical
  parity pinned; adaptive seams weight-0 — DIFFICULTY_DIRECTOR.md
- ✅ **Adaptive Economy Framework** (`core/economyDirector.ts`) — factor-traced income chains
  (Cores, loot points) + health guards (uncapped sources, geometric sinks) — ECONOMY_FORMULAS.md
- ✅ **Progression Loop Engine** (`state/progressionLoop.ts` + `LoopDirective` on Results/Campaign/
  Infinite) — 8 enforced invariants (walls form, farms pay, caps gate, prestige ring) — PROGRESSION-LOOP.md
- ✅ **Progression Simulator** (`dev/progressionSim.ts`, `npm run sim:progression`) — virtual
  accounts over the REAL meta layer, hour-band report + problem detectors — PROGRESSION_REPORT.md
- 🟨 Findings docket: optimal-play pacing hot (molt cadence), mid-late sink thinning — tuning waits
  on the change protocol (BALANCE_ARCHITECTURE.md §4/§5)

**Compressed summary (Balance architecture).** *Architecture:* four pillars. The Difficulty
Director composes every threat/economy scalar from data (DifficultyDef, DoctrineWarp, WAVE_*/
ENDLESS curves, MODE_REWARDS); consumers (game.ts run boot + curves, campaign compose, meta
settle, pickers) apply factors at their existing sites in the existing float order — goldens
byte-identical, parity suites reproduce the legacy formulas verbatim. The Economy Framework
expresses each currency's settle as base × named-factor chain (left-to-right contract) with an
`explainIncome` trace; finishRun consumes `coreShardIncome`/`lootPointIncome`. The Loop Engine
classifies push/farm from geometric requirements × logarithmic reach and surfaces one directive
on Results/Campaign/Infinite. The Simulator plays greedy virtual accounts through the real meta
APIs (only the run itself is modeled — WORLD constants) and emits hour-band medians + detector
flags. *Public APIs:* `createDirector(inputs)` + standalone policy fns (`economyFor`,
`modeCoreMult/LootMult/MasteryMult`, `doctrineEconomy`, `lootQualityTier`, `hazardRating`,
`composeStageDifficulty`); `coreShardIncome/lootPointIncome/adaptiveIncomeMult/explainIncome`;
`loopState/loopAdvice`; `simulateAccount(seed, bands)/detectProblems`. *Extension points:* new
mode = one MODE_REWARDS row + resolved difficulty; new scaling factor = one director input; new
currency = one income chain + compounding sink; adaptive tuning = weight `DIRECTOR_ADAPTIVE`/
`ECONOMY_ADAPTIVE` (config) from report evidence only. *Assumptions:* standard difficulty + no
doctrine ⇒ every axis exactly ×1; ×1 factors are IEEE-754 identity so seams live in the chains
at zero cost; parity tests update only as deliberate simulated balance changes. *Future hooks:*
biome threat bands, boss-presence weighting, prestige-tier factors, seasonal modifiers (reserved
in DIFFICULTY_DIRECTOR.md §7); simulator CLI scales to thousands of seeds. *Limitations:* the
simulator's run model is coarse (waves/kills constants); loop phase uses the campaign
difficulty's bar; adaptive inputs unwired until the loop engine feeds them (by design).

### Gene Evolution (permanent card progression) — GENE-EVOLUTION.md
- ✅ Architecture: every Gene Card is a permanent collectible (`core/geneCards.ts`, save v18/v19)
- ✅ Gene Essence: duplicate max-Star shard conversion + rare container drops, 10/50/200/1000-hr sim
- ✅ Content: 3–5 authored permanent levels for ALL 45 cards (`core/geneUpgrades.ts`), validator-enforced
- ✅ Gene Archive UI: grid + inspection + search/sort/favorites/pinning/keyboard nav (`ui/GeneArchive.tsx`)
- ✅ Campaign gates: L2@15 · L3@30 · L4@50 · L5@75, surfaced in Archive + Next-Goal
- ✅ Starting Gene Loadouts: 1→5 slots (Campaign + Genome Cores), auto-apply at run boot + splash
- ✅ Power integration: linear collection fold (`GENE_POWER_SCALE` 0.15 ⇒ ×≈2.26 maxed), real-model previews, bypass validation
- ✅ Ascension BACKEND only (tiers/rarity/art/Power/save seams + validation) — no gameplay, by design
- ✅ Onboarding: tutorial step, HUD Tour stop, Help mechanics, loading tips, in-Archive help
- ✅ **Final audit + 100/250/500-card stress test PASSED** — GENE-AUDIT-REPORT.md. The system is a
  **permanent core progression pillar** alongside Towers, Heroes, Equipment, Campaign, Prestige.

**Compressed summary (Gene Evolution).** *Architecture:* `CardDef` (cards.ts) carries optional
`maxLevel`/`upgrades`/`ascension`/`skins`/`art`; player state is a sparse `save.genes:
Record<id, GeneCardSave{level, ascension?, rarityTier?, skin?, favorite?, pinned?, timestamps}>`
owned by `core/geneCards.ts`. Ownership = `stats.uniqueCards` (draft once ⇒ collected forever).
The run seam is `effectiveGeneEffects(def, level, ascension=0)` — base + authored level effects —
applied in `chooseCard` and at boot for `RunOptions.startingGenes`. Level 0 ⇒ base effects, so
fresh saves stay golden byte-identical. *Public APIs:* `meta.upgradeGene(id)` (guarded spend:
owned + gate + wallet), `meta.setGeneSlot/swapGeneSlots/buyGeneSlot/startingGenes`,
`meta.toggleGeneFavorite/Pin`; read-models `state/geneArchive.geneArchiveRows/Summary`; economy
`core/geneEssence` (`ESSENCE_PER_SHARD`, `rollEssenceDrop`, `essenceUpgradeCost` — base
25/45/80/130 × 5^(level−1)). *Extension points:* a new card = one `CARD_POOL` row + a
`GENE_UPGRADES` entry (the validator rejects anything without 3–5 Power-visible levels); gates
are data (`GENE_LEVEL_GATES`); the loadout ladder is data (`GENE_LOADOUT_SLOTS`); Ascension
ships by authoring `def.ascension.tiers` + one wire (pass the saved tier at the run seams —
Power already counts it). *Assumptions:* the Power fold is LINEAR (`1 + 0.15·Σ(perCardMult−1)`)
so 500 cards can't explode; the sanitizer clamps levels/tiers to authored ceilings
(anti-manipulation); upgrade content must avoid boot-only fields (dead mid-run). *Future hooks:*
Ascension backend complete (`geneAscensionPowerMult`, `geneEffectiveRarity`, `geneArtKey`);
skins resolve through `geneArtKey`. *Limitations:* art is procedural (`GeneCardArt` SVG);
duplicate conversion needs max-Star units (early game leans on the container drip); the Essence
sink ≈ hour-400 at endgame income — re-tune as the library grows.

### Onboarding & UX
- ✅ Combat Tutorial, HUD Tour, Help wiki + mechanics registry, "What's New" — TUTORIAL.md, HELP.md
- ✅ **Onboarding overhaul (full audit + rebuild)** — GATED Combat Tutorial (`game.tutorialMode`:
  director scripts every wave, holds/releases the draft at its lesson, locked console/speed/hotkeys,
  sim-freezing pause, exact-element arrows, canvas-focus camera, mid-flow milestone rewards with
  idempotent ledger, skip≠completion); HUD Tour rebuilt as anchored **Field Orientation**
  (what/why/when/later per element, skip never pays, replayable from Help/Settings); mechanics
  registry +5 systems (wave-rhythm, speed, emergency-defense, adaptation, hero-evolution) + a
  "Watch out" mistakes row — TUTORIAL-AUDIT.md (findings), TUTORIAL.md, HELP.md
- ✅ Progress Prediction (self-calibrating) — PREDICTION.md
- ✅ UI motion language, reward presentation — UI-MOTION.md, REWARD-PRESENTATION.md
- ✅ Identity pass: LEXICON, ◈ star glyph, rarity grades, currency renames — LEXICON.md, IDENTITY-AUDIT.md

### Not built (structural)
- 📋 No backend → no cloud save, dailies/seasons, analytics, remote config (EA-DESIGN-AUDIT §9). This
  forecloses the live-service/1,000-hr framing until it becomes a platform decision.

---

## Compressed system summary — Resonance Beam + content unlock gating

**Architecture.** The 9th tower, **Resonance Coil** (`coil`, `Resonant` class, amber `#f5b83d`), adds
the first new *firing* since launch: `firing: 'beam'`. `Game.beamTowerSystem` (peer of `towerSystem`'s
projectile loop, dispatched before the cooldown gate like `support`) runs a CONTINUOUS, dt-scaled
channel: it STICKY-locks one target (held via `Tower.beamTarget`, the id map), ramps `Tower.beamHeat`
0→1 while focus holds (resets on a switch), and deals
`def.damage(DPS)·dmgMult·(1+heat·rampBonus·coilRampMult)·dt` to the primary + up to `extraProjectiles`
extra channels. Star/branch grants (crit/status/aura) fire on the tower's PULSE cadence. The
damage/rate fold is shared with the projectile path via the extracted `towerAttackMods` (projectile
result bit-identical ⇒ golden-safe). Tunables: `config.BEAM`. Renderer: a heat-reactive lens overlay
(`drawTower` coil branch) + a live `drawBeams` pass (tower→target line, brightness by heat). Its
full-weight adaptation tree is one `TOWER_THEMES` row; stars/branches/mastery/visuals are data rows.

**Two-layer gating (built on the existing expansion-unlock infra).**
- *Tower unlock* reuses the maw/chrysalis/effigy model — `TowerDef.unlockShards` + `save.towerUnlocked`
  + `RunOptions.unlocked` + `meta.unlockTower`/`isTowerUnlocked` — and ADDS `TowerDef.unlockStage`: a
  campaign gate so the Coil's shards only DROP after Stage 15 (`meta.towerShardPool` → the loot
  rollers' new `towerPool` arg; `meta.unlockTower` also checks the gate). Doubly gated: reach the
  stage, then grind the shards.
- *Card unlock*: `CardDef.unlock` (`campaignStage | bestWave | towerUnlocked`) marks a card GATED ⇒
  `draftCards` drops it unless its id is in the run's `unlockedCardIds` (from `meta.unlockedCardIds` →
  `RunOptions.unlockedCardIds`). The 2 Coil cards gate on Coil ownership; the 5 general cards on
  campaign/best-wave. Every card also carries authored `GENE_UPGRADES` (their per-card upgrade system).

**Invariants / golden-safety.** New `Tower` fields neutral (`beamTarget:-1`,`beamHeat:0`); gated cards
excluded from the default draw pool; the Coil never built by autoplay. Golden run byte-identical
(verified). Pinned by `core/coil.test.ts`. Coil-only knobs `coilRampMult`/`coilBeamTargets` are
FIELD_SUBJECT-mapped (→ subject `coil`) and Power-scored; the maxed gene library stays within its
calibrated ≤2.6× band.

**Known limitations.** Coil DPS in the Tower Lab reads base (pre-ramp); the ramp is the identity.
Numbers (`BEAM`, `unlockShards:320`/`unlockStage:15`, card gates) are first-pass tunables.

---

## Recently reconciled

This cycle shipped and its docs were reconciled: Adaptation (mastery→decisions), Milestone-1 bosses +
module spine, crafting materials from Vaults, the Equipment Details screen + card simplification, and
destruction safeguards + Undo Salvage. Deferred/known-thin items live in **BACKLOG.md**.

The Gene Evolution cycle (Tasks 1–11 of 12) then shipped the full permanent-card pillar above —
architecture, Essence economy, upgrade content, Archive UI, gates, loadouts, sorting, Power
integration, the Ascension backend, and this onboarding/docs pass (Combat Tutorial + HUD Tour +
Help mechanics + loading tips + Collection labels + CARDS/ECONOMY/CODEMAP/PROGRESSION-SYSTEMS
reconciliation).

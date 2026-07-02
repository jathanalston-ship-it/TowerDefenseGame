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
| Towers | 5 | 100 | each with stars + branches + mastery + Adaptation |
| Heroes | 3 | 30 | per-hero equipment loadouts |
| Enemies | ~30 | 100 | + elites |
| **Bosses** | **7 authored** | 50 | Progenitor + Milestone-1 line (6, pinned to Campaign stages 5–30) |
| Cards (genes) | 45 | 500 | effect DSL (mul/add/flag/set/grant/hook) |
| Equipment | ~180 | 500 | weapons/armor/relics + behavioral affixes + sets |
| Meta upgrades (Genome) | 21 | 1,000 | `META_UPGRADES` |
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
- ✅ Data-driven registries + content validator (`core/registry.ts`, `core/validate.ts`)
- ✅ Save: versioned blob, migrations, backups, export/import (`save/saveStore.ts`, UI `SaveManager`)
- ✅ Power Score index + coverage enforcement (`core/power.ts`, `POWER_RELEVANT_FIELDS`) — POWER-SCORE.md

### Towers
- ✅ Stars / evolution ceremony, branches (Bloons-style), per-tower mastery — TOWER-*.md
- ✅ **Adaptation** — PER-TOWER generated trees (4 branches × 10 tiers; exclusive forks at 4/7; apex
  capstone) bought with multi-source capped **Antigen** (mastery ranks + campaign + container Traces +
  achievements); campaign gates at 15/30/50; battlefield FORM stages 1–3; priced stage-gated respec;
  a new tower's tree = one `TOWER_THEMES` row (`core/adaptation.ts`) — ADAPTATION.md
- ✅ Range identity + Final Defense Zone — RANGE.md

### Heroes
- ✅ Roster slots (campaign-gated), per-hero equipment, mastery — HEROES.md, HERO-FRAMEWORK.md
- ✅ Adaptation for heroes (legacy shared 3-branch tree; per-hero trees are a later content pass — ADAPTATION.md)
- ✅ **In-run hero selection** — click a hero → non-modal live-state + profile panel — HERO-SELECTION.md
- ✅ **Hero Evolution** — in-run Biomass sink: 10 axes × 10 levels, all-heroes/new-heroes-inherit,
  Power-integrated, run-only — HERO-EVOLUTION.md
- 🟨 Hero abilities are largely one-verb; roster of 3 caps team-comp depth

### Bosses
- ✅ Module/phase framework + procedural assembly (`core/boss.ts`) — BOSS-DESIGN.md, STAGES.md §10
- ✅ **Milestone-1 line (bosses 1–6)** pinned to Campaign stages via `CAMPAIGN_BOSSES`; module spine
  `healer` / `carapace` / `splitter` fully sim-wired
- 📋 Milestones 2–4 (biome/prestige/∞ bosses + elite-variant overlay); per-boss Bestiary + first-kill
  capability rewards (see BACKLOG)

### Economy & loot
- ✅ Currencies: Genome Cores, Strain Samples (tower), Apex Genome (hero), Biomass, mats, Ascendant Cells — ECONOMY.md, currencies.ts
- ✅ Genetic Vault: cinematic reveal, run-banked containers, ~50% power-scaled equipment drop
- ✅ **Crafting materials from containers** — low-chance, pity-protected Catalyst (`core/materialDrop.ts`) — EQUIPMENT.md §8
- 🟨 Mid/late-game currency SINKS cap out (star sink exhausts in tens of hours) — economy stagnation is the top P0 (EA-DESIGN-AUDIT §4)

### Equipment
- ✅ ~180 items, affixes/sets, Reforge (enhance/reroll/reforge/upgrade), salvage — EQUIPMENT.md, REFORGE.md
- ✅ **Simplified cards (Equip/Details/Favorite) + full Details screen** (`ui/ItemDetails.tsx`) — EQUIPMENT.md §4b
- ✅ **Destruction safeguards + Undo Salvage** (tiered confirms, higher-Power WARNING, NEW badge) — EQUIPMENT.md §safeguards

### Modes & progression
- ✅ Campaign (procedural stages, world map, evolution cap), Infinite (AI Director), Quick Skirmish — MODE-IDENTITY.md, CAMPAIGN.md
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
- ✅ Progress Prediction (self-calibrating) — PREDICTION.md
- ✅ UI motion language, reward presentation — UI-MOTION.md, REWARD-PRESENTATION.md
- ✅ Identity pass: LEXICON, ◈ star glyph, rarity grades, currency renames — LEXICON.md, IDENTITY-AUDIT.md

### Not built (structural)
- 📋 No backend → no cloud save, dailies/seasons, analytics, remote config (EA-DESIGN-AUDIT §9). This
  forecloses the live-service/1,000-hr framing until it becomes a platform decision.

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

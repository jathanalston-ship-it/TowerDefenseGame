# GAME-STATE.md — what actually exists, and its status

> **This is the canonical "is it built?" index.** (System map / first read:
> `PROJECT_MANIFEST.md`.) The design docs describe intent (some of it
> aspirational); this file tracks what the *shipped code* actually does. When a design doc and the
> build disagree, **the build wins and this file is the tiebreaker.** Prefer reading this over
> re-reading a system's implementation (per CLAUDE.md "Trust existing architecture").
>
> **Save schema:** `CURRENT_VERSION = 26` (additive migrations via `withDefaults` + per-field
> sanitizers; checksummed blob). **Stack:** React + TypeScript + Vite static SPA, deterministic sim
> core in `src/core/` (no React/DOM), Canvas renderer, browser-local saves. Tests: `npm test`
> (Vitest) — the golden characterization test pins the sim byte-for-byte.

**Status legend:** ✅ BUILT (shipped + tested) · 🟨 PARTIAL (works, but thinner than its doc) ·
📋 PLANNED (doc/spec only, little/no code).

---

## Content density (built vs. the CLAUDE.md target scale)

| Axis | Built | Target | Notes |
|---|---:|---:|---|
| Towers | 15 | 100 | each with stars + branches + mastery + Adaptation; Coil/Siphon/Sower/Spire/Polyp/Spitfang/Rift are locked/gated (below). **Spitfang Turret** (Kinetic homing autocannon — the dependable single-target pick; EASY gate: 45 shards @ stage 3; forms `gatling`; branches Flechette Storm / Heavy Slug) + **Rift Anchor** (Neural void PULL field — a psionic singularity; DEEP gate: 640 shards @ stage 40; form `singularity`; branches Event Horizon / Annihilation Core) are the two newest, each with a ★1–9 star path, a 4-branch Adaptation tree, and mastery lore. **Visual overhaul: procedural TURRET bodies** (`render/towerForms.ts`, 10 forms barrel/cannon/core/nest/monolith/crystal/maw/lens/pod/antenna) replacing flat shapes — a full **AAA lighting pass**: volumetric gradient shading under one key light (up-left), rim light on lit edges, AO contact shadows, metallic speculars, glowing energy cores with **bloom** (reactor plasma / obelisk apex / spire tip), faceted-crystal caustics, wet subsurface glow on the organic maws/nests, + greebles (panels/bolts/vents/conduits). Rooted mount + firing apparatus, idle motion + a **firing recoil/muzzle-flare** (maw gapes on fire); the per-kind organs + all evolution layers (star/branch/strain/mastery/adaptation) draw over. **+ base firing SOUNDS** (`towerFireCue` → tick/thud/wet/zap/ting; unbranched towers were silent). **+ comet PROJECTILES** (tapered fading trail + layered glowing head + white-hot edge; parasite wobble/splash pulse). All render-side/cosmetic ⇒ golden-safe |
| Heroes | 5 | 30 | Vitriol (Caustic siege) + Revenant (Viral phase-assassin) added; per-hero equipment loadouts; ★10 cap + ★5/★8 ability forks |
| Enemies | 40 | 100 | + elites; role fusions: Cyst Wraith fly+regen · Cinder Sapper burrow+suicide · Stratovore fly+artillery · Brood Weaver summon+regen · Cataclyst heavy+suicide · Aegis Zealot shield+regen · Carrion Zeppelin fly+summon · Bastion Spitter siege+regen · Hollow Oracle heal+shield · Bloat Cluster swarm+bomb. **Visual overhaul: 12 procedural creature body-forms** (`render/enemyForms.ts`, `ENEMY_BODY`) — grub/dart/beetle/crab/polyp/mole/moth/broodsac/frond/bulb/mortar/maw, each a shaded silhouette + anatomy + idle animation; per-kind colour + `ENEMY_VARIANT` seed vary the build; LOD-gated (flat `ENEMY_SHAPE` fallback + bestiary), cosmetic (no golden impact). Trait tells (shield/regen/summon/…) layer on top. **+ lifecycle animation** (render-side motion tracker → velocity **bank/bob**, spawn **emerge** scale-in, death **crumple** echo; grounded contact shadows; size jitter) **+ per-archetype death AUDIO** (`enemyDeathCue` → 5 timbres squelch/crack/screech/pop/splat, layered under the kill-streak ping). **+ ASSIMILATION gore** (`render/gore.ts` ← sim `DeathEvent` buffer): color-coded pieces routed to organized destinations — viscera gibs→floor decals, occasional juice spray, biomass motes→HUD, XP shards→the killing tower/hero (throb on arrival), assim chunks→container meter; explosion∝overkill, counts∝bounty; `assimilate` shimmer cue. **+ unique BIRTH intros** (`drawSpawnIntro`: hatch/erupt/bloom/assemble/phase/ignite per archetype). All render-side ⇒ golden-safe. Docs: ENEMIES.md §8.1–8.2 |
| **Bosses** | **13 authored** | 50 | Progenitor + Milestone-1 line (stages 5–30) + Act-2 siege line (35/40/45) + Act-3 graduation line (50/55/60) |
| **Mega Bosses** | **5 authored** | 20 | battlefield-scale raid organisms (`megaBossRegistry`); every 10 campaign stages / 20 Infinite waves / 5 Rush waves + the rare Daily Mega variant |
| Cards (genes) | 102 | 500 | effect DSL (mul/add/flag/set/grant/hook); 44 progression-`unlock`-gated (below) |
| Equipment | ~180 | 500 | weapons/armor/relics + behavioral affixes + **16 build-enabling sets** (EQUIPMENT.md §12) |
| Meta upgrades (Genome) | 87 | 1,000 | `META_UPGRADES` (Deep Genome tier: 20 open + 10 progression-`unlock`-gated) |
| Ascendant (prestige) nodes | 19 | 20 | `ASCENDANT_NODES` (9 expansion nodes: 3 deep stackers + 6 new income levers) |

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
- ✅ **Assimilation Index** — the hidden per-run MASTER STATE (`core/assimilation.ts`): one continuous
  `0..1` index folded from weighted `ContributionProfile` rows (the live run **Power Score** is the
  universal contributor, so every present/future strength system raises it for free), smoothed like
  the danger-camera, driving every dynamic presentation channel — music-intensity floor
  (`audio/music.ts`), camera heartbeat + screen veil (`render/assimilationFx.ts`), HUD frame glow
  (`--assim-*` CSS) — through ONE derived `AssimilationPresentation` bundle. 6 evolution tiers
  (Contained → Planetary Assimilation) blend continuously; future systems plug in via a data
  contribution profile with no gameplay-code change. Render-only ⇒ golden-safe. Complete dev panel
  (live index/breakdown/tier ladder/FX preview/manual override) in `ui/AssimilationDebug.tsx`.
  **ASSIMILATION.md**

<!-- COMPRESSED SUMMARY — Assimilation Index (≤500 words; prefer this over re-reading the code)
  Architecture: pure zero-alloc state machine (mirrors core/dangerCamera.ts). AssimilationSignals
  (flat bag, filled by Game.assimilationSignals()) → computeAssimilation() folds ContributionProfile
  rows via soft-saturation raw/(raw+half), weight-normalized mean ⇒ target 0..1 (inherently bounded).
  stepAssimilation(state,target,dt) eases index toward target, ASYMMETRIC (riseRate>fallRate). State
  lives on game.assimilation (render-only, like dangerCam) but is STEPPED in the GameView loop ⇒ zero
  sim impact. assimilationPresentation(state) derives ONE bundle every consumer reads.
  Public API: initialAssimilation(); Game.assimilationSignals(); computeAssimilation(signals);
  stepAssimilation(state,target,dt); assimilationPresentation(state); tierAt(index); tierColorAt(index);
  ASSIMILATION_TIERS; CONTRIBUTIONS; registerAssimilationContribution(profile); drawAssimilationFx().
  Extension: (1) implicit — feed Power Score, done. (2) explicit — registerAssimilationContribution()
  reading signals.custom (open map). New presentation consumers read assimilationPresentation(), never
  a private threshold. Invariants: render-only (sim never reads it), never saved, index∈[0,1].
  Known limits: custom seam unused by content yet; elite/campaign-stage contributors + tower/hero/
  nucleus/enemy/mega/cinematic presentation consumers are documented seams, not yet wired. -->

### Towers
- ✅ **Resonance Coil** (9th tower, new `Resonant` class) — a `firing: 'beam'` MELTER: a locked,
  ramping channel on ONE target (heat 0→1 while focus holds, resets on switch; damage ×(1+heat·3)).
  The first new firing since launch; full stars + 2 branches + mastery + Adaptation. **Locked by
  default** (`unlockShards`) and **progression-gated** (`unlockStage`) — its shards only drop after
  Campaign Stage 15. See the compressed summary below.
- ✅ **Marrow Siphon** (10th tower; Vital) — the SECOND `firing: 'beam'` tower, deliberately the Coil's
  OPPOSITE: a multi-tether HARVESTER, not a focus melter. It finishes the WOUNDED (`lowestHealth`),
  spreads a drain WEB across `baseForks` (2)+ targets, gorges on VOLUME (feeding throughput + kills,
  slow decay, never hard-resets — vs the Coil's hold-heat), and siphons the swarm into Biomass
  (`game.beamSystem`, routed by kind alongside the Coil's `beamTowerSystem`). Close range (300), fast
  drain pulse (0.4). DOUBLE-gated — shards only drop after Campaign Stage 15 (`unlockStage`) and 200
  must then bank (`unlockShards`). Ships a 7-node star path, two branches (Insatiable Gorge / Bloodwell),
  and a 7-card Deep-Strain gene set behind the same gate. **SIPHON.md**
- ✅ **Blight Sower** (11th tower; Caustic) — the roster's first `firing: 'trap'`: it never attacks — it
  SEEDS armed spore mines up-lane (cap + cadence + blast all upgradeable) and the wave walks into
  them; detonations corrode (feeds Shred) and star/branch organs bloom AT the crater. Pre-placed
  area DENIAL vs. everyone else's reaction. DOUBLE-gated (Campaign 20 → 360 shards); two signature
  gene cards gate on owning it. **SOWER.md**
- ✅ **Synapse Spire** (12th tower; Neural) — the chain-ARC caster and the first kit composed purely
  via `TowerDef.abilities` (zero bespoke firing code): each cast is one `ChainAbility` leaping
  victim-to-victim (4 hops base, 25% falloff); hops are the upgrade currency (stars/branches/
  `spireChainJumps` all ride `extraProjectiles`). DOUBLE-gated (Campaign 25 → 400 shards). **SPIRE.md**
- ✅ **Undertow Polyp** (13th tower; Kinetic) — the DISPLACEMENT tower (`AuraAbility.pull`): every
  pulse drags caught non-bosses 46px back up-lane and tears active siege locks off the Hive — it
  denies PROGRESS, not health bars; stacked pull auras are its investment currency. DOUBLE-gated
  behind the deepest tower gate yet (Campaign 30 → 440 shards). **POLYP.md**
- ✅ **Mulligans** (`core/mulligan.ts`, `render/mulliganOrganism.ts`, `ui/MulliganLab.tsx`, save v26) —
  the endgame pillar: each tower kind permanently owns ONE biomechanical **Mulligan** organism
  assembled from THREE genetic modifiers (30 shipped: 10 offensive/10 utility/10 biological), 6-rarity
  ladder (Common→Ascendant), Gene Essence (unified gene currency) upgrades + ascension. Data-driven (a modifier = one
  registry row); folds through existing TowerMods channels (**no new sim branch**); **inactive until
  all 3 slots fill ⇒ golden-safe**. Power: a DEDICATED, separately-inspectable `PowerParts.mulligans`
  bucket. The organism's appearance/animation/projectile are **procedurally generated** from the
  modifiers' stat profile (emergent — mixing ≠ stacking) and drawn grafted onto the turret. Earn loop
  via Bio-Container loot (Gene Essence bleed + modifier discovery); the **Mulligan Lab** (Hub → Progression)
  is a design-language master–detail bench (host rail → live graft-chamber showcase, `.mgl-*` tokens,
  Power-previewed spends, auto-armed sites; rarity colors mirror the global `--r-*` ladder and the
  ⊛ `GENE_OVERFLOW` identity is shared with the reveal pulls); 7 achievements + dev tools. Fully
  tested end-to-end. **Reconciliation surfaces:** Daily Run pre-assembles the day's towers from the
  player's OWN dex (loaner tutorial trio when empty; seeded, override-folded — §daily), Modifiers
  collection codex (Discovered → Transcendent; +5% fire rate at completion), Inspector organism block,
  organism-emitter projectiles wired into drawProjectile, container-reveal Overflow/discovery pulls,
  organic audio (squelch/crack/field heartbeat), help-wiki entry, profile dex/Overflow rows, mobile
  NAVS coverage. **MULLIGANS.md**
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
- ✅ **Revenant** (5th hero, Viral) — a phase-stalking ASSASSIN with a NEW behavior `'phase'`: instead
  of walking it BLINKS (teleports) to the biggest threat (boss → elite → highest-HP), strikes hard, and
  injects spreading Infection (`game.updatePhaseHero`). The only single-target boss-deleter + only Viral
  hero. Passive `viralVuln` (infected enemies take +18% from all sources). **Uniquely gated** — reach
  **Infinite Depth 40** (`unlock: infiniteDepth`), a distinct axis from Vitriol's boss-slain + the Shard
  heroes; auto-unlocks account-wide (works in campaign/infinite/daily, any of the 3 slots). HEROES.md
- ✅ Roster slots (campaign-gated), per-hero equipment, mastery — HEROES.md, HERO-FRAMEWORK.md
- ✅ Adaptation for heroes (legacy shared 3-branch tree; per-hero trees are a later content pass — ADAPTATION.md)
- ✅ **In-run hero selection** — click a hero → non-modal live-state + profile panel — HERO-SELECTION.md
- ✅ **Hero Evolution** — in-run Biomass sink: 10 axes × 10 levels, all-heroes/new-heroes-inherit,
  Power-integrated, run-only — HERO-EVOLUTION.md
- ✅ **Hero ability KITS** — each hero auto-casts **2 star-gated skills** (unlocked at ★3 / ★7,
  `HERO_SKILLS`) on their own cooldowns, on top of its ult + auto-attack (HEROES.md). A fresh hero
  (0 stars) is still one-verb — the kit is progression depth; a fresh account (golden) casts none, so
  the pinned sim is byte-identical. Roster of 3 still caps team-comp breadth
- ✅ **Hero ability FORKS (★5/★8)** — the hero star cap rose ★5→**★10** (`STAR.maxStars`), unlocking two
  A/B fork tiers per hero (20 total: 5 heroes × ★5/★8 × A/B). A fork **reworks an already-unlocked
  ability in place** (patch its damage/radius/cooldown/statuses, rename it, or reshape it — e.g. Ravager
  ★8 turns Rend into a wide *Reaving Cleave* or a focused *Slayer's Rend*; Shepherd ★8 turns Bloom into
  *Crimson Bloom*), never a bolt-on verb. **Architecture:** data-driven `HeroForkTier`/`HeroForkOption`/
  `HeroAbilityUpgrade` on `HeroDef.forks`; `resolveHeroKit(kind, stars, picks)` folds every unlocked
  tier's chosen `HeroAbilityUpgrade`s onto the base ult/skill defs and compiles them → `ResolvedHeroKit`
  (`ult`/`ultComps`/`skills`/`skillComps`). **Save:** `save.heroForks: Record<HeroKind, Record<star,
  optionId>>` (mirrors `towerForks`; withDefaults-migrated). **Meta/UI:** `meta.setHeroFork` persists a
  pick, `meta.heroForkTiers`/`heroForkPicks` drive the **Hero Lab → Ability Forks** picker; `meta.
  heroAbilityKits()` resolves per fielded hero → App → `RunOptions.heroAbilityKits` → sim (falls back to
  the static `HERO_ULT`/`HERO_SKILLS` when absent). **VFX:** every ability carries `particle`/`fxColor`,
  spawned on cast via the isolated `fxRng` (cosmetic — never perturbs the sim). **Golden-safe:** 0 stars
  / no picks resolves to the exact base kit; `neutralHeroProgress` + `NO_META` pass no kits ⇒ byte-
  identical (heroForks.test.ts pins identity + patch math + the HUD-level end-to-end)

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
- ✅ **Milestone-2 siege line (bosses 7–9, stages 35/40/45)** — The Sunken Chorus (burrower+gravitas+
  healer: positioning), Vault of Teeth (bulwark+carapace+corecrush: layered defense), The Unmaker
  (corruptor+dampener+channeler: total suppression); same registry/codex/collection path as Act 1
- ✅ **MEGA BOSSES** (`core/megaboss.ts` + `render/megaboss.ts` — docs/MEGA-BOSS.md): battlefield-scale
  RAID organisms — anchored across the top of the field, ability rotation manipulating the whole
  battle (12 modular verbs), 10-kind weak-point library where every destruction CHANGES the fight,
  encounter cadence in all four modes + the rare Daily Mega variant (roster: Voraxis the aggression
  mega · Meridia the suppression mega · Ossira the FORTIFICATION mega — it armors/shields/mends the
  horde itself), efficiency-scaled guaranteed
  Ichor, `megaBosses` collection category (Slain/Mastered/Dominated) + 11 achievements — compressed
  summary below
- 📋 Milestones 3–4 (biome/prestige/∞ bosses + elite-variant overlay); per-boss Bestiary + first-kill
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
- ✅ **Campaign EVENTS** (`core/campaignEvents.ts`, CAMPAIGN-EVENTS.md) — the authoring SEAM that ends
  "every stage is the same board with bigger numbers." A `CampaignEventDef` registry (9 defs, 4
  archetypes: **eliteRush / gauntlet / cache / mutation**) that `generateStage` samples deterministically
  (dedicated seed stream; sparse ~34% of ELIGIBLE stages; skips onboarding<4, milestone, authored-boss
  stages). **Discipline (like runEvents):** events LAYER onto separate `StageConfig.event` fields +
  existing sim levers — group `elite` flags (eliteRush, clamped to the 0.45 cap), `bossWaves` (gauntlet,
  the Daily lever), `startBiomassBonus` + an `event.rewardMult` stamp (cache), and a `CardEffect[]` boon
  (mutation) — **never** the base scaling/reward curve, so campaign.test's smooth-progression invariants
  + golden stay green. **Consumption:** sim reads bossWaves/startBiomass/elite already; App folds
  `event.rewardMult` at payout + the chosen mutation boon into run effects via `startCampaign(stage,
  boonId?)`. **UI:** descent-map node badge (`CampaignMapNode.event`) + mission-card telegraph + a
  Mutation A/B picker. **Extend:** one `CAMPAIGN_EVENTS` row per new archetype. **Golden-safe:** only
  campaign/daily call generateStage; the golden autoplay passes no stage. campaignEvents.test.ts (11)
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
- ✅ Collection/Codex progression (ranks, reward tracks) — COLLECTION.md; registry-driven, so the
  recent content (Coil/Siphon beam towers · Revenant/Vitriol heroes · Deep-Strain cards · Mega Bosses)
  joins the codex automatically (guarded by `collection.test.ts`)
- ✅ Achievements — data-driven milestone framework (`state/achievements.ts`: Genome-Core rewards,
  progress bars, hidden reveals; recognition-only, never touches the sim). **+10 content-tied unlocks**
  for the recent roster: the beam towers (Resonance Cascade / Exsanguination / Directed Energy /
  Focused Fire), the gated heroes (Scorched Earth · The Wraith Walks), and "collect it all" goals
  (Full Menagerie · Complete Arsenal · Deep Genome · Return from the Deep) — all read lifetime
  usage/ownership, so a fresh save unlocks none
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

### Platform & release frameworks
- ✅ Production backend (Cloudflare Pages Functions + D1 + Stripe + Turnstile): purchases
  (exactly-once), cloud save + auto sync, daily seed, leaderboard + replay verification,
  aggregate analytics — DEPLOYMENT.md, SECURITY-AUDIT.md, LEADERBOARD-INTEGRITY.md
- ✅ Initialization cutscene (first boot, replayable from Settings) + wave-launch breach transition — **overhauled to full procedural canvas cinematics** (`render/introScenes.ts`): five deterministic set-pieces (deep-crust radar reacquisition, the swarm boiling up ember-lit strata, veins consuming a steel lattice, the breathing molten Hive Core, the title spore-field/aurora), film-style cross-dissolves, letterbox grade + grain, per-scene copy accents; reduced-motion shows a hand-picked still per scene; DPR-capped for mobile
- ✅ Service worker: offline shell, versioned caches, player-controlled update toast — DEPLOYMENT.md §sw
- ✅ LiveOps calendar: deterministic UTC events (weekend surge + weekly spotlights) folding ×1-baseline
  reward multipliers into finishRun; hub strip — LIVEOPS.md
- ✅ Localization core: typed `t()` layer, EN source-of-truth keys, ES/PT catalogs (missing key =
  compile error), Settings language picker, live re-render — I18N.md

### Retention & identity systems (the live-game batch)
- ✅ **Phenotypes (cosmetics)**: 6 theme families × every tower/hero (generated; new kinds
  inherit), save v26 owned/equipped, renderer re-expression + aura flourishes + themed
  projectiles/beams + firing-sfx pitch variants, Phenotype Lab nav tab, Phenotypes
  collection codex paying Biomass ×1.06 @100% — COSMETICS.md
- ✅ **Champion Contracts**: weekly deterministic 3-contract board (LiveOps weekIndex),
  data constraint vocabulary judged in finishRun, core payouts + Gilded exclusives,
  home board + Results category — CONTRACTS.md
- ✅ **Nemesis & Trophies**: losses seed a buffed, branded returning hunter (replay-
  deterministic via RunOptions; dailies excluded); revenge pays scaled cores + Abyssal
  phenotype; 10 tradeoff trophy organs, ONE mounted, derived ownership — NEMESIS.md
- ✅ **Hero Expeditions**: benched heroes on 2h/6h/12h away-missions (absolute endsAt,
  offline-safe), star-scaled bundles, HeroLab panel — EXPEDITIONS.md
- ✅ **Infestation Map**: 4 regions × 4 sectors; every run feeds the pinned/emptiest
  sector, regions pay live-scaled run passives, lazy wall-clock decay, home conquest
  board — INFESTATION.md

### Not built (structural)
- 📋 Content-string localization (tower/card/enemy names, help wiki) — chrome is on `t()` via
  I18N.md's convention; registries stay English until `nameKey` columns are worth the volume.

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

---

## Compressed system summary — Mega Bosses + Weak Points (docs/MEGA-BOSS.md)

**Architecture.** A sibling of the boss framework, not an extension: `core/megaboss.ts` is pure
data + registries + scheduling + rewards (`MegaBossDef`, 12 `MegaAbilityKind` verbs, 10-kind
`WEAK_POINT_DEFS`, `megaBossRegistry`/`weakPointRegistry`, `MEGA` tunables); `game.ts
megaBossSystem` executes (one anchored `MegaRuntime`, telegraphed rotation, weak-point lifecycle,
raid targeting, the Daily loop); `render/megaboss.ts` draws everything procedurally from the def
palette; progression rides `save.megaProgress` + the `megaBosses` collection category.

**Public APIs.** `game.spawnMegaBoss(enc, encounter)` · `campaignMegaFor(stage)` /
`infiniteMegaFor(wave)` / `rushMegaFor(wave)` (registry-CYCLING, tier-scaling — no hardcoded
count) · `megaExpectedKillSec`/`megaKillEfficiency`/`megaBossIchor` (rewards) ·
`RenderState.megaBoss` + `HudSnapshot.megaBanner` (views) · events `megaSpawned`/`megaPhase`/
`megaWeakPointDown`/`megaKilled` · `RunOptions.megaDaily` + `DailyPlan.megaBoss` (the variant).

**Extension points.** New manipulation verb = union member + switch arm in `castMegaAbility` +
`foldMegaFx`. New weak point = one `WEAK_POINT_DEFS` row (consequence is data). New Mega Boss =
one `MegaBossDef` — rotation slots, codex, achievements ceilings, daily pool, renderer, raid bar
and audio pick it up automatically (add a theme sting in `sound.ts` if `themeCue` is new).

**Assumptions.** All battlefield manipulation folds through `MegaFieldFx` at existing sim
chokepoints with ×1/+0 neutral defaults — a run without a mega (incl. golden) is byte-identical.
One mega at a time (`spawnMegaBoss` ignores a second). Weak points must descend to
`MEGA.minWeakPointY` so towers reach them (validator-enforced). Rotation runs only in the wave
phase. Rewards are paid at `finishRun` from `RunStats.megaKills`; ledger records land live via
events (mirrors `bossKilled`).

**Future hooks.** Scripted tutorial beat for the first encounter; per-mega codex art; weak-point
"accuracy" stats; assembled/procedural megas (the pool + validator already support composition).

**Known limitations.** Ability windows lapse across the inter-wave settle; slow-motion kills are
presentation-side only (determinism); heroes only strike organs on an empty field.

## Compressed system summary — Living Battlefield (docs/LIVING-BATTLEFIELD.md)

**Architecture.** One render-only module, `render/livingBattlefield.ts`, drawn beneath the entities in
`renderer.ts drawGame` (after `drawBiomeWash`) plus an over-entity ambient pass. A hidden per-run
"biomass" (`computeAssimilation`) folds towers (count + strain/branch/stars/mastery/graft), heroes
(+gear), kills/boss/mega, wave, log-scaled Power Score, and biome into an evolution **stage 0–5**
(`STAGE_THRESHOLDS`, names `Dormant…Living`). In the live game the stage comes from the canonical
**Assimilation Index** (`core/assimilation.ts`) via `tierAt(game.assimilation.index)` — ONE source of
truth shared with the mood FX/music/HUD; the local biomass path is the standalone fallback
(tests/spectate) and always supplies the regional hotspots. `intensity=(stage+progress)/6` is the master alpha.
**Optimization:** all stable terrain — membrane (multi-octave, biome+tier-tinted, with an assimilation
FRONTIER that climbs the map), tubular veins, 2-tone shaded blooms, edge/grid overgrowth, permanent
scars — is BAKED into one offscreen canvas keyed `(stage,biome,layout,permScars)`, rebuilt only on
change and CROSSFADED (~0.85s). Per frame = one `drawImage` + cheap gradient-free live accents
(heartbeat beads, nucleus organ, combat flare, mega bloom, fading scorch, ambient life). Headless
fallback paints a direct wash. Inert at Stage 0.

**Public APIs.** `drawLivingBattlefield(ctx, rs, {power,mulligans,heroGear,cosmeticTiers,starTiers},
now, detail) → Assimilation` · `drawLivingBattlefieldAmbient(ctx, a, now, detail)` ·
`computeAssimilation(rs, ctx)` · `profileForTower/Mulligan/Hero/Gene(id) → {motif,hue}` ·
`getAssimilationDebug()` (dev readout + GameView's `bioStage` audio cue) · dev
`setStageOverride`/`setLivingBattlefieldEnabled`. `RenderState.assimilation` surfaces
`{wave,kills,bossKills,megaKills}` (pure snapshot reads). `drawGame` gained a trailing `power` param.

**Extension points.** New tower/hero/mulligan-axis/gene needs **zero code here** — its motif resolves
by a stable hash default; add a curated row in `TOWER_MOTIF`/`HERO_MOTIF`/`MULLIGAN_MOTIF`/`GENE_MOTIF`
only to *tune* it. New motif = one `MOTIF_HUE` row + a `case` in `drawBloom`. Balance = the tunable
constants (`STAGE_THRESHOLDS`, per-source weights) at the top of the module.

**Assumptions.** Render-only — the sim never reads it, so golden runs are byte-identical (the
`assimilation` snapshot fields don't touch sim math). Self-resets on sim-time rewind (new run). Scar
lifetimes decay on **sim** time (hold while paused); animation keys on the renderer's `t`.

**Future hooks.** Dedicated projectile-impact scar buffer; per-biome bespoke motifs (bone dunes,
mutated trees) via a biome→motif bias map; optional HUD "assimilation" meter.

**Known limitations.** Combat scars reuse the enemy death buffer (bosses excluded there → tracked by
id-disappearance instead); the cached membrane is generic-per-stage (build character comes from the
live regional blooms, not the base texture).

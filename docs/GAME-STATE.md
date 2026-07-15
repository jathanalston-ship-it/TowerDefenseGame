# GAME-STATE.md — what actually exists, and its status

> **This is the canonical "is it built?" index.** (System map / first read:
> `PROJECT_MANIFEST.md`.) The design docs describe intent (some of it
> aspirational); this file tracks what the *shipped code* actually does. When a design doc and the
> build disagree, **the build wins and this file is the tiebreaker.** Prefer reading this over
> re-reading a system's implementation (per CLAUDE.md "Trust existing architecture").
>
> **Save schema:** `CURRENT_VERSION = 43` (additive migrations via `withDefaults` + per-field
> sanitizers; checksummed blob). **Stack:** React + TypeScript + Vite static SPA, deterministic sim
> core in `src/core/` (no React/DOM), Canvas renderer, browser-local saves. Tests: `npm test`
> (Vitest) — the golden characterization test pins the sim byte-for-byte.

**Status legend:** ✅ BUILT (shipped + tested) · 🟨 PARTIAL (works, but thinner than its doc) ·
📋 PLANNED (doc/spec only, little/no code).

---

## Content density (built vs. the CLAUDE.md target scale)

| Axis | Built | Target | Notes |
|---|---:|---:|---|
| Towers | 20 | 100 | each with stars + branches + mastery + Adaptation; Coil/Siphon/Sower/Spire/Polyp/Spitfang/Rift are locked/gated (below). **Spitfang Turret** (Kinetic homing autocannon — the dependable single-target pick; EASY gate: 45 shards @ stage 3; forms `gatling`; branches Flechette Storm / Heavy Slug) + **Rift Anchor** (Neural void PULL field — a psionic singularity; DEEP gate: 640 shards @ stage 40; form `singularity`; branches Event Horizon / Annihilation Core) are the two newest, each with a ★1–9 star path, a 4-branch Adaptation tree, and mastery lore. **Visual overhaul: procedural TURRET bodies** (`render/towerForms.ts`, 10 forms barrel/cannon/core/nest/monolith/crystal/maw/lens/pod/antenna) replacing flat shapes — a full **AAA lighting pass**: volumetric gradient shading under one key light (up-left), rim light on lit edges, AO contact shadows, metallic speculars, glowing energy cores with **bloom** (reactor plasma / obelisk apex / spire tip), faceted-crystal caustics, wet subsurface glow on the organic maws/nests, + greebles (panels/bolts/vents/conduits). Rooted mount + firing apparatus, idle motion + a **firing recoil/muzzle-flare** (maw gapes on fire); the per-kind organs + all evolution layers (star/branch/strain/mastery/adaptation) draw over. **+ base firing SOUNDS** (`towerFireCue` → tick/thud/wet/zap/ting; unbranched towers were silent). **+ comet PROJECTILES** (tapered fading trail + layered glowing head + white-hot edge; parasite wobble/splash pulse). All render-side/cosmetic ⇒ golden-safe. **+ the DRACONIC pair** (TOWERS.md §draconic): **Wyrmwing Glaive** (Kinetic RETURNING blade — the all-new `firing: 'arc'`; 420 shards @ stage 22; branches Razor Cyclone / Ember Return) + **Drake Roost** (Vital `firing: 'summon'` brood engine — hero-AI drakes, tiered drakeling→drake→wyrmspawn; 520 shards @ stage 26; branches Alpha Brood / Swarm Clutch). **+ the REACTION trio** (TOWERS.md §reactionTrio — zero new sim verbs, all composed from `abilities`): **Miasma Lung** (the second Viral — a `field` plague fog that coats the WHOLE pack with Infection; 240 shards @ stage 18; branches Pandemic Engine / Caustic Smother) + **Chitin Bell** (the second Resonant — a `field` toll slam that primes the crowd with Resonance for the shatter reactions; 380 shards @ stage 24; branches Funeral Dirge / Deafening Chorus) + **Acid Lancet** (Caustic `homing` EXECUTIONER — one 130-dmg harpoon per 4.5s draw into the `highestHealth` target, Corrosion wound, 120px artillery deadzone; 560 shards @ stage 34; branches Headsman's Draw / Dissolving Point) |
| Heroes | 10 | 30 | Vitriol (Caustic siege) + Revenant (Viral phase-assassin) + Knell (Resonant conductor, Molt-gated) + Cinderwyrm (Caustic flying strafe-fighter on the new 'swoop' brain, bossSlain-5-gated) + Riptide (Kinetic water-form zone controller — tidal pulse + undertow pools, megaSlain-2-gated) + Carrion (Vital charnel necromancer — GRAVEBIND raises corpses as thralls, lifetimeKills-20k-gated) + Fovea (Neural executioner lance on the siege brain, Shard-160) — every combat class ×≥1, four ×2; per-hero equipment loadouts; ★10 cap + ★5/★8 ability forks |
| Enemies | 44 | 100 | + elites; role fusions: Cyst Wraith fly+regen · Cinder Sapper burrow+suicide · Stratovore fly+artillery · Brood Weaver summon+regen · Cataclyst heavy+suicide · Aegis Zealot shield+regen · Carrion Zeppelin fly+summon · Bastion Spitter siege+regen · Hollow Oracle heal+shield · Bloat Cluster swarm+bomb. **+ the EARLY BROOD** (ENEMIES.md §early-brood — four WEAK teaching variations in the stage 1–2 pool, all trait-less tier-1 walkers the derived `unlockStage` admits from stage 1): **Hollow Husk** (armor 1 — the first armor read) · **Itch Flea** (speed 98 — speed pressure under the Sprinter) · **Creeping Mold** (62 hp @ speed 26 — the first sustained-DPS wall) · **Pale Skulker** (avoidTowers 0.85 — the coverage prober); scripted WAVES never spawn them ⇒ pinned autoplay golden untouched. **Visual overhaul: 12 procedural creature body-forms** (`render/enemyForms.ts`, `ENEMY_BODY`) — grub/dart/beetle/crab/polyp/mole/moth/broodsac/frond/bulb/mortar/maw, each a shaded silhouette + anatomy + idle animation; per-kind colour + `ENEMY_VARIANT` seed vary the build; LOD-gated (flat `ENEMY_SHAPE` fallback + bestiary), cosmetic (no golden impact). Trait tells (shield/regen/summon/…) layer on top. **+ lifecycle animation** (render-side motion tracker → velocity **bank/bob**, spawn **emerge** scale-in, death **crumple** echo; grounded contact shadows; size jitter) **+ per-archetype death AUDIO** (`enemyDeathCue` → 5 timbres squelch/crack/screech/pop/splat, layered under the kill-streak ping). **+ ASSIMILATION gore** (`render/gore.ts` ← sim `DeathEvent` buffer): color-coded pieces routed to organized destinations — viscera gibs→floor decals, occasional juice spray, biomass motes→HUD, XP shards→the killing tower/hero (throb on arrival), assim chunks→container meter; explosion∝overkill, counts∝bounty; `assimilate` shimmer cue. **+ unique BIRTH intros** (`drawSpawnIntro`: hatch/erupt/bloom/assemble/phase/ignite per archetype). All render-side ⇒ golden-safe. Docs: ENEMIES.md §8.1–8.2 |
| **Bosses** | **13 authored** | 50 | Progenitor + Milestone-1 line (stages 5–30) + Act-2 siege line (35/40/45) + Act-3 graduation line (50/55/60) |
| **Mega Bosses** | **7 authored** | 20 | battlefield-scale raid organisms (`megaBossRegistry`); every 10 campaign stages / 20 Infinite waves / 5 Rush waves + the rare Daily Mega variant |
| Cards (genes) | 106 | 500 | effect DSL (mul/add/flag/set/grant/hook); 48 progression-`unlock`-gated (below) |
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
- ✅ Power Atlas + history (`state/powerAtlas.ts`, `state/powerLog.ts`, `GrowthPanel` on Home; advisor
  covers towers/heroes incl. Prime + evolution/genes/adaptation + free gear equips (`equipAdvisor`); `save.powerLog` daily ledger v43,
  weekly delta + sparkline) — POWER-SCORE.md §atlas/§history
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
  **v29 overhaul:** piece EXCLUSIVITY (one tower per piece; catalog pinned at `CATALOG_PER_TOWER`
  (6) × the tower roster = 102 pieces — two full alternative organisms per tower), 3-distinct-
  Mega-Boss gate, duplicates dissolve to Gene Essence, split
  Collection (Pieces + complete Mulligans, each with its own %), Hub nav ring, and the
  ichor-fueled REFORGE wheel (1–3 slots by combined rarity; legendary rolls = GLOBAL passives;
  first spin permanently BINDS the organism) — MULLIGANS.md §reforge
- ✅ Stars / evolution ceremony, branches (Bloons-style), per-tower mastery — TOWER-*.md
- ✅ **PRIME STRAINS** (save v39, PRIME-STRAINS.md) — the per-unit INFINITE ladder past ★max for
  towers AND heroes: geometric costs off the final star (×1.4/level), log-eased diminishing bonus
  (`mult(L)=1+b·L₀·ln(1+L/L₀)`, exactly 1 at L0 — golden-safe), deep levels consume Catalyst
  (atomic 2-currency buys on the star seam, `progress.star`-guarded), Power via the existing
  towers/heroes buckets, lab PRIME panels + StarCeremony reuse, profile total. Direct shard lanes
  now BANK (the pre-Prime maxed→Essence "leak closer" retired); container opens still convert —
  the documented hold-vs-crack tension. Tests: `state/prime.test.ts` + banking contract
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
- ✅ **Adaptive Music overhaul** (`audio/music.ts`) — motif-library score (10 recurring themes),
  15-track data library across 8 categories (4 menus scene-tagged to hub wings, 3-track combat
  arc, 3 boss theme families hash-assigned per boss name + override table, Colossus Hymn,
  victory/defeat cadences, events, the Cold Open cinematic), 8 intensity-gated layers (choir + industrial hits AWAKEN as
  Assimilation rises), near-death duress low-pass, progression-weighted + rotating selection,
  bar-aligned equal-power crossfades, mastering compressor, 8 reward stingers riding the SFX cue
  bus, Settings Music Console (dev) — see the compressed summary below — MUSIC.md

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

- ✅ **Hero ability CINEMATICS** — every cast is a procedural set-piece: the Cinderwyrm's breath is a
  dragon swooping the lane, the Fovea's stare an opening eye-lance (HERO-CINEMATICS.md). **Data:**
  `HeroAbilityDef.cinematic { actor, motion, impactDelay }` on all 30 abilities (10 heroes × ult+2 skills).
  **Sim:** a cinematic cast SPLITS — support (heal/shield/buff/summon) lands at cast; the ZONE payload
  (explosion/debuff/pool) lands `impactDelay` (0.3–0.55s) later via `game.pendingImpacts` (crit/radius
  locked at cast ⇒ no rng at impact; enemies re-queried at landing — the blow hits whatever stands there;
  the settle wind-down clears the queue). One-shot `CastEvent`s ride `RenderState.castEvents` (the
  DeathEvent seq-ingest pattern). **Render:** `render/abilityCinematics.ts` — `ACTOR_PAINTERS` (10
  puppets: beast/bloomheart/psion/barrage/wraith/bellwave/serpent/tide/murder/gaze) × `computePose`
  (10 motions: lunge/swoop/dive/lob/rise/expand/converge/beam/blink/self), driven by SIM time
  (pause/speed stay in sync), anticipation → travel → impact → linger beats, calm covenant (no
  shake/flash, alpha-capped), reduced-motion skips the travel theater, ~0.9s wall-clock sim-stall
  releases performances. **Guardrails (test-enforced):** impactDelay ∈ [0, 0.6]; zone strikes must
  travel (> 0), pure support must not lag (= 0); golden seeds byte-identical (cast-less runs never
  touch the path — pendingImpactSystem length-gated, feed only written on cast). Tests:
  heroCinematics.test.ts (sim seam) + abilityCinematics.test.ts (renderer contract); riptide/vitriol
  tests updated to the ride-through pattern. Live-smoked headlessly: serpent mid-swoop + the
  landing-synced firestorm confirmed on the real battlefield

### Bosses
- ✅ Module/phase framework + procedural assembly (`core/boss.ts`) — BOSS-DESIGN.md, STAGES.md §10
- ✅ **Chassis identity depth** (BOSS-DESIGN.md §identity) — `CHASSIS_IDENTITY`: per-chassis creed,
  a SIGNATURE verb only that body plan may field (`warcry`/`mortarfall`/`broodburst`/`nullwell`/
  `unstoppable`, ownership validator-enforced), affinity-weighted procedural rolls, and desperation
  profiles (`cadenceMult` runs the finale kit HOT). Epithets on every def (authored or kit-derived
  via `epithetFor`); HUD banner + intro card (epithet byline + `MODULE_LABEL` kit chips) + defeat
  beat; mortar reticles/null wells rendered + snapshot-carried; sim folds beside grip/carapace
  (reaction true damage intentionally pierces the march). Tests: boss.test.ts §identity +
  bossmodules.test.ts §signatures; golden untouched
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
  battle (15 modular verbs incl. gorge/adapt/cataclysm), 10-kind weak-point library where every
  destruction CHANGES the fight, the STAGGER posture system (3 ruptures in a push topple it:
  frozen windows + bonus damage), a mandatory interruptible CATACLYSM finale per def,
  encounter cadence in all four modes + the rare Daily Mega variant (roster of 7: Voraxis
  aggression · Meridia suppression · Ossira fortification · Vesperine tempo · Moloch-Ama economy
  · Sarcophage gluttony/gorge · Myriad adaptation/anti-meta), per-def anatomy MOTIFS on the
  renderer, efficiency-scaled guaranteed
  Ichor, `megaBosses` collection category (Slain/Mastered/Dominated) + 11 achievements — compressed
  summary below
- 📋 Milestones 3–4 (biome/prestige/∞ bosses + elite-variant overlay); per-boss Bestiary + first-kill
  capability rewards (see BACKLOG)

### Economy & loot
- ✅ Currencies: Genome Cores, Strain Samples (tower), Apex Genome (hero), Biomass, mats, Ascendant Cells, Ichor (premium — MARKET.md) — ECONOMY.md, currencies.ts
- ✅ Splice Market: deterministic 5-min stock windows (4 core slots + premium shelf + rotating Bio-Containers), Ichor faucets + under-water gamble EV — MARKET.md
- ✅ Genetic Vault: cinematic reveal, run-banked containers, ~50% power-scaled equipment drop
- ✅ **Crafting materials from containers** — low-chance, pity-protected Catalyst (`core/materialDrop.ts`) — EQUIPMENT.md §8
- 🟨 Mid/late-game currency SINKS cap out (star sink exhausts in tens of hours) — economy stagnation is the top P0 (EA-DESIGN-AUDIT §4). The LEAK half is closed (2026-07): all direct shard lanes (level-ups, quest/season/pass, wardrobe, premium packs) now convert maxed-unit grants to Gene Essence via `settleDirectShardGrants` — GENE-EVOLUTION.md §Economy; the open half is DECISION-quality sinks

### Equipment
- ✅ ~180 items, affixes/sets, Reforge (enhance/reroll/reforge/upgrade), salvage — EQUIPMENT.md, REFORGE.md
- ✅ **Simplified cards (Equip/Details/Favorite) + full Details screen** (`ui/ItemDetails.tsx`) — EQUIPMENT.md §4b
- ✅ **Destruction safeguards + Undo Salvage** (tiered confirms, higher-Power WARNING, NEW badge) — EQUIPMENT.md §safeguards

### Multi-platform responsive (docs/RESPONSIVE-DESIGN.md)
- ✅ **Layout profiles** (`src/ui/layoutProfile.ts`): desktop / landscape / portrait stamped on
  `<html>` (`data-layout`, `data-coarse`) + `useLayoutProfile()` — three intentional interfaces
- ✅ **Portrait run shell scrolls** (100dvh + overflow-y) — fixed the tutorial-blocking clipped column
- ✅ **Adaptive tutorial**: auto scroll-into-view per checkpoint, callout flip+clamp, no off-screen arrows
- ✅ **Responsive gate** (`npm run mobilecheck`, in validate): registry-derived screen sweep
  (navModel) at desktop/portrait×2/tablet-portrait + portrait tab-shell walk + combat-dock
  contract + tutorial walk + popup detector; landscape phones out of the default gate
  (vertical-only play); `--full` = full published matrix; DebugPanel 📐 visualizer
- ✅ **Portrait shell — the phone game** (docs/RESPONSIVE-DESIGN.md §3b, 2026-07 rebuild):
  `src/ui/navModel.ts` (single nav IA source: groups + five-tab mapping + `tabOf`) ·
  `src/ui/MobileShell.tsx` (fixed bottom tab bar, self-describing index pages fed by
  unlock-registry blurbs with teaser locks inline, sticky back headers) · Hub branches on
  `useLayoutProfile()` (`mIndex`/`mTab`; deep links light the owning tab). Screens linearize:
  labs' roster columns → horizontal specimen strips (grid cols `minmax(0,1fr)`;
  `.tl2-item{flex:none}` fixed the row-overlap bug), `MobileSection` `<details>` collapsible
  (desktop renders children untouched) wraps the Nucleus console. Portrait combat: 3-col HUD
  grid (wave module pinned whole vs `.hz{display:contents}`), 42vh board, fixed bottom wave
  dock (≥48px ▶ Start Wave, slides away in combat), touch prep copy. **Automation contract**:
  `navModel.test.ts` (every NavKey in exactly one tab + has name/glyph/blurb) + discovery-based
  mobilecheck walk ⇒ future screens are auto-indexed/explained/swept on phones with no
  second list to maintain.
- ✅ **In-run HUD overhaul** (2026-07, HUD.md §0b — the triple-A pass): carved bio-glass cells
  (accent corner light + breathing floor VEIN + label dots + phase FILAMENT), the Hive Core as
  a plasma-drift Heart organ (membrane, meniscus), the Bio-Container meter as a bubbling
  rarity-lit Incubation vessel (fill-%, agitation, floating socket), the Biomorph Conveyor as
  a REAL belt (scrolling tread, feed-mouth, vat-lit specimen pods sliding in from the feed
  side, amniotic growth fluid, real pod keys w/ 32px coarse floors), capsule wave pips + 34px
  glowing wave numeral, class-bloom tower cards with affordable-breathing edges, live conic
  ability cooldown ring, and the Start Wave command key (energy core + charge sheen). All
  background-position/transform/opacity motion; class names, data-tut anchors, and the
  portrait grid contract untouched (mobilecheck CLEAN); killed the legacy `.cv-deploy.is-free`
  gold-text rule (the historical unreadable gift-label bug).

### Account platform (docs/ACCOUNTS.md)
- ✅ **Guest + Email/Password accounts** over the anonymous identity (same account_id ⇒ upgrade keeps
  saves/purchases; PBKDF2-SHA256, opaque sessions, reset seam) — `functions/api/account/*`, `src/account/`
- ✅ **Versioned modular save envelope** (17 modules + structural catch-all, checksum, headline meta)
  — `src/save/envelope.ts`; conservative conflict **merge** — `src/save/merge.ts`
- ✅ **Bidirectional sync engine** (pure decideSync core; auto pull/push, baseRev ⇒ 409 conflict flow,
  backoff, manual sync) — `src/net/syncEngine.ts`; offline-first gating — `src/net/connectivity.ts`
- ✅ **UI**: WelcomeGate (first launch), Settings Account panel, ConflictModal, Profile account card
- ✅ **Guest Mode** (2026-07, ACCOUNTS.md §guest-mode): session-only offline tryout offered on
  BOTH account surfaces (WelcomeGate third option + Commissioning SAFEGUARD "keep nothing") —
  sessionStorage flag (`src/state/guestMode.ts`) + SaveStore swapped
  onto session storage (`swapStorage`, purge semantics unit-tested); every network seam
  short-circuits on the flag (guest registration, checkout, syncStep, leaderboard, analytics);
  no name prompts, no account-store writes (zero durable trace — closing the browser resets the
  device); Premium Store banner + disabled buys, CloudBackup collapses, GUEST MODE badges.
  Conversion stays the normal account flow: any AuthForms success calls
  `meta.commitGuestSession()` (session save → durable, flag drops) before the first sync.

### Modes & progression
- ✅ Campaign (procedural stages, world map, evolution cap), Infinite (AI Director; **campaign-gated: unlocks at Stage 3**), Quick Skirmish — MODE-IDENTITY.md §gates, CAMPAIGN.md
- ✅ **Doctrine system overhaul** (2026-07, DOCTRINES.md): 19 pickable run-start commitments in
  THREE families — 8 build (⚡Overclock/⛨Bastion/✥Vanguard new), 9 world-warping protocols
  (◌Famine drought / ≫Velocity / ◉Overmind new), and the new PACT family (effects+warp both:
  ⚉Pact of Blood, ⌖Predator's Wager — validator-enforced). Campaign `unlockStage` gates with
  ledger grandfathering (`isDoctrineUnlocked`), MASTERY RANKS 0–4 from doctrineWins/BestWave
  ledgers (max(wins 1/3/8/18, wave 12/20/32/50)) paying +4%/rank run-end rewards on the
  doctrine lane (`doctrineEconomy(id, rank)`), drought+elite hazard axes, shared
  `DoctrinePicker` (family groups, lock seals, rank pips; compact variant replaces the
  Command Center's bare `<select>`), HUD wm-doc chip + Results verdict chip. Adding a
  doctrine = one data row — every surface derives. doctrines.test (13) + stats/director tests.
  **Recognition layer** (2026-07 follow-up): `doctrines` Bio-Dex codex whose tier IS
  1 + the live mastery rank (one ladder, Untested→Exemplar; light Biomass bonus — ranks
  already pay their own premium) + 4 achievements (first win / 5 distinct / all three
  families / Exemplar), all off the existing ledgers; the deliberate Daily+Rush
  doctrine-less choice is DIL-recorded as a design decision
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
- ✅ **Molt Vows** (the prestige wager — VOWS.md): arm 0–3 data-row handicaps pre-Molt that
  warp the enemy world for the ENTIRE next cycle (reusing DoctrineWarp — composed
  multiplicatively onto the run's doctrine at the ONE director fold site) and multiply the
  next Molt's cell mint (×1.3–×1.6 each, stacking); arming sinks banked Cores geometrically
  (750/3k/12k, never refunded); `prestige.vows` (v35), settled + cleared at molt; Molt
  Chamber wager rail + HUD ⛧ chip; dailies/tutorial excluded (fair boards)
- ✅ **Hive Construction** (the composite long-horizon sink — HIVE-CONSTRUCTION.md): BUILD the
  Home Base's next eras — 10 organ data rows (4 ×3-tiered, geometric) across labScore eras 0–3
  (the passive ladder stays the PREREQUISITE; locked eras visible for anticipation), each a
  MULTI-currency recipe (Cores + Gene Essence + Strain Samples + Apex Genome + materials —
  ≥2 lanes enforced; factor-traced costs; per-kind shard drains richest-first) spent through
  ONE atomic guarded action; built organs layer fixtures into LabAtmosphere's generic renderer
  immediately + lift ambient glow. `hive.built` (v36). THE HIVE nav screen + affordability
  badge. Sidegrades only — Power Score untouched (constitution)
- ✅ **Daily Bio-Cache** (the login-streak faucet — DAILY-LOGIN.md): one living cache per UTC
  day, sized by an internal ICHOR-VALUE budget `base(lifetime)×streakMult(streak)` (√ growth —
  slight daily rise, uncapped, ×1.86 @ 365d, never explosive) and paid as a seeded procedural
  bundle SPEAKING PassReward through the shared interpreter (2–3 weighted lanes priced off
  live exchange/market rates + a Season-XP rider ≤300 + streak-milestone containers
  7 rare/30 epic/100+yearly legendary riding ON TOP + a ~1-in-220 login-drop cosmetic
  jackpot). Missing a day resets ONLY the multiplier — `login` {last,streak,best,lifetime}
  (v38) keeps lifetime/best forever, feeding the zero-power Devotion codex (6 milestones +
  streak watermark → rank-up Ichor faucet), a Genome Rank journey source, and 6 wardrobe
  identity exclusives (login-days titles/plaque/banner/border + logins-rank border). Home
  board widget (pod → streak presentation + tomorrow tease) + rupture ceremony
  (grow→pulse→tap→erupt) + home badge re-lit each UTC midnight. Guarded `claimLogin`
  (once/day by lexical key gate — forged future keys self-heal by waiting)
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
- ✅ **ADAPTIVE SEAMS ACTIVE** (2026-07, round 3 — BALANCE_ARCHITECTURE.md §7): `finishRun`
  computes the frontier power gap once per settle and composes `adaptive.income` into both
  chains — catch-up 0.35 (≤×1.7), ahead-taper 0.5 (≥÷1.45), off below stage 10 (fresh settles
  byte-identical). Catch-up surfaces on Results as **Momentum**; the taper stays silent.
  Measured: molt cadence back on target, dead-progression/power-spike detectors to ZERO.
- ✅ **Genome Rank Dividend** (2026-07, IDLE-HARVEST.md §rank): idle rate ×(1 + 4%·(rank−1)) —
  the mastery ladder feeds the harvest; rank I exactly ×1; guardrail prices it (idle < active
  holds); Harvest screen chips the bonus.
- ✅ **Progression Loop Engine** (`state/progressionLoop.ts` + `LoopDirective` on Results/Campaign/
  Infinite) — 8 enforced invariants (walls form, farms pay, caps gate, prestige ring) — PROGRESSION-LOOP.md
- ✅ **Progression Simulator** (`dev/progressionSim.ts`, `npm run sim:progression`) — virtual
  accounts over the REAL meta layer, hour-band report + problem detectors (dead-progression is
  molt-aware since 2026-07: a mid-band Molt is permanent progress, not a dead zone) — PROGRESSION_REPORT.md

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
- ✅ Transcendence: maxed cards buy a permanent SECOND effect line from per-archetype pools
  (`core/geneTranscend.ts`, cost = rarity base ×120, permanent choice / full-price re-choice,
  ❂ Archive panel + grid chrome) — the designed sink beyond full levels (GENE-EVOLUTION.md §Transcendence)

### Hero Symbiotes (the champion wing of the Mulligan pillar) — HERO-SYMBIOTES.md
- ✅ Core: 54 organ SPECIES (9 per class, exactly 3 per class×category cell — coverage-tested;
  mono-class triples possible in every slot),
  3 slots × 3 seats per hero, per-slot Complete Hero Adaptations, 7-row category-census Resonance
  (`core/heroSymbiote.ts`, save v41 `heroSymbiotes`) — the kit TYPE has no damage/cooldown stat
  fields, so a symbiote can never duplicate Hero Equipment (structural contract)
- ✅ Gates: slot I free · slots II/III per-hero IDENTITY TRIALS (`HERO_SYMBIOTE_GATES`, typed
  complete over HeroKind — a new hero fails the compiler without its two trials) + 35/180 Ichor
- ✅ Sim: HeroMods.symbiote behavior kit read at presence-gated seams (strike toxins/components,
  kill plague/haste via NEW killing-blow credit `Enemy.lastHitHero` — lifetime `heroKills` finally
  accrues — ability echo, overheal carapace, revive cocoon, aura swell, summon nurture, adaptive
  AI); live probe asserts every verb; goldens byte-identical
- ✅ Visuals: `render/heroSymbiotes.ts` (4th PART_DRAWERS consumer) — per-slot stage anatomy,
  living motif shimmer, resonance crown; Hero Lab portrait previews the SAME layer
- ✅ Recognition: mulligans Power bucket ×`accountSymbiotePower`, genome source `hero-symbiotes`
  (50), collections ×4 (organs/adaptations/resonances/evolutions), achievements ×4
- ✅ UI: `ui/SymbioteChamber.tsx` in the Hero Lab — slot cards, trial checklists with live ✓/✗
  rows, two-step Ichor confirm, organ conservatory (graft/seat/level), next-step recommendation

### Nucleus Mulligans (the Hive's own organ system) — NUCLEUS.md
- ✅ Core: 30 support organs (5 per class, 3 categories), 3 chambers × 3 organs, class adaptations
  (`core/nucleus.ts`, save v37 `nucleus`) — towerDamageMult BANNED (registry-enforced identity)
- ✅ Gates: chamber 1 free · chamber 2 "THE TRIAL OF THE SWARM" (6-system trial) · chamber 3
  "THE APEX CHAMBER" (deep campaign/genome/power/megas/molts/mastery/collection + 300 Ichor)
- ✅ Run fold: `RunOptions.nucleusEffects` at boot (golden-safe; out of daily/tutorial); visible
  Hive mutations per organ (veins/plating/eyes/tentacles/pulse/sacs/spores + adaptation crowns)
  via `render/nucleusDress.ts`
- ✅ Recognition: mulligans Power bucket ×`nucleusPower`, genome source `nucleus` (45), collections
  `nucleusOrgans`+`nucleusAdaptations`, achievements ×3, mechanics teach row, security guards ×3
- ✅ UI: `ui/NucleusChambers.tsx` atop the Mulligan Lab — chamber cards, trial checklists with live
  ✓/✗ rows, two-step Ichor confirm, organ conservatory (grow/slot/level), live mutation preview

**Compressed summary (Gene Evolution).** *Architecture:* `CardDef` (cards.ts) carries optional
`maxLevel`/`upgrades`/`ascension`/`skins`/`art`; player state is a sparse `save.genes:
Record<id, GeneCardSave{level, ascension?, rarityTier?, skin?, favorite?, pinned?, timestamps}>`
owned by `core/geneCards.ts`. Ownership = `stats.uniqueCards` (draft once ⇒ collected forever).
The run seam is `effectiveGeneEffects(def, level, ascension=0)` — base + authored level effects —
applied in `chooseCard` and at boot for `RunOptions.startingGenes` (the same seam folds the
chosen Transcendence line via the 4th arg + `RunOptions.geneTranscends`). Level 0 ⇒ base effects, so
fresh saves stay golden byte-identical. *Public APIs:* `meta.upgradeGene(id)` (guarded spend:
owned + gate + wallet), `meta.transcendGene(id, optionId)` (maxed + real option + wallet; permanent), `meta.setGeneSlot/swapGeneSlots/buyGeneSlot/startingGenes`,
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
- ✅ **UX CONSOLIDATION PASS — the Five Foundations** (2026-07, UX-CONSOLIDATION.md + the five
  reference docs): a game-wide pass to make the SAME depth dramatically easier to understand —
  the player is never left asking "what am I supposed to do now?". No content removed; overlapping
  guidance OWNERS removed (one fact, one owner). (1) **Mission Control** (MISSION-CONTROL.md) — the
  Command Center centerpiece answers "what now?" with a primary objective + secondary ledger + AHEAD
  strip. (2) **Hive Intelligence** (HIVE-INTEL.md) — the re-founded, DERIVED notification feed (acting
  retires a row with zero bookkeeping; capped; four questions per row; silence over noise). (3)
  **Guided Unlocks** (GUIDED-UNLOCKS.md) — every early wing walks you through itself on first contact
  (spotlight → practice interaction → one-time reward), coverage enforced against the unlock registry.
  (4) **Evolution Roadmap** (EVOLUTION-ROADMAP.md) — the whole learning curve on one rail, derived from
  the same doors it points at. (5) **Power Advisor** (POWER-ADVISOR.md) — exact "what should I buy?"
  everywhere spending happens. Tutorial graduation hands off to Mission Control; the HUD Tour opens
  Foundations-first; Help wiki carries all five as CORE rows + replayable field guides; the returning-
  player Update Briefing bridges into the feed's ACT rows. Persona-simulation guardrail
  (foundationsUX.test.ts): every persona across the spectrum always has an objective, a bounded feed,
  and something to do — no dead-ends, no notification walls
- ✅ Combat Tutorial, HUD Tour, Help wiki + mechanics registry, "What's New" — TUTORIAL.md, HELP.md
- ✅ **THE COMMISSIONING** (2026-07, PROFILE.md §commissioning) — account creation at tutorial
  completion as ONE four-step ceremony (was: scattered reveal + CommanderName modal + a cold
  first-launch WelcomeGate that completers never saw): GRADUATION (reward payout, shared
  RewardRows) → DESIGNATION (server-mirrored name + sanitizer-clean callsign generator,
  auto-skipped for named veterans) → IDENTITY (12-sigil registry worn on the banner +
  re-choosable in Mastery Profile; a ONE-TIME founding-title oath of three, riding the
  titleName chain) → SAFEGUARD (guest/create/sign-in via the accounts platform's AuthForms,
  asked after the player has something to lose). `core/identity.ts` + `profileSigil` (additive)
  + `meta.commission` one-persist settle; skippers keep the legacy modal fallbacks;
  identity.test. All chrome fully localized (EN/ES/PT `commission.*`)
- ✅ **Designation tags** (2026-07, PROFILE.md §designation-tags) — the duplicate-name system:
  names stay non-unique; a stable 4-digit REGISTER NUMBER (`#0421`, FNV-1a over the permanent
  playerId, `core/identity.designationTag`) disambiguates everywhere names meet. The
  leaderboard read derives each row's tag SERVER-side from its stored player_id via the same
  shared function (premium.ts pattern — zero schema change, unforgeable); dim `#tag` suffix on
  LB rows + Profile banner; both name prompts preview the full identity. backend.test pins the
  server derivation
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
- ✅ **Game Action Security Layer** (**hardened 2026-07**): every meaningful player action passes
  `guard(actionId, key?)` — data-driven token buckets + cooldowns + duplicate windows from ONE
  central registry (~35 policies across purchase/claim/economy/progression/network/account);
  the `persist()` chokepoint adds a flood valve + clock-rollback high-water mark + **cross-tab
  write arbitration** (newest tab owns the save; stale tabs stop persisting and show a reload
  notice — security/tabArbiter.ts) for every current AND future meta mutation automatically;
  `finishRun` carries a **settle-once replay cache** (the same result object can never pay
  twice). Inert in Node (sim/personas unaffected); enforcement tests make unguarded economy
  mutators and registry drift unshippable; debug surface compiles out under
  VITE_RELEASE_HARDENED — SECURITY.md
- ✅ Initialization cutscene (first boot, replayable from Settings) + wave-launch breach transition — **overhauled to full procedural canvas cinematics** (`render/introScenes.ts`): five deterministic set-pieces (deep-crust radar reacquisition, the swarm boiling up ember-lit strata, veins consuming a steel lattice, the breathing molten Hive Core, the title spore-field/aurora), film-style cross-dissolves, letterbox grade + grain, per-scene copy accents; reduced-motion shows a hand-picked still per scene; DPR-capped for mobile
- ✅ Service worker: offline shell, versioned caches, player-controlled update toast — DEPLOYMENT.md §sw
- ✅ LiveOps calendar — **overhauled again (2026-07)**: 11 deterministic UTC events across 4 weighted
  categories (peak / spotlight / hunt / surge — sorted top-down, the heaviest live category names the
  console's headline band) folding ×1-baseline lane multipliers (cores / Gene Essence / materials /
  **mega-ichor / loot**) into finishRun + openContainer, each at the reward's SOURCE scalar so reveals
  match grants; a generic schedule engine (`windowEnd`/`nextWindow`/`upcomingWindows` — hour-scan over
  pure predicates) drives the unified LIVE OPERATIONS console (pulsing LIVE dot, category-sorted accent
  event cards with data-driven boost chips + "ends in" countdowns, UP NEXT forecast rail,
  reduced-motion-safe sheen) — LIVEOPS.md
- ✅ **Weekly Directives** (LIVEOPS.md §directives): a cumulative objective ladder — 3 deterministic
  UTC-weekly directives (drawn from a metric pool: kills / wins / waves / boss+mega kills / weak points /
  damage / flawless / towers) with live progress banked from run facts at finishRun, a per-row claim
  plus a shared CAPSTONE that unlocks when all three clear; rewards claim explicitly (guarded), progress
  is golden-safe (meta-only, `save.directives {week, progress, claimed}`, v33). Home card gated on the
  Daily reveal — DirectivesCard.tsx
- ✅ Localization core: typed `t()` layer, EN source-of-truth keys, ES/PT catalogs (missing key =
  compile error), Settings language picker, live re-render — I18N.md

### Retention & identity systems (the live-game batch)
- ✅ **The Wardrobe (cosmetics ecosystem)** (**overhauled 2026-07**): unit Phenotypes (6
  families × every tower/hero, generated) PLUS 34 global cosmetic KINDS in four groups
  (arena FX / audio & music packs / interface shells / commander identity) — ~125-item
  launch catalog on one validated registry with typed unlock sources (campaign/depth/
  daily/rush/roulette/achievements/collection ranks/Ichor Boutique/battle pass/milestones/
  events). Dressing layer applies payloads to root CSS attrs + cue families + music
  transforms + the renderer kit (precomputed enemy/boss/mega reskins, nucleus/battlefield/
  trail/FX params). Save v31 wardrobe record (equips/favorites/seen/milestones/persisted
  reveal queue); Wardrobe screen (tabs+search+filters+audition+randomize), unlock ceremony,
  6 collection codices (skins pay Biomass ×1.03 each; wardrobe codices are zero-power,
  paid via the claimable milestone track) — COSMETICS.md §wardrobe
- ✅ **Battle Pass (seasons)**: 100-level dual-track, 14-day rotation (max-window tamper
  rule, rollover auto-claim mail), two launch seasons (Crimson Bloom ❁ / Abyssal Tide ≋ —
  unique palette/music re-voice/crown rewards), XP from runs/achievements/expeditions/
  roulette (curve 320+6n ≈ 61.7k total; archetype sims pinned), Ichor level buys, 1 ad
  level/day, premium via 250 Ichor OR the store Season Pass door — `bp_premium` $9.99, with
  the FIRST-ever purchase always the half-price `bp_premium_first` $4.99 SKU (limit 1,
  `seasonOfferFor` shows exactly one door; store card + pass-screen button) — free taste
  levels 1/50/99, permanents once-ever (premium ones economy-only) with repeat replacements,
  infinite Perennial Bloom stack, save v31 battlePass record, Season nav screen — BATTLEPASS.md
- ✅ **Flash sales (v42)**: 4 one-time milestone bundles ($1.99–$4.99, limit 1, value
  ×1.4–3.0, honesty-tested list prices) armed at achievement highs (first Mega kill /
  stage 12 / pass level 5 / first Molt), 48h windows anchored at FIRST SIGHT, one popup
  per 72h with an eligibility floor (stage 3 + 5 runs), dismissed popups never re-pop
  (store section keeps the countdown) — state/flashOffers.ts + PREMIUM-STORE.md §flash
- ✅ **Quests & Missions (the directive layer)**: missions compose quests — a 12-verb
  counted-objective vocabulary (`MissionCond`) credited from finishRun/vault/expeditions/
  roulette/pass-levels into BOTH lanes at once. WEEKLY lane: ring of 3 quests × 6 missions
  on 7-day windows (pass epoch; max-window tamper rule; progress NEVER carries over —
  rollover auto-claims earned rewards then resets; repeat finales substitute 40 Ichor +
  300 Cores). MAIN questline “The Descent Below”: 3 permanent chapters × 10 missions,
  sequential (claimed finale opens the next; only the active chapter accrues). Every
  finale's FIRST completion grants a story cutscene (quest-unlock kind resolved off the
  `once` ledger; premiered from the hub via cutsceneBus) + an exclusive quest-source
  wardrobe cosmetic — both cross-links test-pinned. Rewards reuse the Battle-Pass
  interpreter (shared `applyRewardList`); every claim path (manual, finale auto-claims,
  rollover mail) feeds pass XP at one rate table. Save v32 `quests` record;
  `quests`+`missions` collection codices (fresh-save zero); Quest Board nav screen
  (stage-4 reveal) hosting Champion Contracts as its third section; run completions
  surface as a Results category + a claimable-count nav badge — QUESTS.md
- ✅ **Idle Harvest (the permanent passive lane, save v40)**: away-time accrues toward an
  upgradeable cap (8h ladder → 72h → +12h/level forever), collects roll a gated future-proof
  drop registry through a value budget priced in core-equivalents, and a 10-node infinite
  evolution tree (six-lens progression gates: Campaign/Genome Rank/Molts/Rush/Collections/
  Power) grows every axis. Guardrail-pinned below 25% of the weakest active lane at every
  band (anti-dust-farm minValue floors; monotone tamper-proof clock, 48h bounded freeze).
  Harvest screen (living hopper + tree + drops + ledger), once-per-session arrival strip,
  pods-burst ceremony with grow-next suggestion; idle codex + 7 achievements + genome
  source + Sleepless Hive emblem. Zero Power by design — IDLE-HARVEST.md
- ✅ **Champion Contracts** (overhauled): weekly deterministic 3-contract board (LiveOps
  weekIndex) over a 24-row/8-week pool, 14-verb data vocabulary (incl. CombatClass
  bans/purities, boss/draft/hero verbs) judged in finishRun via contractReport (payout and
  display share one evaluator), difficulty pips, core + Account-XP payouts, exactly one
  Gilded marquee per week (pool-stride invariant, pinned), PERFECT WEEK sweep bonus
  (lifetime counter + watermark, v-safe additive save fields), near-miss Results feedback
  ("missed by one: <label>"), rotation countdown + sweep meter on the board card (home +
  Quest Board third section), Genome Rank journey source, 3 achievements, Help-wiki teach
  row — CONTRACTS.md
- ✅ **Nemesis & Trophies** (**overhauled 2026-07**): losses seed a returning hunter whose
  **grudge ladder** (core/nemesis.ts) escalates it by `slain` into named tiers (Marked →
  Hunted → Reviled → Apex Predator), each layering REAL deterministic traits (hp, armor,
  +Nucleus damage, faster sieges) via RunOptions — dailies excluded, replay-exact; a
  tier-intensity brand + a vengeful entrance roar. Revenge pays tier-scaled cores + an Abyssal
  phenotype + a permanent **Vengeance organ** (pure-upside, one per chassis). Trophies: 10
  tradeoff organs + 5 vengeance organs, mounted on a **RACK of up to 3 slots** (grows with
  organs harvested), derived ownership + a `save.vengeance` avenged-chassis ledger (v34) —
  NEMESIS.md
- ✅ **Hero Expeditions**: benched heroes on 7-mission board (2h–16h, absolute endsAt,
  offline-safe); class affinity (+25%), risk tiers (deterministic windfall/setback rolls),
  rare finds, per-mission mastery ledger (v27), multiplier-stack offer matrix in the
  HeroLab panel — EXPEDITIONS.md
- ✅ **Chronicle (patch-note pipeline)**: `npm run notes` — git commits → classified,
  categorized patch notes (pure classifier + registry-diff content detection + ⚑ review
  flags); generates in-game Update Briefing data (save v28 `patchNotes`), website
  patch-notes page data, docs/HISTORY.md, dev-blog drafts every ≥10 commits —
  CHANGELOG-PIPELINE.md
- ✅ **Infestation Map** (**overhauled**): 4 regions × 4 sectors; every run feeds with
  **spillover** (overflow → same region → emptiest anywhere), sectors climb named **tiers**
  (Dormant→Foothold→Colony→Stronghold→Saturated), saturation **halves decay**, a full region
  **entrenches** (bonus ×1.25); pin a sector/region/spread; regions pay live-scaled run
  passives, lazy wall-clock decay. **LIVING canvas territory map** (`render/infestationMap.ts`):
  organic region lobes + creeping cell fills + pinned pulse + feed reticle + entrenchment auras
  + just-fed flashes, DPR-aware, visibility-paused, reduced-motion still, a11y button overlay;
  richer `infestationView` with tiers + decay forecasts + map totals — INFESTATION.md

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
One mega at a time (`spawnMegaBoss` ignores a second). Weak points must descend into the
`MEGA.minWeakPointY..maxWeakPointY` band — calibrated to the real slot grid (pads y 740–900)
so every tower reaches them (validator-enforced). Rotation runs only in the wave
phase. Rewards are paid at `finishRun` from `RunStats.megaKills`; ledger records land live via
events (mirrors `bossKilled`). **LONE SIEGE** (docs/MEGA-BOSS.md §lone siege): a mega that is
the last thing standing can never stall the run — after `siegeGraceSec` it lashes the Hive
directly (telegraphed, interruptible, self-tightening cadence, tier-scaled damage), its mass
descends so every tower connects (`megaBodyY`, deeper `siegeChipMult`), and reinforcement
pulses surge; a resumed wave plan stands it down (`MegaRuntime.siegeT/lashT/lashWindup/lashes`,
view `MegaBossView.siege`).

**Future hooks.** Scripted tutorial beat for the first encounter; per-mega codex art; weak-point
"accuracy" stats; assembled/procedural megas (the pool + validator already support composition).

**Known limitations.** Ability windows lapse across the inter-wave settle; slow-motion kills are
presentation-side only (determinism); hero raid duty (`heroMegaRaid`: seek nearest organ →
strike → body fallback) engages only while the field is empty — living enemies always take
priority. Tower/beam raid duty likewise YIELDS while the Core is threatened (`megaRaidYield` —
the hive-guardian override, docs/MEGA-BOSS.md §targeting), and campaign mega stages display a
raid-premium power bar (`campaign.ts C.megaStagePremium`).

## Compressed system summary — Living Battlefield (docs/LIVING-BATTLEFIELD.md)

**Architecture.** One render-only module, `render/livingBattlefield.ts`, drawn beneath the entities in
`renderer.ts drawGame` (after `drawBiomeWash`) plus an over-entity ambient pass. A hidden per-run
"biomass" (`computeAssimilation`) folds towers (count + strain/branch/stars/mastery/graft), heroes
(+gear), kills/boss/mega, wave, log-scaled Power Score, and biome into an evolution **stage 0–5**
(`STAGE_THRESHOLDS`, names `Dormant…Living`). In the live game the stage comes from the canonical
**Assimilation Index** (`core/assimilation.ts`) via `tierAt(game.assimilation.index)` — ONE source of
truth shared with the mood FX/music/HUD; the local biomass path is the standalone fallback
(tests/spectate) and always supplies the regional hotspots. `intensity=(stage+progress)/6` is the master alpha.
**Architecture (v3):** pure `deriveTerraform()` spec (house derive/draw pattern) — a greedy
nearest-connected vein TREE through the build, terrain eye sites, biome flora (`BIOME_FLORA` data row,
dominant-motif fallback), spread params; a radial INFECTION FIELD makes mutation radiate outward from
every hotspot and merge with the hive frontier. Stable terrain BAKED into TWO canvases keyed
`(stage,biome,layout,permScars)` — BASE (membrane, feathered crust, vein casings, shaded blooms, flora,
eye sockets, perm scars; breathing alpha) + GLOW (vein cores, glints, frontier shimmer;
heartbeat-modulated alpha ⇒ the network pulses as one organism) — rebuilt only on change, CROSSFADED
(~0.85s). Live accents: vein beads, vein-crawling parasites (under entities), terrain EYES whose pupils
track the nearest enemy (LOD-gated), nucleus organ, combat flare, mega bloom, fading scorch, ambient
spores. Headless fallback paints a direct wash + spec veins. Inert at Stage 0.

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

## Compressed system summary — Adaptive Music (docs/MUSIC.md)

**Architecture.** Two halves in `src/audio/music.ts`: (1) a PURE composition core — `MOTIFS`
(10 scale-degree melodies), `TRACK_LIBRARY` (15 `TrackDef` rows: bpm/root/scale/progression/
introBars/motif/counterMotif/scenes/lateWeight/rotateAfterLoops/8 layer gain ranges),
`barNotes(track, bar)` deterministically rendering every layer's notes per bar, pure selection
(`pickTrack`, `bossTrackFor`), `STINGERS` (8 melodic reward gestures); (2) a WebAudio manager —
lookahead scheduler (150 ms/40 ms), per-layer buses + fixed stereo stage, mastering chain
(master → duress low-pass → compressor glue), bar-aligned equal-power crossfades (urgent cap
0.35 s), rotation after authored loop budgets. SFX bridge in `sound.ts`: `STING` map (cue tag →
stinger, 6 s throttle) + `bossKilled` listener. Dev console: `src/ui/MusicDebug.tsx` (Settings).

**Public APIs.** `music.play(category, { boss?, force?, trackId? })` — callers request a
CATEGORY, the manager picks (GameView passes the boss banner name; victory/defeat are one-shot
cadences). `setIntensity(0..1)` (layer gain seam — Assimilation floor + combat pressure),
`setDuress(0..1)` (<35 % integrity low-pass drown), `setProgression(0..1)` (App: campaign depth
+ molts), `setScene(navKey)` (Hub: biases next menu pick), `stinger(id)`, `duck(depth, s)`,
`setLayerGain`, `setPinned(on)` (dev override), `setEnabled`, `setVolume`, `stop`,
`currentTrackId`. Pure exports for tests/tools: `TRACK_LIBRARY`, `TRACKS`, `MOTIFS`, `STINGERS`,
`LAYER_IDS`, `tracksOf`, `pickTrack`, `bossTrackFor`, `barNotes`, `chordAt`,
`BOSS_THEME_OVERRIDES`.

**Extension points.** New track/motif/stinger = one data row; new boss = nothing (stable FNV-1a
hash into the boss slice) or one `BOSS_THEME_OVERRIDES` entry; new menu scene = tag a nav key in
`scenes`; cue-driven payoff = one `STING` map row.

**Assumptions.** Layer gain max ≥ min (intensity only ADDS — test-enforced); combat/boss author
choir/hits `[0, x]` so instruments emerge with intensity; stingers stay in the E-minor home-key
family; `barNotes` deterministic (same bar → identical notes); render/audio-only ⇒ golden-safe.

**Future hooks.** Sample-based voices swap inside `voice()`/`drum()`/`hit()` without touching
composition; per-biome motif bias; scene-change acknowledgment stingers.

**Known limitations.** `setLayerGain` overrides last until the next `setIntensity`/track switch;
events category has one track; choir is synthesized (detuned triangles + vibrato), not vocal
samples.

## Compressed system summary — Progression Gating & Director (docs/PROGRESSION-GATING.md)

**Architecture.** One declarative registry (`src/state/unlocks.ts` `FEATURES`) decides when every
hub screen (all 20 NavKeys) and gated wallet chip (`cur:ichor`/`cur:mats`/`cur:cells`) reveals:
per-row condition (`always|runs|stage|cores|gear|containers|cards|mulligans|ichor|mats|molted|
rushHistory|dailyHistory|any`), learning-curve `order`, teaser `blurb`, `teach` link, written
`because`. Reveals LATCH in `save.director.revealed` (meta.latchNewReveals — a surface never
re-seals); `director.visits` counts screen opens. The read-model layer
(`src/state/progressionDirector.ts`) derives exposure/ignored-features/advice/cognitive-load
bands. Generated timeline: docs/UNLOCK-TREE.md (`npm run unlocks`, drift-tested).

**Public APIs.** `featureRevealed(save, id)` · `featureView(save, id)` → {revealed, progress,
label} · `nextReveals(save, n)` (nav teasers) · `unlatchedReveals` · `cognitiveLoad` ·
`unlockTimeline` · `guaranteedByStage` | meta: `latchNewReveals()`, `noteNavVisit(k)` |
director: `revealAge`, `ignoredReveals`, `directorAdvice`, `loadEstimate` | `navBus.go/onGo`.

**Extension points.** New screen = NavKey + one FeatureDef + one mechanics row with
`unlock: featureRevealed(...)` — tests enforce coverage/backstop/pacing/teach/announcement-sync
(the whole integration). Consumers: Hub (nav filter + next-2 teasers + FeatureLocked briefing +
wallet chips), What's New (unlock fanfare `audio.cue('unlock')` + "Open it now ▸" via navBus),
nextGoals `reveal` kind, HudTour (revealed stops only), homeModel widget `when` gates.

**Important assumptions.** Fresh account = home/campaign/help/settings only (`calm` band);
worst-case walk reveals ≥1 screen every stage 1–8, ≤3 per stage; everything guaranteed by
Stage 10 (bossrush); veterans auto-pass (conditions over save + rush/daily grandfather clauses);
completeHudTour archives the onboarding-time backlog so the queue never cascades post-tutorial.

**Future hooks.** directorAdvice feeds adaptive hints/session summaries; latch stamps are pacing
analytics; per-currency reveal rows generalize to any future wallet chip.

**Known limitations.** In-run mechanic gating (branches at S3, deep strains at S15 …) stays with
its owning systems — this framework gates HUB surfaces; the persona pacing test evaluates
worst-case (stage/runs) only, ignoring drop-luck acceleration; media slots on What's New cards
remain placeholder captions until art lands.

## Compressed system summary — Account Level (docs/ACCOUNT-LEVEL.md)

**Architecture.** A pure core module (`src/core/accountLevel.ts` — curve, XP table, milestone
math, deterministic per-level rewards, UTC period keys) + one meta-side fold
(`foldAccountXp` in `src/state/meta.ts`) that every XP-paying persist wraps. Save module:
`save.accountXp = {xp, week{key,xp}, month{key,xp}}` — **level is always derived** from XP
(`levelFromXp`), never stored. Curve `80 + 40·n^1.25` (uncapped, spike-free, overflow-safe to
L100k+); reward budget `18 + 6·n^0.7` — value deliberately grows slower than requirement.

**Public APIs.** Core: `ACCOUNT_XP`, `xpForLevel/levelFromXp/levelProgress/totalXpForLevel`,
`isMilestoneLevel/nextMilestone` (named tiers 10/25/50/100/250/500/1000, then every 500),
`ACCOUNT_TITLES/ACCOUNT_TITLE_BY_ID`, `accountLevelReward(level)`, `weekKey/monthKey` | meta:
`accountLevel()` → {xp, level, into, need, nextMilestone, weekXp, monthXp},
`drainAccountLevelUps()`, `RunOutcome.accountXp: AccountXpDelta` | UI: `AccountXpBar`
(compact/full), `AccountLevelToast`, `rewardLine(reward)`, `titleName(id)` (profile.ts).

**Extension points.** New XP source = one `ACCOUNT_XP` row + wrap its persist in
`foldAccountXp`; new reward currency = one `ACCOUNT_REWARD_POOL` row + one apply line in the
fold; leaderboard modes `accountLevel/weeklyXp/monthlyXp` live in `MODE_BOUNDS`
(functions/api/leaderboard/submit.ts) + `currentClaim` (src/net/leaderboard.ts).

**Important assumptions.** Rewards are deterministic per level (shared ladder — previewable,
fair, save-RNG-free); level containers reuse `kind:'cache'` (no new PendingContainer branch);
run-settle level-ups celebrate on Results (outcome drains the queue), off-run grants toast on
the menu — two paths, never both; period boards bucket by SERVER-derived keys.

**Future hooks.** Weekly/monthly ledgers are battle-pass/season-track ready; sim checkpoints
carry `accountLevel` (PROGRESSION_REPORT column) for pacing evidence.

**Known limitations.** Boards are client claims (bounds + keep-best friction, like
daily/bossRush); `levelFromXp` is an O(level) walk (fine at real scales); milestone toasts
beyond the named tiers reuse the generic celebration (no per-tier bespoke art yet).

## Compressed system summary — Genome Rank (docs/GENOME-RANK.md)

**Architecture.** A pure core module (`src/core/genomeRank.ts`) computes a hidden GENOME RATING
from `GENOME_SOURCES` — 20 data rows (id, category journey/strength/arsenal/identity, weight,
nav, score(snapshot), advisor hint) spanning every major system. Completion axes score
`clamp(ratio)×10` against LIVE registries (new content deepens the ladder); depth axes
(stage/level/wave/molts/power/…) decelerate forever. Ranks: ten authored tiers (Dormant 0 …
Living Catastrophe 5200), then +1600 per rank infinitely with deterministic procedural names.
`meta.genomeSnapshot()` adapts SaveData → plain numbers; **rating/rank always DERIVED** — the
only stored piece is `save.genomeRank.celebrated` (the promotion watermark).

**Public APIs.** Core: `genomeRating`, `genomeBreakdown`, `genomeAdvice`, `rankFromRating`,
`rankName/romanNumeral/rankThreshold`, `genomeRankReward(i)`, `genomeTitleName` | meta:
`genomeSnapshot()`, `genomeRank()`, `genomeBreakdown()`, `genomeAdvice(n)`,
`pollGenomePromotions()` (finishRun + drain call it), `drainGenomePromotions()` | UI:
`GenomeRankPanel` (Profile: emblem/bar/breakdown/advisor), `GenomePromotionCinematic` (App,
menu), leaderboard mode `genomeRating` (score = rating, wave = rank index), audio cue
`promotion`.

**Extension points.** A future system integrates with ONE `GENOME_SOURCES` row + ONE
`GenomeSnapshot` field in `meta.genomeSnapshot()` — breakdown, advisor, dominance guards and
UI all derive from the table. Thresholds/weights are data; recalibrate on `npm run sim:report`.

**Important assumptions.** Monotonic in every axis (progress never demotes); no source > 12%
of table weight (static test) nor > 35% of a live account's rating (sim guard); promotions pay
exactly once — watermark persists WITH rewards; rewards are prestige-only (cores/ichor/
containers/titles), NEVER gameplay passives (golden-safe + no pay-to-win by construction).

**Calibration (2026-07, pinned sim).** 30h optimal → rating ≈ 1036 → Rank V Parasitic; top
source (campaign) 17%; guard pins the 30h band to ranks IV–VI and rising rating every band.

**Known limitations.** Snapshot recomputes collection+power on demand (ms-scale, event-driven
only); rank-gated profile frames deferred (titles carry identity); promotion cinematic reuses
the evo-unlock frame rather than bespoke per-rank art.

## Addendum — Mulligan Class Synergy & Adaptations (docs/MULLIGANS.md §classes/§adaptations)

Every modifier now carries a biological CLASS (the towers' six-class CombatClass taxonomy;
shared display table `src/core/combatClass.ts`; registry rejects classless rows — the
future-modifier contract). Matching all three grafts to the HOST tower's class activates the
**Complete Class Adaptation** (per-class capability bonus through existing MulliganStats
channels — Kinetic pierce, Resonant echo target, etc.; `CLASS_ADAPTATIONS` data), two matches
a minor tier; hybrids untouched. `resolveMulligan(state, hostClass?)` folds it (golden-safe:
inactive ⇒ identity); Power full ×1.06 / minor ×1.025 in the same bucket
(`accountMulliganPower` takes [state, hostClass] pairs). Presentation: class chrome on all
cards, host-synergy panel (pips/tier/chase copy), 8 sort modes, per-host recommender, ⟡ rail
crowns, the organism's class-hued thorn crown (battlefield-visible), in-run Inspector readout,
COMPLETE CLASS ADAPTATION ceremony + dedicated `adapt` cue. Genome mulligan measure blends
assembly + full adaptations.

## Compressed system summary — Idle Harvest (docs/IDLE-HARVEST.md)

**Architecture.** Pure model in `src/core/idleHarvest.ts` (accrual closed forms, infinite cap
ladder, 10-node gated evolution tree, drop registry, seeded roll, value pricing) over
`config.IDLE`; `meta` owns application (guards, wallets, lifetime ledger, Account XP,
achievements); `save.idle` (v40) = `lastCollect` anchor + `nodes` + never-reset ledger;
`HarvestScreen.tsx` = hub screen + arrival strip + collect ceremony.

**Public APIs.** `meta.idleView(now)` → accrual/nodes/drops/suggestion/ledger;
`meta.collectIdleHarvest(now)` → receipt | null (ONE atomic persist);
`meta.buyIdleNode(id)`; core: `idleAccrual`, `idleRatePerHour`, `rollIdleHarvest(acc, nodes,
ctx, rng)`, `idleGrantValue`, `eligibleIdleDrops`, `idleNodeCost/Gate`, `idleSuggestion`.

**Extension points.** A new idle drop = ONE `IDLE_DROPS` row (weight, `minCampaign?`,
`minGenomeRank?`, `rare?`, `minValue?`, `grant`) + one `applyIdleGrant` case. A new gate lens
= one `IdleGateReq` variant + `idleGateContext` field. Tunables all in `config.IDLE`.

**Important assumptions.** Playing ALWAYS out-earns idling — Monte-Carlo guardrail pins idle
value/wall-hour < 25% of the weakest active lane (campaign-replay cores, 2 runs/h) at stages
10→1000 with generous node depths; idle stage growth (0.02) strictly < campaign reward growth
(0.05); node soft-scaling `1+per·50·ln(1+L/50)` is ×1 at L0 (golden-safe) and log-bounded.
`effHours ≤ rawHours` always; offline efficiency ≤ 1. The accrual anchor is MONOTONE (a
rollback never rewinds it — re-farm loop killed); future anchors freeze accrual, bounded to
48h (`IDLE.tamperFreezeMaxHours`) on load. Fixed-price rows carry `minValue` affordability
floors (anti dust-farm). Spores are deliberately NOT an idle drop (rush-exclusive identity).

**Future hooks.** Cloud server-time validation (no schema change needed); banked-spore wallet
would be one registry row; LiveOps idle events can ride the BLOOM seam.

**Known limitations.** Client clock is semi-trusted: pure forward-faking mints cap-bounded
value from a deliberately weak lane (documented, accepted); container drops need slice ≥ 175
core-eq so they only appear at deep rates/caps or on BLOOMs (intended rarity); the ceremony
suggestion ignores multi-node strategy (cheapest-ungated only).

## Compressed system summary — In-Run Gameplay Feel Pass (docs/COMBAT-VISUAL-STANDARDS.md)

**Architecture.** Feel work is RENDER-SIDE by contract: the renderer reads `RenderState`
snapshots, all animation is time/id-keyed (no rng, no state the sim can see) ⇒ golden-safe by
construction. Sim-side additions are DATA only (`StatusEffectDef.fx` trait blocks) plus one
`hasListeners`-gated event (`statusApplied`). Five layers shipped: (1) the **Status Effect
Visualization System** — every status authors traits (hue/glow/pulseSpeed/overlay/particles/
distortion/jitter); `render/statusFx.ts` MERGES all live statuses per body into one blended
effect (weighted hue blend, deduped overlays, budgeted emitters) so combinations compose
procedurally — poison+burn, freeze+shock, anything future — with intensity scaling off
stacks/remaining; (2) **hit confirmation** — motion-tracker `hitFlash` rising edges burst
class-tinted sparks (pool 90, 120 ms/body throttle) over the existing flinch/knock; (3)
**status-flavored deaths** — the dominant affliction at death picks the echo (frozen SHATTER /
burning embers / spore burst / corrosive melt); (4) **tower anticipation** — `FORM_ANTICIPATION`
(keyed by BODY FORM, so all future towers inherit) winds the silhouette up + gathers muzzle
charge across the cooldown's last 30%; (5) **hero ability cues** — cooldown-edge tracker draws
activation bursts, ready flares, and a standing ready-glint. Projectile heads/trails now scale
log-capped (×1.4) with shot damage.

**Public APIs.** `mergeStatusFx(enemyView, quality) → MergedStatusFx | null`;
`drawStatusFxUnder/Over`, `statusBodyTransform`, `deathFlavorOf` (render/statusFx.ts);
`FORM_ANTICIPATION` (render/towerForms.ts); `STATUS_EFFECTS[*].fx` traits (core/status.ts);
`statusApplied` event → `status_dot`/`status_control` cues (GameView, 160 ms throttle).

**Extension points.** A new status = ONE `fx` block — merge, synergy blending, intensity,
body animation, death flavor and the category audio cue all ride free. A new tower form = one
`FORM_ANTICIPATION` row. New particle/overlay grammar = one enum member + one painter case.

**Important assumptions.** Quality tiers decided once per frame (full < 120 enemies, reduced
< 220, suppressed past LOD); bosses/elites are LOD-immune. The Mark/Resonance charge rings
stay bespoke (test-pinned reaction fuel). Legacy fast-field statuses render through the same
registry traits but do NOT emit audio events (only framework `applyEffect` does).

**Known limitations.** Heroes/minions don't carry framework statuses (nothing to draw there
yet); `distortion` is a body-scale shimmer, not a shader warp (Canvas2D); status visuals on
the flat-shape LOD tier are intentionally suppressed.

**Validation contract.** `statusRegistry.validate` REJECTS any status without a complete `fx`
block — incomplete combat content fails dev boot + `status.test.ts`.

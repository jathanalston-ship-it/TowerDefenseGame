# ROADMAP.md — Development Roadmap (canonical plan)

The build plan for *ASSIMILATION*, from empty repo to full release and live-ops.
Companion to the design corpus (`DESIGN`, `PROGRESSION`, `STAGES`, `TOWERS`,
`HEROES`, `EQUIPMENT`) and the engineering blueprint (`ARCHITECTURE.md`). Where those
say *what* and *how it's structured*, this says **in what order we build it, and how we
know each step is done.**

> **Status:** v0 plan. Milestones are **sequenced to de-risk**, not time-boxed —
> durations are rough guidance, not commitments. The ordering principle is: **prove the
> core loop is fun first (M1), then breadth, then permanent depth, then the meta, then
> prestige, then the honest-infinite endgame, then ship-quality + live-ops.** Each
> milestone is a **coherent, playable checkpoint** (per `CLAUDE.md` — finish in full;
> no half-wired features carried forward).

---

## Guiding principles

1. **Vertical slice before breadth.** M1 is a *fun, shippable-feeling* one-tower TD
   before we add a second tower. If the core loop isn't fun with one tower, no amount of
   content fixes it (`DESIGN §15` risk #8).
2. **Architecture-first, then content-as-data.** M0 lays the sim/render/UI split and the
   data-registry + effect-handler patterns (`ARCHITECTURE §2,§6,§12`) so every later
   milestone *adds data*, not *rewrites systems*.
3. **The harness is built early and paid forward.** The headless simulation harness
   (`ARCHITECTURE §17`, `PROGRESSION §9`) lands by M4 and validates every balance claim
   thereafter — we never hand-guess infinite curves.
4. **Progressive disclosure mirrors development.** We build systems roughly in the order
   players unlock them (`DESIGN §13`), so internal playtests follow the real new-player
   path.
5. **Trophies are sacred from the first save.** The versioned-save + migration discipline
   (`ARCHITECTURE §15`) is in place before there's anything precious to lose — retrofit
   is how saves get broken.
6. **Definition of Done, every milestone:** feature-complete to its scope · green tests +
   harness checks where applicable · played live and watched (`CLAUDE.md` rigor loop) ·
   `GAME-STATE.md` updated · one self-critique limitation named and addressed or logged.

---

## Milestone map (at a glance)

| # | Milestone | Theme | Maps to design phase | Key new docs realized |
|---|---|---|---|---|
| **M0** | Foundation & tooling | architecture skeleton | — | `ARCHITECTURE` |
| **M1** | Core TD vertical slice | *is the loop fun?* | Phase 0 | `DESIGN §6.1` |
| **M2** | The Launch Five towers | breadth of towers | Phase 0 | `TOWERS` |
| **M3** | Status & reaction engine | build-variety core | Phase 0–1 | `TOWERS` matrix |
| **M4** | Procedural stages + endless + harness | the generator | Phase 1 | `STAGES` |
| **M5** | Enemies, factions, elites, bosses | what you fight | Phase 1 | `ENEMIES` (sibling) |
| **M6** | Heroes | active-skill layer | Phase 1 | `HEROES` |
| **M7** | Cards, strains, corruptions | the run roguelite | Phase 1 | `CARDS` (sibling), `DESIGN §6.3–6.4` |
| **M8** | Permanent progression + save hardening | the trophy spine | Phase 1–2 | `PROGRESSION §2–3` |
| **M9** | Equipment & loot | hero horizontal depth | Phase 2 | `EQUIPMENT` |
| **M10** | Collection (Atlas, sets, libraries) | completionism + power | Phase 2 | `DESIGN §10` |
| **M11** | Hive Tree + meta loop + onboarding | the incremental spine | Phase 1–2 | `DESIGN §9`, `§14` |
| **M12** | Prestige I–II (Molt, Speciation) + balance pass | first ascensions | Phase 2 | `DESIGN §12`, `PROGRESSION §5` |
| **M13** | Prestige III–IV (Hivemind, Apex) | idle empire + mastery push | Phase 3–4 | `DESIGN §12` |
| **M14** | Prestige V–VI (Singularity, Omega) + seasons | the honest infinite | Phase 5–6 | `DESIGN §12`, `STAGES §13` |
| **M15** | Ship-quality, accessibility, live-ops | release 1.0 | release | all |

> Siblings `ENEMIES.md`, `CARDS.md`, `ECONOMY.md` (other design tasks) feed M5/M7/M8
> respectively; this roadmap assumes they land as data specs before their milestone and
> notes the dependency.

---

## M0 — Foundation & Tooling

**Goals.** Stand up the repository, the build, and the **architectural skeleton** that
every later milestone depends on. No gameplay yet — prove the *shape* of the system.

**Features.**
- Vite + React 18 + TypeScript (`strict`) project; ESLint/Prettier; CI (lint + test).
- The **sim/render/UI split** skeleton (`ARCHITECTURE §2`): an empty deterministic
  `World` ticking in a Web Worker, a PixiJS canvas reading it, a React HUD shell reading
  a snapshot store — wired end-to-end with a placeholder entity.
- **Core primitives**: seeded RNG with stream-splitting (`§5`), the fixed-timestep
  scheduler (`§7.1`), the entity/component store + pool (`§7.2`), the spatial grid
  (`§7.4`), `math/` curves.
- **Data architecture**: the content registry + Zod schema pattern (`§6`), the central
  config module, one trivial `Def` validated end-to-end.
- **Save skeleton**: `SaveStore` interface + IndexedDB impl, `SaveBlob` envelope with
  `schemaVersion`/`checksum`, an empty migration pipeline (`§15`).
- **Dependency-boundary lint** (`core ⇏ app`) enforced in CI (`§18`).
- `.gitignore` for `node_modules/`, `dist/`; update `CLAUDE.md` stack/commands tables
  with the now-real `npm` scripts.

**Risks.**
- *Over-engineering before a single fun loop exists.* → Build only the skeleton needed
  for M1; resist adding systems with no consumer yet.
- *Worker/serialization friction discovered late.* → Validate the snapshot/intent bridge
  with the placeholder entity **now**, while it's cheap to change.
- *Renderer choice regret.* → Keep all Pixi behind `render/`; a spike proves the
  entity-count budget before committing.

**Testing requirements.**
- Unit: RNG determinism (`same seed → same stream`), scheduler tick accounting, pool
  reuse, save round-trip (`save → load → deep-equal`).
- Smoke E2E: app boots, Worker handshakes, canvas renders the placeholder, HUD shows a
  snapshot value.
- CI green (lint + boundary rules + tests) is the gate to M1.

---

## M1 — Core TD Vertical Slice  *(the "is it fun?" milestone)*

**Goals.** A genuinely fun, minimal tower-defense loop: defend the Nucleus on one map
with **one tower**. This is the make-or-break milestone — everything else amplifies this
loop (`DESIGN §15` risk #8: "the core must be fun before any progression").

**Features.**
- One tactical map: a single path, buildable cells, the **Nucleus** with Integrity
  (`DESIGN §6.1`).
- **Enemy pathing** along the path (one basic enemy archetype) via the movement system.
- **One tower** (Needle Spitter baseline): targeting → firing → projectile → damage →
  death, through the real combat pipeline (`ARCHITECTURE §8`).
- **Biomass** economy: kills drop biomass; place/upgrade the tower in-run (`DESIGN §6.1`).
- **Waves**: a hand-scripted escalating sequence; win = survive N; lose = Nucleus at 0.
- Minimal HUD (biomass, Integrity, wave) + place/upgrade interaction via the **intent**
  bridge; basic juice (hit FX, number pops, SFX) — the loop must *feel* good.

**Risks.**
- *The loop isn't fun.* → This is the point of the milestone. Playtest hard; be willing
  to tune pacing/feel before adding anything. A boring slice is a stop-and-fix signal,
  not a proceed signal.
- *Feel debt (no juice) hides whether the loop is fun.* → Budget for minimal but real
  game-feel here; don't evaluate fun on a juiceless build.
- *Pipeline shortcuts that won't scale.* → Tower must go through the *real* targeting/
  damage systems (so M2–M3 reuse them), not a one-off.

**Testing requirements.**
- Unit: damage pipeline math; biomass income; targeting picks the intended enemy; Nucleus
  reaches 0 → run-end fires.
- Golden-run snapshot: fixed seed + scripted inputs → deterministic end state (the first
  regression guard, `ARCHITECTURE §17`).
- **Live playtest sign-off**: the team agrees the bare loop is fun (gating, qualitative).

---

## M2 — The Launch Five Towers

**Goals.** All five launch towers (`TOWERS.md`), each mechanically distinct, with their
in-run upgrade paths and targeting modes — proving the **content-as-data** pattern.

**Features.**
- Needle Spitter, Bone Mortar, Parasite Nest, Neural Obelisk, Flesh Reactor as
  **`TowerDef` data** (`ARCHITECTURE §6,§12`) — distinct roles: single-target, AoE/pools,
  DoT/spread/summon, control/aura, economy/overcharge.
- The behaviors each role needs, added as **registered effect handlers** (splash + ground
  pools, ramping infection + minion summons, auras/slows/hijack stub, biomass gen +
  overcharge adjacency) — *systems don't grow; the registry does*.
- In-run branching upgrades; per-tower **targeting modes**; tower selection (pick 3 of 5)
  in a minimal loadout screen.
- Onboarding seed: start with 2 towers, unlock the other 3 across early waves
  (`PROGRESSION §2.6`).

**Risks.**
- *Roles blur* (towers feel same-y). → Enforce the `TOWERS §distinctness` table: no two
  share role/status/scaling/failure-mode; playtest each in isolation.
- *Effect-registry API too narrow* for summons/auras/economy. → Stress the registry on
  the *most exotic* tower (Flesh Reactor economy/adjacency) early; widen the intent
  surface deliberately, once.
- *Performance* with Parasite Nest summons + Bone Mortar pools. → Pool minions/pools;
  validate the spatial grid under multi-source AoE.

**Testing requirements.**
- Unit per tower: its signature behavior (e.g., infection spreads on death; overcharge
  buffs adjacent; pools apply DoT) via headless sim assertions.
- Property: tower selection always yields a valid 3-pick; unlock pacing fires correctly.
- Perf: a stress wave with all five active holds the frame budget (`ARCHITECTURE §16`).
- Playtest: each of the 10 three-tower combos is viable and feels different.

---

## M3 — Status & Reaction Engine  *(the build-variety core)*

**Goals.** The synergy matrix (`TOWERS §reaction-framework`) — the single biggest driver
of build diversity — as **data + one resolver**, with clear on-field telegraphs.

**Features.**
- The five status types (Fracture/Corrosion/Infection/Disruption/Mark) as data on towers;
  stack/cap/decay rules (`ARCHITECTURE §8.2`).
- The **reaction resolver**: 10 `ReactionDef` rows → effect handlers; `★6` gates
  participation. Marquee reactions (Shred/Plague/Mind Rot) feel distinct.
- **Telegraphs**: visible, taught one-at-a-time on-hit feedback (`DESIGN §14.6`) — the
  player *sees* Shred happen.
- Vulnerability/amplify wired into the damage pipeline so control towers multiply, not
  just chip.

**Risks.**
- *Reaction spaghetti* if combos are special-cased. → The resolver must stay generic
  (one code path over data); adding a class later = a data row (`ARCHITECTURE §12.1`).
- *Reactions illegible* (player can't tell what fired). → Telegraph budget is a feature,
  not polish; no silent reactions.
- *Balance:* reactions trivializing content. → First harness use-case at M4 validates
  reaction DPS contribution stays in the intended band.

**Testing requirements.**
- Unit: every pairwise reaction triggers under the right two-status condition and only
  then; `★6` gating respected; reactions fire once per rule (no double-dip).
- Snapshot: a scripted two-tower combo produces the expected reaction sequence.
- Playtest: mixed-class builds *spike* vs. mono builds (the design intent), legibly.

---

## M4 — Procedural Stages, Endless & the Simulation Harness

**Goals.** Replace scripted waves with the **seeded procedural generator** (`STAGES.md`):
biomes, node graph, the threat-budget wave model, the Threat-Level difficulty curve, and
**endless mode** — and land the **balance harness** that validates it.

**Features.**
- Seeded generation pipeline (`STAGES §5`): biome → faction theme → topology → node graph
  → wave script, all pure + deterministic (`ARCHITECTURE §13`).
- Launch **biomes** with real rulesets (`STAGES §4`); the strategic **node graph** (route
  choice: Combat/Cache/Elite/Gene-Lab/Altar/Boss).
- **Threat Level** scaling (`STAGES §7`) + the designed→endless seam (`§6.2`); reward
  scaling with the efficiency-frontier curve (`§11`); extraction vs. death.
- **Stage modifiers** (procedural + biome-intrinsic) with telegraphed rules (`§8`).
- The **headless simulation harness** (`ARCHITECTURE §17`, `PROGRESSION §9`): batch-run
  loadouts × TL; assert TTK-flat-in-band and reward-per-minute-peaks-at-frontier.

**Risks.**
- *Curves wrong* → trivial or impossible endless. → The harness exists precisely to catch
  this; no curve constant ships unswept (`STAGES §16`).
- *Generator monotony* (samey stages). → Implement the anti-repeat window + wave-shape
  rotation now as **tested invariants** (`STAGES §13`), not later polish.
- *Determinism leaks* (a stage not reproducible from seed). → Property-test
  `(seed,contentVersion) → identical blueprint` before building on it.

**Testing requirements.**
- Property: generator determinism; anti-stagnation invariants hold; route constraints
  satisfied (`STAGES §3.1`).
- Harness sweeps: TTK and reward-per-minute curves match `STAGES §7.4/§11.2` targets; no
  permanent bucket runs away (`PROGRESSION §9`).
- Playtest: an endless push *feels* like a rising frontier; "push vs. extract" is a real
  decision.

---

## M5 — Enemies, Factions, Elites & Bosses

**Goals.** Populate the generator with real enemies: the five factions, the elite-affix
system, and **boss generation** (authored gates + procedural assembly).

**Features.** *(consumes `ENEMIES.md`)*
- Faction rosters (Parasites, Machine Cult, Corporate Security, Hive Organisms, Neural
  Aberrations) as `EnemyDef` data with faction mechanics, biased into biomes
  (`STAGES §4.1`).
- **Elite affixes** (`STAGES §9`): the rolled-modifier system + faction-biased pools +
  loot-floor bumps; build-counter pressure (status-immunity affixes).
- **Boss generation** (`STAGES §10`): authored bosses at shallow gates (incl. the Stage-5
  Apex that later gates Hero Slot 2) + procedural chassis/module/phase assembly for
  endless, with fairness constraints.
- Codex hooks: kills log Atlas entries (data only; the system lands at M10).

**Risks.**
- *Enemy variety doesn't pressure builds.* → Tie compositions/affixes to the
  build-counter goals (`STAGES §6.1,§13`); validate mono-builds feel the pressure.
- *Procedural bosses unfair/unwinnable.* → Encode and **property-test** the module-pairing
  fairness rules (no two uninterruptibles; always a window; phase resets) (`STAGES §10.2`).
- *Faction sprawl* outpaces art/design budget. → Ship the five with depth over breadth;
  archetypes are data so post-launch growth is cheap.

**Testing requirements.**
- Property: boss-fairness invariants at all TL; affix sets never contradictory; ≤1
  immunity affix.
- Harness: enemy HP/density curves keep TTK in-band across factions; elite/boss threat
  costs price correctly into the wave budget.
- Playtest: factions read distinctly; bosses are mechanics-checks, not stat-walls.

---

## M6 — Heroes

**Goals.** The active-skill layer (`HEROES.md`): the three launch heroes as **autonomous
units** the player steers — abilities, ultimate, stances, leash, respawn.

**Features.**
- Ravager / Shepherd / Overseer as `HeroDef` data + AI behavior layer (`ARCHITECTURE §8.4`).
- The autonomous-unit model (`HEROES §autonomous-unit-model`): leash, auto-target, stance
  (Aggressive/Defensive/Hold), ping/focus, ability auto/manual toggle, downed+respawn.
- Abilities + ultimate as cooldown-gated effect emitters (reusing the registry); heroes
  apply statuses → feed reactions (more appliers on field).
- Single hero slot for now (slot 2/3 unlock arrives with M11/M12 gating).

**Risks.**
- *Hero AI feels bad* (passive or suicidal). → Stance-driven behavior tuned in live play;
  the "casual lets AI drive, active micro adds value" promise (`DESIGN §1` pillar 5) must
  hold both ways.
- *Active layer overwhelms onboarding.* → Heroes disclose after towers (Phase 1), one at
  a time; default Ravager is the legible "go hit things" unit.
- *Combat path forks for heroes.* → Heroes are entities on the *same* systems, not a
  parallel engine (`ARCHITECTURE §8.4`).

**Testing requirements.**
- Unit: ability cooldowns/effects; stance changes alter targeting/movement; respawn timer;
  hero status application triggers reactions.
- Snapshot: scripted hero+tower combo (e.g., Overseer vulnerability → Needle Spitter
  Overstrike).
- Playtest: AI-driven and manually-microed both feel good; the skill delta is real but
  idle still pays.

---

## M7 — Cards, Mutation Strains & Corruptions  *(the run roguelite layer)*

**Goals.** The temporary **R-bucket** (`PROGRESSION §1.1`): between-wave card drafts, the
slow mutation-strain track, and voluntary corruptions — the renewable excitement that
resets every run.

**Features.** *(consumes `CARDS.md`)*
- Card draft (1-of-3) post-wave + at Gene Lab nodes; rarities Common→Corrupted; reroll/
  banish; **synergy chains** (`DESIGN §6.3`) — all as **run-state** card instances that
  evaporate at run end (`ARCHITECTURE §12.2`).
- Cards as registered effects across categories (poison/summons/economy/crits/AoE/CC/hero
  & tower buffs/mutation-synergy).
- **Mutation Strains** (macro run direction) + **Corruptions** at Altars (risk/reward,
  reward + TL multipliers, `STAGES §7.1,§8`).
- Discovered-card **library** flag persists (collection seed for M10).

**Risks.**
- *Card balance variance* (degenerate combos). → Harness fuzzes card combinations for
  runaway run-bucket multipliers; banish/reroll give counterplay.
- *Run state leaking into meta* (cards persisting). → The run/meta store split
  (`ARCHITECTURE §14`) makes reset structural; assert no card touches the save.
- *Choice overload* at the draft. → Progressive disclosure: drafts start simple; rarities/
  rerolls/strains unlock across Phase 1.

**Testing requirements.**
- Unit: draft odds by rarity weighting; reroll/banish; a card effect applies and **clears
  at run end**; synergy-chain detection.
- Property: no card persists into meta state; corruption stacking bumps TL + rewards per
  spec.
- Harness: run-bucket spike stays within the `PROGRESSION §5.3` band (×5–50), not beyond.

---

## M8 — Permanent Progression & Save Hardening  *(the trophy spine)*

**Goals.** Make runs *deposit* permanent power (`PROGRESSION §2–3`): Stars/Shards,
infinite Mastery, Class levels/keystones, the Power Score — and harden the save now that
trophies exist.

**Features.** *(consumes `ECONOMY.md` for currency sources/sinks)*
- Tower & hero **Stars** via **Shards** (deterministic income, `PROGRESSION §2.1`); the
  mechanics-first star ladders flip capability flags consumed by combat.
- **Mastery** (infinite log) + milestone perks; **Class levels** + slotted keystones
  (shared hero↔tower pool, the key coupling).
- The **bucket pipeline + Power Score** as pure functions, unit-tested against
  `PROGRESSION`'s worked example (`ARCHITECTURE §9`).
- Run→meta **rewards delta** hand-off; results screen that "shows the bars move"
  (`DESIGN §13.2`).
- **Save hardening**: real schema, the migration pipeline with fixtures, backups,
  non-destructive recovery (`ARCHITECTURE §15`).

**Risks.**
- *Bucket runaway* (a track inflates). → Harness sweeps each bucket stacked; additive-
  damped-within/multiplicative-across enforced in the pure fns (`PROGRESSION §1.1`).
- *Save migration debt starts here.* → First real `schemaVersion`; every later shape
  change ships a tested migration (CI gate) — discipline from day one.
- *Currency confusion* (the ladder unclear). → One currency ↔ one system (`DESIGN §9`);
  surface the ladder in UI.

**Testing requirements.**
- Unit: every bucket formula vs. `PROGRESSION` tables; Power Score mapping; cost/gain
  curves; star capability flags reach combat.
- **Save-migration fixtures**: a prior-version save migrates + validates (the permanent CI
  gate, `ARCHITECTURE §15.2`).
- Harness: stars/mastery/class income hits the pacing targets (★5 ≈ session, ★10 ≈ ~2
  weeks focused, `PROGRESSION §2.2`).

---

## M9 — Equipment & Loot

**Goals.** The hero-only **E bucket** (`EQUIPMENT.md`): the seeded loot service, the item
model (weapon/armor/relic), bounded affixes, sets, and deterministic crafting/salvage.

**Features.**
- Loot generation service (`ARCHITECTURE §10`): seeded rarity→base→bounded-affix rolls,
  legendary/exotic effects, depth-weighted drops (`EQUIPMENT §8`).
- Item model + **E-bucket** computation (vertical cap, horizontal variety); **set bonus**
  resolution across heroes; **relics** as rule-bending effects (the spice slot).
- **Armor auras & relics reaching towers** via the effect registry (the hero→tower
  bridge, `EQUIPMENT §4.7`).
- Crafting/salvage economy (Catalysts/Mutagen/Resonance/Dust); mass-salvage QoL with
  lock/favorite protection.

**Risks.**
- *Gear becomes a stat treadmill.* → Anti-stat-stick rule (≤1 flat affix; behavior-first)
  enforced in the affix schema; the chase is *rolls*, not magnitude (`EQUIPMENT §3`).
- *Loot RNG feels bad.* → Deterministic crafting turns drops into feedstock so the chase
  is "build the piece I want" (`EQUIPMENT §6`).
- *E-bucket inflates hero power.* → Hard caps + harness validation that E stays ~×2–3
  (`PROGRESSION §5.3`).

**Testing requirements.**
- Unit: drop rarity weighting; affix rolls clamp to bounded tiers; set-piece counting;
  E-bucket cap respected; salvage/craft transforms validate against config.
- Property: loot determinism by seed; armor-aura effect actually multiplies in-radius
  tower buckets.
- Playtest: a hero feels *different* across loadouts (horizontal variety delivered).

---

## M10 — Collection: Atlas, Sets & Libraries

**Goals.** Turn collection into both a completionist hook and a **real power source**
(`DESIGN §10`) — the mid-game retention engine.

**Features.**
- **Assimilation Atlas (Codex)**: enemy/elite/boss entries; completion grants permanent
  vs-type bonuses + lore + **shard payouts** (the codex→shard income loop,
  `PROGRESSION §2.1`).
- **Gear sets** & the **card/mutation library** as tracked collections with payoffs;
  cosmetic variant/skin scaffolding (no power).
- Codex-as-manual: the in-game encyclopedia surface (`DESIGN §14.7`).
- Bestiary **data** hooks for the future Apex "bestiary-as-arsenal" (`STAGES §10.3`).

**Risks.**
- *Collection feels like a chore, not a hook.* → Real power payoffs + visible "3 from a
  set bonus" framing (`DESIGN §5`); completion bonuses are meaningful, not flavor.
- *Codex bookkeeping cost* across infinite procedural enemies. → Entries are per
  *archetype/affix*, not per spawn; bounded, data-driven.

**Testing requirements.**
- Unit: kill→entry increment; completion grants the bonus + shard payout exactly once;
  set-bonus thresholds.
- Property: codex bonuses persist across prestige (trophy invariant, `PROGRESSION §6.1`).
- Playtest: a collection milestone lands as a *medium* dopamine beat (`DESIGN §13.2`).

---

## M11 — Hive Tree, Meta Loop & Onboarding

**Goals.** The incremental spine (`DESIGN §9`) and the **first-time-user experience** —
the glue that turns a pile of systems into a paced, legible game.

**Features.**
- **Hive Tree** (Essence): branching tree unlocking *systems/QoL* (economy, draft slots,
  rerolls, survival, **Roster branch incl. Hero Slot 2 — the "Twin Avatar" node**,
  `HEROES §slot-2`), with the Molt-reset multiplier scaffolding (`DESIGN §9.1`).
- **Session loop**: results → spend currencies → plan next loadout; loadout presets/
  templates (`DESIGN §14.5`).
- **Onboarding & progressive disclosure** (`DESIGN §13.1`): first 20 min pure TD; one new
  system per session; contextual tutorials; one-layer-foresight roadmap UI.
- Power Score + currency-ladder UI made legible (`DESIGN §14`).

**Risks.**
- *Onboarding cliff* (systems dumped at once). → The disclosure schedule is a hard
  feature; gate panels until their unlock (`DESIGN §15` risk #2,#8).
- *Hive Tree is just % nodes.* → Branches must unlock **mechanics/QoL**, not only stats
  (`DESIGN §4` mechanics-first).
- *Tutorial debt.* → Each system shipped M1–M10 needs its contextual teach moment
  retrofitted here; budget for it.

**Testing requirements.**
- Unit: Hive Tree node effects + costs; Hero Slot 2 unlock condition (Stage-5 Apex kill +
  node purchase); preset save/load.
- E2E: a scripted new-player path hits exactly one new system per early session (no
  premature panels).
- Playtest: a fresh player reaches the first Molt cleanly, never facing two unfamiliar
  panels at once.

---

## M12 — Prestige I–II (Molt, Speciation) + Balance Pass

**Goals.** The first two ascensions (`DESIGN §12`, `PROGRESSION §5`) — proving the
**trophies-keep / engines-reset** model and the catch-up multiplier rhythm — plus a full
harness-backed balance pass on everything M1–M11.

**Features.**
- **Molt** (Layer 1): reset Hive Tree/in-run economy; grant Ascendant Cells + Ascendant
  Tree + the global multiplier; **Adaptive Mutation slots**; the "what resets / what you
  keep / re-reach estimate" clarity screen (`DESIGN §14.8`).
- **Speciation** (Layer 2): reset Class levels; Genome Threads + Speciation Web; **Hybrid
  Towers** (class fusion — multiplying the reaction space) + Phenotypes + **Hero Slot 3**.
- Catch-up multipliers on income so re-climbs are fast (`PROGRESSION §5.2`).
- **Balance pass**: harness-validate prestige sqrt/log curves create a real "prestige now
  vs. later" decision; trophy-persistence invariants.

**Risks.**
- *Prestige feels like punishment* (loss aversion, risk #5). → Clarity screens + fast
  catch-up + trophies-forever; first Molt is cheap/generous and obviously speeds the
  re-climb.
- *Hybrid towers explode balance/complexity.* → Hybrids are data on the same systems;
  harness-sweep the new reaction combinations.
- *Save-migration risk* (prestige reshapes meta). → Versioned migration + fixtures for
  pre/post-prestige saves.

**Testing requirements.**
- Unit: reset scope per layer (only the intended engine resets; trophies untouched);
  currency-gain sqrt formulas; multiplier application.
- Property: **trophy invariants** (stars/codex/gear/mastery-milestones survive every
  prestige); migration of a maxed pre-prestige save.
- Harness: catch-up curves hit "re-reach in minutes not hours"; prestige timing isn't an
  obvious always-answer (`PROGRESSION §9`).

---

## M13 — Prestige III–IV (Hivemind, Apex)

**Goals.** The **idle/empire** dimension and the **mastery-optimization** endgame — the
two layers that convert "TD with progression" into "incremental empire" and then into a
theorycrafter's playground.

**Features.**
- **Hivemind** (Layer 3): reset Speciation + Mastery levels (milestones kept); Synaptic
  Cores + the **Hive Network** (idle overworld of held nodes generating resources offline)
  + **multi-lane** stages (`STAGES §3.2` topology unlock). **Offline/idle computation**
  goes live (`ARCHITECTURE §15.4`).
- **Apex** (Layer 4): reset Network; Apex Genes; **Corruption Tiers** as a core
  progression axis (the currency faucet, `PROGRESSION §5.2`), **Paragon** infinite respec
  trees, **Bestiary-as-Arsenal** (collection→units), **Gear Ascension** (+21..+30).

**Risks.**
- *Idle undermines active play* (risk #6). → Active strictly stronger; idle pays
  *something*; closed-form offline yields with a cap, exploit-tested (`ARCHITECTURE §15.4`).
- *Multi-lane breaks perf/UX.* → Entity-count budget + LOD (`ARCHITECTURE §16`); multi-lane
  is why Hero Slot 3 exists (covering parallel lanes).
- *Paragon = infinite inflation.* → Paragon is logarithmic + respec-able choice, not raw
  stacking (`PROGRESSION §1.3`); harness-bounded.

**Testing requirements.**
- Unit: idle accrual closed-form vs. elapsed time + offline cap; corruption-tier→currency
  faucet; Paragon log curve; Ascension cap raise.
- Property: offline calc is clock-tamper-resistant; bestiary units derive from completed
  codex entries only.
- Harness + Perf: multi-lane endless holds frame budget; idle vs. active ratio keeps
  active satisfyingly stronger (`PROGRESSION §9`).

---

## M14 — Prestige V–VI (Singularity, Omega) + Procedural Seasons

**Goals.** The **honest infinite** endgame: player-authored rules, optional automation,
and the procedural-season engine + leaderboards that outlast all authored content
(`DESIGN §12` Layers 5–6, `STAGES §13`).

**Features.**
- **Singularity** (Layer 5): **Run Automation** (full idle option; active still strictly
  stronger), **Meta-Laws** (permanent global rule alterations that rewrite generation),
  **Pantheon** (slot global buffs).
- **Omega** (Layer 6): **Ω-tiers** (clean ×1.5 countable steps, `PROGRESSION §1.3`);
  **Procedural Seasons** — each Ω cycle generates new modifiers/biome variants/challenge
  ladders; **leaderboards** (depth + daily/weekly shared seeds, `STAGES §13`).
- Leaderboard integrity via determinism + content-version stamping (`ARCHITECTURE §5`).

**Risks.**
- *Automation trivializes the game.* → Gated to here, opt-in, and provably weaker than
  active; record pushes require hands-on play (`DESIGN §1` pillar 5).
- *Procedural seasons feel hollow/random.* → Generator quality + anti-stagnation
  constraints (`STAGES §13`) + authored seasonal "beats" keep them purposeful.
- *Leaderboard cheating/desync.* → Deterministic seed+intent replays, content-version
  gating, server-side validation hooks (post-launch hardening).

**Testing requirements.**
- Unit: Ω-tier threshold gating (×10 production per tier) + ×1.5 mult; Meta-Law rule
  application; Pantheon stacking bounds.
- Property: a leaderboard run replays deterministically from `{seed, intents,
  contentVersion}`; daily-seed fairness (no single maxed loadout dominates,
  `STAGES §16`).
- Harness: Ω scaling keeps numbers legible (Ω20 reads as a rank, not `1.5e30`).

---

## M15 — Ship-Quality, Accessibility & Live-Ops  *(Release 1.0)*

**Goals.** Turn the feature-complete game into a **shippable, sustainable** product.

**Features.**
- **Content scale-up** to launch targets (depth on the five towers/three heroes/five
  factions + the full card/gear/relic catalogs) — pure data work on stable systems.
- **Game feel & audio**: full juice pass, the Flesh-Reactor-heartbeat audio tempo
  (`TOWERS §5`), VFX/SFX polish, results-screen dopamine.
- **Accessibility**: colorblind-safe status/reaction telegraphs, input remapping,
  text scaling, reduced-motion, difficulty/assist options.
- **Performance hardening**: long-session leak checks, low-end device budget, endless-LOD
  validation.
- **Live-ops scaffolding**: telemetry (the P0 "all-track stall" detector, `DESIGN §13.3`),
  remote-config for balance, the seasonal-content cadence, **cloud-save adapter**
  (`ARCHITECTURE §15.5`), crash reporting.
- **Monetization (if any)**: cosmetics/seasonal-cosmetic ladders only — *power is never
  sold* (`DESIGN §5`, risk #11).

**Risks.**
- *Endless polish / no ship date.* → 1.0 scope is locked to "the loop + 6 prestige layers
  + seasons, content at launch targets"; further content is post-launch live-ops.
- *Telemetry gaps hide pacing bugs.* → The all-track-stall detector and reward-cadence
  metrics are launch-blocking instrumentation, not nice-to-haves.
- *Save/cloud conflicts at scale.* → Versioned blobs + checksums + last-write-wins +
  migration fixtures; soak-test before enabling cloud.

**Testing requirements.**
- Full regression: unit + property + harness + golden-runs all green; **every historical
  save migrates** (the standing CI gate).
- Soak: multi-hour sessions — no leak, stable frame budget, save integrity intact.
- Accessibility audit: reactions/statuses distinguishable without color; full keyboard/
  remap path.
- Balance sign-off: harness confirms the §13 pacing across the 1000-hour curve; live
  playtest of the new-player → first-prestige path.
- Release checklist: telemetry firing, remote-config wired, crash reporting live,
  rollback plan for balance hotfixes.

---

## Cross-cutting concerns (every milestone)

- **The rigor loop** (`CLAUDE.md`): plan → implement → verify (tests **and** play it) →
  self-critique. A green check proves it *runs*, not that it's *fun and correct*.
- **Centralized tunables**: no balance constant outside the central config
  (`ARCHITECTURE §6.2`).
- **Save discipline**: any meta-shape change ships a tested migration — non-negotiable
  from M8.
- **Determinism**: nothing in `core` may break seed-reproducibility; property tests guard
  it.
- **`GAME-STATE.md`**: updated each milestone (designed vs. built vs. shipped);
  **`BUGFIX-LOG.md`**: one row per fix (`CLAUDE.md`).
- **Performance budget**: 60 FPS / hundreds of entities, re-validated whenever entity
  pressure grows (M2, M5, M13).

---

## Post-launch (beyond 1.0)

The architecture is built so post-launch growth is **content, not re-engineering**
(`ARCHITECTURE §18`): new towers/heroes/classes (incl. the retired-pre-launch **Cryo**
class and **Caustic/Viral heroes**, `TOWERS`/`HEROES`), new factions/biomes, new
relics/sets, new Meta-Laws — each a data + registered-effect addition. **Omega seasons**
(M14) are the standing live-ops engine: each cycle ships a procedurally-fresh ladder, so
the content treadmill is largely automated and the "1000+ hours, infinitely replayable"
promise is structurally backed rather than perpetually hand-fed.

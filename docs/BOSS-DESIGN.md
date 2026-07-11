# BOSS-DESIGN.md — Boss Progression Philosophy & the 25-Boss EA Roadmap

> **Thesis:** a boss is a **teacher, not a wall.** It must never be "the same fight with
> more HP and more damage." Every boss **introduces a mechanic, forces an adaptation, and
> permanently changes how the player reasons** about strain priority, positioning, and
> mutation choices. If a boss can be beaten by the exact build that beat the last one, it
> has failed. **No code changed here — this is the design spec + roadmap.**

**Status:** **Milestone 1 SHIPPED** (bosses 1–6 + their module spine live in `core/boss.ts` +
`core/game.ts`, injected into the campaign at stages 5/10/15/20/25/30). Milestones 2–4 remain
PLANNED. Framework: `core/boss.ts` (phase + module system). Companion: `ENEMIES.md`, `BIOMES.md`,
`EVOLUTION-CAP.md`, `IDENTITY-AUDIT.md`.

---

## 1. The six laws of an ASSIMILATE boss (all must hold)

1. **It teaches one thing.** Each boss has a single, legible *lesson* (e.g., "spread your
   damage," "protect the flanks," "don't over-commit to one strain"). A player should be
   able to say *why* they lost in one sentence.
2. **It forces adaptation.** The build that cleared the previous stage must be
   *insufficient* — not by stat-check, but because the boss **invalidates a strategy**
   (single-target, clustering, one damage type, static positioning…).
3. **It alters strain priority.** The optimal target/upgrade order changes for this fight.
4. **It alters positioning.** Where you germinate matters — the boss punishes the current
   comfortable layout.
5. **It alters mutation decisions.** The right Evolution/graft/gene card for *this* boss
   differs from the general-purpose pick.
6. **It is bio-horror, not a dragon.** It **grows, splits, infects, or corrupts** on a
   heartbeat cadence — never a knight with a health bar. (See `IDENTITY-AUDIT`.)

**The anti-pattern (banned):** `hp *= 3; damage *= 2`. HP/damage may scale *with* a
mechanic, never *as* the mechanic.

---

## 2. How the framework already supports this (build on, don't rebuild)

`core/boss.ts` bosses are **phase machines**: `phases[]` (HP-fraction thresholds that
strictly descend) each activate a set of **modules[]**. A module is a discrete behavior —
`addKind` (spawn adds), the existing **charger** (dash) and **suppressor** modules, etc.
This is exactly the substrate for mechanic-teaching bosses: **each phase turns a new
mechanic on**, so a boss visibly *escalates its biology* as it dies. The 25-boss roadmap
below is authored almost entirely as **new module types + phase scripts + data**, not new
engines — consistent with the data-driven architecture.

**New module primitives the roadmap needs** (the reusable spine — build once, reuse across
bosses). Milestone 1 shipped three of these, fully wired into the deterministic sim:

- ✅ **`healer`** — pulses HP to itself + the nearby pack on a cadence (`bossHeal`). Counter: kill-
  priority / burst.
- ✅ **`carapace`** — raises heavy *bonus armor* for a telegraphed window (`b.carapace` folded into
  the `applyDamage` armor term). Counter: **Fracture → Shred**, which cracks the armor (an
  armor-break zeroes the carapace too). *This is the shipped realization of the design's
  `armor-facing`:* true positional flank-detection would require threading hit-source coordinates
  through every damage call site, so we express the "hardened front" lesson through the existing
  armor/Fracture system instead — same lesson (bring an armor answer + position your Fracture
  forward), no pipeline surgery.
- ✅ **`splitter`** — death-triggered cleave into smaller copies, one `generations` shorter each time
  (`splitBoss`, capped by `PERF.maxEnemies`). Counter: spread damage, don't overkill.

Still PLANNED (land with their Milestone 2–3 bosses, to avoid dead code): `shield-linked` (invuln
while an ally lives), `enrage-timer` as a standalone overlay (the `enrager` module already ramps),
`zone-denial` (corruption pools that block placement), `adaptive-resist` (grows resistance to the
most-used damage type), `burrow-reposition`, `mutate-phase` (changes its own type mid-fight).

---

## 3. The archetypes (each = a lesson + the module(s) it needs)

| Archetype | The lesson it teaches | Forces adaptation via | Key module(s) |
|---|---|---|---|
| **Mutation** | "one damage type isn't enough" | **adaptive-resist**: it hardens against whatever killed the last add | `adaptive-resist`, `mutate-phase` |
| **Swarm** | "single-target loses to numbers" | floods small adds; single-target strains drown | `addKind` (high count), `enrage-timer` |
| **Support** | "kill priority > raw DPS" | a healer/buffer that must die *first* or the fight is unwinnable | `heal-aura`, `shield-linked` |
| **Siege** | "protect the core / positioning" | bombards the Nucleus from range; forces forward defense | existing artillery standoff + `zone-denial` |
| **Summoner** | "control the board, not the boss" | continuously births adds; DPS on the boss is a trap | `addKind` (sustained), `shield-linked` |
| **Split** | "don't over-invest single-target" | splits into smaller copies on hit thresholds | `split-on-death` |
| **Adaptive-evolution** | "change your build mid-fight" | literally re-types itself each phase (armor→speed→regen) | `mutate-phase`, `armor-facing` |
| **Biome** | "the arena is the enemy" | tied to a biome hazard that reshapes the lane | `zone-denial` + biome hook |
| **Prestige** | "your whole account is the test" | post-MOLT gatekeeper that checks *build mastery*, not power | composite (all modules) |
| **Infinite-exclusive** | "there is no 'beat it'" | scales endlessly with a *rotating* mechanic set (never the same twice) | director-driven module rotation |
| **Campaign-finale** | "everything you learned, at once" | a multi-phase gauntlet chaining prior lessons | composite phases |
| **Elite variant** | "a familiar fight, one rule changed" | a normal boss + ONE modifier (a cheap, high-value remix) | 1 module overlay |

---

## 4. The 25-boss Early-Access roadmap

Placement: **C#** = Campaign stage, **B:x** = biome-gated, **∞** = Infinite-exclusive,
**MOLT** = prestige. Each row names the **mechanic introduced** and the **adaptation
forced** — the two things that make it not-a-stat-wall. Sequenced so each lesson builds on
the last.

### EA Milestone 1 — "the fundamentals" (bosses 1–6, the first campaign act) — ✅ SHIPPED
Live in `BOSS_DEFS` + `CAMPAIGN_BOSSES` (stage→boss), replacing the procedural finale at these
stages. Enemy `armor` shipped as a `BossDef.armor` field; the "armor-facing" lesson ships as the
`carapace` module (see §2).

| # | Boss | Archetype | Placement | Introduces | Forces you to… |
|---|---|---|---|---|---|
| 1 | **The First Antibody** | Siege (tutorial boss) | C5 | high `armor` (shrugs chip) + a `channeler` core-shot + a `charger` dash | build *forward*, focus the channel — teaches the boss loop safely |
| 2 | **Brood Cyst** | Swarm | C10 | two `spawner` broods + an `enrager`, phase-gated | add AoE / splash — punishes pure single-target |
| 3 | **The Mender** | Support | C15 | a `healer` aura that regens itself + the whole pack | **kill priority** — burst it down or clear the adds it mends |
| 4 | **Chitin Colossus** | Mutation (armor) | C20 | **`carapace`**: a hardened window that shrugs off direct fire | bring **Fracture → Shred** to crack it (the shipped armor lesson) |
| 5 | **Mitotic Horror** | Split | C25 | **`splitter`**: cleaves into smaller copies (2 generations) | spread damage; don't overkill one target |
| 6 | **The Purge Engine** | Campaign-finale (Act 1) | C30 | chains swarm→armor+heal→enrage+channel across **3 phases** | adapt *phase to phase* — the first real gauntlet |

### EA Milestone 2 — "the biomes" (bosses 7–14, biome-gated)
| # | Boss | Archetype | Placement | Introduces | Forces you to… |
|---|---|---|---|---|---|
| 7 | **Necrotic Bloom** | Biome (necrosis) | B:necrosis | **zone-denial** corruption pools that block placement | re-plan your whole layout live |
| 8 | **The Swarmqueen** | Summoner | B:hive | sustained add-birth + **shield-linked** (invuln while brood lives) | control adds before the boss — DPS-on-boss is a trap |
| 9 | **Airborne Antigen Prime** | Mutation (flight) | B:aerial | only air-capable strains hit it | **build diversity** — a flyer answer |
| 10 | **Subdermal Leviathan** | Siege (burrow) | B:subdermal | **burrow-reposition** — surfaces at your weakest flank | mobile / omnidirectional coverage |
| 11 | **The Resonant** | Support (buffer) | B:neural | buffs the surge's speed + damage until silenced | disruption/CC priority over damage |
| 12 | **Enzyme Titan** | Mutation (adaptive) | B:acid | **adaptive-resist**: hardens vs. your most-used damage type | **rotate damage types** mid-fight |
| 13 | **Hollow Chorus** | Split + Swarm hybrid | B:bone | splits *into* a swarm | layered AoE + priority — two lessons at once |
| 14 | **Biome Apex: The Assimilated Heart** | Biome-finale | B:core | the arena itself pulses, shrinking safe placement over time | tempo — win before the arena closes |

### EA Milestone 3 — "the endgame spine" (bosses 15–22, prestige + infinite)
| # | Boss | Archetype | Placement | Introduces | Forces you to… |
|---|---|---|---|---|---|
| 15 | **The Warden** | Prestige gatekeeper | MOLT-1 | checks *build coherence*: punishes generic all-rounder builds | commit to an archetype (a real MOLT test) |
| 16 | **Evolved Warden** | Adaptive-evolution | MOLT-2 | re-types every phase (armor→regen→speed→shield) | **change build within one fight** |
| 17 | **The Devourer** | ∞ | ∞ rotating | eats your *strongest* strain if left exposed | protect your carry — dynamic priority |
| 18 | **Null Vector** | ∞ | ∞ rotating | periodic damage-immunity windows; punishes burst-only | sustained + burst mix |
| 19 | **The Hydra Strain** | Split (endless) | ∞ rotating | splits without limit under a soft cap | AoE saturation as a stat check *with a mechanic* |
| 20 | **Hive Tyrant** | Summoner (elite) | ∞ rotating | births *mini-bosses*, not trash | mid-fight target triage |
| 21 | **The Corruptor** | Support (anti-player) | ∞ rotating | corrupts *your* strains (temporarily disables them) | redundancy — don't rely on one node |
| 22 | **Omega Antigen** | Campaign-finale (Act 2 / EA cap) | C-final | a 5-phase capstone chaining every mechanic taught | mastery of the entire kit |

### EA Milestone 4 — "the remix layer" (bosses 23–25, elites + system)
| # | Boss | Archetype | Placement | Introduces | Forces you to… |
|---|---|---|---|---|---|
| 23 | **Elite: Enraged variant (system)** | Elite variant | any boss +overlay | **enrage-timer** overlay on any existing boss | speed — a familiar fight, one new rule |
| 24 | **Elite: Warded variant (system)** | Elite variant | any boss +overlay | **shield-linked** overlay | add-clear before boss damage |
| 25 | **Elite: Aberrant variant (system)** | Elite variant | any boss +overlay | **adaptive-resist** overlay | damage-type rotation on demand |

> Bosses 23–25 are **not new fights** — they are a **modifier system** (like Diablo elite
> affixes) that remixes bosses 1–22 into dozens of encounters for near-zero content cost.
> This is how ~22 authored bosses become a *deep* boss layer for EA.

---

## 5. Progression philosophy across the 25

- **The difficulty curve is a *mechanics* curve.** Early bosses teach ONE thing in
  isolation (swarm, then heal-priority, then armor-facing). Mid bosses **combine two**.
  Late bosses **chain many** and **change mid-fight**. HP/damage rise only enough to give
  the mechanic time to matter.
- **Every boss retires a comfort zone.** Boss 2 kills "pure single-target." Boss 4 kills
  "germinate anywhere." Boss 12 kills "one damage type forever." Boss 16 kills "set-and-
  forget." By the finale, no lazy build survives.
- **Rewards are mechanic-shaped, not stat-shaped** (ties to `PROGRESSION-REDESIGN.md`):
  a boss's first-kill reward is a **new capability** (a graft archetype, an Evolution fork,
  a gene keystone) that *answers* the lesson it taught — so beating the swarm boss unlocks
  a splash mutation, beating the adaptive boss unlocks a damage-type-swap graft, etc.
- **Elite variants are the infinite content multiplier** and the source of the best gear.

---

## 6. Build order (maps onto the framework)

1. ✅ **The module spine** — Milestone 1 shipped `healer`, `carapace`, `splitter` (fully sim-wired),
   each guarded by `bossProblems` (the boss registry validator). The remaining primitives
   (`shield-linked`, `zone-denial`, `adaptive-resist`, `mutate-phase`, `burrow-reposition`) land
   with their Milestone 2–3 bosses so nothing ships as dead data.
2. ✅ **Bosses 1–6** (Milestone 1) authored in `BOSS_DEFS`, pinned to campaign stages via
   `CAMPAIGN_BOSSES` (the generator overrides the procedural finale at 5/10/15/20/25/30 while
   keeping the RNG stream identical → every other stage stays procedural, goldens untouched).
3. **Elite-variant overlay system** (bosses 23–25) — unlocks huge encounter variety early.
4. **Bosses 7–14** as biomes land.
5. **Prestige + Infinite bosses 15–22** with the director-driven rotation for ∞.
6. Each boss ships with a **telegraph** (`b.telegraph` banner — `MENDING` / `CARAPACE` / `SPLIT!`
   / `CHANNELING` / …). **Still to do:** a per-boss **Bestiary/Archive entry** (the codex currently
   keys by *chassis*, so authored bosses share a chassis row) and bespoke **first-kill capability
   rewards** (today a boss kill feeds the chassis Bestiary + the collection reward tracks — a real
   reward, but not yet the "unlock the answer-capability" celebration the design wants). These are
   the immediate Milestone-1 follow-ups.

**Definition of done per boss:** a new player who lost can articulate the lesson; the build
that won differs from the previous boss's winning build; zero HP/damage-only phases.

---

## §siege (2026-07) — siege behaviors & the four-phase mutation arc

**Bosses are encounters, not big HP bars.** The module library grew from 9 to 16 kinds — the
seven SIEGE behaviors pressure placement, hero positioning, and biomass in ways normal enemies
never do (each with an explicit counter):

| Kind | What it does | Counter |
|---|---|---|
| `corecrush` | Grips the Nucleus AT the Hive, draining Integrity/s; EXPOSED while gripping (`BOSS.gripExposeMult` bonus damage taken) | Burst it off |
| `burrower` | Submerges (untargetable, immobile), then ERUPTS beside the Hive | Keep a back line |
| `bulwark` | Grows a bio-shield with real HP (rides the enemy `shield` absorb) | Sustained damage |
| `corruptor` | Seeds a decaying pool ON the nearest tower cluster; towers inside deal `frac` less damage (strongest pool applies, no stacking) | Value outside the pool |
| `gravitas` | Drags heroes toward itself (never inside 40px) | Hero mobility/positioning |
| `dampener` | Aura window: nearby towers fire `frac` slower (soft suppressor — they still shoot) | Spread, long-range value |
| `rally` | PHASE-ENTRY reinforcements, `amount + floor(missingHP × 3)` adds | Bank AoE for the shift |

**Phases (canonical four-beat arc):** procedural assembly cuts the HP bar at
**100 / 70 / 40 / 15%** (shorter fights truncate the same table), each phase adds a module,
stamps a `visualTier`, and the FINAL phase of a 3+ arc is the **desperation beat**
(×1.25 speed, ×1.2 siege damage via `bossPhaseDamageMult`). Every transition is a spectacle:
`MUTATING!` float, splice cue, hit-flash, a `bossPhase` gameEvent (app-gated like
`bossKilled`), and the renderer grows NEW anatomy per tier — orbiting limb-buds (t1+), a
counter-rotating second spike crown (t2+), a wounded-red desperation halo (t3). Corruption
pools render as seething violet ground-rot; a burrowed boss draws only its churning mound;
a gripping boss shows a thick crushing tether into the Core plus an EXPOSED gold ring.

**Visual identity (`render/bossChassis.ts`):** every framework boss renders its CHASSIS body
plan and its OWN `BossDef.color` — before this layer the sim's borrowed `'tyrant'` body made
all bosses the same red disc. Five silhouettes (bruiser wedge-and-knuckles · artillery
hull/braces/dorsal barrel with a live muzzle charge · swarmlord pod-ringed mother-mass ·
controller hooded bell with a scanning iris and NO spikes · juggernaut banded plate slab),
five chassis-keyed threat crowns (same `visualTier` growth contract), a stable per-def hide
marking (the tiebreaker when chassis AND palette collide — the Progenitor vs. the Brood Cyst),
and procedural bosses resolve their family palette through the `proc_<chassis>_<tl>` id.
Render-only and LOD-gated: at low detail a boss stays a cheap flat shape in its own color, and
the sim never reads any of it — golden-safe by layer.

**Anatomy v2 (2026-07):** each chassis gained an **attack/motion character** — the bruiser
knuckle-drags on alternating beats behind under-jaw tusks; the artillery hull lives on a hard
**sawtooth fire cycle** (charge climbs the barrel → muzzle FLASH → recoil kick against planted
braces); the swarmlord's pods take turns **hatching** (rim flare + an embryo pressing the shell);
the controller casts a translucent **scan cone** from its sweeping iris over drifting
command-tendrils; the juggernaut arcs **pressure sparks** along its welded seams. `drawBossBody`
now takes `hpFrac` (the renderer passes `e.hp / e.maxHp`): the hide **cracks below 60%**, and
below 30% the wounds split open with ichor-heat under a failing-chassis **micro-tremor** — the
fight's progress reads on the body, not just the bar. Phase shifts also roar: the `bossPhase`
event drives the dedicated `boss_phase` mutation cue (GameView), layered over the sim's splice
crunch.

**No hardcoded boss logic:** everything remains data (`BossDef` modules/phases through the
existing `bossRegistry` + `bossProblems` validation, which now enforces the new kinds'
params). `assembleBoss` composes 2–5 modules and up to 4 phases from the widened pool, rising
with Threat Level — future bosses are one def or one procedural roll. The Purge Engine
(stage 30) and The Progenitor now run full four-phase siege arcs (desperation CORE CRUSH
finale on the Purge Engine); the Milestone-1 teaching bosses keep their single-lesson purity.

**Golden safety:** framework bosses never spawn in the pinned standard runs, and every new
fold is identity off the boss path (dampen ×1, corruption ×1 with no pools, phase damage ×1)
— the golden suite stayed byte-identical with NO re-pin. Contract tests:
`core/bossmodules.test.ts` §siege (grip drain + peel-break, burrow untargetability + eruption,
bulwark soak, pool seed/decay/placement, hero drag, dampen window, rally + visualTier stamp,
validation rejections).

## §identity (2026-07) — chassis identity: signatures, epithets, desperation profiles

**The body plan is a PERSONALITY, not a stat block.** `CHASSIS_IDENTITY` (core/boss.ts) gives
each of the five chassis: a **creed** (one-line fantasy), a **SIGNATURE verb** nothing else may
field (`SIGNATURE_OWNER`; `bossProblems` refuses cross-chassis theft), **affinity weights** that
bend procedural module rolls toward its fantasy (`pickModule` — unlisted kinds weigh 1), and a
**desperation profile** — the finale runs the kit HOT in that body plan's way (`cadenceMult`
multiplies module cooldowns, validated to [0.4, 1], on top of speed/damage mults).

| Chassis | Signature | What it does | Counter |
|---|---|---|---|
| bruiser | `warcry` | Every living enemy gains `frac` speed for `duration` (Enemy.hasteT/hasteMult, lazy fields) | Slows; hold AoE for the stampede |
| artillery | `mortarfall` | `amount` reticles bloom on the DENSEST towers (deterministic density sort), land after 1.15s, and SUPPRESS towers under the blast for `duration` | Spread placement |
| swarmlord | `broodburst` | Spends `frac` of its own max HP to birth `amount` adds; EXPOSED (`exposeT`, gripExposeMult) while torn | Punish the window |
| controller | `nullwell` | A well between it and the nearest tower SWALLOWS projectiles crossing it (max 2 live; beams ignore them) | New firing angles |
| juggernaut | `unstoppable` | March window: slow/stun/interrupt-immune, damage reduced by its authored `frac` (`unstopDR`) in applyDamage | Burst BEFORE/AFTER, never during |

**Sim wiring (game.ts):** signatures fire from the same module-cooldown loop; `mortarStrikes` +
`nullWells` tick beside corruptionPools (they outlive their caster), `unstop`/`exposeT` tick in
bossSystem, warcry haste folds into the movement step, the well-swallow gates on wells existing,
and the unstop/expose folds sit beside the grip fold in applyDamage. **Reaction bursts are true
damage and intentionally pierce the march** (same vocabulary as carapace-vs-Shred) — reaction
builds stay a juggernaut counter. All paths are empty/zero on non-signature runs (golden-safe;
suite stayed byte-identical, no re-pin).

**Identity surfaces:** every `BossDef` carries an **epithet** (authored bosses author one;
`assembleBoss` derives one from the kit via `epithetFor` — signatures name the boss first, then
siege verbs, then support; the chassis creed is the fallback). The HUD banner shows
`name — epithet`; the **intro card** adds the epithet byline + one `MODULE_LABEL` chip per kit
verb (read the fight before it starts); the **defeat beat** (`boss-fall`, off the `bossKilled`
event's new optional `epithet`) drops the title with the body. From `SIGNATURE_TL` (8) a
procedural kit anchors on its signature, and the desperation phase always fields it. Renderer:
mortar reticles (closing lock + crosshair) and null wells (counter-rotating violet vortex) draw
beside corruption pools; both carried by HudSnapshot (`mortarStrikes`, `nullWells`).

**Contract tests:** boss.test.ts §identity (bijection, theft refusal, TL gating, anchor +
desperation-fields-signature, epithet derivation/priority/fallback, cadence band, label
totality — `MODULE_LABEL` is a total Record so a new kind without a label is a type error);
bossmodules.test.ts §signatures (warcry haste grant + fade, mortarfall reticle-on-gun +
suppression, broodburst self-spend + adds + exposure, nullwell swallow freeze + 2-well cap,
unstoppable DR through applyDamage + slow-immune march).

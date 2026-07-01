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

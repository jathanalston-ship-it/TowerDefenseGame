# ARCHITECTURE.md — Technical Architecture (canonical spec)

The engineering blueprint for *ASSIMILATE*. Companion to the design corpus
(`DESIGN.md`, `PROGRESSION.md`, `STAGES.md`, `TOWERS.md`, `HEROES.md`,
`EQUIPMENT.md`). This doc owns **how the software is structured** — module
boundaries, data flow, state ownership, the save system, and the per-system
technical patterns — so the game can scale to *1000+ hours of content* and stay
*maintainable* by a small team.

> **Scope discipline:** this is architecture, not implementation. It contains
> **TypeScript type/interface sketches and module maps** (the contracts and
> boundaries) — it does **not** contain gameplay logic, balance code, or system
> bodies. Type shapes are illustrative contracts, marked as such; real values live in
> the central data config (`PROGRESSION §0`, `STAGES §15`).

> **Stack reconciliation (read once):** `CLAUDE.md` recorded a *provisional* lean of
> "not HTML, leaning Python." The product owner has now **confirmed the stack as
> React + TypeScript + Vite** (web). This doc supersedes that provisional note. The
> design is engine-agnostic enough that the *simulation core* (the durable part) would
> port to another renderer if ever needed; only the `/ui` and `/render` layers are
> web-specific.

---

## Table of Contents

1. [Architectural goals & constraints](#1-architectural-goals--constraints)
2. [The cardinal rule: Sim / Render / UI separation](#2-the-cardinal-rule)
3. [Tech stack & rationale](#3-tech-stack--rationale)
4. [Module map (folder structure)](#4-module-map)
5. [Determinism & RNG](#5-determinism--rng)
6. [Data architecture](#6-data-architecture)
7. [The simulation core](#7-the-simulation-core)
8. [Combat systems](#8-combat-systems)
9. [Progression systems](#9-progression-systems)
10. [Loot generation](#10-loot-generation)
11. [Equipment systems](#11-equipment-systems)
12. [Enemy / Hero / Tower / Card systems](#12-content-systems)
13. [Procedural generation](#13-procedural-generation)
14. [State management & the Sim↔UI bridge](#14-state-management)
15. [Save system](#15-save-system)
16. [Performance budget & strategies](#16-performance)
17. [Testing & the simulation harness](#17-testing)
18. [Maintainability & dependency rules](#18-maintainability)
19. [Risks & mitigations](#19-risks--mitigations)
20. [Open technical questions](#20-open-technical-questions)

---

## 1. Architectural goals & constraints

Derived directly from the design pillars and risks:

| Design driver | Architectural requirement |
|---|---|
| 1000+ hrs, dozens of towers / hundreds of cards (`DESIGN §11`) | **Data-driven content** — definitions are data, not code; adding content ≠ editing systems. |
| Infinite, deterministic stages (`STAGES §5`) | **Deterministic, seeded simulation** — same seed + content version = same run. |
| Anti-inflation, legible power (`PROGRESSION §0`) | Power is a **pure functional pipeline** of multiplicative buckets → one Power Score. |
| Simulation harness for balance (`PROGRESSION §9`) | The sim must run **headless** (no DOM) and **fast** (1000s of runs). |
| Reaction-dense combat, swarms (`TOWERS §reactions`) | A performant **entity/system core** with spatial partitioning + pooling. |
| Idle layers (Hivemind/Singularity, `DESIGN §12`) | **Offline/elapsed-time computation** at load; meta state independent of the live sim. |
| Trophies-forever, engines-reset (`DESIGN §4`) | **Schema-versioned save** with a robust migration pipeline (never lose trophies). |
| Legible UI over a spreadsheet (`DESIGN §14`) | **React renders state it never owns**; the sim owns truth, UI subscribes. |

**Non-negotiables:** TypeScript `strict`; the simulation never imports React or the
DOM; all content validated by schema at load; everything balance-relevant is config.

---

## 2. The cardinal rule

> **React is not the game loop.** The most important decision in this codebase.

Three layers, strictly separated, communicating in **one direction** per frame:

```
        ┌───────────────────────────────────────────────────────────┐
        │  SIMULATION CORE  (plain TS, deterministic, headless)      │
        │  fixed-timestep tick · entities · systems · RNG · rules    │
        │  — never imports React, DOM, or the renderer —             │
        └───────────────┬───────────────────────┬───────────────────┘
                        │ snapshots (throttled)  │ render buffers (per frame)
                        ▼                         ▼
        ┌───────────────────────────┐  ┌──────────────────────────────┐
        │  REACT UI  (HUD, menus,   │  │  RENDERER  (Canvas/WebGL via  │
        │  meta-progression panels) │  │  PixiJS) — reads sim, draws   │
        │  reads selectors, sends   │  │  entities; no game logic      │
        │  intents (commands) in    │  └──────────────────────────────┘
        └───────────────────────────┘
```

- **Simulation** advances on a **fixed timestep** (e.g., 30 Hz logic) decoupled from
  render FPS — required for determinism and for the headless harness.
- **Renderer** interpolates entity transforms between sim ticks for smooth visuals;
  it holds *no* authoritative state.
- **React** renders **derived snapshots** (HUD numbers, menus) and emits **intents**
  (place tower, trigger ability, change stance) into a command queue the sim drains.
  React state updates are **throttled** (e.g., 10 Hz for HUD) — never per sim tick —
  so a 200-entity wave doesn't trigger 200 React renders.
- The sim runs in a **Web Worker** (see §16) so heavy ticks never block the UI thread.

**Why this is the cardinal rule:** it's what lets the same core power (a) the live
game, (b) the headless balance harness, and (c) deterministic replays/leaderboards —
and it's the only way a React app survives hundreds of moving entities at 60 FPS.

---

## 3. Tech stack & rationale

| Concern | Choice | Why |
|---|---|---|
| Build/dev | **Vite** | Fast HMR, first-class TS, easy Web Worker + WASM later. |
| Language | **TypeScript (`strict`)** | Type-safe content registries & save migrations are the backbone. |
| UI | **React 18** | Menus/HUD/meta panels only; concurrent features help throttle. |
| Rendering | **PixiJS** (WebGL/Canvas) over React | Retained-mode 2D scene graph for 100s of sprites; **not** React DOM nodes. |
| Meta state store | **Zustand** | Tiny, lives *outside* React, usable from the Worker bridge & plain TS. |
| Schema validation | **Zod** | Validate content data + save blobs at the boundary; derive TS types from schemas. |
| Persistence | **IndexedDB** (via `idb`), `localStorage` fallback | Large, structured, async saves; far past `localStorage` size limits. |
| Worker bridge | **Comlink** (or a thin typed postMessage layer) | Ergonomic typed calls across the sim Worker boundary. |
| Tests | **Vitest** + Playwright (smoke) | Unit/deterministic sim tests; the headless harness is plain Vitest. |
| RNG | custom **mulberry32 / xoshiro128\*\*** | Tiny, fast, seedable, serializable state — no `Math.random`. |

> These are *recommendations with rationale*, locked at M0 (`ROADMAP`). The hard
> commitments are React/TS/Vite (given) and the **sim/render/UI split** (§2); the
> libraries are swappable behind their module boundaries.

---

## 4. Module map

Feature-and-layer folders with **enforced dependency direction** (§18). The split
between `core` (durable, deterministic) and `app` (web-specific) is deliberate:

```
src/
├─ core/                      # ── deterministic, headless, no DOM/React ──
│  ├─ sim/                    # the tick loop, world, entity/component store
│  │  ├─ world.ts            #   World container, tick orchestration
│  │  ├─ scheduler.ts        #   fixed-timestep accumulator
│  │  ├─ entities.ts         #   entity/component storage (SoA, pooled)
│  │  ├─ spatial.ts          #   uniform grid for range queries
│  │  └─ systems/            #   movement, targeting, firing, status, reactions,
│  │                         #     damage, death/rewards, hero-AI, spawner …
│  ├─ rng/                    # seeded PRNG + stream splitting
│  ├─ math/                   # vec2, curves (log/sqrt/geom), fixed-point helpers
│  ├─ rules/                  # pure rule fns: bucket math, reaction table, scaling
│  ├─ procgen/                # seeded generators (stage, waves, boss, loot, affixes)
│  ├─ content/                # ── data registries + schemas (the "spreadsheet") ──
│  │  ├─ schema/             #   Zod schemas per content type
│  │  ├─ towers/  heroes/  enemies/  cards/  gear/  relics/  biomes/  bosses/
│  │  ├─ config/             #   THE central balance config (all tunables)
│  │  └─ registry.ts         #   load + validate + index all content
│  └─ save/                   # serialize/deserialize, schema versions, migrations
│
├─ app/                       # ── web-specific ──
│  ├─ worker/                 # sim Worker entry + Comlink bridge
│  ├─ render/                 # PixiJS scene, sprite pools, interpolation, VFX
│  ├─ state/                  # Zustand stores (meta + UI), sim-snapshot store
│  ├─ ui/                     # React: HUD, menus, codex, trees, loadout, results
│  │  ├─ hud/  menus/  codex/  trees/  loadout/  shared/
│  ├─ audio/                  # SFX/music bus (heartbeat tempo, juice)
│  └─ main.tsx                # bootstrap: mount React, spawn Worker, wire bridge
│
├─ shared/                    # types & constants used by BOTH core and app
└─ test/                      # harness/, fixtures/, sim snapshots
```

**Rule:** `app/*` may import `core/*`; **`core/*` may never import `app/*`** (or React,
or PixiJS, or the DOM). This is lint-enforced (§18) and is what keeps the harness
headless and the core portable.

---

## 5. Determinism & RNG

Determinism is a hard requirement (replays, leaderboards, daily seeds, the harness,
and reconstructing a run from `seed + inputs` instead of serializing live entities,
`STAGES §5`).

- **No `Math.random` anywhere in `core`.** A single seeded PRNG (mulberry32) with
  **serializable state**.
- **Stream splitting**: from one `runSeed`, derive independent named streams
  (`biome`, `wave`, `loot`, `combat`…) so consuming one stream can't desync another
  (`STAGES §5`). A "combat" stream advances every tick; "loot" advances only on drops.
- **Fixed timestep** logic; floating-point determinism is bounded by always running the
  same op order at the same dt. (If cross-platform bit-identical replays ever become a
  leaderboard requirement, the `math/` layer can swap hot paths to integer/fixed-point —
  isolated there on purpose.)
- **Content version** is folded into the seed contract: a run records
  `{ seed, contentVersion }`; replaying under a different content version is flagged,
  not silently mis-rendered (protects leaderboard integrity).

```ts
// shared/rng.ts (contract sketch — not the implementation)
export interface Rng {
  next(): number;            // [0,1)
  int(maxExclusive: number): number;
  pick<T>(weighted: ReadonlyArray<readonly [T, number]>): T;
  fork(streamName: string): Rng;   // deterministic child stream
  serialize(): RngState;
}
```

---

## 6. Data architecture

The spine of maintainability: **content is data, validated at the boundary, indexed in
registries, referenced by stable IDs.** Adding a tower/card/enemy/affix is a *data*
change, not a *systems* change (`DESIGN §11`, the "scales to dozens" promise).

### 6.1 Definitions vs. instances

A strict split that recurs across every content system:

- **Definition** (static, authored, immutable, shared): `TowerDef`, `EnemyDef`,
  `CardDef`, `GearBaseDef`, `AffixDef`, `BiomeDef`, `RelicDef`, `BossModuleDef`. Lives
  in `core/content/*`, validated by Zod, indexed by `id` in the registry.
- **Instance** (runtime, mutable, owned by the sim or a save): an actual placed tower,
  a live enemy, a rolled gear item, a drafted card in this run. References its
  definition by `id`; never duplicates the static data.

```ts
// Illustrative contracts (shapes, not logic):
type Id = string;                          // stable, e.g. "tower.needle_spitter"

interface TowerDef {                       // DEFINITION — authored data
  id: Id; class: CombatClass; role: TowerRole;
  baseStats: BaseStats;                    // numbers come from config
  stars: StarDef[10];                      // mechanic unlocks per star (TOWERS.md)
  statusType: StatusType;                  // Fracture | Corrosion | …
  targetingDefault: TargetingMode;
}
interface TowerInstance {                  // INSTANCE — runtime
  defId: Id; cell: GridCell; stars: number;
  forkChoices: [ForkA_or_B, ForkA_or_B];   // ★5/★8 selections for this run
  runtime: TowerRuntime;                   // cooldowns, ramp, current target…
}
```

### 6.2 The central config

All **tunables** (curve constants, costs, drop weights, TL coefficients) live in
`core/content/config/*` — one reviewable place (`CLAUDE.md`; `PROGRESSION §0`;
`STAGES §15`). Systems read config; they never inline magic numbers. This is what makes
the simulation harness and live-ops rebalancing possible.

### 6.3 Schema validation

Every content file and every save blob passes a **Zod schema** at load. Benefits:
authored data that's malformed fails *loudly at startup* (or in CI), not mysteriously
at runtime; and TS types are **derived from** the schemas (`z.infer`) so the type and
the validator never drift.

### 6.4 Registry & content addressing

`registry.ts` loads, validates, cross-checks references (e.g., a card referencing a
status type that exists), and exposes typed lookups (`registry.tower(id)`). Content is
referenced **only by ID** across saves and seeds, so renaming display text or
rebalancing never breaks a save or a replay.

---

## 7. The simulation core

### 7.1 Tick model

A **fixed-timestep accumulator**: render calls `world.advance(realDt)`; the world runs
0..N fixed logic ticks (`SIM_HZ`, e.g. 30) then exposes interpolatable transforms. The
same `world.tick()` is what the headless harness calls in a tight loop with no
renderer.

### 7.2 Entity/component storage (data-oriented)

Given swarms of hundreds of enemies + projectiles, an **archetypal/SoA component
store** (not class-per-entity OOP) keeps hot data cache-friendly and pooled:

- Entities are integer IDs; components are arrays indexed by entity slot.
- **Hot, numeric** components (position, velocity, HP, status stacks) live in typed
  arrays (`Float32Array`) for the systems that touch them every tick.
- **Cold, structural** data (which def, which affixes) lives in plain objects keyed by
  ID.
- **Pooling**: enemies, projectiles, and floating-text are recycled, never `new`-ed in
  the hot loop (GC pause = dropped frames, §16).

This is an **ECS-flavored** design but pragmatic — we don't dogmatically ECS the cold
systems (menus, economy); we apply it where entity counts and tick frequency demand it.

### 7.3 System pipeline (deterministic order)

Systems run in a **fixed order** each tick (order matters for determinism and for
correct reaction resolution):

```
1. spawn         enqueue enemies per the wave script (procgen)
2. movement      advance enemies along paths; heroes per AI/leash
3. targeting     towers/heroes pick targets (spatial grid queries)
4. firing        spawn projectiles / apply hitscan / tick auras
5. projectiles   advance, collide (grid), resolve hits
6. status        apply/tick/decay status stacks (Fracture/Corrosion/…)
7. reactions     detect 2-status combos → resolve Reaction effects (TOWERS matrix)
8. damage        apply damage pipeline (mitigation, shields, vulnerability, crits)
9. death/reward  on death: biomass, drops, codex ticks, on-death affixes/spores
10. nucleus      enemies at goal deal Integrity; check run-end
11. economy/run  biomass income, hero respawn timers, ability cooldowns
```

Each system is a **pure-ish function over the component store** (no hidden globals),
which is what makes them unit-testable and the whole tick reproducible.

### 7.4 Spatial partitioning

A **uniform grid** (cell ≈ max common range) backs all "enemies near X" queries
(targeting, splash, auras, reactions). It rebuilds/updates per tick and turns O(n²)
proximity checks into near-O(n) — essential for AoE/DoT/spread towers in dense waves.

---

## 8. Combat systems

### 8.1 Targeting

Strategy objects per `TargetingMode` (nearest, highest-HP, densest-cluster, lowest-HP%,
uninfected…), selected by tower/hero **definition default** and overridable by the
player (`HEROES §autonomous-unit-model`, tower priority). All queries go through the
spatial grid (§7.4).

### 8.2 Status & the reaction engine (the build-variety core)

The synergy matrix (`TOWERS §reaction-framework`) is **data + one resolver**, not ten
hard-coded combos:

```ts
// Contract sketch:
type StatusType = 'Fracture'|'Corrosion'|'Infection'|'Disruption'|'Mark';
interface ReactionDef { a: StatusType; b: StatusType; effectId: Id; }  // 10 entries
// resolver (signature only): when an entity holds 2 status types whose pair has a
// ReactionDef, and a participant tower is ★6+, emit the reaction effect once per rule.
```

Adding a future class/status = adding a row of `ReactionDef` + an effect handler, not
touching the resolver. Status stacks, caps, decay, and "★6 gates participation" are all
data on the `StatusType`/`TowerDef`. Reaction *effects* are handlers registered by
`effectId` (an extensible effect-registry pattern shared with cards/relics, §12).

### 8.3 Damage pipeline

A single ordered pipeline so modifiers compose predictably (and match `PROGRESSION`'s
bucket model): `base → vulnerability/amp → crit → mitigation (armor/shield) →
status-on-hit → reaction triggers → final`. Implemented as a list of **pure modifier
steps** (data-ordered), so cards/relics/keystones inject steps without rewriting the
pipeline.

### 8.4 Heroes as autonomous agents

Hero AI (`HEROES §autonomous-unit-model`) is a small **behavior layer** over the same
systems: a stance-driven controller (Aggressive/Defensive/Hold) chooses moves/targets
within a leash; abilities are **cooldown-gated effect emitters** (auto-cast by AI or
manually via an intent). No separate combat path — heroes are entities with an AI
component and an ability set.

---

## 9. Progression systems

Permanent power is a **pure functional pipeline**, mirroring `PROGRESSION §1.1` exactly
— this is the single source of truth for "how strong is this loadout":

```ts
// Contract sketch — pure, headless, unit-tested against PROGRESSION's worked example:
function effectiveTowerPower(state, towerId): number {
  // EffectiveDPS = Base × S × M × C × H × P × (R during a run)
  // each bucket a pure fn of its progression input; additive-damped within, × across
}
function powerScore(account): number {     // log₁₀(Base·S·M·C·H·P·E) → friendly scale
}
```

- **Buckets are independent pure functions** (`rules/buckets.ts`): `S(stars)`,
  `M(masteryLevel)`, `C(classLevel)`, `H(hiveTree)`, `P(prestigeLayers)`,
  `E(equipment)`. Each matches a formula in `PROGRESSION` and reads constants from
  config. They compose multiplicatively; nothing else may multiply power.
- **Selectors** recompute derived stats from raw progression state (stars owned,
  mastery XP, class XP, equipped gear) **memoized** — recomputed only when an input
  changes, not per frame.
- **Currencies & costs** are a ledger in meta state (Zustand store, §14); geometric
  cost curves and sqrt/log gains are pure fns from config (`PROGRESSION §1.2`).
- **Mechanics-first unlocks** (stars/keystones/milestones) flip **capability flags** on
  the definition-instance, which the combat systems read — so a ★6 unlock literally
  enables the reaction branch in §8.2.

Because power is a pure pipeline, the **harness can sweep it** (e.g., "does any single
bucket run away when stacked?", `PROGRESSION §9`) without running combat at all.

---

## 10. Loot generation

A **seeded service** (`procgen/loot.ts`) consuming the `loot` RNG stream
(`EQUIPMENT §8`, `STAGES §11`):

```ts
// Contract sketch:
function rollDrop(ctx: { tl: number; source: DropSource; rng: Rng }): GearItem {
  // 1. pick rarity   (weighted by TL/source — depth raises the floor)
  // 2. pick base     (GearBaseDef — a behavior, EQUIPMENT §9–11)
  // 3. roll N affixes from the base's pools, each a bounded tier (T1–T6)
  // 4. attach legendary/exotic effect if rarity warrants
}
```

- **Bounded rolls** (`EQUIPMENT §3`): affix magnitude is a tier within a fixed range —
  the chase is a *better roll*, never an *unbounded* one (anti-inflation).
- **Weighted tables** are data (`config`), tunable centrally; deterministic given the
  stream, so drops are replay-stable and harness-reproducible.
- **Deterministic crafting** (`EQUIPMENT §6`) is the same roller with player-supplied
  constraints (locked affixes, chosen base) — RNG provides material, crafting *aims*.

Gear, cards drafted, biome layouts, boss assembly, and elite affixes all share this
**weighted-pick-from-data + seeded-stream** pattern — one tested primitive, many
generators.

---

## 11. Equipment systems

The hero-only **E bucket** (`PROGRESSION §4`, `EQUIPMENT.md`):

- **Item model**: `{ baseId, rarity, upgradeLevel, affixes[], legendaryEffectId?,
  attunement? }` — all references by ID; the *behavior* is the base + effect, not raw
  stats.
- **E-bucket computation** is a pure fn: `E = ∏(itemMult) × setBonus × relicEffects`,
  capped vertically (+20/+30 ascension) so growth is **horizontal** (`EQUIPMENT §4.5`).
- **Set resolution**: count equipped set pieces across up to 3 heroes → apply 2/4/6
  tiers (a pure reducer over equipped items).
- **Armor auras & relics reach the board**: modeled as **effect emitters** that inject
  modifier steps into tower buckets/damage pipeline (the hero→tower bridge,
  `EQUIPMENT §4.7`) — handled by the same effect-registry as cards/reactions (§12), so
  "armor aura buffs nearby towers" is a registered effect, not a special case.
- **Currencies** (Catalysts/Mutagen/Resonance/Dust) are meta-state ledgers; reroll/
  upgrade/attune are pure transforms validated against config bounds.

---

## 12. Content systems (Enemy / Hero / Tower / Card)

These four share **one architectural pattern** (the payoff of §6): a **Definition
registry** + a **runtime instance** + an **effect-handler registry** for their unique
behaviors. The differences are data and which systems consume them.

| System | Definition | Runtime instance | Unique behaviors via |
|---|---|---|---|
| **Towers** | `TowerDef` (class, stars, status, targeting) | placed `TowerInstance` (cell, forks, ramp) | star-unlock capability flags + effect handlers |
| **Heroes** | `HeroDef` (abilities, stars, class, AI profile) | `HeroInstance` (HP, cooldowns, stance, gear) | ability effects + AI behaviors + equipment |
| **Enemies** | `EnemyDef` (stats, faction, abilities) | pooled `EnemyEntity` (components) | faction mechanics + elite affixes + boss modules |
| **Cards** | `CardDef` (rarity, category, effect) | drafted `CardInstance` (this run only) | run-bucket effect handlers (temporary) |

### 12.1 The effect-handler registry (the extensibility keystone)

Towers' star unlocks, hero abilities, card effects, relic rules, reaction effects,
elite affixes, and boss modules are **all** "a named effect that mutates the sim under
conditions." Rather than special-casing each, one **typed registry** maps
`effectId → handler` with a constrained API surface (the handler may read the world and
emit *intents*: spawn, modify-stat, add-status, alter-pipeline — never reach outside
the sim):

```ts
// Contract sketch:
interface EffectHandler {
  id: Id;
  hooks: EffectHook[];                 // onHit | onKill | onWaveStart | aura | onReaction…
  apply(ctx: EffectContext): void;     // emits sim intents only; pure w.r.t. outside world
}
```

This is what makes "create 200 cards" (`CARDS.md`, a sibling task) or a new tower a
**content** task: author a `Def` + register its `effectId` handlers. The systems don't
grow; the data does. It also gives the harness a single place to enumerate/fuzz every
effect.

### 12.2 Cards & the temporary run bucket

Cards are explicitly **R-bucket, reset every run** (`PROGRESSION §1.1`). The draft, the
deck, and card effects live in **run state** (owned by the sim/world), not meta state —
so they evaporate at run end by construction. Only the *library of discovered cards*
(a collection flag) persists to the save. Synergy chains (`DESIGN §6.3`) are modeled as
effects that read other active cards' tags — composable via the same registry.

---

## 13. Procedural generation

All generators (`STAGES.md`) are **pure functions of a seeded stream + context**,
living in `core/procgen/` with **no side effects** — the property that makes them
testable and the harness possible:

```ts
// Contract sketches:
genStage(seed: number, ctx: PlayerProgress): StageBlueprint;     // biome,topology,nodes
genWave(rng: Rng, tl: number, roster: EnemyDef[]): WaveScript;   // threat-budget spend
genBoss(rng: Rng, tl: number, faction: FactionId): BossBlueprint;// chassis+modules
genEliteAffixes(rng: Rng, tl: number): AffixId[];                 // bounded by TL
```

- **Blueprints, not entities**: generators emit *plans* (data); the sim instantiates
  entities from plans at spawn time (keeps generation cheap and serialization-free).
- **TL is the only difficulty input** (`STAGES §7`) — a single integer threads through
  every generator, so difficulty stays one legible dial.
- **Anti-stagnation constraints** (`STAGES §13`) are generation rules expressed in these
  pure fns (anti-repeat window, wave-shape rotation) — testable assertions, not vibes.
- **Determinism contract**: `(seed, contentVersion) → identical blueprint`. Property
  tests assert it; daily/seasonal/leaderboard seeds depend on it.

---

## 14. State management

Three distinct stores with **distinct lifetimes and owners** — conflating them is the
classic incremental-game bug, so we separate them by construction:

| Store | Lives in | Lifetime | Owns | Persisted? |
|---|---|---|---|---|
| **Run state** | the sim `World` (Worker) | one run | entities, biomass, drafted cards, run RNG, TL | no (reconstructable from seed+inputs) |
| **Meta state** | Zustand (main thread) | account | stars, mastery, class, gear, currencies, codex, prestige, settings | **yes** (the save) |
| **UI state** | Zustand/React | session | open panel, selection, tooltips, transient toggles | no |

### 14.1 The Sim↔UI bridge

- **Sim → UI**: the Worker posts **throttled snapshots** (HUD-relevant scalars + a
  compact entity transform buffer for the renderer). React subscribes to a
  `simSnapshot` store updated at ~10 Hz (HUD) while the renderer reads transform buffers
  per frame for interpolation. **The sim never hands React live entity objects.**
- **UI → Sim**: user actions become **typed intents** (`PlaceTower`, `SetStance`,
  `CastAbility`, `Extract`) enqueued to the Worker and drained at the next tick — so
  input is deterministic and ordered (replay-safe).
- **Meta ↔ Run**: at run *start*, the sim is seeded with a **read-only loadout snapshot**
  derived from meta (stars, gear, keystones → capability flags + bucket inputs). At run
  *end*, the run emits a **rewards delta** the meta store applies (shards, mastery XP,
  gear, codex). Clean, auditable hand-offs in both directions; no shared mutable state.

This bridge is the concrete realization of §2 and is the seam the harness bypasses
(it drives the `World` directly, no Worker/React).

---

## 15. Save system

Trophies must **never** be lost (`DESIGN §4`, risk #5), across years of content
patches. The save system is therefore treated as a **first-class, versioned data
contract**, not an afterthought.

### 15.1 What is saved

**Meta state only** (§14): stars/shards, per-unit mastery, class levels/keystones,
gear inventory + equipped, all currencies, codex progress, prestige layers + trees,
unlocked heroes/slots, settings, statistics, and **idle accrual timestamps**. A run is
*not* saved as live state — at most an **in-progress run is a resumable token**
(`seed + TL + recorded intents`), so even mid-run saves are tiny and deterministic.

### 15.2 Versioning & migration

```ts
interface SaveBlob {
  schemaVersion: number;        // integer, bumped on any breaking shape change
  contentVersion: string;       // content/balance version at save time
  data: unknown;                // validated against the schema for schemaVersion
  checksum: string;             // integrity (detect corruption/tamper)
}
```

- A **migration pipeline** runs ordered transforms `v(n) → v(n+1)` on load, so a save
  from any past version upgrades to current. **Migrations are append-only and tested**
  with fixtures of every historical schema (a CI gate — never break an old save).
- The blob is **Zod-validated** after migration; a validation failure routes to a
  **non-destructive recovery** path (load last good backup; never overwrite a save we
  failed to parse).
- **Backups**: keep the last *k* autosaves in IndexedDB; export/import a save as a file
  (and a base64 string) for support and device transfer.

### 15.3 Storage & cadence

- **IndexedDB** primary (async, large), `localStorage` fallback for tiny critical keys.
- **Autosave** on meaningful meta transitions (run end, purchase, prestige) +
  debounced periodic — never on the sim hot path.
- **Single-writer discipline**: only the meta store serializes; the sim never writes the
  save (it emits deltas the meta store persists).

### 15.4 Idle / offline computation

For the idle layers (Hivemind Network, Singularity automation, `DESIGN §12`): on load,
compute elapsed real time since `lastSeen` and apply **closed-form** idle yields (not a
fast-forwarded simulation) — bounded by an offline cap, summarized in a "while you were
away" screen. Closed-form keeps it cheap, deterministic, and exploit-resistant (no
clock-rollback farming beyond the cap).

### 15.5 Cloud-readiness

Persistence sits behind a `SaveStore` interface (`load/save/list/backup`) so the
IndexedDB implementation can be joined later by a cloud adapter (with last-write-wins +
the checksum/version metadata for conflict resolution) **without touching game code**.

---

## 16. Performance

Target: **60 FPS with hundreds of entities**, on mid-range hardware, indefinitely (no
leak over a multi-hour session).

| Strategy | What | Why |
|---|---|---|
| **Sim in a Web Worker** | logic ticks off the main thread | a heavy wave never janks the UI/render |
| **Fixed timestep + interpolation** | 30 Hz logic, 60 FPS render | determinism + smoothness, decoupled |
| **Object pooling** | enemies, projectiles, floating text | zero hot-path allocation → no GC pauses |
| **SoA / typed arrays** | hot numeric components | cache-friendly system loops |
| **Spatial grid** | range queries (§7.4) | O(n) proximity instead of O(n²) |
| **Throttled React** | HUD ~10 Hz, not per tick | 200 entities ≠ 200 renders |
| **Render batching** | PixiJS sprite sheets / particle containers | few draw calls for many sprites |
| **Endless LOD** | cap concurrent entities; merge/abstract deep swarms | infinite depth, finite entity count |
| **Snapshot diffing** | post only changed scalars to UI | minimal main-thread work |

**Endless-depth budget rule:** the design is infinite, but on-screen *entity count* is
**capped**. At extreme TL, the sim represents overflow density as **stat-boosted
"merged" enemies** or higher per-enemy HP rather than unbounded entity spawns — infinite
*difficulty*, bounded *object count* (the same philosophy as §STAGES anti-inflation: the
unbounded thing is a scalar, not a pile of objects).

---

## 17. Testing

The deterministic, headless core (§2, §5) makes testing unusually tractable:

- **Unit tests (Vitest)** for every pure rule: bucket math vs. `PROGRESSION`'s worked
  examples; reaction table; scaling curves; cost/gain curves; affix-bound clamps.
- **Property tests** for generators: determinism (`same seed → same blueprint`),
  invariants (`STAGES §13` anti-stagnation rules hold; boss-fairness constraints never
  violated; affix sets never contradictory).
- **Snapshot/golden-run tests**: run the headless sim on a fixed seed + scripted intents
  for N ticks; assert the result hash — catches unintended sim/balance drift in CI.
- **The simulation harness** (`PROGRESSION §9`, `STAGES §15`): a headless batch runner
  that sweeps loadouts × TL across thousands of runs to validate pacing (TTK flat in the
  comfort band; reward-per-minute peaks at the frontier; no bucket runs away). This is a
  *first-class tool*, not a test — it's why the core is headless.
- **Smoke E2E (Playwright)**: app boots, a run starts, a tower places, a save round-trips
  — guards the React/Worker/render wiring.
- **Save-migration tests**: fixtures of every historical `schemaVersion` must migrate +
  validate (CI gate, §15.2).

---

## 18. Maintainability

- **Dependency rule (lint-enforced):** `core` ⇏ `app`; `core` never imports React/DOM/
  Pixi. Systems depend on `content`/`rules`/`rng`, not on each other's internals. UI
  depends on stores + `core` types, never on sim internals. (ESLint
  `no-restricted-imports` / import-boundary rules in CI.)
- **Content is data, behavior is registered** (§6, §12.1): new towers/cards/enemies/gear
  = new data + registered effects; systems stay closed to modification, open to
  extension.
- **Schema-first**: Zod schemas are the source of truth; TS types derive from them; bad
  content fails at load/CI, not in the field.
- **One config for tunables** (§6.2): balance is reviewable in one diff; live-ops and the
  harness both read it.
- **Stable IDs everywhere** (§6.4): display text and balance can change freely without
  breaking saves, seeds, or replays.
- **Strict TS, no `any` in `core`**: the durable layer is fully typed.
- **Docs as contract**: this corpus (`DESIGN`/`PROGRESSION`/`STAGES`/system docs) is the
  spec; `GAME-STATE.md` (to be created) tracks what's actually built vs. designed;
  `BUGFIX-LOG.md` records fixes (`CLAUDE.md` conventions).

---

## 19. Risks & mitigations

| # | Technical risk | Mitigation |
|---|---|---|
| 1 | **React used as the game loop** → jank, un-testable | The cardinal rule (§2): sim in Worker, React renders snapshots only. |
| 2 | **GC pauses** from per-frame allocation in swarms | Pooling + SoA typed arrays + no hot-path `new` (§7.2, §16). |
| 3 | **Non-determinism** breaks replays/leaderboards/harness | Seeded PRNG only, fixed timestep, ordered systems, content-version in seed (§5). |
| 4 | **Save loss / corruption** across patches (kills trophies) | Versioned schema + tested migration pipeline + backups + non-destructive recovery (§15). |
| 5 | **Content explosion** makes systems unmaintainable | Data-driven registries + effect-handler pattern; systems don't grow with content (§6, §12.1). |
| 6 | **Number/entity inflation** at infinite depth | Scalar difficulty + entity-count cap/LOD; power stays ~3–4 OOM (§16, `PROGRESSION §0`). |
| 7 | **Worker boundary friction** (serialization cost) | Compact transform buffers + throttled scalar snapshots; transferable arrays where hot. |
| 8 | **Float determinism across platforms** (if bit-exact replays needed) | Isolate hot math in `math/`; can swap to fixed-point without touching systems. |
| 9 | **Balance regressions** from a tweak rippling (TD coupling) | Central config + harness sweeps + golden-run snapshots gate CI (§17). |

---

## 20. Open technical questions

Resolved when implementation reaches them (per `CLAUDE.md` — not pre-deferred):

- **Renderer:** PixiJS vs. a hand-rolled Canvas2D/WebGL layer — decide at M0 against the
  entity-count budget; the `render/` boundary makes it swappable either way.
- **Worker transport:** Comlink ergonomics vs. a hand-tuned `postMessage` protocol for
  the hot snapshot path (possibly Comlink for control, raw transferables for buffers).
- **Float vs. fixed-point sim:** start with `f64` + fixed timestep; promote hot paths to
  fixed-point only *if* cross-platform bit-exact replays become a leaderboard
  requirement.
- **Run resumption fidelity:** full seed+intent replay vs. periodic run-state snapshot —
  pick per the cost of recording intents and the value of mid-run resume.
- **Idle model exactness:** the closed-form yield formulas for Hivemind/Singularity, and
  the offline cap, need the harness to confirm they can't be exploited via clock changes.
- **Content authoring format:** TS data modules (type-checked, refactorable) vs. JSON +
  schema (data-team friendly, hot-reloadable) — likely TS for systems-coupled content,
  JSON for bulk content (cards/enemies). Decide at the first content-scale milestone.

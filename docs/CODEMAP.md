# CODEMAP.md — Developer Orientation

A practical map of the codebase for a developer joining the project. For *vision*
read `DESIGN.md`; for the *engineering blueprint* read `ARCHITECTURE.md`. This file
is the "where does what live, and how do I add content" guide for the **current
implementation** (the playable vertical slice).

---

## The one rule that explains the layout

**The deterministic simulation is separate from React and the renderer.**
`src/core/` is plain TypeScript with *no React/DOM imports*; it can run headless (the
tests do). React draws the HUD/menus and forwards input; a Canvas2D renderer draws the
battlefield. Data flows one way per frame: **sim → snapshot → UI/render**; input flows
back as method calls (intents) on the `Game`.

```
            ┌──────────────────────────────────────────────┐
            │  src/core  — deterministic sim (no DOM/React) │
            │  Game.advance(dt) → fixed-timestep tick        │
            └───────────────┬───────────────┬───────────────┘
        getRenderState()    │               │   getSnapshot() (throttled ~10 Hz)
                            ▼               ▼
            ┌───────────────────────┐  ┌──────────────────────────┐
            │ src/render (Canvas2D) │  │ src/ui (React HUD/menus)  │
            └───────────────────────┘  └───────────┬──────────────┘
                                  intents (game.placeTower / click / startWave …)
                                                    ▼  back to the Game
```

---

## Folder map

| Path | Responsibility |
|---|---|
| `src/core/` | The headless, deterministic simulation + content data. No DOM/React. |
| `src/core/game.ts` | The `Game`: fixed-timestep tick, all systems (spawn, towers, projectiles, pools, status/reactions, enemy steering, hero, particles), run state. |
| `src/core/config.ts` | **Central tunables + content data** — tower/enemy/upgrade defs, waves, status/economy/steering/perf constants. Balance lives here. |
| `src/core/cards.ts` | Gene Cards: declarative `CardEffect[]` data + the single `applyCard()` interpreter. |
| `src/core/map.ts` | The arena: grid, obstacles, the flow-field pathfinding, tower slots, spawn/goal. |
| `src/core/types.ts` | Shared sim types (entities, enums, snapshots). |
| `src/core/rng.ts` | Seeded PRNG (mulberry32). No `Math.random` in core. |
| `src/core/spatial.ts` | Uniform spatial-hash grid for proximity queries. |
| `src/core/math.ts` | Small vector/scalar helpers. |
| `src/core/validate.ts` | Content invariant checks (positive vitals, sane costs, …). |
| `src/save/` | Versioned + checksummed persistence (`saveStore`), file I/O (`saveFile`). |
| `src/state/` | `meta` (permanent progression store), `store` (tiny React-bridged external store). |
| `src/render/renderer.ts` | Canvas2D battlefield rendering (reads `RenderState`, never mutates). |
| `src/ui/` | React: `App`, `GameView` (the rAF loop host), HUD/Toolbar/DraftModal/menus, `ErrorBoundary`. |
| `src/debug/` | Dev debug flag + active-game registry (`?debug` opt-in). |
| `docs/` | Design + architecture + this map. |

**Dependency rule:** `core` never imports `state`/`ui`/`render`/`debug`. UI/render
depend on `core` types. Keep it that way — it's what keeps the sim headless/testable.

---

## How a frame runs

1. `GameView`'s rAF loop calls `game.advance(realDt)` (wrapped in try/catch — a throw
   surfaces a recovery panel, never a silent freeze).
2. `advance` runs N fixed `step(SIM_DT)` ticks. Each tick: rebuild the spatial grid +
   id-map, then run the systems in a fixed order (see `Game.step`).
3. The renderer draws `game.getRenderState()`; the HUD reads a throttled
   `game.getSnapshot()`.

Everything in a tick is deterministic from the run seed — same seed + same inputs =
same outcome (the basis of the golden tests and a future replay/lockstep layer).

---

## How to add content (the common tasks)

Most content is **data, not code**:

- **A new tower** that reuses an existing delivery (homing / splash / support): add a
  `TowerDef` to `TOWER_DEFS` in `config.ts` with `firing` set, plus a `TowerKind` union
  member, a `TOWER_ORDER` entry, and a UI label. The sim dispatches on `firing` — no
  `game.ts` change. *(A genuinely new delivery or on-hit status needs a new behavior
  branch in `towerSystem`/`projectileSystem` — the one isolated place.)*
- **A new enemy**: add an `EnemyDef` (stats + a `behavior` steering profile) to
  `ENEMY_DEFS` and an `EnemyKind` member. The steering system reads the profile — no
  movement code change. Put it in waves via `WAVES`, or spawn it from the debug panel.
- **A new card**: add a `CardDef` with a declarative `effects: CardEffect[]` to
  `CARD_POOL`. `applyCard()` interprets it — no code.
- **A new permanent upgrade**: add an `UpgradeDef` to `META_UPGRADES` with its
  `effect: { stat, perLevel }`. `metaModifiers()` folds it generically — no code.
- **Balance changes**: edit values in `config.ts` only.

After any content change, `validateContent()` (dev boot + a test) flags degenerate
data, and the **golden tests** (`golden.test.ts`) catch unintended gameplay drift.

---

## Future expansion — readiness & remaining work

What the foundation already supports (no implementation, just structure):

- **Determinism → multiplayer/replay-ready.** Seeded RNG, fixed timestep, ordered
  systems, and intent-based input mean a deterministic replay/lockstep layer can be
  added without touching gameplay. (Cosmetic particles use a *separate* FX rng so they
  never affect determinism.)
- **Data-driven towers/enemies/cards/upgrades** (above) → adding content scales.
- **Versioned saves** (`saveStore`, `schemaVersion` + ordered migrations + backups) →
  ready for new persistent fields (equipment, prestige) via a migration step.
- **Per-hero update loop** (`updateHero(hero)`) → ready to run multiple heroes.

Deliberately **deferred** (out of scope here — features, or premature churn):

- **Per-tower on-hit status as data.** Today a homing tower implies Fracture and splash
  implies Corrosion (true for the launch roster's classes). A tower with a novel
  status+delivery still needs a small code branch; promoting on-hit effects to `TowerDef`
  data is the next step when a fourth class lands.
- **Physical `core/content/` split.** `config.ts` mixes tunables + content; fine at this
  size. Split into `content/{towers,enemies,waves,upgrades}.ts` when it grows past
  comfortable reading.
- **Equipment / prestige / events / multiple heroes** — designed (`docs/`), not built.

---

## Tests & safety nets

| Test | Guards |
|---|---|
| `golden.test.ts` | Exact outcomes for 6 seeds — refactors must not change gameplay. |
| `sim.test.ts` | Loop invariants (progress, reactions, determinism). |
| `spatial.test.ts` | Grid query correctness. |
| `saveStore.test.ts` | Round-trip, corruption recovery, backups. |
| `meta.test.ts` | Data-driven upgrade fold. |
| `validate.test.ts` | Content invariants (shipped clean; degenerate caught). |

Run `npm run typecheck && npm test && npm run build` before pushing.

---

## Foundation improvements log (this pass)

Recorded per the pre-Early-Access quality review:

- **Stability:** app-level `ErrorBoundary` + a guarded rAF loop replace blank-screen /
  silent-freeze failure modes with visible recovery.
- **Runtime safety:** `validateContent()` catches content-authoring bugs as content
  scales; runs loud at dev boot.
- **Future expansion:** tower firing dispatched by a data-driven `firing` tag (removed
  the `kind`-switch expansion blocker).
- **Earlier passes (same branch):** golden characterization tests; O(1) projectile
  homing + cached overcharge + fewer allocations; data-driven upgrades/cards + tunables
  in config; dead-code removal + strict no-unused; spatial grid + pooling + entity
  budget + LOD for hundreds of enemies.

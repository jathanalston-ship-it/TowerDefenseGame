# ARCHITECTURE-AUDIT.md — Audit & Refactor Plan

A complete audit of the **implemented** codebase (not the aspirational
`ARCHITECTURE.md` target), with prioritized, *explained* improvements. Per the
brief: **explain every change before implementing it**, **preserve all existing
functionality** (golden tests are the contract), and **add no new gameplay**.

Reviewed: `src/` at the current branch head (~6,500 LoC across core/render/state/
ui/save/audio/debug).

---

## 1. What's already healthy (keep — do not churn)

These are genuine strengths; the refactor must not regress them.

- **Clean layered separation.** `core/` is deterministic and headless (no React/DOM);
  `render/` reads sim state and never mutates it; `state/` owns meta/persistence;
  `ui/` is React; `save/` is storage-agnostic. This matches `ARCHITECTURE.md §2`.
- **Deterministic fixed-timestep pipeline.** `Game.advance()` accumulates real time
  and runs `step(SIM_DT)` in a **fixed system order** (`spawn → economy → tower →
  projectile → pool → status → move → hero → death → float → particle`). Order is
  explicit and correct for reaction resolution.
- **Data-driven content.** Towers/enemies/waves/cards/chests are `Def` tables;
  tunables are centralized in `config.ts`. Adding content is (mostly) a data edit.
- **Determinism hygiene.** Separate gameplay RNG vs. cosmetic FX RNG; stats/mastery
  are **pure observation** that never feed back into combat; golden characterization
  tests lock outcomes across 6 seeds.
- **Scalability scaffolding.** Object pooling (projectiles/particles), a spatial grid
  for proximity queries, LOD + entity/particle budgets.
- **Robust save.** Versioned + checksummed blob, append-only migration, deep-merge
  defaults (forward-compatible), rolling backups, non-destructive recovery.

---

## 2. Findings (prioritized)

### 🔴 A. `Game` is a 1,202-line god-class — the one real structural problem
`core/game.ts` owns *everything*: tick orchestration, all 11 systems, the
combat/status/reaction math, hero AI + ability, the spatial-grid rebuild, read-models
(`getSnapshot`/`getRenderState`/`getRunStats`), the command API
(`placeTower`/`startWave`/`chooseCard`/…), and the debug API. It's internally tidy
(sectioned, clean `step()` order) but it's 2× the next-largest file, mixes many
concerns in one unit, can't have its systems tested in isolation, and is a merge
hot-spot for concurrent work.

**Target (per `ARCHITECTURE.md §4/§7.3):** systems become modules in `core/systems/*`
that operate on a shared sim **context/World**, leaving `Game` a thin orchestrator +
command/read facade.

### 🟠 B. The most logic-dense code is only covered through golden runs
Two areas carry the most branching math and have **no isolated unit tests**:
- **Steering** (`enemyMoveSystem`, ~100 lines): seek (flow-field / direct) + tower
  avoidance + hero reaction + separation + jitter blend.
- **Combat math** (`applyDamage` / `effectiveArmor` / `addFracture` / `maybeShred`):
  fracture armor-shred, corrosion, damage-taken amp, the Shred reaction threshold.

These are *pure functions trying to get out* — extracting them makes the rules
unit-testable and reusable, and shrinks the god-class in its densest spots.

### 🟠 C. The cardinal dependency rule is a convention, not enforced
`ARCHITECTURE.md §18` requires `core/` to never import React/DOM/`ui`/`render`/`state`.
Nothing *checks* this today — one stray import would silently couple the headless core
to the browser and break the (future) harness. It needs a guard.

### 🟡 D. `config.ts` (449 lines) mixes every tunable domain
Towers, enemies, waves, hero, status, economy, perf, particles, stars, mastery,
chests, upgrades all in one file. Centralization is intentional and good; the file is
just getting big. A `config/` folder split *by domain*, re-exported from `config.ts`,
would keep diffs reviewable — but it touches every importer, so it's **deferred** (low
value-to-churn right now).

### 🟡 E. `renderer.ts` (628 lines) is large but cohesive
It composes from `vfx`/`theme` primitives and reads-only. Acceptable; a later split
(environment vs. entities vs. HUD-overlay draws) is optional polish. **Deferred.**

---

## 3. Plan — what I implement now vs. recommend

**Implemented now** (contained, golden-gated, zero new gameplay — all verified
byte-identical across the 6 golden seeds):

1. ✅ **`core/combat.ts`** — pure rules math (`effectiveArmor`, `damageAfter`,
   `fractureCap`, `shredBurst`, `shredReady`). `Game` keeps the side-effects (hp,
   floats, particles, mastery/stat accrual) but calls the pure math. Returns
   **scalars** → no hot-path allocation. Unit-tested in `combat.test.ts`. (Finding B)
2. ✅ **`core/boundaries.test.ts`** — a dependency-boundary guard (via Vite
   `import.meta.glob`, no new tooling) that fails if any `core/` module imports
   React/DOM or an app layer. Enforces the cardinal rule under `npm test`. (Finding C)

**Recommended / staged** (valuable but deliberately not done now, with rationale):

3. **Steering extraction (`core/steering.ts`) — deferred for performance.** Originally
   planned, but `enemyMoveSystem` is **hot-loop** code (per enemy × per tower × per
   tick) and the current inline version is **allocation-free** (accumulates into `vx/vy`
   locals). Pure functions returning `{x,y}` vectors would reintroduce per-call
   allocation → GC pressure against the §16 budget. Doing it *well* needs an out-param
   scratch API; worth it only as part of the §A systems extraction, not as a standalone
   churn. The duplicated `avoidPoint` math is only two call sites today. (Finding B)
4. **Full systems→`World` extraction (Finding A).** The headline modular win, but it
   rewrites the hottest file end-to-end — with multiple sessions sharing this branch it
   would strand concurrent work in a brutal merge. The combat extraction is the safe
   first slice of this direction (pure rules move out first; systems follow once the
   branch is quiet/coordinated). Sequence: introduce `World` (shared mutable state +
   helpers, with reusable scratch vectors) → move one system at a time behind it,
   re-running golden after each → `Game` becomes the façade.
5. **`config/` domain split (Finding D)** and **renderer draw-group split (Finding E)**
   — schedule alongside the next content push that already touches those files.

Each implemented step is verified with `npm run typecheck && npm test` (the 6 golden
seeds must stay byte-identical) before commit.

# CORE-FRAMEWORKS.md — Events · Modifiers · Targeting

Three decoupling frameworks added so future systems plug in by *configuration*, not
by editing gameplay code. All three preserve existing gameplay exactly — the golden
tests stay **byte-identical** (verified) — because each is designed to be a no-op or
a bit-for-bit equivalent of what it replaced.

---

## 1. Gameplay event bus (`src/core/events.ts`)

A tiny typed pub/sub. The sim (and meta) **emit** named events; future systems
**subscribe** instead of being wired into the sim by hand.

- `gameEvents` — the single app-wide bus. `on(type, fn)` returns an unsubscribe;
  `emit(type, payload)`; `hasListeners(type)`.
- **Events emitted today:** `enemyKilled`, `bossKilled`, `towerPlaced`, `waveStarted`,
  `waveCompleted`, `cardChosen`, `equipmentEquipped`, `heroSpawned`, `projectileHit`.
  (`towerSold` is defined, ready for when a sell action exists.)
- **Determinism:** the sim does **not** subscribe to its own events, and every emit
  is gated by `if (gameEvents.hasListeners(type))` — so a run with no subscribers
  builds no payload and changes nothing (golden invariant). Handlers run synchronously
  in subscription order, so subscribers are deterministic too.

```ts
import { gameEvents } from '../core/events';
const off = gameEvents.on('bossKilled', (e) => analytics.record(e.name));
// …later: off();
```

## 2. Universal modifier framework (`src/core/modifiers.ts`)

One way to express every bonus — permanent or temporary, flat or scaling.

- **Canonical formula:** `(base + Σflat) × (1 + Σpercent) × ∏multipliers`.
- **Modifier** = `{ op: 'flat'|'percent'|'mult', value, id?, source?, condition?, remaining? }`
  — covering flat (+5 Range), percent (+10% Damage), multiplier (×), **conditional**
  (predicate), **temporary** (`remaining` seconds, expired by `tick`), **persistent**
  (no `remaining`), and **runtime** (`add`/`remove`).
- `evalModifiers(base, mods, ctx)` — the pure evaluator. `ModifierStack` — a live,
  tickable stack for runtime/temporary bonuses. `combineMult(...)` — the multiplier
  fold (`combineMult(a,b,c) === a*b*c` exactly).
- **Preserves gameplay:** the multiplier fold is left-to-right and flat/percent default
  to 0, so an existing `a*b*c` product is the same number. The tower damage/fire-rate
  math now flows through `combineMult` — **bit-identical**, which is why golden is
  unchanged. New bonuses (incl. the temporary/conditional kinds) feed the same formula;
  migrating the other bonus buckets onto it is mechanical and incremental.

## 3. Configurable targeting (`src/core/targeting.ts`)

Combat is **unchanged** — only *which* enemy a tower picks is now a data-driven
profile. A new tower sets `targeting` in its `TowerDef`; no sort code.

- **Profiles:** `closestToBase` (default), `nearest`, `farthest`, `highestHealth`,
  `lowestHealth`, `bossPriority`, `elitePriority`, `fastest`, `mostCorrupted`, `random`.
- `sortByProfile(list, profile, ctx)` orders the in-range candidates; `pickTargets`
  slices N. The **default reproduces the historical goal-distance sort exactly**, so
  every shipping tower — and the golden runs — are byte-identical. Only `random`
  consumes the (deterministic) sim rng, and no shipping tower uses it.
- An `elite` flag was added to `Enemy` (director-promoted elites set it) so
  `elitePriority` is real; it defaults to `false` ⇒ no behavior change for existing
  spawns.

```ts
// A future sniper tower: just pick a profile.
{ kind: 'sniper', firing: 'homing', targeting: 'highestHealth', /* … */ }
```

---

## Why all three are golden-safe (one line each)
- **Events:** emitted but unobserved by default → no state change.
- **Modifiers:** `combineMult` is the same float product; flat/percent are ×1/+0.
- **Targeting:** the default profile is the identical sort the code already ran.

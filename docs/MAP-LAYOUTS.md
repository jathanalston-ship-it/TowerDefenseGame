# MAP-LAYOUTS.md — Arena layouts (battlefield geometry as data)

> Code: `src/core/mapLayouts.ts` (registry, validator, selection), `src/core/map.ts`
> (`NavField` — obstacles + flow field), consumers `src/core/game.ts`, `src/core/campaign.ts`,
> `src/core/daily.ts`, `src/render/renderer.ts`. Tests: `src/core/mapLayouts.test.ts`.

Every run used to fight on ONE battlefield (five static outcrops). A **layout** is a registry row
that reshapes the open field above the defensive line — chokepoints, split lanes, open fronts,
flank funnels, mazes — so the swarm reaches the line differently from run to run. The grid
(18 × 24 cells of 40 px), the defensive region, the Final Defense Zone and the 27-slot tower
lattice are FIXED; a layout only re-routes the approach.

---

## 1. Architecture

```
MapLayoutDef (data row) ──► layoutRegistry (Registry<T> + layoutProblems validator)
        │                                   │
        ▼                                   ▼
 navFieldFor(id) ── cached, immutable ──► NavField (map.ts): obstacle set + render cells
                                          + Dijkstra distance field + flow vectors
        ▲
 Game ctor: opts.layout (pin) → stage.layout (Campaign/Daily) → Infinite rotation → 'classic'
 Game owns `this.layout` + `this.nav`; every flow / goal-distance / spawn query resolves there.
```

- **`NavField`** (map.ts) is one layout's navigation state. It is built once per layout id and
  never mutated afterwards, so concurrent Games (the test process, Arena's two sims, spectate)
  share fields safely — **no mutable map state ever crosses a Game**.
- The **default field** (config `OBSTACLES`, layout id `classic`) is map.ts's module field. The
  legacy module helpers (`flowDirAt`, `goalDistanceAt`, `isObstacle`, `obstacleCells`,
  `rebuildFlowField`) still resolve against it, and `navFieldFor('classic')` returns that same
  object — the golden path reads exactly what it always did.
- **Spawn spans** (optional) confine where on the top edge the swarm appears. `layoutSpawn`
  remaps the SAME single rng draw across the spans, so a layout never changes the run's rng
  stream; without spans it is `topSpawn(t)` exactly.
- The **renderer** draws `navFieldFor(rs.layoutId).cells` every frame (`RenderState.layoutId`),
  so an Infinite re-layout shows immediately; nothing caches obstacle geometry.

### Public API

| Symbol | Purpose |
|---|---|
| `MAP_LAYOUTS`, `layoutRegistry` | the authored rows / the registry (validated at dev boot via `validateAllContent`) |
| `layoutById(id)` | a def; unknown/absent ids fall back to `classic` (stale ids never break a run) |
| `navFieldFor(id)` | the cached `NavField` for a layout (authored layouts: solid walls, §6) |
| `layoutSpawn(def, t)` | a top-edge spawn point under the layout's spans |
| `layoutProblems(def)` | the invariant check (empty = valid) |
| `pickLayoutId(rng, stage, biomeId, exclude?)` | one biome-flavored, minStage-gated draw |
| `layoutIdForDepth(depth)` | Infinite's rotation |
| `campaign.layoutForStage(stage)` / `CAMPAIGN_LAYOUT_PINS` | the Campaign policy |
| `RunOptions.layout` | pin a run's layout (overrides stage + rotation) |

---

## 2. Invariants (`layoutProblems` — enforced at dev boot and in the suite)

1. Every rect is a positive integer rect inside the arena's columns.
2. **Spawn band clear:** no obstacle in rows `0..SPAWN_CLEAR_ROWS-1` (0–1) — enemies and bosses
   spawn there, never inside a wall.
3. **Defense clear:** no obstacle in rows `≥ DEFENSE_TOP_ROW` (18) — the defensive region and the
   Final Defense Zone are always open, so **no slot can ever be blocked** (also checked per slot).
4. **Routable, pocket-free:** every passable cell above the line has a finite path cost to the
   bottom row. This covers every top spawn column and forbids sealed pockets (an enemy shoved
   into one would have no flow to follow).
5. Spawn spans are ordered, non-overlapping fractions inside `[0, 1]`; `minStage` is an integer ≥ 1.

Rows `2..17` are the authoring canvas. Remember the flow field forbids diagonal corner-cutting
between two blocked cells, so two blocks touching only at a corner form a sealed wall.

---

## 3. The layouts

| id | Name | Shape | Native biomes | From stage | Routing |
|---|---|---|---|---|---|
| `classic` | The Outcrops | scattered | verdant | 1 | five outcrops nudge the swarm off its line (the legacy arena) |
| `gullet` | The Gullet | chokepoint | carapace, ossuary | 1 | a wall spans the field; one central gap feeds everything through |
| `twin_lanes` | Twin Lanes | split | frostbound, neural | 1 | a bone spine splits the field; each half squeezes through its own gate |
| `open_maw` | The Open Maw | open | tempest, verdant | 1 | almost no cover — one wide, unbroken front |
| `coil` | The Coil | maze | necrotic, umbral | 1 | staggered baffles wind the swarm side to side (≈ +60 % path length) |
| `crossroads` | The Crossroads | split | neural, carapace | 6 | four plateaus carve three lanes and a cross-cut |
| `ribcage` | The Ribcage | chokepoint | ossuary, necrotic | 1 | ribs from both walls channel a long central corridor |
| `flank_sluices` | Flank Sluices | funnel | molten, ashen | 6 | a central plateau dams the field; the swarm pours down both flanks |
| `delta` | The Delta | funnel | frostbound, tempest | 6 | a chevron ridge sheds the swarm toward the outer flanks |
| `breach` | The Breach | scattered | ashen, molten | 6 | spawns burst from one central breach (spawn span), then fan across spurs |
| `twin_gates` | Twin Gates | split | umbral, tempest | 6 | spawns only at both flank gates (spawn spans) — a pincer |
| `spore_forest` | Spore Forest | scattered | verdant, necrotic | 1 | a forest of pillars breaks the swarm into weaving streams |
| `broken_wall` | The Broken Wall | chokepoint | carapace, molten | 11 | one gap on the far flank — the swarm cuts back across the field |

`minStage` holds the funnels/pincers (which deliver the swarm to the outer, not-yet-unlocked
emplacements) out of the first biome region. A test proves every layout's entry fingerprint
(where each top column's flow line crosses into the defensive region) is distinct.

---

## 4. Selection (§selection)

| Mode | Layout | Where |
|---|---|---|
| **Quick Skirmish** (`stage`), **tutorial**, **golden autoplay**, any run without a stage | `classic` | Game ctor default |
| **Campaign** | `layoutForStage(stage)` — stamped on `StageConfig.layout` | campaign.ts |
| **Daily** | one biome-flavored roll on the day seed's dedicated stream (`S_LAYOUT`) | daily.ts |
| **Infinite** (incl. Arena, which runs endless rules) | `layoutIdForDepth(depth)`: biome period 0 is `classic`, then each biome period (`BIOME_PERIOD` = 5 depths) brings the next layout in registry order; switched at wave start, when the field is clear | game.ts `startEndlessWave` |
| **Boss Rush** | `classic` — the bosses ARE the run identity (future hook: rotate like Infinite) | — |
| Any run with `RunOptions.layout` | the pin | — |

**Campaign policy.** `CAMPAIGN_LAYOUT_PINS` authors the onboarding (the `CAMPAIGN_BOSSES`
pattern): stage 1 is the tutorial's arena, then each early stage introduces one routing idea.
Every other stage draws `pickLayoutId` on `Rng(stageSeed(stage, 'layout'))` — independent of
difficulty, so every track shares the battlefield — over the minStage-gated pool, biome-native
layouts weighted ×3, **never the previous stage's layout** (the ladder is memoized forward).
Adding a layout re-rolls un-pinned stages (they are generated, never saved — no migration);
the pins keep the onboarding (and its pinned curve test) stable.

Determinism: the layout is a pure function of the Game's construction inputs (stage / day /
depth / pin), so replays, the Daily leaderboard verifier and spectate reproduce it. Records from
before layouts carry a stage without `layout` and replay on `classic`, exactly as recorded.

---

## 5. How to add a layout

1. Append one row to `MAP_LAYOUTS` (ids are stable references — append, never rename).
2. Author rects in rows 2–17; add `spawnSpans` only for a real spawn idea; tag 1–2 native biomes;
   set `minStage` if the routing delivers the swarm to the flanks or is otherwise a step up.
3. `npx vitest run src/core/mapLayouts.test.ts` — the validator, the distinct-fingerprint check
   and the "every layout appears on the ladder" check all run over the new row.
4. Optional: measure it (`curve` probe pattern in §6) and note its difficulty here.

No code changes: the renderer, the Game, the Campaign/Daily/Infinite selection and the stage
preview all read the registry.

---

## 6. Balance notes

Layouts change WHERE the swarm enters the defensive region, which matters because the opening
emplacements are the centre five columns (docs/SLOTS.md): central chokepoints (`gullet`,
`ribcage`) concentrate the swarm into the centre lattice; flank funnels (`delta`,
`flank_sluices`, `twin_gates`) deliver it to the edges. Long routes (`coil`) buy time under fire.
The Stage 1–3 curve is measured WITH the onboarding pins (docs/CAMPAIGN.md §grace,
`src/state/campaignCurve.test.ts`).

### Solid walls

The flow field only steers, so crowding / separation / gait pulls can shove a body INTO a wall
cell. The legacy field then said "head straight down", and bodies pushed through — invisible on
the five small outcrops, but it short-cut long walls. Every authored layout's field is built
with `solidWalls`: a blocked cell's flow points at its shallowest neighbour (BFS depth from the
open field; ties → the lower path cost) with magnitude `SOLID_WALL_PUSH` (4) — the mover
normalizes its steering blend, so the escape dominates and the body surfaces on the near face.
(Ties toward the HIGHER path cost — "push it back where it came from" — were tried and rejected:
they fought the route and deadlocked bodies at wall corners.) Probe (stage 6, 3 seeds): straight
pass-throughs fell from "most wall entries" to corner-rounding at wall ends only; no stalls.
The `classic` field keeps the legacy fallback — the golden path is byte-identical.

### Known limitations

- Wall-hugging bodies still clip a wall cell's corner when the flow rounds a wall end (the
  flow field allows a diagonal past a single blocked corner).
- Flyers and burrowers ignore obstacles by identity (as before).
- Boss Rush stays on `classic`.

# RENDER-PIPELINE.md — Battlefield rendering & art-swap guide

How the Canvas2D battlefield is drawn, and how to swap every placeholder for
production art with minimal churn. This is the *implementation* companion to the
visual **design** docs (`STYLE-GUIDE.md`, `READABILITY.md`, `PLACEHOLDER-ART.md`,
`VISUAL-AUDIT.md`) — it records what the renderer actually does today and where the
seams for future art live.

> Scope: this pass polished the placeholder look and made the pipeline art-ready
> **without changing gameplay or architecture**. The sim is untouched; the golden
> tests (`golden.test.ts`) stay byte-identical, which is the proof.

---

## 1. The three render modules (all in `src/render/`)

| File | Role | Swap target |
|---|---|---|
| `renderer.ts` | Composition only — reads `RenderState`, calls primitives. Public API: `drawGame(ctx, rs, pointer)` + `Pointer` (consumed by `GameView`). | rarely — it orchestrates |
| `theme.ts` | **The token map.** `THEME` palette + `TOWER_SHAPE`/`ENEMY_SHAPE` silhouette maps + `rgba()`. | retune look / reskin season |
| `vfx.ts` | **Reusable draw + animation primitives** (no state, no game logic): `pulse`, `easeOutCubic`, `roundRectPath`, `glowDisc`, `ring`, `drawShape`, `healthBar`. | swap `drawShape` for a sprite blit |

The split is deliberate (Part B — *sprites swappable, VFX reusable, UI assets
themeable, icons data-driven*): **renderer composes, theme decides look, vfx
draws.** `renderer.ts` hardcodes no palette of its own.

### How the data flows
`Game.getRenderState()` → `drawGame()` walks the scene in fixed order
(background → tiles → spawn zone → defense line → obstacles → tendrils → slots →
hive core → pools → towers → projectiles → enemies → particles → hero → pointer →
floats → vignette). Every element pulls colors from `THEME` and shapes from
`vfx`/the shape maps.

---

## 2. Swapping a placeholder for production art

Each swap is **one localized change**, by design:

- **A unit's silhouette** (e.g. make the flyer a sprite): change its entry in
  `ENEMY_SHAPE`/`TOWER_SHAPE`, or replace the `drawShape(ctx, shape, x, y, r, color)`
  call in `drawEnemy`/`drawTower` with a sprite blit keyed by the same `kind`. The
  shape maps are `Record<EnemyKind/TowerKind, ShapeKind>` — a sprite atlas keyed by
  the same union is a drop-in.
- **A color / token** (reskin): edit `THEME` in `theme.ts`. Nothing else moves.
- **A VFX** (new aura, new status ring, muzzle flash): add a primitive to `vfx.ts`
  and call it; it's pure and reusable across towers/enemies/hero.
- **An animation**: `vfx.pulse(t, …)` / `easeOutCubic` driven by `rs.time`, with a
  per-entity phase offset (`+ e.id` / `+ t.id`) so the swarm never pulses in
  lockstep. Add a `flash`/`cooldown`-derived term for fire recoil later.
- **Health bars / labels**: `vfx.healthBar()` and `labelAt()` are the single
  styling points.

Production sprites can replace silhouettes incrementally — the geometric shape is
always the LOD/fallback (it draws solid first, embellishments gate behind `detail`),
so a half-finished atlas still renders cleanly.

---

## 3. What this polish pass changed (look only)

Per the brief's eight targets — placeholder→**polished** placeholder, kept simple,
clean, scalable; no detailed artwork:

1. **Battlefield tiles** — bare faint grid → subtle **checker** floor + a single
   batched grid stroke (also a small perf win vs. one stroke per line).
2. **Tower slots** — square+plus → rounded **build pad** with pulsing corner
   brackets + center cross; locked slots are a dashed rounded plate + lock.
3. **Spawn indicators** — kept the membrane; chevrons now **ease** downward
   (gravity feel) and pull tokens from `THEME.spawn`.
4. **Defensive line** — glowing dashed barrier **+ emitter nodes** studded along
   it so it reads as a built line, not a stroke.
5. **Hive Core** — radial glow via `glowDisc` + a slowly **rotating containment
   shell** ring around the heartbeat core.
6. **Selection indicators** — flat fill → an **animated rounded selection frame**
   on the target pad + range preview (valid/invalid tinted).
7. **Targeting indicators** — range ring is now a **slowly rotating dashed** ring
   with a faint fill.
8. **Enemy health bars** — thin flat rect → rounded **pip** (`healthBar`), shown
   **only once damaged** to keep a fresh swarm uncluttered.

Plus the headline readability win from `PLACEHOLDER-ART.md §5`: **enemies are no
longer all circles** — each archetype has a distinct silhouette via `ENEMY_SHAPE`.

---

## 4. ⚠ Conflict analysis (parallel architecture refactor in flight)

This pass was scoped to **avoid merge conflicts** with a simultaneous architecture
refactor. Findings and the decisions they drove:

- **Isolation zone.** All changes are confined to `src/render/` — `renderer.ts`
  (modified) + `theme.ts`, `vfx.ts` (new). Throughout this project's history the
  other session has worked in `src/ui/*`, `src/index.css`, `src/core/*`,
  `src/state/*` and **never** in `src/render/*`. New files cannot conflict; the one
  modified file is render-only.
- **No public-API renames.** `drawGame()` + `Pointer` (the only exports
  `GameView` imports) are unchanged. An internal helper `drawGrid`→`drawTiles` is
  private (non-exported) and imported nowhere.
- **No core edits — a deliberate divergence from `PLACEHOLDER-ART.md §7`.** That
  spec recommends adding `shape`/`faction` fields to `EnemyDef` in
  `core/config.ts`. That file is the other session's hot zone, so instead the
  shape mapping lives in `render/theme.ts` (`ENEMY_SHAPE`/`TOWER_SHAPE`, keyed by
  the existing `EnemyKind`/`TowerKind`). **Future reconciliation:** once the
  architecture refactor settles, these maps can migrate into `config.ts` as
  `EnemyDef.shape` with no renderer change (the renderer already indexes by
  `kind`). Tracked here so it isn't lost.
- **Shared-kit naming.** `PLACEHOLDER-ART.md §2` proposed `src/render/shapes.ts`;
  this pass landed the same construction kit as `src/render/vfx.ts` (broader: also
  holds animation + health-bar primitives). If the other session creates
  `shapes.ts`, the two are non-colliding files but conceptually overlap — fold one
  into the other at reconciliation; `vfx.ts` is the superset.
- **No gameplay touched.** The renderer is read-only over `RenderState`; all 6
  golden seeds remain byte-identical (verified). Visual-only changes (enemy
  silhouettes, health-pip-when-damaged) carry no sim effect.

---

## 5. Verification

`npm run typecheck` (strict) · `npm test` (33 tests incl. 6 golden) · `npm run
build` — all green. Live: headless-Chromium smoke placed all three towers and
spawned the full archetype mix (every silhouette) with **zero console errors**.

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
- **Shared-kit naming.** `PLACEHOLDER-ART.md §2` proposed a separate `shapes` module;
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

---

## 6. Performance — where a frame goes (2026-11-06 pass)

Owner report: on a loaded desktop (30 fps baseline) busy fights dipped to 20–25 fps, more while
clicking/selecting. Measured with `npm run perf` (scripts/perf-probe.ts — a deterministic frozen
scene + a live fight + a selection-churn window; CDP `--cpu 4` stands in for a loaded machine) and
CPU / heap-sampling profiles, ~100 enemies · 21 towers · ~400 particles · 100–600 floats.

**Where the main thread goes (1× CPU, per frame):** the game loop (rAF) ≈ 7 ms — `drawGame` ≈ 85 %
of it (enemies ~45 %: creature forms, status FX, glows, health pips; towers ~15 %; the living
battlefield ~8 %), the sim's `advance()` ≈ 10 %, audio cue synthesis ≈ 5 %. React HUD work ≈ 1 ms/s
per 12.5 Hz snapshot (~10–13 ms/s). DOM style + paint ≈ 0.8 ms/frame, driven by ~14 non-composited
CSS animations in the HUD (it surfaces as the first `ctx.font` set in `drawSpawnZone`, which forces
the frame's style recalc early — moving it would not remove it). A busy frame records ~25,000 canvas
ops and, before this pass, allocated ~1 MB of garbage. **Text is not a hot spot** — Chrome caches
glyphs; a sprite cache for float text measured *slower* (drawImage-of-canvas snapshots) and was
dropped.

**Changed (invisible — the 21,189-op command stream of a deterministic frame is identical):**
- *Colour strings are memoized* — `theme.rgba` / `hexRgb`, livingBattlefield `css`, towerForms `C`,
  enemyForms `shade`/`shadeTok`, status hue tokens; gore and a few template literals route through
  `rgba`. Dynamic alpha is keyed at 1/1000 (≤ 0.0005 off — under one 8-bit colour level). Formatting +
  parsing a fresh `rgba()` per draw was ~0.65 µs and the top allocation source. **New code: compose
  dynamic-alpha colours with `rgba(token, a)`, never a template literal in a per-frame loop.**
- Per-body allocations reused: drawEnemy's `BodyOpts`, `deathFlavorOf`'s descriptors.
- HUD: `BiomassReadout` owns the per-snapshot income/pop state (it used to re-render the whole bar a
  second time per snapshot); `formatPower` uses one cached `Intl.NumberFormat` (`toLocaleString()`
  built an ICU formatter per call); the Inspector's mastery Power contribution is memoized per save
  snapshot (two whole-account Power folds ran on every tower click).

**Measured, before → after** (minified builds, software raster, `--disable-gpu`): per-frame
allocation 1000 → 683 KB (−32 %), GC time −13–23 %; deterministic-scene loop JS p50 5.18 → 4.95 ms
(1×) and 28.2 → 26.1 ms (4×), p95 39.4 → 31.5 ms (4×); live fight loop JS −10 % (1×) / −8–14 % (4×);
HUD component renders −7 %; click handling (pointerup → synchronous selection render) mean
2.40 → 2.16 ms (1×). Frame *intervals* in the probe are raster-bound (software raster ≈ 17–34 ms of
each frame), so they move little — read the loop/React columns.

**The big levers left — measured, not changed (visible or cross-cutting; owner decision):**
1. *A load-adaptive detail tier.* The existing LOD path (`PERF.lodEnemyCount`) cuts loop JS 7.3 → 4.2 ms
   (−42 %) and lifts the probe from 25 → 39 fps — but it swaps creature bodies for flat silhouettes and
   drops status FX. A frame-time-driven middle tier (keep bodies; shed glows/emitters/trails first, with
   hysteresis) is the material win for loaded machines; it needs a design pass (what may degrade).
2. *A display-sized backing store.* At 1440×900 the board shows at 543×724 CSS px but renders 720×960
   (1.76× the pixels, downsampled by the compositor). Rendering at the displayed size measured raster
   17.5 → 11.8 ms/frame (−33 %), 23 → 33 fps, with no visible loss — but `canvas.board` sizes from its
   intrinsic (backing) size, so it needs a CSS sizing change across the four layout profiles (mobilecheck).
3. *Compositor-only HUD animations.* ~14 HUD animations (background-position, text-shadow, `::before/
   ::after`) restyle + repaint every frame (~0.8 ms/frame); transform/opacity versions run off-thread.

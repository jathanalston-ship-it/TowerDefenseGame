# SIGNATURE-MOMENTS.md — Batch 3 storyboard (the four big "feel" moments)

> **Status: PLANNED — design only.** The 2026-11 feel audit (see docs/GAME-FEEL.md for the feel
> vocabulary) ranked these as the moments worth building once the polish foundations land. They
> need the owner's eye on each one, so this doc fixes the beats, the hooks and the open taste
> choices up front; implementation follows one moment at a time, each reviewed from a
> frame-stepped capture before it ships. Hero-ultimate impact moved into the Batch 1+2 polish
> pass, so it is not repeated here.

**Foundations these build on (Batch 1+2):** the centre-stage announcer queue (one owner for
centre-screen banners), the feel table (one data row per event: shake, view-only hit-stop,
music duck, stinger), `motionScale` (OS reduced-motion + the Settings sliders) and the existing
view-only `game.hitstop`. Every moment below is **render/UI only** — the deterministic sim, its
goldens and replays are untouched; nothing reads wall-clock time inside `src/core/`.

**Shared acceptance rules**
- Captured with the frame-stepped recipe (`npm run media` / scripts/capture-media.ts — Playwright
  fake clock, 24 fps) and reviewed as a contact sheet before merge.
- `motionScale = 0` (reduced motion) keeps the information and drops the motion: no slow-mo
  ramps, no camera moves, no full-screen flashes — a static frame with the same text.
- No per-frame allocations in the render path; 60 fps holds on the 1440×900 board with 150 enemies.
- Skippable or non-blocking: a moment never holds input longer than 600 ms.

---

## 1. The last kill of a wave

**Today:** the final enemy pops like any other; the wave-clear fanfare (`clear`) fires later,
when the draft opens. The 0.7 s settle beat (`config.SETTLE`) is dead air.

**Target beat sheet** (wall-clock at 1×):
| t | Beat |
|---|---|
| 0 ms | Last enemy dies → view time eases to 35 % over 80 ms (sim keeps its own clock) |
| 0–400 ms | Camera nudges ≤ 4 % toward the kill (existing eased canvas transform, docs/CAMERA.md) |
| 120 ms | `clear` fanfare moves HERE (off draft-open); short music duck from the feel table |
| 400–650 ms | Time eases back to 100 %; camera returns |
| 650 ms | Settle continues → draft deals as today |

**Hooks:** the sim already knows "last enemy of the wave" (`checkWaveEnd`) — emit a presentation
event `waveLastKill {x, y}`; GameView owns the view-time scale (it already scales by game speed).

**Taste choices for the owner:** slow-mo depth (35 % / 50 % / none — camera only) · whether boss
waves get a longer version · whether the fanfare stays on the draft too.

---

## 2. Victory carries into Results

> **Status: BUILT (2026-11, Batch 3 track S2).** `src/render/runOutro.ts` (the FX + the snapshot),
> `src/ui/components/RunBackdrop.tsx` (Results' backdrop), index.css §S2 (veil, settle beat,
> backdrop filters). Render/UI only — the sim, goldens and replays are untouched.

**Before:** VICTORY held a frozen board for 3.4 s under a viewport-centred veil (which hid the
Hive Core at the bottom of the board), then Results opened as a panel floating in a black void.

**As built — beat sheet** (wall-clock from GameView's outro clock; never sim time):
| t | VICTORY | DEFEAT |
|---|---|---|
| 0 | The veil becomes a spotlight on the board's rect (the chrome recedes, the board stays lit) | same spotlight |
| 0–1.4 s | The terraform **washes outward from the Hive Core** to the farthest corner (ease-out), under the entities, tinted the **biome accent**, a soft wavefront riding its edge | colour **drains** (0–0.9 s) and **cracks spread from the breach point** (0–1.5 s), the Nucleus's red light bleeding through them |
| 1.4 s → | The washed network beats with the terraform's own heartbeat | the drained, cracked board holds |
| hold − 350 ms | **Settle:** the live board eases into Results' look (blur + dim) and the title fades | same |
| hold | Results lands on that same frame: the board laid back where it stood, blurred **8 px**, at **40 %** brightness | same |

Victory hold **2400 ms** (defeat 3400 ms · reduced motion 1200 ms) — a tap still skips at once.
The wash **1400 ms**; the defeat cracks 1500 ms.

**How it works**
- **Reuses the terraform, doesn't fork it.** `livingBattlefield.bakeAssimilatedBoard(a, biome,
  accent)` runs the SAME `deriveTerraform` + `buildBake` with the run's own regions at the Living
  stage / full reach — "this board, fully assimilated". `runOutro` reveals it with a growing clip
  from the nucleus inside `drawGame` (`drawVictoryWash`, right after the Living Battlefield), so
  towers and heroes stand on the assimilated ground. One bake at the outro start; per frame two
  clipped blits + a tint fill + four arc strokes.
- **Defeat grammar.** The breach point is the Core's surface facing the attacker nearest it
  (`breachPoint`); `deriveCracks` is a seeded walk (deterministic per breach, fanned toward the
  board, tapering, forking ≤ 2 deep), baked once and revealed by the same growing clip; the drain
  is one `saturation`-blend fill + a dim, over the finished frame.
- **The backdrop.** At the hand-off `runOutro.capture()` draws the canvas into a third-size
  canvas → ONE JPEG data URL (~20–40 KB) + the board's on-screen rect (viewport fractions). It
  rides `GameView.onEnd(result, backdrop)` into App's last-run state → `Results({ backdrop })` →
  `RunBackdrop`: the board layer at its captured rect (contain-fitted and centred if the viewport
  changed shape — a rotated phone) over a heavily-blurred cover fill of the same image. App drops
  the image when the screen leaves Results; nothing is retained in the module (no object URLs).
  App also preloads the lazy Results chunk while the run plays, so no "Loading…" frame lands
  between the board and Results.
- **Degrades to today's look** wherever no outro ran: the replay theater (its canvas never
  matches the live board, so the hook is a no-op), the Arena, the tutorial (no outro), the
  crash "End Run" path, headless.
- **Reduced motion** (`viewFeel.motion = 0`): no wash, no spreading, no settle — the end state
  (fully washed / drained + cracked) shows at once under the same title; the backdrop still lands.

**Taste values (data — retune here):** `OUTRO` in `src/render/runOutro.ts` (hold per outcome, wash
duration + tint source `'biome' | 'tier' | '#hex'` + ground/glow/tint alphas + wavefront strokes,
defeat drain/dim/crack shape/colour, snapshot scale/quality, settle ms); the backdrop's
`--rb-blur 8px · --rb-dim 0.4` and the cover fill's `--rb-fill-*` in index.css §S2.

**Measured:** see the batch report — added cost during the outro ≪ 1 ms/frame at 1440×900 with
~150 enemies; the one-off bake runs on the outro's first frame.

---

## 3. Cutscenes that move — and premieres that show their monster

**Today:** only 1–4 % of pixels change across 3.5 s in both the opening film and the Mega
premieres; MERIDIA's own premiere uses generic grey cones instead of MERIDIA; in the intro's
core scene the copy sits on the brightest pixel (the core).

**Target:**
- Every scene has motion on three layers: a slow camera drift (2–4 % over the scene), a mid-layer
  that animates on the score's beats (the beats already exist as data — docs/CUTSCENES.md), and
  particulate foreground.
- Mega premieres paint the actual Mega with `src/render/megaboss.ts` (the same painter the raid uses),
  posed per scene: silhouette reveal → weak points ignite → the fall.
- A per-scene `copyAt` field places text on the scene's quiet region (data, not code).
- Camera "punches" (≤ 6 % zoom, 120 ms) on the beats marked `impact` in the score.

**Hooks:** cutscene scenes are data rows; add `copyAt`, `camera` and `punch` fields with defaults
so existing scenes keep working. The mega painter needs a "pose" entry point that renders one mega
at a given scale without a live Game.

**Taste choices:** how much camera motion (subtle / cinematic) · whether premieres show the mega
in full or only in silhouette until its fall · text style for the premiere title card.

---

## 4. Living gutters

**Today:** at 1440×900 the board is 543 px wide with ~470 px of flat black on either side.

**Target:** the biome continues past the board edge — the same ground, flora and assimilation
veins, darkened and slightly blurred so it reads as periphery, never as playable space. As the
run's Assimilation Index rises the infestation creeps into the gutters too; on a Mega stage the
raid organism's limbs extend into them.

**Hooks:** a second, low-resolution canvas behind the board (pointer-events: none) painted by the
Living Battlefield's existing layers at ~1/4 resolution and re-baked only when the terraform
stage changes (cheap). Phones (no gutters) skip it entirely.

**Taste choices:** how bright the periphery may get before it competes with the board · whether
enemies are ever visible in the gutters (spawn approach) or never.

---

## Order and sizing

1 → 2 → 4 → 3 (cutscenes are the largest and benefit from the other three's tooling).
Sizes: 1 = M, 2 = M, 4 = M, 3 = L. Each ships behind its own review with before/after frame
sheets; none changes the sim, saves or balance.

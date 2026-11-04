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

**Today:** VICTORY holds a frozen board for 3.4 s (`OUTRO_HOLD_MS`), then Results opens as a
540 px panel floating in a black void.

**Target:** the board *assimilates* — the Living Battlefield's terraform (docs/LIVING-BATTLEFIELD.md)
washes outward from the Hive Core to the edges over ~1.4 s — then the final frame is kept as a
blurred, darkened backdrop behind Results instead of black. Defeat gets its own grammar: the
board desaturates and cracks from the breach point.

**Hooks:** the renderer already bakes a terraform layer; add a `victoryWash(t)` uniform-style
parameter driven by GameView's outro clock. Results takes an optional backdrop image (one
`canvas.toDataURL` snapshot at outro end, released on unmount).

**Taste choices:** wash colour (biome accent vs. hive gold) · backdrop blur strength · whether the
outro hold shortens to ~2 s once the wash carries the moment.

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

**Status: BUILT (2026-11, Batch 3 track S3).** Painter `src/render/gutters.ts`, mount
`src/ui/components/LivingGutters.tsx` (one element in GameView and in SpectateView — the replay
theater gets it too), CSS §LIVING GUTTERS at the end of `src/index.css`.

**What shipped**
- Two low-resolution canvases (`.gutters`) fill the board's frame (`.canvas-wrap` / `.spectate-stage`)
  BEHIND the board and every overlay (the board is lifted into the positioned layer; DOM order keeps it
  on top). Only one holds a bake at rest; the other exists for the crossfade and is freed after it.
- The bake paints in board units extended past the edges: the floor's void→hive fall + tile lattice,
  the spawn void + membrane haze along the top, the hive's warmth pooling up from the bottom (feathered —
  no defense line: that is gameplay), the biome wash; then, once the Living Battlefield wakes (stage ≥ 1),
  the SAME terrain vocabulary (`livingBattlefield.ts` exports its painters — `terraformPalette`,
  `crustGeometry`, `infectionField`, `paintVein`, `paintFlora`, `paintEyeSocket`): flesh membrane +
  capillaries, the crust tide across the whole frame, outbound arteries leaving the board under the
  frame edge (hued by the nearest tower), biome flora, closed eye sockets (stage ≥ 4).
- **Creep:** the periphery's infection field = the board's own field continued across the seam (edge
  towers, the rising frontier) ∪ a creep spreading outward from the board edges whose reach follows the
  Assimilation Index (bucketed into `creepSteps` with ¾-step hysteresis — a hovering index never flaps
  the bake). At index 1 the frame is consumed.
- **Mega stage:** the raid organism's ridge continues across the frame top and 2–4 static limbs per side
  (palette + visual tier, wardrobe re-veining honoured) reach down into the periphery. They crossfade in
  when the Mega surfaces and withdraw when it burrows or dies — the live body on the board keeps all the
  motion.
- **Enemies, towers, projectiles and HUD markers are never painted there** (the bake has no entity
  input at all).
- **Static bake, zero per-frame work:** a 4 Hz poll compares a key (biome · mega id/tier · and, once
  woken, stage · creep step · tower layout) and re-bakes only on a change; a frame/board resize
  (ResizeObserver on both — panel collapse, window resize) repaints in place. Bakes swap with a CSS
  opacity crossfade (compositor-only) matching the board terraform's 0.85 s.
- **Phones / any frame without gutters:** the component renders nothing on the landscape/portrait run
  layouts and when no side of the frame has ≥ `minGutterPx` of gutter — no canvas, no poll.

**Taste values (one table — `GUTTERS` in `src/render/gutters.ts`):**
brightness **0.35** · bake at **0.25×** · poll **250 ms** · crossfade **850 ms** ·
`creepSteps` 12, `creepReach` 1.1 × the widest gutter, contact shadow `seamWidth` 26 / `seamAlpha` 0.6, outer dissolve `edgeFade` 0.16, arteries
1 + 1/stage (≤ 6) per side, Mega limbs 2 + ½/tier (≤ 4) per side.

**Camera decision:** the gutters stay STILL. Every camera effect (shake, wave push-in, the last-kill
nudge, the assimilation heartbeat) moves the picture INSIDE the board canvas; the canvas element never
moves, so the periphery is the steady world beyond the lens and costs nothing per frame. The dark sliver
a shake reveals inside the board's edge sits against the contact shadow (darkest at the seam), so the
seam never tears (verified frame-by-frame on a Mega arrival + boss arrival). The outro's CSS zoom simply
grows the board over the periphery.

**Reduced motion:** nothing in the gutters animates; under reduced motion (Settings → Motion 0 or the OS
setting) even the bake swap is instant.

**Measured (headless Chromium, software canvas; the machine was shared and loaded):** bake 0.2 ms
(dormant ground) – 2–7.6 ms (stage 5 + Mega limbs) across 1366×768…2560×1080 — against 20–100 ms for the
board's own terraform re-bake that fires at the same stage step; the poll's pure part ≈ 2.5 µs (4×/s);
nothing runs per frame. Memory: one 254×181 store at 1440×900 (≈ 180 KB), 534×219 at 2560×1080
(≈ 460 KB); twice that only during a crossfade.

**Today (before):** at 1440×900 the board is 543 px wide with ~470 px of flat black on either side.

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

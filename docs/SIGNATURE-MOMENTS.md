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

**Status: BUILT (2026-11, Batch 3 track S4)** — canonical doc: docs/CUTSCENES.md §direction +
§premieres. What shipped:
- `render/filmDirection.ts` — the three layers for every scene of the opening film AND every
  cutscene: drift over the scene's own hold, punches on `impact` beats, a beat-driven mid layer
  (`fx.beat` kick / `fx.surge` steps read by all 17 painters), a parallaxed particulate foreground.
- Mega premieres open on the new `'mega'` painter: the ACTUAL organism via
  `render/megaboss.ts drawMegaPose` (the raid's own body + organ painters on a cached pose rig;
  the raid's render one-shots parked around the call) — silhouette out of its backlight →
  weak points ignite one by one (maw gathering, organs flaring per beat) → the fall on an
  impact beat. All seven premieres; `cutscenes.test.ts` enforces it for future megas.
- `copyAt` per scene (`center | upper | lower`, measured quiet bands); the intro core scene's copy
  now sits below the Hive Core. Scene rows gained `copyAt`, `camera`, `punch`, `mega` with defaults.
- Reduced motion resolves through `resolveMotion` (OS request unless Settings → Motion overrides
  it): one still per scene (a Mega still = the whole organism just after its last organ lit), no
  drift / punches / flashes, same copy and timing; Skip / tap unchanged; no new input holds.

**Taste values (the lead's calls) and where they live:** drift **2–3 %** — the DRIFT rows in
`render/introScenes.ts` / `render/cutsceneScenes.ts` (a scene's `camera` overrides); punch
**4.5 % default, 6 % ceiling, 25 ms rise / 120 ms total** — `FILM.punch` (filmDirection.ts), per
scene `punch`; Mega **in full** — the reveal resolves within ~1.2–2 s, then the full organism
(`MEGA_SCENE` in cutsceneScenes.ts: spans, framing, the fall's light gasp; `MEGA_POSE` in
megaboss.ts: silhouette tone, organ descent); title card typography unchanged (existing
`.intro-*` classes).

**Measured** (frame-stepped capture, projector canvas only, % pixels with max |ΔRGB| > 24 between
scene t = 1.0 s and 4.5 s — the audit's metric): opening film signal 2.4 → 5.7 · descent 1.9 →
20.2 · veins 3.6 → 4.5 · core 3.1 → 8.9 · title 0.1 → 0.2 (the waiting title card stays calm);
Mega premiere first scenes 0.6–7.5 → 6.4–42.8 (MERIDIA 1.5 → 11.6). Frame-to-frame change stays
≤ 10 % at 24 fps (no strobing) except on the authored moments — an impact punch or the fall's one
light gasp, single frames ≤ ~28 % at 12 fps. Reduced motion: 0 % (static). Full tables + contact
sheets: the S4 track report.

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

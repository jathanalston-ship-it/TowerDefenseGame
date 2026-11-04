// FILM DIRECTION (docs/CUTSCENES.md §direction) — the three motion layers every film scene gets
// on top of its painter, shared by the opening film (render/introScenes.ts) and the story
// cutscenes + Mega premieres (render/cutsceneScenes.ts):
//   1. CAMERA     — a slow drift across the scene's hold (subtle: 2–3 %; the scene's `camera`
//                   row, else its painter's drift row) plus a short PUNCH (≤ 6 % zoom, ~120 ms)
//                   on every beat marked `impact` in the score.
//   2. MID LAYER  — the painters animate their subject on the score's BEATS: `fx.beat` is a
//                   decaying 0..1 kick from the latest beat; `fx.surge` steps up by one (eased)
//                   per beat, for things that lurch forward on the music.
//   3. FOREGROUND — out-of-focus particulate in front of the tableau, with extra parallax.
// Everything is a pure function of (scene data, clock): deterministic, replayable, and
// allocation-free per frame (one module-level fx object, mutated in place). Reduced motion
// (motion = 0): no drift, no punch, no flashes — a static frame with the same copy.

import type { CutsceneBeat, CutsceneCamera, CutsceneMegaArc } from '../core/cutscenes';

/** The film's tunables — the owner's taste dials (docs/SIGNATURE-MOMENTS.md §3). */
export const FILM = {
  /** Camera drift: a scene that waits for the player (durMs 0) drifts over this nominal hold. */
  drift: { holdS: 9 },
  /** Camera punch on `impact` beats: default zoom, hard ceiling, attack + total length. */
  punch: { zoom: 0.045, max: 0.06, attackS: 0.025, totalS: 0.12 },
  /** Mid-layer beat envelopes: the kick's decay and how long one surge step takes to land. */
  beat: { decayS: 0.45, surgeS: 0.6 },
  /** The particulate foreground: mote count, radius range (px), peak alpha, parallax vs the camera. */
  foreground: { count: 22, minR: 1.4, maxR: 4.6, alpha: 0.26, parallax: 1.8 },
} as const;

/** Any film scene row — the intro's IntroScene and a cutscene's CutsceneScene both fit. */
export interface FilmScene {
  durMs: number;
  beats: readonly CutsceneBeat[];
  camera?: CutsceneCamera;
  punch?: number;
  mega?: CutsceneMegaArc;
}

/** Per-frame film state handed to every painter (one shared object, mutated per scene paint). */
export interface FilmFx {
  beat: number; // 0..1 — the latest beat's decaying kick
  age: number; // seconds since the latest beat (Infinity before the first)
  surge: number; // Σ eased beat steps so far (0 before the first beat)
  punch: number; // extra camera zoom from an `impact` beat (0 when none / reduced motion)
  motion: number; // 0 = reduced motion (static), 1 = full
  flashes: boolean; // full-screen light blooms allowed (Settings → Flashes, off in reduced motion)
  megaId: string | null; // the 'mega' painter's organism (Mega premieres)
  megaArc: CutsceneMegaArc | null; // its pose timeline (null → the painter's default arc)
}

export const filmFx: FilmFx = { beat: 0, age: Infinity, surge: 0, punch: 0, motion: 1, flashes: true, megaId: null, megaArc: null };

const clamp01 = (k: number): number => (k < 0 ? 0 : k > 1 ? 1 : k);
const smooth = (k: number): number => { const x = clamp01(k); return x * x * (3 - 2 * x); };
const easeOut = (k: number): number => { const x = clamp01(k); return 1 - (1 - x) * (1 - x) * (1 - x); };

/** The punch envelope at `age` seconds after its beat: a 25 ms rise, then an eased release. */
export function punchEnvelope(age: number): number {
  const { attackS, totalS } = FILM.punch;
  if (age < 0 || age >= totalS) return 0;
  if (age < attackS) return age / attackS;
  const k = (age - attackS) / (totalS - attackS);
  return (1 - k) * (1 - k);
}

/** Resolve the beat-driven layers for `scene` at scene time `t` into `out` (no allocation).
 *  Beats are authored in clock order (test-enforced), so the walk stops at the first future one. */
export function resolveFilmFx(out: FilmFx, scene: FilmScene | null, t: number, motion: number, flashes: boolean): FilmFx {
  out.beat = 0;
  out.age = Infinity;
  out.surge = 0;
  out.punch = 0;
  out.motion = motion;
  out.flashes = flashes && motion > 0;
  out.megaArc = scene?.mega ?? null;
  if (!scene) return out;
  const zoom = Math.min(FILM.punch.max, Math.max(0, scene.punch ?? FILM.punch.zoom));
  for (const b of scene.beats) {
    const age = t - b.at;
    if (age < 0) break;
    out.beat = Math.exp(-age / FILM.beat.decayS);
    out.age = age;
    out.surge += easeOut(age / FILM.beat.surgeS);
    if (b.impact && motion > 0) out.punch = Math.max(out.punch, punchEnvelope(age) * zoom);
  }
  return out;
}

/** Drift progress 0..1 across the scene's hold (0 under reduced motion — the camera holds still). */
export function driftK(scene: FilmScene | null, t: number, motion: number): number {
  if (motion <= 0) return 0;
  const hold = scene && scene.durMs > 0 ? scene.durMs / 1000 : FILM.drift.holdS;
  return clamp01(t / hold);
}

/** Apply the scene camera: drift (eased over the hold) + the punch, about the frame centre. */
export function applyFilmCamera(ctx: CanvasRenderingContext2D, w: number, h: number, cam: CutsceneCamera, k: number, punch: number): void {
  const e = smooth(k);
  const z = 1 + cam.zoom * e + punch;
  ctx.translate(w / 2 + cam.dx * w * e, h / 2 + cam.dy * h * e);
  ctx.scale(z, z);
  ctx.translate(-w / 2, -h / 2);
}

const h01 = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const fgCam: CutsceneCamera = { zoom: 0, dx: 0, dy: 0 }; // scratch — the foreground's parallaxed camera

/** The particulate FOREGROUND: soft, out-of-focus motes drifting in front of the tableau under a
 *  parallaxed copy of the scene camera (they move more than the world behind them). `rgb` is an
 *  'r, g, b' triple; alpha rides globalAlpha so the fill string is built once per call. */
export function drawFilmForeground(
  ctx: CanvasRenderingContext2D, w: number, h: number, t: number, rgb: string,
  cam: CutsceneCamera, k: number, punch: number, density = 1,
): void {
  const f = FILM.foreground;
  const n = Math.round(f.count * density);
  if (n <= 0) return;
  fgCam.zoom = cam.zoom * f.parallax;
  fgCam.dx = cam.dx * f.parallax;
  fgCam.dy = cam.dy * f.parallax;
  ctx.save();
  applyFilmCamera(ctx, w, h, fgCam, k, punch * f.parallax);
  ctx.fillStyle = `rgb(${rgb})`;
  const base = ctx.globalAlpha;
  const span = Math.max(w, h);
  for (let i = 0; i < n; i++) {
    const z = 0.45 + h01(i * 8.3) * 0.55; // nearer motes are bigger, faster, brighter
    const x = ((h01(i * 5.3) * w + t * (h01(i * 2.9) - 0.5) * span * 0.03 * z + Math.sin(t * 0.5 + i) * 10 * z) % w + w) % w;
    const y = ((h01(i * 7.1) * h - t * h * 0.018 * z) % h + h) % h;
    const r = f.minR + (f.maxR - f.minR) * z;
    const tw = 0.55 + 0.45 * Math.sin(t * (0.6 + z * 0.5) + i * 1.7);
    ctx.globalAlpha = base * f.alpha * z * tw * 0.35;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = base * f.alpha * z * tw;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = base;
  ctx.restore();
}

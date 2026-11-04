// FILM DIRECTION (docs/CUTSCENES.md §direction) — the three motion layers every film scene gets:
// camera drift + impact punches, the beat-driven mid layer, the particulate foreground. Pins the
// owner's taste dials (subtle drift, ≤ 6 % / ~120 ms punches), the reduced-motion contract (a
// static frame — no drift, no punch, no flashes), and that every film still paints end to end.

import { describe, expect, it } from 'vitest';
import { FILM, driftK, filmFx, punchEnvelope, resolveFilmFx } from './filmDirection';
import type { FilmScene } from './filmDirection';
import { CUTSCENES } from '../core/cutscenes';
import { MEGA_BOSS_DEFS } from '../core/megaboss';
import { cutsceneMegaId, cutsceneStillT, drawCutsceneFrame, drawCutsceneStill } from './cutsceneScenes';
import { MEGA_POSE, drawMegaPose } from './megaboss';
import { drawIntroFrame } from './introScenes';
import { SCENES } from '../ui/InitCutscene';

function stubCtx(): CanvasRenderingContext2D {
  const proxy: unknown = new Proxy(function () { /* noop */ }, {
    get: (_t, prop) => (prop === 'canvas' ? { width: 1280, height: 800 } : prop === 'globalAlpha' ? 1 : proxy),
    set: () => true,
    apply: () => proxy,
  });
  return proxy as CanvasRenderingContext2D;
}

const scene: FilmScene = {
  durMs: 8000,
  beats: [{ at: 1, cue: 'cin_ping' }, { at: 2, cue: 'cin_rumble', impact: true }, { at: 5, cue: 'cin_snap' }],
};

describe('the taste dials (docs/SIGNATURE-MOMENTS.md §3)', () => {
  it('punches are ≤ 6 % zoom and last ~120 ms; the default sits under the ceiling', () => {
    expect(FILM.punch.max).toBeLessThanOrEqual(0.06);
    expect(FILM.punch.zoom).toBeLessThanOrEqual(FILM.punch.max);
    expect(FILM.punch.totalS).toBeGreaterThanOrEqual(0.08);
    expect(FILM.punch.totalS).toBeLessThanOrEqual(0.16);
    let peak = 0;
    for (let a = -0.05; a <= 0.3; a += 0.005) peak = Math.max(peak, punchEnvelope(a));
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.9);
    expect(punchEnvelope(FILM.punch.totalS)).toBe(0);
    expect(punchEnvelope(-0.01)).toBe(0);
  });

  it('a scene punch above the ceiling is clamped to it', () => {
    const fx = resolveFilmFx(filmFx, { ...scene, punch: 0.5 }, 2 + FILM.punch.attackS, 1, true);
    expect(fx.punch).toBeCloseTo(FILM.punch.max, 5);
  });
});

describe('resolveFilmFx — the beat-driven layers', () => {
  it('is allocation-free (mutates and returns the shared fx object)', () => {
    expect(resolveFilmFx(filmFx, scene, 3, 1, true)).toBe(filmFx);
  });

  it('kicks on each beat, decays after, and surges one step per beat', () => {
    expect(resolveFilmFx(filmFx, scene, 0.5, 1, true).beat).toBe(0);
    expect(filmFx.age).toBe(Infinity);
    expect(resolveFilmFx(filmFx, scene, 1, 1, true).beat).toBeCloseTo(1, 5);
    const later = resolveFilmFx(filmFx, scene, 1.8, 1, true).beat;
    expect(later).toBeGreaterThan(0);
    expect(later).toBeLessThan(0.3);
    expect(resolveFilmFx(filmFx, scene, 4, 1, true).surge).toBeCloseTo(2, 1);
    expect(resolveFilmFx(filmFx, scene, 7, 1, true).surge).toBeCloseTo(3, 1);
  });

  it('punches ONLY on impact beats', () => {
    expect(resolveFilmFx(filmFx, scene, 1 + FILM.punch.attackS, 1, true).punch).toBe(0); // cin_ping, not impact
    expect(resolveFilmFx(filmFx, scene, 2 + FILM.punch.attackS, 1, true).punch).toBeCloseTo(FILM.punch.zoom, 5);
    expect(resolveFilmFx(filmFx, scene, 2 + FILM.punch.totalS + 0.01, 1, true).punch).toBe(0);
  });

  it('reduced motion: no punch, no drift, no flashes (a static frame)', () => {
    const fx = resolveFilmFx(filmFx, scene, 2 + FILM.punch.attackS, 0, true);
    expect(fx.punch).toBe(0);
    expect(fx.flashes).toBe(false);
    expect(driftK(scene, 6, 0)).toBe(0);
    expect(driftK(scene, 4, 1)).toBeCloseTo(0.5, 5);
    expect(driftK({ ...scene, durMs: 0 }, 99, 1)).toBe(1); // a scene that waits drifts over the nominal hold, then holds
  });
});

describe('every film paints end to end under the direction layers', () => {
  it('every cutscene scene draws across its hold, dissolving from the previous one, in both motion modes', () => {
    const ctx = stubCtx();
    expect(() => {
      for (const def of CUTSCENES) {
        const megaId = cutsceneMegaId(def);
        def.scenes.forEach((s, i) => {
          const prev = i > 0 ? def.scenes[i - 1] : null;
          for (const [w, h] of [[1440, 900], [390, 844], [260, 96]] as const) {
            for (const t of [0, 0.4, 1.5, 3, 5, s.durMs / 1000 - 0.05]) {
              drawCutsceneFrame(ctx, w, h, {
                painter: s.painter, t, theme: def.palette, prev: prev ? { painter: prev.painter, t: prev.durMs / 1000 + t } : null,
                fade: Math.min(1, t / 0.85), scene: s, prevScene: prev, megaId, motion: 1, flashes: true,
              });
            }
          }
          drawCutsceneFrame(ctx, 1440, 900, { painter: s.painter, t: cutsceneStillT(s), theme: def.palette, prev: null, fade: 1, scene: s, megaId, motion: 0, flashes: false });
        });
        drawCutsceneStill(ctx, 260, 96, def);
      }
    }).not.toThrow();
  });

  it('the opening film draws with its direction rows, in both motion modes', () => {
    const ctx = stubCtx();
    expect(() => {
      SCENES.forEach((s, i) => {
        const prev = i > 0 ? SCENES[i - 1] : null;
        for (const t of [0, 0.6, 1.62, 3, 6]) {
          drawIntroFrame(ctx, 1440, 900, s.visual, t, prev?.visual ?? null, 8 + t, Math.min(1, t / 0.85), s, prev, 1, true);
          drawIntroFrame(ctx, 390, 844, s.visual, t, null, 0, 1, s, null, 0, false);
        }
      });
    }).not.toThrow();
  });
});

describe('the mega POSE entry point (render/megaboss.ts drawMegaPose)', () => {
  it('poses every mega boss without a live Game — and refuses an unknown one', () => {
    const ctx = stubCtx();
    for (const id of Object.keys(MEGA_BOSS_DEFS)) {
      for (const p of [
        { reveal: 0, ignite: 0, gather: 0, fall: 0, flare: 0 },
        { reveal: 1, ignite: 0.5, gather: 0.6, fall: 0, flare: 1 },
        { reveal: 1, ignite: 1, gather: 0, fall: 0.5, flare: 0.3 },
        { reveal: 1, ignite: 1, gather: 0, fall: 1, flare: 0 },
      ]) expect(drawMegaPose(ctx, id, p, 3.7)).toBe(true);
    }
    expect(drawMegaPose(ctx, 'no_such_mega', { reveal: 1, ignite: 1, gather: 0, fall: 0, flare: 0 }, 1)).toBe(false);
  });

  it('a replayed film (clock back at 0) draws cleanly after a fall', () => {
    const ctx = stubCtx();
    const id = Object.keys(MEGA_BOSS_DEFS)[0];
    expect(() => {
      for (let t = 0; t < 8; t += 0.1) drawMegaPose(ctx, id, { reveal: 1, ignite: 1, gather: 0, fall: t > 4 ? (t - 4) / 3 : 0, flare: 0 }, t);
      for (let t = 0; t < 8; t += 0.1) drawMegaPose(ctx, id, { reveal: 1, ignite: 1, gather: 0, fall: t > 4 ? (t - 4) / 3 : 0, flare: 0 }, t);
    }).not.toThrow();
    expect(MEGA_POSE.descend).toBeGreaterThan(0);
    expect(MEGA_POSE.descend).toBeLessThanOrEqual(1);
  });
});

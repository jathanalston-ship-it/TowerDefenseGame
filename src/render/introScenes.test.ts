// Intro cinematics smoke (docs/GAME-FEEL.md §intro): every procedural set-piece renders
// across its full timeline — including the cross-dissolve path and the reduced-motion
// stills — against a stub 2D context, at several canvas sizes (the geometry cache rebuilds).

import { describe, expect, it } from 'vitest';
import { REDUCED_FRAME_T, drawDiveTransition, drawIntroFrame } from './introScenes';
import type { IntroVisual } from './introScenes';
import { SCENES } from '../ui/InitCutscene';

const VISUALS: IntroVisual[] = ['signal', 'descent', 'veins', 'core', 'title'];

function stubCtx(): CanvasRenderingContext2D {
  const proxy: unknown = new Proxy(function () { /* noop */ }, {
    get: (_t, prop) => (prop === 'canvas' ? { width: 1280, height: 800 } : prop === 'globalAlpha' ? 1 : proxy),
    set: () => true,
    apply: () => proxy,
  });
  return proxy as CanvasRenderingContext2D;
}

describe('intro scene painters', () => {
  it('draws every scene across its timeline at several sizes without throwing', () => {
    const ctx = stubCtx();
    expect(() => {
      for (const [w, h] of [[1280, 800], [390, 844], [720, 960]] as const) {
        for (const v of VISUALS) {
          for (const t of [0, 0.6, 1.5, 3.2, 5.5, 9]) drawIntroFrame(ctx, w, h, v, t, null, 0, 1);
        }
      }
    }).not.toThrow();
  });

  it('cross-dissolves every scene pair', () => {
    const ctx = stubCtx();
    expect(() => {
      for (let i = 1; i < VISUALS.length; i++) {
        for (const f of [0, 0.3, 0.7, 0.99]) drawIntroFrame(ctx, 1280, 800, VISUALS[i], f, VISUALS[i - 1], 4 + f, f);
      }
    }).not.toThrow();
  });

  it('has a hand-picked reduced-motion still for every scene', () => {
    const ctx = stubCtx();
    for (const v of VISUALS) {
      expect(REDUCED_FRAME_T[v]).toBeGreaterThan(0);
      expect(() => drawIntroFrame(ctx, 1280, 800, v, REDUCED_FRAME_T[v], null, 0, 1)).not.toThrow();
    }
  });

  it('the DESCENT transition paints across its whole dive (incl. the landing bloom)', () => {
    const ctx = stubCtx();
    expect(() => {
      for (const t of [0, 0.2, 0.5, 0.65, 0.8, 1]) drawDiveTransition(ctx, 1280, 800, t);
    }).not.toThrow();
  });
});

describe('the authored film (InitCutscene SCENES) — data contract', () => {
  it('every scene has staged copy + sound beats inside its hold, in playback order', () => {
    expect(SCENES.length).toBeGreaterThanOrEqual(5);
    for (const s of SCENES) {
      expect(VISUALS).toContain(s.visual);
      expect(s.lines.length).toBeGreaterThan(0);
      expect(s.beats.length).toBeGreaterThan(0); // the whole film is scored — no silent scene
      const dur = s.durMs === 0 ? Infinity : s.durMs / 1000; // 0 = the title waits for the player
      for (const l of s.lines) expect(l.at).toBeLessThan(dur);
      for (let i = 0; i < s.beats.length; i++) {
        expect(s.beats[i].cue.startsWith('cin_')).toBe(true);
        expect(s.beats[i].at).toBeLessThan(dur);
        if (i > 0) expect(s.beats[i].at).toBeGreaterThan(s.beats[i - 1].at); // fired in clock order
      }
    }
    expect(SCENES[SCENES.length - 1].durMs).toBe(0); // the title card never yanks itself away
  });

  it('film direction (docs/CUTSCENES.md §direction): the core copy sits OFF the core; impacts punch', () => {
    const core = SCENES.find((s) => s.visual === 'core')!;
    expect(core.copyAt ?? 'center', 'the Hive Core is the brightest light in the film — its copy must not sit on it').not.toBe('center');
    for (const s of SCENES) {
      if (s.copyAt !== undefined) expect(['center', 'upper', 'lower']).toContain(s.copyAt);
      if (s.punch !== undefined) expect(s.punch).toBeLessThanOrEqual(0.06);
    }
    expect(SCENES.reduce((n, s) => n + s.beats.filter((b) => b.impact).length, 0)).toBeGreaterThanOrEqual(SCENES.length);
  });
});

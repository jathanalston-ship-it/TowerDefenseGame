// Intro cinematics smoke (docs/GAME-FEEL.md §intro): every procedural set-piece renders
// across its full timeline — including the cross-dissolve path and the reduced-motion
// stills — against a stub 2D context, at several canvas sizes (the geometry cache rebuilds).

import { describe, expect, it } from 'vitest';
import { REDUCED_FRAME_T, drawIntroFrame } from './introScenes';
import type { IntroVisual } from './introScenes';

const VISUALS: IntroVisual[] = ['signal', 'descent', 'veins', 'core', 'title'];

function stubCtx(): CanvasRenderingContext2D {
  const proxy: unknown = new Proxy(function () { /* noop */ }, {
    get: (_t, prop) => (prop === 'canvas' ? { width: 1280, height: 800 } : proxy),
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
});

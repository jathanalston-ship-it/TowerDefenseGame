// Impact frames (render/impactFx.ts) — the boss-fall ring must never hand the canvas a negative
// radius. GameView pushes it from a sim event with performance.now() (mid-frame) but draws with
// the rAF frame timestamp (the frame's START), so on a slow frame the raw age is negative.

import { describe, expect, it } from 'vitest';
import { clearImpacts, drawImpacts, pushImpactBloom, pushImpactRing } from './impactFx';

/** A 2D-context stub that throws like Chromium does on a negative arc radius. */
function strictCtx(): CanvasRenderingContext2D {
  const noop = (): void => undefined;
  return new Proxy({}, {
    get: (_t, k) => {
      if (k === 'arc') return (_x: number, _y: number, r: number) => { if (r < 0) throw new RangeError(`The radius provided (${r}) is negative.`); };
      if (k === 'createRadialGradient') return () => ({ addColorStop: noop });
      return noop;
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
}

describe('impact frames', () => {
  it('a ring pushed LATER than the frame timestamp it is drawn with never throws (slow-frame crash)', () => {
    clearImpacts();
    pushImpactRing(100, 100, 150, '#ffd24d', 1030); // stamped mid-frame…
    pushImpactBloom(200, 200, 80, '#6effa8', 1234, 1030);
    expect(() => drawImpacts(strictCtx(), 1000)).not.toThrow(); // …drawn with the frame's 30 ms-earlier start
    expect(() => drawImpacts(strictCtx(), 1300)).not.toThrow();
    clearImpacts();
  });
});

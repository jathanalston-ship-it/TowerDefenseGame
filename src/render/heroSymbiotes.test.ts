// Hero Symbiote visuals (docs/HERO-SYMBIOTES.md §visuals). The renderer can't be pixel-asserted
// in jsdom, but the DATA contract can — and that contract IS the future-hero rule: every hero has
// a three-stage graft spec, every stage grows at least one organ, stage `at` fields match their
// row, and the composer tolerates a no-op canvas at every stage. A new hero with no symbiote
// visuals fails here (the visual half of the future-hero contract; gates are the other half).

import { describe, it, expect } from 'vitest';
import { HERO_ORDER } from '../core/config';
import { SYMBIOTE_SLOTS } from '../core/heroSymbiote';
import { HERO_SYMBIOTE_VISUALS, drawHeroSymbiotes } from './heroSymbiotes';
import type { HeroSymbioteRender } from './heroSymbiotes';
import type { HeroKind } from '../core/types';

function stubCtx(): CanvasRenderingContext2D {
  const proxy: unknown = new Proxy(function () { /* noop */ }, { get: () => proxy, set: () => true, apply: () => proxy });
  return proxy as CanvasRenderingContext2D;
}

const hero = (kind: HeroKind) => ({ kind, x: 100, y: 100 });

describe('hero symbiote visuals', () => {
  it('every shipped hero declares a three-stage graft spec (future-hero contract)', () => {
    for (const k of HERO_ORDER) {
      const spec = HERO_SYMBIOTE_VISUALS[k];
      expect(spec, `${k} has no symbiote visuals`).toBeDefined();
      expect(spec.stages.length, `${k} must declare exactly ${SYMBIOTE_SLOTS} stages`).toBe(SYMBIOTE_SLOTS);
      spec.stages.forEach((row, i) => {
        expect(row.length, `${k} stage ${i + 1} grows nothing`).toBeGreaterThan(0);
        for (const part of row) expect(part.at, `${k} stage ${i + 1} part.at mismatch`).toBe(i + 1);
      });
    }
  });

  it('the composer draws every stage (and nothing at stage 0 / downed) without throwing', () => {
    const ctx = stubCtx();
    for (const k of HERO_ORDER) {
      for (let stage = 0; stage <= SYMBIOTE_SLOTS; stage++) {
        const view: HeroSymbioteRender = { stage, fx: ['spines', 'veins', 'sacs'], resonant: stage >= SYMBIOTE_SLOTS };
        expect(() => drawHeroSymbiotes(ctx, hero(k), view, 16, 1.5, '#ff8c3d', false)).not.toThrow();
      }
      expect(() => drawHeroSymbiotes(ctx, hero(k), { stage: 3, fx: [], resonant: true }, 16, 2, '#ff8c3d', true)).not.toThrow(); // downed ⇒ muted no-op
      expect(() => drawHeroSymbiotes(ctx, hero(k), undefined, 16, 2, '#ff8c3d', false)).not.toThrow(); // fresh save ⇒ no view
    }
  });
});

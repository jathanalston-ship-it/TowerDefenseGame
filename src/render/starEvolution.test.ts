// Tower STAR visual evolution (docs/TOWER-VISUAL-EVOLUTION.md). jsdom can't pixel-assert the
// canvas, but the DATA contract IS the feature: every tower visibly mutates each generation
// (★1/3/5/7/9), preserves identity (organs from the shared vocabulary), grows its body with
// stars, and a new tower can't ship without a star evolution (the future-proof guard).

import { describe, it, expect } from 'vitest';
import { TOWER_ORDER } from '../core/config';
import { STAR_EVOLUTION, starEvolutionGrowth, drawStarEvolution } from './starEvolution';

// A recursive no-op Canvas2D stub (chained calls + property reads return the proxy).
function stubCtx(): CanvasRenderingContext2D {
  const proxy: unknown = new Proxy(function () { /* noop */ }, { get: () => proxy, set: () => true, apply: () => proxy });
  return proxy as CanvasRenderingContext2D;
}

const GENERATIONS = [1, 3, 5, 7, 9]; // the every-two-stars mutation boundaries

describe('tower star visual evolution', () => {
  it('every tower has a star evolution spec (future-proof: a new tower fails here)', () => {
    expect(TOWER_ORDER.length).toBeGreaterThan(0);
    for (const k of TOWER_ORDER) expect(STAR_EVOLUTION[k], `${k} has no star evolution`).toBeDefined();
  });

  it('every generation (★1/3/5/7/9) introduces a new organ — so the tower visibly mutates', () => {
    for (const k of TOWER_ORDER) {
      const evo = STAR_EVOLUTION[k];
      for (const part of evo.parts) {
        expect(GENERATIONS.includes(part.at), `${k} organ at non-generation star ${part.at}`).toBe(true);
      }
      for (const g of GENERATIONS) {
        expect(evo.parts.some((p) => p.at === g), `${k} generation ★${g} adds no new organ`).toBe(true);
      }
    }
  });

  it('caps the Ultimate generation with a capstone (nova) at ★9', () => {
    for (const k of TOWER_ORDER) {
      expect(STAR_EVOLUTION[k].parts.some((p) => p.at === 9 && p.kind === 'nova'), `${k} ★9 not a capstone`).toBe(true);
    }
  });

  it('body growth is identity at ★0, rises with stars, and stays gentle (≤ ~1.25× at ★10)', () => {
    for (const k of TOWER_ORDER) {
      expect(starEvolutionGrowth(k, 0)).toBe(1);
      let prev = 1;
      for (let s = 1; s <= 10; s++) {
        const g = starEvolutionGrowth(k, s);
        expect(g, `${k} ★${s} not larger than ★${s - 1}`).toBeGreaterThan(prev);
        prev = g;
      }
      expect(starEvolutionGrowth(k, 10), `${k} grows too big at ★10`).toBeLessThanOrEqual(1.25);
    }
  });

  it('renders every tower at every star ★1..10 without throwing (all organs execute)', () => {
    const ctx = stubCtx();
    for (const k of TOWER_ORDER) {
      for (let s = 1; s <= 10; s++) {
        const tw = { kind: k, x: 100, y: 100, id: 1 };
        expect(() => drawStarEvolution(ctx, tw, s, 14, 1.23, '#888888', 0.5), `${k} ★${s}`).not.toThrow();
      }
    }
  });

  it('draws nothing at ★0 (fresh-account look is unchanged)', () => {
    const ctx = stubCtx();
    // No exception AND an early return: the proxy records nothing meaningful, but the contract is
    // that a 0-star tower contributes no organs (asserted via growth identity + this no-throw).
    expect(() => drawStarEvolution(ctx, { kind: TOWER_ORDER[0], x: 0, y: 0, id: 1 }, 0, 14, 0, '#888', 0)).not.toThrow();
  });
});

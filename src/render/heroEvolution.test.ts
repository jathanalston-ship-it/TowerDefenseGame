// Hero visual evolution (docs/HERO-EVOLUTION.md §visuals). The renderer can't be pixel-asserted
// in jsdom, but the DATA contract can — and that contract IS the feature: every hero has a star
// evolution spec, every star 1..5 grows a new organ, the body swells monotonically with stars,
// and each hero's organ set is DISTINCT (identity survives). A new hero with no visuals fails here.

import { describe, it, expect } from 'vitest';
import { HERO_ORDER } from '../core/config';
import { HERO_EVOLUTION, heroEvolutionGrowth, drawHeroEvolution } from './heroEvolution';
import type { HeroKind } from '../core/types';

// A recursive no-op Canvas2D stub (chained calls + property reads return the proxy).
function stubCtx(): CanvasRenderingContext2D {
  const proxy: unknown = new Proxy(function () { /* noop */ }, { get: () => proxy, set: () => true, apply: () => proxy });
  return proxy as CanvasRenderingContext2D;
}

const hero = (kind: HeroKind) => ({ kind, x: 100, y: 100 });
const activeParts = (kind: HeroKind, stars: number): number => HERO_EVOLUTION[kind].parts.filter((p) => p.at <= stars).length;

describe('hero visual evolution', () => {
  it('every shipped hero has an evolution spec (future-proof guard)', () => {
    expect(HERO_ORDER.length).toBeGreaterThan(0);
    for (const k of HERO_ORDER) expect(HERO_EVOLUTION[k], `${k} has no visual evolution`).toBeDefined();
  });

  it('every star 1..5 introduces a NEW organ — so investment visibly mutates the hero', () => {
    for (const k of HERO_ORDER) {
      const evo = HERO_EVOLUTION[k];
      for (const part of evo.parts) expect(part.at >= 1 && part.at <= 5, `${k} part.at out of range`).toBe(true);
      for (let star = 1; star <= 5; star++) {
        expect(evo.parts.some((p) => p.at === star), `${k} ★${star} adds no new organ`).toBe(true);
      }
    }
  });

  it('body growth is identity at ★0 and rises monotonically with each star', () => {
    for (const k of HERO_ORDER) {
      expect(heroEvolutionGrowth(k, 0)).toBe(1); // ★0 = the classic silhouette (baseline)
      let prev = 1;
      for (let star = 1; star <= 5; star++) {
        const g = heroEvolutionGrowth(k, star);
        expect(g, `${k} ★${star} not larger than ★${star - 1}`).toBeGreaterThan(prev);
        prev = g;
      }
    }
  });

  it('the number of active identity organs is monotone in stars (0 at ★0)', () => {
    for (const k of HERO_ORDER) {
      expect(activeParts(k, 0)).toBe(0); // ★0 draws no organs
      for (let star = 1; star <= 5; star++) {
        expect(activeParts(k, star)).toBeGreaterThanOrEqual(activeParts(k, star - 1));
      }
      expect(activeParts(k, 5)).toBeGreaterThan(activeParts(k, 1)); // strictly more evolved by ★5
    }
  });

  it('per-hero identity DIFFERS — heroes evolve distinctly, never homogenized', () => {
    const sig = (k: HeroKind): string => HERO_EVOLUTION[k].parts.map((p) => `${p.at}:${p.kind}`).join(',');
    const sigs = HERO_ORDER.map(sig);
    expect(new Set(sigs).size).toBe(HERO_ORDER.length); // every hero's organ set is unique
    // growth knobs are per-hero too (the Overseer grows the least — presence, not mass)
    expect(HERO_EVOLUTION.overseer.growth).toBeLessThan(HERO_EVOLUTION.ravager.growth);
  });

  it('renders every hero across the star × evo grid without throwing (all organs execute)', () => {
    const ctx = stubCtx();
    for (const k of HERO_ORDER) {
      for (let star = 0; star <= 5; star++) {
        for (const evo of [0, 1, 4, 12]) {
          expect(() => drawHeroEvolution(ctx, hero(k), star, evo, 18, 1.23, '#8a93ff', false), `${k} ★${star} evo${evo}`).not.toThrow();
        }
      }
      // a downed hero is muted (skipped) — still must not throw
      expect(() => drawHeroEvolution(ctx, hero(k), 5, 8, 20, 2, '#8a93ff', true)).not.toThrow();
    }
  });
});

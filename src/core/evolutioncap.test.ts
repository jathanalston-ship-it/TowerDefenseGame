// Campaign Evolution Cap (docs/EVOLUTION-CAP.md) — Campaign progress gates how high a tower may
// evolve; Tower Shards are the fuel, Campaign is the permission.

import { describe, it, expect } from 'vitest';
import {
  EVOLUTION_CAPS,
  STAR,
  campaignStarCap,
  nextEvolutionUnlock,
  starMutationTier,
  nextStarMutationTier,
} from './config';

describe('campaignStarCap — the cap curve', () => {
  it('matches the documented breakpoints', () => {
    // (highest cleared → cap). Fresh account (0) can still reach ★2.
    const cases: Array<[number, number]> = [
      [0, 2], [1, 2], [9, 2], [10, 3], [24, 3], [25, 4], [49, 4], [50, 5], [79, 5],
      [80, 6], [119, 6], [120, 7], [169, 7], [170, 8], [229, 8], [230, 9], [299, 9], [300, 10], [9999, 10],
    ];
    for (const [cleared, cap] of cases) expect(campaignStarCap(cleared)).toBe(cap);
  });

  it('is monotonic non-decreasing in stage and never exceeds the absolute cap', () => {
    let prev = 0;
    for (let s = 0; s <= 350; s++) {
      const cap = campaignStarCap(s);
      expect(cap).toBeGreaterThanOrEqual(prev);
      expect(cap).toBeLessThanOrEqual(STAR.maxTowerStars);
      prev = cap;
    }
    expect(prev).toBe(STAR.maxTowerStars); // reaches ★10 by stage 300
  });

  it('the final EVOLUTION_CAPS row defines the absolute cap (= STAR.maxTowerStars)', () => {
    expect(EVOLUTION_CAPS[EVOLUTION_CAPS.length - 1].maxStar).toBe(STAR.maxTowerStars);
  });
});

describe('nextEvolutionUnlock — what to work toward', () => {
  it('points at the stage that lifts the cap above the current star', () => {
    expect(nextEvolutionUnlock(2)).toEqual({ stage: 10, maxStar: 3 });
    expect(nextEvolutionUnlock(4)).toEqual({ stage: 50, maxStar: 5 });
    expect(nextEvolutionUnlock(9)).toEqual({ stage: 300, maxStar: 10 });
  });

  it('is null at the absolute cap', () => {
    expect(nextEvolutionUnlock(10)).toBeNull();
  });
});

describe('star mutation generations (shared visual taxonomy)', () => {
  it('reports the current generation every two stars', () => {
    expect(starMutationTier(0).name).toBe('Base Organism');
    expect(starMutationTier(2).name).toBe('Base Organism');
    expect(starMutationTier(3).name).toBe('Minor Mutation');
    expect(starMutationTier(5).name).toBe('Large Mutation');
    expect(starMutationTier(7).name).toBe('Advanced Mutation');
    expect(starMutationTier(9).name).toBe('Ultimate Organism');
    expect(starMutationTier(10).name).toBe('Ultimate Organism');
  });

  it('previews the next generation, null once Ultimate', () => {
    // The locked-star UI only previews at stars ≥ 2 (the first cap-lock), where Base is behind us.
    expect(nextStarMutationTier(2)?.name).toBe('Minor Mutation');
    expect(nextStarMutationTier(4)?.name).toBe('Large Mutation');
    expect(nextStarMutationTier(6)?.name).toBe('Advanced Mutation');
    expect(nextStarMutationTier(9)).toBeNull();
  });
});

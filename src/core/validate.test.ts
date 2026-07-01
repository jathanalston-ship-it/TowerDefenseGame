import { describe, it, expect } from 'vitest';
import { validateContent } from './validate';
import type { ContentRegistries } from './validate';

describe('validateContent', () => {
  it('passes for the shipped content', () => {
    expect(validateContent()).toEqual([]);
  });

  it('flags degenerate content', () => {
    const reg: ContentRegistries = {
      enemies: [
        {
          kind: 'runner', name: 'X', hp: 0, armor: 0, speed: 0, bounty: 1, damage: 1, radius: 0, color: '#fff',
          behavior: { seek: 1, avoidTowers: 0, avoidHero: 0, separation: 0, jitter: 0 },
        },
      ],
      towers: [],
      waves: [[]],
      cards: [{ id: 'x', name: 'X', rarity: 'common', category: 'tower', description: '', effects: [] }],
      upgrades: [
        { id: 'u', name: 'U', description: '', category: 'Combat', maxLevel: 0, baseCost: 0, costMult: 0.5, effect: { stat: 'towerDamageMult', perLevel: 1 } },
      ],
    };
    const problems = validateContent(reg);
    expect(problems.some((p) => /hp must be/.test(p))).toBe(true);
    expect(problems.some((p) => /no spawn groups/.test(p))).toBe(true);
    expect(problems.some((p) => /has no effects/.test(p))).toBe(true);
    expect(problems.some((p) => /maxLevel must be/.test(p))).toBe(true);
  });
});

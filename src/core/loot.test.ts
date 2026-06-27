import { describe, it, expect } from 'vitest';
import {
  RARITIES,
  rarityRegistry,
  rollRarity,
  lootPool,
  costOf,
  rarityRank,
  emptyPity,
  updatePity,
  pityRemaining,
} from './loot';
import type { PityState } from './loot';

/** Seeded PRNG so the statistical test is reproducible (never flakes). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An rng value landing squarely in `id`'s weight band — DERIVED from the registry's own
 * weights, so a passing test proves selection is weight-driven (no hardcoded odds). */
function rngForTier(id: string, events: string[] = []): number {
  const pool = lootPool(events);
  const total = pool.reduce((s, d) => s + d.weight, 0);
  let acc = 0;
  for (const d of pool) {
    if (d.id === id) return (acc + d.weight / 2) / total;
    acc += d.weight;
  }
  return 0.999999;
}

describe('rarity framework', () => {
  it('registers the six core rarities in ascending rank', () => {
    expect(rarityRegistry.ids()).toEqual(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']);
    expect(rarityRank('common')).toBe(0);
    expect(rarityRank('mythic')).toBe(5);
  });

  it('passes its own validators', () => {
    expect(rarityRegistry.validate()).toEqual([]);
  });

  it('reward tables + cost escalate with rarity', () => {
    const common = rarityRegistry.require('common');
    const mythic = rarityRegistry.require('mythic');
    expect(mythic.reward.rolls).toBeGreaterThan(common.reward.rolls);
    expect(mythic.reward.towerShardRange[1]).toBeGreaterThan(common.reward.towerShardRange[1]);
    expect(mythic.cost).toBeGreaterThan(common.cost);
  });
});

describe('rollRarity (weight-driven, no hardcoded probabilities)', () => {
  it('returns the tier whose band the draw falls in — bands derived from weights', () => {
    for (const d of RARITIES) {
      expect(rollRarity(() => rngForTier(d.id))).toBe(d.id);
    }
  });

  it('draw of 0 yields the first tier, ~1 yields the last', () => {
    expect(rollRarity(() => 0)).toBe('common');
    expect(rollRarity(() => 0.999999)).toBe('mythic');
  });

  it('selection frequency follows the weight ordering (odds live in data)', () => {
    const rng = mulberry32(12345);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 60000; i++) {
      const r = rollRarity(rng);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    const order = lootPool().map((d) => d.id); // descending weight
    for (let i = 1; i < order.length; i++) {
      expect(counts[order[i - 1]] ?? 0).toBeGreaterThan(counts[order[i]] ?? 0);
    }
  });
});

describe('pity', () => {
  it('emptyPity tracks only tiers that declare a ceiling', () => {
    expect(Object.keys(emptyPity()).sort()).toEqual(['epic', 'legendary', 'mythic']);
  });

  it('forces a tier once its ceiling is met, overriding the weighted draw', () => {
    const pity: PityState = { ...emptyPity(), epic: rarityRegistry.require('epic').pity! };
    expect(rollRarity(() => 0, { pity })).toBe('epic'); // 0 would be common without pity
  });

  it('forces the HIGHEST due tier when several ceilings are met', () => {
    const pity: PityState = {
      epic: rarityRegistry.require('epic').pity!,
      legendary: rarityRegistry.require('legendary').pity!,
      mythic: 0,
    };
    expect(rollRarity(() => 0, { pity })).toBe('legendary');
  });

  it('opening a box resets pity at/below its rank, increments above', () => {
    const start: PityState = { epic: 5, legendary: 5, mythic: 5 };
    expect(updatePity(start, 'rare')).toEqual({ epic: 6, legendary: 6, mythic: 6 }); // rare < all
    expect(updatePity(start, 'legendary')).toEqual({ epic: 0, legendary: 0, mythic: 6 });
  });

  it('pityRemaining counts down to the guarantee (Infinity when no ceiling)', () => {
    expect(pityRemaining(emptyPity(), 'epic')).toBe(rarityRegistry.require('epic').pity);
    expect(pityRemaining(emptyPity(), 'common')).toBe(Infinity);
  });
});

describe('event-exclusive tiers (future-proofing)', () => {
  it('sit out of the normal pool until an event opts them in', () => {
    rarityRegistry.register({
      id: 'eventTest',
      name: 'Event Cache',
      color: 'var(--r-mythic)',
      weight: 50,
      cost: 500,
      reward: { rolls: 4, towerShardRange: [5, 9], heroShardChance: 0.3, heroShardRange: [1, 2] },
      eventOnly: true,
    });
    expect(lootPool().some((d) => d.id === 'eventTest')).toBe(false);
    expect(lootPool(['eventTest']).some((d) => d.id === 'eventTest')).toBe(true);
    // and it can actually be rolled once enabled
    expect(rollRarity(() => rngForTier('eventTest', ['eventTest']), { events: ['eventTest'] })).toBe('eventTest');
  });
});

describe('costOf', () => {
  it('returns the rarity cost, falling back for unknown ids', () => {
    expect(costOf('epic')).toBe(rarityRegistry.require('epic').cost);
    expect(costOf('nope')).toBe(RARITIES[0].cost);
  });
});

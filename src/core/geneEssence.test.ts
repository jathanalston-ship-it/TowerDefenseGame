// Gene Essence economy — the duplicate-conversion formulas (docs/GENE-EVOLUTION.md §Economy).
// Balancing-critical + deterministic, so it's pinned here; the openContainer wiring is exercised
// by the Task 12 audit smoke.

import { describe, it, expect } from 'vitest';
import { ESSENCE_PER_SHARD, essencePerShard, essenceForDuplicates } from './geneEssence';

// Loot/container rarity ladder (LootRarity) — what a Bio-Container's topRarity actually is.
const LOOT_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;

describe('gene essence — duplicate conversion rates', () => {
  it('rate rises STRICTLY with rarity (common trickles, legendary pays out big)', () => {
    let prev = 0;
    for (const r of LOOT_RARITIES) {
      const rate = essencePerShard(r);
      expect(rate).toBeGreaterThan(prev);
      prev = rate;
    }
    expect(essencePerShard('legendary')).toBeGreaterThanOrEqual(essencePerShard('common') * 5);
  });

  it('matches the spec examples: +5 (Common Tower), +45 (Legendary Hero) for 5 duplicate shards', () => {
    expect(essenceForDuplicates('common', 5)).toBe(5); // 5 × 1
    expect(essenceForDuplicates('legendary', 5)).toBe(45); // 5 × 9
  });

  it('is linear in the shard count and floors partial/negative inputs to 0', () => {
    expect(essenceForDuplicates('rare', 4)).toBe(4 * ESSENCE_PER_SHARD.rare);
    expect(essenceForDuplicates('epic', 0)).toBe(0);
    expect(essenceForDuplicates('common', -3)).toBe(0);
    expect(essenceForDuplicates('common', 2.9)).toBe(2 * ESSENCE_PER_SHARD.common); // floored
  });

  it('falls back to the common rate for an unknown rarity id (never NaN)', () => {
    expect(essencePerShard('???')).toBe(ESSENCE_PER_SHARD.common);
    expect(Number.isFinite(essenceForDuplicates('???', 10))).toBe(true);
  });
});

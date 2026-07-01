// Gene Essence economy — the duplicate-conversion formulas (docs/GENE-EVOLUTION.md §Economy).
// Balancing-critical + deterministic, so it's pinned here; the openContainer wiring is exercised
// by the Task 12 audit smoke.

import { describe, it, expect } from 'vitest';
import {
  ESSENCE_DROP, ESSENCE_PER_SHARD, essenceForDuplicates, essencePerShard, essenceRarityTier,
  essenceUpgradeCost, rollEssenceDrop,
} from './geneEssence';

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

  it("pays the cache ladder's exotic tier its true rate (between legendary and mythic)", () => {
    expect(essencePerShard('exotic')).toBeGreaterThan(essencePerShard('legendary'));
    expect(essencePerShard('exotic')).toBeLessThan(essencePerShard('mythic'));
  });
});

/** A scripted rng: yields queued values in order, then holds the last. */
function seq(...vals: number[]): () => number {
  let i = 0;
  return () => (i < vals.length ? vals[i++] : (vals[vals.length - 1] ?? 0.5));
}

describe('gene essence — bonus container drop (Task 3)', () => {
  const base = { power: 0, campaignStage: 0 };

  it('misses on a high roll (very low base chance) and never exceeds the chance cap', () => {
    expect(rollEssenceDrop({ ...base, containerRarity: 'common', rng: seq(0.99) })).toBe(0);
    // Even an absurd account can't push the chance past the cap: a roll AT the cap still misses.
    expect(rollEssenceDrop({ containerRarity: 'mythic', power: 1e9, campaignStage: 1e6, rng: seq(ESSENCE_DROP.chanceCap) })).toBe(0);
  });

  it('drops SMALL quantities at baseline (1–2)', () => {
    const amt = rollEssenceDrop({ ...base, containerRarity: 'common', rng: seq(0, 0) });
    expect(amt).toBeGreaterThanOrEqual(1);
    expect(amt).toBeLessThanOrEqual(2);
  });

  it('scales with container rarity and slightly with campaign + power, capped', () => {
    const common = rollEssenceDrop({ ...base, containerRarity: 'common', rng: seq(0, 0) });
    const mythic = rollEssenceDrop({ ...base, containerRarity: 'mythic', rng: seq(0, 0) });
    expect(mythic).toBeGreaterThan(common);
    const late = rollEssenceDrop({ containerRarity: 'mythic', power: 20000, campaignStage: 120, rng: seq(0, 0) });
    expect(late).toBeGreaterThan(mythic);
    expect(late).toBeLessThanOrEqual(ESSENCE_DROP.amountCap);
  });

  it('unifies both rarity ladders into one tier scale (exotic ≈ mythic tier)', () => {
    expect(essenceRarityTier('exotic')).toBe(essenceRarityTier('mythic'));
    expect(essenceRarityTier('uncommon')).toBeGreaterThan(essenceRarityTier('common'));
    expect(essenceRarityTier('???')).toBe(0);
  });
});

describe('gene essence — upgrade cost curve (the sink)', () => {
  it('rises with card rarity and grows geometrically per level', () => {
    expect(essenceUpgradeCost('legendary', 1)).toBeGreaterThan(essenceUpgradeCost('common', 1));
    const l1 = essenceUpgradeCost('rare', 1);
    const l2 = essenceUpgradeCost('rare', 2);
    const l3 = essenceUpgradeCost('rare', 3);
    expect(l2 / l1).toBeCloseTo(l3 / l2, 1); // geometric growth
    expect(essenceUpgradeCost('???', 1)).toBe(essenceUpgradeCost('common', 1)); // unknown → common
  });
});

import { describe, it, expect } from 'vitest';
import { ASCENDANT_NODES, ascendantBonuses, ascendantCost, nextAscendantCost, ascendantRegistry } from './ascendant';

describe('ascendant tree nodes', () => {
  it('pass their validators', () => {
    expect(ascendantRegistry.validate()).toEqual([]);
  });

  it('no nodes ⇒ every bonus is ×1 (golden-safe)', () => {
    const b = ascendantBonuses({});
    for (const v of Object.values(b)) expect(v).toBe(1); // every lever bases at ×1 (no nodes bought)
  });

  it('folds a node level into its declared stat (additive per level)', () => {
    expect(ascendantBonuses({ greed: 2 }).shardGainMult).toBeCloseTo(1 + 0.15 * 2, 10);
    expect(ascendantBonuses({ resonance: 3 }).cellGainMult).toBeCloseTo(1 + 0.1 * 3, 10);
    // new deeper levers fold the same way
    expect(ascendantBonuses({ potency: 4 }).damageMult).toBeCloseTo(1 + 0.05 * 4, 10);
    expect(ascendantBonuses({ scholar: 2 }).masteryXpMult).toBeCloseTo(1 + 0.12 * 2, 10);
    // unrelated stats stay ×1
    expect(ascendantBonuses({ greed: 2 }).biomassMult).toBe(1);
  });

  it('prices steps geometrically; nextAscendantCost is null when maxed', () => {
    const def = ASCENDANT_NODES.find((n) => n.id === 'greed')!;
    expect(ascendantCost(def, 0)).toBe(def.baseCost);
    expect(ascendantCost(def, 2)).toBe(Math.ceil(def.baseCost * def.costMult ** 2));
    expect(nextAscendantCost(def, def.maxLevel)).toBeNull();
  });
});

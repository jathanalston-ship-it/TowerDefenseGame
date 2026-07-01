import { describe, it, expect } from 'vitest';
import { catchupFactor, dupeWeights, expectedPower, lootBias, PROG_LOOT, rarityBias } from './progressionLoot';
import { rollRarity, rarityRegistry } from './loot';

describe('catch-up curve', () => {
  it('expected power rises with progress (campaign stage / half-wave)', () => {
    expect(expectedPower(0, 0)).toBeCloseTo(PROG_LOOT.expectBase, 9);
    expect(expectedPower(40, 0)).toBeGreaterThan(expectedPower(10, 0));
    expect(expectedPower(0, 80)).toBeGreaterThan(expectedPower(0, 0)); // best wave also drives it
  });

  it('is 1 on par, boosts when behind, normalizes when ahead — all clamped', () => {
    expect(catchupFactor(1, 1)).toBeCloseTo(1, 9); // on par ⇒ no steering
    expect(catchupFactor(1.5, 1)).toBeGreaterThan(1); // behind ⇒ boost
    expect(catchupFactor(1, 2)).toBeLessThan(1); // ahead ⇒ normalize down
    expect(catchupFactor(99, 1)).toBeLessThanOrEqual(PROG_LOOT.catchupCap + 1e-9); // bounded
    expect(catchupFactor(1, 99)).toBeGreaterThanOrEqual(PROG_LOOT.catchupFloor - 1e-9);
  });

  it('difficulty tilts the factor richer', () => {
    expect(catchupFactor(1, 1, 2)).toBeGreaterThan(catchupFactor(1, 1, 0));
  });
});

describe('rarityBias', () => {
  const ids = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  it('factor 1 is a true no-op (every multiplier is 1)', () => {
    const b = rarityBias(ids, 1);
    for (const id of ids) expect(b[id]).toBeCloseTo(1, 9);
  });

  it('behind shifts weight UP the tiers; ahead shifts it toward commons', () => {
    const behind = rarityBias(ids, 1.4);
    expect(behind.common).toBeLessThan(1);
    expect(behind.legendary).toBeGreaterThan(behind.common);
    expect(behind.legendary).toBeGreaterThan(1);

    const ahead = rarityBias(ids, 0.9);
    expect(ahead.common).toBeGreaterThan(1);
    expect(ahead.legendary).toBeLessThan(1);
  });
});

describe('lootBias — golden safety', () => {
  it('a fresh/on-par account produces an all-ones (no-op) bias', () => {
    const b = lootBias({ idsAscending: ['common', 'rare', 'epic'], campaignStage: 0, bestWave: 0, actualPowerMult: 1 });
    for (const id of ['common', 'rare', 'epic']) expect(b[id]).toBeCloseTo(1, 9);
  });

  it('a behind account (deep progress, weak power) biases toward higher tiers', () => {
    const b = lootBias({ idsAscending: ['common', 'rare', 'epic'], campaignStage: 40, bestWave: 0, actualPowerMult: 1 });
    expect(b.epic).toBeGreaterThan(b.common);
  });
});

describe('duplicate protection', () => {
  it('pick weight shrinks with ownership; un-owned is favored', () => {
    const [w0, w1, w3] = dupeWeights([0, 1, 3]);
    expect(w0).toBe(1);
    expect(w1).toBeLessThan(w0);
    expect(w3).toBeLessThan(w1);
  });
});

describe('rollRarity honors bias (loot.ts integration)', () => {
  it('a zero bias on a tier removes it from the outcome; absent bias keeps it', () => {
    const common = rarityRegistry.ids()[0];
    let baselineHitCommon = false;
    let biasedHitCommon = false;
    const rng = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
    for (let i = 0; i < 400; i++) {
      if (rollRarity(rng) === common) baselineHitCommon = true;
      if (rollRarity(rng, { bias: { [common]: 0 } }) === common) biasedHitCommon = true;
    }
    expect(baselineHitCommon).toBe(true); // common is the heaviest tier — it shows up unbiased
    expect(biasedHitCommon).toBe(false); // …and never when its weight is biased to 0
  });
});

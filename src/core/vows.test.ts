// MOLT VOWS (docs/VOWS.md): the vow book is valid data, the arm-cost curve is geometric,
// and the warp COMPOSITION algebra is exact — vows multiply the doctrine, never replace it,
// and the none-armed path is a REFERENTIAL no-op (the golden invariant).

import { describe, expect, it } from 'vitest';
import {
  MAX_VOWS, VOWS, VOW_COST, combinedVowWarp, composeWarps, vowArmCost, vowById, vowProblems, vowYieldProduct,
} from './vows';
import { DOCTRINES } from './doctrines';

describe('the vow book — data contract', () => {
  it('every vow is valid, unique, and a REAL handicap with a wager in the band', () => {
    expect(VOWS.length).toBeGreaterThanOrEqual(4); // a real menu, not a binary choice
    const ids = new Set<string>();
    for (const v of VOWS) {
      expect(ids.has(v.id), `duplicate ${v.id}`).toBe(false);
      ids.add(v.id);
      expect(vowProblems(v), v.id).toEqual([]);
      expect(v.cellYieldMult).toBeGreaterThanOrEqual(1.3);
      expect(v.cellYieldMult).toBeLessThanOrEqual(1.6);
    }
    expect(vowById('vow_flesh')?.warp.hpMult).toBe(1.25);
    expect(vowById('nope')).toBeUndefined();
  });

  it('the validator actually rejects non-handicaps and out-of-band wagers', () => {
    expect(vowProblems({ id: 'vow_bad', name: 'x', icon: 'x', blurb: 'x', warp: {}, cellYieldMult: 1.3 })).not.toEqual([]);
    expect(vowProblems({ id: 'vow_easy', name: 'x', icon: 'x', blurb: 'x', warp: { hpMult: 0.8 }, cellYieldMult: 1.3 })).not.toEqual([]); // a BUFF is not a vow
    expect(vowProblems({ id: 'vow_greed', name: 'x', icon: 'x', blurb: 'x', warp: { hpMult: 1.2 }, cellYieldMult: 5 })).not.toEqual([]);
  });
});

describe('arm-cost curve — the geometric sink', () => {
  it('1st cheap, 3rd expensive: exact geometric growth', () => {
    expect(vowArmCost(0)).toBe(VOW_COST.base);
    expect(vowArmCost(1)).toBe(VOW_COST.base * VOW_COST.growth);
    expect(vowArmCost(2)).toBe(VOW_COST.base * VOW_COST.growth * VOW_COST.growth);
    expect(vowArmCost(1) / vowArmCost(0)).toBe(VOW_COST.growth);
    expect(vowArmCost(2) / vowArmCost(1)).toBe(VOW_COST.growth);
  });
});

describe('composeWarps — vows RIDE the doctrine (multiply, never replace)', () => {
  it('none-armed is a REFERENTIAL no-op: the doctrine warp passes through untouched', () => {
    const doctrineWarp = { hpMult: 1.6, countMult: 1.15 };
    expect(composeWarps(doctrineWarp, undefined)).toBe(doctrineWarp); // same object
    expect(composeWarps(doctrineWarp, {})).toBe(doctrineWarp);
    expect(composeWarps(undefined, undefined)).toBeUndefined();
    expect(combinedVowWarp([])).toBeUndefined();
    expect(combinedVowWarp(undefined)).toBeUndefined();
  });

  it('multiplicative axes multiply, additive axes add, absent keys STAY absent', () => {
    const composed = composeWarps({ hpMult: 1.6, eliteChance: 0.12 }, { hpMult: 1.25, speedMult: 1.15, eliteChance: 0.1 })!;
    expect(composed.hpMult).toBeCloseTo(2.0, 10); // 1.6 × 1.25
    expect(composed.speedMult).toBeCloseTo(1.15, 10); // one-sided carries through
    expect(composed.eliteChance).toBeCloseTo(0.22, 10); // chances ADD
    expect(composed.countMult).toBeUndefined(); // never materialize a ×1 (presence-gated consumers)
    expect(composed.bountyMult).toBeUndefined();
  });

  it('composes with a REAL protocol doctrine — every shared axis is the product', () => {
    const doctrine = Object.values(DOCTRINES).find((d) => d.warp?.hpMult && d.warp.hpMult > 1)!; // any hp-warping protocol
    const armed = combinedVowWarp(['vow_flesh', 'vow_famine'])!; // hp ×1.25 + bounty ×0.8
    const composed = composeWarps(doctrine.warp, armed)!;
    expect(composed.hpMult).toBeCloseTo(doctrine.warp!.hpMult! * 1.25, 10);
    expect(composed.bountyMult).toBeCloseTo((doctrine.warp!.bountyMult ?? 1) * 0.8, 10);
  });

  it('combinedVowWarp folds the whole armed set and ignores unknown ids', () => {
    const w = combinedVowWarp(['vow_flesh', 'vow_apex', 'not_a_vow'])!;
    expect(w.hpMult).toBeCloseTo(1.25 * 1.1, 10);
    expect(w.eliteChance).toBeCloseTo(0.1, 10);
  });
});

describe('vowYieldProduct — the wager math', () => {
  it('×1 with none armed; multiplies across the set; caps at MAX_VOWS by policy elsewhere', () => {
    expect(vowYieldProduct([])).toBe(1);
    expect(vowYieldProduct(undefined)).toBe(1);
    expect(vowYieldProduct(['vow_flesh'])).toBeCloseTo(1.35, 10);
    expect(vowYieldProduct(['vow_flesh', 'vow_apex'])).toBeCloseTo(1.35 * 1.6, 10);
    expect(MAX_VOWS).toBe(3);
  });
});

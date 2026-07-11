// HIVE CONSTRUCTION core (docs/HIVE-CONSTRUCTION.md): the organ book is valid data, costs are
// factor-traced geometric, the per-kind drain plan is deterministic + richest-first, and the
// fixture/glow derives are pure functions of the built ledger.

import { describe, expect, it } from 'vitest';
import {
  HIVE_ORGANS, HIVE_TIER_FACTOR, drainPlan, explainCost, hiveCost, hiveFixtures, hiveGlow,
  hiveOrganById, hiveOrganProblems,
} from './hiveOrgans';

describe('the organ book — data contract', () => {
  it('8–12 organs across all four eras, several ×3-tiered, every row valid', () => {
    expect(HIVE_ORGANS.length).toBeGreaterThanOrEqual(8);
    expect(HIVE_ORGANS.length).toBeLessThanOrEqual(12);
    const ids = new Set<string>();
    for (const o of HIVE_ORGANS) {
      expect(ids.has(o.id), `duplicate ${o.id}`).toBe(false);
      ids.add(o.id);
      expect(hiveOrganProblems(o), o.id).toEqual([]);
    }
    for (const era of [0, 1, 2, 3] as const) expect(HIVE_ORGANS.some((o) => o.era === era), `era ${era} has organs`).toBe(true);
    expect(HIVE_ORGANS.filter((o) => o.tiers === 3).length).toBeGreaterThanOrEqual(3); // several tiered
    // fixture ids are globally unique (each is one CSS layer)
    const fx = HIVE_ORGANS.flatMap((o) => o.fixtures.flat());
    expect(new Set(fx).size).toBe(fx.length);
  });

  it('the validator rejects single-currency recipes and malformed fixture ids', () => {
    expect(hiveOrganProblems({ id: 'x', name: 'x', icon: 'x', blurb: 'x', perk: 'x', era: 0, tiers: 1, recipe: { cores: 100 }, fixtures: [['hv-x']] })).not.toEqual([]);
    expect(hiveOrganProblems({ id: 'x', name: 'x', icon: 'x', blurb: 'x', perk: 'x', era: 0, tiers: 1, recipe: { cores: 100, scrap: 2 }, fixtures: [['BadId']] })).not.toEqual([]);
  });
});

describe('costs — factor-traced geometric (economyDirector discipline)', () => {
  it('tier n = base × 3^(n-1), traced on every line', () => {
    const forge = hiveOrganById('marrow_forge')!;
    const t1 = hiveCost(forge, 1);
    const t3 = hiveCost(forge, 3);
    expect(t1.every((l) => l.tierFactor === 1 && l.amount === l.base)).toBe(true);
    for (const l3 of t3) {
      const l1 = t1.find((l) => l.key === l3.key)!;
      expect(l3.tierFactor).toBe(HIVE_TIER_FACTOR * HIVE_TIER_FACTOR);
      expect(l3.amount).toBe(l1.base * 9);
    }
    expect(explainCost(t3[0])).toContain('× 9'); // the trace is human-readable
  });
});

describe('drainPlan — per-kind wallets drain richest-first, deterministically', () => {
  const order = ['a', 'b', 'c', 'd'] as const;
  it('takes from the richest stacks first; roster order breaks ties; exact totals', () => {
    const plan = drainPlan({ a: 5, b: 20, c: 10, d: 20 }, order, 30)!;
    expect(plan).toEqual([{ kind: 'b', take: 20 }, { kind: 'd', take: 10 }]); // b before d (tie → roster order), c untouched
    expect(plan.reduce((s, p) => s + p.take, 0)).toBe(30);
  });
  it('refuses when the stacks cannot cover; zero total is an empty plan', () => {
    expect(drainPlan({ a: 1, b: 2, c: 0, d: 0 }, order, 10)).toBeNull();
    expect(drainPlan({ a: 1, b: 2, c: 0, d: 0 }, order, 0)).toEqual([]);
  });
});

describe('fixture + glow derives — pure functions of the built ledger', () => {
  it('an empty ledger contributes NOTHING (the passive lab is untouched)', () => {
    expect(hiveFixtures({})).toEqual([]);
    expect(hiveGlow({})).toBe(0);
  });
  it('tiers layer ADDITIVELY; unknown ids and over-cap tiers are ignored', () => {
    expect(hiveFixtures({ spore_garden: 2 })).toEqual(['hv-spores1', 'hv-spores2']);
    expect(hiveFixtures({ spore_garden: 99, nonsense: 3 })).toEqual(['hv-spores1', 'hv-spores2', 'hv-spores3']);
    expect(hiveGlow({ spore_garden: 3, lumen_polyps: 1 })).toBeCloseTo(0.08, 10);
    expect(hiveGlow({ spore_garden: 99 })).toBeCloseTo(0.06, 10); // clamped to the def's tiers
  });
});

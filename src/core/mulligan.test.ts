// Mulligan framework (docs/MULLIGANS.md) — pins the DATA integrity of the 30-modifier catalog, the
// resolver's "no partial activation" gate (the golden-safety contract), rarity+level scaling, the
// separately-scored Power heuristic, the procedural StatProfile aggregation, and the upgrade economy.

import { describe, it, expect } from 'vitest';
import {
  MULLIGAN_AXES, MULLIGAN_RARITY, MULLIGAN_RARITY_ORDER, MULLIGAN_SLOTS,
  ascendCost, assembleMulligan, dominantAxis, effectiveStats, emptyMulligan, identityMulligan,
  isMulliganActive, levelCap, makeSlot, modifiersByCategory, mulliganPower, mulliganRegistry,
  resolveMulligan, rollRarity, seedFor, upgradeCost,
} from './mulligan';
import type { MulliganState } from './mulligan';

describe('catalog', () => {
  it('registers 30 modifiers — 10 offensive · 10 utility · 10 biological — and all validate', () => {
    expect(mulliganRegistry.size).toBe(30);
    expect(mulliganRegistry.validate()).toEqual([]);
    expect(modifiersByCategory('offensive').length).toBe(10);
    expect(modifiersByCategory('utility').length).toBe(10);
    expect(modifiersByCategory('biological').length).toBe(10);
  });
  it('every modifier declares an influence over KNOWN axes and a positive Power weight', () => {
    for (const m of mulliganRegistry.all()) {
      expect(Object.keys(m.influence).length, m.id).toBeGreaterThan(0);
      for (const a of Object.keys(m.influence)) expect(MULLIGAN_AXES).toContain(a);
      expect(m.powerWeight, m.id).toBeGreaterThan(0);
    }
  });
});

describe('resolveMulligan — the no-partial-activation gate (golden-safety)', () => {
  it('is IDENTITY for empty / partial / unknown loadouts (zero sim + Power effect)', () => {
    const id = identityMulligan();
    for (const st of [undefined, emptyMulligan(), { slots: [makeSlot('bone_spike', 'common'), null, null], visualSeed: 0, animSeed: 0 } as MulliganState]) {
      const r = resolveMulligan(st);
      expect(r.active).toBe(false);
      expect(r).toEqual(id);
    }
    // an unknown id in a slot also fails activation
    const bad: MulliganState = { slots: [makeSlot('bone_spike', 'common'), makeSlot('acid_gland', 'common'), { id: 'nope', rarity: 'common', level: 1 }], visualSeed: 1, animSeed: 2 };
    expect(isMulliganActive(bad)).toBe(false);
    expect(resolveMulligan(bad).active).toBe(false);
  });
  it('ACTIVATES only when all three slots are filled — folding stat mults and Power', () => {
    const st = assembleMulligan(['bone_spike', 'siege_carapace', 'rapid_synapse'], 'common', 1);
    const r = resolveMulligan(st);
    expect(r.active).toBe(true);
    expect(r.damageMult).toBeGreaterThan(1); // bone_spike + siege_carapace
    expect(r.fireRateMult).toBeGreaterThan(1); // rapid_synapse
    expect(r.projectileMutators).toContain('pierce1'); // bone_spike
    expect(r.power).toBeGreaterThan(1);
  });
});

describe('rarity + level scaling (monotonic)', () => {
  const triple: [string, string, string] = ['crystalline_core', 'siege_carapace', 'overload_ganglion'];
  it('higher rarity ⇒ strictly more Power and damage', () => {
    let prevPow = 0;
    let prevDmg = 0;
    for (const rar of MULLIGAN_RARITY_ORDER) {
      const r = resolveMulligan(assembleMulligan(triple, rar, 1));
      expect(r.power).toBeGreaterThan(prevPow);
      expect(r.damageMult).toBeGreaterThan(prevDmg);
      prevPow = r.power;
      prevDmg = r.damageMult;
    }
  });
  it('higher level ⇒ strictly more Power and damage (within a rarity)', () => {
    const lo = resolveMulligan(assembleMulligan(triple, 'epic', 1));
    const hi = resolveMulligan(assembleMulligan(triple, 'epic', 10));
    expect(hi.power).toBeGreaterThan(lo.power);
    expect(hi.damageMult).toBeGreaterThan(lo.damageMult);
  });
  it('effectiveStats scales a delta up with rarity + level', () => {
    const base = effectiveStats({ id: 'siege_carapace', rarity: 'common', level: 1 }).damageMult!;
    const up = effectiveStats({ id: 'siege_carapace', rarity: 'legendary', level: 10 }).damageMult!;
    expect(up).toBeGreaterThan(base);
  });
});

describe('StatProfile — mixing vs stacking produce different organisms', () => {
  it('a pierce stack is pierce-dominant; a mixed triple spreads across axes', () => {
    const stack = resolveMulligan(assembleMulligan(['bone_spike', 'bone_spike', 'bone_spike'], 'rare', 1));
    expect(dominantAxis(stack.profile)).toBe('pierce');
    const mixed = resolveMulligan(assembleMulligan(['bone_spike', 'green_vein', 'symbiotic_pod'], 'rare', 1));
    const nonzero = MULLIGAN_AXES.filter((a) => mixed.profile[a] > 0);
    expect(nonzero.length).toBeGreaterThan(2); // pierce + poison + support + spillover
  });
  it('seedFor is deterministic and composition-sensitive', () => {
    const a = seedFor('needle', assembleMulligan(['bone_spike', 'green_vein', 'symbiotic_pod'], 'rare', 1).slots);
    const b = seedFor('needle', assembleMulligan(['bone_spike', 'green_vein', 'symbiotic_pod'], 'rare', 1).slots);
    const c = seedFor('needle', assembleMulligan(['bone_spike', 'green_vein', 'siege_carapace'], 'rare', 1).slots);
    expect(a).toEqual(b); // same triple ⇒ same organism
    expect(a.visualSeed).not.toBe(c.visualSeed); // different triple ⇒ different organism
  });
});

describe('upgrade economy', () => {
  it('level caps rise with rarity and never exceed MULLIGAN_MAX_LEVEL', () => {
    let prev = 0;
    for (const rar of MULLIGAN_RARITY_ORDER) {
      const cap = levelCap(rar);
      expect(cap).toBeGreaterThanOrEqual(prev);
      expect(cap).toBeLessThanOrEqual(20);
      prev = cap;
    }
  });
  it('upgrade cost rises with level; ascend cost rises with rarity; Ascendant cannot ascend', () => {
    expect(upgradeCost('rare', 5)).toBeGreaterThan(upgradeCost('rare', 1));
    expect(ascendCost('epic')!).toBeGreaterThan(ascendCost('common')!);
    expect(ascendCost('ascendant')).toBeNull();
  });
  it('makeSlot clamps level to the rarity cap and rejects unknown ids', () => {
    expect(makeSlot('bone_spike', 'common', 999)!.level).toBe(levelCap('common'));
    expect(makeSlot('nope', 'common', 1)).toBeNull();
  });
});

describe('loot roll', () => {
  it('rollRarity returns valid tiers and skews low at roll≈0, high at roll≈1', () => {
    expect(rollRarity(0)).toBe('common');
    for (let i = 0; i < 50; i++) expect(MULLIGAN_RARITY_ORDER).toContain(rollRarity(i / 50));
    // luck heavily skews away from common
    let highs = 0;
    for (let i = 0; i < 100; i++) if (MULLIGAN_RARITY[rollRarity(i / 100, 3)].tier >= 2) highs++;
    expect(highs).toBeGreaterThan(20);
  });
});

describe('invariants', () => {
  it('there are exactly three slots', () => {
    expect(MULLIGAN_SLOTS).toBe(3);
    expect(emptyMulligan().slots.length).toBe(3);
  });
  it('mulliganPower equals the resolved power', () => {
    const st = assembleMulligan(['apex_gland', 'oracle_nexus', 'genesis_organ'], 'ascendant', 20);
    expect(mulliganPower(st)).toBe(resolveMulligan(st).power);
    expect(mulliganPower(undefined)).toBe(1);
  });
});

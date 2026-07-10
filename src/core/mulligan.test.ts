// Mulligan framework (docs/MULLIGANS.md) — pins the DATA integrity of the 30-modifier catalog, the
// resolver's "no partial activation" gate (the golden-safety contract), rarity+level scaling, the
// separately-scored Power heuristic, the procedural StatProfile aggregation, and the upgrade economy.

import { describe, it, expect } from 'vitest';
import {
  CLASS_ADAPTATIONS, MULLIGAN_AXES, MULLIGAN_RARITY, MULLIGAN_RARITY_ORDER, MULLIGAN_SLOTS,
  accountMulliganPower, adaptationOf, ascendCost, assembleMulligan, dominantAxis, effectiveStats,
  emptyMulligan, identityMulligan, isMulliganActive, levelCap, makeSlot, modifiersByCategory,
  modifiersByClass, mulliganPower, mulliganRegistry, resolveMulligan, rollRarity, seedFor, upgradeCost,
} from './mulligan';
import { COMBAT_CLASSES, COMBAT_CLASS_ORDER } from './combatClass';
import { TOWER_DEFS, TOWER_ORDER } from './config';
import type { MulliganState } from './mulligan';

describe('catalog', () => {
  it('tracks the tower roster at EXACTLY three pieces per tower (§exclusivity math) and validates', () => {
    // 3 pieces activate one organism and a piece lives on one tower at a time, so the
    // catalog must always hold 3× the tower roster — adding a tower forces new pieces.
    expect(mulliganRegistry.size).toBe(3 * TOWER_ORDER.length);
    expect(mulliganRegistry.validate()).toEqual([]);
    expect(modifiersByCategory('offensive').length).toBe(TOWER_ORDER.length);
    expect(modifiersByCategory('utility').length).toBe(TOWER_ORDER.length);
    expect(modifiersByCategory('biological').length).toBe(TOWER_ORDER.length);
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

// ── Class synergy + Adaptations (docs/MULLIGANS.md §classes/§adaptations) ──

describe('classes — every modifier classed, every host coverable', () => {
  it('every modifier carries exactly one KNOWN CombatClass (the future-modifier contract)', () => {
    for (const m of mulliganRegistry.all()) {
      expect(m.cls, m.id).toBeDefined();
      expect(Object.keys(COMBAT_CLASSES), m.id).toContain(m.cls);
    }
    expect(mulliganRegistry.validate()).toEqual([]); // the registry itself enforces it
  });
  it('every class fields ≥ 3 modifiers, so EVERY tower can assemble its full match', () => {
    for (const cls of COMBAT_CLASS_ORDER) {
      expect(modifiersByClass(cls).length, cls).toBeGreaterThanOrEqual(3);
    }
    for (const k of TOWER_ORDER) {
      expect(modifiersByClass(TOWER_DEFS[k].combatClass).length, k).toBeGreaterThanOrEqual(3);
    }
    // …and every class has an authored adaptation with both tiers described.
    for (const cls of COMBAT_CLASS_ORDER) {
      const a = CLASS_ADAPTATIONS[cls];
      expect(a.title.length, cls).toBeGreaterThan(0);
      expect(a.fullDesc.length, cls).toBeGreaterThan(0);
      expect(a.minorDesc.length, cls).toBeGreaterThan(0);
    }
  });
});

describe('adaptations — full at 3/3, minor at 2/3, hybrids untouched', () => {
  const kin3: [string, string, string] = ['bone_spike', 'siege_carapace', 'shatter_lance']; // all Kinetic
  const kin2: [string, string, string] = ['bone_spike', 'siege_carapace', 'oracle_nexus']; // 2 Kinetic + 1 Resonant
  const mixed: [string, string, string] = ['bone_spike', 'oracle_nexus', 'genesis_organ']; // 1/1/1

  it('adaptationOf counts matches and tiers only while ACTIVE', () => {
    const full = adaptationOf(assembleMulligan(kin3, 'common', 1), 'Kinetic');
    expect(full).toMatchObject({ matches: 3, tier: 'full' });
    const minor = adaptationOf(assembleMulligan(kin2, 'common', 1), 'Kinetic');
    expect(minor).toMatchObject({ matches: 2, tier: 'minor' });
    expect(adaptationOf(assembleMulligan(mixed, 'common', 1), 'Kinetic').tier).toBeNull();
    // partial fill: matches still count (the set-contribution display), but no tier ever
    const partial: MulliganState = { slots: [makeSlot('bone_spike', 'common'), makeSlot('siege_carapace', 'common'), null], visualSeed: 0, animSeed: 0 };
    expect(adaptationOf(partial, 'Kinetic')).toMatchObject({ matches: 2, tier: null });
  });

  it('the FULL bonus folds a capability; the MINOR bonus folds numbers only', () => {
    const full = resolveMulligan(assembleMulligan(kin3, 'common', 1), 'Kinetic');
    const bare = resolveMulligan(assembleMulligan(kin3, 'common', 1));
    expect(full.adaptation).toEqual({ cls: 'Kinetic', tier: 'full' });
    // Kinetic full grants pierce1 ON TOP of bone_spike's own — count them.
    expect(full.projectileMutators.filter((m) => m === 'pierce1').length)
      .toBe(bare.projectileMutators.filter((m) => m === 'pierce1').length + 1);
    expect(full.damageMult).toBeGreaterThan(bare.damageMult);
    expect(full.power).toBeGreaterThan(bare.power);

    const minor = resolveMulligan(assembleMulligan(kin2, 'common', 1), 'Kinetic');
    const minorBare = resolveMulligan(assembleMulligan(kin2, 'common', 1));
    expect(minor.adaptation).toEqual({ cls: 'Kinetic', tier: 'minor' });
    expect(minor.projectileMutators).toEqual(minorBare.projectileMutators); // no capability at minor
    expect(minor.power).toBeGreaterThan(minorBare.power);
    expect(full.power).toBeGreaterThan(minor.power * 0.99); // full ≥ minor at equal grafts (tier bonus dominates)
  });

  it('the Resonant full adaptation grants the echo target (extraProjectiles +1)', () => {
    const res3 = assembleMulligan(['crystalline_core', 'resonance_antenna', 'oracle_nexus'] as [string, string, string], 'common', 1);
    const withHost = resolveMulligan(res3, 'Resonant');
    const bare = resolveMulligan(res3);
    expect(withHost.extraProjectiles).toBe(bare.extraProjectiles + 1);
  });

  it('hybrids and mismatched hosts resolve EXACTLY as before (no hidden tax)', () => {
    const st = assembleMulligan(mixed, 'epic', 5);
    const noHost = resolveMulligan(st);
    const wrongHost = resolveMulligan(st, 'Caustic'); // 0 matches
    expect(wrongHost).toEqual({ ...noHost, adaptation: null });
    expect(wrongHost.adaptation).toBeNull();
  });

  it('inactive stays IDENTITY even with a host class (golden safety)', () => {
    expect(resolveMulligan(emptyMulligan(), 'Kinetic')).toEqual(identityMulligan());
    expect(resolveMulligan(undefined, 'Resonant')).toEqual(identityMulligan());
  });

  it('accountMulliganPower scores host pairs (an adapted roster outranks the same roster unhosted)', () => {
    const st = assembleMulligan(kin3, 'rare', 3);
    const adapted = accountMulliganPower([[st, 'Kinetic'] as const]);
    const mismatched = accountMulliganPower([[st, 'Vital'] as const]);
    expect(adapted).toBeGreaterThan(mismatched);
    expect(mismatched).toBe(resolveMulligan(st).power);
  });
});

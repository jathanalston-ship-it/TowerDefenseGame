// Mulligan procedural generators (docs/MULLIGANS.md §generators) — pins that the organism +
// projectile DERIVE coherently from the StatProfile (emergent, deterministic, composition-sensitive)
// and that an inactive organism generates nothing (the renderer-safe / golden-safe contract).

import { describe, it, expect } from 'vitest';
import { deriveOrganism, deriveMulliganProjectile } from './mulliganOrganism';
import { assembleMulligan, identityMulligan, resolveMulligan, zeroProfile } from '../core/mulligan';

const profile = (ids: [string, string, string], rarity: 'common' | 'epic' | 'ascendant' = 'epic', lvl = 5): ReturnType<typeof resolveMulligan> =>
  resolveMulligan(assembleMulligan(ids, rarity, lvl));

describe('deriveOrganism', () => {
  it('an empty/inactive profile grows NO organs (renders nothing)', () => {
    const spec = deriveOrganism(zeroProfile(), 123);
    expect(spec.organs.length).toBe(0);
    expect(spec.intensity).toBe(0);
    expect(identityMulligan().active).toBe(false); // the source is inactive
  });
  it('grows organs from an active profile; more mass ⇒ more/bigger organs + intensity', () => {
    const common = deriveOrganism(profile(['siege_carapace', 'bone_spike', 'rapid_synapse'], 'common', 1).profile, 7);
    const asc = deriveOrganism(profile(['siege_carapace', 'bone_spike', 'rapid_synapse'], 'ascendant', 20).profile, 7);
    expect(common.organs.length).toBeGreaterThan(0);
    expect(asc.intensity).toBeGreaterThan(common.intensity);
  });
  it('is deterministic for a seed and composition-sensitive across seeds', () => {
    const p = profile(['bone_spike', 'green_vein', 'symbiotic_pod']).profile;
    expect(deriveOrganism(p, 42)).toEqual(deriveOrganism(p, 42));
    const a = deriveOrganism(p, 1).organs.map((o) => Math.round(o.angle * 100));
    const b = deriveOrganism(p, 2).organs.map((o) => Math.round(o.angle * 100));
    expect(a).not.toEqual(b); // a different seed jitters placement
  });
  it('motion weights track the archetype: a fast build twitches, a support build breathes', () => {
    const fast = deriveOrganism(profile(['rapid_synapse', 'rapid_synapse', 'rapid_synapse']).profile, 3).motion;
    const sup = deriveOrganism(profile(['symbiotic_pod', 'resonance_antenna', 'regenerative_node']).profile, 3).motion;
    expect(fast.twitch).toBeGreaterThan(fast.breathe);
    expect(sup.breathe).toBeGreaterThan(sup.twitch);
  });
});

describe('deriveMulliganProjectile', () => {
  it('is null for an inactive organism (no projectile skin)', () => {
    expect(deriveMulliganProjectile(identityMulligan(), 1)).toBeNull();
  });
  it('the dominant axis picks shape + impact (pierce→lance, crit→shard, splash→blob)', () => {
    const pierce = deriveMulliganProjectile(profile(['bone_spike', 'bone_spike', 'shatter_lance']), 5)!;
    expect(pierce.shape).toBe('lance');
    expect(pierce.impact).toBe('pierce');
    const crit = deriveMulliganProjectile(profile(['crystalline_core', 'crystalline_core', 'crystalline_core']), 5)!;
    expect(crit.shape).toBe('shard');
    const splash = deriveMulliganProjectile(profile(['rupture_node', 'spore_bladder', 'frost_vesicle']), 5)!;
    expect(splash.shape).toBe('blob');
  });
});

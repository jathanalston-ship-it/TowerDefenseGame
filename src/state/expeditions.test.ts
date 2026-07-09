// Hero Expeditions (docs/EXPEDITIONS.md): start gating (benched only, slot cap, no
// double-booking), time-gated claims, star-scaled payouts, offline-safe timestamps.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import { EXPEDITION_DEFS, EXPEDITION_SLOTS, scaleReward } from '../core/expeditions';

const T0 = 1_700_000_000_000; // a fixed wall-clock origin — the APIs take `now` explicitly

describe('hero expeditions', () => {
  it('sends only BENCHED heroes and respects the slot cap', () => {
    meta.reset();
    const view = meta.expeditionsView(T0);
    const fielded = meta.fieldedLoadout()[0];
    expect(meta.startExpedition(EXPEDITION_DEFS[0].id, fielded, T0)).toBe(false); // front line stays home
    const benched = view.benched;
    expect(benched.length).toBeGreaterThan(0);
    expect(meta.startExpedition(EXPEDITION_DEFS[0].id, benched[0], T0)).toBe(true);
    expect(meta.startExpedition(EXPEDITION_DEFS[1].id, benched[0], T0)).toBe(false); // already away
    if (benched.length > EXPEDITION_SLOTS) {
      expect(meta.startExpedition(EXPEDITION_DEFS[1].id, benched[1], T0)).toBe(true);
      expect(meta.startExpedition(EXPEDITION_DEFS[2].id, benched[2], T0)).toBe(false); // slots full
    }
  });

  it('claims pay the star-scaled bundle only after endsAt', () => {
    meta.reset();
    const hero = meta.expeditionsView(T0).benched[0];
    const def = EXPEDITION_DEFS[0];
    expect(meta.startExpedition(def.id, hero, T0)).toBe(true);
    expect(meta.claimExpedition(hero, T0 + 1000)).toBeNull(); // too early
    const before = meta.get();
    const done = T0 + def.hours * 3_600_000 + 1;
    const r = meta.claimExpedition(hero, done);
    expect(r).toEqual(scaleReward(def.reward, before.heroStars[hero] ?? 0));
    const after = meta.get();
    expect(after.shards - before.shards).toBe(r!.cores);
    expect(after.geneEssence - before.geneEssence).toBe(r!.essence);
    expect(after.mats.scrap - before.mats.scrap).toBe(r!.mats.scrap);
    expect(after.expeditions.active).toHaveLength(0); // the hero is home
    expect(meta.expeditionsView(done).benched).toContain(hero);
  });

  it('star scaling pays the decorated forager more', () => {
    const base = EXPEDITION_DEFS[2].reward;
    const s0 = scaleReward(base, 0);
    const s5 = scaleReward(base, 5);
    expect(s0).toEqual(base);
    expect(s5.cores).toBe(Math.round(base.cores * 1.5));
    expect(s5.essence).toBeGreaterThan(s0.essence);
  });
});

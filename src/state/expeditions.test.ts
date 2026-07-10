// Hero Expeditions (docs/EXPEDITIONS.md): start gating (benched only, slot cap, no
// double-booking), time-gated claims, the claim-time multiplier stack (stars × affinity ×
// mastery × risk outcome), deterministic outcome/rare-find rolls, and the mastery ledger.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import { HERO_DEFS } from '../core/config';
import {
  AFFINITY_MULT, EXPEDITION_DEFS, EXPEDITION_SLOTS, MASTERY_CAP_RUNS, RISK_TIERS,
  expeditionMult, expeditionOutcome, masteryBonus, rareFindChance, rollRareFind,
  scaleReward, sumRewards,
} from '../core/expeditions';

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
      for (let i = 1; i < EXPEDITION_SLOTS; i++) {
        expect(meta.startExpedition(EXPEDITION_DEFS[i].id, benched[i], T0)).toBe(true);
      }
      expect(meta.startExpedition(EXPEDITION_DEFS[EXPEDITION_SLOTS].id, benched[EXPEDITION_SLOTS], T0)).toBe(false); // slots full
    }
  });

  it('claims pay the full multiplier stack (stars × affinity × mastery × outcome + find) only after endsAt', () => {
    meta.reset();
    const hero = meta.expeditionsView(T0).benched[0];
    const def = EXPEDITION_DEFS[0];
    expect(meta.startExpedition(def.id, hero, T0)).toBe(true);
    expect(meta.claimExpedition(hero, T0 + 1000)).toBeNull(); // too early
    const before = meta.get();
    const endsAt = T0 + def.hours * 3_600_000;
    const ticket = { defId: def.id, hero, endsAt };
    const r = meta.claimExpedition(hero, endsAt + 1);
    // The claim is DETERMINISTIC — recompute the exact expected bundle from the ticket.
    const affinity = HERO_DEFS[hero].combatClass === def.affinity;
    const mult = expeditionMult(before.heroStars[hero] ?? 0, affinity, 0) * expeditionOutcome(ticket).mult;
    const find = rollRareFind(ticket);
    const expected = find ? sumRewards(scaleReward(def.reward, mult), find.reward) : scaleReward(def.reward, mult);
    expect(r).not.toBeNull();
    expect(r!.reward).toEqual(expected);
    expect(r!.outcome).toBe(expeditionOutcome(ticket).kind);
    const after = meta.get();
    expect(after.shards - before.shards).toBe(r!.reward.cores);
    expect(after.geneEssence - before.geneEssence).toBe(r!.reward.essence);
    expect(after.mats.scrap - before.mats.scrap).toBe(r!.reward.mats.scrap);
    expect(after.expeditions.active).toHaveLength(0); // the hero is home
    expect(after.expeditions.mastery[def.id]).toBe(1); // the completion is on the ledger
    expect(meta.expeditionsView(endsAt + 1).benched).toContain(hero);
  });

  it('multiplier stack: stars, affinity, and capped mastery compound', () => {
    expect(expeditionMult(0, false, 0)).toBe(1);
    expect(expeditionMult(5, false, 0)).toBeCloseTo(1.5, 10);
    expect(expeditionMult(0, true, 0)).toBeCloseTo(AFFINITY_MULT, 10);
    expect(expeditionMult(0, false, 5)).toBeCloseTo(1.1, 10);
    expect(masteryBonus(MASTERY_CAP_RUNS + 50)).toBeCloseTo(0.2, 10); // capped
    expect(expeditionMult(5, true, 999)).toBeCloseTo(1.5 * 1.25 * 1.2, 10);
  });

  it('risk outcomes are deterministic and land in the tier bands', () => {
    const perilous = EXPEDITION_DEFS.find((d) => d.risk === 2)!;
    const tier = RISK_TIERS[2];
    const counts = { windfall: 0, setback: 0, standard: 0 };
    for (let i = 0; i < 4000; i++) {
      const t = { defId: perilous.id, hero: 'ravager', endsAt: T0 + i * 60_000 };
      const o = expeditionOutcome(t);
      counts[o.kind]++;
      expect(expeditionOutcome(t)).toEqual(o); // same ticket, same fate — always
      if (o.kind === 'windfall') expect(o.mult).toBe(tier.windfallMult);
      if (o.kind === 'setback') expect(o.mult).toBe(tier.setbackMult);
    }
    expect(counts.windfall / 4000).toBeGreaterThan(tier.windfall - 0.05);
    expect(counts.windfall / 4000).toBeLessThan(tier.windfall + 0.05);
    expect(counts.setback / 4000).toBeGreaterThan(tier.setback - 0.05);
    expect(counts.setback / 4000).toBeLessThan(tier.setback + 0.05);
    // A SAFE mission never rolls variance.
    const safe = EXPEDITION_DEFS.find((d) => d.risk === 0)!;
    for (let i = 0; i < 200; i++) {
      expect(expeditionOutcome({ defId: safe.id, hero: 'ravager', endsAt: T0 + i }).kind).toBe('standard');
    }
  });

  it('rare finds roll deterministically at the def-scaled chance', () => {
    const longRoad = EXPEDITION_DEFS[EXPEDITION_DEFS.length - 1];
    expect(rareFindChance(longRoad)).toBeLessThanOrEqual(0.35);
    expect(rareFindChance(EXPEDITION_DEFS[0])).toBeLessThan(rareFindChance(longRoad));
    let hits = 0;
    for (let i = 0; i < 4000; i++) {
      const t = { defId: longRoad.id, hero: 'revenant', endsAt: T0 + i * 60_000 };
      const f = rollRareFind(t);
      expect(rollRareFind(t)).toEqual(f); // deterministic
      if (f) hits++;
    }
    expect(hits / 4000).toBeGreaterThan(rareFindChance(longRoad) - 0.05);
    expect(hits / 4000).toBeLessThan(rareFindChance(longRoad) + 0.05);
  });

  it('mastery accrues per mission and boosts the offer matrix', () => {
    meta.reset();
    const def = EXPEDITION_DEFS[0];
    let benched = meta.expeditionsView(T0).benched[0];
    for (let run = 0; run < 3; run++) {
      const t = T0 + run * 100 * 3_600_000;
      expect(meta.startExpedition(def.id, benched, t)).toBe(true);
      expect(meta.claimExpedition(benched, t + def.hours * 3_600_000 + 1)).not.toBeNull();
      benched = meta.expeditionsView(t).benched[0];
    }
    expect(meta.get().expeditions.mastery[def.id]).toBe(3);
    const offer = meta.expeditionsView(T0).offers.find((o) => o.def.id === def.id)!;
    expect(offer.masteryRuns).toBe(3);
    expect(offer.masteryBonus).toBeCloseTo(0.06, 10);
    for (const p of offer.picks) {
      expect(p.mult).toBeCloseTo(expeditionMult(p.stars, p.affinity, 3), 10);
    }
  });

  it('the offer matrix flags class-affine foragers', () => {
    meta.reset();
    const view = meta.expeditionsView(T0);
    for (const o of view.offers) {
      for (const p of o.picks) {
        expect(p.affinity).toBe(HERO_DEFS[p.hero].combatClass === o.def.affinity);
        if (p.affinity) expect(p.mult).toBeGreaterThanOrEqual(AFFINITY_MULT);
      }
    }
    // Every class named by a mission is a real hero class (a mission nobody can match is a bug).
    const classes = new Set(Object.values(HERO_DEFS).map((h) => h.combatClass));
    for (const d of EXPEDITION_DEFS) expect(classes.has(d.affinity)).toBe(true);
  });
});

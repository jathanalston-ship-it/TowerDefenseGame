// Premium Offer Registry invariants (docs/PREMIUM-STORE.md): the catalog is complete + valid, the
// bundle ladder rewards commitment monotonically, packs carry real value multiples WITHOUT being
// progression-skips, the daily rotation shows exactly one pack per UTC day, and availability
// honours limits/windows. Pure — the purchase pipeline is covered in state/premium tests.

import { describe, it, expect } from 'vitest';
import {
  ICHOR_BUNDLES, PERMANENT_PACKS, PREMIUM_OFFERS, ROTATING_PACKS,
  activeEventOffers, offerAvailable, offerValueIchor, offerValueMultiple, premiumRegistry,
  registerPremiumOffer, todaysRotatingOffer,
} from './premium';
import type { PremiumOfferDef } from './premium';

describe('catalog shape', () => {
  it('ships 6 ichor bundles, 2 permanent packs, 3 rotating packs — all registered + unique', () => {
    expect(ICHOR_BUNDLES.length).toBe(6);
    expect(PERMANENT_PACKS.length).toBe(2);
    expect(ROTATING_PACKS.length).toBe(3);
    const ids = PREMIUM_OFFERS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(premiumRegistry.get(id)).toBeDefined();
  });

  it('permanent packs are once-per-account; rotating packs are once-per-day', () => {
    for (const p of PERMANENT_PACKS) expect(p.limit).toBe(1);
    for (const p of ROTATING_PACKS) { expect(p.oncePerDay).toBe(true); expect(p.rotationIndex).toBeDefined(); }
  });
});

describe('ichor bundle ladder', () => {
  it('bonus % grows with commitment and the granted ichor matches base × (1 + bonus)', () => {
    let prevBonus = -1;
    let prevRate = 0;
    for (const b of ICHOR_BUNDLES) {
      expect(b.bonusPct).toBeGreaterThanOrEqual(prevBonus + (prevBonus < 0 ? 1 : 1)); // strictly rising
      prevBonus = b.bonusPct!;
      const granted = (b.grants[0] as { qty: number }).qty;
      expect(granted).toBe(Math.round(b.baseIchor! * (1 + b.bonusPct! / 100)));
      const rate = granted / b.priceUsd; // ichor per dollar strictly improves up the ladder
      expect(rate).toBeGreaterThanOrEqual(prevRate);
      prevRate = rate;
    }
    expect(ICHOR_BUNDLES[0].bonusPct).toBe(0); // the starter is the honest baseline
    expect(ICHOR_BUNDLES[5].bonusPct).toBe(60);
  });
});

describe('pack value — worthwhile, never a skip', () => {
  it('every pack beats par value (feels rewarding) but stays under 3× (no progression skip)', () => {
    for (const p of [...PERMANENT_PACKS, ...ROTATING_PACKS]) {
      const mult = offerValueMultiple(p);
      expect(mult, `${p.id} value ×${mult.toFixed(2)}`).toBeGreaterThanOrEqual(1.4); // clearly better than raw ichor
      expect(mult, `${p.id} value ×${mult.toFixed(2)}`).toBeLessThanOrEqual(3.0); // bounded — pacing survives
    }
  });

  it('SAFEGUARDS: no offer grants legendary/exotic equipment, exotic containers, or forbidden lanes', () => {
    for (const o of premiumRegistry.all()) {
      for (const g of o.grants) {
        if (g.grant === 'equipment') expect(['rare', 'epic']).toContain(g.rarity); // drop-luck stays sacred
        if (g.grant === 'container') expect(['common', 'rare', 'epic', 'legendary']).toContain(g.rarity); // exotic = market-only
        // The grant LANGUAGE itself has no campaign/prestige/evolution/hero-slot verbs — asserting
        // the union stays closed keeps future offers inside the safeguards by construction.
        expect(['ichor', 'cores', 'geneEssence', 'mats', 'towerShardsAll', 'heroShardsAll', 'container', 'runCache', 'equipment', 'rushStamina']).toContain(g.grant);
      }
    }
  });

  it('offerValueIchor prices a pure ichor bundle at exactly its granted ichor', () => {
    for (const b of ICHOR_BUNDLES) expect(offerValueIchor(b)).toBe((b.grants[0] as { qty: number }).qty);
  });
});

describe('daily rotation — one pack per UTC day', () => {
  it('is deterministic per key and cycles through ALL three packs across days', () => {
    expect(todaysRotatingOffer('2026-07-07').id).toBe(todaysRotatingOffer('2026-07-07').id);
    const seen = new Set<string>();
    for (let d = 1; d <= 21; d++) seen.add(todaysRotatingOffer(`2026-07-${String(d).padStart(2, '0')}`).id);
    expect(seen.size).toBe(3); // every pack appears within the window
  });

  it('offerAvailable: only today’s rotation is buyable, once per day; limits bind', () => {
    const key = '2026-07-07';
    const today = todaysRotatingOffer(key);
    const others = ROTATING_PACKS.filter((p) => p.id !== today.id);
    expect(offerAvailable(today, key, {})).toBe(true);
    for (const o of others) expect(offerAvailable(o, key, {})).toBe(false);
    expect(offerAvailable(today, key, {}, key)).toBe(false); // already bought today
    const perm = PERMANENT_PACKS[0];
    expect(offerAvailable(perm, key, {})).toBe(true);
    expect(offerAvailable(perm, key, { [perm.id]: 1 })).toBe(false); // lifetime limit
    expect(offerAvailable(ICHOR_BUNDLES[0], key, { [ICHOR_BUNDLES[0].id]: 99 })).toBe(true); // bundles unlimited
  });
});

describe('expandability — event offers are one data row', () => {
  it('a registered holiday offer activates ONLY inside its window (no engine change)', () => {
    const holiday: PremiumOfferDef = {
      id: 'evt_test_solstice', kind: 'event', name: 'Solstice Cache', tagline: 'test',
      priceUsd: 4.99, accent: 'gold', art: '❄', window: { from: '2026-12-20', to: '2026-12-27' },
      grants: [{ grant: 'ichor', qty: 200 }],
    };
    registerPremiumOffer(holiday);
    expect(activeEventOffers('2026-12-19').some((o) => o.id === holiday.id)).toBe(false);
    expect(activeEventOffers('2026-12-20').some((o) => o.id === holiday.id)).toBe(true);
    expect(activeEventOffers('2026-12-27').some((o) => o.id === holiday.id)).toBe(true);
    expect(activeEventOffers('2026-12-28').some((o) => o.id === holiday.id)).toBe(false);
    expect(offerAvailable(holiday, '2026-12-21', {})).toBe(true);
    expect(offerAvailable(holiday, '2026-11-01', {})).toBe(false);
  });
});

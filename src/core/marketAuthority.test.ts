// marketAuthority — pins the invisible steward's contract (docs/AUCTION-HOUSE.md §authority):
// levers stay inside AUTHORITY_BOUNDS and move at most maxStepFrac per window (nothing it
// does can FEEL artificial), inflation raises sinks + supply and cools guidance, illiquidity
// relaxes fees even under inflation, baseline stock can NEVER touch exclusives, and the
// manipulation detectors flag relist churn / monopolies / price fixing without auto-punishing.

import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_BOUNDS, auditMarket, authorityTick, baselineEligible, defaultAuthorityState,
  effectiveFees, emptyMetrics, planBaselineRestock,
} from './marketAuthority';
import type { BaselineCatalogEntry, ListingEvent, MarketMetrics } from './marketAuthority';
import { openListing } from './auction';
import type { LiveListing } from './auction';
import type { TradeEvent } from './trading';

function metrics(over: Partial<MarketMetrics>): MarketMetrics {
  return { ...emptyMetrics(1), sales: 20, avgSalePrice: 100, saleVolume: 2000, ichorBurned: 300, activeListings: 40, ...over };
}

describe('authorityTick — bounded, smooth, health-first', () => {
  it('levers never leave their bounds and never move faster than the step cap', () => {
    let s = defaultAuthorityState();
    // Hammer it with extreme inflation for many windows.
    let prev: MarketMetrics | null = null;
    for (let w = 1; w <= 60; w++) {
      const m = metrics({ windowKey: w, avgSalePrice: 100 * Math.pow(1.5, w), ichorBurned: 0 });
      const next = authorityTick(s, m, prev);
      expect(Math.abs(next.feeMult - s.feeMult)).toBeLessThanOrEqual(AUTHORITY_BOUNDS.maxStepFrac + 1e-9);
      expect(next.feeMult).toBeGreaterThanOrEqual(AUTHORITY_BOUNDS.feeMult[0]);
      expect(next.feeMult).toBeLessThanOrEqual(AUTHORITY_BOUNDS.feeMult[1]);
      expect(next.taxMult).toBeLessThanOrEqual(AUTHORITY_BOUNDS.taxMult[1]);
      expect(next.recBias).toBeGreaterThanOrEqual(AUTHORITY_BOUNDS.recBias[0]);
      prev = m;
      s = next;
    }
    // Sustained inflation drove every anti-inflation lever up and guidance down.
    expect(s.feeMult).toBeGreaterThan(1.5);
    expect(s.taxMult).toBeGreaterThan(1.3);
    expect(s.baselineLevel).toBeGreaterThan(3);
    expect(s.recBias).toBeLessThan(0.95);
  });

  it('deflation/calm relaxes levers back toward neutral', () => {
    let s = { ...defaultAuthorityState(), feeMult: 2, taxMult: 1.8, recBias: 0.9, inflationIdx: 1.3 };
    let prev: MarketMetrics | null = null;
    for (let w = 1; w <= 80; w++) {
      const m = metrics({ windowKey: w, avgSalePrice: 100, ichorBurned: 700 }); // strong sinks, flat prices
      s = authorityTick(s, m, prev);
      prev = m;
    }
    expect(s.inflationIdx).toBeLessThan(1.02);
    expect(s.feeMult).toBeLessThan(1.2);
    expect(s.taxMult).toBeLessThanOrEqual(1.2);
  });

  it('an illiquid market lowers fees to invite listings even while the index runs hot', () => {
    let s = { ...defaultAuthorityState(), feeMult: 2, inflationIdx: 1.2 };
    const m = metrics({ windowKey: 2, staleListings: 30, activeListings: 40 });
    for (let i = 0; i < 40; i++) s = authorityTick(s, { ...m, windowKey: i + 2 }, m);
    expect(s.feeMult).toBeLessThan(1.1);
  });

  it('sparse windows read as flat — three sales never move the index', () => {
    const s = defaultAuthorityState();
    const prev = metrics({ windowKey: 1, sales: 2, avgSalePrice: 100 });
    const next = authorityTick(s, metrics({ windowKey: 2, sales: 2, avgSalePrice: 900 }), prev);
    expect(Math.abs(next.inflationIdx - 1)).toBeLessThan(0.02);
  });

  it('effectiveFees scales the TRADE base fractions', () => {
    expect(effectiveFees(defaultAuthorityState())).toEqual({ listingFeeFrac: 0.05, saleTaxFrac: 0.1 });
    expect(effectiveFees({ ...defaultAuthorityState(), feeMult: 2, taxMult: 1.5 }).listingFeeFrac).toBeCloseTo(0.1, 10);
  });
});

describe('baseline stock — foundational only, exclusives never', () => {
  const entry = (over: Partial<BaselineCatalogEntry>): BaselineCatalogEntry =>
    ({ familyKey: 'f', cat: 'geneCard', rarity: 'common', exclusive: false, ...over });

  it('eligibility: commons/uncommons per category band; every exclusive refused', () => {
    expect(baselineEligible(entry({}))).toBe(true);
    expect(baselineEligible(entry({ rarity: 'uncommon' }))).toBe(true);
    expect(baselineEligible(entry({ rarity: 'rare' }))).toBe(false); // gene band stops at uncommon
    expect(baselineEligible(entry({ cat: 'equipment', rarity: 'common' }))).toBe(true);
    expect(baselineEligible(entry({ cat: 'equipment', rarity: 'uncommon' }))).toBe(false);
    expect(baselineEligible(entry({ cat: 'cosmetic', rarity: 'rare' }))).toBe(true);
    expect(baselineEligible(entry({ cat: 'cosmetic', rarity: 'legendary' }))).toBe(false);
    // The hard rule: seasonal/limited/event/prestige/arena mark exclusive ⇒ NEVER stocked.
    expect(baselineEligible(entry({ exclusive: true }))).toBe(false);
    expect(baselineEligible(entry({ cat: 'cosmetic', rarity: 'rare', exclusive: true }))).toBe(false);
  });

  it('restock plans only below-target families, priced ABOVE guidance (never undercutting players)', () => {
    const catalog = [entry({ familyKey: 'a' }), entry({ familyKey: 'b' }), entry({ familyKey: 'x', exclusive: true })];
    const orders = planBaselineRestock(catalog, (f) => (f === 'a' ? 9 : 0), () => 100, defaultAuthorityState());
    expect(orders.map((o) => o.familyKey)).toEqual(['b']); // a is stocked, x is exclusive
    expect(orders[0].price).toBe(110);
  });
});

describe('manipulation detectors', () => {
  const T0 = 1_700_000_000_000;
  const mk = (id: string, sellerId: string, familyKey: string, ask: number): LiveListing => {
    const r = openListing({
      listingId: id, globalItemId: id, refKey: `equipment:${id}`, cat: 'equipment',
      familyKey, rarity: 'common', sellerId, ask, buyNow: ask, durationH: 24, now: T0,
    });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  it('flags rapid relist churn (open→cancel cycles of the same item)', () => {
    const events: ListingEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push({ at: T0 + i * 60_000, sellerId: 's1', familyKey: 'f', refKey: 'equipment:x', action: 'open', ask: 100 });
      events.push({ at: T0 + i * 60_000 + 1000, sellerId: 's1', familyKey: 'f', refKey: 'equipment:x', action: 'cancel', ask: 100 });
    }
    const flags = auditMarket([], events, [], () => 100);
    expect(flags.some((f) => f.kind === 'rapidRelist')).toBe(true);
  });

  it('flags a family monopoly and coordinated off-median identical asks', () => {
    const rows = [
      mk('1', 'whale', 'fam', 400), mk('2', 'whale', 'fam', 400), mk('3', 'whale', 'fam', 400),
      mk('4', 'whale', 'fam', 400), mk('5', 'other', 'fam', 400), mk('6', 'third', 'fam', 400),
    ];
    const flags = auditMarket([], [], rows, () => 100); // median 100, everyone asking 400 = ×4
    expect(flags.some((f) => f.kind === 'monopoly' && f.sellerId === 'whale')).toBe(true);
    expect(flags.some((f) => f.kind === 'priceFixing' && f.sellers >= 3)).toBe(true);
  });

  it('keeps trading.ts fraud signals in the same report (wash/circular pipelines)', () => {
    const trades: TradeEvent[] = [
      { at: T0, itemKey: 'equipment:x', fromId: 'a', toId: 'b', price: 100, medianPrice: 100 },
      { at: T0 + 1000, itemKey: 'equipment:x', fromId: 'b', toId: 'a', price: 100, medianPrice: 100 },
    ];
    const flags = auditMarket(trades, [], [], () => 100);
    expect(flags.some((f) => f.kind === 'circular')).toBe(true);
  });
});

// marketAuthority — pins the invisible steward's contract (docs/AUCTION-HOUSE.md §authority):
// levers stay inside AUTHORITY_BOUNDS and move at most maxStepFrac per window (nothing it
// does can FEEL artificial), inflation raises sinks + supply and cools guidance, illiquidity
// relaxes fees even under inflation, baseline stock can NEVER touch exclusives, and the
// manipulation detectors flag relist churn / monopolies / price fixing without auto-punishing.

import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_BOUNDS, BUYBACK, auditMarket, authorityTick, baselineEligible, buybackActivity,
  buybackBudget, defaultAuthorityState, effectiveFees, emptyMetrics, planBaselineRestock,
  planBuybacks,
} from './marketAuthority';
import type { BaselineCatalogEntry, BuybackCandidate, ListingEvent, MarketMetrics } from './marketAuthority';
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

// ── Market Liquidity Engine (§buybacks) — the buy side can never be farmed ─────
describe('planBuybacks — liquidity without exploitability', () => {
  const seeded = (seq: number[]): (() => number) => {
    let i = 0;
    return () => seq[i++ % seq.length];
  };
  const cand = (over: Partial<BuybackCandidate> = {}): BuybackCandidate => ({
    listingId: `L${Math.floor((over.createdAt ?? 0) + (over.price ?? 0))}.${over.listingId ?? ''}`,
    sellerId: 'seller1', familyKey: 'eq:chitin', cat: 'equipment', rarity: 'common',
    exclusive: false, price: 100, createdAt: 0, endsAt: 48 * 3_600_000, hasBid: false,
    estimate: 100, velocityPerDay: 0.2, transfers: 0, sellerFlagged: false,
    itemFlagged: false, sellerFamilyListings: 1, ...over,
  });
  const NOW = 24 * 3_600_000; // half a 48h duration old — comfortably stale
  const plan = (cands: BuybackCandidate[], over: Partial<Parameters<typeof planBuybacks>[1]> = {}) =>
    planBuybacks(cands, { now: NOW, budget: 10_000, uniqueTraders: 0, sellerRecords: new Map(), rng: seeded([0.01]), ...over });

  it('buys a stale, fairly priced foundational listing (the happy path exists)', () => {
    expect(plan([cand({ listingId: 'a' })])).toHaveLength(1);
  });

  it('never touches exclusives, out-of-band rarities, or vetoed rows — regardless of price', () => {
    expect(plan([cand({ exclusive: true })])).toHaveLength(0); // seasonal/limited/prestige/arena/promo
    expect(plan([cand({ rarity: 'legendary' })])).toHaveLength(0);
    expect(plan([cand({ cat: 'geneCard', rarity: 'rare' })])).toHaveLength(0); // epic+/rare genes stay player-driven
    expect(plan([cand({ authorityEligible: false })])).toHaveLength(0);
    // The explicit flag widens the band — but exclusivity still always wins.
    expect(plan([cand({ rarity: 'rare', authorityEligible: true })])).toHaveLength(1);
    expect(plan([cand({ rarity: 'rare', authorityEligible: true, exclusive: true })])).toHaveLength(0);
  });

  it('never overpays and never rewards suppression bait (the valuation corridor)', () => {
    expect(plan([cand({ price: 106, estimate: 100 })])).toHaveLength(0); // > ×1.05
    expect(plan([cand({ price: 105, estimate: 100 })])).toHaveLength(1); // the corridor edge
    expect(plan([cand({ price: 19, estimate: 100 })])).toHaveLength(0); // < ×0.2 — bait
    expect(plan([cand({ estimate: null })])).toHaveLength(0); // no signal ⇒ no purchase
  });

  it('leaves the market alone where players are already trading', () => {
    expect(plan([cand({ hasBid: true })])).toHaveLength(0); // a bid IS demand
    expect(plan([cand({ velocityPerDay: 2 })])).toHaveLength(0); // fast families need no help
    expect(plan([cand({ createdAt: NOW - 3_600_000 })])).toHaveLength(0); // not stale yet
  });

  it('screens manipulation shapes: flags, mule chains, dupe walls', () => {
    expect(plan([cand({ sellerFlagged: true })])).toHaveLength(0);
    expect(plan([cand({ itemFlagged: true })])).toHaveLength(0);
    expect(plan([cand({ transfers: 3 })])).toHaveLength(0);
    expect(plan([cand({ sellerFamilyListings: 3 })])).toHaveLength(0);
  });

  it('enforces budget, per-window, per-family and per-seller caps', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      cand({ listingId: `c${i}`, familyKey: `eq:f${i}`, sellerId: `s${i}` }));
    // Window cap: even with budget for all ten, at most maxPerWindow.
    expect(plan(many).length).toBeLessThanOrEqual(BUYBACK.maxPerWindow);
    // Budget: 100 Ichor buys exactly one 100-priced listing.
    expect(plan(many, { budget: 100 })).toHaveLength(1);
    // Family cap: ten listings, one family ⇒ one purchase.
    const oneFamily = Array.from({ length: 10 }, (_, i) => cand({ listingId: `f${i}`, sellerId: `s${i}` }));
    expect(plan(oneFamily).length).toBeLessThanOrEqual(1);
    // Seller daily cap: a seller bought once today is invisible until tomorrow.
    const rec = new Map([['seller1', { boughtToday: 1, lastAt: 0 }]]);
    expect(plan([cand({})], { sellerRecords: rec })).toHaveLength(0);
    // Cooldown: a purchase minutes ago blocks another even with boughtToday 0.
    const cool = new Map([['seller1', { boughtToday: 0, lastAt: NOW - 60_000 }]]);
    expect(plan([cand({})], { sellerRecords: cool })).toHaveLength(0);
  });

  it('is never guaranteed: the accept roll can pass on a perfect candidate', () => {
    // rng draws: shuffle draw(s), then the accept roll — force the roll to fail.
    expect(plan([cand({})], { rng: seeded([0.99]) })).toHaveLength(0);
    // And population starves it: a busy market buys (almost) nothing.
    expect(buybackActivity(0)).toBeCloseTo(BUYBACK.quietBoost);
    expect(buybackActivity(BUYBACK.busyFade)).toBe(0);
    expect(plan([cand({})], { uniqueTraders: 100 })).toHaveLength(0);
  });

  it('funds itself strictly from sinks: budget ≤ cap, ≥ floor, scales with prior burns', () => {
    expect(buybackBudget(0)).toBe(BUYBACK.budgetFloor);
    expect(buybackBudget(1_000)).toBe(500);
    expect(buybackBudget(1e9)).toBe(BUYBACK.budgetCap);
  });
});

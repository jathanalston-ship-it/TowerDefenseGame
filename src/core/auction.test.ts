// auction engine — pins the market's rulebook (docs/AUCTION-HOUSE.md): the listing
// lifecycle as a pure state machine, LEDGER CONSERVATION (every Ichor a listing moves is
// accounted: charges = refunds + credits + burns by end of life), anti-snipe, price
// statistics → recommendations, and the search model both hosts share.

import { describe, expect, it } from 'vitest';
import {
  MARKET_PAGE_SIZE, buyNow, cancelListing, familyStats, matchesQuery, openListing,
  placeBid, recommendedPrice, settleExpired, sortListings,
} from './auction';
import type { LedgerOp, LiveListing, OpenListingInput } from './auction';
import { TRADE, listingFee, minNextBid, saleTax } from './trading';
import type { MarketHistoryPoint } from './trading';

const T0 = 1_700_000_000_000;

function open(over: Partial<OpenListingInput> = {}): LiveListing {
  const r = openListing({
    listingId: 'L1', globalItemId: 'G1', refKey: 'equipment:abc', cat: 'equipment',
    familyKey: 'chitin_plate', rarity: 'common', sellerId: 'seller', ask: 100, buyNow: 200,
    durationH: 24, now: T0, ...over,
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

/** Conservation: player charges must equal player refunds+credits plus burns. */
function conserve(ops: LedgerOp[]): { charged: number; returned: number; burned: number } {
  let charged = 0; let returned = 0; let burned = 0;
  for (const o of ops) {
    if (o.op === 'charge') charged += o.amount;
    else if (o.op === 'refund' || o.op === 'credit') returned += o.amount;
    else burned += o.amount;
  }
  return { charged, returned, burned };
}

describe('listing lifecycle — open / bid / buy / cancel / settle', () => {
  it('opening charges + burns the non-refundable fee (spam brake)', () => {
    const r = openListing({
      listingId: 'L1', globalItemId: 'G1', refKey: 'equipment:abc', cat: 'equipment',
      familyKey: 'f', rarity: 'common', sellerId: 's', ask: 100, buyNow: 200, durationH: 24, now: T0,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fee = listingFee(200); // fee prices off buy-now when present
    expect(r.ops).toEqual([
      { op: 'charge', playerId: 's', amount: fee, why: 'listingFee' },
      { op: 'burn', amount: fee, why: 'listingFee' },
    ]);
    expect(r.value.endsAt).toBe(T0 + 24 * 3_600_000);
  });

  it('rejects out-of-bounds prices, buy-now below ask, unknown durations', () => {
    expect(openListing({ ...baseInput(), ask: TRADE.minPrice - 1 }).ok).toBe(false);
    expect(openListing({ ...baseInput(), ask: TRADE.maxPrice + 1 }).ok).toBe(false);
    expect(openListing({ ...baseInput(), buyNow: 50 }).ok).toBe(false); // ask 100
    expect(openListing({ ...baseInput(), durationH: 13 }).ok).toBe(false);
  });

  it('bids: floor = ask, then min-increment ladder; escrow charges and outbids refund', () => {
    const l = open();
    expect(placeBid(l, 'a', l.ask - 1, T0 + 1000).ok).toBe(false);
    const b1 = placeBid(l, 'a', 100, T0 + 1000);
    expect(b1.ok).toBe(true);
    if (!b1.ok) return;
    expect(b1.ops).toEqual([{ op: 'charge', playerId: 'a', amount: 100, why: 'bidEscrow' }]);
    const tooLow = placeBid(b1.value, 'b', 101, T0 + 2000);
    expect(tooLow.ok).toBe(false); // must beat minNextBid(100)
    const b2 = placeBid(b1.value, 'b', minNextBid(100), T0 + 2000);
    expect(b2.ok).toBe(true);
    if (!b2.ok) return;
    expect(b2.ops).toContainEqual({ op: 'refund', playerId: 'a', amount: 100, why: 'outbid' });
    expect(placeBid(b2.value, 'seller', 999, T0 + 3000).ok).toBe(false); // self-bid
  });

  it('anti-snipe: a bid inside the window extends the clock by it', () => {
    const l = open();
    const nearEnd = l.endsAt - TRADE.antiSnipeSec * 500; // inside the window
    const b = placeBid(l, 'a', 100, nearEnd);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.value.endsAt).toBe(l.endsAt + TRADE.antiSnipeSec * 1000);
    const early = placeBid(l, 'a', 100, T0 + 1000);
    if (early.ok) expect(early.value.endsAt).toBe(l.endsAt); // early bids never extend
  });

  it('buy-now settles instantly: buyer charged, standing bid refunded, tax burned, proceeds credited — conservation holds', () => {
    const l = open();
    const withBid = placeBid(l, 'a', 100, T0 + 1000);
    if (!withBid.ok) throw new Error('bid');
    const r = buyNow(withBid.value, 'buyer', T0 + 2000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.listing.state).toBe('sold');
    expect(r.value.sale.price).toBe(200);
    expect(r.value.sale.proceeds).toBe(200 - saleTax(200));
    const c = conserve(r.ops);
    expect(c.charged).toBe(200); // the buyer; the 100 escrow was charged in the earlier bid op-list
    expect(c.returned + c.burned).toBe(c.charged + 100); // all money in (incl. prior escrow) fully distributed
  });

  it('auction settlement: the standing bid wins at expiry; bid-free listings expire back', () => {
    const l = open();
    const withBid = placeBid(l, 'a', 150, T0 + 1000);
    if (!withBid.ok) throw new Error('bid');
    expect(settleExpired(withBid.value, withBid.value.endsAt - 1).ok).toBe(false); // not ended
    const r = settleExpired(withBid.value, withBid.value.endsAt + 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.listing.state).toBe('sold');
    expect(r.value.sale?.buyerId).toBe('a');
    expect(r.value.sale?.price).toBe(150);
    const c = conserve(r.ops); // escrow charged at bid time — settlement only distributes
    expect(c.returned + c.burned).toBe(150);
    const empty = settleExpired(open({ listingId: 'L2' }), T0 + 25 * 3_600_000);
    expect(empty.ok && empty.value.listing.state === 'expired' && empty.value.sale === null).toBe(true);
  });

  it('cancel: seller-only, bid-free-only; the fee stays burned', () => {
    const l = open();
    expect(cancelListing(l, 'someone').ok).toBe(false);
    const withBid = placeBid(l, 'a', 100, T0 + 1000);
    if (!withBid.ok) throw new Error('bid');
    expect(cancelListing(withBid.value, 'seller').ok).toBe(false); // has bids
    const r = cancelListing(l, 'seller');
    expect(r.ok && r.value.state === 'cancelled' && r.ops.length === 0).toBe(true);
  });

  it('authority listings: no fee, buy-now only, sale fully burns (pure sink)', () => {
    const r = openListing({ ...baseInput(), authority: true, sellerId: '@authority' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ops).toEqual([]); // no fee rows
    expect(placeBid(r.value, 'a', 100, T0 + 1).ok).toBe(false);
    const sold = buyNow(r.value, 'buyer', T0 + 1);
    expect(sold.ok).toBe(true);
    if (!sold.ok) return;
    expect(sold.value.sale.proceeds).toBe(0);
    expect(sold.ops).toContainEqual({ op: 'burn', amount: 200, why: 'authoritySale' });
  });
});

function baseInput(): OpenListingInput {
  return {
    listingId: 'LX', globalItemId: 'GX', refKey: 'equipment:x', cat: 'equipment',
    familyKey: 'f', rarity: 'common', sellerId: 's', ask: 100, buyNow: 200, durationH: 24, now: T0,
  };
}

describe('price statistics → guidance', () => {
  const day = (day: string, sales: number, median: number, low = median, high = median): MarketHistoryPoint =>
    ({ day, sales, medianPrice: median, lowPrice: low, highPrice: high });

  it('familyStats folds history into the stats card', () => {
    const s = familyStats([
      day('2026-07-10', 4, 100, 80, 130), day('2026-07-11', 6, 110, 90, 150), day('2026-07-12', 2, 120, 100, 160),
    ], 95);
    expect(s.lowestListing).toBe(95);
    expect(s.highestSale).toBe(160);
    expect(s.recentAvg).toBeGreaterThan(100);
    expect(s.estimatedValue).toBeGreaterThan(0);
    expect(s.salesPerDay).toBeGreaterThan(0);
  });

  it('recommended price undercuts a live floor, follows the estimate otherwise, respects recBias and bounds', () => {
    const withFloor = familyStats([day('2026-07-11', 5, 100)], 100);
    expect(recommendedPrice(withFloor)).toBe(97);
    const noFloor = familyStats([day('2026-07-11', 5, 100)], null);
    expect(recommendedPrice(noFloor)).toBe(100);
    expect(recommendedPrice(noFloor, 0.9)).toBe(90);
    expect(recommendedPrice(familyStats([], null))).toBeGreaterThanOrEqual(TRADE.minPrice);
    expect(recommendedPrice(familyStats([day('2026-07-11', 9, TRADE.maxPrice * 2)], null))).toBe(TRADE.maxPrice);
  });

  it('volatility reads the day-median spread against the estimate', () => {
    const calm = familyStats([day('2026-07-10', 5, 100), day('2026-07-11', 5, 102)], null);
    const wild = familyStats([day('2026-07-10', 5, 50), day('2026-07-11', 5, 200)], null);
    expect(calm.volatility).toBeLessThan(0.1);
    expect(wild.volatility).toBeGreaterThan(0.5);
  });
});

describe('search model — the shared query vocabulary', () => {
  it('matchesQuery filters by category/rarity/price and only active rows; sorts are stable orders', () => {
    const a = open({ listingId: 'A', ask: 50, buyNow: 60, familyKey: 'fa' });
    const b = open({ listingId: 'B', ask: 500, buyNow: null, cat: 'geneCard', refKey: 'geneCard:x', rarity: 'rare', familyKey: 'fb' });
    expect(matchesQuery(a, { sort: 'newest', page: 0 })).toBe(true);
    expect(matchesQuery(a, { cat: 'geneCard', sort: 'newest', page: 0 })).toBe(false);
    expect(matchesQuery(b, { rarity: 'rare', sort: 'newest', page: 0 })).toBe(true);
    expect(matchesQuery(a, { maxPrice: 55, sort: 'newest', page: 0 })).toBe(false); // buyNow 60
    expect(matchesQuery({ ...a, state: 'sold' }, { sort: 'newest', page: 0 })).toBe(false);
    const sorted = sortListings([b, a], 'priceAsc');
    expect(sorted[0].listingId).toBe('A');
    expect(MARKET_PAGE_SIZE).toBeGreaterThan(0);
  });
});

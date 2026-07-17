// AUCTION HOUSE ENGINE (docs/AUCTION-HOUSE.md) — the pure market rules the SERVER executes,
// the CLIENT previews, and the SIMULATION drives. Builds directly on the trading-prep layer
// (core/trading.ts: TRADE constants, fee math, eligibility, fraud heuristics;
// core/itemIdentity.ts: provenance + global ids) — nothing there is duplicated here.
//
// WHAT LIVES HERE: the listing lifecycle as a pure state machine (open → bid/buy → settle/
// expire/cancel) with every Ichor movement expressed as LedgerOp rows (the server maps them
// to wallet updates; the sim applies them to agent balances — one rulebook, two hosts),
// price statistics (rolling history → recommended price, estimated value, volatility), and
// the search filter model both the endpoint and the client reuse.
//
// FOUNDATIONAL: a future tradable category inherits everything — eligibility comes from
// trading.ts, identity from itemIdentity.ts, and this engine only ever touches `ref.cat`
// through those modules. No listing rule anywhere keys on a concrete item id.
//
// Pure: no DOM, no state imports, no Math.random, no Date.now (time is always an argument).

import { TRADE, listingFee, minNextBid, priceInBounds, saleTax, sellerProceeds } from './trading';
import type { AuctionListing, MarketHistoryPoint } from './trading';

// ── Listing lifecycle ─────────────────────────────────────────────────────────
export type ListingState = 'active' | 'sold' | 'expired' | 'cancelled';

/** The engine's live row — trading.ts's AuctionListing plus lifecycle + stats keys. */
export interface LiveListing extends AuctionListing {
  state: ListingState;
  /** Aggregation key for price history/stats: equipment DEF id, gene id, cosmetic id —
   *  instances of the same thing share one market identity. */
  familyKey: string;
  /** Rarity band carried for search + baseline rules (def-derived, server-verified). */
  rarity: string;
  ask: number; // the bid floor (buy-now may sit above it)
  feePaid: number;
  /** True for Market Authority baseline stock (docs/AUCTION-HOUSE.md §authority) — sales
   *  pay no seller, proceeds burn (a pure Ichor sink); never bid-sniped, buy-now only. */
  authority: boolean;
}

/** Every Ichor movement the lifecycle produces. The HOST applies these (server → wallet
 *  ledger rows; sim → agent balances). `burn` rows leave circulation (fees, taxes,
 *  authority-sale proceeds) — the market's anti-inflation sinks are explicit and auditable. */
export type LedgerOp =
  | { op: 'charge'; playerId: string; amount: number; why: 'listingFee' | 'buyNow' | 'bidEscrow' }
  | { op: 'refund'; playerId: string; amount: number; why: 'outbid' | 'cancelBid' | 'expiredBid' }
  | { op: 'credit'; playerId: string; amount: number; why: 'saleProceeds' }
  | { op: 'burn'; amount: number; why: 'listingFee' | 'saleTax' | 'authoritySale' };

export interface EngineResult<T> {
  ok: true;
  value: T;
  ops: LedgerOp[];
}
export interface EngineErr {
  ok: false;
  error: string; // machine code — the endpoint maps it to an HTTP error verbatim
}
export type EngineOutcome<T> = EngineResult<T> | EngineErr;

const fail = (error: string): EngineErr => ({ ok: false, error });

export interface OpenListingInput {
  listingId: string;
  globalItemId: string;
  refKey: string;
  cat: string;
  familyKey: string;
  rarity: string;
  sellerId: string;
  ask: number;
  buyNow: number | null;
  durationH: number;
  now: number;
  authority?: boolean;
}

/** Open a listing. The fee charges up-front and BURNS (non-refundable spam brake). */
export function openListing(input: OpenListingInput): EngineOutcome<LiveListing> {
  if (!priceInBounds(input.ask)) return fail('bad-ask');
  if (input.buyNow !== null) {
    if (!priceInBounds(input.buyNow)) return fail('bad-buynow');
    if (input.buyNow < input.ask) return fail('buynow-below-ask');
  }
  if (!TRADE.durationsH.includes(input.durationH)) return fail('bad-duration');
  const fee = input.authority ? 0 : listingFee(input.buyNow ?? input.ask);
  const listing: LiveListing = {
    listingId: input.listingId,
    globalItemId: input.globalItemId,
    ref: { cat: input.cat as LiveListing['ref']['cat'], id: input.refKey.slice(input.refKey.indexOf(':') + 1) },
    familyKey: input.familyKey,
    rarity: input.rarity,
    sellerId: input.sellerId,
    ask: input.ask,
    buyNow: input.buyNow,
    bid: null,
    bidderId: null,
    endsAt: input.now + input.durationH * 3_600_000,
    createdAt: input.now,
    state: 'active',
    feePaid: fee,
    authority: input.authority === true,
  };
  const ops: LedgerOp[] = input.authority ? [] : [
    { op: 'charge', playerId: input.sellerId, amount: fee, why: 'listingFee' },
    { op: 'burn', amount: fee, why: 'listingFee' },
  ];
  return { ok: true, value: listing, ops };
}

/** Place a bid: escrows the FULL amount; the previous bidder refunds; landing inside the
 *  anti-snipe window extends the clock. Authority stock is buy-now only. */
export function placeBid(l: LiveListing, bidderId: string, amount: number, now: number): EngineOutcome<LiveListing> {
  if (l.state !== 'active') return fail('not-active');
  if (l.authority) return fail('authority-buynow-only');
  if (now >= l.endsAt) return fail('ended');
  if (bidderId === l.sellerId) return fail('self-bid');
  const floor = l.bid === null ? l.ask : minNextBid(l.bid);
  if (!Number.isInteger(amount) || amount < floor) return fail('bid-too-low');
  if (amount > TRADE.maxPrice) return fail('bad-ask');
  const ops: LedgerOp[] = [{ op: 'charge', playerId: bidderId, amount, why: 'bidEscrow' }];
  if (l.bid !== null && l.bidderId !== null) ops.push({ op: 'refund', playerId: l.bidderId, amount: l.bid, why: 'outbid' });
  const endsAt = l.endsAt - now <= TRADE.antiSnipeSec * 1000 ? l.endsAt + TRADE.antiSnipeSec * 1000 : l.endsAt;
  return { ok: true, value: { ...l, bid: amount, bidderId, endsAt }, ops };
}

/** Buy-now: immediate settlement at the posted price. The standing bidder refunds. */
export function buyNow(l: LiveListing, buyerId: string, now: number): EngineOutcome<{ listing: LiveListing; sale: SettledSale }> {
  if (l.state !== 'active') return fail('not-active');
  if (now >= l.endsAt) return fail('ended');
  if (l.buyNow === null) return fail('no-buynow');
  if (buyerId === l.sellerId) return fail('self-buy');
  const ops: LedgerOp[] = [{ op: 'charge', playerId: buyerId, amount: l.buyNow, why: 'buyNow' }];
  if (l.bid !== null && l.bidderId !== null) ops.push({ op: 'refund', playerId: l.bidderId, amount: l.bid, why: 'outbid' });
  const sale = settlementOps(l, buyerId, l.buyNow, now, ops);
  return { ok: true, value: { listing: { ...l, state: 'sold', endsAt: now }, sale }, ops };
}

/** Cancel: only bid-free active listings (the fee stays burned). */
export function cancelListing(l: LiveListing, callerId: string): EngineOutcome<LiveListing> {
  if (l.state !== 'active') return fail('not-active');
  if (l.sellerId !== callerId) return fail('not-seller');
  if (l.bid !== null) return fail('has-bids');
  return { ok: true, value: { ...l, state: 'cancelled' }, ops: [] };
}

export interface SettledSale {
  listingId: string;
  familyKey: string;
  refKey: string;
  sellerId: string;
  buyerId: string;
  price: number;
  tax: number;
  proceeds: number;
  at: number;
  authority: boolean;
}

function settlementOps(l: LiveListing, buyerId: string, price: number, at: number, ops: LedgerOp[]): SettledSale {
  const tax = saleTax(price);
  const proceeds = sellerProceeds(price);
  if (l.authority) {
    ops.push({ op: 'burn', amount: price, why: 'authoritySale' }); // baseline sales fully leave circulation
  } else {
    ops.push({ op: 'credit', playerId: l.sellerId, amount: proceeds, why: 'saleProceeds' });
    ops.push({ op: 'burn', amount: tax, why: 'saleTax' });
  }
  return {
    listingId: l.listingId, familyKey: l.familyKey, refKey: `${l.ref.cat}:${l.ref.id}`,
    sellerId: l.sellerId, buyerId, price, tax: l.authority ? price : tax,
    proceeds: l.authority ? 0 : proceeds, at, authority: l.authority,
  };
}

/** Expire a listing past its clock: the standing bid WINS (auction settlement); a bid-free
 *  listing returns to its seller. Pure — the host loops this over expired rows. */
export function settleExpired(l: LiveListing, now: number): EngineOutcome<{ listing: LiveListing; sale: SettledSale | null }> {
  if (l.state !== 'active') return fail('not-active');
  if (now < l.endsAt) return fail('not-ended');
  if (l.bid !== null && l.bidderId !== null) {
    const ops: LedgerOp[] = []; // the escrowed bid already charged at bid time
    const sale = settlementOps(l, l.bidderId, l.bid, now, ops);
    return { ok: true, value: { listing: { ...l, state: 'sold' }, sale }, ops };
  }
  return { ok: true, value: { listing: { ...l, state: 'expired' }, sale: null }, ops: [] };
}

// ── Price statistics (history → guidance) ────────────────────────────────────
export interface FamilyStats {
  lowestListing: number | null; // cheapest ACTIVE ask/buy-now
  highestSale: number | null; // in the retained history window
  recentAvg: number | null; // volume-weighted mean of the last 7 days
  estimatedValue: number | null; // recency-weighted median — the "worth" line
  salesPerDay: number; // velocity over the window
  volatility: number; // 0..1 — day-median spread / estimate (authority input)
}

/** Fold a family's history (+ live floor) into the stats card + pricing inputs. */
export function familyStats(history: readonly MarketHistoryPoint[], lowestActive: number | null): FamilyStats {
  if (history.length === 0) {
    return { lowestListing: lowestActive, highestSale: null, recentAvg: null, estimatedValue: null, salesPerDay: 0, volatility: 0 };
  }
  const days = [...history].sort((a, b) => (a.day < b.day ? -1 : 1));
  const recent = days.slice(-7);
  let sales = 0; let priceVolume = 0; let high = 0;
  for (const d of days) { high = Math.max(high, d.highPrice); }
  for (const d of recent) { sales += d.sales; priceVolume += d.medianPrice * d.sales; }
  const recentAvg = sales > 0 ? priceVolume / sales : null;
  // Estimated value: median of day-medians, recency-weighted by duplication (cheap + stable).
  const weighted: number[] = [];
  days.slice(-14).forEach((d, i, arr) => {
    const w = i >= arr.length - 3 ? 3 : i >= arr.length - 7 ? 2 : 1;
    for (let k = 0; k < w && d.sales > 0; k++) weighted.push(d.medianPrice);
  });
  weighted.sort((a, b) => a - b);
  const estimatedValue = weighted.length > 0 ? weighted[Math.floor(weighted.length / 2)] : recentAvg;
  const medians = days.slice(-14).filter((d) => d.sales > 0).map((d) => d.medianPrice);
  const spread = medians.length > 1 ? Math.max(...medians) - Math.min(...medians) : 0;
  const volatility = estimatedValue && estimatedValue > 0 ? Math.min(1, spread / estimatedValue) : 0;
  return {
    lowestListing: lowestActive,
    highestSale: high > 0 ? high : null,
    recentAvg,
    estimatedValue: estimatedValue ?? null,
    salesPerDay: sales / Math.max(1, Math.min(7, recent.length)),
    volatility,
  };
}

/** The smart ask suggestion: undercut the live floor a hair when one exists, else the
 *  estimate (authority `recBias` drifts it — §authority dynamic pricing). Always in bounds. */
export function recommendedPrice(stats: FamilyStats, recBias = 1): number {
  const base = stats.lowestListing !== null
    ? Math.max(TRADE.minPrice, Math.floor(stats.lowestListing * 0.97))
    : stats.estimatedValue ?? stats.recentAvg ?? TRADE.minPrice * 4;
  return Math.max(TRADE.minPrice, Math.min(TRADE.maxPrice, Math.round(base * recBias)));
}

// ── Search model (one filter vocabulary for endpoint SQL + client rendering) ──
export interface MarketQuery {
  cat?: string; // 'equipment' | 'cosmetic' | 'geneCard'
  family?: string; // exact family key
  rarity?: string;
  text?: string; // family-name substring (resolved to keys by the caller's catalog)
  maxPrice?: number;
  minPrice?: number;
  season?: number;
  sort: 'endingSoon' | 'priceAsc' | 'priceDesc' | 'newest';
  page: number;
}

export const MARKET_PAGE_SIZE = 24;

/** Client-side predicate twin of the endpoint's SQL — the sim and any cached-page filtering
 *  use this so both hosts agree on what a query means. */
export function matchesQuery(l: LiveListing, q: MarketQuery, priceOf: (l: LiveListing) => number = (x) => x.buyNow ?? x.bid ?? x.ask): boolean {
  if (l.state !== 'active') return false;
  if (q.cat && l.ref.cat !== q.cat) return false;
  if (q.family && l.familyKey !== q.family) return false;
  if (q.rarity && l.rarity !== q.rarity) return false;
  const p = priceOf(l);
  if (q.maxPrice !== undefined && p > q.maxPrice) return false;
  if (q.minPrice !== undefined && p < q.minPrice) return false;
  return true;
}

export function sortListings(rows: LiveListing[], sort: MarketQuery['sort']): LiveListing[] {
  const price = (l: LiveListing): number => l.buyNow ?? l.bid ?? l.ask;
  const out = [...rows];
  switch (sort) {
    case 'endingSoon': out.sort((a, b) => a.endsAt - b.endsAt); break;
    case 'priceAsc': out.sort((a, b) => price(a) - price(b)); break;
    case 'priceDesc': out.sort((a, b) => price(b) - price(a)); break;
    case 'newest': out.sort((a, b) => b.createdAt - a.createdAt); break;
  }
  return out;
}

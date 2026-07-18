// TRADING ARCHITECTURE (docs/TRADING-PREP.md) — the complete Auction House BACKEND PREPARATION.
// Deliberately NO gameplay and NO UI (the spec's contract): this module is the policy layer a
// future Ichor-denominated Auction House plugs into without architectural rewrites —
// eligibility rules, the market's economic constants (fees/taxes/durations/bounds), the full
// listing/bid/history type vocabulary, and REAL fraud-detection heuristics over trade events
// (pure + unit-tested now, servable later).
//
// AUTHORITY MODEL: every trade operation is SERVER-side (docs/ONLINE-FOUNDATION.md §authority).
// The client only renders listings and submits intents; eligibility is evaluated on BOTH sides
// with this same module (functions/ imports it — the premium.ts shared-code precedent), so the
// server can never disagree with what the UI promised.
//
// Pure data module: no DOM, no state imports, no Math.random.

import type { ProvenanceStamp, TradableCategory, TradableRef } from './itemIdentity';

// ── Economic constants (the Ichor market's shape — architecture, reviewable in one place) ──
export const TRADE = {
  /** Account requirements — trading is an EARNED capability (fraud friction, docs §fraud). */
  minCampaignStage: 10,
  minAccountAgeDays: 3,
  /** Client-side daily listing budget (the server enforces its own; this keeps UI honest). */
  maxListingsPerDay: 12,
  /** Listing fee: paid up-front in Ichor, NON-refundable (spam brake). Fraction of ask. */
  listingFeeFrac: 0.05,
  listingFeeMin: 1,
  /** Sale tax: deducted from the seller's proceeds at settlement (the Ichor sink). */
  saleTaxFrac: 0.1,
  /** Price bounds (Ichor). The ceiling exists so a "1e15 Ichor" listing can't exist. */
  minPrice: 5,
  maxPrice: 100_000,
  /** Offered listing durations (hours). */
  durationsH: [12, 24, 48] as readonly number[],
  /** Bids must beat the standing bid by this fraction (rounded up, min +1). */
  bidIncrementFrac: 0.05,
  /** A bid landing inside this window extends the auction by it (anti-snipe). */
  antiSnipeSec: 120,
  /** Market history retention the price-trend endpoints serve (days). */
  historyDays: 30,
} as const;

// ── Eligibility ────────────────────────────────────────────────────────────────
/** Why a thing cannot trade right now. Machine-readable; the UI maps these to copy. */
export type TradeBlock =
  | 'bound' // soul-bound (arena exclusives, tutorial grants) — permanent
  | 'guest' // Guest Mode has no durable identity to trade from
  | 'campaign' // account below TRADE.minCampaignStage
  | 'accountAge' // account younger than TRADE.minAccountAgeDays
  | 'listingCap' // daily listing budget spent
  | 'equipped' // equipment currently worn by a hero (unequip first)
  | 'slotted' // Mulligan modifier grafted into an organism (unslot first; reforge-locked = never)
  | 'category'; // not a tradable category at all (defense-in-depth)

export interface TradeContext {
  campaignStage: number;
  accountAgeDays: number;
  listedToday: number;
  guest: boolean;
  /** The ref is currently equipped in a hero loadout (equipment only). */
  equipped?: boolean;
  /** The ref is currently grafted into a tower organism (mulliganPiece only). */
  slotted?: boolean;
}

export interface TradeEligibility {
  ok: boolean;
  blocks: TradeBlock[];
}

const CATEGORY_SET: ReadonlySet<string> = new Set(['equipment', 'cosmetic', 'geneCard', 'mulliganPiece'] satisfies TradableCategory[]);

/** The ONE eligibility evaluation — client UI and server validation both call this. */
export function tradeEligibility(ref: TradableRef, stamp: ProvenanceStamp | null, ctx: TradeContext): TradeEligibility {
  const blocks: TradeBlock[] = [];
  if (!CATEGORY_SET.has(ref.cat)) blocks.push('category');
  if (stamp?.bound) blocks.push('bound');
  if (ctx.guest) blocks.push('guest');
  if (ctx.campaignStage < TRADE.minCampaignStage) blocks.push('campaign');
  if (ctx.accountAgeDays < TRADE.minAccountAgeDays) blocks.push('accountAge');
  if (ctx.listedToday >= TRADE.maxListingsPerDay) blocks.push('listingCap');
  if (ref.cat === 'equipment' && ctx.equipped) blocks.push('equipped');
  if (ref.cat === 'mulliganPiece' && ctx.slotted) blocks.push('slotted');
  return { ok: blocks.length === 0, blocks };
}

/** Human copy per block (UI-safe; localization migrates later with the screen). */
export function tradeBlockLabel(block: TradeBlock): string {
  switch (block) {
    case 'bound': return 'Soul-bound — this specimen can never be traded.';
    case 'guest': return 'Guest sessions cannot trade — create an account first.';
    case 'campaign': return `Trading opens at Campaign Stage ${TRADE.minCampaignStage}.`;
    case 'accountAge': return `Accounts must be ${TRADE.minAccountAgeDays} days old to trade.`;
    case 'listingCap': return `Daily listing limit reached (${TRADE.maxListingsPerDay}).`;
    case 'equipped': return 'Unequip this gear before listing it.';
    case 'slotted': return 'This modifier is grafted into an organism — unslot it first.';
    case 'category': return 'This cannot be traded.';
  }
}

// ── Listing math (pure — the server recomputes these; the client previews them) ──
export function listingFee(askIchor: number): number {
  return Math.max(TRADE.listingFeeMin, Math.ceil(askIchor * TRADE.listingFeeFrac));
}
export function saleTax(priceIchor: number): number {
  return Math.ceil(priceIchor * TRADE.saleTaxFrac);
}
export function sellerProceeds(priceIchor: number): number {
  return Math.max(0, priceIchor - saleTax(priceIchor));
}
export function minNextBid(standingBid: number): number {
  return standingBid + Math.max(1, Math.ceil(standingBid * TRADE.bidIncrementFrac));
}
export function priceInBounds(askIchor: number): boolean {
  return Number.isInteger(askIchor) && askIchor >= TRADE.minPrice && askIchor <= TRADE.maxPrice;
}

// ── The future market's type vocabulary (types ONLY — no implementation yet) ──
/** One live Auction House listing (server-owned row; the client renders it verbatim). */
export interface AuctionListing {
  listingId: string; // server-assigned
  globalItemId: string; // itemIdentity.globalItemId — assigned at first listing
  ref: TradableRef;
  sellerId: string;
  buyNow: number | null; // Ichor (null = bid-only)
  bid: number | null; // standing bid (null = none yet)
  bidderId: string | null;
  endsAt: number; // epoch ms (anti-snipe may extend)
  createdAt: number;
}

export interface AuctionBid {
  listingId: string;
  bidderId: string;
  amount: number;
  at: number;
}

/** One aggregated market-history point (per item def / cosmetic id / card id, per UTC day). */
export interface MarketHistoryPoint {
  day: string; // UTC day key
  sales: number;
  medianPrice: number;
  lowPrice: number;
  highPrice: number;
}

/** A seller's public track record (trust surface + fraud input). */
export interface SellerRecord {
  playerId: string;
  sales: number;
  disputes: number;
  firstSaleAt: number;
}

// ── Fraud detection hooks (docs/TRADING-PREP.md §fraud) ───────────────────────
/** One settled trade the audit inspects (server event log shape). */
export interface TradeEvent {
  at: number;
  itemKey: string; // refKey of the traded thing
  fromId: string;
  toId: string;
  price: number; // Ichor
  /** The item's recent median price at settlement (0 = unknown/new). */
  medianPrice: number;
}

export type FraudSignal =
  | { kind: 'rapidTransfer'; itemKey: string; hops: number; windowMs: number } // same item hopping owners fast (mule chain)
  | { kind: 'priceOutlier'; itemKey: string; price: number; medianPrice: number } // >outlierMult× or <1/outlierMult× the median (RMT wash shapes)
  | { kind: 'selfDealing'; a: string; b: string; trades: number } // the same pair trading back and forth
  | { kind: 'circular'; itemKey: string }; // an item returning to a previous owner

export const FRAUD = {
  rapidHops: 3, // ≥ hops of the SAME item inside the window
  rapidWindowMs: 6 * 3_600_000,
  outlierMult: 8, // price beyond ×8 / ÷8 of median flags
  pairTrades: 4, // ≥ mutual trades between the same two accounts flags
} as const;

/** Pure heuristics over a trade-event window. Server-side today's caller; the contract and
 *  tests live here so the rules are reviewable with the rest of the economy. */
export function auditTradeEvents(events: readonly TradeEvent[]): FraudSignal[] {
  const signals: FraudSignal[] = [];
  // rapidTransfer + circular: walk per-item chains in time order.
  const byItem = new Map<string, TradeEvent[]>();
  for (const e of events) {
    const list = byItem.get(e.itemKey) ?? [];
    list.push(e);
    byItem.set(e.itemKey, list);
  }
  for (const [itemKey, list] of byItem) {
    list.sort((a, b) => a.at - b.at);
    for (let i = 0; i < list.length; i++) {
      let hops = 1;
      for (let j = i + 1; j < list.length && list[j].at - list[i].at <= FRAUD.rapidWindowMs; j++) hops++;
      if (hops >= FRAUD.rapidHops) {
        signals.push({ kind: 'rapidTransfer', itemKey, hops, windowMs: FRAUD.rapidWindowMs });
        break;
      }
    }
    const owners = new Set<string>();
    for (const e of list) {
      if (owners.has(e.toId)) {
        signals.push({ kind: 'circular', itemKey });
        break;
      }
      owners.add(e.fromId);
    }
  }
  // priceOutlier
  for (const e of events) {
    if (e.medianPrice > 0 && (e.price > e.medianPrice * FRAUD.outlierMult || e.price < e.medianPrice / FRAUD.outlierMult)) {
      signals.push({ kind: 'priceOutlier', itemKey: e.itemKey, price: e.price, medianPrice: e.medianPrice });
    }
  }
  // selfDealing: unordered pair counts.
  const pair = new Map<string, number>();
  for (const e of events) {
    const key = e.fromId < e.toId ? `${e.fromId}|${e.toId}` : `${e.toId}|${e.fromId}`;
    pair.set(key, (pair.get(key) ?? 0) + 1);
  }
  for (const [key, trades] of pair) {
    if (trades >= FRAUD.pairTrades) {
      const [a, b] = key.split('|');
      signals.push({ kind: 'selfDealing', a, b, trades });
    }
  }
  return signals;
}

/** Future-PvP legality seam (docs/TRADING-PREP.md §pvp): whether an item may be fielded in
 *  ranked arena play. Everything is legal today; season rulesets will filter here. */
export function pvpLegality(_ref: TradableRef, _stamp: ProvenanceStamp | null): { legal: boolean; reason?: string } {
  return { legal: true };
}

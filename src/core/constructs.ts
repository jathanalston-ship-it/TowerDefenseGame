// MARKET CONSTRUCTS (docs/CONSTRUCTS.md) — the game's own AI players. A small fixed roster of
// accounts that play the game around the clock (the progression simulator's virtual player,
// driving the REAL meta layer) and trade what they earn on the Auction House through the SAME
// endpoint handlers a player hits. They are ALWAYS labelled (⚙ Construct) and never appear on
// a leaderboard or the Arena ladder.
//
// This module is the shared, pure half: the roster, the tunables, and every trading decision as
// a pure function — so the Worker that runs them, the market simulation that proves them
// (`npm run sim:market`, scenario "constructs") and the client that labels them all read ONE
// definition. No meta, no DOM, no network.
//
// Economy contract (why constructs can't distort the market):
//   • They only sell items their own play earned and only spend Ichor their own play earned
//     (deposits come out of the save, capped per day) — no minting, no purchases.
//   • They sell AT the market (recommended price × a narrow band, never a dump) and buy only AT
//     OR BELOW value — they add supply and liquidity, never push a price up or crash it.
//   • They never trade with each other (no wash volume) and never touch authority stock.
//   • Their volume is capped well under a player's (listings, buys, bids, deposits per day).

import { TRADE } from './trading';

export type TraderStyle = 'fair' | 'bargain' | 'collector' | 'clearer';

export interface ConstructDef {
  /** Fixed account id. UUID shape (the API's isPlayerId) but VERSION 0 — crypto.randomUUID
   *  (every real client id) is always version 4, so no player can ever hold one of these. */
  id: string;
  name: string;
  style: TraderStyle;
  /** How it plays: a progression-simulator persona id (src/dev/personas.ts). */
  play: string;
  /** Per-construct RNG stream seed. */
  seed: number;
}

export const CONSTRUCTS: readonly ConstructDef[] = [
  { id: 'c0057c7a-0000-0000-0000-000000000001', name: 'Ossuary Clerk', style: 'fair', play: 'average', seed: 101 },
  { id: 'c0057c7a-0000-0000-0000-000000000002', name: 'Mire Assessor', style: 'bargain', play: 'efficient', seed: 202 },
  { id: 'c0057c7a-0000-0000-0000-000000000003', name: 'Pale Broker', style: 'clearer', play: 'equipment', seed: 303 },
  { id: 'c0057c7a-0000-0000-0000-000000000004', name: 'Thrall Six', style: 'fair', play: 'campaign', seed: 404 },
  { id: 'c0057c7a-0000-0000-0000-000000000005', name: 'Vesper Ledger', style: 'collector', play: 'completionist', seed: 505 },
  { id: 'c0057c7a-0000-0000-0000-000000000006', name: 'Carrion Quartermaster', style: 'clearer', play: 'infinite', seed: 606 },
  { id: 'c0057c7a-0000-0000-0000-000000000007', name: 'Sallow Appraiser', style: 'bargain', play: 'towers', seed: 707 },
  { id: 'c0057c7a-0000-0000-0000-000000000008', name: 'Hollow Factor', style: 'collector', play: 'heroes', seed: 808 },
];

export const CONSTRUCT = {
  /** A tick never replays more than this much play — after an outage a construct resumes, it
   *  does not binge (the CPU budget per scheduled run stays bounded). */
  maxCatchUpSec: 3_600,
  /** Hard ceiling on runs played in one tick (CPU guard on top of maxCatchUpSec: a late-game
   *  virtual run costs ~0.2 s of CPU, so a full catch-up for the whole roster stays ~20 s). */
  maxRunsPerTick: 12,
  /** How often a construct visits the market (it plays every tick; it trades this often). */
  marketEveryMs: 30 * 60_000,
  /** Daily volume caps — each well under a player's (TRADE.maxListingsPerDay = 12). */
  maxListingsPerDay: 6,
  /** Chance a market visit lists one item (≈ 48 visits/day ⇒ the day's listings spread out
   *  instead of front-loading the morning). At most ONE listing per visit. */
  listChance: 0.2,
  maxBuysPerDay: 4,
  maxBidsPerDay: 4,
  /** Ichor moved from the save into the market wallet per day, at most (its own earnings). */
  maxDepositPerDay: 600,
  /** The market-wallet balance a construct tops up to (listing fees + a buying float). */
  walletTarget: 400,
  /** Proceeds above this come back out to the save (they feed its own progression). */
  withdrawAbove: 2_000,
  /** Live listings a construct keeps per item family at most — far under the audit's monopoly
   *  shape (MANIPULATION.monopolyShare of ≥ 5 listings), so it never corners a family's book. */
  maxPerFamily: 2,
  /** Listings considered per market visit when shopping (bounded work per tick). */
  shopScan: 24,
  /** Ask = recommended × a band per style (never a dump: the floor is ≥ 0.9×). */
  askBand: { fair: [0.95, 1.15], bargain: [1.0, 1.2], collector: [1.05, 1.25], clearer: [0.9, 1.05] } as Record<TraderStyle, readonly [number, number]>,
  /** The most it pays, as a fraction of the family's market value (≤ 1.1× — never chases). */
  payUpTo: { fair: 1.0, bargain: 0.85, collector: 1.1, clearer: 0.8 } as Record<TraderStyle, number>,
  /** Share of listings that also carry a buy-now, and its markup band over the ask. */
  buyNowShare: 0.75,
  buyNowMarkup: [1.15, 1.35] as const,
  /** Fraction of the market wallet a single purchase may use. */
  maxSpendFrac: 0.5,
} as const;

const BY_ID = new Map(CONSTRUCTS.map((c) => [c.id, c]));

/** Is this account one of the game's constructs? (The client labels by it; the leaderboard
 *  and Arena endpoints refuse by it.) */
export function isConstructId(id: string | null | undefined): boolean {
  return typeof id === 'string' && BY_ID.has(id);
}

export function constructOf(id: string | null | undefined): ConstructDef | undefined {
  return typeof id === 'string' ? BY_ID.get(id) : undefined;
}

const clampPrice = (v: number): number => Math.max(TRADE.minPrice, Math.min(TRADE.maxPrice, Math.round(v)));

/** The ask a construct lists at: the market's recommended price × its style band. `roll` ∈ [0,1). */
export function constructAsk(recommended: number, style: TraderStyle, roll: number): number {
  const [lo, hi] = CONSTRUCT.askBand[style];
  return clampPrice(recommended * (lo + (hi - lo) * roll));
}

/** The buy-now it attaches (or null for a plain auction). Rolls ∈ [0,1). */
export function constructBuyNow(ask: number, shareRoll: number, markupRoll: number): number | null {
  if (shareRoll >= CONSTRUCT.buyNowShare) return null;
  const [lo, hi] = CONSTRUCT.buyNowMarkup;
  return clampPrice(ask * (lo + (hi - lo) * markupRoll));
}

/** The most a construct of this style will pay for a family worth `value` (the family's
 *  estimated value, else the recommended price). 0 when the market has no read at all. */
export function constructWorth(value: number | null, style: TraderStyle): number {
  if (value === null || !(value > 0)) return 0;
  return Math.floor(value * CONSTRUCT.payUpTo[style]);
}

/** Whether a listing is one a construct may shop at all: a PLAYER's (not authority stock,
 *  not another construct, not its own) and still active. */
export function shoppable(l: { sellerId: string; authority: boolean; state: string }, selfId: string): boolean {
  return l.state === 'active' && !l.authority && l.sellerId !== selfId && !isConstructId(l.sellerId);
}

/** Buy-now decision: affordable, within the per-purchase spend cap, at or below worth. */
export function wantsBuyNow(price: number, worth: number, walletBalance: number): boolean {
  return price > 0 && price <= worth && price <= walletBalance * CONSTRUCT.maxSpendFrac;
}

/** The bid a construct places on an auction, or null: the minimum next bid if that is still at
 *  or below worth and within the spend cap (it never escalates past value — no bid wars). */
export function constructBid(minNext: number, worth: number, walletBalance: number): number | null {
  return minNext > 0 && minNext <= worth && minNext <= walletBalance * CONSTRUCT.maxSpendFrac ? minNext : null;
}

/** Ichor to move save → market wallet now: top the wallet up to its target, bounded by what the
 *  save holds and the day's remaining deposit allowance. */
export function depositAmount(saveIchor: number, walletBalance: number, depositedToday: number): number {
  const room = Math.max(0, CONSTRUCT.maxDepositPerDay - depositedToday);
  const want = Math.max(0, CONSTRUCT.walletTarget - walletBalance);
  return Math.max(0, Math.floor(Math.min(saveIchor, room, want)));
}

/** Ichor to move market wallet → save now (proceeds above the float feed its progression). */
export function withdrawAmount(walletBalance: number): number {
  return walletBalance > CONSTRUCT.withdrawAbove ? Math.floor(walletBalance - CONSTRUCT.walletTarget) : 0;
}

/** Seconds of play a tick owes for `elapsedMs` of wall time (nonstop, real-time pace, capped). */
export function playSecondsFor(elapsedMs: number): number {
  return Math.max(0, Math.min(CONSTRUCT.maxCatchUpSec, Math.floor(elapsedMs / 1000)));
}

/** Whether a market visit is due: the half-hour slot changed since the last tick. */
export function marketDue(lastTickMs: number, now: number): boolean {
  return Math.floor(lastTickMs / CONSTRUCT.marketEveryMs) !== Math.floor(now / CONSTRUCT.marketEveryMs);
}

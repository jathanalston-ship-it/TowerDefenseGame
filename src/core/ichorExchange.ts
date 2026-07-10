// ICHOR EXCHANGE (docs/MARKET.md §exchange) — the black blood barters DOWN into the main
// currencies: Genome Cores, Gene Essence, and Scrap. Six trade lots (two per currency — a
// small taste and a bulk lot) refresh on a 30-minute window, and BOTH the cost and the
// volume scale to the player's Ichor reserve at the moment the window rolls:
//
//   reserve 10   → "1 Ichor → 10 Genome Cores" · "1 Ichor → 1 Scrap"
//   reserve 1000 → "≈250 Ichor → ≈50 Scrap" (the bulk lot)
//
// The volume curve is deliberately SUBLINEAR (qty ∝ cost^0.7): a whale's mega-trade pays a
// worse per-Ichor rate than a starter's pocket trade, so hoarded Ichor can accelerate the
// grind currencies but never snowballs the economy. Ichor itself stays never-farmable
// (docs/MARKET.md) — this is a one-way valve out of the premium reserve.
//
// PURE core: window math + the deterministic lot roll live here (a window's offers are a
// pure function of (window index, reserve snapshot) — reloading mid-window shows identical
// lots). The meta layer owns the persisted snapshot, the max-window clock-tamper rule
// (mirroring the Splice Market), and the grants.

import { hashStr } from './hash';

export const EXCHANGE = {
  refreshMs: 1_800_000, // 30-minute trade windows
  /** Lot sizing as a fraction of the reserve snapshot (small taste vs bulk lot). */
  costFracSmall: 0.1,
  costFracBig: 0.25,
  minCostSmall: 1,
  minCostBig: 2,
  jitter: 0.15, // ±15% seeded cost/volume wobble per window — lots feel alive, never random
  /** The anti-snowball curve: volume ∝ cost^exponent (sublinear — bulk pays a worse rate). */
  qtyExponent: 0.7,
  /** Bulk lots carry a small volume sweetener ON TOP of the sublinear curve. */
  bulkBonus: 1.1,
} as const;

/** The currencies Ichor may barter into. Cores flow richest, Scrap scarcest — coefficients
 *  anchored to the live economy (expedition bundles + Bio-Roulette pod parities). */
export type ExchangeCurrency = 'genomeCores' | 'geneEssence' | 'scrap';
export const EXCHANGE_CURRENCIES: ExchangeCurrency[] = ['genomeCores', 'geneEssence', 'scrap'];
export const EXCHANGE_RATE0: Record<ExchangeCurrency, number> = {
  genomeCores: 10, // 1 Ichor ≈ 10 cores at pocket size
  geneEssence: 6, // essence sits between cores and mats
  scrap: 1, // 1 Ichor ≈ 1 scrap at pocket size — scrap is the scarce mat
};

export interface ExchangeOffer {
  index: number; // 0..5 — stable slot identity within the window
  currency: ExchangeCurrency;
  cost: number; // Ichor
  qty: number; // currency received
  bulk: boolean; // the second (bulk) lot of its currency
}

/** Current trade window for a clock value. */
export function exchangeWindow(now: number): number {
  return Math.floor(now / EXCHANGE.refreshMs);
}

/** Milliseconds until the NEXT window begins (refresh countdown). */
export function msToExchangeRefresh(now: number): number {
  return (exchangeWindow(now) + 1) * EXCHANGE.refreshMs - now;
}

/** One tiny deterministic stream per (window, reserve) — the lot roll's only entropy. */
function stream(window: number, reserve: number): () => number {
  let h = hashStr(`ichor-exchange:${window}:${reserve}`) || 1;
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 0x1_0000_0000;
  };
}

/** The six lots for a window, scaled to the reserve SNAPSHOT (taken when the window first
 *  rolled — mid-window spends/gains never re-price the board). Deterministic + pure. */
export function rollExchange(window: number, reserve: number): ExchangeOffer[] {
  const rng = stream(window, Math.max(0, Math.floor(reserve)));
  const jit = (): number => 1 + (rng() * 2 - 1) * EXCHANGE.jitter;
  const r = Math.max(1, Math.floor(reserve));
  const offers: ExchangeOffer[] = [];
  for (const currency of EXCHANGE_CURRENCIES) {
    const small = Math.max(EXCHANGE.minCostSmall, Math.round(r * EXCHANGE.costFracSmall * jit()));
    const bigRaw = Math.max(EXCHANGE.minCostBig, Math.round(r * EXCHANGE.costFracBig * jit()));
    const big = Math.max(bigRaw, small + 1); // the bulk lot always outweighs the taste
    const qty = (cost: number, bulk: boolean): number =>
      Math.max(1, Math.round(EXCHANGE_RATE0[currency] * Math.pow(cost, EXCHANGE.qtyExponent) * (bulk ? EXCHANGE.bulkBonus : 1) * jit()));
    offers.push({ index: offers.length, currency, cost: small, qty: qty(small, false), bulk: false });
    offers.push({ index: offers.length, currency, cost: big, qty: qty(big, true), bulk: true });
  }
  return offers;
}

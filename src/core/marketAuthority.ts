// MARKET AUTHORITY (docs/AUCTION-HOUSE.md §authority) — the invisible, always-running
// economic steward. NOT an NPC: players only ever see ordinary listings and gently drifting
// fees — every intervention is a bounded, smooth parameter adjustment, never a hard cap and
// never a price override. The host advances it in WINDOWS (the server folds a tick into
// request handling; the sim ticks per simulated day) — "always running" is a property of the
// state, not a daemon.
//
// It watches (MarketMetrics): supply, demand, average prices, sales velocity, listing
// volume, player wealth, Ichor circulation, active traders, stale inventory, rare
// availability, and volatility. It answers with (AuthorityState): listing-fee and sale-tax
// multipliers, baseline-stock level, and a recommended-price bias — plus fraud flags from
// manipulation detectors layered over trading.ts's auditTradeEvents.
//
// Pure: no registries, no DOM, no Date.now. Catalogs arrive as data (BaselineCatalogEntry)
// so the server, the client preview, and the simulation share one rulebook.

import { FRAUD, auditTradeEvents } from './trading';
import type { FraudSignal, TradeEvent } from './trading';
import type { LiveListing } from './auction';

// ── Metrics (one window's observation of the whole market) ───────────────────
export interface MarketMetrics {
  windowKey: number; // host-defined window index (server: UTC hour; sim: day)
  activeListings: number;
  listingsOpened: number;
  sales: number;
  saleVolume: number; // Ichor moved through settlements this window
  avgSalePrice: number; // 0 when no sales
  uniqueTraders: number;
  ichorBurned: number; // fees + taxes + authority sales (the sinks' output)
  ichorCirculation: number; // host-estimated live Ichor supply (wealth telemetry)
  medianWealth: number; // median trader wallet (host-estimated)
  staleListings: number; // active listings older than half their duration with no bids
  rareActiveListings: number; // rarity ≥ rare among active (scarcity signal)
  volatilityAvg: number; // mean familyStats.volatility across sampled families (0..1)
}

export function emptyMetrics(windowKey: number): MarketMetrics {
  return {
    windowKey, activeListings: 0, listingsOpened: 0, sales: 0, saleVolume: 0, avgSalePrice: 0,
    uniqueTraders: 0, ichorBurned: 0, ichorCirculation: 0, medianWealth: 0, staleListings: 0,
    rareActiveListings: 0, volatilityAvg: 0,
  };
}

// ── Authority state (the levers — all bounded, all smooth) ───────────────────
export interface AuthorityState {
  windowKey: number;
  /** Multiplies TRADE.listingFeeFrac (anti-inflation lever #1). */
  feeMult: number;
  /** Multiplies TRADE.saleTaxFrac (anti-inflation lever #2 — the big sink). */
  taxMult: number;
  /** Target count of authority baseline listings per eligible family (supply lever). */
  baselineLevel: number;
  /** Multiplies recommendedPrice (guidance lever — steers asks, never forces them). */
  recBias: number;
  /** Rolling inflation index (1 = calibration baseline; the tick's main input). */
  inflationIdx: number;
  /** Fast EWMA of the average sale price (~recent week at daily windows). */
  avgPriceEwma: number;
  /** SLOW EWMA (~quarter horizon) — the drift baseline. A slow boil (fractions of a percent
   *  per window) is invisible window-over-window but COMPOUNDS in fast/slow, so the index
   *  still sees it. */
  avgPriceBase: number;
}

export const AUTHORITY_BOUNDS = {
  feeMult: [1, 2.5] as const, // 5% → at most 12.5% listing fee under heavy inflation
  taxMult: [1, 2] as const, // 10% → at most 20% sale tax
  baselineLevel: [1, 6] as const, // listings per eligible family
  recBias: [0.85, 1.15] as const, // guidance drifts ±15%, never more
  /** Per-window drift caps — interventions are gradual by construction ("without feeling
   *  artificial"): even a crash moves levers a few percent per window. */
  maxStepFrac: 0.06,
} as const;

export function defaultAuthorityState(windowKey = 0): AuthorityState {
  return { windowKey, feeMult: 1, taxMult: 1, baselineLevel: 2, recBias: 1, inflationIdx: 1, avgPriceEwma: 0, avgPriceBase: 0 };
}

/** Smoothly walk `cur` toward `target` (bounded step, then clamped to the lever's range). */
function drift(cur: number, target: number, [lo, hi]: readonly [number, number]): number {
  const step = Math.max(-AUTHORITY_BOUNDS.maxStepFrac, Math.min(AUTHORITY_BOUNDS.maxStepFrac, (target - cur)));
  return Math.max(lo, Math.min(hi, cur + step));
}

/**
 * One authority window: fold fresh metrics into the levers.
 *
 * Inflation index: an EWMA over (avg sale price growth) + (circulation growth outpacing
 * burn). Rising index ⇒ raise fees/taxes/baseline supply and cool the recommended-price
 * bias; falling ⇒ relax everything toward neutral. Illiquidity (stale listings dominating)
 * lowers fees to invite listings regardless of the index — market HEALTH beats dogma.
 */
export function authorityTick(state: AuthorityState, m: MarketMetrics, prev: MarketMetrics | null): AuthorityState {
  // Price growth against the LONG memory (sales-weighted EWMA), not just the last window —
  // a thin market inflating 2%/window forever must still register. Sparse windows (< 3
  // sales) neither move the EWMA nor read as growth: noise from two sales is not a trend.
  const hasSignal = m.sales >= 3 && m.avgSalePrice > 0;
  const avgPriceEwma = hasSignal
    ? state.avgPriceEwma > 0 ? state.avgPriceEwma * 0.85 + m.avgSalePrice * 0.15 : m.avgSalePrice
    : state.avgPriceEwma;
  const avgPriceBase = hasSignal
    ? state.avgPriceBase > 0 ? state.avgPriceBase * 0.98 + m.avgSalePrice * 0.02 : m.avgSalePrice
    : state.avgPriceBase;
  const priceGrowth = avgPriceEwma > 0 && avgPriceBase > 0 ? avgPriceEwma / avgPriceBase : 1;
  // Sink coverage: how much of the moved Ichor left circulation (higher = deflationary).
  const sinkCover = m.saleVolume > 0 ? m.ichorBurned / m.saleVolume : 0.15;
  // Weak sinks amplify the reading; strong sinks damp it only slightly — burn volume must
  // never MASK real price growth (authority sales burning 100% would otherwise blind the
  // index exactly when its own supply lever is working hardest).
  const instant = priceGrowth * (sinkCover < 0.1 ? 1.04 : sinkCover > 0.25 ? 0.99 : 1);
  const inflationIdx = state.inflationIdx * 0.8 + Math.max(0.5, Math.min(2, instant)) * 0.2;
  void prev; // superseded by the EWMA memory; kept in the signature for host telemetry parity

  const hot = inflationIdx > 1.05; // sustained price growth
  const cold = inflationIdx < 0.95; // deflation / dying market
  const illiquid = m.activeListings > 0 && m.staleListings / m.activeListings > 0.5;
  const scarce = m.activeListings > 0 && m.rareActiveListings === 0;

  return {
    windowKey: m.windowKey,
    inflationIdx,
    avgPriceEwma,
    avgPriceBase,
    feeMult: drift(state.feeMult, illiquid ? 1 : hot ? 2 : 1, AUTHORITY_BOUNDS.feeMult),
    // Both sink levers RELAX toward neutral whenever the index isn't hot — a calm market
    // never keeps paying crisis taxes (`cold` isn't required; absence of heat is enough).
    taxMult: drift(state.taxMult, hot ? 1.8 : 1, AUTHORITY_BOUNDS.taxMult),
    // Inflation ⇒ more baseline supply absorbs Ichor (authority sales burn 100%);
    // scarcity of rares ⇒ modestly more foundational stock keeps newcomers shopping.
    baselineLevel: Math.round(drift(state.baselineLevel, hot ? 5 : scarce ? 3 : 2, AUTHORITY_BOUNDS.baselineLevel) * 100) / 100,
    recBias: drift(state.recBias, hot ? 0.9 : cold ? 1.08 : 1, AUTHORITY_BOUNDS.recBias),
  };
}

/** The live fee/tax fractions a host charges this window (TRADE base × authority). */
export function effectiveFees(state: AuthorityState): { listingFeeFrac: number; saleTaxFrac: number } {
  return { listingFeeFrac: 0.05 * state.feeMult, saleTaxFrac: 0.1 * state.taxMult };
}

// ── Baseline stock (§baseline) — foundational items ONLY ─────────────────────
/** One catalog row the host derives from its real registries. `exclusive` marks anything
 *  the authority must NEVER stock: seasonal/limited/event/prestige/arena/player-scarcity —
 *  the host computes it from def flags (cosmetic source ≠ 'cultivate', equipment exotic,
 *  gene gated/rarity>uncommon, …); the rule here just enforces it. */
export interface BaselineCatalogEntry {
  familyKey: string;
  cat: 'equipment' | 'cosmetic' | 'geneCard' | 'mulliganPiece';
  rarity: string;
  exclusive: boolean;
}

const BASELINE_RARITY: ReadonlySet<string> = new Set(['common', 'uncommon', 'rare']);
const BASELINE_MAX_RARITY: Record<BaselineCatalogEntry['cat'], ReadonlySet<string>> = {
  geneCard: new Set(['common', 'uncommon']),
  equipment: new Set(['common']),
  cosmetic: new Set(['rare']), // 'cultivate' basics sit at rare — the entry band
  mulliganPiece: new Set(['common', 'uncommon']), // the genes band — humble sequences only
};

export function baselineEligible(e: BaselineCatalogEntry): boolean {
  if (e.exclusive) return false;
  return BASELINE_RARITY.has(e.rarity) && BASELINE_MAX_RARITY[e.cat].has(e.rarity);
}

/** What the authority should list RIGHT NOW: for each eligible family below the target
 *  live-count, one restock order at the guided price. Deterministic (host supplies ids). */
export interface RestockOrder { familyKey: string; cat: BaselineCatalogEntry['cat']; rarity: string; price: number }

export function planBaselineRestock(
  catalog: readonly BaselineCatalogEntry[],
  liveAuthorityCount: (familyKey: string) => number,
  guidePrice: (familyKey: string) => number,
  state: AuthorityState,
  /** Population scaling: baseline supply must MEET demand (a flat per-family count starves
   *  large shards). Hosts derive it from live traders — `baselineDemandScale(uniqueTraders)`. */
  demandScale = 1,
): RestockOrder[] {
  const orders: RestockOrder[] = [];
  const target = Math.round(state.baselineLevel * Math.max(1, demandScale));
  for (const e of catalog) {
    if (!baselineEligible(e)) continue;
    if (liveAuthorityCount(e.familyKey) >= target) continue;
    // Baseline stock lists slightly ABOVE guidance: a floor for newcomers, never
    // undercutting player sellers (the market stays player-driven).
    const price = Math.max(5, Math.round(guidePrice(e.familyKey) * 1.1));
    orders.push({ familyKey: e.familyKey, cat: e.cat, rarity: e.rarity, price });
  }
  return orders;
}

/** The population multiplier for baseline supply: ~1 per 40 active traders, capped ×8. */
export function baselineDemandScale(uniqueTraders: number): number {
  return Math.max(1, Math.min(8, uniqueTraders / 40));
}

// ── Market Liquidity Engine (docs/AUCTION-HOUSE.md §buybacks) — the BUY side ─────────────
// The authority may quietly purchase a stale, fairly-priced FOUNDATIONAL listing so the
// market keeps transacting when player demand is thin. It exists to reward fair listing and
// keep velocity alive — never to compete with players, never to be farmable:
//
//   • Funded by sinks: a window's budget is a fraction of the PREVIOUS window's burns
//     (fees + taxes). The authority can never inject more than the market destroyed, so the
//     engine is structurally inflation-safe — no budget accumulates, nothing carries over.
//   • Never guaranteed: candidates are rng-shuffled and every pick must ALSO pass an accept
//     roll scaled by population — a perfectly stale, perfectly priced listing can still go
//     unbought this window. There is no sequence of actions that forces a purchase.
//   • Never overpays: the bar is the family's estimated value (the same recency-weighted
//     median players see) — a listing above `maxPremium × estimate` is invisible to the
//     engine, and one below `minValueFrac × estimate` (suppression bait / wash shapes) is
//     skipped rather than rewarded.
//   • Player demand always wins: listings with a standing bid are the market working —
//     untouchable; families already selling at `velocityCeiling`/day need no help.
export const BUYBACK = {
  budgetBurnFrac: 0.5, // window budget = prior-window burns × this — injection ≤ sinks, forever
  budgetFloor: 40, // a dead-quiet market can still absorb one cheap common per window
  budgetCap: 2_000, // hard per-window ceiling no matter how hot the sinks ran
  minAgeFrac: 0.35, // stale = bid-free and older than this fraction of its full duration
  maxPremium: 1.05, // never pay above estimate × this — overpricing is invisible, not negotiable
  minValueFrac: 0.2, // never reward listings priced under estimate × this (suppression bait)
  velocityCeiling: 1.5, // families already moving ≥ this many sales/day need no liquidity
  maxTransfers: 2, // much-travelled items (mule/relist chains) are never bought
  maxPerWindow: 3, // absolute purchase-count ceiling per window (before population scaling)
  maxPerFamilyPerWindow: 1, // one purchase per family per window — never a family sweep
  sellerDailyCap: 1, // one buyback per seller per UTC day
  sellerCooldownMs: 6 * 3_600_000, // and never twice within 6h across the day boundary
  maxSellerFamilyListings: 2, // a seller flooding one family (dupe wall) disqualifies it all
  acceptChance: 0.55, // the per-candidate roll — even perfect candidates are never certain
  quietBoost: 1.5, // activity multiplier as the market empties…
  busyFade: 40, // …fading to ~0 as unique traders/window approach this (players ARE the liquidity)
  velocityFade: 12, // …and equally as player sales/window approach this — a market that is
  // TRANSACTING needs no stabilizer even when supply is glutted (deflation floods otherwise
  // pull the engine into a third of all trade; the sim's dominance gate pinned this).
} as const;

/** The rarity bands the engine may ever buy ("Authority Eligible" by category — the same
 *  FOUNDATIONAL philosophy as baseline stock, one band wider on equipment). Exclusives
 *  (seasonal/limited/prestige/arena/promotional — the catalog's `exclusive` law) are never
 *  eligible regardless of rarity, and `authorityEligible: false` vetoes a row outright. */
export const BUYBACK_MAX_RARITY: Record<BaselineCatalogEntry['cat'], ReadonlySet<string>> = {
  geneCard: new Set(['common', 'uncommon']),
  equipment: new Set(['common', 'uncommon']),
  cosmetic: new Set(['rare']), // the cultivate entry band — "baseline cosmetics"
  mulliganPiece: new Set(['common', 'uncommon']), // the genes band — the liquidity floor mirrors baseline
};

/** One stale-listing candidate the host offers the planner (all inputs server-derived). */
export interface BuybackCandidate {
  listingId: string;
  sellerId: string;
  familyKey: string;
  cat: BaselineCatalogEntry['cat'];
  rarity: string;
  exclusive: boolean;
  /** What the authority would pay — the listing's buy-now (bid-free listings only). */
  price: number;
  createdAt: number;
  endsAt: number;
  hasBid: boolean;
  /** Family estimated value (stats line players see); null = no signal ⇒ never bought. */
  estimate: number | null;
  velocityPerDay: number;
  transfers: number;
  sellerFlagged: boolean; // any unreviewed manipulation flag names this seller
  itemFlagged: boolean; // fraud_flag on the item row
  sellerFamilyListings: number; // this seller's ACTIVE listings in the same family
  /** Per-item override hook: true widens the band for a specifically flagged item;
   *  false vetoes. Exclusivity still always wins. */
  authorityEligible?: boolean;
}

/** A seller's recent buyback record (the host derives it from authority=2 trades). */
export interface SellerBuybackRecord { boughtToday: number; lastAt: number }

/** One planned purchase (the host settles it with the normal sale discipline). */
export interface BuybackOrder { listingId: string; sellerId: string; familyKey: string; price: number }

/** Category/rarity/exclusivity eligibility — the hard identity gate. */
export function buybackEligible(c: Pick<BuybackCandidate, 'cat' | 'rarity' | 'exclusive' | 'authorityEligible'>): boolean {
  if (c.exclusive) return false; // seasonal/limited/prestige/arena/promo: player-driven forever
  if (c.authorityEligible === false) return false;
  if (c.authorityEligible === true) return true; // explicit flag widens the band (never exclusivity)
  return BUYBACK_MAX_RARITY[c.cat].has(c.rarity);
}

/** Population/velocity coupling: a quiet market gets a modest boost; EITHER pressure —
 *  many traders or healthy sales velocity — starves the engine, so player-to-player trade
 *  dominates whenever players are present AND whenever they are already transacting. */
export function buybackActivity(uniqueTraders: number, windowSales = 0): number {
  const pressure = Math.max(uniqueTraders / BUYBACK.busyFade, windowSales / BUYBACK.velocityFade);
  return Math.max(0, Math.min(BUYBACK.quietBoost, BUYBACK.quietBoost * (1 - pressure)));
}

/** The window's spend ceiling, funded strictly by the previous window's sinks. */
export function buybackBudget(prevWindowBurned: number): number {
  return Math.min(BUYBACK.budgetCap, Math.max(BUYBACK.budgetFloor, Math.round(prevWindowBurned * BUYBACK.budgetBurnFrac)));
}

/**
 * Plan this window's buybacks. Pure and rng-injected: hosts pass real entropy (the server's
 * crypto source), the sim passes its seeded stream — tests replay byte-for-byte.
 * Every gate in one place, in order: identity band → market-health (bids/velocity) →
 * staleness → valuation corridor → manipulation screens → randomized selection under
 * budget + per-window / per-family / per-seller caps.
 */
export function planBuybacks(
  candidates: readonly BuybackCandidate[],
  opts: {
    now: number;
    budget: number;
    uniqueTraders: number;
    /** Player sales in the observed window (buybacks excluded) — the velocity pressure. */
    windowSales?: number;
    sellerRecords: ReadonlyMap<string, SellerBuybackRecord>;
    rng: () => number; // [0,1)
  },
): BuybackOrder[] {
  const activity = buybackActivity(opts.uniqueTraders, opts.windowSales ?? 0);
  const maxCount = Math.min(BUYBACK.maxPerWindow, Math.floor(BUYBACK.maxPerWindow * activity + 0.999));
  if (maxCount <= 0 || opts.budget <= 0) return [];
  const eligible = candidates.filter((c) => {
    if (!buybackEligible(c)) return false;
    if (c.hasBid) return false; // a live bid IS the market working — untouchable
    if (c.velocityPerDay >= BUYBACK.velocityCeiling) return false; // players already buy these
    const age = opts.now - c.createdAt;
    const duration = Math.max(1, c.endsAt - c.createdAt);
    if (age < duration * BUYBACK.minAgeFrac) return false; // not stale yet
    if (c.estimate === null || c.estimate <= 0) return false; // no valuation signal ⇒ no purchase
    if (c.price > c.estimate * BUYBACK.maxPremium) return false; // never reward overpricing
    if (c.price < c.estimate * BUYBACK.minValueFrac) return false; // never reward suppression bait
    if (c.transfers > BUYBACK.maxTransfers) return false; // mule/relist chains
    if (c.sellerFlagged || c.itemFlagged) return false; // manipulation screens (flag ⇒ invisible)
    if (c.sellerFamilyListings > BUYBACK.maxSellerFamilyListings) return false; // dupe walls
    return true;
  });
  if (eligible.length === 0) return [];
  // Fisher–Yates on the injected rng — candidate ORDER is never age/price/anything gameable.
  const pool = [...eligible];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(opts.rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const orders: BuybackOrder[] = [];
  const familiesBought = new Map<string, number>();
  const sellersBought = new Map<string, number>();
  let spent = 0;
  for (const c of pool) {
    if (orders.length >= maxCount) break;
    if (spent + c.price > opts.budget) continue;
    if ((familiesBought.get(c.familyKey) ?? 0) >= BUYBACK.maxPerFamilyPerWindow) continue;
    const rec = opts.sellerRecords.get(c.sellerId);
    const takenNow = sellersBought.get(c.sellerId) ?? 0;
    if ((rec?.boughtToday ?? 0) + takenNow >= BUYBACK.sellerDailyCap) continue;
    if (rec !== undefined && opts.now - rec.lastAt < BUYBACK.sellerCooldownMs) continue;
    // The accept roll: population-scaled, applied LAST — passing every gate above still
    // never guarantees a purchase this window.
    if (opts.rng() >= BUYBACK.acceptChance * Math.min(1, activity)) continue;
    orders.push({ listingId: c.listingId, sellerId: c.sellerId, familyKey: c.familyKey, price: c.price });
    spent += c.price;
    familiesBought.set(c.familyKey, (familiesBought.get(c.familyKey) ?? 0) + 1);
    sellersBought.set(c.sellerId, takenNow + 1);
  }
  return orders;
}

// ── Manipulation detectors beyond trading.ts (relisting, monopoly, fixing) ───
export interface ListingEvent { at: number; sellerId: string; familyKey: string; refKey: string; action: 'open' | 'cancel'; ask: number }

export type MarketFlag =
  | FraudSignal
  | { kind: 'rapidRelist'; sellerId: string; refKey: string; cycles: number } // list→cancel churn (visibility gaming)
  | { kind: 'monopoly'; sellerId: string; familyKey: string; share: number } // one seller owns the family's book
  | { kind: 'priceFixing'; familyKey: string; sellers: number; ask: number }; // coordinated identical off-median asks

export const MANIPULATION = {
  relistCycles: 3, // open→cancel of the SAME item ≥ this inside the window flags
  relistWindowMs: 24 * 3_600_000,
  monopolyShare: 0.6, // one seller holding ≥ 60% of a family's active listings flags
  monopolyMinListings: 5,
  fixingSellers: 3, // ≥ 3 sellers posting the IDENTICAL ask ≥ ×2 median flags
} as const;

export function auditMarket(
  trades: readonly TradeEvent[],
  listingEvents: readonly ListingEvent[],
  activeListings: readonly LiveListing[],
  medianOf: (familyKey: string) => number,
): MarketFlag[] {
  const flags: MarketFlag[] = [...auditTradeEvents(trades)];
  // rapidRelist: open/cancel cycles per (seller, item) inside the window.
  const cycles = new Map<string, { opens: number; cancels: number; sellerId: string; refKey: string }>();
  const cutoff = Math.max(...listingEvents.map((e) => e.at), 0) - MANIPULATION.relistWindowMs;
  for (const e of listingEvents) {
    if (e.at < cutoff) continue;
    const key = `${e.sellerId}|${e.refKey}`;
    const c = cycles.get(key) ?? { opens: 0, cancels: 0, sellerId: e.sellerId, refKey: e.refKey };
    if (e.action === 'open') c.opens++; else c.cancels++;
    cycles.set(key, c);
  }
  for (const c of cycles.values()) {
    const n = Math.min(c.opens, c.cancels);
    if (n >= MANIPULATION.relistCycles) flags.push({ kind: 'rapidRelist', sellerId: c.sellerId, refKey: c.refKey, cycles: n });
  }
  // monopoly: per-family seller concentration among ACTIVE player listings.
  const byFamily = new Map<string, LiveListing[]>();
  for (const l of activeListings) {
    if (l.state !== 'active' || l.authority) continue;
    (byFamily.get(l.familyKey) ?? byFamily.set(l.familyKey, []).get(l.familyKey)!).push(l);
  }
  for (const [familyKey, rows] of byFamily) {
    if (rows.length < MANIPULATION.monopolyMinListings) continue;
    const bySeller = new Map<string, number>();
    for (const l of rows) bySeller.set(l.sellerId, (bySeller.get(l.sellerId) ?? 0) + 1);
    for (const [sellerId, n] of bySeller) {
      const share = n / rows.length;
      if (share >= MANIPULATION.monopolyShare) flags.push({ kind: 'monopoly', sellerId, familyKey, share });
    }
    // priceFixing: several sellers, one identical ask, far off median.
    const med = medianOf(familyKey);
    if (med > 0) {
      const byAsk = new Map<number, Set<string>>();
      for (const l of rows) {
        const ask = l.buyNow ?? l.ask;
        (byAsk.get(ask) ?? byAsk.set(ask, new Set()).get(ask)!).add(l.sellerId);
      }
      for (const [ask, sellers] of byAsk) {
        if (sellers.size >= MANIPULATION.fixingSellers && ask >= med * 2) {
          flags.push({ kind: 'priceFixing', familyKey, sellers: sellers.size, ask });
        }
      }
    }
  }
  return flags;
}

/** Re-exported so hosts import ONE module for all detector tunables. */
export const AUDIT_TUNABLES = { FRAUD, MANIPULATION } as const;

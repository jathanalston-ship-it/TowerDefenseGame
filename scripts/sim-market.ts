// MARKET SIMULATION HARNESS (docs/AUCTION-HOUSE.md §simulation) — thousands of simulated
// market days across every mandated scenario: inflation, deflation, low/high population,
// crashes, whale spending, F2P-only economies, rare scarcity, and bot/manipulator pressure.
// Drives the REAL engine (core/auction.ts) + the REAL authority (core/marketAuthority.ts)
// with persona agents; asserts the economy stays healthy in every one and that money is
// EXACTLY conserved (wallets + escrow + burned − minted ≡ initial). Exits non-zero on any
// violation — run with `npm run sim:market`.
//
// Determinism: one seeded RNG per scenario — a failure reproduces byte-for-byte.

import { Rng } from '../src/core/rng';
import {
  buyNow, familyStats, openListing, placeBid, recommendedPrice, settleExpired, sortListings,
} from '../src/core/auction';
import type { LedgerOp, LiveListing } from '../src/core/auction';
import {
  auditMarket, authorityTick, baselineDemandScale, defaultAuthorityState, emptyMetrics, planBaselineRestock,
} from '../src/core/marketAuthority';
import type { AuthorityState, BaselineCatalogEntry, ListingEvent, MarketFlag, MarketMetrics } from '../src/core/marketAuthority';
import type { MarketHistoryPoint, TradeEvent } from '../src/core/trading';

const DAY = 24 * 3_600_000;

// ── Personas ──────────────────────────────────────────────────────────────────
type Persona = 'f2p' | 'casual' | 'whale' | 'manipulator' | 'bot';

interface Agent {
  id: string;
  persona: Persona;
  wallet: number; // market-Ichor balance
  items: string[]; // familyKeys held (instances synthesized per listing)
  partner?: string; // manipulator wash partner
}

interface Scenario {
  name: string;
  days: number;
  agents: { persona: Persona; count: number; wallet: number }[];
  /** Ichor faucet per agent-day (external income deposited into market wallets). */
  faucetPerDay: number;
  /** Item drops per agent-day (supply pressure). */
  dropsPerDay: number;
  /** Day → event hook (crashes, whale arrival, droughts). */
  shock?: (day: number, world: World) => void;
  /** Rare families excluded from drops (scarcity scenario). */
  rareDrought?: boolean;
  /** Full-basket ceiling (default 4). Whale/high-pop scenarios allow stratified rares to
   *  climb further — the COMMONS basket contract below stays strict everywhere. */
  maxRatio?: number;
  /** Assert the authority visibly engaged (fees or index moved) — the anti-inflation proof. */
  expectEngaged?: boolean;
  expectFlags?: ('selfDealing' | 'circular' | 'rapidRelist' | 'monopoly' | 'priceOutlier' | 'priceFixing' | 'rapidTransfer')[];
}

// The reference catalog: 12 families across the three categories + rarity bands.
const CATALOG: BaselineCatalogEntry[] = [
  { familyKey: 'gene:ember_a', cat: 'geneCard', rarity: 'common', exclusive: false },
  { familyKey: 'gene:frost_a', cat: 'geneCard', rarity: 'common', exclusive: false },
  { familyKey: 'gene:vine_b', cat: 'geneCard', rarity: 'uncommon', exclusive: false },
  { familyKey: 'gene:apex_x', cat: 'geneCard', rarity: 'legendary', exclusive: true }, // ultra-rare: player-only
  { familyKey: 'eq:chitin', cat: 'equipment', rarity: 'common', exclusive: false },
  { familyKey: 'eq:barb', cat: 'equipment', rarity: 'common', exclusive: false },
  { familyKey: 'eq:lens', cat: 'equipment', rarity: 'rare', exclusive: false },
  { familyKey: 'eq:relic', cat: 'equipment', rarity: 'exotic', exclusive: true }, // prestige-band
  { familyKey: 'cos:ember', cat: 'cosmetic', rarity: 'rare', exclusive: false },
  { familyKey: 'cos:frost', cat: 'cosmetic', rarity: 'rare', exclusive: false },
  { familyKey: 'cos:gilded', cat: 'cosmetic', rarity: 'legendary', exclusive: true }, // contract exclusive
  { familyKey: 'cos:abyss', cat: 'cosmetic', rarity: 'legendary', exclusive: true }, // event exclusive
];
const RARE_FAMILIES = new Set(CATALOG.filter((c) => c.rarity !== 'common' && c.rarity !== 'uncommon').map((c) => c.familyKey));
/** Anchor "fair" values per rarity — drop pricing instincts, not enforced anywhere. */
const ANCHOR: Record<string, number> = { common: 20, uncommon: 60, rare: 200, exotic: 900, legendary: 2500 };

interface World {
  rng: Rng;
  now: number;
  day: number;
  agents: Agent[];
  byId: Map<string, Agent>;
  /** Per-day caches (rebuilt in runDay): active floor per family — statsFor's hot input. */
  floorByFamily: Map<string, number>;
  listings: Map<string, LiveListing>;
  history: Map<string, MarketHistoryPoint[]>; // per family, per day
  trades: TradeEvent[];
  listingEvents: ListingEvent[];
  authority: AuthorityState;
  prevMetrics: MarketMetrics | null;
  burned: number;
  minted: number; // faucet deposits (tracked for conservation)
  escrowOut: number; // charges not yet returned (running escrow)
  seq: number;
  flags: MarketFlag[];
  daySales: { familyKey: string; price: number }[];
  dayOpened: number;
  dayTraderSet: Set<string>;
}

function applyOps(w: World, ops: LedgerOp[], payerCheck = true): boolean {
  // Pre-validate charges against wallets (the server's insufficient-funds branch).
  for (const o of ops) {
    if (o.op === 'charge' && payerCheck) {
      const a = w.byId.get(o.playerId);
      if (!a || a.wallet < o.amount) return false;
    }
  }
  for (const o of ops) {
    if (o.op === 'charge') {
      const a = w.byId.get(o.playerId)!;
      a.wallet -= o.amount;
      w.escrowOut += o.amount;
    } else if (o.op === 'refund' || o.op === 'credit') {
      const a = w.byId.get(o.playerId);
      if (a) a.wallet += o.amount;
      w.escrowOut -= o.amount;
    } else {
      w.burned += o.amount;
      w.escrowOut -= o.amount;
    }
  }
  return true;
}

function statsFor(w: World, familyKey: string): ReturnType<typeof familyStats> {
  const lowest = w.floorByFamily.get(familyKey) ?? null;
  return familyStats(w.history.get(familyKey) ?? [], lowest);
}

function rebuildFloors(w: World): void {
  w.floorByFamily = new Map();
  for (const l of w.listings.values()) {
    if (l.state !== 'active') continue;
    const p = l.buyNow ?? l.ask;
    const cur = w.floorByFamily.get(l.familyKey);
    if (cur === undefined || p < cur) w.floorByFamily.set(l.familyKey, p);
  }
}

function medianOf(w: World, familyKey: string): number {
  return statsFor(w, familyKey).estimatedValue ?? 0;
}

function recordSale(w: World, familyKey: string, price: number, sellerId: string, buyerId: string, refKey: string): void {
  w.daySales.push({ familyKey, price });
  w.trades.push({ at: w.now, itemKey: refKey, fromId: sellerId, toId: buyerId, price, medianPrice: medianOf(w, familyKey) });
  w.dayTraderSet.add(sellerId).add(buyerId);
}

function openFor(w: World, agent: Agent, familyKey: string, ask: number, buyNowPrice: number | null, authority = false, stableRef?: string): LiveListing | null {
  const cat = CATALOG.find((c) => c.familyKey === familyKey);
  if (!cat) return null;
  const id = `L${++w.seq}`;
  const r = openListing({
    listingId: id, globalItemId: `G${w.seq}`, refKey: stableRef ?? `${cat.cat}:${familyKey}#${w.seq}`, cat: cat.cat,
    familyKey, rarity: cat.rarity, sellerId: agent.id, ask, buyNow: buyNowPrice, durationH: 48, now: w.now, authority,
    feeMult: w.authority.feeMult, // the authority's live anti-inflation lever actually charges
  });
  if (!r.ok) return null;
  if (!applyOps(w, r.ops)) return null;
  w.listings.set(id, r.value);
  w.listingEvents.push({ at: w.now, sellerId: agent.id, familyKey, refKey: r.value.ref.id, action: 'open', ask });
  w.dayOpened++;
  return r.value;
}

// ── One simulated day ─────────────────────────────────────────────────────────
function runDay(w: World, sc: Scenario): void {
  w.daySales = [];
  w.dayOpened = 0;
  w.dayTraderSet = new Set();
  // Advance the clock, settle yesterday's expiries FIRST (a listing created on day D is
  // shoppable through day D+1 — 48h durations below give one guaranteed full window).
  w.now += DAY;
  for (const l of [...w.listings.values()]) {
    if (l.state !== 'active' || w.now < l.endsAt) continue;
    const r = settleExpired(l, w.now, w.authority.taxMult);
    if (!r.ok) continue;
    applyOps(w, r.ops, false);
    w.listings.set(l.listingId, r.value.listing);
    if (r.value.sale) {
      recordSale(w, l.familyKey, r.value.sale.price, l.sellerId, r.value.sale.buyerId, r.value.sale.refKey);
      const buyer = w.byId.get(r.value.sale.buyerId);
      if (buyer) buyer.items.push(l.familyKey);
    }
  }
  rebuildFloors(w);
  // ONE sorted view per day (price-ascending active player-reachable listings) — each agent
  // shops a window of it; sold rows are filtered at use (state flips during the day).
  const daybook = sortListings([...w.listings.values()].filter((l) => l.state === 'active'), 'priceAsc');

  for (const agent of w.agents) {
    // Faucet income (external economy feeding the market wallet).
    agent.wallet += sc.faucetPerDay;
    w.minted += sc.faucetPerDay;
    // Drops arrive (supply).
    for (let d = 0; d < sc.dropsPerDay; d++) {
      if (w.rng.next() > 0.5) continue;
      const pool = CATALOG.filter((c) => (!sc.rareDrought || !RARE_FAMILIES.has(c.familyKey)) && (!c.exclusive || w.rng.next() < 0.02));
      agent.items.push(pool[Math.floor(w.rng.next() * pool.length)].familyKey);
    }

    // SELL policy: list surplus at persona-flavored prices around guidance.
    while (agent.items.length > (agent.persona === 'whale' ? 4 : 2)) {
      const familyKey = agent.items.pop()!;
      const stats = statsFor(w, familyKey);
      const guide = recommendedPrice(stats, w.authority.recBias);
      const anchor = ANCHOR[CATALOG.find((c) => c.familyKey === familyKey)!.rarity];
      const base = stats.estimatedValue ?? anchor;
      const ceiling = ANCHOR[CATALOG.find((c) => c.familyKey === familyKey)!.rarity] * 4;
      const ask = Math.max(5, Math.min(100_000, Math.round(
        agent.persona === 'manipulator' ? base * 6
          : agent.persona === 'bot' ? guide
            : Math.min(ceiling, guide * (0.9 + w.rng.next() * 0.3)))));
      openFor(w, agent, familyKey, ask, w.rng.next() < 0.8 ? Math.round(ask * 1.15) : null,
        false, agent.persona === 'bot' ? `equipment:${familyKey}#${agent.id}` : undefined);
      if (agent.persona === 'bot' && w.rng.next() < 0.7) {
        // Relist churn: cancel immediately and repost (visibility gaming — must get flagged).
        const mine = [...w.listings.values()].filter((l) => l.sellerId === agent.id && l.state === 'active' && l.bid === null);
        const last = mine[mine.length - 1];
        if (last) {
          w.listings.set(last.listingId, { ...last, state: 'cancelled' });
          w.listingEvents.push({ at: w.now + 1000, sellerId: agent.id, familyKey: last.familyKey, refKey: last.ref.id, action: 'cancel', ask: last.ask });
          agent.items.push(last.familyKey);
        }
      }
    }

    // BUY policy: shop the cheapest window of the daybook (bounded work per agent).
    const budgetFrac = agent.persona === 'whale' ? 0.5 : agent.persona === 'f2p' ? 0.1 : 0.25;
    let scanned = 0;
    for (const l0 of daybook) {
      if (scanned++ > 60) break;
      const l = w.listings.get(l0.listingId)!;
      if (l.state !== 'active' || l.sellerId === agent.id) continue;
      const price = l.buyNow ?? l.ask;
      const cat = CATALOG.find((c) => c.familyKey === l.familyKey)!;
      // UTILITY anchor: what the item is worth to THIS player, independent of market mood —
      // the circuit-breaker that keeps estimate-chasing from spiraling prices unboundedly.
      const utilityMult = agent.persona === 'whale' ? 3 : agent.persona === 'f2p' ? 0.9 : 1.3;
      const worth = ANCHOR[cat.rarity] * utilityMult * (0.8 + w.rng.next() * 0.5);
      const wants = agent.persona === 'whale'
        ? (RARE_FAMILIES.has(l.familyKey) || w.rng.next() < 0.2) && price <= worth
        : price <= worth;
      if (!wants || price > agent.wallet * budgetFrac) continue;
      if (l.buyNow !== null && (agent.persona === 'whale' || w.rng.next() < 0.6)) {
        const r = buyNow(l, agent.id, w.now, w.authority.taxMult);
        if (r.ok && applyOps(w, r.ops)) {
          w.listings.set(l.listingId, r.value.listing);
          agent.items.push(l.familyKey);
          recordSale(w, l.familyKey, r.value.sale.price, l.sellerId, agent.id, r.value.sale.refKey);
        }
      } else {
        const floorBid = l.bid === null ? l.ask : Math.ceil(l.bid * 1.05) + 1;
        // Rational bidders: never chase a war past their own utility — the discipline that
        // keeps auction sales anchored to what items are actually worth to buyers.
        if (floorBid <= worth) {
          const r = placeBid(l, agent.id, floorBid, w.now);
          if (r.ok && applyOps(w, r.ops)) w.listings.set(l.listingId, r.value);
        }
      }
      if (w.rng.next() < 0.5) break; // shoppers don't clear the whole board daily
    }

    // Manipulator wash cycle: trade the same item back and forth with the partner at ×6.
    if (agent.persona === 'manipulator' && agent.partner) {
      const partner = w.agents.find((a) => a.id === agent.partner)!;
      const fam = 'eq:chitin'; // commons have organic history — the ×6 wash is visibly an outlier
      const price = Math.max(5, Math.round((medianOf(w, fam) || 20) * 6));
      const l = openFor(w, agent, fam, price, price);
      if (l && partner.wallet >= price) {
        const r = buyNow(l, partner.id, w.now + 5000, w.authority.taxMult);
        if (r.ok && applyOps(w, r.ops)) {
          w.listings.set(l.listingId, r.value.listing);
          recordSale(w, fam, price, agent.id, partner.id, `equipment:${fam}#wash`); // SAME refKey each cycle — the chain detectors watch items
          [agent.wallet, partner.wallet] = [agent.wallet, partner.wallet]; // wealth net-moves via tax only
        }
      }
    }
  }

  // Fold the day into history aggregates.
  const byFamily = new Map<string, number[]>();
  for (const s of w.daySales) (byFamily.get(s.familyKey) ?? byFamily.set(s.familyKey, []).get(s.familyKey)!).push(s.price);
  const dayKey = `d${w.day}`;
  for (const [familyKey, prices] of byFamily) {
    prices.sort((a, b) => a - b);
    const rows = w.history.get(familyKey) ?? [];
    rows.push({ day: dayKey, sales: prices.length, medianPrice: prices[Math.floor(prices.length / 2)], lowPrice: prices[0], highPrice: prices[prices.length - 1] });
    if (rows.length > 30) rows.shift();
    w.history.set(familyKey, rows);
  }

  // Metrics → authority tick → baseline restock (the server's lazy window, one per day here).
  const activeRows = [...w.listings.values()].filter((l) => l.state === 'active');
  const wallets = w.agents.map((a) => a.wallet).sort((a, b) => a - b);
  const saleVolume = w.daySales.reduce((s, x) => s + x.price, 0);
  const sampled = ['eq:chitin', 'gene:ember_a', 'eq:lens', 'cos:ember'].map((f) => statsFor(w, f).volatility);
  const m: MarketMetrics = {
    windowKey: w.day,
    activeListings: activeRows.length,
    listingsOpened: w.dayOpened,
    sales: w.daySales.length,
    saleVolume,
    avgSalePrice: w.daySales.length > 0 ? saleVolume / w.daySales.length : 0,
    uniqueTraders: w.dayTraderSet.size,
    ichorBurned: w.burned,
    ichorCirculation: wallets.reduce((s, x) => s + x, 0),
    medianWealth: wallets[Math.floor(wallets.length / 2)] ?? 0,
    staleListings: activeRows.filter((l) => l.bid === null && w.now - l.createdAt > 12 * 3_600_000).length,
    rareActiveListings: activeRows.filter((l) => RARE_FAMILIES.has(l.familyKey)).length,
    volatilityAvg: sampled.reduce((s, x) => s + x, 0) / sampled.length,
  };
  const prevBurn = w.prevMetrics?.ichorBurned ?? 0;
  w.authority = authorityTick(w.authority, { ...m, ichorBurned: w.burned - prevBurn }, w.prevMetrics);
  w.prevMetrics = { ...m };

  const authorityAgent: Agent = { id: '@authority', persona: 'bot', wallet: 0, items: [] };
  const scale = baselineDemandScale(m.uniqueTraders);
  const authTarget = Math.round(w.authority.baselineLevel * Math.max(1, scale));
  for (const order of planBaselineRestock(
    CATALOG,
    (f) => activeRows.filter((l) => l.authority && l.familyKey === f).length,
    (f) => recommendedPrice(statsFor(w, f), w.authority.recBias),
    w.authority,
    scale,
  )) {
    const live = activeRows.filter((l) => l.authority && l.familyKey === order.familyKey).length;
    for (let k = live; k < authTarget; k++) openFor(w, authorityAgent, order.familyKey, order.price, order.price, true);
  }

  // Audit window (the moderation feed).
  if (w.day % 7 === 0) {
    const playerTrades = w.trades.slice(-4000).filter((t) => t.fromId !== '@authority' && t.toId !== '@authority');
    w.flags.push(...auditMarket(playerTrades, w.listingEvents.slice(-4000), activeRows, (f) => medianOf(w, f)));
  }

  w.day++;
}

// ── Scenario harness + health assertions ─────────────────────────────────────
interface Health {
  name: string;
  days: number;
  endMedianBasket: number;
  startMedianBasket: number;
  priceRatio: number;
  commonsRatio: number;
  totalSales: number;
  staleFrac: number;
  authority: AuthorityState;
  conservationError: number;
  flagKinds: string[];
  exclusiveAuthorityListings: number;
}

const FULL_BASKET = ['eq:chitin', 'gene:ember_a', 'gene:vine_b', 'cos:ember'];
/** The F2P affordability contract: foundational commons/uncommons a new player NEEDS. */
const COMMONS_BASKET = ['eq:chitin', 'gene:ember_a', 'gene:vine_b'];

function basketPrice(w: World, basket: readonly string[]): number {
  const vals = basket.map((f) => statsFor(w, f).estimatedValue ?? ANCHOR[CATALOG.find((c) => c.familyKey === f)!.rarity]);
  return vals.reduce((s, x) => s + x, 0) / vals.length;
}

function runScenario(sc: Scenario, seed: number): Health {
  const rng = new Rng(seed);
  const agents: Agent[] = [];
  let n = 0;
  for (const g of sc.agents) {
    for (let i = 0; i < g.count; i++) agents.push({ id: `${g.persona}${n++}`, persona: g.persona, wallet: g.wallet, items: [] });
  }
  // Pair manipulators.
  const manips = agents.filter((a) => a.persona === 'manipulator');
  for (let i = 0; i + 1 < manips.length; i += 2) {
    manips[i].partner = manips[i + 1].id;
    manips[i + 1].partner = manips[i].id;
  }
  const initialWealth = agents.reduce((s, a) => s + a.wallet, 0);
  const w: World = {
    rng, now: 1_700_000_000_000, day: 1, agents, byId: new Map(agents.map((a) => [a.id, a])),
    floorByFamily: new Map(), listings: new Map(), history: new Map(),
    trades: [], listingEvents: [], authority: defaultAuthorityState(), prevMetrics: null,
    burned: 0, minted: 0, escrowOut: 0, seq: 0, flags: [], daySales: [], dayOpened: 0, dayTraderSet: new Set(),
  };
  let startBasket = 0;
  let startCommons = 0;
  const snapDay = Math.max(60, Math.floor(sc.days / 3)); // past the cold-start transient
  for (let d = 0; d < sc.days; d++) {
    sc.shock?.(w.day, w);
    runDay(w, sc);
    if (w.day === snapDay) {
      startBasket = basketPrice(w, FULL_BASKET);
      startCommons = basketPrice(w, COMMONS_BASKET);
    }
  }
  const endBasket = basketPrice(w, FULL_BASKET);
  const endCommons = basketPrice(w, COMMONS_BASKET);
  const wallets = w.agents.reduce((s, a) => s + a.wallet, 0);
  const conservationError = wallets + w.escrowOut + w.burned - w.minted - initialWealth;
  const active = [...w.listings.values()].filter((l) => l.state === 'active');
  const totalSales = w.trades.length;
  return {
    name: sc.name,
    days: sc.days,
    endMedianBasket: endBasket,
    startMedianBasket: startBasket,
    priceRatio: startBasket > 0 ? endBasket / startBasket : 1,
    commonsRatio: startCommons > 0 ? endCommons / startCommons : 1,
    totalSales,
    staleFrac: active.length > 0 ? active.filter((l) => l.bid === null && w.now - l.createdAt > 12 * 3_600_000).length / active.length : 0,
    authority: w.authority,
    conservationError,
    flagKinds: [...new Set(w.flags.map((f) => f.kind))],
    exclusiveAuthorityListings: [...w.listings.values()].filter((l) => l.authority && CATALOG.find((c) => c.familyKey === l.familyKey)?.exclusive).length,
  };
}

const SCENARIOS: Scenario[] = [
  { name: 'baseline healthy', days: 400, faucetPerDay: 30, dropsPerDay: 1, agents: [
    { persona: 'casual', count: 60, wallet: 300 }, { persona: 'f2p', count: 40, wallet: 60 }] },
  { name: 'inflation (rich faucets, few drops)', days: 400, faucetPerDay: 220, dropsPerDay: 0, maxRatio: 8, expectEngaged: true, agents: [
    { persona: 'casual', count: 60, wallet: 2000 }, { persona: 'whale', count: 8, wallet: 30_000 }],
    shock: (day, w) => { if (day === 1) for (const a of w.agents) a.items.push('eq:chitin'); } },
  { name: 'deflation (drop flood, poor buyers)', days: 400, faucetPerDay: 6, dropsPerDay: 3, agents: [
    { persona: 'casual', count: 50, wallet: 120 }, { persona: 'f2p', count: 60, wallet: 30 }] },
  { name: 'low population', days: 600, faucetPerDay: 25, dropsPerDay: 1, agents: [
    { persona: 'casual', count: 8, wallet: 250 }, { persona: 'f2p', count: 5, wallet: 60 }] },
  { name: 'high population', days: 250, faucetPerDay: 30, dropsPerDay: 1, maxRatio: 8, expectEngaged: true, agents: [
    { persona: 'casual', count: 500, wallet: 300 }, { persona: 'f2p', count: 300, wallet: 60 }, { persona: 'whale', count: 20, wallet: 20_000 }] },
  { name: 'market crash (mass dump day 200)', days: 420, faucetPerDay: 30, dropsPerDay: 1, agents: [
    { persona: 'casual', count: 80, wallet: 400 }],
    shock: (day, w) => { if (day === 200) for (const a of w.agents) for (let i = 0; i < 6; i++) a.items.push('eq:chitin'); } },
  { name: 'whale spending spree', days: 300, faucetPerDay: 25, dropsPerDay: 1, maxRatio: 6, agents: [
    { persona: 'casual', count: 60, wallet: 250 }, { persona: 'whale', count: 12, wallet: 80_000 }] },
  { name: 'F2P-only economy', days: 400, faucetPerDay: 8, dropsPerDay: 1, agents: [
    { persona: 'f2p', count: 90, wallet: 40 }] },
  { name: 'rare scarcity (drought)', days: 350, faucetPerDay: 30, dropsPerDay: 1, rareDrought: true, agents: [
    { persona: 'casual', count: 70, wallet: 350 }] },
  { name: 'bots + manipulators', days: 300, faucetPerDay: 30, dropsPerDay: 1, agents: [
    { persona: 'casual', count: 50, wallet: 300 }, { persona: 'bot', count: 6, wallet: 200 }, { persona: 'manipulator', count: 4, wallet: 50_000 }],
    expectFlags: ['selfDealing', 'rapidRelist', 'priceOutlier'] },
];

let failures = 0;
const report: string[] = [];
for (let i = 0; i < SCENARIOS.length; i++) {
  const sc = SCENARIOS[i];
  const h = runScenario(sc, 1_000_003 + i * 7919);
  const problems: string[] = [];
  if (Math.abs(h.conservationError) > 0.0001) problems.push(`MONEY NOT CONSERVED (err ${h.conservationError})`);
  if (h.exclusiveAuthorityListings > 0) problems.push(`AUTHORITY STOCKED EXCLUSIVES (${h.exclusiveAuthorityListings})`);
  const maxRatio = sc.maxRatio ?? 4;
  if (h.priceRatio > maxRatio || h.priceRatio < 1 / maxRatio) problems.push(`full basket ran away ×${h.priceRatio.toFixed(2)} (band ±×${maxRatio})`);
  if (h.commonsRatio > 3 || h.commonsRatio < 1 / 3) problems.push(`COMMONS basket ×${h.commonsRatio.toFixed(2)} — F2P affordability broken`);
  if (h.totalSales === 0) problems.push('market completely dead (zero sales)');
  if (h.authority.feeMult > 2.5 || h.authority.taxMult > 2) problems.push('authority left its bounds');
  if (sc.expectEngaged && h.authority.feeMult < 1.15 && h.authority.inflationIdx < 1.02) problems.push('authority never engaged under inflation pressure');
  for (const k of sc.expectFlags ?? []) {
    if (!h.flagKinds.includes(k)) problems.push(`expected flag '${k}' never raised`);
  }
  const line = `${problems.length === 0 ? '✓' : '✗'} ${sc.name}: ${h.days}d · sales ${h.totalSales} · basket ×${h.priceRatio.toFixed(2)} commons ×${h.commonsRatio.toFixed(2)} ` +
    `· stale ${(h.staleFrac * 100).toFixed(0)}% · fee×${h.authority.feeMult.toFixed(2)} tax×${h.authority.taxMult.toFixed(2)} ` +
    `base ${h.authority.baselineLevel.toFixed(1)} idx ${h.authority.inflationIdx.toFixed(3)} · flags [${h.flagKinds.join(', ')}]`;
  report.push(line);
  if (problems.length > 0) {
    failures++;
    for (const p of problems) report.push(`   ↳ ${p}`);
  }
}

console.log('MARKET SIMULATION — 10 scenarios, ~3,820 simulated market days');
for (const l of report) console.log(l);
if (failures > 0) {
  console.error(`\n${failures} scenario(s) UNHEALTHY`);
  process.exit(1);
}
console.log('\nAll scenarios healthy — money conserved, exclusives untouched, authority bounded.');

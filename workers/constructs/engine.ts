// CONSTRUCT ENGINE (docs/CONSTRUCTS.md §tick) — one TICK of one Market Construct: load its save
// from its cloud slot, play the wall time it is owed, visit the market when due, commit the save.
//
//   • PLAY is the progression simulator's virtual player (src/dev/progressionSim playVirtualRun):
//     each run's battle is MODELED (wave count, kills, duration — the calibrated WORLD constants),
//     everything the run feeds is the production meta layer (settlement, loot, containers, the
//     spend pass). Pace is real time: a play-credit balance carried in the roster row means a
//     construct plays exactly as many seconds as the clock gives it — nonstop, never faster.
//   • TRADE mirrors the player client (state/auctionHouse.ts) step for step through the wire
//     (router.ts → the real handlers): deliveries in, proceeds out, Ichor in, listings, purchases,
//     bids. Every DECISION is a pure function in src/core/constructs.ts.
//   • COMMIT ORDER is chosen so a failure can only ever LOSE a construct value, never mint it:
//     server-side moves (listing escrow, withdrawals, buys/bids, delivery acks) happen before the
//     save commit; the deposit spends locally, commits, THEN credits the server. A failed commit
//     discards the tick's local changes (the next tick reloads and replays the owed time) — a
//     delivery acked but not committed is lost, never duplicated (re-delivering equipment would
//     mint a copy under a fresh uid).
//
// The meta layer is a singleton over ONE save — ticks run strictly one construct at a time.

import { meta } from '../../src/state/meta';
import { playVirtualRun } from '../../src/dev/progressionSim';
import { PERSONAS } from '../../src/dev/personas';
import { buildEnvelope, envelopeMeta, isEnvelope, openEnvelope, verifyEnvelope } from '../../src/save/envelope';
import { highestCampaignStage } from '../../src/save/derive';
import { powerBreakdown } from '../../src/state/profile';
import {
  CONSTRUCT, constructAsk, constructBid, constructBuyNow, constructWorth, depositAmount,
  marketDue, playSecondsFor, shoppable, wantsBuyNow, withdrawAmount,
} from '../../src/core/constructs';
import type { ConstructDef } from '../../src/core/constructs';
import { TRADE, minNextBid } from '../../src/core/trading';
import type { ConstructWire } from './router';
import { HOST } from '../../functions/lib/auctionHost';

/** The roster row the host persists between ticks (D1 `constructs`). */
export interface ConstructState {
  token: string;
  /** Play-time balance in seconds (owed play; negative = a run overshot the clock). */
  creditSec: number;
  /** Wall clock of the previous tick (0 = never ticked). */
  lastTickAt: number;
}

export interface TickReport {
  id: string;
  name: string;
  runs: number;
  stage: number;
  power: number;
  market: { visited: boolean; listed: number; bought: number; bid: number; deposited: number; withdrawn: number; delivered: number; skipped?: string };
  saved: boolean;
  errors: string[];
}

interface WireListing {
  listingId: string; familyKey: string; sellerId: string; ask: number; buyNow: number | null;
  bid: number | null; state: string; authority: boolean;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86_400_000;

/** A fresh construct's first tick plays this much (its "first session"). */
const FIRST_TICK_MS = 5 * 60_000;

export async function tickConstruct(c: ConstructDef, state: ConstructState, wire: ConstructWire, now: number): Promise<{ state: ConstructState; report: TickReport }> {
  const report: TickReport = {
    id: c.id, name: c.name, runs: 0, stage: 0, power: 0, saved: false, errors: [],
    market: { visited: false, listed: 0, bought: 0, bid: 0, deposited: 0, withdrawn: 0, delivered: 0 },
  };
  const auth = `playerId=${c.id}&token=${state.token}`;
  const creds = { playerId: c.id, token: state.token };

  // ── 1. Load the save (or begin a fresh account) ──
  const slot = await wire('GET', `/api/save?${auth}`);
  if (slot.status === 404) {
    meta.reset();
  } else if (slot.status === 200 && typeof slot.body.blob === 'string') {
    let text = slot.body.blob;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (isEnvelope(parsed)) {
        if (!verifyEnvelope(parsed)) throw new Error('envelope');
        text = openEnvelope(parsed);
      }
    } catch {
      report.errors.push('save-corrupt');
      return { state, report }; // never overwrite a slot we cannot read
    }
    if (!meta.importText(text).ok) {
      report.errors.push('save-import');
      return { state, report };
    }
  } else {
    report.errors.push(`save-load-${String(slot.body.error ?? slot.status)}`);
    return { state, report };
  }

  // ── 2. Play the time it is owed (real-time pace, capped catch-up) ──
  const rng = mulberry32((c.seed * 2_654_435_761) ^ Math.floor(now / 60_000));
  const elapsedMs = state.lastTickAt > 0 ? now - state.lastTickAt : FIRST_TICK_MS;
  let credit = Math.min(CONSTRUCT.maxCatchUpSec, state.creditSec + playSecondsFor(elapsedMs));
  const persona = PERSONAS[c.play];
  while (credit > 0 && report.runs < CONSTRUCT.maxRunsPerTick) {
    credit -= playVirtualRun(rng, persona).secs;
    report.runs++;
  }

  // ── 3. Market visit (every CONSTRUCT.marketEveryMs) — server-side moves first ──
  let pendingDeposit = 0;
  if (state.lastTickAt > 0 && marketDue(state.lastTickAt, now)) {
    report.market.visited = true;
    try {
      pendingDeposit = await visitMarket(c, wire, auth, creds, rng, now, report);
    } catch (e) {
      report.errors.push(`market-${String(e).slice(0, 80)}`);
    }
  }

  // ── 4. Commit the save (the tick's single commit point) ──
  const committed = await commitSave(c, wire, creds);
  report.saved = committed;
  if (!committed) {
    report.errors.push('save-commit');
    return { state, report }; // pacing untouched: the next tick replays the owed time
  }

  // ── 5. Post-commit: credit the deposit (spent + committed first — a lost credit never mints) ──
  if (pendingDeposit > 0) {
    const r = await wire('POST', '/api/auction/wallet', { ...creds, action: 'deposit', amount: pendingDeposit, opId: crypto.randomUUID() });
    if (r.status === 200) {
      report.market.deposited = pendingDeposit;
    } else {
      meta.grantIchor('Auction wallet refund', pendingDeposit); // refused — the Ichor goes back
      report.errors.push(`deposit-${String(r.body.error ?? r.status)}`);
      if (!(await commitSave(c, wire, creds))) report.errors.push('save-commit-refund');
    }
  }

  const save = meta.get();
  report.stage = highestCampaignStage(save);
  report.power = Math.round(powerBreakdown(save).score);
  return { state: { ...state, lastTickAt: now, creditSec: credit }, report };
}

/** Upload the live save the way the sync engine does (envelope + headline). */
async function commitSave(c: ConstructDef, wire: ConstructWire, creds: { playerId: string; token: string }): Promise<boolean> {
  const save = meta.get();
  const env = buildEnvelope(save, {
    accountId: c.id,
    platform: 'construct',
    power: powerBreakdown(save).score,
    campaignStage: highestCampaignStage(save),
  });
  const r = await wire('PUT', '/api/save', { ...creds, blob: JSON.stringify(env), meta: { ...envelopeMeta(env) } });
  return r.status === 200;
}

/** One market visit. Returns the Ichor to deposit AFTER the commit (already spent locally). */
async function visitMarket(
  c: ConstructDef, wire: ConstructWire, auth: string, creds: { playerId: string; token: string },
  rng: () => number, now: number, report: TickReport,
): Promise<number> {
  const mine = await wire('GET', `/api/auction/mine?${auth}`);
  if (mine.status !== 200) {
    report.market.skipped = String(mine.body.error ?? mine.status); // e.g. no cloud save yet
    return 0;
  }
  const m = mine.body as unknown as {
    eligibility: { campaignStage: number; accountAgeDays: number };
    wallet: { balance: number };
    listings: (WireListing & { createdAt: number; globalItemId: string })[];
    bids: WireListing[];
    trades: { buyer_id: string; at: number }[];
    pendingItems: { global_item_id: string; ref_key: string; payload: string; season: number; transfers: number }[];
    ledger: { kind: string; amount: number; at: number }[];
  };

  // Custody self-heal + deliveries, acked at once (the client's refreshMine, verbatim in intent).
  meta.auctionReconcile(m.listings.filter((l) => l.state === 'active').map((l) => l.globalItemId.slice(l.globalItemId.indexOf('/') + 1)));
  if (m.pendingItems.length > 0) {
    report.market.delivered = meta.auctionDeliver(m.pendingItems.map((p) => ({
      refKey: p.ref_key, payloadJson: p.payload, season: p.season, transfers: p.transfers,
    }))).length;
    await wire('POST', '/api/auction/collect', { ...creds, itemIds: m.pendingItems.map((p) => p.global_item_id) });
  }

  const dayAgo = now - DAY_MS;
  const listedToday = m.listings.filter((l) => l.createdAt > dayAgo && !l.authority).length;
  const boughtToday = m.trades.filter((t) => t.buyer_id === c.id && t.at > dayAgo).length;
  const depositedToday = m.ledger.filter((l) => l.kind === 'deposit' && l.at > dayAgo).reduce((s, l) => s + l.amount, 0);
  let balance = m.wallet.balance;

  // Deposit: top the float up from the construct's own earned Ichor — spent now, credited after
  // the commit (a lost credit can only lose value, never mint it). Like a player's wallet, it
  // opens BEFORE trading is allowed: the wallet's first touch starts the market-age clock.
  const dep = depositAmount(meta.get().ichor, balance, depositedToday);
  const pendingDeposit = dep > 0 && meta.spendIchor(dep) ? dep : 0;

  // Trading is an earned capability — a construct meets the same gate as a player.
  if (m.eligibility.campaignStage < TRADE.minCampaignStage || m.eligibility.accountAgeDays < TRADE.minAccountAgeDays) {
    report.market.skipped = 'not-yet-eligible';
    return pendingDeposit;
  }

  // Proceeds above the float return to the save (server debit first, then the local credit).
  const out = withdrawAmount(balance);
  if (out > 0) {
    const r = await wire('POST', '/api/auction/wallet', { ...creds, action: 'withdraw', amount: out, opId: crypto.randomUUID() });
    if (r.status === 200) {
      meta.grantIchor('Auction withdrawal', out);
      balance -= out;
      report.market.withdrawn = out;
    }
  }

  // ── Sell: surplus the construct's own play earned, at the market's price ──
  const recommended = new Map<string, { rec: number; value: number | null }>();
  const readFamily = async (familyKey: string): Promise<{ rec: number; value: number | null } | null> => {
    const hit = recommended.get(familyKey);
    if (hit) return hit;
    const h = await wire('GET', `/api/auction/history?family=${encodeURIComponent(familyKey)}`);
    if (h.status !== 200) return null;
    const stats = h.body.stats as { estimatedValue?: number | null; lowestListing?: number | null } | undefined;
    const rarity = String((h.body.family as { rarity?: string } | undefined)?.rarity ?? '');
    // A COLD family (no sales history, nothing listed) has no market read — the endpoint's
    // recommendation is the bare price floor whatever the rarity. Use the SAME per-rarity seed
    // guidance the authority values cold families by (HOST.defaultGuide); none ⇒ 0 ⇒ the
    // construct neither lists nor buys it (it never dumps an epic at the floor).
    const cold = (stats?.estimatedValue ?? null) === null && (stats?.lowestListing ?? null) === null;
    const read = cold
      ? { rec: HOST.defaultGuide[rarity] ?? 0, value: null }
      : { rec: Number(h.body.recommended) || 0, value: stats?.estimatedValue ?? null };
    recommended.set(familyKey, read);
    return read;
  };
  const keeps = c.style === 'collector' ? new Set(['rare', 'epic', 'legendary', 'mythic']) : new Set<string>();
  const liveByFamily = new Map<string, number>();
  for (const l of m.listings) if (l.state === 'active') liveByFamily.set(l.familyKey, (liveByFamily.get(l.familyKey) ?? 0) + 1);
  const sellables = meta.auctionSellables().filter((s) => s.blocks.length === 0 && !keeps.has(s.rarity)
    && (liveByFamily.get(s.familyKey) ?? 0) < CONSTRUCT.maxPerFamily);
  let sellRoom = rng() < CONSTRUCT.listChance ? Math.min(1, CONSTRUCT.maxListingsPerDay - listedToday) : 0;
  while (sellRoom > 0 && sellables.length > 0 && balance > 0) {
    const s = sellables.splice(Math.floor(rng() * sellables.length), 1)[0];
    const fam = await readFamily(s.familyKey);
    if (!fam || fam.rec <= 0) continue;
    const ask = constructAsk(fam.rec, c.style, rng());
    const buyNow = constructBuyNow(ask, rng(), rng());
    const durationH = TRADE.durationsH[Math.floor(rng() * TRADE.durationsH.length)];
    const r = await wire('POST', '/api/auction/list', {
      ...creds,
      item: { refKey: s.refKey, familyKey: s.familyKey, rarity: s.rarity, season: s.season, source: s.source, payload: s.payload },
      ask, buyNow, durationH,
    });
    sellRoom--;
    if (r.status !== 200) {
      report.errors.push(`list-${String(r.body.error ?? r.status)}`);
      continue;
    }
    meta.auctionEscrowOut(s.refKey); // the server holds it now
    balance -= Number(r.body.fee) || 0;
    report.market.listed++;
  }

  // ── Shop: players' listings at or below value (never another construct's, never stock) ──
  let buyRoom = CONSTRUCT.maxBuysPerDay - boughtToday;
  let bidRoom = CONSTRUCT.maxBidsPerDay - m.bids.length;
  if (buyRoom > 0 || bidRoom > 0) {
    const search = await wire('GET', '/api/auction/search?sort=priceAsc&page=0');
    const rows = (search.status === 200 ? (search.body.listings as WireListing[]) : [])
      .filter((l) => shoppable(l, c.id))
      .slice(0, CONSTRUCT.shopScan);
    let reads = 0;
    for (const l of rows) {
      if ((buyRoom <= 0 && bidRoom <= 0) || reads >= 6) break;
      const fam = await readFamily(l.familyKey);
      reads++;
      if (!fam) continue;
      const worth = constructWorth(fam.value ?? (fam.rec || null), c.style);
      if (l.buyNow !== null && buyRoom > 0 && wantsBuyNow(l.buyNow, worth, balance)) {
        const r = await wire('POST', '/api/auction/buy', { ...creds, listingId: l.listingId });
        if (r.status === 200) {
          balance -= l.buyNow;
          buyRoom--;
          report.market.bought++;
        }
        continue;
      }
      if (bidRoom > 0) {
        const next = l.bid === null ? l.ask : minNextBid(l.bid);
        const amount = constructBid(next, worth, balance);
        if (amount === null) continue;
        const r = await wire('POST', '/api/auction/bid', { ...creds, listingId: l.listingId, amount });
        if (r.status === 200) {
          balance -= amount;
          bidRoom--;
          report.market.bid++;
        }
      }
    }
  }

  return pendingDeposit;
}

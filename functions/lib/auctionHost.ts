// AUCTION HOST (docs/AUCTION-HOUSE.md §server) — the D1 side of the market. Every rule the
// endpoints enforce comes from the SHARED core modules (core/auction engine, core/trading
// eligibility, core/marketAuthority levers, core/marketCatalog families) — this file only
// maps engine outcomes onto SQL and keeps the money paths atomic:
//
//   • Wallet safety is a SCHEMA property: market_wallets CHECKs (balance/escrow ≥ 0) turn an
//     overdraft into a SQL error, and because env.DB.batch() is a transaction, the WHOLE
//     action rolls back — insufficient funds can never half-apply.
//   • Ordering discipline: state-transition first (listing UPDATE / trade INSERT gate), then
//     money statements CONDITIONED on that transition (INSERT…SELECT WHERE EXISTS / UPDATE…
//     WHERE EXISTS). A lost race means the condition reads false and nothing charges — no
//     compensation paths in the request flow.
//   • Exactly-once: market_trades PK (one settlement per listing), market_wallet_ledger PK
//     (deposits/withdrawals/credits dedupe by op id), market_windows PK (one authority tick
//     per window, whichever request wins the INSERT).
//   • The Market Authority is "always running" as a property of the data: every trafficked
//     endpoint calls maintainMarket(), which lazily settles due auctions, advances the
//     authority window, restocks baseline supply, and (periodically) runs the fraud audit.

import type { Env } from './env';
import { sha256Hex, timingSafeEqualStr } from './crypto';
import { isSyncToken } from './validate';
import { sessionAccount } from './accounts';
import { familyStats, recommendedPrice, settleExpired } from '../../src/core/auction';
import type { LiveListing } from '../../src/core/auction';
import { saleTax } from '../../src/core/trading';
import type { MarketHistoryPoint, TradeEvent } from '../../src/core/trading';
import {
  auditMarket, authorityTick, baselineDemandScale, buybackBudget,
  defaultAuthorityState, emptyMetrics, planBaselineRestock, planBuybacks,
} from '../../src/core/marketAuthority';
import type {
  AuthorityState, BuybackCandidate, ListingEvent, MarketMetrics, SellerBuybackRecord,
} from '../../src/core/marketAuthority';
import { AUTHORITY_ELIGIBLE_OVERRIDES, baselineCatalog, marketFamily } from '../../src/core/marketCatalog';

// ── Host tunables (server policy — engine/economy rules live in src/core) ─────
export const HOST = {
  windowMs: 3_600_000, // authority window = 1 UTC hour
  settleBatch: 25, // lazy settlement cap per request
  restockBatch: 40, // baseline orders placed per tick at most
  auditEveryWindows: 12, // fraud audit cadence (~twice a day under traffic)
  auditTradeDays: 7,
  maxDeposit: 250_000,
  payloadMaxChars: 4_096,
  pageCap: 40, // search pagination ceiling
  buybackCandidateCap: 60, // stale rows considered per tick (liquidity engine, §buybacks)
  /** Seed guidance when a family has no history and no floor (per catalog rarity). */
  defaultGuide: { common: 30, uncommon: 80, rare: 220 } as Record<string, number>,
} as const;

// ── Row shapes ────────────────────────────────────────────────────────────────
export interface ListingRow {
  listing_id: string; global_item_id: string; family_key: string; category: string;
  rarity: string; seller_id: string; season: number; ask: number; buy_now: number | null;
  bid: number | null; bidder_id: string | null; ends_at: number; created_at: number;
  closed_at: number | null; state: string; fee_paid: number; authority: number;
}

export interface WalletRow {
  balance: number; escrow: number; deposited_lifetime: number; withdrawn_lifetime: number; created_at: number;
}

export function rowToLive(r: ListingRow): LiveListing {
  const refKey = r.global_item_id.slice(r.global_item_id.indexOf('/') + 1);
  const sep = refKey.indexOf(':');
  return {
    listingId: r.listing_id,
    globalItemId: r.global_item_id,
    ref: { cat: r.category as LiveListing['ref']['cat'], id: sep >= 0 ? refKey.slice(sep + 1) : refKey },
    familyKey: r.family_key,
    rarity: r.rarity,
    sellerId: r.seller_id,
    ask: r.ask,
    buyNow: r.buy_now,
    bid: r.bid,
    bidderId: r.bidder_id,
    endsAt: r.ends_at,
    createdAt: r.created_at,
    state: r.state as LiveListing['state'],
    feePaid: r.fee_paid,
    authority: r.authority === 1,
  };
}

/** The wire shape the client renders (camelCase, no server internals). */
export function toPublicListing(r: ListingRow): Record<string, unknown> {
  return {
    listingId: r.listing_id, globalItemId: r.global_item_id, familyKey: r.family_key,
    cat: r.category, rarity: r.rarity, season: r.season, sellerId: r.seller_id,
    ask: r.ask, buyNow: r.buy_now, bid: r.bid, bidderId: r.bidder_id,
    endsAt: r.ends_at, createdAt: r.created_at, state: r.state, authority: r.authority === 1,
  };
}

// ── Player authorization (the save.ts ownership model: session OR sync token) ──
export interface MarketAuth {
  ok: true;
  /** Campaign stage from the cloud-save headline (server-side eligibility input). */
  campaignStage: number;
  /** Account age in days — accounts.created_at, else the wallet's first touch. */
  accountAgeDays: number;
}
export interface MarketAuthErr { ok: false; status: number; code: string }

export async function authMarket(
  env: Env,
  playerId: string,
  token: string | null,
  session: string | null,
  now: number,
): Promise<MarketAuth | MarketAuthErr> {
  let stage = 0;
  let createdSec: number | null = null;
  if (session && isSyncToken(session)) {
    const acct = await sessionAccount(env, session);
    if (!acct || acct.account_id !== playerId) return { ok: false, status: 403, code: 'unauthorized' };
    createdSec = Number(acct.created_at) || null;
    const save = await env.DB.prepare('SELECT token_hash, meta FROM cloud_saves WHERE player_id = ?1')
      .bind(playerId).first<{ token_hash: string; meta: string }>();
    stage = stageFromMeta(save?.meta);
  } else {
    if (!isSyncToken(token)) return { ok: false, status: 403, code: 'unauthorized' };
    const save = await env.DB.prepare('SELECT token_hash, meta FROM cloud_saves WHERE player_id = ?1')
      .bind(playerId).first<{ token_hash: string; meta: string }>();
    // Trading REQUIRES an existing cloud slot (unlike save TOFU): the market must never
    // mint identities — a listing without a synced account has nothing to deliver into.
    if (!save) return { ok: false, status: 403, code: 'no-cloud-save' };
    if (!timingSafeEqualStr(save.token_hash, await sha256Hex(token))) return { ok: false, status: 403, code: 'wrong-token' };
    stage = stageFromMeta(save.meta);
  }
  if (createdSec === null) {
    const acct = await env.DB.prepare('SELECT created_at FROM accounts WHERE account_id = ?1')
      .bind(playerId).first<{ created_at: number }>();
    if (acct) createdSec = Number(acct.created_at) || null;
  }
  let firstTouchMs = createdSec !== null ? createdSec * 1000 : null;
  if (firstTouchMs === null) {
    const w = await readWallet(env, playerId);
    firstTouchMs = w ? w.created_at : now; // no wallet yet ⇒ market age starts now
  }
  return { ok: true, campaignStage: stage, accountAgeDays: Math.floor((now - firstTouchMs) / 86_400_000) };
}

function stageFromMeta(meta: string | undefined | null): number {
  if (!meta) return 0;
  try {
    const m = JSON.parse(meta) as { stage?: unknown };
    const n = Math.floor(Number(m.stage));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

// ── Wallet primitives ─────────────────────────────────────────────────────────
export function ensureWalletStmt(env: Env, playerId: string, now: number): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO market_wallets (player_id, balance, escrow, deposited_lifetime, withdrawn_lifetime, created_at, updated_at)
     VALUES (?1, 0, 0, 0, 0, ?2, ?2) ON CONFLICT(player_id) DO NOTHING`,
  ).bind(playerId, now);
}

export async function readWallet(env: Env, playerId: string): Promise<WalletRow | null> {
  return await env.DB.prepare(
    'SELECT balance, escrow, deposited_lifetime, withdrawn_lifetime, created_at FROM market_wallets WHERE player_id = ?1',
  ).bind(playerId).first<WalletRow>();
}

/** A D1 batch that maps schema-guard violations to machine codes instead of throwing:
 *  wallet CHECK ⇒ insufficient funds; the active-listing UNIQUE index ⇒ already listed.
 *  Either way the WHOLE batch rolled back — no partial state escapes. */
export async function runMoneyBatch(env: Env, stmts: D1PreparedStatement[]): Promise<{ ok: true; results: D1Result[] } | { ok: false; code: 'insufficient-funds' | 'already-listed' }> {
  try {
    const results = await env.DB.batch(stmts);
    return { ok: true, results };
  } catch (e) {
    const msg = String(e);
    if (msg.includes('CHECK')) return { ok: false, code: 'insufficient-funds' };
    if (msg.includes('UNIQUE')) return { ok: false, code: 'already-listed' };
    throw e;
  }
}

// ── Listing reads ─────────────────────────────────────────────────────────────
const LISTING_COLS = 'listing_id, global_item_id, family_key, category, rarity, seller_id, season, ask, buy_now, bid, bidder_id, ends_at, created_at, closed_at, state, fee_paid, authority';

export async function listingById(env: Env, listingId: string): Promise<ListingRow | null> {
  return await env.DB.prepare(`SELECT ${LISTING_COLS} FROM market_listings WHERE listing_id = ?1`)
    .bind(listingId).first<ListingRow>();
}

export async function familyFloor(env: Env, familyKey: string): Promise<number | null> {
  const row = await env.DB.prepare(
    "SELECT MIN(COALESCE(buy_now, ask)) AS m FROM market_listings WHERE state = 'active' AND family_key = ?1",
  ).bind(familyKey).first<{ m: number | null }>();
  return row?.m ?? null;
}

export async function familyHistory(env: Env, familyKey: string, sinceDay: string): Promise<MarketHistoryPoint[]> {
  const rows = await env.DB.prepare(
    'SELECT day, sales, median_price, low_price, high_price FROM market_history WHERE family_key = ?1 AND day >= ?2 ORDER BY day',
  ).bind(familyKey, sinceDay).all<{ day: string; sales: number; median_price: number; low_price: number; high_price: number }>();
  return rows.results.map((r) => ({ day: r.day, sales: r.sales, medianPrice: r.median_price, lowPrice: r.low_price, highPrice: r.high_price }));
}

/** UTC day key for an epoch-ms instant. */
export function dayKeyOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysAgoKey(now: number, days: number): string {
  return dayKeyOf(now - days * 86_400_000);
}

// ── Settlement ────────────────────────────────────────────────────────────────
/** Recompute one (family, day) history row from settled trades (median/low/high/sales). */
export async function foldFamilyDay(env: Env, familyKey: string, atMs: number): Promise<void> {
  const day = dayKeyOf(atMs);
  const start = Date.parse(`${day}T00:00:00Z`);
  const rows = await env.DB.prepare(
    'SELECT price FROM market_trades WHERE family_key = ?1 AND at >= ?2 AND at < ?3',
  ).bind(familyKey, start, start + 86_400_000).all<{ price: number }>();
  const prices = rows.results.map((r) => r.price).sort((a, b) => a - b);
  if (prices.length === 0) return;
  const median = prices[Math.floor(prices.length / 2)];
  await env.DB.prepare(
    `INSERT INTO market_history (family_key, day, sales, median_price, low_price, high_price)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(family_key, day) DO UPDATE SET sales = ?3, median_price = ?4, low_price = ?5, high_price = ?6`,
  ).bind(familyKey, day, prices.length, median, prices[0], prices[prices.length - 1]).run();
}

/** The post-settlement money/item movements — runs EXACTLY ONCE per listing because only
 *  the request whose trade INSERT actually inserted calls it (the purchases discipline). */
async function applySaleEffects(env: Env, row: ListingRow, sale: { buyerId: string; price: number; tax: number; proceeds: number }, now: number, viaEscrow: boolean, foldHistory = true): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  if (viaEscrow) {
    // The winning bid was escrowed at bid time — consume it (holdings finally leave the buyer).
    stmts.push(env.DB.prepare(
      'UPDATE market_wallets SET escrow = escrow - ?2, updated_at = ?3 WHERE player_id = ?1',
    ).bind(sale.buyerId, sale.price, now));
    stmts.push(env.DB.prepare(
      `INSERT INTO market_wallet_ledger (op_id, player_id, kind, amount, at) VALUES (?1, ?2, 'auctionWin', ?3, ?4)
       ON CONFLICT(op_id) DO NOTHING`,
    ).bind(`sale:${row.listing_id}:buyer`, sale.buyerId, -sale.price, now));
  }
  if (row.authority === 1) {
    stmts.push(env.DB.prepare(
      `INSERT INTO market_wallet_ledger (op_id, player_id, kind, amount, at) VALUES (?1, '@burn', 'authoritySale', ?2, ?3)
       ON CONFLICT(op_id) DO NOTHING`,
    ).bind(`sale:${row.listing_id}:burn`, sale.price, now));
  } else {
    stmts.push(ensureWalletStmt(env, row.seller_id, now));
    stmts.push(env.DB.prepare(
      'UPDATE market_wallets SET balance = balance + ?2, updated_at = ?3 WHERE player_id = ?1',
    ).bind(row.seller_id, sale.proceeds, now));
    stmts.push(env.DB.prepare(
      `INSERT INTO market_wallet_ledger (op_id, player_id, kind, amount, at) VALUES (?1, ?2, 'saleProceeds', ?3, ?4)
       ON CONFLICT(op_id) DO NOTHING`,
    ).bind(`sale:${row.listing_id}:seller`, row.seller_id, sale.proceeds, now));
    stmts.push(env.DB.prepare(
      `INSERT INTO market_wallet_ledger (op_id, player_id, kind, amount, at) VALUES (?1, '@burn', 'saleTax', ?2, ?3)
       ON CONFLICT(op_id) DO NOTHING`,
    ).bind(`sale:${row.listing_id}:tax`, sale.tax, now));
  }
  // Item custody: buyer becomes owner, provenance history grows (server-side truth).
  const item = await env.DB.prepare('SELECT history FROM market_items WHERE global_item_id = ?1')
    .bind(row.global_item_id).first<{ history: string }>();
  let history: string[] = [];
  try { history = item ? (JSON.parse(item.history) as string[]) : []; } catch { history = []; }
  history.push(row.seller_id);
  if (history.length > 8) history = history.slice(-8);
  stmts.push(env.DB.prepare(
    `UPDATE market_items SET owner_id = ?2, state = 'delivered', transfers = transfers + 1, history = ?3 WHERE global_item_id = ?1`,
  ).bind(row.global_item_id, sale.buyerId, JSON.stringify(history)));
  await env.DB.batch(stmts);
  // Buybacks (authority=2) never fold into price history: the estimates that AUTHORIZE a
  // purchase must reflect player demand only — the engine feeding its own valuation would
  // be a walkable price-support loop (docs/AUCTION-HOUSE.md §buybacks).
  if (foldHistory) await foldFamilyDay(env, row.family_key, now);
}

/** Settle one due listing (standing bid wins; bid-free expires back to the seller). */
export async function settleListingRow(env: Env, row: ListingRow, now: number, taxMult: number): Promise<void> {
  const r = settleExpired(rowToLive(row), now, taxMult);
  if (!r.ok) return;
  if (r.value.sale) {
    const gate = await env.DB.batch([
      env.DB.prepare(
        `UPDATE market_listings SET state = 'sold', closed_at = ?2 WHERE listing_id = ?1 AND state = 'active'`,
      ).bind(row.listing_id, now),
      env.DB.prepare(
        `INSERT INTO market_trades (listing_id, global_item_id, family_key, seller_id, buyer_id, price, tax, authority, at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
         WHERE EXISTS (SELECT 1 FROM market_listings WHERE listing_id = ?1 AND state = 'sold')
         ON CONFLICT(listing_id) DO NOTHING`,
      ).bind(
        row.listing_id, row.global_item_id, row.family_key, row.seller_id, r.value.sale.buyerId,
        r.value.sale.price, r.value.sale.tax, row.authority, now,
      ),
    ]);
    if (gate[1].meta.changes === 1) {
      await applySaleEffects(env, row, r.value.sale, now, true);
    }
  } else {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE market_listings SET state = 'expired', closed_at = ?2 WHERE listing_id = ?1 AND state = 'active'`,
      ).bind(row.listing_id, now),
      env.DB.prepare(
        `UPDATE market_items SET state = 'returned'
         WHERE global_item_id = ?1 AND EXISTS (SELECT 1 FROM market_listings WHERE listing_id = ?2 AND state = 'expired')`,
      ).bind(row.global_item_id, row.listing_id, now),
    ]);
  }
}

// ── Authority state ───────────────────────────────────────────────────────────
export async function readAuthority(env: Env): Promise<AuthorityState> {
  const row = await env.DB.prepare('SELECT state FROM market_authority WHERE id = 0').first<{ state: string }>();
  if (!row) return defaultAuthorityState(0);
  try {
    return { ...defaultAuthorityState(0), ...(JSON.parse(row.state) as Partial<AuthorityState>) };
  } catch {
    return defaultAuthorityState(0);
  }
}

async function writeAuthority(env: Env, state: AuthorityState, now: number): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO market_authority (id, state, updated_at) VALUES (0, ?1, ?2) ON CONFLICT(id) DO UPDATE SET state = ?1, updated_at = ?2',
  ).bind(JSON.stringify(state), now).run();
}

/** One window's MarketMetrics from live tables (docs/AUCTION-HOUSE.md §authority inputs). */
export async function computeWindowMetrics(env: Env, windowKey: number): Promise<MarketMetrics> {
  const start = windowKey * HOST.windowMs;
  const end = start + HOST.windowMs;
  const m = emptyMetrics(windowKey);
  const trade = await env.DB.prepare(
    'SELECT COUNT(*) AS n, COALESCE(SUM(price), 0) AS vol, COALESCE(AVG(price), 0) AS avgp FROM market_trades WHERE at >= ?1 AND at < ?2 AND authority != 2',
  ).bind(start, end).first<{ n: number; vol: number; avgp: number }>();
  m.sales = trade?.n ?? 0;
  m.saleVolume = trade?.vol ?? 0;
  m.avgSalePrice = trade?.avgp ?? 0;
  const traders = await env.DB.prepare(
    'SELECT buyer_id AS id FROM market_trades WHERE at >= ?1 AND at < ?2 UNION SELECT seller_id FROM market_trades WHERE at >= ?1 AND at < ?2',
  ).bind(start, end).all<{ id: string }>();
  m.uniqueTraders = traders.results.filter((t) => t.id !== '@authority').length;
  const burned = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS s FROM market_wallet_ledger WHERE player_id = '@burn' AND at >= ?1 AND at < ?2",
  ).bind(start, end).first<{ s: number }>();
  m.ichorBurned = burned?.s ?? 0;
  const active = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM market_listings WHERE state = 'active'",
  ).first<{ n: number }>();
  m.activeListings = active?.n ?? 0;
  const opened = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM market_listings WHERE created_at >= ?1 AND created_at < ?2',
  ).bind(start, end).first<{ n: number }>();
  m.listingsOpened = opened?.n ?? 0;
  const stale = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM market_listings WHERE state = 'active' AND bid IS NULL AND (created_at + ends_at) < ?1",
  ).bind(2 * end).first<{ n: number }>();
  m.staleListings = stale?.n ?? 0;
  const rare = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM market_listings WHERE state = 'active' AND rarity NOT IN ('common', 'uncommon')",
  ).first<{ n: number }>();
  m.rareActiveListings = rare?.n ?? 0;
  const wallets = await env.DB.prepare(
    'SELECT COUNT(*) AS n, COALESCE(SUM(balance), 0) AS bal, COALESCE(SUM(escrow), 0) AS esc FROM market_wallets',
  ).first<{ n: number; bal: number; esc: number }>();
  m.ichorCirculation = (wallets?.bal ?? 0) + (wallets?.esc ?? 0);
  if (wallets && wallets.n > 0) {
    const mid = await env.DB.prepare(
      'SELECT balance FROM market_wallets ORDER BY balance LIMIT 1 OFFSET ?1',
    ).bind(Math.floor(wallets.n / 2)).first<{ balance: number }>();
    m.medianWealth = mid?.balance ?? 0;
  }
  // Volatility: mean day-median spread over estimate across families with recent sales.
  const hist = await env.DB.prepare(
    'SELECT family_key, day, sales, median_price, low_price, high_price FROM market_history WHERE day >= ?1',
  ).bind(daysAgoKey(end, 7)).all<{ family_key: string; day: string; sales: number; median_price: number; low_price: number; high_price: number }>();
  const byFamily = new Map<string, number[]>();
  for (const h of hist.results) {
    if (h.sales <= 0) continue;
    const list = byFamily.get(h.family_key) ?? [];
    list.push(h.median_price);
    byFamily.set(h.family_key, list);
  }
  let volSum = 0; let volN = 0;
  for (const medians of byFamily.values()) {
    if (medians.length < 2) continue;
    const avg = medians.reduce((a, b) => a + b, 0) / medians.length;
    if (avg <= 0) continue;
    volSum += Math.min(1, (Math.max(...medians) - Math.min(...medians)) / avg);
    volN++;
  }
  m.volatilityAvg = volN > 0 ? volSum / volN : 0;
  return m;
}

/** Baseline restock: plan against live authority stock + guided prices, then place the
 *  orders as ordinary listings (never undercutting players — core rule prices ABOVE guide). */
async function restockBaseline(env: Env, state: AuthorityState, uniqueTraders: number, now: number): Promise<void> {
  const authCounts = await env.DB.prepare(
    "SELECT family_key, COUNT(*) AS n FROM market_listings WHERE state = 'active' AND authority = 1 GROUP BY family_key",
  ).all<{ family_key: string; n: number }>();
  const counts = new Map(authCounts.results.map((r) => [r.family_key, r.n]));
  const floors = await env.DB.prepare(
    "SELECT family_key, MIN(COALESCE(buy_now, ask)) AS m FROM market_listings WHERE state = 'active' GROUP BY family_key",
  ).all<{ family_key: string; m: number }>();
  const floorMap = new Map(floors.results.map((r) => [r.family_key, r.m]));
  const hist = await env.DB.prepare(
    'SELECT family_key, day, sales, median_price, low_price, high_price FROM market_history WHERE day >= ?1',
  ).bind(daysAgoKey(now, 14)).all<{ family_key: string; day: string; sales: number; median_price: number; low_price: number; high_price: number }>();
  const histMap = new Map<string, MarketHistoryPoint[]>();
  for (const h of hist.results) {
    const list = histMap.get(h.family_key) ?? [];
    list.push({ day: h.day, sales: h.sales, medianPrice: h.median_price, lowPrice: h.low_price, highPrice: h.high_price });
    histMap.set(h.family_key, list);
  }
  const guide = (familyKey: string): number => {
    const fam = marketFamily(familyKey);
    const stats = familyStats(histMap.get(familyKey) ?? [], floorMap.get(familyKey) ?? null);
    if (stats.estimatedValue === null && stats.lowestListing === null) {
      return HOST.defaultGuide[fam?.rarity ?? 'common'] ?? HOST.defaultGuide.common;
    }
    return recommendedPrice(stats, state.recBias);
  };
  const orders = planBaselineRestock(
    baselineCatalog(), (f) => counts.get(f) ?? 0, guide, state, baselineDemandScale(uniqueTraders),
  ).slice(0, HOST.restockBatch);
  if (orders.length === 0) return;
  const stmts: D1PreparedStatement[] = [];
  const windowKey = Math.floor(now / HOST.windowMs);
  orders.forEach((o, i) => {
    const gid = `@authority/${o.familyKey}#${windowKey}.${i}`;
    const refKey = authorityRefKey(o.familyKey, windowKey, i);
    const payload = JSON.stringify({ grant: authorityGrant(o.familyKey, o.cat, o.rarity) });
    stmts.push(env.DB.prepare(
      `INSERT INTO market_items (global_item_id, ref_key, category, family_key, rarity, season, owner_id, state, source, transfers, history, payload, fraud_flag, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 0, '@authority', 'escrow', 'authority', 0, '[]', ?6, 0, ?7)
       ON CONFLICT(global_item_id) DO NOTHING`,
    ).bind(gid, refKey, o.cat, o.familyKey, o.rarity, payload, now));
    stmts.push(env.DB.prepare(
      `INSERT INTO market_listings (listing_id, global_item_id, family_key, category, rarity, seller_id, season, ask, buy_now, bid, bidder_id, ends_at, created_at, closed_at, state, fee_paid, authority)
       VALUES (?1, ?2, ?3, ?4, ?5, '@authority', 0, ?6, ?6, NULL, NULL, ?7, ?8, NULL, 'active', 0, 1)`,
    ).bind(`A${windowKey.toString(36)}.${i}.${crypto.randomUUID().slice(0, 8)}`, gid, o.familyKey, o.cat, o.rarity, o.price, now + 48 * 3_600_000, now));
  });
  await env.DB.batch(stmts);
}

/** familyKey → the payload descriptor a buying client materializes the item from. */
function authorityGrant(familyKey: string, cat: string, rarity: string): Record<string, unknown> {
  const parts = familyKey.split('.');
  if (cat === 'geneCard') return { kind: 'gene', id: parts.slice(1).join('.') };
  if (cat === 'cosmetic') return { kind: 'cosmetic', id: parts.slice(1).join('.') };
  return { kind: 'equipment', defId: parts[1] ?? '', rarity };
}

function authorityRefKey(familyKey: string, windowKey: number, i: number): string {
  const parts = familyKey.split('.');
  if (parts[0] === 'gene') return `gene:${parts.slice(1).join('.')}`;
  if (parts[0] === 'cos') return `cos:${parts.slice(1).join('.')}`;
  return `eq:auth-${parts[1] ?? 'x'}-${windowKey}.${i}`; // synthetic instance uid
}

// ── Market Liquidity Engine (docs/AUCTION-HOUSE.md §buybacks) — the authority's BUY side ──
/** The tick's buyback pass: gather stale bid-free player listings (+ item provenance),
 *  screen manipulation signals, let the pure planner pick under budget/caps/rng, then settle
 *  each pick with the EXACT sale discipline (sold-gate → trade INSERT → conditioned money).
 *  The sold-gate additionally requires `bid IS NULL`, so a player bid landing in the race
 *  window always beats the authority — player demand wins at the SQL level, not by luck. */
async function runBuybacks(env: Env, m: MarketMetrics, state: AuthorityState, now: number): Promise<void> {
  const budget = buybackBudget(m.ichorBurned);
  const cands = await env.DB.prepare(
    `SELECT l.listing_id, l.global_item_id, l.family_key, l.category, l.rarity, l.seller_id,
            l.buy_now, l.bid, l.ends_at, l.created_at, i.transfers, i.fraud_flag
     FROM market_listings l JOIN market_items i ON i.global_item_id = l.global_item_id
     WHERE l.state = 'active' AND l.authority = 0 AND l.bid IS NULL AND l.buy_now IS NOT NULL
     ORDER BY l.created_at LIMIT ?1`,
  ).bind(HOST.buybackCandidateCap).all<{
    listing_id: string; global_item_id: string; family_key: string; category: string;
    rarity: string; seller_id: string; buy_now: number; bid: number | null;
    ends_at: number; created_at: number; transfers: number; fraud_flag: number;
  }>();
  if (cands.results.length === 0) return;
  // Manipulation screen: any seller named by an UNREVIEWED recent flag is invisible to the
  // engine (flag ⇒ moderation decides; the authority never pays a suspect meanwhile).
  const flagRows = await env.DB.prepare(
    'SELECT detail FROM market_flags WHERE reviewed = 0 AND at >= ?1 LIMIT 200',
  ).bind(now - HOST.auditTradeDays * 86_400_000).all<{ detail: string }>();
  const flagged = new Set<string>();
  for (const r of flagRows.results) {
    try {
      const d = JSON.parse(r.detail) as Record<string, unknown>;
      for (const k of ['sellerId', 'fromId', 'toId'] as const) {
        if (typeof d[k] === 'string') flagged.add(d[k] as string);
      }
    } catch { /* an unparseable flag never widens eligibility */ }
  }
  // Per-seller recent buybacks → daily cap + cooldown records (a 30h lookback covers both).
  const recRows = await env.DB.prepare(
    'SELECT seller_id, at FROM market_trades WHERE authority = 2 AND at >= ?1 ORDER BY at DESC LIMIT 200',
  ).bind(now - 30 * 3_600_000).all<{ seller_id: string; at: number }>();
  const dayStart = now - (now % 86_400_000);
  const sellerRecords = new Map<string, SellerBuybackRecord>();
  for (const r of recRows.results) {
    const rec = sellerRecords.get(r.seller_id) ?? { boughtToday: 0, lastAt: 0 };
    if (r.at >= dayStart) rec.boughtToday++;
    rec.lastAt = Math.max(rec.lastAt, r.at);
    sellerRecords.set(r.seller_id, rec);
  }
  // Dupe walls: a seller's ACTIVE same-family listing counts.
  const sfRows = await env.DB.prepare(
    "SELECT seller_id, family_key, COUNT(*) AS n FROM market_listings WHERE state = 'active' AND authority = 0 GROUP BY seller_id, family_key LIMIT 500",
  ).all<{ seller_id: string; family_key: string; n: number }>();
  const sellerFam = new Map(sfRows.results.map((r) => [`${r.seller_id}|${r.family_key}`, r.n]));
  // Valuation inputs — the SAME stats line players see (floors + 14d history).
  const floors = await env.DB.prepare(
    "SELECT family_key, MIN(COALESCE(buy_now, ask)) AS m FROM market_listings WHERE state = 'active' GROUP BY family_key",
  ).all<{ family_key: string; m: number }>();
  const floorMap = new Map(floors.results.map((r) => [r.family_key, r.m]));
  const hist = await env.DB.prepare(
    'SELECT family_key, day, sales, median_price, low_price, high_price FROM market_history WHERE day >= ?1',
  ).bind(daysAgoKey(now, 14)).all<{ family_key: string; day: string; sales: number; median_price: number; low_price: number; high_price: number }>();
  const histMap = new Map<string, MarketHistoryPoint[]>();
  for (const h of hist.results) {
    const list = histMap.get(h.family_key) ?? [];
    list.push({ day: h.day, sales: h.sales, medianPrice: h.median_price, lowPrice: h.low_price, highPrice: h.high_price });
    histMap.set(h.family_key, list);
  }
  const candidates: BuybackCandidate[] = cands.results.map((r) => {
    const fam = marketFamily(r.family_key);
    const stats = familyStats(histMap.get(r.family_key) ?? [], floorMap.get(r.family_key) ?? null);
    return {
      listingId: r.listing_id,
      sellerId: r.seller_id,
      familyKey: r.family_key,
      cat: (fam?.cat ?? r.category) as BuybackCandidate['cat'],
      rarity: r.rarity,
      exclusive: fam ? fam.exclusive || fam.neverTrade : true, // unknown family ⇒ never buy
      price: r.buy_now,
      createdAt: r.created_at,
      endsAt: r.ends_at,
      hasBid: r.bid !== null,
      // No player history yet ⇒ the rarity's seed guidance is the (conservative) valuation.
      estimate: stats.estimatedValue ?? HOST.defaultGuide[r.rarity] ?? null,
      velocityPerDay: stats.salesPerDay,
      transfers: r.transfers,
      sellerFlagged: flagged.has(r.seller_id),
      itemFlagged: r.fraud_flag === 1,
      sellerFamilyListings: sellerFam.get(`${r.seller_id}|${r.family_key}`) ?? 1,
      authorityEligible: AUTHORITY_ELIGIBLE_OVERRIDES[r.family_key],
    };
  });
  // Real entropy — purchase timing/selection is not derivable from anything a player sees.
  const rng = (): number => {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    return b[0] / 4_294_967_296;
  };
  const orders = planBuybacks(candidates, { now, budget, uniqueTraders: m.uniqueTraders, windowSales: m.sales, sellerRecords, rng });
  for (const o of orders) {
    const row = await listingById(env, o.listingId);
    if (!row || row.state !== 'active' || row.authority !== 0 || row.bid !== null) continue;
    const price = row.buy_now;
    if (price === null) continue;
    const tax = Math.min(price, Math.ceil(saleTax(price) * Math.max(1, state.taxMult)));
    const gate = await env.DB.batch([
      env.DB.prepare(
        `UPDATE market_listings SET state = 'sold', closed_at = ?2 WHERE listing_id = ?1 AND state = 'active' AND bid IS NULL`,
      ).bind(row.listing_id, now),
      env.DB.prepare(
        `INSERT INTO market_trades (listing_id, global_item_id, family_key, seller_id, buyer_id, price, tax, authority, at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
         WHERE EXISTS (SELECT 1 FROM market_listings WHERE listing_id = ?1 AND state = 'sold')
         ON CONFLICT(listing_id) DO NOTHING`,
      ).bind(row.listing_id, row.global_item_id, row.family_key, row.seller_id, '@authority', price, tax, 2, now),
    ]);
    if (gate[1].meta.changes === 1) {
      // The seller is paid EXACTLY like any sale (proceeds credit + tax burn + custody to
      // '@authority'); the item retires from circulation — the baseline lane synthesizes its
      // own supply, so absorbed stock never re-enters and depresses prices.
      await applySaleEffects(env, row, { buyerId: '@authority', price, tax, proceeds: Math.max(0, price - tax) }, now, false, false);
    }
  }
}

// ── Fraud audit (periodic; flags only — moderation decides, never auto-punish) ──
export async function runAudit(env: Env, now: number): Promise<void> {
  const since = now - HOST.auditTradeDays * 86_400_000;
  const tradeRows = await env.DB.prepare(
    'SELECT listing_id, global_item_id, family_key, seller_id, buyer_id, price, tax, authority, at FROM market_trades WHERE at >= ?1 ORDER BY at DESC LIMIT 2000',
  ).bind(since).all<{ global_item_id: string; family_key: string; seller_id: string; buyer_id: string; price: number; authority: number; at: number }>();
  const hist = await env.DB.prepare(
    'SELECT family_key, day, sales, median_price, low_price, high_price FROM market_history WHERE day >= ?1',
  ).bind(daysAgoKey(now, 7)).all<{ family_key: string; sales: number; median_price: number }>();
  const medians = new Map<string, number>();
  for (const h of hist.results) if (h.sales > 0 && !medians.has(h.family_key)) medians.set(h.family_key, h.median_price);
  const trades: TradeEvent[] = tradeRows.results
    .filter((t) => t.authority === 0) // player↔player only — authority sales AND buybacks are not fraud shapes
    .map((t) => ({
      at: t.at, itemKey: t.global_item_id.slice(t.global_item_id.indexOf('/') + 1),
      fromId: t.seller_id, toId: t.buyer_id, price: t.price, medianPrice: medians.get(t.family_key) ?? 0,
    }));
  const eventRows = await env.DB.prepare(
    'SELECT seller_id, family_key, global_item_id, created_at, closed_at, state, ask FROM market_listings WHERE (created_at >= ?1 OR (closed_at IS NOT NULL AND closed_at >= ?1)) AND authority = 0 LIMIT 1000',
  ).bind(now - 86_400_000).all<{ seller_id: string; family_key: string; global_item_id: string; created_at: number; closed_at: number | null; state: string; ask: number }>();
  const listingEvents: ListingEvent[] = [];
  for (const e of eventRows.results) {
    const refKey = e.global_item_id.slice(e.global_item_id.indexOf('/') + 1);
    if (e.created_at >= now - 86_400_000) listingEvents.push({ at: e.created_at, sellerId: e.seller_id, familyKey: e.family_key, refKey, action: 'open', ask: e.ask });
    if (e.state === 'cancelled' && e.closed_at !== null) listingEvents.push({ at: e.closed_at, sellerId: e.seller_id, familyKey: e.family_key, refKey, action: 'cancel', ask: e.ask });
  }
  const activeRows = await env.DB.prepare(
    `SELECT ${LISTING_COLS} FROM market_listings WHERE state = 'active' AND authority = 0 LIMIT 1000`,
  ).all<ListingRow>();
  const flags = auditMarket(trades, listingEvents, activeRows.results.map(rowToLive), (f) => medians.get(f) ?? 0);
  if (flags.length === 0) return;
  const stmts = flags.slice(0, 50).map((f) =>
    env.DB.prepare('INSERT INTO market_flags (kind, detail, at, reviewed) VALUES (?1, ?2, ?3, 0)')
      .bind(f.kind, JSON.stringify(f), now),
  );
  // Item-scoped signals also mark the item row (moderation sees it beside provenance).
  for (const f of flags) {
    if ('itemKey' in f && typeof f.itemKey === 'string') {
      stmts.push(env.DB.prepare('UPDATE market_items SET fraud_flag = 1 WHERE ref_key = ?1').bind(f.itemKey));
    }
  }
  await env.DB.batch(stmts);
}

// ── The always-running steward, woven into request handling ──────────────────
/** Lazily settle due auctions; advance the authority window exactly once (market_windows PK
 *  is the race gate); restock baseline supply; periodically audit. Every trafficked endpoint
 *  calls this — with zero traffic nothing needs stewarding, so nothing is missed. */
export async function maintainMarket(env: Env, now: number): Promise<AuthorityState> {
  let state = await readAuthority(env);
  const due = await env.DB.prepare(
    `SELECT ${LISTING_COLS} FROM market_listings WHERE state = 'active' AND ends_at <= ?1 ORDER BY ends_at LIMIT ?2`,
  ).bind(now, HOST.settleBatch).all<ListingRow>();
  for (const row of due.results) {
    await settleListingRow(env, row, now, state.taxMult);
  }
  const windowKey = Math.floor(now / HOST.windowMs);
  if (state.windowKey === 0) state = { ...state, windowKey: windowKey - 1 };
  if (windowKey > state.windowKey) {
    const claimed = await env.DB.prepare(
      "INSERT INTO market_windows (window_key, metrics, created_at) VALUES (?1, '', ?2) ON CONFLICT(window_key) DO NOTHING",
    ).bind(windowKey, now).run();
    if (claimed.meta.changes === 1) {
      const metrics = await computeWindowMetrics(env, windowKey - 1);
      state = authorityTick({ ...state, windowKey: windowKey - 1 }, { ...metrics, windowKey }, null);
      await writeAuthority(env, state, now);
      await env.DB.prepare('UPDATE market_windows SET metrics = ?2 WHERE window_key = ?1')
        .bind(windowKey, JSON.stringify(metrics)).run();
      await restockBaseline(env, state, metrics.uniqueTraders, now);
      await runBuybacks(env, metrics, state, now);
      if (windowKey % HOST.auditEveryWindows === 0) await runAudit(env, now);
    } else {
      state = await readAuthority(env); // another request won the tick — read its result
    }
  }
  return state;
}

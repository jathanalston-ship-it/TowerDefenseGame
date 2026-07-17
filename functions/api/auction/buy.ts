// POST /api/auction/buy — buy-now settlement (docs/AUCTION-HOUSE.md §listings). The close
// UPDATE is the race gate; the trade INSERT (PK listing_id) is the exactly-once anchor; the
// buyer charge, standing-bid refund, seller credit, tax burn and item transfer are all
// conditioned on THIS buyer's trade row existing — a lost race applies nothing, and an
// overdraft rolls the whole batch back through the wallet CHECK.

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { isPlayerId } from '../../lib/validate';
import {
  authMarket, ensureWalletStmt, foldFamilyDay, listingById, maintainMarket, rowToLive,
  runMoneyBatch,
} from '../../lib/auctionHost';
import { buyNow } from '../../../src/core/auction';

interface Body { playerId?: string; token?: string; session?: string; listingId?: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'auction-buy', ip, { limit: 40, windowSec: 3_600 }))) return err(429, 'rate-limited');

  const body = await readJson<Body>(request, 2_048);
  if (!body || !isPlayerId(body.playerId) || typeof body.listingId !== 'string' || body.listingId.length > 64) return err(400, 'bad-request');
  const now = Date.now();
  const auth = await authMarket(env, body.playerId, body.token ?? null, body.session ?? null, now);
  if (!auth.ok) return err(auth.status, auth.code);

  const state = await maintainMarket(env, now);
  const row = await listingById(env, body.listingId);
  if (!row) return err(404, 'no-listing');
  const settled = buyNow(rowToLive(row), body.playerId, now, state.taxMult);
  if (!settled.ok) return err(409, settled.error);
  const sale = settled.value.sale;

  const stmts = [
    env.DB.prepare(
      `UPDATE market_listings SET state = 'sold', closed_at = ?2 WHERE listing_id = ?1 AND state = 'active' AND ends_at > ?2 AND buy_now IS NOT NULL`,
    ).bind(row.listing_id, now),
    env.DB.prepare(
      `INSERT INTO market_trades (listing_id, global_item_id, family_key, seller_id, buyer_id, price, tax, authority, at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
       WHERE EXISTS (SELECT 1 FROM market_listings WHERE listing_id = ?1 AND state = 'sold' AND closed_at = ?9)
       ON CONFLICT(listing_id) DO NOTHING`,
    ).bind(row.listing_id, row.global_item_id, row.family_key, row.seller_id, body.playerId, sale.price, sale.tax, row.authority, now),
    ensureWalletStmt(env, body.playerId, now),
    env.DB.prepare(
      `UPDATE market_wallets SET balance = balance - ?2, updated_at = ?3
       WHERE player_id = ?1 AND EXISTS (SELECT 1 FROM market_trades WHERE listing_id = ?4 AND buyer_id = ?1)`,
    ).bind(body.playerId, sale.price, now, row.listing_id),
    env.DB.prepare(
      `INSERT INTO market_wallet_ledger (op_id, player_id, kind, amount, at)
       SELECT ?1, ?2, 'buyNow', ?3, ?4 WHERE EXISTS (SELECT 1 FROM market_trades WHERE listing_id = ?5 AND buyer_id = ?2)`,
    ).bind(`sale:${row.listing_id}:buyer`, body.playerId, -sale.price, now, row.listing_id),
  ];
  if (row.bid !== null && row.bidder_id !== null) {
    stmts.push(env.DB.prepare(
      `UPDATE market_wallets SET balance = balance + ?2, escrow = escrow - ?2, updated_at = ?3
       WHERE player_id = ?1 AND EXISTS (SELECT 1 FROM market_trades WHERE listing_id = ?4 AND buyer_id = ?5)`,
    ).bind(row.bidder_id, row.bid, now, row.listing_id, body.playerId));
  }
  if (row.authority === 1) {
    stmts.push(env.DB.prepare(
      `INSERT INTO market_wallet_ledger (op_id, player_id, kind, amount, at)
       SELECT ?1, '@burn', 'authoritySale', ?2, ?3 WHERE EXISTS (SELECT 1 FROM market_trades WHERE listing_id = ?4 AND buyer_id = ?5)`,
    ).bind(`sale:${row.listing_id}:burn`, sale.price, now, row.listing_id, body.playerId));
  } else {
    stmts.push(ensureWalletStmt(env, row.seller_id, now));
    stmts.push(env.DB.prepare(
      `UPDATE market_wallets SET balance = balance + ?2, updated_at = ?3
       WHERE player_id = ?1 AND EXISTS (SELECT 1 FROM market_trades WHERE listing_id = ?4 AND buyer_id = ?5)`,
    ).bind(row.seller_id, sale.proceeds, now, row.listing_id, body.playerId));
    stmts.push(env.DB.prepare(
      `INSERT INTO market_wallet_ledger (op_id, player_id, kind, amount, at)
       SELECT ?1, ?2, 'saleProceeds', ?3, ?4 WHERE EXISTS (SELECT 1 FROM market_trades WHERE listing_id = ?5 AND buyer_id = ?6)`,
    ).bind(`sale:${row.listing_id}:seller`, row.seller_id, sale.proceeds, now, row.listing_id, body.playerId));
    stmts.push(env.DB.prepare(
      `INSERT INTO market_wallet_ledger (op_id, player_id, kind, amount, at)
       SELECT ?1, '@burn', 'saleTax', ?2, ?3 WHERE EXISTS (SELECT 1 FROM market_trades WHERE listing_id = ?4 AND buyer_id = ?5)`,
    ).bind(`sale:${row.listing_id}:tax`, sale.tax, now, row.listing_id, body.playerId));
  }
  stmts.push(env.DB.prepare(
    `UPDATE market_items SET owner_id = ?2, state = 'delivered', transfers = transfers + 1
     WHERE global_item_id = ?1 AND EXISTS (SELECT 1 FROM market_trades WHERE listing_id = ?3 AND buyer_id = ?2)`,
  ).bind(row.global_item_id, body.playerId, row.listing_id));

  const batch = await runMoneyBatch(env, stmts);
  if (!batch.ok) return err(402, 'insufficient-funds');
  if (batch.results[0].meta.changes === 0) return err(409, 'unavailable'); // someone got there first
  // Owner-history append + price-history fold happen after the anchor (idempotent-safe).
  await env.DB.prepare(
    `UPDATE market_items SET history = json_insert(history, '$[#]', ?2) WHERE global_item_id = ?1`,
  ).bind(row.global_item_id, row.seller_id).run();
  await foldFamilyDay(env, row.family_key, now);
  const item = await env.DB.prepare(
    'SELECT global_item_id, ref_key, category, family_key, rarity, season, payload FROM market_items WHERE global_item_id = ?1',
  ).bind(row.global_item_id).first();
  return json({ ok: true, price: sale.price, item });
};

// POST /api/auction/bid — place a bid (docs/AUCTION-HOUSE.md §listings). The engine
// validates (floor, ladder, self-bid, anti-snipe); the batch is race-safe by ordering:
// the OPTIMISTIC listing update runs first (guarded on the standing bid we read), and every
// money statement is conditioned on that update having won — a lost race charges nothing.
// An overdraft trips the wallet CHECK and rolls the whole batch back, bid included.

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { isPlayerId } from '../../lib/validate';
import {
  authMarket, ensureWalletStmt, listingById, maintainMarket, rowToLive, runMoneyBatch, toPublicListing,
} from '../../lib/auctionHost';
import { placeBid } from '../../../src/core/auction';

interface Body { playerId?: string; token?: string; session?: string; listingId?: string; amount?: number }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'auction-bid', ip, { limit: 60, windowSec: 3_600 }))) return err(429, 'rate-limited');

  const body = await readJson<Body>(request, 2_048);
  if (!body || !isPlayerId(body.playerId) || typeof body.listingId !== 'string' || body.listingId.length > 64) return err(400, 'bad-request');
  const now = Date.now();
  const auth = await authMarket(env, body.playerId, body.token ?? null, body.session ?? null, now);
  if (!auth.ok) return err(auth.status, auth.code);

  await maintainMarket(env, now);
  const row = await listingById(env, body.listingId);
  if (!row) return err(404, 'no-listing');
  const bid = placeBid(rowToLive(row), body.playerId, body.amount ?? 0, now);
  if (!bid.ok) return err(409, bid.error);
  const next = bid.value;

  const stmts = [
    env.DB.prepare(
      `UPDATE market_listings SET bid = ?2, bidder_id = ?3, ends_at = ?4
       WHERE listing_id = ?1 AND state = 'active' AND COALESCE(bid, -1) = COALESCE(?5, -1)`,
    ).bind(row.listing_id, next.bid, body.playerId, next.endsAt, row.bid),
    ensureWalletStmt(env, body.playerId, now),
    env.DB.prepare(
      `UPDATE market_wallets SET balance = balance - ?2, escrow = escrow + ?2, updated_at = ?3
       WHERE player_id = ?1 AND EXISTS (SELECT 1 FROM market_listings WHERE listing_id = ?4 AND bidder_id = ?1 AND bid = ?2)`,
    ).bind(body.playerId, next.bid, now, row.listing_id),
    env.DB.prepare(
      `INSERT INTO market_bids (listing_id, bidder_id, amount, at)
       SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM market_listings WHERE listing_id = ?1 AND bidder_id = ?2 AND bid = ?3)`,
    ).bind(row.listing_id, body.playerId, next.bid, now),
  ];
  if (row.bid !== null && row.bidder_id !== null) {
    stmts.push(env.DB.prepare(
      `UPDATE market_wallets SET balance = balance + ?2, escrow = escrow - ?2, updated_at = ?3
       WHERE player_id = ?1 AND EXISTS (SELECT 1 FROM market_listings WHERE listing_id = ?4 AND bidder_id = ?5 AND bid = ?6)`,
    ).bind(row.bidder_id, row.bid, now, row.listing_id, body.playerId, next.bid));
  }
  const batch = await runMoneyBatch(env, stmts);
  if (!batch.ok) return err(402, 'insufficient-funds');
  if (batch.results[0].meta.changes === 0) return err(409, 'outbid-race'); // stale read — nothing charged
  const fresh = await listingById(env, row.listing_id);
  return json({ ok: true, listing: fresh ? toPublicListing(fresh) : null });
};

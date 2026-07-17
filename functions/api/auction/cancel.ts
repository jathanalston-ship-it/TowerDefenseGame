// POST /api/auction/cancel — withdraw a bid-free listing (docs/AUCTION-HOUSE.md §listings).
// Seller-only, bids block it (the engine's rules), the burned fee stays burned, and the
// escrowed item returns to the seller's custody for the client to re-materialize.

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { isPlayerId } from '../../lib/validate';
import { authMarket, listingById, maintainMarket, rowToLive } from '../../lib/auctionHost';
import { cancelListing } from '../../../src/core/auction';

interface Body { playerId?: string; token?: string; session?: string; listingId?: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'auction-cancel', ip, { limit: 30, windowSec: 3_600 }))) return err(429, 'rate-limited');

  const body = await readJson<Body>(request, 2_048);
  if (!body || !isPlayerId(body.playerId) || typeof body.listingId !== 'string' || body.listingId.length > 64) return err(400, 'bad-request');
  const now = Date.now();
  const auth = await authMarket(env, body.playerId, body.token ?? null, body.session ?? null, now);
  if (!auth.ok) return err(auth.status, auth.code);

  await maintainMarket(env, now);
  const row = await listingById(env, body.listingId);
  if (!row) return err(404, 'no-listing');
  const cancelled = cancelListing(rowToLive(row), body.playerId);
  if (!cancelled.ok) return err(409, cancelled.error);

  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE market_listings SET state = 'cancelled', closed_at = ?2
       WHERE listing_id = ?1 AND state = 'active' AND seller_id = ?3 AND bid IS NULL`,
    ).bind(row.listing_id, now, body.playerId),
    env.DB.prepare(
      `UPDATE market_items SET state = 'returned'
       WHERE global_item_id = ?1 AND EXISTS (SELECT 1 FROM market_listings WHERE listing_id = ?2 AND state = 'cancelled')`,
    ).bind(row.global_item_id, row.listing_id),
  ]);
  if (results[0].meta.changes === 0) return err(409, 'not-cancellable'); // raced a bid or a settle
  return json({ ok: true, listingId: row.listing_id, itemReturned: true });
};

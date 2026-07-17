// POST /api/auction/collect — acknowledge item deliveries/returns. The client materializes
// the payloads it received from /mine (won purchases, returned cancellations/expiries) and
// acks here so they stop appearing as pending. Owner-scoped, idempotent.

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { isPlayerId } from '../../lib/validate';
import { authMarket } from '../../lib/auctionHost';

interface Body { playerId?: string; token?: string; session?: string; itemIds?: string[] }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'auction-collect', ip, { limit: 60, windowSec: 3_600 }))) return err(429, 'rate-limited');

  const body = await readJson<Body>(request, 8_192);
  if (!body || !isPlayerId(body.playerId) || !Array.isArray(body.itemIds)) return err(400, 'bad-request');
  const ids = body.itemIds.filter((x): x is string => typeof x === 'string' && x.length <= 120).slice(0, 50);
  if (ids.length === 0) return err(400, 'no-items');
  const now = Date.now();
  const auth = await authMarket(env, body.playerId, body.token ?? null, body.session ?? null, now);
  if (!auth.ok) return err(auth.status, auth.code);

  const results = await env.DB.batch(ids.map((id) =>
    env.DB.prepare(
      `UPDATE market_items SET state = 'collected'
       WHERE global_item_id = ?1 AND owner_id = ?2 AND state IN ('delivered', 'returned')`,
    ).bind(id, body.playerId),
  ));
  const collected = results.reduce((a, r) => a + r.meta.changes, 0);
  return json({ ok: true, collected });
};

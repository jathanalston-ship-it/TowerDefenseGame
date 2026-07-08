// GET /api/store/history?playerId=… — the player's purchase receipts (support +
// restore surface). Read-only, player-scoped by unguessable UUID; contains no
// payment details beyond offer/amount/status.

import type { Env } from '../../lib/env';
import { clientIp, err, json } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { isPlayerId } from '../../lib/validate';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'history', ip, { limit: 30, windowSec: 600 }))) return err(429, 'rate-limited');
  const playerId = new URL(request.url).searchParams.get('playerId');
  if (!isPlayerId(playerId)) return err(400, 'bad-request');
  const rows = await env.DB.prepare(
    `SELECT session_id, offer_id, amount_total, currency, status, created_at
     FROM purchases WHERE player_id = ?1 ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(playerId)
    .all<{ session_id: string; offer_id: string; amount_total: number; currency: string; status: string; created_at: number }>();
  return json({
    purchases: (rows.results ?? []).map((r) => ({
      receiptId: r.session_id,
      offerId: r.offer_id,
      amountCents: r.amount_total,
      currency: r.currency,
      status: r.status,
      at: r.created_at,
    })),
  });
};

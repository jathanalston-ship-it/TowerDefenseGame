// GET /api/store/history?playerId=…&token=… — the player's purchase receipts
// (support + restore surface). Auth matches /api/save: the sync token proves
// ownership once a cloud slot exists (identifier ≠ secret); players who never
// created one are still covered by the unguessable-UUID scope. Contains no
// payment details beyond offer/amount/status.

import type { Env } from '../../lib/env';
import { clientIp, err, json } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { sha256Hex, timingSafeEqualStr } from '../../lib/crypto';
import { isPlayerId, isSyncToken } from '../../lib/validate';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'history', ip, { limit: 30, windowSec: 600 }))) return err(429, 'rate-limited');
  const url = new URL(request.url);
  const playerId = url.searchParams.get('playerId');
  const token = url.searchParams.get('token');
  if (!isPlayerId(playerId) || !isSyncToken(token)) return err(400, 'bad-request');
  // If this player has a cloud slot, its token is the ownership proof here too.
  const slot = await env.DB.prepare('SELECT token_hash FROM cloud_saves WHERE player_id = ?1')
    .bind(playerId)
    .first<{ token_hash: string }>();
  if (slot && !timingSafeEqualStr(slot.token_hash, await sha256Hex(token))) return err(403, 'wrong-token');
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

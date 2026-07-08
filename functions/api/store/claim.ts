// POST /api/store/claim — the fulfillment gate. The client calls this after the
// Checkout redirect returns (and again on boot for any pending purchase — power
// loss, refresh, closed tab). Truth order:
//   1. purchases row (webhook already verified it), else
//   2. live Stripe retrieve (claim can land before the webhook) — recorded iff
//      paid + metadata-sound + catalog amount.
// Then EXACTLY ONE fulfillment per session (fulfillments PK): the first claim
// grants; every replay — double click, second tab, retried request — returns
// alreadyGranted and the client applies nothing again.

import type { Env } from '../../lib/env';
import { stripeKeyProblem } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { isPlayerId, isSessionId } from '../../lib/validate';
import { retrieveSession } from '../../lib/stripeApi';
import { bumpCounter, getPurchase, paidSessionProblem, recordPaidSession, tryFulfill } from '../../lib/purchases';

interface Body {
  sessionId?: string;
  playerId?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'claim', ip, { limit: 30, windowSec: 600 }))) return err(429, 'rate-limited');

  const body = await readJson<Body>(request, 4_096);
  if (!body || !isPlayerId(body.playerId) || !isSessionId(body.sessionId)) return err(400, 'bad-request');

  let purchase = await getPurchase(env.DB, body.sessionId);
  if (!purchase) {
    // Webhook hasn't landed yet — verify directly against Stripe.
    const keyProblem = stripeKeyProblem(env);
    if (keyProblem) return err(503, 'store-unavailable', keyProblem);
    const res = await retrieveSession(env.STRIPE_SECRET_KEY!, body.sessionId);
    if (!res.ok) return res.status === 404 ? err(404, 'unknown-session') : err(502, 'stripe-error');
    const session = res.data;
    if (session.status === 'expired') return json({ status: 'expired' });
    const problem = paidSessionProblem(session);
    if (problem === 'not-paid') return json({ status: 'pending' }); // open session / payment still processing
    if (problem !== null) return err(409, 'session-invalid', problem);
    await recordPaidSession(env.DB, session, null);
    purchase = await getPurchase(env.DB, body.sessionId);
    if (!purchase) return err(500, 'record-failed');
  }

  // The paying player is the only one who may claim (metadata bound at creation).
  if (purchase.player_id !== body.playerId) return err(403, 'player-mismatch');
  if (purchase.status === 'refunded') return json({ status: 'refunded' });

  const grantedNow = await tryFulfill(env.DB, purchase.session_id, purchase.player_id, purchase.offer_id);
  if (grantedNow) await bumpCounter(env.DB, 'purchase_fulfilled');
  return json({
    status: 'paid',
    offerId: purchase.offer_id,
    receiptId: purchase.session_id,
    alreadyGranted: !grantedNow,
  });
};

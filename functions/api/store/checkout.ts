// POST /api/store/checkout — create a Stripe Checkout Session for one offer.
// The client sends WHICH offer; the server decides the price (src/core/premium.ts
// is the single catalog both sides read). Flow: docs/DEPLOYMENT.md §Purchases.

import type { Env } from '../../lib/env';
import { stripeKeyProblem } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { verifyTurnstile } from '../../lib/turnstile';
import { isPlayerId } from '../../lib/validate';
import { createCheckoutSession } from '../../lib/stripeApi';
import { offerCapReached, offerPriceCents } from '../../lib/purchases';
import { offerReachesChance, premiumOfferById } from '../../../src/core/premium';
import { paidRandomContainersAllowed } from '../../lib/lootbox';

interface Body {
  offerId?: string;
  playerId?: string;
  turnstileToken?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const keyProblem = stripeKeyProblem(env);
  if (keyProblem) return err(503, 'store-unavailable', keyProblem);

  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'checkout', ip, { limit: 10, windowSec: 600 }))) {
    return err(429, 'rate-limited');
  }

  const body = await readJson<Body>(request, 4_096);
  if (!body || !isPlayerId(body.playerId)) return err(400, 'bad-request');
  const offer = premiumOfferById(body.offerId ?? '');
  if (!offer) return err(400, 'unknown-offer');
  const cents = offerPriceCents(offer.id);
  if (cents === null || cents < 50) return err(400, 'unknown-offer'); // Stripe minimum charge

  // Jurisdiction gate (lib/lootbox.ts): in a restricted region real money never reaches a random
  // outcome — a container in the pack OR a currency that can be spent on one (offerReachesChance).
  if (offerReachesChance(offer) && !paidRandomContainersAllowed(request, env)) {
    return err(451, 'region-restricted', 'This offer can be used on randomized rewards and is not available in your region.');
  }

  // Bot gate on the money endpoint (skipped only when no secret is configured — dev).
  const turnstile = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, body.turnstileToken, ip);
  if (!turnstile.ok) return err(403, 'turnstile-failed');

  // Server-side duplicate-purchase prevention for capped offers (limit-1 packs,
  // once-per-day rotating packs) — the client's own ledger is only UX.
  if (await offerCapReached(env.DB, body.playerId, offer.id)) return err(409, 'offer-cap-reached');

  const origin = new URL(request.url).origin;
  const session = await createCheckoutSession(env.STRIPE_SECRET_KEY!, {
    offerId: offer.id,
    offerName: offer.name,
    unitAmountCents: cents,
    playerId: body.playerId,
    origin,
    // One idempotency key per (player, offer, 10-min window): a double-submitted
    // create returns the SAME session instead of minting a parallel one.
    idempotencyKey: `co:${body.playerId}:${offer.id}:${Math.floor(Date.now() / 600_000)}`,
  });
  if (!session.ok) return err(502, 'stripe-error');
  if (!session.data.url) return err(502, 'stripe-error', 'session has no redirect url');
  return json({ sessionId: session.data.id, url: session.data.url });
};

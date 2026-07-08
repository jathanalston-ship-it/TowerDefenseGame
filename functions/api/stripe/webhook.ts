// POST /api/stripe/webhook — Stripe server-to-server events. The security chain:
//   1. signature verification (HMAC over the RAW body, timestamp tolerance);
//   2. event-id dedupe (webhook_events PK — replays and Stripe's at-least-once
//      delivery both collapse to one processing);
//   3. session sanity (paid + known offer + catalog amount) before recording;
//   4. refunds mark the purchase — the claim path stops granting immediately.
// Always answers fast; heavy work here is a Stripe retry storm waiting to happen.

import type { Env } from '../../lib/env';
import { err, json } from '../../lib/http';
import { parseEvent, verifyStripeSignature } from '../../lib/stripeWebhook';
import { bumpCounter, paidSessionProblem, recordPaidSession } from '../../lib/purchases';
import type { StripeSession } from '../../lib/stripeApi';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.STRIPE_WEBHOOK_SECRET) return err(503, 'webhook-unconfigured');
  const rawBody = await request.text();
  if (rawBody.length > 65_536) return err(413, 'too-large');

  const verdict = await verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!verdict.ok) return err(400, 'bad-signature', verdict.why);

  const event = parseEvent(rawBody);
  if (!event) return err(400, 'bad-event');

  // Replay / duplicate-delivery protection: first processing wins, the rest 200 out.
  const dedupe = await env.DB.prepare(
    `INSERT INTO webhook_events (event_id, type, received_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(event_id) DO NOTHING`,
  )
    .bind(event.id, event.type, Math.floor(Date.now() / 1000))
    .run();
  if ((dedupe.meta?.changes ?? 0) === 0) return json({ received: true, duplicate: true });

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as unknown as StripeSession;
      // Only PAID sessions with a catalog-true amount become purchases. An unpaid
      // 'completed' (delayed payment methods) simply isn't recorded yet — the
      // async_payment_succeeded event will land later and record it.
      if (paidSessionProblem(session) === null) {
        await recordPaidSession(env.DB, session, event.id);
        await bumpCounter(env.DB, 'purchase_paid');
        await bumpCounter(env.DB, `purchase_paid:${session.metadata?.offer_id ?? 'unknown'}`);
      }
      break;
    }
    case 'charge.refunded':
    case 'charge.refund.updated': {
      const charge = event.data.object as { payment_intent?: unknown };
      if (typeof charge.payment_intent === 'string') {
        await env.DB.prepare(
          `UPDATE purchases SET status = 'refunded', refunded_at = ?2 WHERE payment_intent = ?1 AND status != 'refunded'`,
        )
          .bind(charge.payment_intent, Math.floor(Date.now() / 1000))
          .run();
        await bumpCounter(env.DB, 'purchase_refunded');
      }
      break;
    }
    default:
      break; // subscribed-but-unhandled event kinds are acknowledged and ignored
  }
  return json({ received: true });
};

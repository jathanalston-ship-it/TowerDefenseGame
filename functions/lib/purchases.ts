// Purchase persistence shared by the webhook and the claim endpoint. The
// invariants both must honor:
//   • a purchases row exists only for a session Stripe says was PAID;
//   • recording is idempotent (INSERT OR IGNORE on the session id);
//   • fulfillment is once-per-session, enforced by the fulfillments PK;
//   • a refund marks the row 'refunded' — future claims stop granting.

import type { StripeSession } from './stripeApi';
import { premiumOfferById } from '../../src/core/premium';

export function offerPriceCents(offerId: string): number | null {
  const offer = premiumOfferById(offerId);
  return offer ? Math.round(offer.priceUsd * 100) : null;
}

/** Session sanity shared by both write paths: paid, known offer, and the charge
 *  matches the SERVER catalog price (a tampered/rebuilt session never fulfills). */
export function paidSessionProblem(s: StripeSession): string | null {
  if (s.payment_status !== 'paid') return 'not-paid';
  const offerId = s.metadata?.offer_id ?? '';
  const playerId = s.metadata?.player_id ?? '';
  if (!offerId || !playerId) return 'missing-metadata';
  const cents = offerPriceCents(offerId);
  if (cents === null) return 'unknown-offer';
  if (typeof s.amount_total !== 'number' || s.amount_total !== cents) return 'amount-mismatch';
  if ((s.currency ?? 'usd').toLowerCase() !== 'usd') return 'currency-mismatch';
  return null;
}

/** Record a verified-paid session (idempotent). Returns the stored offer/player. */
export async function recordPaidSession(db: D1Database, s: StripeSession, eventId: string | null): Promise<void> {
  await db
    .prepare(
      `INSERT INTO purchases (session_id, event_id, player_id, offer_id, amount_total, currency, payment_intent, status, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'paid', ?8)
       ON CONFLICT(session_id) DO NOTHING`,
    )
    .bind(
      s.id,
      eventId,
      s.metadata?.player_id ?? '',
      s.metadata?.offer_id ?? '',
      s.amount_total ?? 0,
      (s.currency ?? 'usd').toLowerCase(),
      typeof s.payment_intent === 'string' ? s.payment_intent : null,
      Math.floor(Date.now() / 1000),
    )
    .run();
}

export interface PurchaseRow {
  session_id: string;
  player_id: string;
  offer_id: string;
  status: string;
}

export function getPurchase(db: D1Database, sessionId: string): Promise<PurchaseRow | null> {
  return db
    .prepare('SELECT session_id, player_id, offer_id, status FROM purchases WHERE session_id = ?1')
    .bind(sessionId)
    .first<PurchaseRow>();
}

/** One fulfillment per session, ever: true = THIS call won the grant. */
export async function tryFulfill(db: D1Database, sessionId: string, playerId: string, offerId: string): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT INTO fulfillments (session_id, player_id, offer_id, granted_at)
       VALUES (?1, ?2, ?3, ?4) ON CONFLICT(session_id) DO NOTHING`,
    )
    .bind(sessionId, playerId, offerId, Math.floor(Date.now() / 1000))
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Server-side duplicate-purchase guard for capped offers, from the fulfillment
 *  ledger (the client's own ledger is only UX). limit-1 packs: any prior grant
 *  refuses a new checkout; once-per-day packs: any grant today (UTC) refuses. */
export async function offerCapReached(db: D1Database, playerId: string, offerId: string): Promise<boolean> {
  const offer = premiumOfferById(offerId);
  if (!offer) return true;
  if (offer.limit !== undefined) {
    const row = await db
      .prepare('SELECT COUNT(*) AS n FROM fulfillments WHERE player_id = ?1 AND offer_id = ?2')
      .bind(playerId, offerId)
      .first<{ n: number }>();
    if ((row?.n ?? 0) >= offer.limit) return true;
  }
  if (offer.oncePerDay) {
    const dayStart = Math.floor(Date.now() / 86_400_000) * 86_400;
    const row = await db
      .prepare('SELECT COUNT(*) AS n FROM fulfillments WHERE player_id = ?1 AND offer_id = ?2 AND granted_at >= ?3')
      .bind(playerId, offerId, dayStart)
      .first<{ n: number }>();
    if ((row?.n ?? 0) > 0) return true;
  }
  return false;
}

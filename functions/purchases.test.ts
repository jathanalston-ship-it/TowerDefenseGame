// Purchase-flow failure-mode suite (docs/DEPLOYMENT.md §testing). Exercises the
// REAL endpoint handlers over the in-memory D1 fake and a stubbed Stripe API —
// every scenario from the production checklist: cancelled/failed payments,
// duplicate + forged + replayed webhooks, refunds, claim-before-webhook (network
// interruption), double click / second tab / refresh / power loss (claim
// idempotency), amount tampering, player mismatch, offer caps, rate limits, and
// input validation. The one invariant everything reduces to: NOTHING ever
// grants twice, and nothing grants without Stripe saying PAID.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as checkout } from './api/store/checkout';
import { onRequestPost as webhook } from './api/stripe/webhook';
import { onRequestPost as claim } from './api/store/claim';
import { onRequestGet as history } from './api/store/history';
import { hmacSha256Hex } from './lib/crypto';
import { FakeD1, ctx, makeEnv, postJson } from './lib/testkit';
import type { Env } from './lib/env';
import { ICHOR_BUNDLES, PERMANENT_PACKS } from '../src/core/premium';

const PLAYER = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-8888-4777-8666-555555555555';
const OFFER = ICHOR_BUNDLES[1]; // $4.99 → 499¢
const CENTS = Math.round(OFFER.priceUsd * 100);
const WH_SECRET = 'whsec_testsecret_0123456789abcdef';

function env(overrides: Partial<Env> = {}): Env {
  return makeEnv({ STRIPE_SECRET_KEY: 'sk_test_abc', STRIPE_WEBHOOK_SECRET: WH_SECRET, ...overrides });
}

function paidSession(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cs_test_paid_001',
    object: 'checkout.session',
    status: 'complete',
    payment_status: 'paid',
    amount_total: CENTS,
    currency: 'usd',
    payment_intent: 'pi_001',
    metadata: { player_id: PLAYER, offer_id: OFFER.id },
    ...over,
  };
}

async function signedWebhook(e: Env, event: Record<string, unknown>): Promise<Response> {
  const body = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = await hmacSha256Hex(WH_SECRET, `${ts}.${body}`);
  const req = new Request('https://game.test/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${ts},v1=${sig}` },
    body,
  });
  return webhook(ctx(req, e));
}

function stubStripe(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = handler(String(input), init);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }));
}

afterEach(() => vi.unstubAllGlobals());

// ── Checkout creation ─────────────────────────────────────────────────────────

describe('POST /api/store/checkout', () => {
  it('creates a session with the SERVER catalog price (client sends no amount)', async () => {
    let sentForm = '';
    stubStripe((url, init) => {
      expect(url).toContain('/v1/checkout/sessions');
      sentForm = String(init?.body ?? '');
      return { status: 200, body: { id: 'cs_new_1', url: 'https://checkout.stripe.com/c/pay/x' } };
    });
    const e = env();
    const res = await checkout(ctx(postJson('https://game.test/api/store/checkout', { offerId: OFFER.id, playerId: PLAYER }), e));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessionId: string; url: string };
    expect(body.sessionId).toBe('cs_new_1');
    const form = new URLSearchParams(sentForm);
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe(String(CENTS)); // catalog truth
    expect(form.get('metadata[player_id]')).toBe(PLAYER);
    expect(form.get('metadata[offer_id]')).toBe(OFFER.id);
    expect(form.get('mode')).toBe('payment');
  });

  it('rejects unknown offers, bad player ids, and cross-origin browsers', async () => {
    const e = env();
    expect((await checkout(ctx(postJson('https://game.test/api/x', { offerId: 'nope', playerId: PLAYER }), e))).status).toBe(400);
    expect((await checkout(ctx(postJson('https://game.test/api/x', { offerId: OFFER.id, playerId: 'evil' }), e))).status).toBe(400);
    const cross = postJson('https://game.test/api/x', { offerId: OFFER.id, playerId: PLAYER }, { origin: 'https://evil.example' });
    expect((await checkout(ctx(cross, e))).status).toBe(403);
  });

  it('refuses a second checkout for an already-owned limit-1 pack (server-side dup prevention)', async () => {
    const e = env();
    const db = e.DB as unknown as FakeD1;
    const pack = PERMANENT_PACKS[0];
    db.fulfillments.set('cs_prior', { session_id: 'cs_prior', player_id: PLAYER, offer_id: pack.id, granted_at: 1 });
    const res = await checkout(ctx(postJson('https://game.test/api/x', { offerId: pack.id, playerId: PLAYER }), e));
    expect(res.status).toBe(409);
  });

  it('rate-limits repeated attempts from one address', async () => {
    stubStripe(() => ({ status: 200, body: { id: 'cs_n', url: 'https://checkout.stripe.com/x' } }));
    const e = env();
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await checkout(ctx(postJson('https://game.test/api/x', { offerId: OFFER.id, playerId: PLAYER }), e))).status;
    }
    expect(last).toBe(429);
  });

  it('refuses to run production on a test-mode key', async () => {
    const e = env({ ENVIRONMENT: 'production' }); // sk_test_… + production
    const res = await checkout(ctx(postJson('https://game.test/api/x', { offerId: OFFER.id, playerId: PLAYER }), e));
    expect(res.status).toBe(503);
  });
});

// ── Webhook ───────────────────────────────────────────────────────────────────

describe('POST /api/stripe/webhook', () => {
  it('verifies a known-good static signature vector (independent of our signer)', async () => {
    // Vector computed with python hmac/hashlib — proves signer and verifier agree
    // with the SPEC, not merely with each other.
    const body = '{"id":"evt_static","type":"checkout.session.completed","data":{"object":{}}}';
    const req = new Request('https://game.test/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1750000000,v1=cb9f1016eac8ed46a3561e98609a57e320b90a8c6fee2e42cea2e4a5fe401467' },
      body,
    });
    // Freeze time inside the tolerance window of the vector's timestamp.
    vi.useFakeTimers();
    vi.setSystemTime(1_750_000_010_000);
    const res = await webhook(ctx(req, env()));
    vi.useRealTimers();
    expect(res.status).toBe(200);
  });

  it('rejects forged signatures, stale timestamps, and missing headers', async () => {
    const e = env();
    const body = JSON.stringify({ id: 'evt_x', type: 'noop', data: { object: {} } });
    const ts = Math.floor(Date.now() / 1000);
    const good = await hmacSha256Hex(WH_SECRET, `${ts}.${body}`);
    const mk = (sig: string | null): Request =>
      new Request('https://game.test/api/stripe/webhook', { method: 'POST', headers: sig ? { 'stripe-signature': sig } : {}, body });
    expect((await webhook(ctx(mk(`t=${ts},v1=${'0'.repeat(64)}`), e))).status).toBe(400); // forged
    expect((await webhook(ctx(mk(`t=${ts - 9_999},v1=${good}`), e))).status).toBe(400); // replayed old
    expect((await webhook(ctx(mk(null), e))).status).toBe(400); // missing
  });

  it('a duplicate delivery of the SAME event processes once', async () => {
    const e = env();
    const db = e.DB as unknown as FakeD1;
    const event = { id: 'evt_dup', type: 'checkout.session.completed', data: { object: paidSession() } };
    expect((await signedWebhook(e, event)).status).toBe(200);
    const second = await signedWebhook(e, event);
    expect(((await second.json()) as { duplicate?: boolean }).duplicate).toBe(true);
    expect(db.purchases.size).toBe(1);
  });

  it('two DIFFERENT events for the same session still record ONE purchase', async () => {
    const e = env();
    const db = e.DB as unknown as FakeD1;
    await signedWebhook(e, { id: 'evt_a', type: 'checkout.session.completed', data: { object: paidSession() } });
    await signedWebhook(e, { id: 'evt_b', type: 'checkout.session.async_payment_succeeded', data: { object: paidSession() } });
    expect(db.purchases.size).toBe(1);
  });

  it('ignores unpaid sessions and records nothing for a tampered amount', async () => {
    const e = env();
    const db = e.DB as unknown as FakeD1;
    await signedWebhook(e, { id: 'evt_u', type: 'checkout.session.completed', data: { object: paidSession({ payment_status: 'unpaid', id: 'cs_u' }) } });
    await signedWebhook(e, { id: 'evt_t', type: 'checkout.session.completed', data: { object: paidSession({ amount_total: 1, id: 'cs_t' }) } });
    expect(db.purchases.size).toBe(0);
  });

  it('charge.refunded marks the purchase refunded (claims stop granting)', async () => {
    const e = env();
    const db = e.DB as unknown as FakeD1;
    await signedWebhook(e, { id: 'evt_p', type: 'checkout.session.completed', data: { object: paidSession() } });
    await signedWebhook(e, { id: 'evt_r', type: 'charge.refunded', data: { object: { payment_intent: 'pi_001' } } });
    expect(db.purchases.get('cs_test_paid_001')?.status).toBe('refunded');
    const res = await claim(ctx(postJson('https://game.test/api/store/claim', { sessionId: 'cs_test_paid_001', playerId: PLAYER }), e));
    expect(((await res.json()) as { status: string }).status).toBe('refunded');
    expect(db.fulfillments.size).toBe(0);
  });
});

// ── Claim / fulfillment ───────────────────────────────────────────────────────

describe('POST /api/store/claim', () => {
  it('claims exactly once — double click, second tab, refresh, power loss all collapse', async () => {
    const e = env();
    const db = e.DB as unknown as FakeD1;
    await signedWebhook(e, { id: 'evt_1', type: 'checkout.session.completed', data: { object: paidSession() } });
    const call = async (): Promise<Response> =>
      claim(ctx(postJson('https://game.test/api/store/claim', { sessionId: 'cs_test_paid_001', playerId: PLAYER }), e));
    const first = (await (await call()).json()) as { status: string; alreadyGranted: boolean; receiptId: string };
    expect(first.status).toBe('paid');
    expect(first.alreadyGranted).toBe(false);
    for (let i = 0; i < 4; i++) {
      const again = (await (await call()).json()) as { alreadyGranted: boolean };
      expect(again.alreadyGranted).toBe(true); // every replay: nothing grants again
    }
    expect(db.fulfillments.size).toBe(1);
  });

  it('claim BEFORE the webhook (network interruption) verifies live against Stripe', async () => {
    stubStripe((url) => {
      expect(url).toContain('/v1/checkout/sessions/cs_test_paid_001');
      return { status: 200, body: paidSession() };
    });
    const e = env();
    const db = e.DB as unknown as FakeD1;
    const res = await claim(ctx(postJson('https://game.test/api/store/claim', { sessionId: 'cs_test_paid_001', playerId: PLAYER }), e));
    const body = (await res.json()) as { status: string; alreadyGranted: boolean };
    expect(body.status).toBe('paid');
    expect(body.alreadyGranted).toBe(false);
    expect(db.purchases.size).toBe(1); // recorded from the live verify
  });

  it('cancelled / failed / still-processing payments never grant', async () => {
    stubStripe(() => ({ status: 200, body: paidSession({ payment_status: 'unpaid', status: 'open' }) }));
    const e = env();
    const res = await claim(ctx(postJson('https://game.test/api/store/claim', { sessionId: 'cs_test_paid_001', playerId: PLAYER }), e));
    expect(((await res.json()) as { status: string }).status).toBe('pending');
    expect((e.DB as unknown as FakeD1).fulfillments.size).toBe(0);

    stubStripe(() => ({ status: 200, body: paidSession({ payment_status: 'unpaid', status: 'expired' }) }));
    const res2 = await claim(ctx(postJson('https://game.test/api/store/claim', { sessionId: 'cs_test_paid_001', playerId: PLAYER }), e));
    expect(((await res2.json()) as { status: string }).status).toBe('expired');
  });

  it('rejects amount tampering and player mismatch', async () => {
    stubStripe(() => ({ status: 200, body: paidSession({ amount_total: 1 }) }));
    const e = env();
    expect((await claim(ctx(postJson('https://game.test/api/x', { sessionId: 'cs_test_paid_001', playerId: PLAYER }), e))).status).toBe(409);

    const e2 = env();
    await signedWebhook(e2, { id: 'evt_1', type: 'checkout.session.completed', data: { object: paidSession() } });
    const res = await claim(ctx(postJson('https://game.test/api/x', { sessionId: 'cs_test_paid_001', playerId: OTHER }), e2));
    expect(res.status).toBe(403); // someone else's receipt
  });

  it('validates session id shape before any Stripe call', async () => {
    const e = env();
    const res = await claim(ctx(postJson('https://game.test/api/x', { sessionId: 'DROP TABLE purchases;--', playerId: PLAYER }), e));
    expect(res.status).toBe(400);
  });
});

// ── History ───────────────────────────────────────────────────────────────────

describe('GET /api/store/history', () => {
  it('returns the player-scoped receipt trail', async () => {
    const e = env();
    await signedWebhook(e, { id: 'evt_1', type: 'checkout.session.completed', data: { object: paidSession() } });
    const res = await history(ctx(new Request(`https://game.test/api/store/history?playerId=${PLAYER}&token=${'a'.repeat(64)}`), e));
    const body = (await res.json()) as { purchases: { offerId: string; status: string }[] };
    expect(body.purchases).toHaveLength(1);
    expect(body.purchases[0].offerId).toBe(OFFER.id);
    expect(body.purchases[0].status).toBe('paid');
  });
});

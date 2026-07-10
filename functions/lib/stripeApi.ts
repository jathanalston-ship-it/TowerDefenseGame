// Minimal Stripe REST client — exactly the two calls this backend makes, over
// plain fetch with form encoding. Deliberately not the stripe-node SDK: the
// surface is two endpoints, the hand-rolled client keeps the Worker bundle tiny
// (fast cold starts) and fully testable with an injected fetch. If the surface
// ever grows past a handful of calls, graduate to the official SDK
// (Stripe.createFetchHttpClient + SubtleCryptoProvider work on Workers).

export interface StripeSession {
  id: string;
  object: string;
  url?: string | null;
  status?: string | null; // 'open' | 'complete' | 'expired'
  payment_status?: string | null; // 'paid' | 'unpaid' | 'no_payment_required'
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string>;
}

export interface StripeError {
  error: { type?: string; code?: string; message?: string };
}

type FetchLike = typeof fetch;

const API = 'https://api.stripe.com/v1';

async function stripeCall<T>(
  secretKey: string,
  method: 'GET' | 'POST',
  path: string,
  form: Record<string, string> | null,
  fetchImpl: FetchLike,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${secretKey}`,
      ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      // Pin the API version this integration is written against.
      'stripe-version': '2024-06-20',
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const body = (await res.json().catch(() => null)) as T | StripeError | null;
  if (!res.ok || body === null) {
    const msg = body && typeof body === 'object' && 'error' in body ? ((body as StripeError).error.message ?? 'stripe error') : 'stripe error';
    return { ok: false, status: res.status, error: msg };
  }
  return { ok: true, data: body as T };
}

/** Create a Checkout Session for one offer. Amounts come from the SERVER-side
 *  catalog (src/core/premium.ts) — the client never sends a price. */
export function createCheckoutSession(
  secretKey: string,
  args: {
    offerId: string;
    offerName: string;
    unitAmountCents: number;
    playerId: string;
    origin: string;
    idempotencyKey: string;
  },
  fetchImpl: FetchLike = fetch,
): ReturnType<typeof stripeCall<StripeSession>> {
  return stripeCall<StripeSession>(
    secretKey,
    'POST',
    '/checkout/sessions',
    {
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(args.unitAmountCents),
      'line_items[0][price_data][product_data][name]': `ASSIMILATE — ${args.offerName}`,
      success_url: `${args.origin}/play?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${args.origin}/play?checkout=cancel`,
      client_reference_id: args.playerId,
      'metadata[player_id]': args.playerId,
      'metadata[offer_id]': args.offerId,
      // Sessions self-expire; an abandoned checkout needs no cleanup on our side.
      expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
    },
    // Stripe's idempotency layer: a retried create (double click racing the
    // client-side guard) returns the SAME session instead of a duplicate.
    withIdempotency(fetchImpl, args.idempotencyKey),
  );
}

export function retrieveSession(
  secretKey: string,
  sessionId: string,
  fetchImpl: FetchLike = fetch,
): ReturnType<typeof stripeCall<StripeSession>> {
  return stripeCall<StripeSession>(secretKey, 'GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`, null, fetchImpl);
}

function withIdempotency(fetchImpl: FetchLike, key: string): FetchLike {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    fetchImpl(input, { ...init, headers: { ...(init?.headers as Record<string, string>), 'idempotency-key': key } })) as FetchLike;
}

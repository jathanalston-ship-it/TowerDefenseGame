// Stripe webhook signature verification (Stripe-Signature: t=<ts>,v1=<hmac>,…).
// Implements the documented scheme directly over WebCrypto: HMAC-SHA256 of
// `${t}.${rawBody}` with the endpoint's signing secret, constant-time compare
// against every v1 candidate, and a timestamp tolerance window against replays.
// https://docs.stripe.com/webhooks#verify-manually

import { hmacSha256Hex, timingSafeEqualStr } from './crypto';

export const SIGNATURE_TOLERANCE_SEC = 300; // Stripe's recommended 5 minutes

export interface WebhookVerdict {
  ok: boolean;
  why?: 'malformed-header' | 'stale-timestamp' | 'bad-signature';
}

export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  signingSecret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<WebhookVerdict> {
  if (!signatureHeader) return { ok: false, why: 'malformed-header' };
  let ts = NaN;
  const candidates: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const [k, v] = part.split('=', 2).map((s) => s.trim());
    if (k === 't') ts = Number(v);
    else if (k === 'v1' && v) candidates.push(v);
  }
  if (!Number.isFinite(ts) || candidates.length === 0) return { ok: false, why: 'malformed-header' };
  if (Math.abs(nowSec - ts) > SIGNATURE_TOLERANCE_SEC) return { ok: false, why: 'stale-timestamp' };
  const expected = await hmacSha256Hex(signingSecret, `${ts}.${rawBody}`);
  for (const c of candidates) if (timingSafeEqualStr(expected, c)) return { ok: true };
  return { ok: false, why: 'bad-signature' };
}

// ── The narrow event shapes this backend consumes ────────────────────────────
export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export function parseEvent(rawBody: string): StripeEvent | null {
  try {
    const e = JSON.parse(rawBody) as StripeEvent;
    if (typeof e?.id !== 'string' || typeof e?.type !== 'string' || typeof e?.data?.object !== 'object') return null;
    return e;
  } catch {
    return null;
  }
}

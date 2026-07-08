// Input validation primitives — every externally supplied value passes one of
// these before touching a query or a Stripe call. Reject early, reject cheap.

/** Client-minted anonymous player id: strict UUID shape. */
export function isPlayerId(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
}

/** Stripe Checkout Session id (cs_…), bounded. */
export function isSessionId(v: unknown): v is string {
  return typeof v === 'string' && /^cs_[A-Za-z0-9_]{8,200}$/.test(v);
}

/** Player sync token: 64 hex chars (32 random bytes, client-minted). */
export function isSyncToken(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
}

/** UTC day key YYYY-MM-DD. */
export function isDayKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function isIntInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

/** Display name: trimmed, control/markup characters stripped, length-capped.
 *  (Defense in depth — the client renders names as React text nodes, never HTML.) */
export function sanitizeName(v: unknown): string {
  if (typeof v !== 'string') return 'Anonymous';
  const cleaned = v.replace(/[\u0000-\u001f<>&"'`\\]/g, '').trim().slice(0, 20);
  return cleaned.length >= 2 ? cleaned : 'Anonymous';
}

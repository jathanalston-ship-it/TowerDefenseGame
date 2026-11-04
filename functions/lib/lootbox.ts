// Paid random-content region switch (docs/PREMIUM-STORE.md §paid-loot-boxes).
// In a restricted region real money must never reach a random outcome — directly (a container in
// the pack) or through a currency it buys (core/premium.ts offerReachesChance). The country
// comes from Cloudflare (`request.cf.country`, ISO 3166-1 alpha-2) and is checked SERVER-SIDE at
// checkout (authoritative) and reported by GET /api/config (so the store can hide the SKUs).
//
// PAID_LOOTBOX_BLOCKED_COUNTRIES — comma list of ISO codes; unset => "BE,NL"; an explicit empty
// string => nowhere blocked. Unknown country (no `cf`, "XX", Tor "T1"): FAIL CLOSED in production
// (we cannot prove the caller is outside a restricted region), allowed in preview/dev so local
// work and tests are not blocked.

import type { Env } from './env';

export const DEFAULT_BLOCKED_COUNTRIES = 'BE,NL';

export function blockedCountries(env: Env): Set<string> {
  const raw = env.PAID_LOOTBOX_BLOCKED_COUNTRIES ?? DEFAULT_BLOCKED_COUNTRIES;
  return new Set(raw.split(',').map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)));
}

export function requestCountry(request: Request): string | null {
  const c = (request as Request & { cf?: { country?: unknown } }).cf?.country;
  if (typeof c !== 'string') return null;
  const up = c.toUpperCase();
  return /^[A-Z]{2}$/.test(up) && up !== 'XX' && up !== 'T1' ? up : null;
}

/** May THIS caller buy SKUs that reach a random outcome (offerReachesChance)? */
export function paidRandomContainersAllowed(request: Request, env: Env): boolean {
  const country = requestCountry(request);
  if (country === null) return env.ENVIRONMENT !== 'production';
  return !blockedCountries(env).has(country);
}

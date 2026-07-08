// GET /api/daily/seed — the server's statement of "today". The daily plan itself
// is deliberately PUBLIC and deterministic (core/daily.ts derives it from the
// UTC date so offline players share the same run worldwide) — the server's job
// is DAY AUTHORITY, not seed secrecy: the returned ticket binds a player to the
// real current day, and the daily leaderboard only accepts entries carrying it.
// Clock-shifted clients can still PLAY any day offline; they can't SUBMIT it.

import type { Env } from '../../lib/env';
import { clientIp, err, json } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { hmacSha256Hex } from '../../lib/crypto';
import { isPlayerId } from '../../lib/validate';
import { hashStr } from '../../../src/core/hash';

/** Same derivation as core/daily.ts dailySeed — one shared primitive (core/hash.ts). */
export function serverDailySeed(dayKey: string): number {
  return hashStr('daily:' + dayKey);
}

export function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function mintDayTicket(secret: string, dayKey: string, playerId: string): Promise<string> {
  return hmacSha256Hex(secret, `day:${dayKey}:${playerId}`);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'daily-seed', ip, { limit: 60, windowSec: 600 }))) return err(429, 'rate-limited');
  const dayKey = utcDayKey();
  const playerId = new URL(request.url).searchParams.get('playerId');
  const out: { dayKey: string; seed: number; msUntilReset: number; ticket?: string } = {
    dayKey,
    seed: serverDailySeed(dayKey),
    msUntilReset: Date.parse(dayKey + 'T00:00:00Z') + 86_400_000 - Date.now(),
  };
  if (env.DAY_TICKET_SECRET && isPlayerId(playerId)) {
    out.ticket = await mintDayTicket(env.DAY_TICKET_SECRET, dayKey, playerId);
  }
  return json(out);
};

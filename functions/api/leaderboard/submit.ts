// POST /api/leaderboard/submit — daily / boss-rush score submission.
//
// HONESTY NOTE (docs/SECURITY-AUDIT.md): the simulation is client-side by design,
// so a submitted score is a CLAIM, not a proof. The defenses here are layered
// friction, not certainty: Turnstile (no bots), rate limits, strict bounds,
// day tickets (no clock forgery on dailies), keep-best-per-player upsert (no
// spam inflation). The deterministic sim leaves a future seam for replay
// verification (submit seed + input log; re-run serverside) — deliberately not
// built now per "do not move gameplay simulation to the server".

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { verifyTurnstile } from '../../lib/turnstile';
import { timingSafeEqualStr } from '../../lib/crypto';
import { isDayKey, isIntInRange, isPlayerId, sanitizeName } from '../../lib/validate';
import { mintDayTicket, utcDayKey } from '../daily/seed';
import { utcMonthKey, utcWeekKey } from '../../lib/period';

// Generous but finite claim bounds — anything outside is a rejected forgery. The account-XP
// modes (docs/ACCOUNT-LEVEL.md §leaderboards) carry lifetime XP as `score` and the account
// LEVEL as `wave`, so their ceilings are far higher than a run's (score 1e10 ≈ level ~10 000).
const MODE_BOUNDS: Record<string, { score: number; wave: number }> = {
  daily: { score: 500_000_000, wave: 1_000 },
  bossRush: { score: 500_000_000, wave: 1_000 },
  accountLevel: { score: 10_000_000_000, wave: 200_000 },
  weeklyXp: { score: 500_000_000, wave: 200_000 },
  monthlyXp: { score: 500_000_000, wave: 200_000 },
};
const MAX_POWER = 50_000_000;

interface Body {
  playerId?: string;
  name?: string;
  mode?: string;
  dayKey?: string;
  score?: number;
  wave?: number;
  power?: number;
  ticket?: string;
  turnstileToken?: string;
  replay?: string; // daily: recorded input log (R1) — stored verbatim, verified offline
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'lb-submit', ip, { limit: 12, windowSec: 3_600 }))) return err(429, 'rate-limited');

  const body = await readJson<Body>(request, 300_000); // roomy: replay blobs are ~10KB, capped at 256KB
  if (!body || !isPlayerId(body.playerId)) return err(400, 'bad-request');
  const bounds = typeof body.mode === 'string' ? MODE_BOUNDS[body.mode] : undefined;
  if (!bounds) return err(400, 'bad-mode');
  if (!isIntInRange(body.score, 1, bounds.score) || !isIntInRange(body.wave, 0, bounds.wave) || !isIntInRange(body.power, 0, MAX_POWER)) {
    return err(400, 'out-of-bounds');
  }

  const turnstile = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, body.turnstileToken, ip);
  if (!turnstile.ok) return err(403, 'turnstile-failed');

  let dayKey = '';
  if (body.mode === 'daily') {
    // Daily entries bind to the REAL current day: correct key + a valid ticket.
    dayKey = utcDayKey();
    if (!isDayKey(body.dayKey) || body.dayKey !== dayKey) return err(409, 'wrong-day');
    if (env.DAY_TICKET_SECRET) {
      const expected = await mintDayTicket(env.DAY_TICKET_SECRET, dayKey, body.playerId);
      if (typeof body.ticket !== 'string' || !timingSafeEqualStr(expected, body.ticket)) return err(403, 'bad-ticket');
    }
  }
  // Period XP boards bucket by a SERVER-derived key — a stale/forged client key can only
  // land in the current period (no tickets needed: XP within a period only grows).
  if (body.mode === 'weeklyXp') dayKey = utcWeekKey();
  if (body.mode === 'monthlyXp') dayKey = utcMonthKey();

  const name = sanitizeName(body.name);
  // Replay blob (daily only): stored verbatim for offline re-simulation. A better score
  // replaces the blob and RESETS verification — the new claim must earn its own ✓.
  const replay = body.mode === 'daily' && typeof body.replay === 'string' && body.replay.length <= 262_144 ? body.replay : null;
  await env.DB.prepare(
    `INSERT INTO leaderboard (mode, day_key, player_id, name, score, wave, power, submitted_at, replay, verified)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0)
     ON CONFLICT(mode, day_key, player_id) DO UPDATE
       SET name = ?4, score = ?5, wave = ?6, power = ?7, submitted_at = ?8, replay = ?9, verified = 0
       WHERE ?5 > leaderboard.score`,
  )
    .bind(body.mode, dayKey, body.playerId, name, body.score, body.wave, body.power, Math.floor(Date.now() / 1000), replay)
    .run();

  const rank = await env.DB.prepare(
    `SELECT COUNT(*) + 1 AS rank FROM leaderboard
     WHERE mode = ?1 AND day_key = ?2 AND score > (SELECT score FROM leaderboard WHERE mode = ?1 AND day_key = ?2 AND player_id = ?3)`,
  )
    .bind(body.mode, dayKey, body.playerId)
    .first<{ rank: number }>();
  return json({ ok: true, rank: rank?.rank ?? null });
};

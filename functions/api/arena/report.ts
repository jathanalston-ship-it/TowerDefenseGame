// POST /api/arena/report — the arena match settlement endpoint (docs/ARENA.md §7,
// docs/ONLINE-FOUNDATION.md §authority). THE server-authoritative progression path:
//
//   • the claim carries FACTS only (outcome/duration/wave/power) — never rating deltas or
//     reward amounts; both derive HERE from stored state via the SAME shared modules the
//     client uses (src/core/arena.ts — the premium.ts shared-code precedent);
//   • bounds validation via the shared arenaClaimProblem (a forged claim is rejected, not
//     clamped); the season must be the server's CURRENT season (clock authority);
//   • exactly-once by (match_id, player_id): a resubmit returns the stored verdict without
//     paying twice (the purchases/fulfillments discipline);
//   • the stored rating/placements/streak — never client values — feed the Elo update.

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { verifyTurnstile } from '../../lib/turnstile';
import { isPlayerId } from '../../lib/validate';
import {
  ARENA, applyRatingFloor, arenaClaimProblem, arenaMatchRewards, arenaSeasonIndex,
  divisionForRating, divisionIndex, ratingDelta,
} from '../../../src/core/arena';
import type { ArenaMatchClaim } from '../../../src/core/arena';

interface Body {
  playerId?: string;
  claim?: ArenaMatchClaim;
  turnstileToken?: string;
}

interface RatingRow {
  rating: number;
  wins: number;
  losses: number;
  placements: number;
  streak: number;
  peak: number;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  // A match takes minutes — 40/hour is beyond any legitimate pace (anti-farm budget).
  if (!(await rateLimit(env.DB, 'arena-report', ip, { limit: 40, windowSec: 3_600 }))) return err(429, 'rate-limited');

  const body = await readJson<Body>(request, 4_096);
  if (!body || !isPlayerId(body.playerId) || !body.claim || typeof body.claim !== 'object') return err(400, 'bad-request');
  const claim = body.claim;
  const problem = arenaClaimProblem(claim);
  if (problem) return err(400, problem);
  const season = arenaSeasonIndex(Date.now());
  if (claim.season !== season) return err(409, 'wrong-season'); // server clock is the season truth

  const turnstile = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, body.turnstileToken, ip);
  if (!turnstile.ok) return err(403, 'turnstile-failed');

  const now = Math.floor(Date.now() / 1000);
  const stored = await env.DB.prepare(
    'SELECT rating, wins, losses, placements, streak, peak FROM arena_ratings WHERE player_id = ?1 AND season = ?2',
  ).bind(body.playerId, season).first<RatingRow>();
  const row: RatingRow = stored ?? { rating: 0, wins: 0, losses: 0, placements: ARENA.placementMatches, streak: 0, peak: 0 };

  // Exactly-once: the INSERT is the dedupe. A duplicate returns the STORED verdict.
  const inserted = await env.DB.prepare(
    `INSERT INTO arena_matches (match_id, player_id, season, outcome, vs_ai, opp_rating, duration_sec, wave, power, rating_after, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
     ON CONFLICT(match_id, player_id) DO NOTHING`,
  ).bind(
    claim.matchId, body.playerId, season, claim.outcome, claim.vsAi ? 1 : 0, Math.round(claim.oppRating),
    Math.round(claim.durationSec), claim.waveReached, Math.round(claim.power), 0, now,
  ).run();
  if (inserted.meta.changes === 0) {
    const prior = await env.DB.prepare(
      'SELECT rating_after FROM arena_matches WHERE match_id = ?1 AND player_id = ?2',
    ).bind(claim.matchId, body.playerId).first<{ rating_after: number }>();
    return json({
      ok: true, duplicate: true, rating: prior?.rating_after ?? row.rating,
      division: divisionForRating(prior?.rating_after ?? row.rating).name,
    });
  }

  // The Elo update from STORED state (draws move nothing but still consume a placement).
  const delta = claim.outcome === 'draw'
    ? 0
    : ratingDelta({ rating: row.rating, oppRating: claim.oppRating, won: claim.outcome === 'win', placementsLeft: row.placements, streak: row.streak });
  const rating = applyRatingFloor(row.rating + delta);
  const next: RatingRow = {
    rating,
    wins: row.wins + (claim.outcome === 'win' ? 1 : 0),
    losses: row.losses + (claim.outcome === 'loss' ? 1 : 0),
    placements: Math.max(0, row.placements - 1),
    streak: claim.outcome === 'win' ? row.streak + 1 : 0,
    peak: Math.max(row.peak, rating),
  };
  await env.DB.prepare(
    `INSERT INTO arena_ratings (player_id, season, rating, wins, losses, placements, streak, peak, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
     ON CONFLICT(player_id, season) DO UPDATE
       SET rating = ?3, wins = ?4, losses = ?5, placements = ?6, streak = ?7, peak = ?8, updated_at = ?9`,
  ).bind(body.playerId, season, next.rating, next.wins, next.losses, next.placements, next.streak, next.peak, now).run();
  await env.DB.prepare(
    'UPDATE arena_matches SET rating_after = ?1 WHERE match_id = ?2 AND player_id = ?3',
  ).bind(next.rating, claim.matchId, body.playerId).run();

  // Rewards DERIVE from the verdict + the server's own division (never claimed amounts).
  const rewards = arenaMatchRewards(claim.outcome, divisionIndex(row.rating));
  return json({
    ok: true,
    rating: next.rating,
    delta,
    division: divisionForRating(next.rating).name,
    wins: next.wins,
    losses: next.losses,
    placements: next.placements,
    streak: next.streak,
    rewards: rewards.rewards,
    passXp: rewards.passXp,
  });
};

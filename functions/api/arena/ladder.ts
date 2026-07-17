// GET /api/arena/ladder[?playerId=…] — the season rating ladder (docs/ARENA.md §ladder).
// Reads the CURRENT season's arena_ratings (the idx_arena_ratings_ladder index was built for
// exactly this), returns the top slice plus the asker's own rank. Names were stored sanitized
// at report time; tags derive from the STORED player_id (unforgeable — the leaderboard
// precedent). Public read, rate-limited; there is nothing to forge here.

import type { Env } from '../../lib/env';
import { clientIp, err, json } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { isPlayerId } from '../../lib/validate';
import { designationTag } from '../../../src/core/identity';
import { arenaSeasonIndex, divisionForRating } from '../../../src/core/arena';

const TOP_N = 50;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'arena-ladder', ip, { limit: 60, windowSec: 600 }))) return err(429, 'rate-limited');
  const season = arenaSeasonIndex(Date.now()); // the server clock is the season truth
  const playerId = new URL(request.url).searchParams.get('playerId');

  const top = await env.DB.prepare(
    `SELECT player_id, name, rating, wins, losses, peak FROM arena_ratings
     WHERE season = ?1 ORDER BY rating DESC, updated_at ASC LIMIT ${TOP_N}`,
  ).bind(season).all<{ player_id: string; name: string; rating: number; wins: number; losses: number; peak: number }>();

  let you: { rank: number; rating: number; wins: number; losses: number } | null = null;
  if (isPlayerId(playerId)) {
    const mine = await env.DB.prepare(
      'SELECT rating, wins, losses, placements, streak, peak FROM arena_ratings WHERE player_id = ?1 AND season = ?2',
    ).bind(playerId, season).first<{ rating: number; wins: number; losses: number }>();
    if (mine) {
      const rank = await env.DB.prepare(
        'SELECT COUNT(*) + 1 AS rank FROM arena_ratings WHERE season = ?1 AND rating > ?2',
      ).bind(season, mine.rating).first<{ rank: number }>();
      you = { rank: rank?.rank ?? 1, rating: mine.rating, wins: mine.wins, losses: mine.losses };
    }
  }

  return json({
    season,
    entries: (top.results ?? []).map((r, i) => ({
      rank: i + 1,
      name: r.name,
      tag: designationTag(r.player_id),
      rating: r.rating,
      division: divisionForRating(r.rating).name,
      wins: r.wins,
      losses: r.losses,
      peak: r.peak,
    })),
    you,
  });
};

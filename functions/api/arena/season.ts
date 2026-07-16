// GET /api/arena/season — the server-authoritative season clock (docs/ARENA.md §4) + the
// player's stored ladder row. The CLIENT derives the same season locally for offline play;
// when online, THIS answer wins (clock-tamper immunity for season rolls and pass windows).

import type { Env } from '../../lib/env';
import { err, json } from '../../lib/http';
import { isPlayerId } from '../../lib/validate';
import { ARENA, arenaSeasonIndex, arenaSeasonStart, divisionForRating } from '../../../src/core/arena';
import { arenaExclusiveForSeason } from '../../../src/core/arenaPass';

interface RatingRow {
  rating: number;
  wins: number;
  losses: number;
  placements: number;
  streak: number;
  peak: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const now = Date.now();
  const season = arenaSeasonIndex(now);
  const url = new URL(request.url);
  const playerId = url.searchParams.get('playerId') ?? '';
  let ladder: (RatingRow & { division: string }) | null = null;
  if (playerId) {
    if (!isPlayerId(playerId)) return err(400, 'bad-request');
    const row = await env.DB.prepare(
      'SELECT rating, wins, losses, placements, streak, peak FROM arena_ratings WHERE player_id = ?1 AND season = ?2',
    ).bind(playerId, season).first<RatingRow>();
    if (row) ladder = { ...row, division: divisionForRating(row.rating).name };
  }
  return json({
    season,
    startedAt: arenaSeasonStart(season),
    endsAt: arenaSeasonStart(season + 1),
    seasonMs: ARENA.seasonMs,
    exclusive: arenaExclusiveForSeason(season),
    ladder,
  });
};

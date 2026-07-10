// GET /api/leaderboard/top?mode=daily[&dayKey=…][&playerId=…] — the public read.
// Returns the top slice plus (optionally) the asking player's own row/rank.

import type { Env } from '../../lib/env';
import { clientIp, err, json } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { isDayKey, isPlayerId } from '../../lib/validate';
import { utcDayKey } from '../daily/seed';
import { utcMonthKey, utcWeekKey } from '../../lib/period';

const TOP_N = 20;
const MODES = new Set(['daily', 'bossRush', 'accountLevel', 'weeklyXp', 'monthlyXp']);

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'lb-top', ip, { limit: 60, windowSec: 600 }))) return err(429, 'rate-limited');
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  if (mode === null || !MODES.has(mode)) return err(400, 'bad-mode');
  // Bucket key per mode: daily takes the requested day; the period XP boards always read the
  // server's CURRENT period (matching submit); all-time boards live under the empty key.
  const dayKey =
    mode === 'daily' ? ((v) => (isDayKey(v) ? v : utcDayKey()))(url.searchParams.get('dayKey'))
    : mode === 'weeklyXp' ? utcWeekKey()
    : mode === 'monthlyXp' ? utcMonthKey()
    : '';
  const playerId = url.searchParams.get('playerId');

  const top = await env.DB.prepare(
    `SELECT player_id, name, score, wave, power, verified FROM leaderboard
     WHERE mode = ?1 AND day_key = ?2 AND verified >= 0 ORDER BY score DESC, submitted_at ASC LIMIT ${TOP_N}`,
  )
    .bind(mode, dayKey)
    .all<{ player_id: string; name: string; score: number; wave: number; power: number; verified: number }>();

  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM leaderboard WHERE mode = ?1 AND day_key = ?2')
    .bind(mode, dayKey)
    .first<{ n: number }>();

  let you: { rank: number; score: number; wave: number } | null = null;
  if (isPlayerId(playerId)) {
    const mine = await env.DB.prepare('SELECT score, wave FROM leaderboard WHERE mode = ?1 AND day_key = ?2 AND player_id = ?3')
      .bind(mode, dayKey, playerId)
      .first<{ score: number; wave: number }>();
    if (mine) {
      const rank = await env.DB.prepare(
        'SELECT COUNT(*) + 1 AS rank FROM leaderboard WHERE mode = ?1 AND day_key = ?2 AND score > ?3',
      )
        .bind(mode, dayKey, mine.score)
        .first<{ rank: number }>();
      you = { rank: rank?.rank ?? 1, score: mine.score, wave: mine.wave };
    }
  }

  return json({
    mode,
    dayKey,
    total: total?.n ?? 0,
    entries: (top.results ?? []).map((r, i) => ({ rank: i + 1, name: r.name, score: r.score, wave: r.wave, power: r.power, verified: r.verified === 1 })),
    you,
  });
};

// GET /api/dev/player?id=… — one player's timeline (docs/ANALYTICS.md §devapp): the
// headline row, the durable event trail (newest first), and the activity days. Support
// and debugging read this; it contains exactly what the schema stores — no more.

import type { Env } from '../../lib/env';
import { err, json } from '../../lib/http';
import { requireDevKey } from '../../lib/devAuth';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const gate = requireDevKey(request, env);
  if (gate) return gate;
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) return err(400, 'bad-player');
  const player = await env.DB.prepare(
    'SELECT player_id, first_seen, last_seen, first_ver, last_ver, region, platform, lang, power, stage, sessions, revenue_cents FROM an_players WHERE player_id = ?1',
  ).bind(id).first();
  if (!player) return err(404, 'unknown-player');
  const events = await env.DB.prepare(
    'SELECT kind, at, screen, mode, dim, val, extras, ver FROM an_events WHERE player_id = ?1 ORDER BY at DESC LIMIT 200',
  ).bind(id).all();
  const activity = await env.DB.prepare(
    'SELECT day FROM an_activity WHERE player_id = ?1 ORDER BY day DESC LIMIT 60',
  ).bind(id).all();
  return json({ ok: true, player, events: events.results ?? [], activity: (activity.results ?? []).map((r) => (r as { day: string }).day) });
};

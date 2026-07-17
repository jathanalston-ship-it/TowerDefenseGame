// GET /api/dev/overview — the dashboard's headline card (docs/ANALYTICS.md §devapp):
// live players, DAU today/yesterday, totals, revenue, sessions, errors, version split.
// DEV_KEY-gated like every /api/dev/* route.

import type { Env } from '../../lib/env';
import { json } from '../../lib/http';
import { requireDevKey } from '../../lib/devAuth';
import { dailyRowsSince, utcDay } from '../../lib/anHost';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const gate = requireDevKey(request, env);
  if (gate) return gate;
  const now = Date.now();
  const today = utcDay(now);
  const yesterday = utcDay(now - 86_400_000);

  const dauToday = await env.DB.prepare('SELECT COUNT(*) AS c FROM an_activity WHERE day = ?1').bind(today).first<{ c: number }>();
  const dauYesterday = await env.DB.prepare('SELECT COUNT(*) AS c FROM an_activity WHERE day = ?1').bind(yesterday).first<{ c: number }>();
  const live = await env.DB.prepare('SELECT COUNT(*) AS c FROM an_sessions WHERE last_ping > ?1').bind(now - 150_000).first<{ c: number }>();
  const players = await env.DB.prepare('SELECT COUNT(*) AS c FROM an_players').first<{ c: number }>();
  const revenue = await env.DB.prepare('SELECT SUM(revenue_cents) AS s FROM an_players').first<{ s: number | null }>();

  // One bounded rollup read covers the rest of the card (7 days of aggregates).
  const rows = await dailyRowsSince(env.DB, utcDay(now - 7 * 86_400_000));
  const sum = (kind: string, day?: string): { n: number; sum: number } => {
    let n = 0; let s = 0;
    for (const r of rows) if (r.kind === kind && (!day || r.day === day)) { n += r.n; s += r.sum; }
    return { n, sum: s };
  };
  const versions = new Map<string, number>();
  for (const r of rows) if (r.kind === 'ses_start') versions.set(r.ver, (versions.get(r.ver) ?? 0) + r.n);

  return json({
    ok: true,
    live: live?.c ?? 0,
    dau: { today: dauToday?.c ?? 0, yesterday: dauYesterday?.c ?? 0 },
    playersTotal: players?.c ?? 0,
    revenueCentsTotal: revenue?.s ?? 0,
    today: {
      sessions: sum('ses_start', today).n,
      runs: sum('run_start', today).n,
      revenueCents: sum('buy', today).sum,
      errors: sum('err', today).n,
      purchases: sum('buy', today).n,
    },
    week: {
      sessions: sum('ses_start').n,
      runs: sum('run_start').n,
      revenueCents: sum('buy').sum,
      errors: sum('err').n,
    },
    versions: [...versions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ver, sessions]) => ({ ver, sessions })),
  });
};

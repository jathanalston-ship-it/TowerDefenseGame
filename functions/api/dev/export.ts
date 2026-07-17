// GET /api/dev/export?days=30[&kind=…]&format=json|csv — the raw-rollup export lane
// (docs/ANALYTICS.md §devapp): every dashboard view is derived from these rows, so this
// one endpoint IS "export any view" — filter client-side or in a spreadsheet.

import type { Env } from '../../lib/env';
import { err, json } from '../../lib/http';
import { requireDevKey } from '../../lib/devAuth';
import { dailyRowsSince, utcDay } from '../../lib/anHost';
import { AN_EVENT_BY_KIND } from '../../../src/core/analyticsEvents';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const gate = requireDevKey(request, env);
  if (gate) return gate;
  const url = new URL(request.url);
  const days = Math.max(1, Math.min(400, Number(url.searchParams.get('days') ?? 30)));
  const kind = url.searchParams.get('kind') ?? undefined;
  if (kind && !AN_EVENT_BY_KIND[kind]) return err(400, 'unknown-kind');
  const rows = await dailyRowsSince(env.DB, utcDay(Date.now() - days * 86_400_000), kind);
  if (url.searchParams.get('format') === 'csv') {
    const esc = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const csv = ['day,kind,dim,ver,n,sum,sum2',
      ...rows.map((r) => [r.day, r.kind, esc(r.dim), esc(r.ver), r.n, r.sum, r.sum2].join(','))].join('\n');
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="an_daily_${days}d${kind ? `_${kind}` : ''}.csv"`,
        'cache-control': 'no-store',
      },
    });
  }
  return json({ ok: true, rows });
};

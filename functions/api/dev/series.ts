// GET /api/dev/series?kind=…&days=30[&dim=…][&ver=…] — the generic series explorer:
// daily rollup rows for ONE event kind, optionally filtered by dim/version. Every event
// in the registry is queryable here with zero per-kind server code.

import type { Env } from '../../lib/env';
import { err, json } from '../../lib/http';
import { requireDevKey } from '../../lib/devAuth';
import { dailyRowsSince, utcDay } from '../../lib/anHost';
import { AN_EVENT_BY_KIND, AN_EVENTS } from '../../../src/core/analyticsEvents';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const gate = requireDevKey(request, env);
  if (gate) return gate;
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') ?? '';
  if (kind === 'kinds') {
    // Discovery: the registry itself, so the explorer's picker is always complete.
    return json({ ok: true, kinds: AN_EVENTS.map((e) => ({ kind: e.kind, doc: e.doc, dim: e.dim, hasValue: !!e.value })) });
  }
  if (!AN_EVENT_BY_KIND[kind]) return err(400, 'unknown-kind');
  const days = Math.max(1, Math.min(120, Number(url.searchParams.get('days') ?? 30)));
  const dim = url.searchParams.get('dim');
  const ver = url.searchParams.get('ver');
  let rows = await dailyRowsSince(env.DB, utcDay(Date.now() - days * 86_400_000), kind);
  if (dim) rows = rows.filter((r) => r.dim === dim);
  if (ver) rows = rows.filter((r) => r.ver === ver);
  return json({ ok: true, kind, rows });
};

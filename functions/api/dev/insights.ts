// GET /api/dev/insights[?days=30] — the automatic-conclusions feed (docs/ANALYTICS.md
// §insights): the SAME pure engine the desktop app and tests use, fed 30 days of rollups
// + retention cohorts. Findings arrive ranked (action → watch → info) with significance.

import type { Env } from '../../lib/env';
import { json } from '../../lib/http';
import { requireDevKey } from '../../lib/devAuth';
import { dailyRowsSince, retentionCohorts, utcDay } from '../../lib/anHost';
import { computeInsights } from '../../../src/core/analyticsInsights';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const gate = requireDevKey(request, env);
  if (gate) return gate;
  const url = new URL(request.url);
  const days = Math.max(7, Math.min(90, Number(url.searchParams.get('days') ?? 30)));
  const now = Date.now();
  const rows = await dailyRowsSince(env.DB, utcDay(now - days * 86_400_000));
  const cohorts = await retentionCohorts(env.DB, now, days);
  const findings = computeInsights({ rows, cohorts });
  return json({ ok: true, days, findings, cohorts });
};

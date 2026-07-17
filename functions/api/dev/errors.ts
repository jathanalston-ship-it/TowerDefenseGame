// GET /api/dev/errors — the crash/error ledger (docs/ANALYTICS.md §devapp): hash-deduped
// rows with counts, first/last seen, truncated message + stack head, and the last version.

import type { Env } from '../../lib/env';
import { json } from '../../lib/http';
import { requireDevKey } from '../../lib/devAuth';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const gate = requireDevKey(request, env);
  if (gate) return gate;
  const rows = await env.DB.prepare(
    'SELECT hash, first_at, last_at, count, msg, stack, ver FROM an_errors ORDER BY last_at DESC LIMIT 100',
  ).all();
  return json({ ok: true, errors: rows.results ?? [] });
};

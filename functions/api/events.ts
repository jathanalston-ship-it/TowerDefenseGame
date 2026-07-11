// POST /api/events — privacy-friendly aggregate counters (docs/WEBSITE.md §analytics).
// Accepts small batches of (kind, n) and adds them to per-UTC-day counters in D1.
// No ids, no cookies, no IP storage — the rate-limit key hashes the IP transiently
// like every other endpoint but nothing about the sender is persisted. Kinds are
// allowlisted by shape + prefix so the table can't be spammed into a junk drawer.

import type { Env } from '../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';

const BASE_KINDS = new Set([
  'session_start', 'run_start', 'run_end',
  'research_view', 'research_abort', 'research_claim',
  'store_open', 'checkout_start', 'flash_popup',
  'account_guest', 'account_register', 'account_login',
  'sync_push', 'sync_pull', 'sync_conflict', 'sync_fail', 'offline_session',
]);
// Detail counters ride a known prefix (e.g. research_claim:core_sample).
const DETAIL_PREFIXES = ['research_claim:', 'run_end:', 'checkout_start:', 'flash_popup:'];

function kindAllowed(kind: string): boolean {
  if (BASE_KINDS.has(kind)) return true;
  return DETAIL_PREFIXES.some((p) => kind.startsWith(p) && /^[a-z0-9_:-]{1,64}$/.test(kind));
}

interface Body {
  events?: { kind?: unknown; n?: unknown }[];
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'events', ip, { limit: 60, windowSec: 600 }))) return err(429, 'rate-limited');
  const body = await readJson<Body>(request, 8_192);
  if (!body || !Array.isArray(body.events) || body.events.length > 50) return err(400, 'bad-request');
  const day = new Date().toISOString().slice(0, 10);
  for (const e of body.events) {
    const kind = typeof e.kind === 'string' ? e.kind : '';
    const n = typeof e.n === 'number' && Number.isInteger(e.n) ? Math.min(Math.max(e.n, 1), 200) : 0;
    if (!kindAllowed(kind) || n <= 0) continue; // skip junk silently — a beacon never errors loudly
    await env.DB.prepare(
      `INSERT INTO analytics_counters (day, kind, count) VALUES (?1, ?2, ?3)
       ON CONFLICT(day, kind) DO UPDATE SET count = count + ?3`,
    )
      .bind(day, kind, n)
      .run();
  }
  return json({ ok: true });
};

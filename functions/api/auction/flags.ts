// GET /api/auction/flags — the moderation hook (docs/AUCTION-HOUSE.md §manipulation).
// Reads what the audit wrote; NEVER auto-punishes — a human reviews. Gated by the MOD_KEY
// secret (header x-mod-key); absent configuration means the lane is closed, not open.

import type { Env } from '../../lib/env';
import { clientIp, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'auction-flags', ip, { limit: 30, windowSec: 300 }))) return err(429, 'rate-limited');
  if (!env.MOD_KEY) return err(503, 'moderation-not-configured');
  const key = request.headers.get('x-mod-key');
  if (!key || key !== env.MOD_KEY) return err(403, 'forbidden');

  const url = new URL(request.url);
  const unreviewedOnly = url.searchParams.get('unreviewed') === '1';
  const flags = unreviewedOnly
    ? await env.DB.prepare('SELECT flag_id, kind, detail, at, reviewed FROM market_flags WHERE reviewed = 0 ORDER BY at DESC LIMIT 200').all()
    : await env.DB.prepare('SELECT flag_id, kind, detail, at, reviewed FROM market_flags ORDER BY at DESC LIMIT 200').all();
  const flaggedItems = await env.DB.prepare(
    'SELECT global_item_id, ref_key, category, family_key, owner_id, transfers, history FROM market_items WHERE fraud_flag = 1 LIMIT 100',
  ).all();
  return json({ ok: true, flags: flags.results, flaggedItems: flaggedItems.results });
};

/** POST marks flags reviewed (the moderation workflow's ack). */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MOD_KEY) return err(503, 'moderation-not-configured');
  const key = request.headers.get('x-mod-key');
  if (!key || key !== env.MOD_KEY) return err(403, 'forbidden');
  const body = await readJson<{ flagIds?: number[] }>(request, 4_096);
  if (!body || !Array.isArray(body.flagIds)) return err(400, 'bad-request');
  const ids = body.flagIds.filter((n): n is number => Number.isInteger(n)).slice(0, 100);
  if (ids.length === 0) return err(400, 'no-flags');
  await env.DB.batch(ids.map((id) =>
    env.DB.prepare('UPDATE market_flags SET reviewed = 1 WHERE flag_id = ?1').bind(id),
  ));
  return json({ ok: true, reviewed: ids.length });
};

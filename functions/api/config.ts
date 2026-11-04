// GET /api/config — the public remote-config document (docs/ANALYTICS.md §ab).
// Serves the stored an_flags doc through the SAME whitelist sanitizer the client applies
// (defense on both ends: even a hand-edited row can only steer UI/meta seams within
// bounds). No auth — this is public tuning data; writes go through the DEV_KEY-gated
// /api/dev/flags endpoint.

import type { Env } from '../lib/env';
import { clientIp, err, json } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { sanitizeRemoteConfig } from '../../src/core/remoteConfig';
import { paidRandomContainersAllowed } from '../lib/lootbox';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'an-config', ip, { limit: 30, windowSec: 600 }))) return err(429, 'rate-limited');
  const row = await env.DB.prepare('SELECT doc, rev FROM an_flags WHERE id = 1').first<{ doc: string; rev: number }>();
  let parsed: unknown = null;
  try { parsed = row ? JSON.parse(row.doc) : null; } catch { parsed = null; }
  const doc = sanitizeRemoteConfig(parsed);
  doc.rev = row?.rev ?? 0;
  // Caller-specific region flag (docs/PREMIUM-STORE.md §paid-loot-boxes): false => the store hides SKUs
  // with random-content containers. The server still enforces it at checkout.
  // PRIVATE cache only: a shared edge copy would hand one country's answer to another.
  return json({ ...doc, paidRandomContainers: paidRandomContainersAllowed(request, env) }, 200, { 'cache-control': 'private, max-age=60' });
};

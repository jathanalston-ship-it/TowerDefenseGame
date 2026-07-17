// POST /api/an/ingest — the gameplay telemetry intake (docs/ANALYTICS.md §server).
// Accepts ONE batch per request (the client's flush cadence), validates it against the
// SAME shared event registry the client used, enriches region server-side, and folds it
// into bounded rollups + durable rows in one atomic D1 batch. sendBeacon posts arrive as
// text/plain — the body reader doesn't care about content-type by design.
//
// Enforcement posture: reject-the-event, not reject-the-batch (a beacon must degrade,
// never explode); a hopeless envelope gets 400, which the client treats as done-not-
// retryable so a bad build can't wedge outboxes forever.

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { AN_LIMITS } from '../../../src/core/analyticsEvents';
import { acceptBatch, ingestBatch, pruneRaw } from '../../lib/anHost';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  // Cadence bound: the client flushes at most every flushSec — 60/10 min per IP is roomy
  // for a household NAT while still capping a hostile writer.
  if (!(await rateLimit(env.DB, 'an-ingest', ip, { limit: 60, windowSec: 600 }))) return err(429, 'rate-limited');

  const raw = await readJson<unknown>(request, AN_LIMITS.batchBytes);
  if (raw === null) return err(400, 'bad-json');
  const accepted = acceptBatch(raw);
  if ('problem' in accepted) return err(400, accepted.problem);

  const now = Date.now();
  const region = (request as { cf?: { country?: string } }).cf?.country
    ?? request.headers.get('cf-ipcountry') ?? '';
  await ingestBatch(env.DB, accepted.batch, accepted.events, { now, region });

  // Retention pruning piggybacks on session starts — no daemon, no cron.
  if (accepted.events.some((e) => e.k === 'ses_start')) await pruneRaw(env.DB, now);

  return json({ ok: true, accepted: accepted.events.length });
};

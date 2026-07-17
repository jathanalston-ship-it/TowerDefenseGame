// /api/dev/flags — remote-config administration (docs/ANALYTICS.md §ab).
// GET returns the stored document (raw + the sanitized view the clients will actually
// receive); PUT replaces it THROUGH the whitelist sanitizer and bumps the revision — an
// out-of-lane key can never even be persisted.

import type { Env } from '../../lib/env';
import { err, json, readJson } from '../../lib/http';
import { requireDevKey } from '../../lib/devAuth';
import { sanitizeRemoteConfig } from '../../../src/core/remoteConfig';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const gate = requireDevKey(request, env);
  if (gate) return gate;
  const row = await env.DB.prepare('SELECT doc, rev FROM an_flags WHERE id = 1').first<{ doc: string; rev: number }>();
  let parsed: unknown = null;
  try { parsed = row ? JSON.parse(row.doc) : null; } catch { parsed = null; }
  const effective = sanitizeRemoteConfig(parsed);
  effective.rev = row?.rev ?? 0;
  return json({ ok: true, rev: row?.rev ?? 0, effective });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const gate = requireDevKey(request, env);
  if (gate) return gate;
  const body = await readJson<unknown>(request, 16_384);
  if (body === null) return err(400, 'bad-json');
  const row = await env.DB.prepare('SELECT doc, rev FROM an_flags WHERE id = 1').first<{ doc: string; rev: number }>();
  const rev = (row?.rev ?? 0) + 1;
  const doc = sanitizeRemoteConfig(body);
  doc.rev = rev;
  await env.DB.prepare(
    'INSERT INTO an_flags (id, doc, rev, updated_at) VALUES (1, ?1, ?2, ?3) ' +
    'ON CONFLICT(id) DO UPDATE SET doc = excluded.doc, rev = excluded.rev, updated_at = excluded.updated_at',
  ).bind(JSON.stringify(doc), rev, Date.now()).run();
  return json({ ok: true, rev, effective: doc });
};

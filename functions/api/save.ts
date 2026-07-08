// /api/save — cloud save backup/restore. One slot per player. Ownership is a
// client-minted 64-hex sync token: trust-on-first-use claims the player id
// (SHA-256 of the token stored, never the token), every later write/read must
// present the same token. Gameplay never depends on this endpoint — it's a
// backup lane, and the game is fully playable offline without it.

import type { Env } from '../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { sha256Hex, timingSafeEqualStr } from '../lib/crypto';
import { isPlayerId, isSyncToken } from '../lib/validate';

const MAX_BLOB_BYTES = 262_144; // 256 KB — save exports run tens of KB; headroom without abuse

interface PutBody {
  playerId?: string;
  token?: string;
  blob?: string;
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'save-put', ip, { limit: 12, windowSec: 600 }))) return err(429, 'rate-limited');

  const body = await readJson<PutBody>(request, MAX_BLOB_BYTES + 4_096);
  if (!body || !isPlayerId(body.playerId) || !isSyncToken(body.token)) return err(400, 'bad-request');
  const blob = body.blob;
  if (typeof blob !== 'string' || blob.length === 0 || blob.length > MAX_BLOB_BYTES) return err(400, 'bad-blob');
  // The blob must at least be JSON with the exporter's envelope shape — the
  // server never trusts its CONTENT (the client re-sanitizes on restore).
  try {
    const parsed = JSON.parse(blob) as { schemaVersion?: unknown };
    if (typeof parsed?.schemaVersion !== 'number') return err(400, 'bad-blob');
  } catch {
    return err(400, 'bad-blob');
  }

  const tokenHash = await sha256Hex(body.token);
  const existing = await env.DB.prepare('SELECT token_hash FROM cloud_saves WHERE player_id = ?1')
    .bind(body.playerId)
    .first<{ token_hash: string }>();
  if (existing && !timingSafeEqualStr(existing.token_hash, tokenHash)) return err(403, 'wrong-token');

  await env.DB.prepare(
    `INSERT INTO cloud_saves (player_id, token_hash, blob, size, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(player_id) DO UPDATE SET blob = ?3, size = ?4, updated_at = ?5`,
  )
    .bind(body.playerId, tokenHash, blob, blob.length, Math.floor(Date.now() / 1000))
    .run();
  return json({ ok: true, size: blob.length });
};

/** Erase the cloud slot (the privacy policy's deletion right). Same token auth as
 *  reads/writes; deleting a non-existent slot succeeds (idempotent). Purchase records
 *  are deliberately NOT deleted here — they are retained for refund/accounting duties
 *  (see /welcome/privacy.html §retention). */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'save-del', ip, { limit: 10, windowSec: 600 }))) return err(429, 'rate-limited');
  const url = new URL(request.url);
  const playerId = url.searchParams.get('playerId');
  const token = url.searchParams.get('token');
  if (!isPlayerId(playerId) || !isSyncToken(token)) return err(400, 'bad-request');
  const row = await env.DB.prepare('SELECT token_hash FROM cloud_saves WHERE player_id = ?1')
    .bind(playerId)
    .first<{ token_hash: string }>();
  if (!row) return json({ ok: true, existed: false });
  if (!timingSafeEqualStr(row.token_hash, await sha256Hex(token))) return err(403, 'wrong-token');
  await env.DB.prepare('DELETE FROM cloud_saves WHERE player_id = ?1').bind(playerId).run();
  return json({ ok: true, existed: true });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'save-get', ip, { limit: 30, windowSec: 600 }))) return err(429, 'rate-limited');
  const url = new URL(request.url);
  const playerId = url.searchParams.get('playerId');
  const token = url.searchParams.get('token');
  if (!isPlayerId(playerId) || !isSyncToken(token)) return err(400, 'bad-request');

  const row = await env.DB.prepare('SELECT token_hash, blob, updated_at FROM cloud_saves WHERE player_id = ?1')
    .bind(playerId)
    .first<{ token_hash: string; blob: string; updated_at: number }>();
  if (!row) return err(404, 'no-save');
  if (!timingSafeEqualStr(row.token_hash, await sha256Hex(token))) return err(403, 'wrong-token');
  return json({ blob: row.blob, updatedAt: row.updated_at });
};

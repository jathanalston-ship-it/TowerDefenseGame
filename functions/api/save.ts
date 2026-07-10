// /api/save — the cloud save slot. One slot per account. Ownership is EITHER the
// legacy device sync token (trust-on-first-use: SHA-256 of the token stored, never
// the token) OR an account session (docs/ACCOUNTS.md) — both resolve to the same
// player_id/account_id space. Gameplay never depends on this endpoint — it's the
// sync lane, and the game is fully playable offline without it.
//
// Writes are VERSIONED: every accepted PUT bumps `rev`. A client that sends its
// `baseRev` gets 409 {rev, meta} when the slot moved under it — the sync engine
// turns that into the conflict flow. No baseRev ⇒ legacy last-write-wins (old
// clients keep working). `meta` carries the save headline (savedAt, playtimeSec,
// power, stage, checksum, platform) so conflict UIs preview without the blob.

import type { Env } from '../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { sha256Hex, timingSafeEqualStr } from '../lib/crypto';
import { isPlayerId, isSyncToken } from '../lib/validate';
import { sessionAccount } from '../lib/accounts';

const MAX_BLOB_BYTES = 262_144; // 256 KB — save exports run tens of KB; headroom without abuse
const MAX_META_BYTES = 2_048;

interface SaveRow { token_hash: string; blob: string; updated_at: number; rev: number; meta: string }

interface PutBody {
  playerId?: string;
  token?: string;
  session?: string;
  blob?: string;
  baseRev?: number;
  meta?: Record<string, unknown>;
}

/** Resolve write/read access to a slot: a session owning the id, or the slot's
 *  sync token (TOFU when the slot doesn't exist yet). Returns 'ok' | error code. */
async function authorize(env: Env, playerId: string, token: string | null, session: string | null, existing: SaveRow | null): Promise<'ok' | 'wrong-token' | 'unauthorized'> {
  if (session && isSyncToken(session)) {
    const acct = await sessionAccount(env, session);
    return acct && acct.account_id === playerId ? 'ok' : 'unauthorized';
  }
  if (!isSyncToken(token)) return 'unauthorized';
  if (existing && !timingSafeEqualStr(existing.token_hash, await sha256Hex(token))) return 'wrong-token';
  return 'ok';
}

function sanitizedMeta(meta: unknown): string {
  if (!meta || typeof meta !== 'object') return '{}';
  const s = JSON.stringify(meta);
  return s.length <= MAX_META_BYTES ? s : '{}';
}

async function loadRow(env: Env, playerId: string): Promise<SaveRow | null> {
  return await env.DB.prepare('SELECT token_hash, blob, updated_at, rev, meta FROM cloud_saves WHERE player_id = ?1')
    .bind(playerId).first<SaveRow>();
}

function metaOf(row: SaveRow): unknown {
  try { return JSON.parse(row.meta); } catch { return {}; }
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'save-put', ip, { limit: 12, windowSec: 600 }))) return err(429, 'rate-limited');

  const body = await readJson<PutBody>(request, MAX_BLOB_BYTES + 8_192);
  if (!body || !isPlayerId(body.playerId)) return err(400, 'bad-request');
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

  const existing = await loadRow(env, body.playerId);
  const auth = await authorize(env, body.playerId, body.token ?? null, body.session ?? null, existing);
  if (auth !== 'ok') return err(403, auth);

  // Optimistic concurrency: a stale writer is refused with the winning headline —
  // the sync engine shows the conflict, the player decides. Never a silent loss.
  if (existing && typeof body.baseRev === 'number' && body.baseRev !== existing.rev) {
    return json({ ok: false, error: 'conflict', rev: existing.rev, updatedAt: existing.updated_at, meta: metaOf(existing) }, 409);
  }

  const rev = (existing?.rev ?? 0) + 1;
  const tokenHash = existing?.token_hash ?? (isSyncToken(body.token) ? await sha256Hex(body.token) : await sha256Hex(body.session ?? ''));
  await env.DB.prepare(
    `INSERT INTO cloud_saves (player_id, token_hash, blob, size, updated_at, rev, meta)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(player_id) DO UPDATE SET blob = ?3, size = ?4, updated_at = ?5, rev = ?6, meta = ?7`,
  )
    .bind(body.playerId, tokenHash, blob, blob.length, Math.floor(Date.now() / 1000), rev, sanitizedMeta(body.meta))
    .run();
  return json({ ok: true, size: blob.length, rev });
};

/** Erase the cloud slot (the privacy policy's deletion right). Same auth as
 *  reads/writes; deleting a non-existent slot succeeds (idempotent). Purchase records
 *  are deliberately NOT deleted here — they are retained for refund/accounting duties
 *  (see /welcome/privacy.html §retention). */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'save-del', ip, { limit: 10, windowSec: 600 }))) return err(429, 'rate-limited');
  const url = new URL(request.url);
  const playerId = url.searchParams.get('playerId');
  if (!isPlayerId(playerId)) return err(400, 'bad-request');
  const row = await loadRow(env, playerId);
  if (!row) return json({ ok: true, existed: false });
  const auth = await authorize(env, playerId, url.searchParams.get('token'), url.searchParams.get('session'), row);
  if (auth !== 'ok') return err(403, auth);
  await env.DB.prepare('DELETE FROM cloud_saves WHERE player_id = ?1').bind(playerId).run();
  return json({ ok: true, existed: true });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'save-get', ip, { limit: 30, windowSec: 600 }))) return err(429, 'rate-limited');
  const url = new URL(request.url);
  const playerId = url.searchParams.get('playerId');
  if (!isPlayerId(playerId)) return err(400, 'bad-request');

  const row = await loadRow(env, playerId);
  if (!row) return err(404, 'no-save');
  const auth = await authorize(env, playerId, url.searchParams.get('token'), url.searchParams.get('session'), row);
  if (auth !== 'ok') return err(403, auth);
  // ?meta=1 → headline only (the sync engine's cheap boot/poll probe).
  if (url.searchParams.get('meta') === '1') return json({ updatedAt: row.updated_at, rev: row.rev, meta: metaOf(row) });
  return json({ blob: row.blob, updatedAt: row.updated_at, rev: row.rev, meta: metaOf(row) });
};

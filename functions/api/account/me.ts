// /api/account/me — the signed-in account surface.
//   GET  ?session=… | ?playerId=…&token=…  → account view + cloud-save headline
//   POST { credentials…, displayName?, icon?, playtimeSec? } → profile updates
// Playtime is monotonic (server keeps the max ever reported) — it feeds the
// conflict-resolution preview and the account card, never gameplay.

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { sanitizeName } from '../../lib/validate';
import { accountView, resolveAccount, type Credentials } from '../../lib/accounts';

async function saveHeadline(env: Env, accountId: string): Promise<Record<string, unknown> | null> {
  const row = await env.DB.prepare('SELECT rev, meta, size, updated_at FROM cloud_saves WHERE player_id = ?1')
    .bind(accountId).first<{ rev: number; meta: string; size: number; updated_at: number }>();
  if (!row) return null;
  let meta: unknown = {};
  try { meta = JSON.parse(row.meta); } catch { /* legacy row */ }
  return { rev: row.rev, updatedAt: row.updated_at, size: row.size, meta };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await rateLimit(env.DB, 'acct-me', clientIp(request), { limit: 60, windowSec: 600 }))) return err(429, 'rate-limited');
  const url = new URL(request.url);
  const creds: Credentials = {
    session: url.searchParams.get('session') ?? undefined,
    playerId: url.searchParams.get('playerId') ?? undefined,
    token: url.searchParams.get('token') ?? undefined,
  };
  const acct = await resolveAccount(env, creds);
  if (!acct) return err(403, 'unauthorized');
  return json({ ok: true, account: accountView(acct), cloudSave: await saveHeadline(env, acct.account_id) });
};

interface PostBody extends Credentials { displayName?: string; icon?: string; playtimeSec?: number }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  if (!(await rateLimit(env.DB, 'acct-me', clientIp(request), { limit: 60, windowSec: 600 }))) return err(429, 'rate-limited');
  const body = await readJson<PostBody>(request, 4_096);
  if (!body) return err(400, 'bad-request');
  const acct = await resolveAccount(env, body);
  if (!acct) return err(403, 'unauthorized');

  const displayName = body.displayName !== undefined ? sanitizeName(body.displayName) : acct.display_name;
  const icon = typeof body.icon === 'string' ? body.icon.slice(0, 32) : acct.icon;
  const playtime = typeof body.playtimeSec === 'number' && Number.isFinite(body.playtimeSec)
    ? Math.max(acct.playtime_sec, Math.min(Math.floor(body.playtimeSec), 400_000_000)) // monotonic, sane cap
    : acct.playtime_sec;
  await env.DB.prepare('UPDATE accounts SET display_name = ?2, icon = ?3, playtime_sec = ?4 WHERE account_id = ?1')
    .bind(acct.account_id, displayName, icon, playtime).run();
  return json({ ok: true, account: accountView({ ...acct, display_name: displayName, icon, playtime_sec: playtime }) });
};

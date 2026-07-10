// POST /api/account/guest — formalize the device identity as a Guest Account.
// Idempotent: the first presenter of (playerId, token) claims the account (TOFU,
// exactly like the cloud-save slot); every later call verifies the same token.
// Guests are REAL accounts — same account_id keys purchases/saves/leaderboards —
// so upgrading later (register) preserves everything.

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { sha256Hex } from '../../lib/crypto';
import { isPlayerId, isPlatform, isSyncToken } from '../../lib/validate';
import { accountView, upsertGuest } from '../../lib/accounts';

interface Body { playerId?: string; token?: string; platform?: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  if (!(await rateLimit(env.DB, 'acct-guest', clientIp(request), { limit: 20, windowSec: 600 }))) return err(429, 'rate-limited');

  const body = await readJson<Body>(request, 2_048);
  if (!body || !isPlayerId(body.playerId) || !isSyncToken(body.token)) return err(400, 'bad-request');
  const platform = isPlatform(body.platform) ? body.platform : 'web';

  const acct = await upsertGuest(env, body.playerId, await sha256Hex(body.token), platform);
  if (acct === 'wrong-token') return err(403, 'wrong-token');
  return json({ ok: true, account: accountView(acct) });
};

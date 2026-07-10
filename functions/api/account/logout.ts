// POST /api/account/logout — revoke one session (sign out on this device only).
// Idempotent; local play continues untouched (offline-first, docs/ACCOUNTS.md).

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { isSyncToken } from '../../lib/validate';
import { revokeSession } from '../../lib/accounts';

interface Body { session?: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  if (!(await rateLimit(env.DB, 'acct-logout', clientIp(request), { limit: 20, windowSec: 600 }))) return err(429, 'rate-limited');
  const body = await readJson<Body>(request, 1_024);
  if (!body || !isSyncToken(body.session)) return err(400, 'bad-request'); // session tokens share the 64-hex shape
  await revokeSession(env, body.session);
  return json({ ok: true });
};

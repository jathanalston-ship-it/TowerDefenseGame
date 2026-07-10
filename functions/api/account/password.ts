// POST /api/account/password — change password for a signed-in account. Requires
// the CURRENT password even with a valid session (session theft must not allow a
// lockout). All other sessions are revoked on success (the standard rotation).

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { hashPassword, mintSession, passwordProblem, resolveAccount, verifyPassword, type Credentials } from '../../lib/accounts';

interface Body extends Credentials { oldPassword?: string; newPassword?: string; platform?: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  if (!(await rateLimit(env.DB, 'acct-pass', clientIp(request), { limit: 6, windowSec: 600 }))) return err(429, 'rate-limited');
  const body = await readJson<Body>(request, 4_096);
  if (!body || typeof body.oldPassword !== 'string') return err(400, 'bad-request');
  const problem = passwordProblem(body.newPassword);
  if (problem) return err(400, problem);

  const acct = await resolveAccount(env, body);
  if (!acct || acct.provider === 'guest') return err(403, 'unauthorized');
  if (!(await verifyPassword(body.oldPassword, acct))) return err(403, 'bad-credentials');

  const { hash, salt, iters } = await hashPassword(body.newPassword!);
  await env.DB.prepare('UPDATE accounts SET pass_hash = ?2, pass_salt = ?3, pass_iters = ?4 WHERE account_id = ?1')
    .bind(acct.account_id, hash, salt, iters).run();
  await env.DB.prepare('DELETE FROM sessions WHERE account_id = ?1').bind(acct.account_id).run();
  // The requesting device gets a fresh session so the player stays signed in.
  const session = await mintSession(env, acct.account_id, 'web');
  return json({ ok: true, session });
};

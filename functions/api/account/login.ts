// POST /api/account/login — email/password sign-in from ANY device. Returns the
// account plus a fresh session token; the client adopts account_id as its playerId
// (that's what keys the cloud save + purchases) and pulls the cloud save next.
// Tight rate limit = the brute-force gate; failures are uniform ('bad-credentials')
// so the endpoint never confirms whether an email exists.

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { isEmail, isPlatform } from '../../lib/validate';
import { accountView, getAccountByEmail, mintSession, touchLogin, verifyPassword } from '../../lib/accounts';

interface Body { email?: string; password?: string; platform?: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  if (!(await rateLimit(env.DB, 'acct-login', clientIp(request), { limit: 10, windowSec: 600 }))) return err(429, 'rate-limited');

  const body = await readJson<Body>(request, 2_048);
  if (!body || !isEmail(body.email) || typeof body.password !== 'string') return err(400, 'bad-request');
  const platform = isPlatform(body.platform) ? body.platform : 'web';

  const acct = await getAccountByEmail(env, body.email.toLowerCase());
  if (!acct || !(await verifyPassword(body.password, acct))) return err(403, 'bad-credentials');

  await touchLogin(env, acct, platform);
  const session = await mintSession(env, acct.account_id, platform);
  return json({ ok: true, session, account: accountView(acct) });
};

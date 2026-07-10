// POST /api/account/register — create an email/password account, ALWAYS as an
// upgrade of the presented guest identity: credentials attach to the SAME
// account_id, so progress, purchases and records carry over with zero data
// movement (docs/ACCOUNTS.md §upgrade). A brand-new player registers the guest
// identity implicitly first (the client mints one on boot regardless).

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { sha256Hex } from '../../lib/crypto';
import { isEmail, isPlayerId, isPlatform, isSyncToken, sanitizeName } from '../../lib/validate';
import { accountView, getAccountByEmail, hashPassword, mintSession, passwordProblem, upsertGuest } from '../../lib/accounts';

interface Body {
  playerId?: string;
  token?: string;
  email?: string;
  password?: string;
  displayName?: string;
  platform?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  if (!(await rateLimit(env.DB, 'acct-register', clientIp(request), { limit: 6, windowSec: 3600 }))) return err(429, 'rate-limited');

  const body = await readJson<Body>(request, 4_096);
  if (!body || !isPlayerId(body.playerId) || !isSyncToken(body.token) || !isEmail(body.email)) return err(400, 'bad-request');
  const passProblem = passwordProblem(body.password);
  if (passProblem) return err(400, passProblem);
  const email = body.email.toLowerCase();
  const platform = isPlatform(body.platform) ? body.platform : 'web';

  if (await getAccountByEmail(env, email)) return err(409, 'email-taken');

  // Claim/verify the guest identity, then attach the email credentials to it.
  const guest = await upsertGuest(env, body.playerId, await sha256Hex(body.token), platform);
  if (guest === 'wrong-token') return err(403, 'wrong-token');
  if (guest.provider !== 'guest') return err(409, 'already-registered');

  const { hash, salt, iters } = await hashPassword(body.password!);
  const displayName = body.displayName !== undefined ? sanitizeName(body.displayName) : guest.display_name;
  await env.DB.prepare(
    `UPDATE accounts SET provider = 'email', email = ?2, pass_hash = ?3, pass_salt = ?4, pass_iters = ?5, display_name = ?6
     WHERE account_id = ?1`,
  ).bind(guest.account_id, email, hash, salt, iters, displayName).run();

  const session = await mintSession(env, guest.account_id, platform);
  const acct = { ...guest, provider: 'email', email, display_name: displayName };
  return json({ ok: true, session, account: accountView(acct) });
};

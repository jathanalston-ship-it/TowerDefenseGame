// POST /api/account/reset — password reset in two steps, discriminated by body:
//   { action: 'request', email }                    → mint a single-use token (30 min TTL)
//   { action: 'confirm', token, newPassword }       → set the new password, revoke sessions
// Token DELIVERY rides the email seam (env.RESET_EMAIL_WEBHOOK — any provider that
// accepts a POST {to, token}). Unconfigured ⇒ 503 'email-not-configured' so the UI
// can say exactly why; the response NEVER reveals whether an email exists.

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { sha256Hex } from '../../lib/crypto';
import { isEmail, isSyncToken } from '../../lib/validate';
import { getAccountByEmail, hashPassword, nowSec, passwordProblem, randomToken, RESET_TTL_SEC } from '../../lib/accounts';

interface Body { action?: string; email?: string; token?: string; newPassword?: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  if (!(await rateLimit(env.DB, 'acct-reset', clientIp(request), { limit: 5, windowSec: 3600 }))) return err(429, 'rate-limited');
  const body = await readJson<Body>(request, 4_096);
  if (!body) return err(400, 'bad-request');

  if (body.action === 'request') {
    if (!isEmail(body.email)) return err(400, 'bad-request');
    if (!env.RESET_EMAIL_WEBHOOK) return err(503, 'email-not-configured');
    const acct = await getAccountByEmail(env, body.email.toLowerCase());
    if (acct && acct.provider !== 'guest') {
      const token = randomToken();
      const t = nowSec();
      await env.DB.prepare('INSERT INTO reset_tokens (token_hash, account_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
        .bind(await sha256Hex(token), acct.account_id, t, t + RESET_TTL_SEC).run();
      // Fire-and-forget delivery through the configured provider webhook.
      try {
        await fetch(env.RESET_EMAIL_WEBHOOK, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ to: acct.email, token }),
        });
      } catch { /* delivery failure must not distinguish this response */ }
    }
    return json({ ok: true }); // uniform: no account enumeration
  }

  if (body.action === 'confirm') {
    if (!isSyncToken(body.token)) return err(400, 'bad-request'); // reset tokens share the 64-hex shape
    const problem = passwordProblem(body.newPassword);
    if (problem) return err(400, problem);
    const hashKey = await sha256Hex(body.token);
    const row = await env.DB.prepare('SELECT account_id, expires_at FROM reset_tokens WHERE token_hash = ?1')
      .bind(hashKey).first<{ account_id: string; expires_at: number }>();
    if (!row || row.expires_at < nowSec()) return err(403, 'bad-token');
    const { hash, salt, iters } = await hashPassword(body.newPassword!);
    await env.DB.prepare('UPDATE accounts SET pass_hash = ?2, pass_salt = ?3, pass_iters = ?4 WHERE account_id = ?1')
      .bind(row.account_id, hash, salt, iters).run();
    await env.DB.prepare('DELETE FROM reset_tokens WHERE token_hash = ?1').bind(hashKey).run(); // single-use
    await env.DB.prepare('DELETE FROM sessions WHERE account_id = ?1').bind(row.account_id).run();
    return json({ ok: true });
  }

  return err(400, 'bad-action');
};

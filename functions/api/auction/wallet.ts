// POST /api/auction/wallet — market-wallet deposits and withdrawals, the game↔market Ichor
// boundary (docs/AUCTION-HOUSE.md §security). Deposits are CLIENT-ATTESTED (the client
// deducts save Ichor, then credits here) — the same documented trust posture as every other
// client-economy attestation; the audit + moderation lane watch the aggregates. Withdrawals
// are server-truth (proceeds live here first). Both are exactly-once by client op id
// (ledger PK), Turnstile-gated, and bounded.

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { verifyTurnstile } from '../../lib/turnstile';
import { isPlayerId } from '../../lib/validate';
import { HOST, authMarket, ensureWalletStmt, readWallet, runMoneyBatch } from '../../lib/auctionHost';

interface Body {
  playerId?: string;
  token?: string;
  session?: string;
  action?: 'deposit' | 'withdraw';
  amount?: number;
  opId?: string;
  turnstileToken?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'auction-wallet', ip, { limit: 12, windowSec: 3_600 }))) return err(429, 'rate-limited');

  const body = await readJson<Body>(request, 2_048);
  if (!body || !isPlayerId(body.playerId)) return err(400, 'bad-request');
  if (body.action !== 'deposit' && body.action !== 'withdraw') return err(400, 'bad-action');
  const amount = body.amount;
  if (!Number.isInteger(amount) || (amount as number) < 1 || (amount as number) > HOST.maxDeposit) return err(400, 'bad-amount');
  if (typeof body.opId !== 'string' || !/^[0-9a-f-]{8,64}$/.test(body.opId)) return err(400, 'bad-op');
  const now = Date.now();
  const auth = await authMarket(env, body.playerId, body.token ?? null, body.session ?? null, now);
  if (!auth.ok) return err(auth.status, auth.code);
  const turnstile = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, body.turnstileToken, ip);
  if (!turnstile.ok) return err(403, 'turnstile-failed');

  const signed = body.action === 'deposit' ? (amount as number) : -(amount as number);
  const opId = `wallet:${body.playerId}:${body.opId}`;
  const batch = await runMoneyBatch(env, [
    ensureWalletStmt(env, body.playerId, now),
    env.DB.prepare(
      `INSERT INTO market_wallet_ledger (op_id, player_id, kind, amount, at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(op_id) DO NOTHING`,
    ).bind(opId, body.playerId, body.action, signed, now),
    // Applied ONLY when the ledger row above inserted fresh (at = this request's clock):
    // a resubmit conflicts, reads a different `at`, and moves nothing — exactly-once.
    env.DB.prepare(
      `UPDATE market_wallets SET balance = balance + ?2,
         deposited_lifetime = deposited_lifetime + ?3, withdrawn_lifetime = withdrawn_lifetime + ?4,
         updated_at = ?5
       WHERE player_id = ?1 AND EXISTS (SELECT 1 FROM market_wallet_ledger WHERE op_id = ?6 AND at = ?5)`,
    ).bind(
      body.playerId, signed, body.action === 'deposit' ? amount : 0,
      body.action === 'withdraw' ? amount : 0, now, opId,
    ),
  ]);
  if (!batch.ok) return err(402, 'insufficient-funds');
  const duplicate = batch.results[1].meta.changes === 0;
  const wallet = await readWallet(env, body.playerId);
  return json({
    ok: true, duplicate,
    balance: wallet?.balance ?? 0, escrow: wallet?.escrow ?? 0,
    ...(body.action === 'withdraw' && !duplicate ? { withdrawn: amount } : {}),
  });
};

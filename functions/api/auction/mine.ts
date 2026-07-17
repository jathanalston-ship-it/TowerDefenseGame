// GET /api/auction/mine — the player's whole market position in one payload: wallet,
// active/recent listings, standing bids, recent trades, pending item deliveries/returns
// (with payloads to materialize), and recent ledger lines. The client store refreshes from
// this single call; /collect acks the pending items afterwards.

import type { Env } from '../../lib/env';
import { clientIp, err, json } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { isPlayerId } from '../../lib/validate';
import { authMarket, maintainMarket, readWallet, toPublicListing } from '../../lib/auctionHost';
import type { ListingRow } from '../../lib/auctionHost';

const LISTING_COLS = 'listing_id, global_item_id, family_key, category, rarity, seller_id, season, ask, buy_now, bid, bidder_id, ends_at, created_at, closed_at, state, fee_paid, authority';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'auction-mine', ip, { limit: 60, windowSec: 300 }))) return err(429, 'rate-limited');
  const url = new URL(request.url);
  const playerId = url.searchParams.get('playerId');
  if (!isPlayerId(playerId)) return err(400, 'bad-request');
  const now = Date.now();
  const auth = await authMarket(env, playerId, url.searchParams.get('token'), url.searchParams.get('session'), now);
  if (!auth.ok) return err(auth.status, auth.code);

  await maintainMarket(env, now);
  const [wallet, listings, bids, trades, pending, ledger] = await Promise.all([
    readWallet(env, playerId),
    env.DB.prepare(`SELECT ${LISTING_COLS} FROM market_listings WHERE seller_id = ?1 ORDER BY created_at DESC LIMIT 30`)
      .bind(playerId).all<ListingRow>(),
    env.DB.prepare(`SELECT ${LISTING_COLS} FROM market_listings WHERE bidder_id = ?1 AND state = 'active' ORDER BY ends_at LIMIT 30`)
      .bind(playerId).all<ListingRow>(),
    env.DB.prepare(
      'SELECT listing_id, global_item_id, family_key, seller_id, buyer_id, price, tax, authority, at FROM market_trades WHERE buyer_id = ?1 OR seller_id = ?1 ORDER BY at DESC LIMIT 20',
    ).bind(playerId).all(),
    env.DB.prepare(
      "SELECT global_item_id, ref_key, category, family_key, rarity, season, state, source, transfers, history, payload FROM market_items WHERE owner_id = ?1 AND state IN ('delivered', 'returned') LIMIT 50",
    ).bind(playerId).all(),
    env.DB.prepare(
      'SELECT op_id, kind, amount, at FROM market_wallet_ledger WHERE player_id = ?1 ORDER BY at DESC LIMIT 30',
    ).bind(playerId).all(),
  ]);
  return json({
    ok: true,
    serverNow: now,
    eligibility: { campaignStage: auth.campaignStage, accountAgeDays: auth.accountAgeDays },
    wallet: wallet
      ? { balance: wallet.balance, escrow: wallet.escrow, depositedLifetime: wallet.deposited_lifetime, withdrawnLifetime: wallet.withdrawn_lifetime }
      : { balance: 0, escrow: 0, depositedLifetime: 0, withdrawnLifetime: 0 },
    listings: listings.results.map(toPublicListing),
    bids: bids.results.map(toPublicListing),
    trades: trades.results,
    pendingItems: pending.results,
    ledger: ledger.results,
  });
};

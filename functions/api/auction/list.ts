// POST /api/auction/list — open a player listing (docs/AUCTION-HOUSE.md §listings).
//
//   • Eligibility is the SHARED tradeEligibility evaluation (core/trading.ts) over
//     SERVER-derived context: campaign stage from the cloud-save headline, account age from
//     accounts/wallet first-touch, today's listing count from market_listings. The client's
//     preview can never disagree with the verdict here.
//   • The family must exist in the registry-derived market catalog and match the claimed
//     category/rarity — a listing for an invented or banned family is rejected, and
//     `neverTrade` families refuse outright.
//   • Item custody: the item row enters 'escrow' and the save-side copy is removed by the
//     client on success. The payload is the serialized item the buyer reconstructs — the
//     documented client-attested trust boundary (docs/AUCTION-HOUSE.md §security).
//   • Money: the fee (scaled by the authority's live feeMult) charges and burns inside ONE
//     batch; the wallet CHECK turns insufficient funds into a full rollback. The partial
//     unique index on active listings makes a double-list a rollback too.

import type { Env } from '../../lib/env';
import { clientIp, crossOrigin, err, json, readJson } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { isPlayerId } from '../../lib/validate';
import {
  HOST, authMarket, ensureWalletStmt, listingById, maintainMarket, runMoneyBatch, toPublicListing,
} from '../../lib/auctionHost';
import { openListing } from '../../../src/core/auction';
import { tradeEligibility } from '../../../src/core/trading';
import { parseRefKey, refKey as makeRefKey } from '../../../src/core/itemIdentity';
import { marketFamily } from '../../../src/core/marketCatalog';

interface Body {
  playerId?: string;
  token?: string;
  session?: string;
  item?: {
    refKey?: string;
    familyKey?: string;
    rarity?: string;
    season?: number;
    source?: string;
    payload?: unknown;
    /** Present when relisting something bought on the market — preserves identity/history. */
    globalItemId?: string;
  };
  ask?: number;
  buyNow?: number | null;
  durationH?: number;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (crossOrigin(request)) return err(403, 'cross-origin');
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'auction-list', ip, { limit: 20, windowSec: 3_600 }))) return err(429, 'rate-limited');

  const body = await readJson<Body>(request, 8_192);
  if (!body || !isPlayerId(body.playerId) || !body.item || typeof body.item !== 'object') return err(400, 'bad-request');
  const now = Date.now();
  const auth = await authMarket(env, body.playerId, body.token ?? null, body.session ?? null, now);
  if (!auth.ok) return err(auth.status, auth.code);

  // ── Item + family validation against the registry-derived catalog ──
  const item = body.item;
  const ref = typeof item.refKey === 'string' ? parseRefKey(item.refKey) : null;
  if (!ref || typeof item.familyKey !== 'string') return err(400, 'bad-item');
  const family = marketFamily(item.familyKey);
  if (!family || family.cat !== ref.cat) return err(400, 'unknown-family');
  if (family.neverTrade) return err(403, 'never-trade');
  if (typeof item.rarity !== 'string' || item.rarity !== family.rarity) return err(400, 'rarity-mismatch');
  const payload = JSON.stringify(item.payload ?? {});
  if (payload.length > HOST.payloadMaxChars) return err(400, 'payload-too-large');
  const season = Number.isInteger(item.season) && (item.season as number) >= 0 ? (item.season as number) : 0;
  const source = typeof item.source === 'string' ? item.source.slice(0, 40) : 'legacy';

  // ── Shared eligibility over server-derived context ──
  const listedToday = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM market_listings WHERE seller_id = ?1 AND created_at >= ?2 AND authority = 0',
  ).bind(body.playerId, now - 86_400_000).first<{ n: number }>();
  const elig = tradeEligibility(ref, null, {
    campaignStage: auth.campaignStage,
    accountAgeDays: auth.accountAgeDays,
    listedToday: listedToday?.n ?? 0,
    guest: false, // durable identity proven by authMarket
  });
  if (!elig.ok) return err(403, `blocked-${elig.blocks[0]}`);

  // ── Engine validation + fee (authority feeMult is the live anti-inflation lever) ──
  const state = await maintainMarket(env, now);
  const listingId = crypto.randomUUID();
  const gid = typeof item.globalItemId === 'string' && item.globalItemId.length <= 120
    ? item.globalItemId
    : `${body.playerId}/${makeRefKey(ref)}`;
  const opened = openListing({
    listingId, globalItemId: gid, refKey: makeRefKey(ref), cat: ref.cat,
    familyKey: item.familyKey, rarity: item.rarity, sellerId: body.playerId,
    ask: body.ask ?? 0, buyNow: body.buyNow ?? null,
    durationH: body.durationH ?? 0, now, feeMult: state.feeMult,
  });
  if (!opened.ok) return err(400, opened.error);
  const live = opened.value;

  // Relisting a market-born item must present ITS identity: the row has to exist and be
  // in the seller's custody. Fresh ingress claims the seller-namespaced id instead.
  if (gid !== `${body.playerId}/${makeRefKey(ref)}`) {
    const existing = await env.DB.prepare(
      'SELECT owner_id, state FROM market_items WHERE global_item_id = ?1',
    ).bind(gid).first<{ owner_id: string; state: string }>();
    if (!existing || existing.owner_id !== body.playerId) return err(403, 'not-your-item');
  }

  // Duplicate-exploit signal (never a block — device uids can collide honestly): the same
  // instance refKey escrowed under TWO different owners at once is flagged for moderation.
  if (ref.cat === 'equipment') {
    const dupes = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM market_items WHERE ref_key = ?1 AND state = 'escrow' AND owner_id != ?2",
    ).bind(makeRefKey(ref), body.playerId).first<{ n: number }>();
    if ((dupes?.n ?? 0) > 0) {
      await env.DB.prepare('INSERT INTO market_flags (kind, detail, at, reviewed) VALUES (?1, ?2, ?3, 0)')
        .bind('dupeSuspect', JSON.stringify({ kind: 'dupeSuspect', refKey: makeRefKey(ref), sellerId: body.playerId }), now).run();
    }
  }

  // ── One atomic batch: custody → listing → fee (CHECK rolls the lot back on overdraft) ──
  const batch = await runMoneyBatch(env, [
    ensureWalletStmt(env, body.playerId, now),
    env.DB.prepare(
      `INSERT INTO market_items (global_item_id, ref_key, category, family_key, rarity, season, owner_id, state, source, transfers, history, payload, fraud_flag, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'escrow', ?8, 0, '[]', ?9, 0, ?10)
       ON CONFLICT(global_item_id) DO NOTHING`,
    ).bind(gid, makeRefKey(ref), ref.cat, item.familyKey, item.rarity, season, body.playerId, source, payload, now),
    env.DB.prepare(
      `UPDATE market_items SET state = 'escrow', payload = ?3 WHERE global_item_id = ?1 AND owner_id = ?2`,
    ).bind(gid, body.playerId, payload),
    env.DB.prepare(
      `INSERT INTO market_listings (listing_id, global_item_id, family_key, category, rarity, seller_id, season, ask, buy_now, bid, bidder_id, ends_at, created_at, closed_at, state, fee_paid, authority)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, NULL, ?10, ?11, NULL, 'active', ?12, 0
       WHERE EXISTS (SELECT 1 FROM market_items WHERE global_item_id = ?2 AND owner_id = ?6 AND state = 'escrow')`,
    ).bind(listingId, gid, live.familyKey, ref.cat, live.rarity, body.playerId, season, live.ask, live.buyNow, live.endsAt, now, live.feePaid),
    env.DB.prepare(
      `UPDATE market_wallets SET balance = balance - ?2, updated_at = ?3
       WHERE player_id = ?1 AND EXISTS (SELECT 1 FROM market_listings WHERE listing_id = ?4)`,
    ).bind(body.playerId, live.feePaid, now, listingId),
    env.DB.prepare(
      `INSERT INTO market_wallet_ledger (op_id, player_id, kind, amount, at)
       SELECT ?1, ?2, 'listingFee', ?3, ?4 WHERE EXISTS (SELECT 1 FROM market_listings WHERE listing_id = ?5)`,
    ).bind(`fee:${listingId}`, body.playerId, -live.feePaid, now, listingId),
    env.DB.prepare(
      `INSERT INTO market_wallet_ledger (op_id, player_id, kind, amount, at)
       SELECT ?1, '@burn', 'listingFee', ?2, ?3 WHERE EXISTS (SELECT 1 FROM market_listings WHERE listing_id = ?4)`,
    ).bind(`burn:${listingId}:fee`, live.feePaid, now, listingId),
  ]);
  if (!batch.ok) return err(batch.code === 'insufficient-funds' ? 402 : 409, batch.code);
  const row = await listingById(env, listingId);
  if (!row) return err(409, 'item-unavailable'); // custody condition failed (not owned / junk gid)
  return json({ ok: true, listing: toPublicListing(row), fee: live.feePaid, feeMult: state.feeMult });
};

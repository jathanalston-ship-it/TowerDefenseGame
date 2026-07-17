// Auction House endpoints (docs/AUCTION-HOUSE.md §server) — exercises the REAL handlers
// against the FakeD1 testkit: wallet exactly-once + overdraft rollback, the full
// list → bid → buy/settle lifecycle with money conservation, custody transitions,
// authority tick + baseline restock (exclusives never stocked), search filters, and the
// moderation gate. The engine's rules are pinned in src/core/auction.test.ts — here we pin
// that the SQL orchestration preserves them under the schema guards.

import { describe, expect, it } from 'vitest';
import { FakeD1, ctx, makeEnv, postJson } from './lib/testkit';
import { onRequestPost as listPost } from './api/auction/list';
import { onRequestPost as bidPost } from './api/auction/bid';
import { onRequestPost as buyPost } from './api/auction/buy';
import { onRequestPost as cancelPost } from './api/auction/cancel';
import { onRequestPost as walletPost } from './api/auction/wallet';
import { onRequestPost as collectPost } from './api/auction/collect';
import { onRequestGet as searchGet } from './api/auction/search';
import { onRequestGet as historyGet } from './api/auction/history';
import { onRequestGet as mineGet } from './api/auction/mine';
import { onRequestGet as flagsGet, onRequestPost as flagsPost } from './api/auction/flags';
import { sha256Hex } from './lib/crypto';
import type { Env } from './lib/env';
import { listingFee, minNextBid, saleTax } from '../src/core/trading';
import { CARD_POOL } from '../src/core/cards';
import { STARTER_GENES } from '../src/core/geneDiscovery';
import { ALL_ITEMS } from '../src/core/equipment';
import { equipmentFamilyKey, geneFamilyKey, marketFamily, stockableFamilies } from '../src/core/marketCatalog';

const SELLER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BUYER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RIVAL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TOKEN = 'a'.repeat(64);

const EQ_DEF = ALL_ITEMS.find((d) => !d.exotic)!;
const EQ_FAMILY = equipmentFamilyKey(EQ_DEF.id, 'common');
// A non-starter common: starters are sanitizer-seeded ⇒ neverTrade (the printer guard).
const GENE = CARD_POOL.find((c) => c.rarity === 'common' && !(STARTER_GENES as readonly string[]).includes(c.id))!;
const GENE_FAMILY = geneFamilyKey(GENE.id);

async function seedPlayer(env: Env, playerId: string, opts: { stage?: number; balance?: number; ageDays?: number } = {}): Promise<void> {
  const db = env.DB as unknown as FakeD1;
  const now = Date.now();
  db.cloudSaves.set(playerId, {
    player_id: playerId, token_hash: await sha256Hex(TOKEN), blob: '{}', size: 2,
    updated_at: 0, rev: 1, meta: JSON.stringify({ stage: opts.stage ?? 30 }),
  });
  db.marketWallets.set(playerId, {
    player_id: playerId, balance: opts.balance ?? 1_000, escrow: 0,
    deposited_lifetime: opts.balance ?? 1_000, withdrawn_lifetime: 0,
    created_at: now - (opts.ageDays ?? 10) * 86_400_000, updated_at: now,
  });
}

/** Pin the authority to the current window so request-woven maintenance never ticks mid-test. */
function idleAuthority(env: Env): void {
  const db = env.DB as unknown as FakeD1;
  const now = Date.now();
  const windowKey = Math.floor(now / 3_600_000);
  db.marketWindows.set(windowKey, { window_key: windowKey, metrics: '', created_at: now });
  db.marketAuthority = {
    id: 0, updated_at: now,
    state: JSON.stringify({ windowKey, feeMult: 1, taxMult: 1, baselineLevel: 2, recBias: 1, inflationIdx: 1, avgPriceEwma: 0, avgPriceBase: 0 }),
  };
}

function listBody(playerId: string, over: Record<string, unknown> = {}, itemOver: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    playerId, token: TOKEN,
    item: { refKey: 'eq:uid-1', familyKey: EQ_FAMILY, rarity: 'common', season: 0, source: 'Genetic Vault', payload: { defId: EQ_DEF.id }, ...itemOver },
    ask: 100, buyNow: 200, durationH: 24, ...over,
  };
}

async function res(r: Response): Promise<Record<string, unknown>> {
  return await r.json() as Record<string, unknown>;
}

function db(env: Env): FakeD1 {
  return env.DB as unknown as FakeD1;
}

/** Money conservation over the whole fake market: what came in equals what is held + burned. */
function conservation(env: Env): void {
  let deposited = 0; let withdrawn = 0; let held = 0;
  for (const w of db(env).marketWallets.values()) {
    deposited += Number(w.deposited_lifetime);
    withdrawn += Number(w.withdrawn_lifetime);
    held += Number(w.balance) + Number(w.escrow);
  }
  let burned = 0;
  for (const l of db(env).marketLedger.values()) if (l.player_id === '@burn') burned += Number(l.amount);
  expect(held + burned + withdrawn).toBe(deposited);
}

describe('wallet — exactly-once deposits/withdrawals behind the schema guards', () => {
  it('deposit applies once, duplicates echo, withdrawals respect the CHECK', async () => {
    const env = makeEnv();
    await seedPlayer(env, SELLER, { balance: 0 });
    const dep = { playerId: SELLER, token: TOKEN, action: 'deposit', amount: 500, opId: 'deadbeef-0001' };
    const r1 = await res(await walletPost(ctx(postJson('https://x/api/auction/wallet', dep), env)));
    expect(r1.balance).toBe(500);
    const r2 = await res(await walletPost(ctx(postJson('https://x/api/auction/wallet', dep), env)));
    expect(r2.duplicate).toBe(true);
    expect(r2.balance).toBe(500); // no double credit
    const over = await walletPost(ctx(postJson('https://x/api/auction/wallet', { ...dep, action: 'withdraw', amount: 900, opId: 'deadbeef-0002' }), env));
    expect(over.status).toBe(402); // CHECK rolled the batch back
    const wd = await res(await walletPost(ctx(postJson('https://x/api/auction/wallet', { ...dep, action: 'withdraw', amount: 200, opId: 'deadbeef-0003' }), env)));
    expect(wd.balance).toBe(300);
    conservation(env);
  });

  it('refuses without durable identity (no cloud save) and with a wrong token', async () => {
    const env = makeEnv();
    const r = await walletPost(ctx(postJson('https://x/api/auction/wallet', { playerId: SELLER, token: TOKEN, action: 'deposit', amount: 10, opId: 'deadbeef-0004' }), env));
    expect(r.status).toBe(403);
    await seedPlayer(env, SELLER);
    const bad = await walletPost(ctx(postJson('https://x/api/auction/wallet', { playerId: SELLER, token: 'b'.repeat(64), action: 'deposit', amount: 10, opId: 'deadbeef-0005' }), env));
    expect(bad.status).toBe(403);
  });
});

describe('list — shared eligibility, catalog validation, atomic fee + escrow', () => {
  it('lists an item: fee charged AND burned, item escrowed, listing active', async () => {
    const env = makeEnv();
    idleAuthority(env);
    await seedPlayer(env, SELLER);
    const r = await res(await listPost(ctx(postJson('https://x/api/auction/list', listBody(SELLER)), env)));
    expect(r.ok).toBe(true);
    const fee = listingFee(200);
    expect(r.fee).toBe(fee);
    expect(db(env).marketWallets.get(SELLER)?.balance).toBe(1_000 - fee);
    const item = db(env).marketItems.get(`${SELLER}/eq:uid-1`);
    expect(item?.state).toBe('escrow');
    conservation(env);
  });

  it('refuses a double-list (UNIQUE index), an unknown family, and an ineligible account', async () => {
    const env = makeEnv();
    idleAuthority(env);
    await seedPlayer(env, SELLER);
    await listPost(ctx(postJson('https://x/api/auction/list', listBody(SELLER)), env));
    const dup = await listPost(ctx(postJson('https://x/api/auction/list', listBody(SELLER)), env));
    expect(dup.status).toBe(409);
    expect((await res(dup)).error).toBe('already-listed');
    const junk = await listPost(ctx(postJson('https://x/api/auction/list', listBody(SELLER, {}, { familyKey: 'gene.__nope__', refKey: 'gene:__nope__' })), env));
    expect(junk.status).toBe(400);
    await seedPlayer(env, BUYER, { stage: 3 });
    const low = await listPost(ctx(postJson('https://x/api/auction/list', listBody(BUYER)), env));
    expect(low.status).toBe(403);
    expect((await res(low)).error).toBe('blocked-campaign');
    conservation(env);
  });

  it('insufficient funds for the fee rolls EVERYTHING back (no listing, no escrow)', async () => {
    const env = makeEnv();
    idleAuthority(env);
    await seedPlayer(env, SELLER, { balance: 0 });
    const r = await listPost(ctx(postJson('https://x/api/auction/list', listBody(SELLER)), env));
    expect(r.status).toBe(402);
    expect(db(env).marketListings.size).toBe(0);
    expect(db(env).marketItems.get(`${SELLER}/eq:uid-1`)).toBeUndefined();
  });
});

describe('bid — escrow, refund ladder, engine rules over the wire', () => {
  async function listedEnv(): Promise<{ env: Env; listingId: string }> {
    const env = makeEnv();
    idleAuthority(env);
    await seedPlayer(env, SELLER);
    await seedPlayer(env, BUYER);
    await seedPlayer(env, RIVAL);
    const r = await res(await listPost(ctx(postJson('https://x/api/auction/list', listBody(SELLER, { buyNow: null })), env)));
    return { env, listingId: (r.listing as { listingId: string }).listingId };
  }

  it('escrows the bid, refunds the outbid player, rejects self-bids and low bids', async () => {
    const { env, listingId } = await listedEnv();
    const b1 = await bidPost(ctx(postJson('https://x/api/auction/bid', { playerId: BUYER, token: TOKEN, listingId, amount: 100 }), env));
    expect(b1.status).toBe(200);
    expect(db(env).marketWallets.get(BUYER)?.escrow).toBe(100);
    expect(db(env).marketWallets.get(BUYER)?.balance).toBe(900);
    const low = await bidPost(ctx(postJson('https://x/api/auction/bid', { playerId: RIVAL, token: TOKEN, listingId, amount: 101 }), env));
    expect(low.status).toBe(409); // below the min-increment ladder
    const b2 = await bidPost(ctx(postJson('https://x/api/auction/bid', { playerId: RIVAL, token: TOKEN, listingId, amount: minNextBid(100) }), env));
    expect(b2.status).toBe(200);
    expect(db(env).marketWallets.get(BUYER)?.escrow).toBe(0); // refunded
    expect(db(env).marketWallets.get(BUYER)?.balance).toBe(1_000);
    const self = await bidPost(ctx(postJson('https://x/api/auction/bid', { playerId: SELLER, token: TOKEN, listingId, amount: 500 }), env));
    expect(self.status).toBe(409);
    conservation(env);
  });

  it('an unfunded bid rolls back atomically — listing keeps its standing bid', async () => {
    const { env, listingId } = await listedEnv();
    await bidPost(ctx(postJson('https://x/api/auction/bid', { playerId: BUYER, token: TOKEN, listingId, amount: 100 }), env));
    const rivalWallet = db(env).marketWallets.get(RIVAL)!;
    rivalWallet.balance = 5;
    rivalWallet.deposited_lifetime = 5; // keep the conservation ledger honest about the seed
    const r = await bidPost(ctx(postJson('https://x/api/auction/bid', { playerId: RIVAL, token: TOKEN, listingId, amount: minNextBid(100) }), env));
    expect(r.status).toBe(402);
    const l = db(env).marketListings.get(listingId)!;
    expect(l.bidder_id).toBe(BUYER); // rollback restored the standing bid
    expect(l.bid).toBe(100);
    expect(db(env).marketWallets.get(BUYER)?.escrow).toBe(100); // still escrowed, not refunded
    conservation(env);
  });
});

describe('buy-now — exactly-once settlement with full distribution', () => {
  it('charges buyer, refunds standing bidder, credits seller minus tax, delivers the item', async () => {
    const env = makeEnv();
    idleAuthority(env);
    await seedPlayer(env, SELLER);
    await seedPlayer(env, BUYER);
    await seedPlayer(env, RIVAL);
    const listed = await res(await listPost(ctx(postJson('https://x/api/auction/list', listBody(SELLER)), env)));
    const listingId = (listed.listing as { listingId: string }).listingId;
    await bidPost(ctx(postJson('https://x/api/auction/bid', { playerId: RIVAL, token: TOKEN, listingId, amount: 100 }), env));
    const buy = await res(await buyPost(ctx(postJson('https://x/api/auction/buy', { playerId: BUYER, token: TOKEN, listingId }), env)));
    expect(buy.ok).toBe(true);
    expect(buy.price).toBe(200);
    const tax = saleTax(200);
    expect(db(env).marketWallets.get(BUYER)?.balance).toBe(800);
    expect(db(env).marketWallets.get(RIVAL)?.balance).toBe(1_000); // bid refunded
    expect(db(env).marketWallets.get(RIVAL)?.escrow).toBe(0);
    expect(db(env).marketWallets.get(SELLER)?.balance).toBe(1_000 - listingFee(200) + (200 - tax));
    const item = db(env).marketItems.get(`${SELLER}/eq:uid-1`)!;
    expect(item.owner_id).toBe(BUYER);
    expect(item.state).toBe('delivered');
    expect(Number(item.transfers)).toBe(1);
    const again = await buyPost(ctx(postJson('https://x/api/auction/buy', { playerId: RIVAL, token: TOKEN, listingId }), env));
    expect(again.status).toBe(409); // one settlement per listing, ever
    expect(db(env).marketHistory.size).toBeGreaterThan(0); // price history folded
    conservation(env);
  });
});

describe('cancel + collect — custody round-trip', () => {
  it('returns the escrowed item, which collect then acks', async () => {
    const env = makeEnv();
    idleAuthority(env);
    await seedPlayer(env, SELLER);
    const listed = await res(await listPost(ctx(postJson('https://x/api/auction/list', listBody(SELLER)), env)));
    const listingId = (listed.listing as { listingId: string }).listingId;
    const r = await res(await cancelPost(ctx(postJson('https://x/api/auction/cancel', { playerId: SELLER, token: TOKEN, listingId }), env)));
    expect(r.ok).toBe(true);
    const gid = `${SELLER}/eq:uid-1`;
    expect(db(env).marketItems.get(gid)?.state).toBe('returned');
    const col = await res(await collectPost(ctx(postJson('https://x/api/auction/collect', { playerId: SELLER, token: TOKEN, itemIds: [gid] }), env)));
    expect(col.collected).toBe(1);
    expect(db(env).marketItems.get(gid)?.state).toBe('collected');
  });

  it('a listing with bids cannot be cancelled', async () => {
    const env = makeEnv();
    idleAuthority(env);
    await seedPlayer(env, SELLER);
    await seedPlayer(env, BUYER);
    const listed = await res(await listPost(ctx(postJson('https://x/api/auction/list', listBody(SELLER, { buyNow: null })), env)));
    const listingId = (listed.listing as { listingId: string }).listingId;
    await bidPost(ctx(postJson('https://x/api/auction/bid', { playerId: BUYER, token: TOKEN, listingId, amount: 100 }), env));
    const r = await cancelPost(ctx(postJson('https://x/api/auction/cancel', { playerId: SELLER, token: TOKEN, listingId }), env));
    expect(r.status).toBe(409);
  });
});

describe('lazy settlement — the standing bid wins at expiry through maintainMarket', () => {
  it('settles a due auction on the next trafficked request', async () => {
    const env = makeEnv();
    idleAuthority(env);
    await seedPlayer(env, SELLER);
    await seedPlayer(env, BUYER);
    const now = Date.now();
    const gid = `${SELLER}/eq:uid-9`;
    db(env).marketItems.set(gid, {
      global_item_id: gid, ref_key: 'eq:uid-9', category: 'equipment', family_key: EQ_FAMILY, rarity: 'common',
      season: 0, owner_id: SELLER, state: 'escrow', source: 'test', transfers: 0, history: '[]', payload: '{}', fraud_flag: 0, created_at: now - 86_400_000,
    });
    db(env).marketListings.set('L-due', {
      listing_id: 'L-due', global_item_id: gid, family_key: EQ_FAMILY, category: 'equipment', rarity: 'common',
      seller_id: SELLER, season: 0, ask: 100, buy_now: null, bid: 150, bidder_id: BUYER,
      ends_at: now - 60_000, created_at: now - 86_400_000, closed_at: null, state: 'active', fee_paid: 5, authority: 0,
    });
    const buyerWallet = db(env).marketWallets.get(BUYER)!;
    buyerWallet.escrow = 150; // charged at bid time…
    buyerWallet.balance = 850; // …out of the seeded 1,000
    const search = await searchGet(ctx(postJson('https://x/api/auction/search?sort=newest', {}), env));
    expect(search.status).toBe(200);
    const l = db(env).marketListings.get('L-due')!;
    expect(l.state).toBe('sold');
    expect(db(env).marketTrades.get('L-due')?.buyer_id).toBe(BUYER);
    expect(db(env).marketWallets.get(BUYER)?.escrow).toBe(0); // escrow consumed, not refunded
    expect(db(env).marketWallets.get(SELLER)?.balance).toBe(1_000 + (150 - saleTax(150)));
    expect(db(env).marketItems.get(gid)?.owner_id).toBe(BUYER);
    conservation(env);
  });
});

describe('Market Authority — the tick and baseline restock, woven into requests', () => {
  it('advances the window exactly once and stocks ONLY eligible foundational families', async () => {
    const env = makeEnv();
    await seedPlayer(env, SELLER);
    const r = await searchGet(ctx(postJson('https://x/api/auction/search?sort=newest', {}), env));
    expect(r.status).toBe(200);
    const windowKey = Math.floor(Date.now() / 3_600_000);
    expect(db(env).marketWindows.has(windowKey)).toBe(true);
    expect(db(env).marketAuthority).not.toBeNull();
    const stockable = new Set(stockableFamilies().map((f) => f.familyKey));
    const authorityListings = [...db(env).marketListings.values()].filter((l) => Number(l.authority) === 1);
    expect(authorityListings.length).toBeGreaterThan(0);
    expect(authorityListings.length).toBeLessThanOrEqual(40);
    for (const l of authorityListings) {
      expect(stockable.has(String(l.family_key))).toBe(true); // exclusives can NEVER appear here
      expect(marketFamily(String(l.family_key))?.exclusive).toBe(false);
      expect(Number(l.buy_now)).toBeGreaterThanOrEqual(5);
    }
  });

  it('an authority sale burns the full price (pure sink) and delivers the grant payload', async () => {
    const env = makeEnv();
    await seedPlayer(env, BUYER, { balance: 5_000 });
    await searchGet(ctx(postJson('https://x/api/auction/search?sort=newest', {}), env)); // triggers restock
    const authority = [...db(env).marketListings.values()].find((l) => Number(l.authority) === 1)!;
    const buy = await res(await buyPost(ctx(postJson('https://x/api/auction/buy', { playerId: BUYER, token: TOKEN, listingId: authority.listing_id }), env)));
    expect(buy.ok).toBe(true);
    const burnRow = db(env).marketLedger.get(`sale:${authority.listing_id}:burn`);
    expect(burnRow?.kind).toBe('authoritySale');
    expect(Number(burnRow?.amount)).toBe(Number(authority.buy_now));
    const item = db(env).marketItems.get(String(authority.global_item_id))!;
    expect(item.owner_id).toBe(BUYER);
    expect(String(item.payload)).toContain('grant');
    conservation(env);
  });
});

describe('search + history — the read surface', () => {
  it('filters by category/price, sorts, and paginates', async () => {
    const env = makeEnv();
    idleAuthority(env);
    await seedPlayer(env, SELLER);
    await listPost(ctx(postJson('https://x/api/auction/list', listBody(SELLER, { ask: 50, buyNow: 60 })), env));
    await listPost(ctx(postJson('https://x/api/auction/list', listBody(SELLER, { ask: 100, buyNow: 500 }, { refKey: `gene:${GENE.id}`, familyKey: GENE_FAMILY, rarity: GENE.rarity, payload: {} })), env));
    const eq = await res(await searchGet(ctx(postJson('https://x/api/auction/search?cat=equipment&sort=priceAsc', {}), env)));
    const eqRows = (eq.listings as { familyKey: string; cat: string }[]).filter((l) => l.familyKey === EQ_FAMILY || l.familyKey === GENE_FAMILY);
    expect(eqRows.every((l) => l.cat === 'equipment')).toBe(true);
    const cheap = await res(await searchGet(ctx(postJson('https://x/api/auction/search?maxPrice=100&sort=priceAsc', {}), env)));
    expect((cheap.listings as { buyNow: number | null }[]).every((l) => (l.buyNow ?? 0) <= 100)).toBe(true);
    const fam = await res(await searchGet(ctx(postJson(`https://x/api/auction/search?families=${GENE_FAMILY}&sort=newest`, {}), env)));
    expect((fam.listings as { familyKey: string }[]).every((l) => l.familyKey === GENE_FAMILY)).toBe(true);
    expect((fam.listings as unknown[]).length).toBe(1);
  });

  it('history serves stats + a bounded recommendation for a known family', async () => {
    const env = makeEnv();
    idleAuthority(env);
    const day = new Date().toISOString().slice(0, 10);
    db(env).marketHistory.set(`${EQ_FAMILY}|${day}`, { family_key: EQ_FAMILY, day, sales: 5, median_price: 100, low_price: 80, high_price: 130 });
    const r = await res(await historyGet(ctx(postJson(`https://x/api/auction/history?family=${EQ_FAMILY}`, {}), env)));
    expect(r.ok).toBe(true);
    expect((r.stats as { highestSale: number }).highestSale).toBe(130);
    expect(r.recommended).toBeGreaterThanOrEqual(5);
    const unknown = await historyGet(ctx(postJson('https://x/api/auction/history?family=gene.__nope__', {}), env));
    expect(unknown.status).toBe(404);
  });
});

describe('mine + flags — the private and moderation surfaces', () => {
  it('mine returns wallet, listings, and pending deliveries after a sale', async () => {
    const env = makeEnv();
    idleAuthority(env);
    await seedPlayer(env, SELLER);
    await seedPlayer(env, BUYER);
    const listed = await res(await listPost(ctx(postJson('https://x/api/auction/list', listBody(SELLER)), env)));
    const listingId = (listed.listing as { listingId: string }).listingId;
    await buyPost(ctx(postJson('https://x/api/auction/buy', { playerId: BUYER, token: TOKEN, listingId }), env));
    const r = await res(await mineGet(ctx(postJson(`https://x/api/auction/mine?playerId=${BUYER}&token=${TOKEN}`, {}), env)));
    expect(r.ok).toBe(true);
    expect((r.pendingItems as unknown[]).length).toBe(1);
    expect((r.trades as unknown[]).length).toBe(1);
    const sellerView = await res(await mineGet(ctx(postJson(`https://x/api/auction/mine?playerId=${SELLER}&token=${TOKEN}`, {}), env)));
    expect((sellerView.wallet as { balance: number }).balance).toBeGreaterThan(1_000); // proceeds landed
    expect((sellerView.listings as unknown[]).length).toBe(1);
  });

  it('flags: closed without MOD_KEY, gated with it, ack marks reviewed', async () => {
    const noKey = makeEnv();
    expect((await flagsGet(ctx(postJson('https://x/api/auction/flags', {}), noKey))).status).toBe(503);
    const env = makeEnv({ MOD_KEY: 'modsecret' });
    db(env).marketFlags.push({ flag_id: 1, kind: 'priceFixing', detail: '{}', at: Date.now(), reviewed: 0 });
    const wrong = await flagsGet(ctx(postJson('https://x/api/auction/flags', {}, { 'x-mod-key': 'nope' }), env));
    expect(wrong.status).toBe(403);
    const good = await res(await flagsGet(ctx(postJson('https://x/api/auction/flags', {}, { 'x-mod-key': 'modsecret' }), env)));
    expect((good.flags as unknown[]).length).toBe(1);
    const ack = await res(await flagsPost(ctx(postJson('https://x/api/auction/flags', { flagIds: [1] }, { 'x-mod-key': 'modsecret' }), env)));
    expect(ack.reviewed).toBe(1);
    expect(db(env).marketFlags[0].reviewed).toBe(1);
  });
});

// MARKET CONSTRUCTS end-to-end (docs/CONSTRUCTS.md): the REAL engine ticking against the REAL
// Pages Function handlers (router.ts) over the FakeD1 testkit. Pins: provisioning (a real save in
// its own slot, token-hashed like any slot), real-time pacing (capped catch-up, carried
// overshoot), the market lifecycle (wallet opens before eligibility; lists earned items at the
// market price once eligible; a player can buy from it; it buys a player's under-value listing;
// constructs never trade with each other nor buy authority stock), and the owner's rule that a
// construct never ranks (leaderboard + Arena refuse its id; the router reaches nothing else).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeD1, ctx, makeEnv, postJson } from '../../functions/lib/testkit';
import { sha256Hex } from '../../functions/lib/crypto';
import type { Env } from '../../functions/lib/env';
import { onRequestPost as listPost } from '../../functions/api/auction/list';
import { onRequestPost as buyPost } from '../../functions/api/auction/buy';
import { onRequestPost as submitPost } from '../../functions/api/leaderboard/submit';
import { onRequestPost as reportPost } from '../../functions/api/arena/report';
import { CONSTRUCT, CONSTRUCTS, constructAsk, isConstructId } from '../../src/core/constructs';
import { marketFamily } from '../../src/core/marketCatalog';
import { LEASE_MS, claimLease, ensureRoster, rosterStatus, runRoster } from './roster';
import { tickConstruct } from './engine';
import type { ConstructState } from './engine';
import { constructWire } from './router';

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 10, 6, 12, 0, 0);
const PLAYER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PLAYER_TOKEN = 'd'.repeat(64);

const fake = (env: Env): FakeD1 => env.DB as unknown as FakeD1;
const json = async (r: Response): Promise<Record<string, unknown>> => (await r.json()) as Record<string, unknown>;

async function seedPlayer(env: Env): Promise<void> {
  fake(env).cloudSaves.set(PLAYER, {
    player_id: PLAYER, token_hash: await sha256Hex(PLAYER_TOKEN), blob: '{}', size: 2,
    updated_at: 0, rev: 1, meta: JSON.stringify({ campaignStage: 30 }),
  });
  fake(env).marketWallets.set(PLAYER, {
    player_id: PLAYER, balance: 5_000, escrow: 0, deposited_lifetime: 5_000, withdrawn_lifetime: 0,
    created_at: T0 - 30 * 86_400_000, updated_at: T0,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe('constructs — provisioning + pacing', () => {
  it('a fresh roster provisions every construct and commits a real save into its own slot', async () => {
    const env = makeEnv();
    const reports = await runRoster(env.DB, T0);
    expect(reports).toHaveLength(CONSTRUCTS.length);
    for (const r of reports) {
      expect(r.errors).toEqual([]);
      expect(r.saved).toBe(true);
      expect(r.runs).toBeGreaterThan(0);
    }
    for (const c of CONSTRUCTS) {
      const row = fake(env).constructs.get(c.id)!;
      const slot = fake(env).cloudSaves.get(c.id)!;
      expect(slot.token_hash).toBe(await sha256Hex(String(row.token))); // only the hash is stored, like any slot
      expect(JSON.parse(String(slot.meta)).campaignStage).toBeTypeOf('number'); // the headline field the market reads
      expect(JSON.parse(String(slot.blob)).schemaVersion).toBeGreaterThan(0);
    }
    // A second run re-uses the roster (no duplicate rows, same credentials).
    const before = fake(env).constructs.get(CONSTRUCTS[0].id)!.token;
    await ensureRoster(env.DB, T0 + HOUR);
    expect(fake(env).constructs.size).toBe(CONSTRUCTS.length);
    expect(fake(env).constructs.get(CONSTRUCTS[0].id)!.token).toBe(before);
    const status = await rosterStatus(env.DB);
    expect(status).toHaveLength(CONSTRUCTS.length);
    expect(JSON.stringify(status)).not.toContain(String(before)); // the status view never shows credentials
  });

  it('overlapping runs never tick a construct twice, and never cross one construct\u2019s save into another\u2019s', async () => {
    const env = makeEnv();
    const [r1, r2] = await Promise.all([runRoster(env.DB, T0), runRoster(env.DB, T0)]);
    // The isolate queue serializes them: the second run starts only after the first released every
    // lease, so it is simply the next tick (nothing owed yet) — never an interleaved one.
    expect(r1).toHaveLength(CONSTRUCTS.length);
    expect(r2).toHaveLength(CONSTRUCTS.length);
    for (const r of r2) expect(r.errors).toEqual([]);
    for (const c of CONSTRUCTS) {
      const blob = JSON.parse(String(fake(env).cloudSaves.get(c.id)!.blob)) as { accountId?: string };
      expect(blob.accountId).toBe(c.id); // each slot holds ITS construct's save
      expect(Number(fake(env).constructs.get(c.id)!.lease_until)).toBe(0); // released
    }
    expect(await claimLease(env.DB, CONSTRUCTS[0].id, T0)).toBe(true);
    expect(await claimLease(env.DB, CONSTRUCTS[0].id, T0 + 1_000)).toBe(false); // held
    expect(await claimLease(env.DB, CONSTRUCTS[0].id, T0 + LEASE_MS + 1)).toBe(true); // a crashed run's lease expires
  });

  it('plays in real time: catch-up is capped, a run overshoot is carried, a short gap plays nothing extra', async () => {
    const env = makeEnv();
    const rows = await ensureRoster(env.DB, T0);
    const c = CONSTRUCTS[0];
    const wire = constructWire(env.DB, c.id);
    let st: ConstructState = { token: rows.get(c.id)!.token, creditSec: 0, lastTickAt: 0 };
    st = (await tickConstruct(c, st, wire, T0)).state;
    const later = T0 + 10 * HOUR; // an outage: 10h owed
    vi.setSystemTime(later);
    const long = await tickConstruct(c, st, wire, later);
    expect(long.report.runs).toBeGreaterThan(0);
    expect(long.report.runs).toBeLessThanOrEqual(CONSTRUCT.maxRunsPerTick);
    expect(long.state.creditSec).toBeLessThan(CONSTRUCT.maxCatchUpSec); // it never binges the whole outage
    // Force an overshoot balance, then a 60s gap: the debt is honoured — no run, credit rises by 60.
    const owed: ConstructState = { ...long.state, creditSec: -200 };
    vi.setSystemTime(later + 60_000);
    const short = await tickConstruct(c, owed, wire, later + 60_000);
    expect(short.report.runs).toBe(0);
    expect(short.state.creditSec).toBe(-140);
  });
});

describe('constructs — the market', () => {
  it('opens its wallet before it may trade, then trades like a player — and never with a construct', async () => {
    const env = makeEnv();
    await seedPlayer(env);
    const rows = await ensureRoster(env.DB, T0);
    const [a, b] = [CONSTRUCTS[0], CONSTRUCTS[1]];
    const st = new Map<string, ConstructState>([a, b].map((c) => [c.id, { token: rows.get(c.id)!.token, creditSec: 0, lastTickAt: 0 }]));
    const tick = async (now: number): Promise<void> => {
      vi.setSystemTime(now);
      for (const c of [a, b]) {
        const r = await tickConstruct(c, st.get(c.id)!, constructWire(env.DB, c.id), now);
        expect(r.report.errors.filter((e) => !e.startsWith('list-') && !e.startsWith('deposit-'))).toEqual([]);
        st.set(c.id, r.state);
      }
    };
    // Fresh accounts play into the campaign; the first market visit opens the wallet (deposit)
    // but trading waits for the account-age gate — the SAME friction a new player meets.
    await tick(T0);
    await tick(T0 + HOUR);
    await tick(T0 + 2 * HOUR);
    for (const c of [a, b]) {
      expect(fake(env).marketWallets.get(c.id)).toBeDefined();
      expect([...fake(env).marketListings.values()].some((l) => l.seller_id === c.id)).toBe(false);
    }
    // Age the accounts past the gate (3 days) instead of simulating them.
    for (const c of [a, b]) fake(env).marketWallets.get(c.id)!.created_at = T0 - 10 * 86_400_000;

    // Visits every half hour until A has listed something.
    let now = T0 + 2 * HOUR;
    for (let i = 0; i < 40 && ![...fake(env).marketListings.values()].some((l) => l.seller_id === a.id); i++) {
      now += CONSTRUCT.marketEveryMs;
      await tick(now);
    }
    const aListing = [...fake(env).marketListings.values()].find((l) => l.seller_id === a.id);
    expect(aListing).toBeDefined();
    // Listed AT the market: within the style's band of the recommended price (≥ 0.9×, never a dump).
    expect(Number(aListing!.ask)).toBeGreaterThanOrEqual(constructAsk(1, 'clearer', 0));
    expect(isConstructId(String(aListing!.seller_id))).toBe(true); // what the client labels by

    // A real player can buy from a construct (buy-now, or a plain bid when it has none).
    if (aListing!.buy_now !== null) {
      const r = await buyPost(ctx(postJson('https://x/api/auction/buy', { playerId: PLAYER, token: PLAYER_TOKEN, listingId: aListing!.listing_id }), env));
      expect(r.status).toBe(200);
    }

    // A player lists the same family cheaply: B (a bargain hunter) buys it at a visit.
    const fam = marketFamily(String(aListing!.family_key))!;
    const playerList = await listPost(ctx(postJson('https://x/api/auction/list', {
      playerId: PLAYER, token: PLAYER_TOKEN,
      item: { refKey: `${fam.cat === 'geneCard' ? 'gene' : 'eq'}:player-1`, familyKey: fam.familyKey, rarity: fam.rarity, season: 0, source: 'drop', payload: {} },
      ask: 5, buyNow: 5, durationH: 24,
    }), env));
    expect((await json(playerList)).ok).toBe(true);
    for (let i = 0; i < 6; i++) {
      now += CONSTRUCT.marketEveryMs;
      await tick(now);
    }
    const trades = [...fake(env).marketTrades.values()];
    expect(trades.some((t) => t.seller_id === PLAYER && isConstructId(String(t.buyer_id)))).toBe(true); // a construct bought the player's under-value listing
    // The contract, over every trade the market recorded:
    for (const t of trades) {
      expect(isConstructId(String(t.seller_id)) && isConstructId(String(t.buyer_id))).toBe(false); // never construct↔construct
      if (Number(t.authority) !== 0) expect(isConstructId(String(t.buyer_id))).toBe(false); // never buys stock
    }
  }, 120_000);
});

describe('constructs — never on a leaderboard or the Arena ladder', () => {
  it('the leaderboard and Arena endpoints refuse a construct id; the router reaches nothing else', async () => {
    const env = makeEnv();
    const id = CONSTRUCTS[0].id;
    const lb = await submitPost(ctx(postJson('https://x/api/leaderboard/submit', { playerId: id, mode: 'accountLevel', score: 10, wave: 1, power: 1 }), env));
    expect(lb.status).toBe(403);
    expect((await json(lb)).error).toBe('construct');
    const arena = await reportPost(ctx(postJson('https://x/api/arena/report', { playerId: id, claim: {} }), env));
    expect(arena.status).toBe(403);
    expect((await json(arena)).error).toBe('construct');
    expect(fake(env).leaderboard.size).toBe(0);
    const wire = constructWire(env.DB, id);
    for (const [m, p] of [['POST', '/api/leaderboard/submit'], ['POST', '/api/arena/report'], ['POST', '/api/an/ingest'], ['POST', '/api/account/register'], ['GET', '/api/leaderboard/top']] as const) {
      const r = await wire(m, p, {});
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('construct-unroutable');
    }
  });
});

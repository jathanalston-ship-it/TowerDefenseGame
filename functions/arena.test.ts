// Arena backend (docs/ARENA.md §7, docs/ONLINE-FOUNDATION.md §authority) — the settlement
// endpoint's failure-mode battery:
//   • a valid win settles: rating rises from STORED state, placements burn, streak counts;
//   • EXACTLY-ONCE: resubmitting the same matchId returns the stored verdict, pays nothing;
//   • forgeries bounce on the SHARED validator (bad pace, absurd power, wrong shape);
//   • the season is the SERVER's clock — stale/foreign seasons 409;
//   • rewards derive server-side (wins → containers + cache; losses → cores + mats) and the
//     client's claimed amounts are nowhere in the protocol;
//   • the season endpoint reports the authoritative clock + ladder row.

import { describe, expect, it } from 'vitest';
import { onRequestPost as reportPost } from './api/arena/report';
import { onRequestGet as seasonGet } from './api/arena/season';
import { ctx, makeEnv, postJson } from './lib/testkit';
import { ARENA, arenaSeasonIndex } from '../src/core/arena';
import type { ArenaMatchClaim } from '../src/core/arena';

const PLAYER = '11111111-2222-4333-8444-555555555555'; // UUID shape (lib/validate isPlayerId)

const claim = (over: Partial<ArenaMatchClaim> = {}): ArenaMatchClaim => ({
  matchId: 'm_abcdef0123456789',
  season: arenaSeasonIndex(Date.now()),
  outcome: 'win',
  vsAi: true,
  oppRating: 640,
  oppPower: 1000,
  durationSec: 200,
  waveReached: 8,
  power: 1100,
  ...over,
});

const report = (env = makeEnv(), body: unknown = { playerId: PLAYER, claim: claim() }): Promise<Response> =>
  reportPost(ctx(postJson('https://game.test/api/arena/report', body), env)) as Promise<Response>;

describe('POST /api/arena/report', () => {
  it('settles a valid win from stored state: rating rises, placement burns, streak counts', async () => {
    const env = makeEnv();
    const res = await report(env);
    expect(res.status).toBe(200);
    const out = (await res.json()) as { rating: number; delta: number; placements: number; streak: number; passXp: number; rewards: { kind: string }[] };
    expect(out.delta).toBeGreaterThan(0);
    expect(out.rating).toBe(out.delta); // fresh row starts at 0
    expect(out.placements).toBe(ARENA.placementMatches - 1);
    expect(out.streak).toBe(1);
    expect(out.passXp).toBe(ARENA.winPassXp);
    expect(out.rewards.some((r) => r.kind === 'container')).toBe(true);
    expect(out.rewards.some((r) => r.kind === 'runCache')).toBe(true);
  });

  it('is EXACTLY-ONCE per matchId: the duplicate returns the stored verdict, pays nothing', async () => {
    const env = makeEnv();
    const first = (await (await report(env)).json()) as { rating: number };
    const dup = await report(env);
    expect(dup.status).toBe(200);
    const out = (await dup.json()) as { duplicate?: boolean; rating: number };
    expect(out.duplicate).toBe(true);
    expect(out.rating).toBe(first.rating); // unchanged — no double pay
  });

  it('losses settle from stored state too: rating floors at 0, streak resets, loss rewards are standard resources', async () => {
    const env = makeEnv();
    await report(env); // one win first (rating > 0, streak 1)
    const res = await report(env, { playerId: PLAYER, claim: claim({ matchId: 'm_fedcba9876543210', outcome: 'loss' }) });
    const out = (await res.json()) as { delta: number; rating: number; streak: number; passXp: number; rewards: { kind: string }[] };
    expect(out.delta).toBeLessThan(0);
    expect(out.rating).toBeGreaterThanOrEqual(0);
    expect(out.streak).toBe(0);
    expect(out.passXp).toBe(0);
    expect(out.rewards.some((r) => r.kind === 'container' || r.kind === 'runCache')).toBe(false);
    expect(out.rewards.some((r) => r.kind === 'cores')).toBe(true);
  });

  it('rejects every forgery axis via the SHARED validator', async () => {
    expect((await report(makeEnv(), { playerId: PLAYER, claim: claim({ waveReached: 190, durationSec: 30 }) })).status).toBe(400); // implausible pace
    expect((await report(makeEnv(), { playerId: PLAYER, claim: claim({ power: 1e12 }) })).status).toBe(400);
    expect((await report(makeEnv(), { playerId: PLAYER, claim: claim({ outcome: 'jackpot' as never }) })).status).toBe(400);
    expect((await report(makeEnv(), { playerId: 'x', claim: claim() })).status).toBe(400);
    expect((await report(makeEnv(), { playerId: PLAYER })).status).toBe(400); // no claim at all
  });

  it('409s a stale/foreign season — the server clock is the season truth', async () => {
    const res = await report(makeEnv(), { playerId: PLAYER, claim: claim({ season: arenaSeasonIndex(Date.now()) + 5 }) });
    expect(res.status).toBe(409);
  });

  it('rate-limits a farm loop', async () => {
    const env = makeEnv();
    let limited = false;
    for (let i = 0; i < 45; i++) {
      const res = await report(env, { playerId: PLAYER, claim: claim({ matchId: `m_farm_${String(i).padStart(8, '0')}` }) });
      if (res.status === 429) limited = true;
    }
    expect(limited).toBe(true);
  });
});

describe('GET /api/arena/season', () => {
  it('reports the authoritative clock, the season exclusive, and the stored ladder row', async () => {
    const env = makeEnv();
    await report(env); // creates a ladder row
    const res = (await seasonGet(
      ctx(new Request(`https://game.test/api/arena/season?playerId=${PLAYER}`), env),
    )) as Response;
    expect(res.status).toBe(200);
    const out = (await res.json()) as { season: number; endsAt: number; exclusive: string; ladder: { rating: number; division: string } | null };
    expect(out.season).toBe(arenaSeasonIndex(Date.now()));
    expect(out.endsAt).toBeGreaterThan(Date.now());
    expect(out.exclusive.length).toBeGreaterThan(4);
    expect(out.ladder).not.toBeNull();
    expect(out.ladder!.rating).toBeGreaterThan(0);
    expect(out.ladder!.division.length).toBeGreaterThan(2);
  });

  it('anonymous queries get the clock without a ladder row', async () => {
    const res = (await seasonGet(ctx(new Request('https://game.test/api/arena/season'), makeEnv()))) as Response;
    const out = (await res.json()) as { ladder: unknown };
    expect(out.ladder).toBeNull();
  });
});

// Cloud save + daily seed + leaderboard endpoint suite (docs/DEPLOYMENT.md).
// Same real-handlers-over-fakes approach as purchases.test.ts.

import { describe, expect, it } from 'vitest';
import { onRequestPut as savePut, onRequestGet as saveGet } from './api/save';
import { onRequestGet as dailySeed, mintDayTicket, serverDailySeed, utcDayKey } from './api/daily/seed';
import { onRequestPost as lbSubmit } from './api/leaderboard/submit';
import { onRequestGet as lbTop } from './api/leaderboard/top';
import { ctx, makeEnv, postJson } from './lib/testkit';
import { hashStr } from '../src/core/hash';
import { dailySeed as clientDailySeed } from '../src/core/daily';

const PLAYER = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'a'.repeat(64);

const blob = JSON.stringify({ schemaVersion: 23, data: { ok: true } });

describe('/api/save', () => {
  it('trust-on-first-use claims the slot; the wrong token is refused thereafter', async () => {
    const e = makeEnv();
    const put = await savePut(ctx(new Request('https://g.test/api/save', {
      method: 'PUT', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ playerId: PLAYER, token: TOKEN, blob }),
    }), e));
    expect(put.status).toBe(200);

    const wrong = await savePut(ctx(new Request('https://g.test/api/save', {
      method: 'PUT', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ playerId: PLAYER, token: 'b'.repeat(64), blob }),
    }), e));
    expect(wrong.status).toBe(403);

    const get = await saveGet(ctx(new Request(`https://g.test/api/save?playerId=${PLAYER}&token=${TOKEN}`), e));
    expect(((await get.json()) as { blob: string }).blob).toBe(blob);
    const getWrong = await saveGet(ctx(new Request(`https://g.test/api/save?playerId=${PLAYER}&token=${'c'.repeat(64)}`), e));
    expect(getWrong.status).toBe(403);
  });

  it('rejects non-JSON blobs, wrong envelopes, and oversized payloads', async () => {
    const e = makeEnv();
    const mk = (b: unknown): Request => new Request('https://g.test/api/save', {
      method: 'PUT', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ playerId: PLAYER, token: TOKEN, blob: b }),
    });
    expect((await savePut(ctx(mk('not json'), e))).status).toBe(400);
    expect((await savePut(ctx(mk(JSON.stringify({ nope: 1 })), e))).status).toBe(400);
    expect((await savePut(ctx(mk('x'.repeat(300_000)), e))).status).toBe(400);
  });
});

describe('/api/daily/seed', () => {
  it('serves the SAME seed the offline client derives (shared core/hash primitive)', async () => {
    const key = utcDayKey();
    expect(serverDailySeed(key)).toBe(clientDailySeed(key));
    expect(serverDailySeed(key)).toBe(hashStr('daily:' + key));
    const e = makeEnv({ DAY_TICKET_SECRET: 's3cr3t' });
    const res = await dailySeed(ctx(new Request(`https://g.test/api/daily/seed?playerId=${PLAYER}`, { headers: { 'cf-connecting-ip': '9.9.9.9' } }), e));
    const body = (await res.json()) as { dayKey: string; seed: number; ticket?: string };
    expect(body.dayKey).toBe(key);
    expect(body.seed).toBe(clientDailySeed(key));
    expect(body.ticket).toBe(await mintDayTicket('s3cr3t', key, PLAYER));
  });
});

describe('/api/leaderboard', () => {
  const SECRET = 'day-ticket-secret';

  async function submit(e: ReturnType<typeof makeEnv>, over: Record<string, unknown> = {}): Promise<Response> {
    const dayKey = utcDayKey();
    return lbSubmit(ctx(postJson('https://g.test/api/leaderboard/submit', {
      playerId: PLAYER, name: 'OVERMIND', mode: 'daily', dayKey,
      score: 14, wave: 14, power: 12_000,
      ticket: await mintDayTicket(SECRET, dayKey, PLAYER),
      ...over,
    }), e));
  }

  it('accepts a valid day-ticketed entry and ranks it', async () => {
    const e = makeEnv({ DAY_TICKET_SECRET: SECRET });
    const res = await submit(e);
    expect(res.status).toBe(200);
    const top = await lbTop(ctx(new Request(`https://g.test/api/leaderboard/top?mode=daily&playerId=${PLAYER}`, { headers: { 'cf-connecting-ip': '4.4.4.4' } }), e));
    const body = (await top.json()) as { entries: { name: string; score: number }[]; you: { rank: number } };
    expect(body.entries[0].name).toBe('OVERMIND');
    expect(body.you.rank).toBe(1);
  });

  it('rejects clock forgery: wrong day key or a bad/foreign ticket', async () => {
    const e = makeEnv({ DAY_TICKET_SECRET: SECRET });
    expect((await submit(e, { dayKey: '2020-01-01' })).status).toBe(409);
    expect((await submit(e, { ticket: 'f'.repeat(64) })).status).toBe(403);
    expect((await submit(e, { ticket: await mintDayTicket(SECRET, utcDayKey(), OTHER_ID) })).status).toBe(403);
  });

  it('rejects out-of-bounds claims and strips hostile names', async () => {
    const e = makeEnv({ DAY_TICKET_SECRET: SECRET });
    expect((await submit(e, { score: 10 ** 12 })).status).toBe(400);
    expect((await submit(e, { wave: -1 })).status).toBe(400);
    expect((await submit(e, { score: 1.5 })).status).toBe(400);
    const res = await submit(e, { name: '<script>alert(1)</script>' });
    expect(res.status).toBe(200);
    const top = await lbTop(ctx(new Request('https://g.test/api/leaderboard/top?mode=daily', { headers: { 'cf-connecting-ip': '4.4.4.5' } }), e));
    const body = (await top.json()) as { entries: { name: string }[] };
    expect(body.entries[0].name).toBe('scriptalert(1)/scrip'); // markup stripped + 20-char cap; React renders text nodes anyway
  });

  it('keeps only the BEST entry per player (spam cannot inflate)', async () => {
    const e = makeEnv({ DAY_TICKET_SECRET: SECRET });
    await submit(e, { score: 10, wave: 10 });
    await submit(e, { score: 8, wave: 8 }); // worse — ignored
    await submit(e, { score: 12, wave: 12 }); // better — replaces
    const top = await lbTop(ctx(new Request('https://g.test/api/leaderboard/top?mode=daily', { headers: { 'cf-connecting-ip': '4.4.4.6' } }), e));
    const body = (await top.json()) as { total: number; entries: { score: number }[] };
    expect(body.total).toBe(1);
    expect(body.entries[0].score).toBe(12);
  });
});

const OTHER_ID = '99999999-8888-4777-8666-555555555555';

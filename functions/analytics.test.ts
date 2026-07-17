// Analytics platform endpoints (docs/ANALYTICS.md §server) — exercises the REAL handlers
// against the FakeD1 testkit: ingest validation via the shared registry, bounded rollup
// folding, durable rows + error dedupe, session/player/activity upkeep, region enrichment,
// retention pruning, the DEV_KEY gate on every dev route, the remote-config whitelist
// surviving storage, and the deletion right purging the analytics footprint.

import { describe, expect, it } from 'vitest';
import { FakeD1, ctx, makeEnv, postJson } from './lib/testkit';
import { onRequestPost as ingestPost } from './api/an/ingest';
import { onRequestGet as configGet } from './api/config';
import { onRequestGet as overviewGet } from './api/dev/overview';
import { onRequestGet as seriesGet } from './api/dev/series';
import { onRequestGet as insightsGet } from './api/dev/insights';
import { onRequestGet as playerGet } from './api/dev/player';
import { onRequestGet as errorsGet } from './api/dev/errors';
import { onRequestGet as exportGet } from './api/dev/export';
import { onRequestGet as flagsGet, onRequestPut as flagsPut } from './api/dev/flags';
import { onRequestDelete as saveDelete } from './api/save';
import { sha256Hex } from './lib/crypto';
import type { Env } from './lib/env';
import type { AnBatch, AnEvent } from '../src/core/analyticsEvents';
import { utcDay } from './lib/anHost';

const PLAYER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAYER2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION = 'ses-1111-2222-3333';
const DEV = 'dev-secret-key';
const TOKEN = 'a'.repeat(64);

function batch(events: AnEvent[], over: Partial<AnBatch> = {}): AnBatch {
  return {
    playerId: PLAYER, session: SESSION, platform: 'web', ver: '1.0.0', lang: 'en',
    power: 12_000, stage: 14, events, ...over,
  };
}

const now = (): number => Date.now();

async function ingest(env: Env, b: AnBatch, headers: Record<string, string> = {}): Promise<Response> {
  return ingestPost(ctx(postJson('https://game.test/api/an/ingest', b, headers), env));
}

function devGet(env: Env, url: string, handler: PagesFunction<Env>, key: string | null = DEV): Promise<Response> {
  const headers: Record<string, string> = { 'cf-connecting-ip': '203.0.113.9' };
  if (key) headers['x-dev-key'] = key;
  return handler(ctx(new Request(url, { headers }), env)) as Promise<Response>;
}

describe('POST /api/an/ingest', () => {
  it('folds a batch: rollups, durable rows, error dedupe, player/session/activity upkeep', async () => {
    const env = makeEnv();
    const db = env.DB as unknown as FakeD1;
    const t = now();
    const res = await ingest(env, batch([
      { k: 'ses_start', at: t },
      { k: 'nav', at: t, sc: 'home', d: 'genes', v: 1200 },
      { k: 'run_end', at: t, md: 'campaign', d: 'campaign', v: 14, x: { won: 1, hero: 'vanguard', towers: 'spitter,lasher', dur: 300, stage: 12, diff: 'standard', doctrine: 'none' } },
      { k: 'err', at: t, d: 'eabc123', x: { msg: 'boom', stack: 'at x' } },
      { k: 'buy', at: t, d: 'starter_pack', v: 499 },
    ]), { 'cf-ipcountry': 'US' });
    expect(res.status).toBe(200);
    const body = await res.json() as { accepted: number };
    expect(body.accepted).toBe(5);

    const day = utcDay(t);
    expect(db.anDaily.get(`${day}|nav|genes|1.0.0`)?.n).toBe(1);
    expect(db.anDaily.get(`${day}|run_end|campaign|1.0.0`)?.sum).toBe(14);
    expect(db.anDaily.get(`${day}|buy|starter_pack|1.0.0`)?.sum).toBe(499);
    // Durable rows kept (ses_start/run_end/err/buy); non-durable nav exists ONLY as a rollup.
    expect(db.anEvents.some((e) => e.kind === 'run_end')).toBe(true);
    expect(db.anEvents.some((e) => e.kind === 'nav')).toBe(false);
    const player = db.anPlayers.get(PLAYER)!;
    expect(player.sessions).toBe(1);
    expect(player.revenue_cents).toBe(499);
    expect(player.region).toBe('US');
    expect(player.power).toBe(12_000);
    expect(db.anSessions.get(SESSION)?.events).toBe(5);
    expect(db.anActivity.has(`${PLAYER}|${day}`)).toBe(true);
    expect(db.anErrors.get('eabc123')?.count).toBe(1);
  });

  it('dedupes repeated errors by hash and accumulates rollups across batches', async () => {
    const env = makeEnv();
    const db = env.DB as unknown as FakeD1;
    const t = now();
    await ingest(env, batch([{ k: 'err', at: t, d: 'esame', x: { msg: 'boom' } }]));
    await ingest(env, batch([{ k: 'err', at: t, d: 'esame', x: { msg: 'boom' } }]));
    expect(db.anErrors.size).toBe(1);
    expect(db.anErrors.get('esame')?.count).toBe(2);
    expect(db.anDaily.get(`${utcDay(t)}|err|esame|1.0.0`)?.n).toBe(2);
  });

  it('rejects hopeless envelopes; drops junk events but keeps the valid ones', async () => {
    const env = makeEnv();
    expect((await ingest(env, batch([]))).status).toBe(400); // empty
    expect((await ingest(env, batch([{ k: 'ses_ping', at: now() }], { playerId: 'x' }))).status).toBe(400); // bad player
    expect((await ingest(env, batch([{ k: 'not_a_kind', at: now() }]))).status).toBe(400); // no valid events
    const mixed = await ingest(env, batch([
      { k: 'ses_ping', at: now() },
      { k: 'nav', at: now(), d: 'BAD DIM!', v: 1 }, // invalid dim → dropped, not fatal
    ]));
    expect(mixed.status).toBe(200);
    expect(((await mixed.json()) as { accepted: number }).accepted).toBe(1);
  });

  it('tolerates sendBeacon text/plain bodies and clamps client timestamps', async () => {
    const env = makeEnv();
    const db = env.DB as unknown as FakeD1;
    const ancient = now() - 365 * 86_400_000; // outbox from "a year ago" → clamped to 48h back
    const req = new Request('https://game.test/api/an/ingest', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'cf-connecting-ip': '203.0.113.7' },
      body: JSON.stringify(batch([{ k: 'ses_end', at: ancient, v: 600, x: { ev: 3 } }])),
    });
    expect((await ingestPost(ctx(req, env))).status).toBe(200);
    const row = [...db.anDaily.values()].find((r) => r.kind === 'ses_end')!;
    expect(String(row.day) >= utcDay(now() - 3 * 86_400_000)).toBe(true);
  });

  it('prunes expired raw rows when a session starts (no daemon)', async () => {
    const env = makeEnv();
    const db = env.DB as unknown as FakeD1;
    db.anEvents.push({ player_id: PLAYER, session: 's', kind: 'run_end', at: 1, day: '2020-01-01' });
    await ingest(env, batch([{ k: 'ses_start', at: now() }]));
    expect(db.anEvents.some((e) => e.day === '2020-01-01')).toBe(false);
  });
});

describe('the DEV_KEY gate + dev API reads', () => {
  it('closed without configuration; 403 on a wrong key; data with the right one', async () => {
    const bare = makeEnv();
    expect((await devGet(bare, 'https://game.test/api/dev/overview', overviewGet, null)).status).toBe(503);
    const env = makeEnv({ DEV_KEY: DEV });
    expect((await devGet(env, 'https://game.test/api/dev/overview', overviewGet, 'wrong')).status).toBe(403);
    await ingest(env, batch([{ k: 'ses_start', at: now() }, { k: 'run_start', at: now(), d: 'campaign' }]));
    await ingest(env, batch([{ k: 'ses_start', at: now() }], { playerId: PLAYER2, session: 'ses-other-4444' }));
    const res = await devGet(env, 'https://game.test/api/dev/overview', overviewGet);
    expect(res.status).toBe(200);
    const o = await res.json() as { live: number; dau: { today: number }; playersTotal: number; today: { sessions: number; runs: number } };
    expect(o.dau.today).toBe(2);
    expect(o.live).toBe(2);
    expect(o.playersTotal).toBe(2);
    expect(o.today.sessions).toBe(2);
    expect(o.today.runs).toBe(1);
  });

  it('series explores any registry kind; export produces CSV; errors list reads the ledger', async () => {
    const env = makeEnv({ DEV_KEY: DEV });
    await ingest(env, batch([
      { k: 'tw_field', at: now(), d: 'spitter', v: 3 },
      { k: 'err', at: now(), d: 'ex1', x: { msg: 'kaboom' } },
    ]));
    const kinds = await (await devGet(env, 'https://game.test/api/dev/series?kind=kinds', seriesGet)).json() as { kinds: { kind: string }[] };
    expect(kinds.kinds.some((k) => k.kind === 'tw_field')).toBe(true);
    const series = await (await devGet(env, 'https://game.test/api/dev/series?kind=tw_field&days=7', seriesGet)).json() as { rows: { dim: string; n: number }[] };
    expect(series.rows).toHaveLength(1);
    expect(series.rows[0].dim).toBe('spitter');
    expect((await devGet(env, 'https://game.test/api/dev/series?kind=nope', seriesGet)).status).toBe(400);
    const csv = await (await devGet(env, 'https://game.test/api/dev/export?days=7&format=csv', exportGet)).text();
    expect(csv.startsWith('day,kind,dim,ver,n,sum,sum2')).toBe(true);
    expect(csv).toContain('tw_field');
    const errs = await (await devGet(env, 'https://game.test/api/dev/errors', errorsGet)).json() as { errors: { hash: string }[] };
    expect(errs.errors[0].hash).toBe('ex1');
  });

  it('insights runs the SHARED engine over stored rollups (tower pathology surfaces)', async () => {
    const env = makeEnv({ DEV_KEY: DEV });
    const db = env.DB as unknown as FakeD1;
    const day = utcDay(now());
    const seed = (kind: string, dim: string, n: number): void => {
      db.anDaily.set(`${day}|${kind}|${dim}|1.0.0`, { day, kind, dim, ver: '1.0.0', n, sum: 0, sum2: 0 });
    };
    seed('tw_field', 'spitter', 300); seed('tw_win', 'spitter', 45);
    seed('tw_field', 'lasher', 300); seed('tw_win', 'lasher', 180);
    const res = await devGet(env, 'https://game.test/api/dev/insights?days=14', insightsGet);
    const body = await res.json() as { findings: { id: string; title: string }[] };
    expect(body.findings.some((f) => f.id === 'tower-worst' && f.title.includes('spitter'))).toBe(true);
  });

  it('player timeline serves the durable trail; unknown ids 404', async () => {
    const env = makeEnv({ DEV_KEY: DEV });
    await ingest(env, batch([{ k: 'ses_start', at: now() }, { k: 'buy', at: now(), d: 'starter_pack', v: 499 }]));
    const res = await devGet(env, `https://game.test/api/dev/player?id=${PLAYER}`, playerGet);
    const body = await res.json() as { player: { revenue_cents: number }; events: { kind: string }[]; activity: string[] };
    expect(body.player.revenue_cents).toBe(499);
    expect(body.events.some((e) => e.kind === 'buy')).toBe(true);
    expect(body.activity).toHaveLength(1);
    expect((await devGet(env, `https://game.test/api/dev/player?id=${PLAYER2}`, playerGet)).status).toBe(404);
  });
});

describe('remote config — stored through the whitelist, served sanitized', () => {
  it('PUT sanitizes (sim keys can never persist); GET /api/config serves the effective doc', async () => {
    const env = makeEnv({ DEV_KEY: DEV });
    const put = new Request('https://game.test/api/dev/flags', {
      method: 'PUT',
      headers: { 'x-dev-key': DEV, 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
      body: JSON.stringify({
        flags: { 'ui.flashOffers': false, 'sim.enemyHp': true },
        numbers: { 'ui.placardMax': 99 },
        experiments: [{ id: 'daily_double', salt: 'v1', buckets: [{ id: 'on', pct: 50 }] }],
      }),
    });
    const putRes = await flagsPut(ctx(put, env));
    expect(putRes.status).toBe(200);
    const stored = await putRes.json() as { rev: number; effective: { flags: Record<string, boolean>; numbers: Record<string, number> } };
    expect(stored.rev).toBe(1);
    expect(stored.effective.flags['ui.flashOffers']).toBe(false);
    expect('sim.enemyHp' in stored.effective.flags).toBe(false);
    expect(stored.effective.numbers['ui.placardMax']).toBe(8); // clamped

    const pub = await configGet(ctx(new Request('https://game.test/api/config', { headers: { 'cf-connecting-ip': '203.0.113.9' } }), env));
    const doc = await pub.json() as { rev: number; flags: Record<string, boolean>; experiments: unknown[] };
    expect(doc.rev).toBe(1);
    expect(doc.flags['ui.flashOffers']).toBe(false);
    expect(doc.experiments).toHaveLength(1);
    // The dev read echoes the same effective view.
    const dev = await (await devGet(env, 'https://game.test/api/dev/flags', flagsGet)).json() as { effective: { flags: Record<string, boolean> } };
    expect(dev.effective.flags['ui.flashOffers']).toBe(false);
  });
});

describe('the deletion right covers analytics', () => {
  it('DELETE /api/save purges events, sessions, activity, and the player row', async () => {
    const env = makeEnv();
    const db = env.DB as unknown as FakeD1;
    db.cloudSaves.set(PLAYER, {
      player_id: PLAYER, token_hash: await sha256Hex(TOKEN), blob: '{}', size: 2,
      updated_at: 0, rev: 1, meta: '{}',
    });
    await ingest(env, batch([{ k: 'ses_start', at: now() }, { k: 'buy', at: now(), d: 'starter_pack', v: 499 }]));
    expect(db.anPlayers.has(PLAYER)).toBe(true);
    const req = new Request(`https://game.test/api/save?playerId=${PLAYER}&token=${TOKEN}`, {
      method: 'DELETE', headers: { 'cf-connecting-ip': '203.0.113.9' },
    });
    const res = await saveDelete(ctx(req, env));
    expect(res.status).toBe(200);
    expect(db.anPlayers.has(PLAYER)).toBe(false);
    expect(db.anEvents.filter((e) => e.player_id === PLAYER)).toHaveLength(0);
    expect(db.anSessions.size).toBe(0);
    expect([...db.anActivity].filter((k) => k.startsWith(`${PLAYER}|`))).toHaveLength(0);
  });
});

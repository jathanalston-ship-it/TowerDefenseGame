// Account platform suite (docs/ACCOUNTS.md): guest formalization, guest→email
// upgrade, login, sessions, password change/reset, and the versioned cloud-save
// conflict contract. Same real-handlers-over-fakes approach as backend.test.ts —
// these are the flows the PRIMARY GOAL depends on (create on web → continue on
// any device), so they run on the REAL route handlers and the REAL crypto.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as guestPost } from './api/account/guest';
import { onRequestPost as registerPost } from './api/account/register';
import { onRequestPost as loginPost } from './api/account/login';
import { onRequestPost as logoutPost } from './api/account/logout';
import { onRequestGet as meGet, onRequestPost as mePost } from './api/account/me';
import { onRequestPost as passwordPost } from './api/account/password';
import { onRequestPost as resetPost } from './api/account/reset';
import { onRequestPut as savePut, onRequestGet as saveGet } from './api/save';
import { hashPassword, verifyPassword, passwordProblem } from './lib/accounts';
import { ctx, makeEnv, postJson } from './lib/testkit';
import type { Env } from './lib/env';

const PLAYER = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'a'.repeat(64);
const blob = JSON.stringify({ schemaVersion: 26, data: { ok: true } });

const j = async (r: Response): Promise<Record<string, unknown>> => (await r.json()) as Record<string, unknown>;

async function makeGuest(e: Env, playerId = PLAYER, token = TOKEN): Promise<Response> {
  return guestPost(ctx(postJson('https://g.test/api/account/guest', { playerId, token, platform: 'web' }), e));
}

async function register(e: Env, over: Record<string, unknown> = {}): Promise<Response> {
  return registerPost(ctx(postJson('https://g.test/api/account/register', {
    playerId: PLAYER, token: TOKEN, email: 'player@example.com', password: 'hunter2hunter2', displayName: 'OVERMIND', ...over,
  }), e));
}

describe('password hashing', () => {
  it('PBKDF2 verifies the right password and refuses the wrong one', async () => {
    const { hash, salt, iters } = await hashPassword('correct horse battery');
    const row = { pass_hash: hash, pass_salt: salt, pass_iters: iters };
    expect(await verifyPassword('correct horse battery', row)).toBe(true);
    expect(await verifyPassword('correct horse batterx', row)).toBe(false);
    expect(hash).not.toContain('correct'); // never plaintext
  });

  it('policy rejects short passwords', () => {
    expect(passwordProblem('short')).toBe('password-too-short');
    expect(passwordProblem('long-enough-pass')).toBeNull();
  });
});

describe('/api/account/guest', () => {
  it('formalizes a device identity as a guest account, idempotently (TOFU)', async () => {
    const e = makeEnv();
    const first = await j(await makeGuest(e));
    expect((first.account as { provider: string }).provider).toBe('guest');
    expect((first.account as { accountId: string }).accountId).toBe(PLAYER);
    const again = await j(await makeGuest(e));
    expect((again.account as { accountId: string }).accountId).toBe(PLAYER);
  });

  it('refuses a different token for a claimed id', async () => {
    const e = makeEnv();
    await makeGuest(e);
    const wrong = await makeGuest(e, PLAYER, 'b'.repeat(64));
    expect(wrong.status).toBe(403);
  });
});

describe('/api/account/register — the guest → account upgrade', () => {
  it('attaches email credentials to the SAME account id (progress carries over)', async () => {
    const e = makeEnv();
    await makeGuest(e);
    const res = await j(await register(e));
    expect((res.account as { accountId: string }).accountId).toBe(PLAYER); // same id = same saves/purchases
    expect((res.account as { provider: string }).provider).toBe('email');
    expect(typeof res.session).toBe('string');
  });

  it('works without a prior guest call (registers the identity implicitly)', async () => {
    const e = makeEnv();
    const res = await register(e);
    expect(res.status).toBe(200);
  });

  it('refuses a taken email, a re-register, and a weak password', async () => {
    const e = makeEnv();
    await register(e);
    const other = '22222222-3333-4444-8555-666666666666';
    expect((await register(e, { playerId: other, token: 'c'.repeat(64) })).status).toBe(409); // email-taken
    expect((await register(e, { email: 'other@example.com' })).status).toBe(409); // already-registered
    const weak = await register(e, { playerId: other, token: 'c'.repeat(64), email: 'x@example.com', password: 'short' });
    expect(weak.status).toBe(400);
  });
});

describe('/api/account/login + sessions', () => {
  it('signs in from a NEW device and the session reads the account + cloud save', async () => {
    const e = makeEnv();
    await register(e);
    // Device A uploads a save with the guest token.
    await savePut(ctx(new Request('https://g.test/api/save', {
      method: 'PUT', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '9.9.9.9' },
      body: JSON.stringify({ playerId: PLAYER, token: TOKEN, blob, meta: { playtimeSec: 3600, power: 2500 } }),
    }), e));
    // Device B knows only email+password.
    const login = await j(await loginPost(ctx(postJson('https://g.test/api/account/login', { email: 'player@example.com', password: 'hunter2hunter2', platform: 'steam' }), e)));
    expect((login.account as { accountId: string }).accountId).toBe(PLAYER);
    const session = login.session as string;
    // The session alone (no sync token!) reads the cloud save — cross-device continue.
    const got = await j(await saveGet(ctx(new Request(`https://g.test/api/save?playerId=${PLAYER}&session=${session}`, { headers: { 'cf-connecting-ip': '9.9.9.8' } }), e)));
    expect(got.blob).toBe(blob);
    expect(got.rev).toBe(1);
    // Platform history recorded both.
    const me = await j(await meGet(ctx(new Request(`https://g.test/api/account/me?session=${session}`, { headers: { 'cf-connecting-ip': '9.9.9.7' } }), e)));
    expect((me.account as { platforms: string[] }).platforms).toContain('steam');
    expect((me.cloudSave as { rev: number }).rev).toBe(1);
  });

  it('uniformly refuses a wrong password and an unknown email', async () => {
    const e = makeEnv();
    await register(e);
    const wrong = await loginPost(ctx(postJson('https://g.test/api/account/login', { email: 'player@example.com', password: 'not-the-password' }), e));
    const unknown = await loginPost(ctx(postJson('https://g.test/api/account/login', { email: 'ghost@example.com', password: 'whatever-pass' }), e));
    expect(wrong.status).toBe(403);
    expect(unknown.status).toBe(403);
    expect((await j(wrong)).error).toBe((await j(unknown)).error); // no enumeration
  });

  it('logout revokes the session', async () => {
    const e = makeEnv();
    const session = (await j(await register(e))).session as string;
    await logoutPost(ctx(postJson('https://g.test/api/account/logout', { session }), e));
    const me = await meGet(ctx(new Request(`https://g.test/api/account/me?session=${session}`, { headers: { 'cf-connecting-ip': '9.9.9.6' } }), e));
    expect(me.status).toBe(403);
  });
});

describe('/api/account/me updates', () => {
  it('updates display name and keeps playtime monotonic', async () => {
    const e = makeEnv();
    const session = (await j(await register(e))).session as string;
    const up = await j(await mePost(ctx(postJson('https://g.test/api/account/me', { session, displayName: 'THE HIVE', playtimeSec: 5000 }), e)));
    expect((up.account as { displayName: string }).displayName).toBe('THE HIVE');
    const down = await j(await mePost(ctx(postJson('https://g.test/api/account/me', { session, playtimeSec: 100 }), e)));
    expect((down.account as { playtimeSec: number }).playtimeSec).toBe(5000); // never regresses
  });
});

describe('/api/account/password', () => {
  it('requires the current password, rotates sessions, and the new password logs in', async () => {
    const e = makeEnv();
    const session = (await j(await register(e))).session as string;
    const refused = await passwordPost(ctx(postJson('https://g.test/api/account/password', { session, oldPassword: 'wrong-old-pass', newPassword: 'brand-new-pass' }), e));
    expect(refused.status).toBe(403);
    const ok = await j(await passwordPost(ctx(postJson('https://g.test/api/account/password', { session, oldPassword: 'hunter2hunter2', newPassword: 'brand-new-pass' }), e)));
    expect(typeof ok.session).toBe('string');
    // Old session is dead; the new password signs in.
    const dead = await meGet(ctx(new Request(`https://g.test/api/account/me?session=${session}`, { headers: { 'cf-connecting-ip': '9.9.9.5' } }), e));
    expect(dead.status).toBe(403);
    const login = await loginPost(ctx(postJson('https://g.test/api/account/login', { email: 'player@example.com', password: 'brand-new-pass' }), e));
    expect(login.status).toBe(200);
  });
});

describe('/api/account/reset', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('503s without the email seam; with it, delivers a single-use token that resets', async () => {
    const e = makeEnv();
    await register(e);
    const no = await resetPost(ctx(postJson('https://g.test/api/account/reset', { action: 'request', email: 'player@example.com' }), e));
    expect(no.status).toBe(503);

    let delivered = '';
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: { body?: string }) => {
      delivered = (JSON.parse(init?.body ?? '{}') as { token: string }).token;
      return new Response('{}');
    }));
    const seamed = makeEnv({ RESET_EMAIL_WEBHOOK: 'https://mail.test/hook' });
    (seamed as { DB: unknown }).DB = e.DB; // same account store
    const req = await resetPost(ctx(postJson('https://g.test/api/account/reset', { action: 'request', email: 'player@example.com' }), seamed));
    expect(req.status).toBe(200);
    expect(delivered).toMatch(/^[0-9a-f]{64}$/);

    const confirm = await resetPost(ctx(postJson('https://g.test/api/account/reset', { action: 'confirm', token: delivered, newPassword: 'reset-new-pass' }), seamed));
    expect(confirm.status).toBe(200);
    const reuse = await resetPost(ctx(postJson('https://g.test/api/account/reset', { action: 'confirm', token: delivered, newPassword: 'reset-again-pass' }), seamed));
    expect(reuse.status).toBe(403); // single-use
    const login = await loginPost(ctx(postJson('https://g.test/api/account/login', { email: 'player@example.com', password: 'reset-new-pass' }), e));
    expect(login.status).toBe(200);
  });
});

describe('/api/save — versioned writes + the conflict contract', () => {
  const put = (e: Env, body: Record<string, unknown>, ip = '7.7.7.7'): Promise<Response> =>
    Promise.resolve(savePut(ctx(new Request('https://g.test/api/save', {
      method: 'PUT', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify({ playerId: PLAYER, token: TOKEN, blob, ...body }),
    }), e)));

  it('bumps rev on every accepted write; a stale baseRev gets 409 + the winning headline', async () => {
    const e = makeEnv();
    expect((await j(await put(e, { meta: { playtimeSec: 100 } }))).rev).toBe(1);
    expect((await j(await put(e, { baseRev: 1, meta: { playtimeSec: 200 } }))).rev).toBe(2);
    const stale = await put(e, { baseRev: 1, meta: { playtimeSec: 50 } });
    expect(stale.status).toBe(409);
    const body = await j(stale);
    expect(body.error).toBe('conflict');
    expect(body.rev).toBe(2);
    expect((body.meta as { playtimeSec: number }).playtimeSec).toBe(200); // preview without the blob
  });

  it('legacy writers (no baseRev) keep last-write-wins; ?meta=1 probes without the blob', async () => {
    const e = makeEnv();
    await put(e, {});
    expect((await j(await put(e, {}))).rev).toBe(2); // no baseRev ⇒ accepted, old clients unbroken
    const probe = await j(await saveGet(ctx(new Request(`https://g.test/api/save?playerId=${PLAYER}&token=${TOKEN}&meta=1`, { headers: { 'cf-connecting-ip': '7.7.7.6' } }), e)));
    expect(probe.rev).toBe(2);
    expect(probe.blob).toBeUndefined();
  });
});

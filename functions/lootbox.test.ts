// Paid random-content region switch (docs/PREMIUM-STORE.md §paid-loot-boxes): the derived
// per-offer properties, the checkout refusal by Cloudflare country, and the /api/config flag.
// The checkout gate uses offerReachesChance — a container in the pack OR a currency that can be
// spent on one (Ichor) — so in a restricted region real money never reaches a random outcome.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as checkout } from './api/store/checkout';
import { onRequestGet as configGet } from './api/config';
import { blockedCountries, paidRandomContainersAllowed } from './lib/lootbox';
import { ctx, makeEnv, postJson } from './lib/testkit';
import type { Env } from './lib/env';
import { GRANT_RANDOM_CONTENT, ICHOR_BUNDLES, PREMIUM_OFFERS, offerHasRandomContent, offerReachesChance, type PremiumGrant } from '../src/core/premium';

const PLAYER = '11111111-2222-4333-8444-555555555555';
const RANDOM_SKU = PREMIUM_OFFERS.find((o) => offerHasRandomContent(o))!;
const ICHOR_SKU = ICHOR_BUNDLES[1];

function withCountry(req: Request, country: string | undefined): Request {
  if (country !== undefined) Object.defineProperty(req, 'cf', { value: { country } });
  return req;
}
function env(over: Partial<Env> = {}): Env {
  return makeEnv({ STRIPE_SECRET_KEY: 'sk_test_abc', ENVIRONMENT: 'preview', ...over });
}
async function tryCheckout(offerId: string, country: string | undefined, e: Env): Promise<Response> {
  return checkout(ctx(withCountry(postJson('https://game.test/api/store/checkout', { offerId, playerId: PLAYER }), country), e));
}
function stubStripeOk(): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/x' }), { status: 200, headers: { 'content-type': 'application/json' } })));
}
afterEach(() => vi.unstubAllGlobals());

describe('derived random-content property', () => {
  it('classifies every offer from its grants, and the registry has both kinds', () => {
    expect(PREMIUM_OFFERS.some((o) => offerHasRandomContent(o))).toBe(true);
    for (const o of ICHOR_BUNDLES) expect(offerHasRandomContent(o)).toBe(false);
    for (const o of PREMIUM_OFFERS) {
      expect(offerHasRandomContent(o)).toBe(o.grants.some((g) => ['container', 'runCache', 'equipment'].includes(g.grant)));
    }
  });
  it('every grant kind is classified (exhaustive table)', () => {
    const kinds: PremiumGrant['grant'][] = ['ichor', 'cores', 'geneEssence', 'mats', 'towerShardsAll', 'heroShardsAll', 'container', 'runCache', 'equipment', 'rushStamina', 'battlePassPremium'];
    for (const k of kinds) expect(typeof GRANT_RANDOM_CONTENT[k]).toBe('boolean');
    expect(Object.keys(GRANT_RANDOM_CONTENT).sort()).toEqual([...kinds].sort());
  });
});

describe('POST /api/store/checkout — region gate', () => {
  it('refuses random-container SKUs from BE and NL (451) before any Stripe call', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    for (const c of ['BE', 'NL', 'be']) {
      const res = await tryCheckout(RANDOM_SKU.id, c, env());
      expect(res.status).toBe(451);
      expect(((await res.json()) as { error: string }).error).toBe('region-restricted');
    }
    expect(f).not.toHaveBeenCalled();
  });
  it('lets the same SKU through elsewhere', async () => {
    stubStripeOk();
    expect((await tryCheckout(RANDOM_SKU.id, 'US', env())).status).toBe(200);
    expect((await tryCheckout(ICHOR_SKU.id, 'US', env())).status).toBe(200);
  });
  it('refuses Ichor bundles in BE/NL too — Ichor buys containers, so money would reach chance', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(offerReachesChance(ICHOR_SKU)).toBe(true);
    for (const c of ['BE', 'NL']) expect((await tryCheckout(ICHOR_SKU.id, c, env())).status).toBe(451);
    expect(f).not.toHaveBeenCalled();
  });
  it('the gate follows offerReachesChance for every SKU in the catalog', async () => {
    stubStripeOk();
    for (const o of PREMIUM_OFFERS) {
      expect((await tryCheckout(o.id, 'BE', env())).status, o.id).toBe(offerReachesChance(o) ? 451 : 200);
    }
  });
  it('honours the env list (override, and "" = nowhere blocked)', async () => {
    stubStripeOk();
    expect((await tryCheckout(RANDOM_SKU.id, 'DE', env({ PAID_LOOTBOX_BLOCKED_COUNTRIES: 'de, fr' }))).status).toBe(451);
    expect((await tryCheckout(RANDOM_SKU.id, 'BE', env({ PAID_LOOTBOX_BLOCKED_COUNTRIES: 'DE' }))).status).toBe(200);
    expect((await tryCheckout(RANDOM_SKU.id, 'BE', env({ PAID_LOOTBOX_BLOCKED_COUNTRIES: '' }))).status).toBe(200);
  });
  it('unknown country fails closed in production, open in preview', async () => {
    stubStripeOk();
    expect((await tryCheckout(RANDOM_SKU.id, undefined, env({ ENVIRONMENT: 'production', STRIPE_SECRET_KEY: 'sk_live_x' }))).status).toBe(451);
    expect((await tryCheckout(RANDOM_SKU.id, 'XX', env({ ENVIRONMENT: 'production', STRIPE_SECRET_KEY: 'sk_live_x' }))).status).toBe(451);
    expect((await tryCheckout(RANDOM_SKU.id, undefined, env())).status).toBe(200);
  });
});

describe('GET /api/config — paidRandomContainers flag', () => {
  async function flag(country: string | undefined, e: Env): Promise<{ status: number; allowed: boolean; cache: string | null }> {
    const req = withCountry(new Request('https://game.test/api/config', { headers: { 'cf-connecting-ip': '203.0.113.9' } }), country);
    const res = await configGet(ctx(req, e));
    const body = (await res.json()) as { paidRandomContainers: boolean };
    return { status: res.status, allowed: body.paidRandomContainers, cache: res.headers.get('cache-control') };
  }
  it('is false for blocked countries, true elsewhere, and never shared-cached', async () => {
    const be = await flag('BE', env());
    expect(be).toMatchObject({ status: 200, allowed: false });
    expect(be.cache).toMatch(/^private/);
    expect((await flag('NL', env())).allowed).toBe(false);
    expect((await flag('US', env())).allowed).toBe(true);
    expect((await flag('BE', env({ PAID_LOOTBOX_BLOCKED_COUNTRIES: '' }))).allowed).toBe(true);
  });
  it('helpers agree with the endpoints', () => {
    expect([...blockedCountries(env())].sort()).toEqual(['BE', 'NL']);
    expect(paidRandomContainersAllowed(withCountry(new Request('https://x.test/'), 'BE'), env())).toBe(false);
  });
});

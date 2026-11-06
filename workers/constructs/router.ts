// CONSTRUCT ROUTER (docs/CONSTRUCTS.md §wire) — a construct speaks to the backend through the
// EXACT Pages Function handlers a player's browser reaches over HTTP, invoked in-process against
// the same D1. Every rule the market enforces on a person (eligibility, fees, custody, rate
// limits, the fraud audit, money conservation) therefore applies to a construct unchanged —
// there is no construct-only code path on the server.
//
// What is deliberately different, and why:
//   • An ALLOWLIST: a construct reaches its cloud-save slot and the Auction House — nothing else.
//     Leaderboards, the Arena, analytics, accounts and the store are unroutable (the owner's
//     rule: constructs never rank; their play must not pollute player telemetry). Those
//     endpoints ALSO refuse construct ids themselves (defence in depth).
//   • Each construct is its own rate-limit subject (`construct:<id>` stands where a device IP
//     would) — the same per-device budgets, no shared egress IP starving the roster.
//   • The handler env carries ONLY the database: Turnstile guards the public edge against
//     scripted browsers; a construct is the game's own server-side actor, not a visitor.

import type { Env } from '../../functions/lib/env';
import { onRequestGet as saveGet, onRequestPut as savePut } from '../../functions/api/save';
import { onRequestGet as searchGet } from '../../functions/api/auction/search';
import { onRequestGet as historyGet } from '../../functions/api/auction/history';
import { onRequestGet as mineGet } from '../../functions/api/auction/mine';
import { onRequestPost as listPost } from '../../functions/api/auction/list';
import { onRequestPost as bidPost } from '../../functions/api/auction/bid';
import { onRequestPost as buyPost } from '../../functions/api/auction/buy';
import { onRequestPost as cancelPost } from '../../functions/api/auction/cancel';
import { onRequestPost as walletPost } from '../../functions/api/auction/wallet';
import { onRequestPost as collectPost } from '../../functions/api/auction/collect';

export type WireMethod = 'GET' | 'POST' | 'PUT';

/** One construct's view of the backend: method + path (with query) + JSON body → status + JSON. */
export type ConstructWire = (method: WireMethod, path: string, body?: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> }>;

const ROUTES: Record<string, Partial<Record<WireMethod, PagesFunction<Env>>>> = {
  '/api/save': { GET: saveGet, PUT: savePut },
  '/api/auction/search': { GET: searchGet },
  '/api/auction/history': { GET: historyGet },
  '/api/auction/mine': { GET: mineGet },
  '/api/auction/list': { POST: listPost },
  '/api/auction/bid': { POST: bidPost },
  '/api/auction/buy': { POST: buyPost },
  '/api/auction/cancel': { POST: cancelPost },
  '/api/auction/wallet': { POST: walletPost },
  '/api/auction/collect': { POST: collectPost },
};

/** The origin constructs address (never fetched — requests are dispatched in-process). */
const ORIGIN = 'https://constructs.internal';

/** Build a construct's wire over a D1 binding. */
export function constructWire(db: D1Database, constructId: string): ConstructWire {
  const env: Env = { DB: db };
  return async (method, path, body) => {
    const pathname = path.split('?')[0];
    const handler = ROUTES[pathname]?.[method];
    if (!handler) return { status: 403, body: { ok: false, error: 'construct-unroutable' } };
    const request = new Request(ORIGIN + path, {
      method,
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': `construct:${constructId}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const context = {
      request, env, params: {}, data: {}, functionPath: pathname,
      waitUntil: () => undefined, passThroughOnException: () => undefined,
      next: () => Promise.resolve(new Response(null, { status: 404 })),
    } as unknown as Parameters<PagesFunction<Env>>[0];
    const res = await handler(context);
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body: json };
  };
}

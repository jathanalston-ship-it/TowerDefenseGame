// CORS for /api/dev/* (docs/ANALYTICS.md §devapp): the desktop dev app's renderer runs on
// a file:// origin, so the x-dev-key header triggers preflights and responses need explicit
// allow headers. Wide-open origin is fine HERE because every route is DEV_KEY-gated and
// cookie-free — the key header IS the credential, and browsers can't be tricked into
// attaching it cross-site.

import type { Env } from '../../lib/env';

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type, x-dev-key',
  'access-control-max-age': '86400',
};

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const res = await ctx.next();
  const wrapped = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) wrapped.headers.set(k, v);
  return wrapped;
};

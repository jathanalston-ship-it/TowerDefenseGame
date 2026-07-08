// GET /api/health — deployment smoke check: functions are routing, D1 is bound,
// and which optional integrations are configured (booleans only, never values).

import type { Env } from '../lib/env';
import { json } from '../lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  let db = false;
  try {
    await env.DB.prepare('SELECT 1').first();
    db = true;
  } catch {
    db = false;
  }
  return json({
    ok: db,
    db,
    stripe: Boolean(env.STRIPE_SECRET_KEY),
    webhook: Boolean(env.STRIPE_WEBHOOK_SECRET),
    turnstile: Boolean(env.TURNSTILE_SECRET_KEY),
    dayTickets: Boolean(env.DAY_TICKET_SECRET),
    environment: env.ENVIRONMENT ?? 'unset',
  });
};

// DEV_KEY gate for the developer analytics API (docs/ANALYTICS.md §devapp). Same posture
// as the MOD_KEY moderation gate: absent configuration means the lane is CLOSED, not open.

import type { Env } from './env';
import { err } from './http';

/** Null when authorized; otherwise the error Response to return as-is. */
export function requireDevKey(request: Request, env: Env): Response | null {
  if (!env.DEV_KEY) return err(503, 'dev-api-not-configured');
  const key = request.headers.get('x-dev-key');
  if (!key || key !== env.DEV_KEY) return err(403, 'forbidden');
  return null;
}

// Arena settlement reporter (docs/ARENA.md §7, docs/ONLINE-FOUNDATION.md §4) — the fail-soft
// bridge to the server-authoritative lane: after a match settles LOCALLY through the shared
// validators (meta.settleArenaMatch), the same claim is reported to /api/arena/report so the
// server ladder stays the cross-device truth. Offline / guest / errored calls change nothing —
// the local settle already happened; the server reconciles when it can (exactly-once by
// matchId on BOTH sides, so double delivery is free).

import { guestModeActive } from '../state/guestMode';
import { playerId } from './identity';
import { guard } from '../security/actionGuard';
import { turnstileToken } from './turnstile';
import type { ArenaMatchClaim } from '../core/arena';

export interface ArenaServerVerdict {
  ok: boolean;
  duplicate?: boolean;
  rating?: number;
  delta?: number;
  division?: string;
  placements?: number;
}

/** Report one settled match. Best-effort: null = offline/guest/refused (perfectly fine). */
export async function reportArenaMatch(claim: ArenaMatchClaim): Promise<ArenaServerVerdict | null> {
  if (guestModeActive()) return null; // guests never touch the server ladder
  // Client-side courtesy budget (the server enforces its own rate limit + bounds).
  if (!guard('arena.report', claim.matchId).ok) return null;
  try {
    const res = await fetch('/api/arena/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: playerId(), claim, turnstileToken: await turnstileToken() }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ArenaServerVerdict;
  } catch {
    return null; // offline — the local settle stands; sync reconciles later
  }
}

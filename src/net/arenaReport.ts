// Arena settlement reporter (docs/ARENA.md §7, docs/ONLINE-FOUNDATION.md §4) — the fail-soft
// bridge to the server-authoritative lane: after a match settles LOCALLY through the shared
// validators (meta.settleArenaMatch), the same claim is reported to /api/arena/report so the
// server ladder stays the cross-device truth. Offline / guest / errored calls change nothing —
// the local settle already happened; the server reconciles when it can (exactly-once by
// matchId on BOTH sides, so double delivery is free).

import { guestModeActive } from '../state/guestMode';
import { meta } from '../state/meta';
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
      // The name rides for the season ladder display (sanitized server-side; the tag never
      // does — it derives from the stored player id, docs/ARENA.md §ladder).
      body: JSON.stringify({ playerId: playerId(), claim, name: meta.get().profileName, turnstileToken: await turnstileToken() }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ArenaServerVerdict;
  } catch {
    return null; // offline — the local settle stands; sync reconciles later
  }
}

// ── The season ladder read (docs/ARENA.md §ladder) ─────────────────────────────
export interface ArenaLadderEntry {
  rank: number;
  name: string;
  tag: string;
  rating: number;
  division: string;
  wins: number;
  losses: number;
  peak: number;
}

export interface ArenaLadderView {
  season: number;
  entries: ArenaLadderEntry[];
  you: { rank: number; rating: number; wins: number; losses: number } | null;
}

/** Fetch the current season's ladder. Fail-soft: null = offline/guest (the screen says so). */
export async function fetchArenaLadder(): Promise<ArenaLadderView | null> {
  if (guestModeActive()) return null;
  try {
    const res = await fetch(`/api/arena/ladder?playerId=${encodeURIComponent(playerId())}`);
    if (!res.ok) return null;
    return (await res.json()) as ArenaLadderView;
  } catch {
    return null;
  }
}

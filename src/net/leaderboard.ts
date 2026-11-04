// Leaderboard client (docs/DEPLOYMENT.md §leaderboards). Fail-soft everywhere:
// offline or errored calls change nothing about the run experience. Submission
// is best-per-player serverside; the client additionally remembers what it last
// sent (localStorage, non-authoritative) to avoid noisy resubmits.

import { meta } from '../state/meta';
import { guestModeActive } from '../state/guestMode';
import { dailyKey } from '../core/daily';
import { monthKey, weekKey } from '../core/accountLevel';
import { playerId } from './identity';
import { guard } from '../security/actionGuard';
import { turnstileToken } from './turnstile';

export type LbMode = 'daily' | 'bossRush' | 'accountLevel' | 'weeklyXp' | 'monthlyXp' | 'genomeRating';

export interface LbEntry {
  rank: number;
  name: string;
  /** Register number (docs/PROFILE.md §designation-tags) — server-derived from the row's
   *  player_id, so duplicate display names stay tellable apart. Absent on old responses. */
  tag?: string;
  score: number;
  wave: number;
  power: number;
  verified?: boolean; // replay re-simulated server-side and matched (docs/SECURITY-AUDIT.md R1)
}

export interface LbView {
  mode: LbMode;
  dayKey: string;
  total: number;
  entries: LbEntry[];
  you: { rank: number; score: number; wave: number } | null;
}

/** The Boss Rush board's record epoch (docs/BOSS-RUSH.md §epoch) — mirrors functions/lib/period.ts
 *  (the server derives the bucket itself; a test pins the two equal). */
export const RUSH_BOARD_EPOCH = 'wall-1';

const SENT_KEY = 'assimilate.lb.sent';

function sentMap(): Record<string, number> {
  try {
    const o = JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}');
    return o && typeof o === 'object' ? (o as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function rememberSent(key: string, score: number): void {
  try {
    const m = sentMap();
    m[key] = score;
    localStorage.setItem(SENT_KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable — resubmits are harmless (server keeps best) */
  }
}

/** The player's current submittable claim for a mode, from the save ledgers.
 *  Account boards (docs/ACCOUNT-LEVEL.md §leaderboards): `score` carries XP (all-time or the
 *  period ledger — strictly monotonic, so keep-best upserts are exact) and `wave` carries the
 *  account LEVEL for display. The period boards skip stale ledgers (key mismatch = no play
 *  this week/month yet, nothing to say). */
export function currentClaim(mode: LbMode): { score: number; wave: number; dayKey: string } | null {
  const save = meta.get();
  if (mode === 'daily') {
    const key = dailyKey();
    if (save.daily.lastKey !== key || save.daily.lastWave <= 0) return null; // no attempt today
    return { score: save.daily.lastWave, wave: save.daily.lastWave, dayKey: key };
  }
  if (mode === 'accountLevel' || mode === 'weeklyXp' || mode === 'monthlyXp') {
    const level = meta.accountLevel().level;
    if (mode === 'accountLevel') {
      return save.accountXp.xp > 0 ? { score: save.accountXp.xp, wave: level, dayKey: '' } : null;
    }
    const ledger = mode === 'weeklyXp' ? save.accountXp.week : save.accountXp.month;
    const key = mode === 'weeklyXp' ? weekKey(Date.now()) : monthKey(Date.now());
    if (ledger.key !== key || ledger.xp <= 0) return null;
    return { score: ledger.xp, wave: level, dayKey: key };
  }
  if (mode === 'genomeRating') {
    const v = meta.genomeRank(); // rating derives from the whole save; keep-best is exact
    return v.rating > 0 ? { score: v.rating, wave: v.index, dayKey: '' } : null;
  }
  if (save.rushBestBoss <= 0) return null;
  // The record epoch keys the "already sent" memory too, so a pre-wall send can't mute new claims.
  return { score: save.rushBestBoss, wave: save.rushBestWave, dayKey: RUSH_BOARD_EPOCH };
}

/** Submit the current best for `mode` if it improved since the last submission.
 *  Daily entries fetch a day ticket first (server-authoritative day binding). */
export async function maybeSubmitBest(mode: LbMode): Promise<void> {
  if (guestModeActive()) return; // Guest Mode never appears on the standings (no name, no server data)
  const claim = currentClaim(mode);
  if (!claim) return;
  const sentKey = `${mode}:${claim.dayKey}`;
  if ((sentMap()[sentKey] ?? 0) >= claim.score) return; // nothing new to say
  // Security layer (docs/SECURITY.md): a strict client budget on submissions — the SERVER is
  // the truth (replay re-simulation, best-per-player); this just refuses to be noisy.
  if (!guard('leaderboard.submit', `${sentKey}:${claim.score}`).ok) return;
  try {
    let ticket: string | undefined;
    if (mode === 'daily') {
      const seedRes = await fetch(`/api/daily/seed?playerId=${encodeURIComponent(playerId())}`);
      const seed = (await seedRes.json().catch(() => null)) as { dayKey?: string; ticket?: string } | null;
      if (!seedRes.ok || seed?.dayKey !== claim.dayKey) return; // clock disagreement — silently skip
      ticket = seed.ticket;
    }
    const save = meta.get();
    const res = await fetch('/api/leaderboard/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        playerId: playerId(),
        name: save.profileName || 'Anonymous',
        mode,
        dayKey: mode === 'daily' ? claim.dayKey : undefined,
        score: claim.score,
        wave: claim.wave,
        power: Math.round(meta.power().score),
        ticket,
        turnstileToken: await turnstileToken(),
        // Daily: today's best-run input log (docs/SECURITY-AUDIT.md R1) — lets the
        // operator re-run the claim server-side. Absent ⇒ the entry stays unverifiable.
        replay: mode === 'daily' ? save.daily.lastReplay ?? undefined : undefined,
      }),
    });
    if (res.ok) rememberSent(sentKey, claim.score);
  } catch {
    /* offline — try again next visit */
  }
}

export async function fetchTop(mode: LbMode): Promise<LbView | null> {
  try {
    const day = mode === 'daily' ? `&dayKey=${dailyKey()}` : '';
    const res = await fetch(`/api/leaderboard/top?mode=${mode}${day}&playerId=${encodeURIComponent(playerId())}`);
    if (!res.ok) return null;
    return (await res.json()) as LbView;
  } catch {
    return null;
  }
}

// LIVEOPS CALENDAR (docs/LIVEOPS.md) — the retention heartbeat, entirely client-side
// and DETERMINISTIC from UTC time (every player sees the same calendar; no server).
//
// An event is a pure window predicate + a small bag of reward multipliers that fold
// into finishRun through liveopsMods(). Everything defaults to ×1 outside windows, so
// the framework is inert unless a window is live. Adding an event = one registry row.
//
// TIME DISCIPLINE: gameplay-outcome tests must never depend on the wall clock, so the
// module clock is PINNED to a fixed Tuesday under vitest (import.meta MODE 'test');
// the liveops tests exercise the pure functions with explicit dates.

export interface LiveEventDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  accent: string; // CSS color token/value for the strip chip
  /** Pure UTC schedule — no state, no randomness. */
  active: (d: Date) => boolean;
  /** Reward folds (all optional; absent = ×1). Applied in meta.finishRun. */
  mods: { dailyCoreMult?: number; rushShardMult?: number; endlessShardMult?: number; campaignShardMult?: number };
}

const utcDay = (d: Date): number => d.getUTCDay(); // 0 Sun … 6 Sat
/** ISO-ish week index — stable rotation key (days since epoch Monday / 7). */
export const weekIndex = (d: Date): number => Math.floor((Math.floor(d.getTime() / 86_400_000) + 3) / 7);

/** The rotating weekly SPOTLIGHT — one mode gets its week, forever, deterministically. */
const SPOTLIGHTS = ['rush', 'depth', 'descent'] as const;
export const spotlightOf = (d: Date): (typeof SPOTLIGHTS)[number] => SPOTLIGHTS[weekIndex(d) % SPOTLIGHTS.length];

/** All scheduled events — the calendar is DATA. */
export const LIVE_EVENTS: LiveEventDef[] = [
  {
    id: 'weekend_surge',
    name: 'Weekend Surge',
    desc: 'The hive feeds well: Daily Run clear rewards ×1.5 all weekend (UTC).',
    icon: '☀',
    accent: 'var(--gold)',
    active: (d) => utcDay(d) === 6 || utcDay(d) === 0,
    mods: { dailyCoreMult: 1.5 },
  },
  {
    id: 'rush_week',
    name: 'Gauntlet Week',
    desc: 'Boss Rush spotlight: gauntlet Genome Core rewards ×1.25 this week.',
    icon: '☠',
    accent: 'var(--vital)',
    active: (d) => spotlightOf(d) === 'rush',
    mods: { rushShardMult: 1.25 },
  },
  {
    id: 'depth_week',
    name: 'Depth Week',
    desc: 'Infinite spotlight: descent Genome Core rewards ×1.25 this week.',
    icon: '∞',
    accent: 'var(--kinetic)',
    active: (d) => spotlightOf(d) === 'depth',
    mods: { endlessShardMult: 1.25 },
  },
  {
    id: 'descent_week',
    name: 'Campaign Offensive',
    desc: 'Campaign spotlight: stage Genome Core rewards ×1.15 this week.',
    icon: '⬡',
    accent: 'var(--caustic)',
    active: (d) => spotlightOf(d) === 'descent',
    mods: { campaignShardMult: 1.15 },
  },
];

// Wall clock — pinned to a fixed TUESDAY under tests so no gameplay assertion ever
// depends on which day CI runs (liveops' own tests pass explicit dates instead).
const FIXED_TEST_NOW = Date.UTC(2026, 0, 6, 12, 0, 0); // Tue 2026-01-06 — no windows beyond the rotation
const isTest = typeof import.meta !== 'undefined' && (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test';
export function liveopsNow(): Date {
  return new Date(isTest ? FIXED_TEST_NOW : Date.now());
}

export function activeEvents(d: Date = liveopsNow()): LiveEventDef[] {
  return LIVE_EVENTS.filter((e) => e.active(d));
}

export interface LiveopsMods {
  dailyCoreMult: number;
  rushShardMult: number;
  endlessShardMult: number;
  campaignShardMult: number;
}

/** Fold every live window into one multiplier bag (×1 baseline everywhere). */
export function liveopsMods(d: Date = liveopsNow()): LiveopsMods {
  const m: LiveopsMods = { dailyCoreMult: 1, rushShardMult: 1, endlessShardMult: 1, campaignShardMult: 1 };
  for (const e of activeEvents(d)) {
    m.dailyCoreMult *= e.mods.dailyCoreMult ?? 1;
    m.rushShardMult *= e.mods.rushShardMult ?? 1;
    m.endlessShardMult *= e.mods.endlessShardMult ?? 1;
    m.campaignShardMult *= e.mods.campaignShardMult ?? 1;
  }
  return m;
}

/** Days (ceil) until the NEXT weekend surge — the strip's "coming up" line. */
export function daysToWeekend(d: Date = liveopsNow()): number {
  const day = utcDay(d);
  if (day === 6 || day === 0) return 0;
  return 6 - day;
}

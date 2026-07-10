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

/** The reward lanes an event may boost (all optional; absent = ×1). Core lanes fold in
 *  meta.finishRun; essence/materials fold where those rewards are BORN (finishRun's doctrine
 *  essence + openContainer's essence/material drops), so reveal amounts always match grants. */
export interface LiveEventMods {
  dailyCoreMult?: number;
  rushShardMult?: number;
  endlessShardMult?: number;
  campaignShardMult?: number;
  essenceMult?: number; // Gene Essence income (container conversion/drops/bleed + doctrine essence)
  materialsMult?: number; // the container bonus material drop (mutagen/scrap/catalyst)
}

export interface LiveEventDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  accent: string; // CSS color token/value for the console card
  /** Pure UTC schedule — no state, no randomness. Day-granular (changes only at UTC midnight). */
  active: (d: Date) => boolean;
  mods: LiveEventMods;
}

/** Short display label per lane — the console derives its "×1.5 Daily Cores" boost chips from
 *  the def's mods bag through this map, so a NEW lane surfaces in the UI with zero UI work. */
export const LANE_LABELS: Record<keyof LiveEventMods, string> = {
  dailyCoreMult: 'Daily Cores',
  rushShardMult: 'Rush Cores',
  endlessShardMult: 'Infinite Cores',
  campaignShardMult: 'Campaign Cores',
  essenceMult: 'Gene Essence',
  materialsMult: 'Materials',
};

/** An event's boosts as display rows (label + multiplier), data-driven from its mods bag. */
export function eventBoosts(e: LiveEventDef): { label: string; mult: number }[] {
  return (Object.keys(LANE_LABELS) as (keyof LiveEventMods)[])
    .filter((k) => (e.mods[k] ?? 1) !== 1)
    .map((k) => ({ label: LANE_LABELS[k], mult: e.mods[k] as number }));
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
  {
    // The midweek beat — fills the Mon–Fri dead zone between weekends with a reason to log in.
    id: 'mutation_day',
    name: 'Mutation Wednesday',
    desc: 'Midweek instability: Gene Essence from containers and runs ×1.5 today (UTC).',
    icon: '⌬',
    accent: 'var(--caustic)',
    active: (d) => utcDay(d) === 3,
    mods: { essenceMult: 1.5 },
  },
  {
    // The monthly peak — the first three days of every UTC month fatten crafting income.
    id: 'harvest_moon',
    name: 'Harvest Moon',
    desc: 'The month opens fat: container material drops ×1.5 on the 1st–3rd (UTC).',
    icon: '⊕',
    accent: 'var(--viral)',
    active: (d) => d.getUTCDate() <= 3,
    mods: { materialsMult: 1.5 },
  },
  {
    // The quarterly season — the date-range seam made real. Stacks multiplicatively with
    // whatever weekly/daily windows it overlaps (that's the festival).
    id: 'bloom_cycle',
    name: 'Bloom Cycle',
    desc: 'Quarterly bloom: every Genome Core lane ×1.1 and Gene Essence ×1.25, the 21st–27th of Mar/Jun/Sep/Dec (UTC).',
    icon: '✿',
    accent: 'var(--vital)',
    active: (d) => [2, 5, 8, 11].includes(d.getUTCMonth()) && d.getUTCDate() >= 21 && d.getUTCDate() <= 27,
    mods: { dailyCoreMult: 1.1, rushShardMult: 1.1, endlessShardMult: 1.1, campaignShardMult: 1.1, essenceMult: 1.25 },
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

/** The folded multiplier bag — every lane REQUIRED (×1 baseline), so consumers never branch. */
export type LiveopsMods = Required<LiveEventMods>;

/** Fold every live window into one multiplier bag (×1 baseline everywhere). Overlapping
 *  windows stack multiplicatively — a weekend inside the Bloom Cycle IS the festival. */
export function liveopsMods(d: Date = liveopsNow()): LiveopsMods {
  const m: LiveopsMods = { dailyCoreMult: 1, rushShardMult: 1, endlessShardMult: 1, campaignShardMult: 1, essenceMult: 1, materialsMult: 1 };
  for (const e of activeEvents(d)) {
    for (const k of Object.keys(LANE_LABELS) as (keyof LiveEventMods)[]) m[k] *= e.mods[k] ?? 1;
  }
  return m;
}

/** Days (ceil) until the NEXT weekend surge — the strip's "coming up" line. */
export function daysToWeekend(d: Date = liveopsNow()): number {
  const day = utcDay(d);
  if (day === 6 || day === 0) return 0;
  return 6 - day;
}

// ── Schedule engine (docs/LIVEOPS.md §forecast) ──────────────────────────────
// Generic over ANY pure predicate: window edges are found by scanning forward in
// UTC-hour steps, so "adding an event = one registry row" still holds — the console's
// countdowns and UP-NEXT forecast need no per-event schedule code. Every shipped
// window is day-granular (edges at UTC midnight), which hour scanning lands exactly.

const HOUR_MS = 3_600_000;

/** The next top-of-hour at/after `d` (predicates only change on hour boundaries or coarser). */
function nextHourEdge(d: Date): number {
  return Math.ceil((d.getTime() + 1) / HOUR_MS) * HOUR_MS;
}

/** When the window containing `d` ENDS (first boundary where the event goes inactive).
 *  Call only while `def.active(d)` — scans at most `horizonDays` ahead (safety bound). */
export function windowEnd(def: LiveEventDef, d: Date, horizonDays = 35): Date {
  let t = nextHourEdge(d);
  const stop = d.getTime() + horizonDays * 24 * HOUR_MS;
  while (t <= stop && def.active(new Date(t))) t += HOUR_MS;
  return new Date(t);
}

export interface UpcomingWindow {
  def: LiveEventDef;
  startsAt: Date;
  endsAt: Date;
}

/** The event's NEXT window strictly after `d` (null if none within the horizon). If `d` is
 *  inside a window, that window is skipped — this is the FORECAST, not the live state. */
export function nextWindow(def: LiveEventDef, d: Date, horizonDays = 35): UpcomingWindow | null {
  let t = nextHourEdge(d);
  const stop = d.getTime() + horizonDays * 24 * HOUR_MS;
  while (t <= stop && def.active(new Date(t))) t += HOUR_MS; // leave the current window first
  while (t <= stop && !def.active(new Date(t))) t += HOUR_MS; // then find the next rise
  if (t > stop) return null;
  const startsAt = new Date(t);
  return { def, startsAt, endsAt: windowEnd(def, startsAt, horizonDays) };
}

export interface LiveWindow {
  def: LiveEventDef;
  endsAt: Date;
}

/** Everything live at `d`, each with its window end — the console's countdown source. */
export function liveWindows(d: Date = liveopsNow()): LiveWindow[] {
  return activeEvents(d).map((def) => ({ def, endsAt: windowEnd(def, d) }));
}

/** The forecast: every INACTIVE event's next window inside the horizon, soonest first. */
export function upcomingWindows(d: Date = liveopsNow(), horizonDays = 35): UpcomingWindow[] {
  return LIVE_EVENTS
    .filter((e) => !e.active(d))
    .map((e) => nextWindow(e, d, horizonDays))
    .filter((w): w is UpcomingWindow => w !== null)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Compact "2d 14h" / "3h" / "<1h" countdown text (UTC-difference, minute-blind by design —
 *  liveops windows are day-granular, so minute precision would be noise). */
export function untilText(from: Date, to: Date): string {
  const ms = Math.max(0, to.getTime() - from.getTime());
  const hours = Math.floor(ms / HOUR_MS);
  if (hours < 1) return '<1h';
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  if (days === 0) return `${rem}h`;
  return rem === 0 ? `${days}d` : `${days}d ${rem}h`;
}

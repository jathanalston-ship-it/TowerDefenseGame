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
  megaIchorMult?: number; // Ichor from Mega Boss kills (docs/MEGA-BOSS.md §rewards)
  lootMult?: number; // in-run loot-point income → richer Bio-Containers
}

/** The broadcast band an event belongs to — the console groups + sorts by this, and a NEW
 *  event lands in the right lane with zero UI work. `peak` events (festival/seasonal) sort
 *  first, then `spotlight` (the always-live weekly), then the recurring `surge` beats. */
export type LiveEventCategory = 'peak' | 'spotlight' | 'surge' | 'hunt';

export interface LiveEventDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  accent: string; // CSS color token/value for the console card
  category: LiveEventCategory;
  /** Pure UTC schedule — no state, no randomness. Day-granular (changes only at UTC midnight). */
  active: (d: Date) => boolean;
  mods: LiveEventMods;
}

/** Console sort weight — peaks headline, spotlights anchor, surges/hunts fill. */
export const CATEGORY_ORDER: Record<LiveEventCategory, number> = { peak: 0, spotlight: 1, hunt: 2, surge: 3 };

/** Short display label per lane — the console derives its "×1.5 Daily Cores" boost chips from
 *  the def's mods bag through this map, so a NEW lane surfaces in the UI with zero UI work. */
export const LANE_LABELS: Record<keyof LiveEventMods, string> = {
  dailyCoreMult: 'Daily Cores',
  rushShardMult: 'Rush Cores',
  endlessShardMult: 'Infinite Cores',
  campaignShardMult: 'Campaign Cores',
  essenceMult: 'Gene Essence',
  materialsMult: 'Materials',
  megaIchorMult: 'Mega Ichor',
  lootMult: 'Loot',
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

/** The rotating weekly SPOTLIGHT — one mode gets its week, forever, deterministically. The
 *  'apex' slot spotlights the raid roster (Mega Ichor) rather than a mode's core lane. */
const SPOTLIGHTS = ['rush', 'depth', 'descent', 'apex'] as const;
export const spotlightOf = (d: Date): (typeof SPOTLIGHTS)[number] => SPOTLIGHTS[weekIndex(d) % SPOTLIGHTS.length];

/** All scheduled events — the calendar is DATA. */
export const LIVE_EVENTS: LiveEventDef[] = [
  {
    id: 'weekend_surge',
    name: 'Weekend Surge',
    desc: 'The hive feeds well: Daily Run clear rewards ×1.5 all weekend (UTC).',
    icon: '☀',
    accent: 'var(--gold)',
    category: 'surge',
    active: (d) => utcDay(d) === 6 || utcDay(d) === 0,
    mods: { dailyCoreMult: 1.5 },
  },
  {
    id: 'rush_week',
    name: 'Gauntlet Week',
    desc: 'Boss Rush spotlight: gauntlet Genome Core rewards ×1.25 this week.',
    icon: '☠',
    accent: 'var(--vital)',
    category: 'spotlight',
    active: (d) => spotlightOf(d) === 'rush',
    mods: { rushShardMult: 1.25 },
  },
  {
    id: 'depth_week',
    name: 'Depth Week',
    desc: 'Infinite spotlight: descent Genome Core rewards ×1.25 this week.',
    icon: '∞',
    accent: 'var(--kinetic)',
    category: 'spotlight',
    active: (d) => spotlightOf(d) === 'depth',
    mods: { endlessShardMult: 1.25 },
  },
  {
    id: 'descent_week',
    name: 'Campaign Offensive',
    desc: 'Campaign spotlight: stage Genome Core rewards ×1.15 this week.',
    icon: '⬡',
    accent: 'var(--caustic)',
    category: 'spotlight',
    active: (d) => spotlightOf(d) === 'descent',
    mods: { campaignShardMult: 1.15 },
  },
  {
    // The raid spotlight — the 4th rotation slot; the whole roster of Mega Bosses pays out heavier.
    id: 'apex_week',
    name: 'Apex Week',
    desc: 'Raid spotlight: Mega Boss Ichor ×1.4 this week — hunt the big organisms.',
    icon: '⬣',
    accent: 'var(--viral)',
    category: 'spotlight',
    active: (d) => spotlightOf(d) === 'apex',
    mods: { megaIchorMult: 1.4 },
  },
  {
    // The midweek beat — fills the Mon–Fri dead zone between weekends with a reason to log in.
    id: 'mutation_day',
    name: 'Mutation Wednesday',
    desc: 'Midweek instability: Gene Essence from containers and runs ×1.5 today (UTC).',
    icon: '⌬',
    accent: 'var(--caustic)',
    category: 'surge',
    active: (d) => utcDay(d) === 3,
    mods: { essenceMult: 1.5 },
  },
  {
    // A second recurring surge (Tue/Thu) — the Living Battlefield's spore bloom fattens loot.
    id: 'spore_tide',
    name: 'Spore Tide',
    desc: 'Drifting spores enrich every haul: in-run loot ×1.3 on Tuesday and Thursday (UTC).',
    icon: '❋',
    accent: 'var(--vital)',
    category: 'surge',
    active: (d) => utcDay(d) === 2 || utcDay(d) === 4,
    mods: { lootMult: 1.3 },
  },
  {
    // A Friday hunt beat — the raid roster gets a one-day teaser between spotlights.
    id: 'prime_hunt',
    name: 'Prime Hunt',
    desc: 'Fridays belong to the raid: Mega Boss Ichor ×1.5 today (UTC).',
    icon: '◈',
    accent: 'var(--kinetic)',
    category: 'hunt',
    active: (d) => utcDay(d) === 5,
    mods: { megaIchorMult: 1.5 },
  },
  {
    // The monthly peak — the first three days of every UTC month fatten crafting income.
    id: 'harvest_moon',
    name: 'Harvest Moon',
    desc: 'The month opens fat: container material drops ×1.5 on the 1st–3rd (UTC).',
    icon: '⊕',
    accent: 'var(--viral)',
    category: 'peak',
    active: (d) => d.getUTCDate() <= 3,
    mods: { materialsMult: 1.5 },
  },
  {
    // The mid-month materials + loot beat (11th–13th) — a second monthly reason to grind gear.
    id: 'reclamation',
    name: 'Reclamation Days',
    desc: 'Mid-month salvage bloom: container materials ×1.35 and loot ×1.2 on the 11th–13th (UTC).',
    icon: '⧗',
    accent: 'var(--gold)',
    category: 'peak',
    active: (d) => d.getUTCDate() >= 11 && d.getUTCDate() <= 13,
    mods: { materialsMult: 1.35, lootMult: 1.2 },
  },
  {
    // The quarterly season — the date-range seam made real. Stacks multiplicatively with
    // whatever weekly/daily windows it overlaps (that's the festival).
    id: 'bloom_cycle',
    name: 'Bloom Cycle',
    desc: 'Quarterly bloom: every Genome Core lane ×1.1, Gene Essence ×1.25 and Mega Ichor ×1.25, the 21st–27th of Mar/Jun/Sep/Dec (UTC).',
    icon: '✿',
    accent: 'var(--vital)',
    category: 'peak',
    active: (d) => [2, 5, 8, 11].includes(d.getUTCMonth()) && d.getUTCDate() >= 21 && d.getUTCDate() <= 27,
    mods: { dailyCoreMult: 1.1, rushShardMult: 1.1, endlessShardMult: 1.1, campaignShardMult: 1.1, essenceMult: 1.25, megaIchorMult: 1.25 },
  },
];

// Wall clock — pinned to a fixed MONDAY under tests so no gameplay assertion ever depends on
// which day CI runs (liveops' own tests pass explicit dates instead). The date is chosen so the
// ONLY active window is the mode SPOTLIGHT — and specifically the 'depth' spotlight, whose sole
// lane (endlessShardMult) a stage-mode gameplay run never reads. So liveopsMods() is effectively
// gameplay-neutral here: golden/meta/persona runs see ×1 on every lane they actually consume.
// (Every calendar addition MUST keep this Monday to that one spotlight — a pinned test asserts it.)
const FIXED_TEST_NOW = Date.UTC(2026, 0, 19, 12, 0, 0); // Mon 2026-01-19 — 'depth' spotlight only
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
  const m: LiveopsMods = { dailyCoreMult: 1, rushShardMult: 1, endlessShardMult: 1, campaignShardMult: 1, essenceMult: 1, materialsMult: 1, megaIchorMult: 1, lootMult: 1 };
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

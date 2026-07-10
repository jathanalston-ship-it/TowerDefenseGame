// WEEKLY DIRECTIVES (docs/LIVEOPS.md §directives) — the cumulative engagement ladder, the
// retention layer between the passive event calendar and the single-run Champion Contracts.
// Where a Contract is "do X in ONE run", a Directive is "do X ACROSS the week" — progress
// banks from every run's facts, milestone rewards claim as you cross the targets, and clearing
// the whole board unlocks a weekly CAPSTONE. Deterministic + UTC-weekly like the rest of
// liveops: three directives + the capstone rotate on the same week index, every player sees the
// same board, no server.
//
// A directive is a tiny DATA vocabulary (metric + target + reward). Adding one is a registry
// row; adding a metric is one case in `directiveDelta`. Golden-safe by construction: a fresh
// save has zero progress and every reward is meta-only, so no sim or pinned-seed run moves.

import { weekIndex, liveopsNow } from './liveops';
import type { RunStats } from './types';

/** What a directive counts, accumulated across every run in the week. */
export type DirectiveMetric =
  | 'kills' // enemies slain
  | 'wins' // runs won (any mode)
  | 'waves' // total waves cleared (sum of run depths)
  | 'bossKills' // framework bosses felled
  | 'megaKills' // Mega Bosses felled
  | 'weakPoints' // Mega weak points burst
  | 'damage' // total damage dealt (millions, floored)
  | 'flawless' // runs won without losing Nucleus integrity
  | 'towers'; // towers built

/** The reward a milestone/capstone pays — meta-only currencies (never a gameplay passive). */
export interface DirectiveReward {
  cores?: number;
  essence?: number;
  container?: boolean; // a premium Bio-Container (kind:'cache')
}

export interface DirectiveDef {
  id: string;
  name: string;
  blurb: string; // the pitch in plain language
  icon: string;
  metric: DirectiveMetric;
  target: number;
  reward: DirectiveReward;
}

/** The authored pool — the weekly board strides 3 rows through it (plus the shared capstone). */
export const DIRECTIVE_POOL: DirectiveDef[] = [
  { id: 'cull', name: 'Cull the Swarm', blurb: 'Slay 2,000 enemies across the week.', icon: '⚔', metric: 'kills', target: 2000, reward: { cores: 200 } },
  { id: 'persistence', name: 'Persistence', blurb: 'Win 8 runs in any mode this week.', icon: '✔', metric: 'wins', target: 8, reward: { cores: 220 } },
  { id: 'deep_runner', name: 'Deep Runner', blurb: 'Clear 120 waves in total this week.', icon: '↧', metric: 'waves', target: 120, reward: { cores: 180, essence: 40 } },
  { id: 'apex_hunter', name: 'Apex Hunter', blurb: 'Fell 3 Mega Bosses this week.', icon: '⬣', metric: 'megaKills', target: 3, reward: { cores: 260, container: true } },
  { id: 'tyrant_slayer', name: 'Tyrant Slayer', blurb: 'Fell 10 framework bosses this week.', icon: '☠', metric: 'bossKills', target: 10, reward: { cores: 220 } },
  { id: 'surgeon', name: 'The Surgeon', blurb: 'Burst 20 Mega weak points this week.', icon: '◎', metric: 'weakPoints', target: 20, reward: { cores: 200, essence: 30 } },
  { id: 'annihilation', name: 'Annihilation', blurb: 'Deal 50 million total damage this week.', icon: '✷', metric: 'damage', target: 50, reward: { cores: 200 } },
  { id: 'untouchable', name: 'Untouchable', blurb: 'Win 4 runs without losing Nucleus integrity.', icon: '❖', metric: 'flawless', target: 4, reward: { cores: 240, essence: 40 } },
  { id: 'architect', name: 'The Architect', blurb: 'Build 60 towers across the week.', icon: '⌂', metric: 'towers', target: 60, reward: { cores: 160 } },
];

export const DIRECTIVES_PER_WEEK = 3;

/** The shared weekly CAPSTONE — pays when all three of the week's directives are complete. */
export const DIRECTIVE_CAPSTONE: DirectiveReward & { name: string; icon: string } = {
  name: 'Weekly Mandate', icon: '❇', cores: 300, essence: 60, container: true,
};

/** This week's three directives — a stable window over the pool, striding by week index (a
 *  different stride from Contracts so the two boards don't move in lockstep). */
export function activeDirectives(d: Date = liveopsNow()): DirectiveDef[] {
  const offset = (weekIndex(d) * DIRECTIVES_PER_WEEK) % DIRECTIVE_POOL.length;
  return Array.from({ length: DIRECTIVES_PER_WEEK }, (_, i) => DIRECTIVE_POOL[(offset + i) % DIRECTIVE_POOL.length]);
}

/** The ledger key for this week's board (save.directives.week). Rolls at UTC week boundaries. */
export function directiveWeekKey(d: Date = liveopsNow()): string {
  return `w${weekIndex(d)}`;
}

/** How much a single run's facts advance a metric — the accumulation vocabulary. Pure. */
export function directiveDelta(metric: DirectiveMetric, s: RunStats): number {
  switch (metric) {
    case 'kills': return Math.max(0, s.kills);
    case 'wins': return s.won ? 1 : 0;
    case 'waves': return Math.max(0, s.wave);
    case 'bossKills': return Math.max(0, s.bossKills ?? 0);
    case 'megaKills': return s.megaKills?.length ?? 0;
    case 'weakPoints': return Math.max(0, s.weakPointsDestroyed ?? 0);
    case 'damage': return Math.floor(Math.max(0, s.damageDealt) / 1_000_000); // targets are in millions
    case 'flawless': return s.won && s.integrityLost <= 0 ? 1 : 0;
    case 'towers': return Object.values(s.towerBuilds).reduce((a: number, n) => a + Math.max(0, n ?? 0), 0);
  }
}

/** Fold a finished run's facts into a progress map (id → accumulated value), returning the
 *  NEXT map (never mutates). Only the week's active directives accumulate. Pure. */
export function accrueDirectives(progress: Record<string, number>, s: RunStats, d: Date = liveopsNow()): Record<string, number> {
  const next = { ...progress };
  for (const def of activeDirectives(d)) {
    const add = directiveDelta(def.metric, s);
    if (add > 0) next[def.id] = Math.min(def.target, (next[def.id] ?? 0) + add);
  }
  return next;
}

export interface DirectiveState {
  def: DirectiveDef;
  progress: number;
  complete: boolean;
  claimed: boolean;
}

/** The board view: each active directive with its live progress + claim state, computed from
 *  the ledger. `claimedIds` are `<weekKey>:<id>` entries. */
export function directiveBoard(progress: Record<string, number>, claimedIds: readonly string[], d: Date = liveopsNow()): DirectiveState[] {
  const wk = directiveWeekKey(d);
  return activeDirectives(d).map((def) => {
    const p = Math.min(def.target, progress[def.id] ?? 0);
    return { def, progress: p, complete: p >= def.target, claimed: claimedIds.includes(`${wk}:${def.id}`) };
  });
}

/** Is the capstone earned (all three complete) but not yet claimed? */
export function capstoneState(progress: Record<string, number>, claimedIds: readonly string[], d: Date = liveopsNow()): { earned: boolean; claimed: boolean } {
  const board = directiveBoard(progress, claimedIds, d);
  const earned = board.length > 0 && board.every((b) => b.complete);
  const claimed = claimedIds.includes(`${directiveWeekKey(d)}:__capstone`);
  return { earned, claimed };
}

/** Registry hygiene (tests): every pool row is complete, targets positive, rewards meaningful. */
export function directiveProblems(def: DirectiveDef): string[] {
  const out: string[] = [];
  if (!def.id || !def.name) out.push('missing id/name');
  if (!(def.target > 0)) out.push(`${def.id}: target must be > 0`);
  const r = def.reward;
  if (!((r.cores ?? 0) > 0 || (r.essence ?? 0) > 0 || r.container)) out.push(`${def.id}: reward must pay something`);
  return out;
}

// WEEKLY DIRECTIVES (docs/LIVEOPS.md §directives) — deterministic rotation, cumulative
// accrual from run facts, board/capstone state, and registry hygiene. Pure functions with
// explicit dates (never the wall clock), same discipline as the liveops calendar tests.

import { describe, expect, it } from 'vitest';
import {
  DIRECTIVE_POOL, DIRECTIVES_PER_WEEK, accrueDirectives, activeDirectives, capstoneState,
  directiveBoard, directiveDelta, directiveProblems, directiveWeekKey,
} from './directives';
import type { RunStats } from './types';

const WK1 = new Date(Date.UTC(2026, 0, 19, 12)); // a Monday
const WK2 = new Date(Date.UTC(2026, 0, 26, 12)); // the next week

const facts = (over: Partial<RunStats> = {}): RunStats => ({
  kills: 0, wave: 0, won: false, biomassEarned: 0, damageDealt: 0, integrityLost: 0,
  killsByEnemy: {} as RunStats['killsByEnemy'], towerBuilds: {} as RunStats['towerBuilds'],
  cardIds: [], heroId: 'ravager', ...over,
});

describe('directive rotation (deterministic, UTC-weekly)', () => {
  it('serves three directives, striding by week, wrapping the pool', () => {
    const a = activeDirectives(WK1);
    expect(a.length).toBe(DIRECTIVES_PER_WEEK);
    expect(new Set(a.map((d) => d.id)).size).toBe(DIRECTIVES_PER_WEEK); // no dupes in a week
    const b = activeDirectives(WK2);
    expect(a.map((d) => d.id)).not.toEqual(b.map((d) => d.id)); // the board moves week to week
    // every pool row is reachable across enough weeks
    const seen = new Set<string>();
    for (let w = 0; w < DIRECTIVE_POOL.length; w++) {
      for (const d of activeDirectives(new Date(WK1.getTime() + w * 7 * 86_400_000))) seen.add(d.id);
    }
    expect(seen.size).toBe(DIRECTIVE_POOL.length);
  });
  it('the week key rolls at the week boundary', () => {
    expect(directiveWeekKey(WK1)).toMatch(/^w\d+$/);
    expect(directiveWeekKey(WK2)).not.toBe(directiveWeekKey(WK1));
  });
});

describe('directiveDelta — the accumulation vocabulary', () => {
  it('maps each metric from run facts', () => {
    expect(directiveDelta('kills', facts({ kills: 300 }))).toBe(300);
    expect(directiveDelta('wins', facts({ won: true }))).toBe(1);
    expect(directiveDelta('wins', facts({ won: false }))).toBe(0);
    expect(directiveDelta('waves', facts({ wave: 14 }))).toBe(14);
    expect(directiveDelta('bossKills', facts({ bossKills: 2 }))).toBe(2);
    expect(directiveDelta('megaKills', facts({ megaKills: [{ defId: 'voraxis', tier: 1, encounter: 'campaign', killSec: 90, perfect: false, weakPoints: 3, interrupts: 1 }] }))).toBe(1);
    expect(directiveDelta('weakPoints', facts({ weakPointsDestroyed: 6 }))).toBe(6);
    expect(directiveDelta('damage', facts({ damageDealt: 12_500_000 }))).toBe(12); // millions, floored
    expect(directiveDelta('flawless', facts({ won: true, integrityLost: 0 }))).toBe(1);
    expect(directiveDelta('flawless', facts({ won: true, integrityLost: 5 }))).toBe(0); // took damage
    expect(directiveDelta('towers', facts({ towerBuilds: { needle: 3, mortar: 2 } as RunStats['towerBuilds'] }))).toBe(5);
  });
});

describe('cumulative accrual + board state', () => {
  it('banks progress across runs, capped at the target, only for active metrics', () => {
    const week = activeDirectives(WK1);
    let progress: Record<string, number> = {};
    // Eight heavy wins — enough to satisfy even the count-based directives (8 wins / 4 flawless
    // / 60 towers) that a mere three runs would leave short.
    for (let r = 0; r < 8; r++) {
      progress = accrueDirectives(progress, facts({ kills: 1000, wave: 50, won: true, bossKills: 5, damageDealt: 30_000_000, megaKills: [{ defId: 'voraxis', tier: 1, encounter: 'campaign', killSec: 90, perfect: true, weakPoints: 8, interrupts: 2 }], weakPointsDestroyed: 8, integrityLost: 0, towerBuilds: { needle: 10 } as RunStats['towerBuilds'] }), WK1);
    }
    for (const def of week) {
      expect(progress[def.id] ?? 0).toBeLessThanOrEqual(def.target); // never exceeds the target
    }
    const board = directiveBoard(progress, [], WK1);
    expect(board.length).toBe(DIRECTIVES_PER_WEEK);
    // with enough heavy runs the whole week's board completes
    expect(board.every((b) => b.complete)).toBe(true);
    // a single early run only PARTIALLY fills the count-based directives (proves accumulation)
    const oneRun = accrueDirectives({}, facts({ kills: 500, won: true, wave: 20 }), WK1);
    expect(directiveBoard(oneRun, [], WK1).some((b) => !b.complete)).toBe(true);
  });

  it('the capstone is earned only when all three complete, and tracks its claim', () => {
    const week = activeDirectives(WK1);
    const full: Record<string, number> = {};
    for (const def of week) full[def.id] = def.target;
    expect(capstoneState(full, [], WK1).earned).toBe(true);
    expect(capstoneState(full, [], WK1).claimed).toBe(false);
    expect(capstoneState(full, [`${directiveWeekKey(WK1)}:__capstone`], WK1).claimed).toBe(true);
    // one short → not earned
    const partial = { ...full, [week[0].id]: week[0].target - 1 };
    expect(capstoneState(partial, [], WK1).earned).toBe(false);
  });

  it('board claim state reads the ledger keyed by week', () => {
    const week = activeDirectives(WK1);
    const full: Record<string, number> = {};
    for (const def of week) full[def.id] = def.target;
    const claimed = [`${directiveWeekKey(WK1)}:${week[0].id}`];
    const board = directiveBoard(full, claimed, WK1);
    expect(board[0].claimed).toBe(true);
    expect(board[1].claimed).toBe(false);
    // a claim from a DIFFERENT week does not carry over
    expect(directiveBoard(full, [`${directiveWeekKey(WK2)}:${week[0].id}`], WK1)[0].claimed).toBe(false);
  });
});

describe('registry hygiene', () => {
  it('every pool row is complete and pays something', () => {
    for (const d of DIRECTIVE_POOL) expect(directiveProblems(d)).toEqual([]);
    expect(new Set(DIRECTIVE_POOL.map((d) => d.id)).size).toBe(DIRECTIVE_POOL.length); // unique ids
    expect(DIRECTIVE_POOL.length).toBeGreaterThanOrEqual(DIRECTIVES_PER_WEEK * 2);
  });
});

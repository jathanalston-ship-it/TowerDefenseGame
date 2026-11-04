// Campaign mode gates (docs/MODE-IDENTITY.md §gates): Infinite opens at Stage 3, Boss Rush at
// Stage 10 — with grandfathering so pre-gate saves never lose access they already used.

import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import type { RunResult } from './meta';
import { isBossRushUnlocked, isInfiniteUnlocked } from '../save/derive';
import { MODE_UNLOCKS } from '../core/config';
import { defaultLifetimeStats } from '../save/saveStore';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';
import type { RunStats } from '../core/types';

function makeResult(over: Partial<RunResult>, bossKills = 0): RunResult {
  const zero = { kills: 0, damage: 0, activeTime: 0 };
  const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
  const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
  const stats: RunStats = {
    kills: 0, wave: 0, won: false, biomassEarned: 0, damageDealt: 0, integrityLost: 0,
    killsByEnemy: defaultLifetimeStats().killsByEnemy,
    towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
    cardIds: [], heroId: HERO_ORDER[0], bossKills,
  };
  return { wave: 0, kills: 0, won: false, mastery, heroMastery, stats, ...over };
}

function freshMeta(): void {
  meta.reset();
  meta.abandonRun();
}

/** Clear a campaign stage the way the app does — a WON run tagged with the stage. */
function clearStage(n: number): void {
  meta.finishRun(makeResult({ wave: 12, kills: 100, won: true, campaignStage: n }));
}

describe('campaign mode gates (docs/MODE-IDENTITY.md §gates)', () => {
  it('a fresh account has both secondary pillars sealed', () => {
    freshMeta();
    expect(isInfiniteUnlocked(meta.get())).toBe(false);
    expect(isBossRushUnlocked(meta.get())).toBe(false);
  });

  it(`Infinite opens at Campaign Stage ${MODE_UNLOCKS.infinite}; Boss Rush stays sealed`, () => {
    freshMeta();
    clearStage(MODE_UNLOCKS.infinite - 1);
    expect(isInfiniteUnlocked(meta.get())).toBe(false); // one short
    clearStage(MODE_UNLOCKS.infinite);
    expect(isInfiniteUnlocked(meta.get())).toBe(true);
    expect(isBossRushUnlocked(meta.get())).toBe(false);
  });

  it(`Boss Rush opens at Campaign Stage ${MODE_UNLOCKS.bossRush}`, () => {
    freshMeta();
    clearStage(MODE_UNLOCKS.bossRush - 1);
    expect(isBossRushUnlocked(meta.get())).toBe(false);
    clearStage(MODE_UNLOCKS.bossRush);
    expect(isBossRushUnlocked(meta.get())).toBe(true);
    expect(isInfiniteUnlocked(meta.get())).toBe(true); // 10 ≥ 3
  });

  it('pre-gate Boss Rush accounts are grandfathered via their rush ledgers', () => {
    freshMeta();
    meta.finishRun(makeResult({ wave: 4, kills: 30, bossRush: true }, 8)); // a settled rush run
    expect(isBossRushUnlocked(meta.get())).toBe(true); // stage 0 — access is never taken away
    // Infinite has NO bestWave grandfather: that record also moves on campaign runs (it can't
    // identify "has played Infinite"), so the stage gate is authoritative.
    expect(isInfiniteUnlocked(meta.get())).toBe(false);
  });

  it('a Boss Rush wing latched under an earlier, lower gate stays playable (re-pace grandfather)', () => {
    freshMeta();
    clearStage(MODE_UNLOCKS.bossRush - 3); // below the re-paced gate, no rush history
    expect(isBossRushUnlocked(meta.get())).toBe(false);
    const latched = { ...meta.get(), director: { revealed: { bossrush: 9 }, visits: {} } };
    expect(isBossRushUnlocked(latched)).toBe(true); // the screen was shown → the mode stays open
  });
});

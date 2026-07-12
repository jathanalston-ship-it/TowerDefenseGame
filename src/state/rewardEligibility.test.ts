import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import type { RunResult } from './meta';
import { defaultLifetimeStats } from '../save/saveStore';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';
import { gameEvents } from '../core/events';
import type { RunStats } from '../core/types';

// A finished-run payload with sensible zeros; `over` sets the fields a case cares about.
function makeResult(over: Partial<RunResult>): RunResult {
  const zero = { kills: 0, damage: 0, activeTime: 0 };
  const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
  const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
  const stats: RunStats = {
    kills: 0, wave: 0, won: true, biomassEarned: 0, damageDealt: 0, integrityLost: 0,
    killsByEnemy: defaultLifetimeStats().killsByEnemy,
    towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
    cardIds: [], heroId: HERO_ORDER[0],
  };
  return { wave: 0, kills: 0, won: true, mastery, heroMastery, stats, ...over };
}

const hasCache = (banked: { kind: string }[]): boolean => banked.some((c) => c.kind === 'cache');

/** Reset the save AND the live loot-bank cycle so each test is fully independent. */
function freshMeta(): void {
  meta.reset();
  meta.abandonRun(); // clears the module-level live-bank counters (runLootBanked / runContainersBanked)
  // The loot meter is DORMANT until the first Mega Boss falls (docs/LOOTBOX.md §meter) — awaken
  // it so these suites measure ELIGIBILITY gating, not the awakening gate.
  gameEvents.emit('megaKilled', { defId: 'voraxis', tier: 1, encounter: 'campaign', killSec: 100, perfect: false, weakPoints: 0, interrupts: 0 });
}

describe('reward eligibility — Stage Cache gating (docs/MODE-IDENTITY.md)', () => {
  describe('Campaign — cache only on a win', () => {
    it('a WON stage banks its Stage Cache', () => {
      freshMeta();
      const out = meta.finishRun(makeResult({ wave: 12, kills: 120, won: true, campaignStage: 1 }));
      expect(hasCache(out.loot.banked)).toBe(true);
      expect(out.rewardBlocked).toBeUndefined();
    });

    it('a LOST stage grants NO Stage Cache and reports why', () => {
      freshMeta();
      const out = meta.finishRun(makeResult({ wave: 3, kills: 20, won: false, campaignStage: 1 }));
      expect(hasCache(out.loot.banked)).toBe(false);
      expect(out.rewardBlocked?.reason).toBe('campaign-loss');
    });

    it('Start → instant Quit (wave 0 loss) enters nothing into the Vault', () => {
      freshMeta();
      const out = meta.finishRun(makeResult({ wave: 0, kills: 0, won: false, campaignStage: 1 }));
      expect(hasCache(out.loot.banked)).toBe(false);
      expect(meta.pendingContainers().length).toBe(0);
    });
  });

  describe('Infinite — cache only at ≥ 50% of the personal best', () => {
    it('the FIRST infinite run qualifies (no prior best to fall short of)', () => {
      freshMeta();
      const out = meta.finishRun(makeResult({ wave: 10, kills: 100, won: false, endless: true }));
      expect(out.rewardBlocked).toBeUndefined();
      expect(hasCache(out.loot.banked)).toBe(true);
    });

    it('a run below 50% of the personal best banks nothing and shows the message', () => {
      freshMeta();
      meta.finishRun(makeResult({ wave: 60, kills: 600, won: false, endless: true })); // best → 60
      expect(meta.get().bestWave).toBe(60);
      const out = meta.finishRun(makeResult({ wave: 20, kills: 200, won: false, endless: true })); // 20 < 30
      expect(out.rewardBlocked).toEqual({ reason: 'infinite-short', qualifyWave: 30 });
      expect(hasCache(out.loot.banked)).toBe(false);
    });

    it('a run AT the 50% threshold qualifies', () => {
      freshMeta();
      meta.finishRun(makeResult({ wave: 60, won: false, endless: true })); // best → 60, threshold 30
      const out = meta.finishRun(makeResult({ wave: 30, kills: 300, won: false, endless: true })); // 30 == 30
      expect(out.rewardBlocked).toBeUndefined();
      expect(hasCache(out.loot.banked)).toBe(true);
    });

    it('an unqualified run ROLLS BACK the loot it banked live — no exploit rewards', () => {
      freshMeta();
      meta.finishRun(makeResult({ wave: 60, won: false, endless: true })); // best → 60 (cycle reset after)
      const before = meta.pendingContainers().length;
      meta.syncRunLoot(25, 1200); // a wave-25 run fills the meter LIVE (25 < 30 threshold)
      expect(meta.pendingContainers().length).toBeGreaterThan(before);
      const out = meta.finishRun(makeResult({ wave: 25, kills: 1200, won: false, endless: true }));
      expect(out.rewardBlocked?.reason).toBe('infinite-short');
      expect(meta.pendingContainers().length).toBe(before); // live loot rolled back, nothing new banked
    });

    it('the threshold re-bases upward the moment a new personal best is set', () => {
      freshMeta();
      meta.finishRun(makeResult({ wave: 100, won: false, endless: true })); // best 100 → threshold 50
      const a = meta.finishRun(makeResult({ wave: 55, won: false, endless: true })); // 55 ≥ 50 → qualifies
      expect(a.rewardBlocked).toBeUndefined();
      meta.finishRun(makeResult({ wave: 140, won: false, endless: true })); // new best 140 → threshold 70
      const b = meta.finishRun(makeResult({ wave: 55, won: false, endless: true })); // 55 < 70 now → blocked
      expect(b.rewardBlocked).toEqual({ reason: 'infinite-short', qualifyWave: 70 });
    });
  });

  it('the neutral quick-run is unchanged — it still banks its run cache', () => {
    freshMeta();
    const out = meta.finishRun(makeResult({ wave: 8, kills: 80, won: true })); // no campaignStage, not endless
    expect(hasCache(out.loot.banked)).toBe(true);
    expect(out.rewardBlocked).toBeUndefined();
  });
});

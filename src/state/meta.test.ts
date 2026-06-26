import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import type { RunResult } from '../core/game';

function result(over: Partial<RunResult>): RunResult {
  return {
    mode: 'classic', won: false, wave: 1, kills: 0, stageNumber: 0,
    rewardMultiplier: 1, objectiveDone: false, objectiveBonus: 0, score: 0, ...over,
  };
}

describe('reward economy', () => {
  it('pays each mode in its OWN currencies toward different sinks', () => {
    meta.reset();
    const start = meta.get();

    // Stage → Shards + Components; clearing advances the path.
    const stage = meta.recordRun(result({ mode: 'stage', won: true, wave: 9, kills: 120, stageNumber: 3, rewardMultiplier: 1.2, objectiveDone: true, objectiveBonus: 0.5 }));
    expect(stage.shards).toBeGreaterThan(0);
    expect(stage.components).toBeGreaterThan(0);
    expect(stage.essence).toBe(0);
    expect(stage.catalyst).toBe(0);
    expect(meta.get().shards).toBe(start.shards + stage.shards);
    expect(meta.get().components).toBe(start.components + stage.components);
    expect(meta.get().bestStage).toBe(3);
    expect(meta.get().stagesCleared).toBe(1);

    // Endless → Essence + Catalyst (prestige) + leaderboard; no Shards.
    const endless = meta.recordRun(result({ mode: 'endless', wave: 25, kills: 300, score: 99999 }));
    expect(endless.essence).toBeGreaterThan(0);
    expect(endless.catalyst).toBe(2); // floor(25 / 10)
    expect(endless.shards).toBe(0);
    expect(meta.get().essence).toBeGreaterThan(0);
    expect(meta.get().bestEndlessScore).toBe(99999);
    expect(meta.get().lifetimeShards).toBe(start.lifetimeShards + stage.shards); // endless adds none
    meta.reset();
  });

  it('buyUpgrade spends the upgrade\'s own currency', () => {
    meta.reset();
    meta.debugAddShards(10000); // tops up shards + essence + components
    const before = meta.get();
    expect(meta.buyUpgrade('lethality')).toBe(true); // Shards
    expect(meta.get().shards).toBeLessThan(before.shards);
    expect(meta.get().essence).toBe(before.essence); // untouched

    const e0 = meta.get().essence;
    expect(meta.buyUpgrade('overclock')).toBe(true); // Essence
    expect(meta.get().essence).toBeLessThan(e0);
    meta.reset();
  });

  it('cannot buy without the right currency', () => {
    meta.reset();
    expect(meta.get().essence).toBe(0);
    expect(meta.buyUpgrade('overclock')).toBe(false); // no essence
    meta.reset();
  });
});

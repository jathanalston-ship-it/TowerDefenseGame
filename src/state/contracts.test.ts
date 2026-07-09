// Champion Contracts × finishRun (docs/CONTRACTS.md): honoured contracts pay their cores
// into the run's shards, grant marquee phenotypes exactly once, and never double-complete
// within a week. Clock is the pinned test Tuesday (core/liveops.ts), so the board is stable.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import type { RunResult } from './meta';
import { defaultLifetimeStats } from '../save/saveStore';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';
import { activeContracts, contractWeekKey } from '../core/contracts';
import type { RunStats } from '../core/types';

function makeResult(over: Partial<RunResult>, stats: Partial<RunStats> = {}): RunResult {
  const zero = { kills: 0, damage: 0, activeTime: 0 };
  const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
  const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
  const s: RunStats = {
    kills: 0, wave: 0, won: false, biomassEarned: 0, damageDealt: 0, integrityLost: 0,
    killsByEnemy: defaultLifetimeStats().killsByEnemy,
    towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
    cardIds: [], heroId: HERO_ORDER[0], ...stats,
  };
  return { wave: 0, kills: 0, won: false, mastery, heroMastery, stats: s, ...over };
}

/** A run that flawlessly satisfies whatever win-shaped contracts this week's board holds. */
function flawlessDeepRun(): RunResult {
  return makeResult(
    { wave: 20, kills: 400, won: true },
    { wave: 20, kills: 400, won: true, integrityLost: 0, towerBuilds: { ...makeResult({}).stats.towerBuilds, obelisk: 2 } },
  );
}

describe('contracts × finishRun', () => {
  it('an honoured contract pays its cores and lands in the ledger + outcome', () => {
    meta.reset();
    const board = activeContracts();
    expect(board.length).toBeGreaterThan(0);
    const base = ((): number => {
      // identical run with contracts already completed = the pure non-contract payout
      meta.reset();
      meta.finishRun(flawlessDeepRun()); // completes them
      const again = meta.finishRun(flawlessDeepRun()).reward.shardsEarned; // week ledger now blocks
      return again;
    })();
    meta.reset();
    const out = meta.finishRun(flawlessDeepRun());
    const paid = (out.contracts ?? []).reduce((a, c) => a + c.cores, 0);
    expect(out.contracts?.length ?? 0).toBeGreaterThan(0);
    expect(out.reward.shardsEarned - base).toBe(paid);
    const wk = contractWeekKey();
    for (const c of out.contracts ?? []) {
      expect(meta.get().contracts.completed).toContain(`${wk}:${c.id}`);
    }
  });

  it('never double-completes within the same week', () => {
    meta.reset();
    const first = meta.finishRun(flawlessDeepRun());
    expect(first.contracts?.length ?? 0).toBeGreaterThan(0);
    const second = meta.finishRun(flawlessDeepRun());
    expect(second.contracts).toBeUndefined();
  });

  it('marquee contracts grant their Gilded phenotype exactly once', () => {
    meta.reset();
    const out = meta.finishRun(flawlessDeepRun());
    const marquee = (out.contracts ?? []).filter((c) => c.cosmetic !== null);
    for (const m of marquee) {
      expect(meta.get().cosmetics.owned).toContain(m.cosmetic);
      expect(meta.get().cosmetics.owned.filter((id) => id === m.cosmetic)).toHaveLength(1);
    }
  });
});

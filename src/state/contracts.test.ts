// Champion Contracts × finishRun (docs/CONTRACTS.md): honoured contracts pay their cores
// AND Account XP into the run's reward, grant marquee phenotypes exactly once, never
// double-complete within a week, surface near-misses (failed by exactly one constraint),
// and sweeping the whole board fires the PERFECT WEEK bonus exactly once. Clock is the
// pinned test Tuesday (core/liveops.ts), so the board is stable; the run builders below
// are BOARD-DRIVEN (mode-aware), so pool rebalances don't rot these tests.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import type { RunResult } from './meta';
import { defaultLifetimeStats } from '../save/saveStore';
import { HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { ACCOUNT_XP } from '../core/accountLevel';
import { PERFECT_WEEK, activeContracts, contractSatisfied, contractWeekKey } from '../core/contracts';
import type { ContractDef } from '../core/contracts';
import type { RunStats, TowerKind } from '../core/types';

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
    { wave: 20, kills: 400, won: true, integrityLost: 0, bossKills: 8, towerBuilds: { ...makeResult({}).stats.towerBuilds, obelisk: 2 } },
  );
}

/** Craft a run that satisfies ONE contract (mode flags included) — asserts it really does,
 *  so a future pool row the builder can't express fails loudly instead of silently. */
function runSatisfying(c: ContractDef): RunResult {
  let wave = 30; let kills = 500; let heroId: string = HERO_ORDER[0];
  const towerBuilds = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as Record<TowerKind, number>;
  towerBuilds.obelisk = 2; // default field: one Neural kind (survives most bans/purities)
  for (const k of c.constraints) {
    switch (k.kind) {
      case 'minWave': wave = Math.max(wave, k.value); break;
      case 'minKills': kills = Math.max(kills, k.value); break;
      case 'banTower': towerBuilds[k.tower] = 0; break;
      case 'requireTower': towerBuilds[k.tower] = Math.max(1, towerBuilds[k.tower]); break;
      case 'banClass': for (const t of TOWER_ORDER) if (TOWER_DEFS[t].combatClass === k.cls) towerBuilds[t] = 0; break;
      case 'onlyClass': {
        for (const t of TOWER_ORDER) towerBuilds[t] = 0;
        towerBuilds[TOWER_ORDER.find((t) => TOWER_DEFS[t].combatClass === k.cls)!] = 2;
        break;
      }
      case 'minTowerKinds': {
        for (const t of TOWER_ORDER) {
          if (TOWER_ORDER.filter((x) => towerBuilds[x] > 0).length >= k.value) break;
          towerBuilds[t] = Math.max(1, towerBuilds[t]);
        }
        break;
      }
      case 'maxTowerKinds': case 'maxTowersBuilt': break; // the default sparse field already fits
      case 'requireHero': heroId = k.hero; break;
      case 'win': case 'noLeaks': case 'minBossKills': case 'maxCards': break; // covered below
    }
  }
  const mode: Partial<RunResult> =
    c.mode === 'rush' ? { bossRush: true }
    : c.mode === 'endless' ? { endless: true }
    : c.mode === 'campaign' ? { campaignStage: 1 }
    : c.mode === 'daily' ? { dailyKey: '2026-01-06' }
    : {};
  const r = makeResult(
    { wave, kills, won: true, ...mode },
    { wave, kills, won: true, integrityLost: 0, bossKills: 10, cardIds: [], towerBuilds, heroId },
  );
  expect(contractSatisfied(c, {
    mode: c.mode === 'any' ? 'stage' : c.mode, won: true, wave, kills, bossKills: 10, cardsDrafted: 0,
    integrityLost: 0, towerBuilds, heroId,
  }), `runSatisfying cannot express '${c.id}' — extend the builder`).toBe(true);
  return r;
}

/** Total XP minus the achievement fold — isolates the run lane (contract XP lives there). */
const runLaneXp = (o: ReturnType<typeof meta.finishRun>): number =>
  o.accountXp.gained - o.achievements.length * ACCOUNT_XP.achievement;

describe('contracts × finishRun', () => {
  it('an honoured contract pays its cores AND Account XP, and lands in the ledger + outcome', () => {
    const base = ((): { cores: number; xp: number } => {
      // identical run with contracts already completed = the pure non-contract payout
      meta.reset();
      meta.finishRun(flawlessDeepRun()); // completes them
      const again = meta.finishRun(flawlessDeepRun()); // week ledger now blocks
      return { cores: again.reward.shardsEarned, xp: runLaneXp(again) };
    })();
    meta.reset();
    const out = meta.finishRun(flawlessDeepRun());
    const paid = (out.contracts ?? []).reduce((a, c) => a + c.cores, 0) + (out.perfectWeek?.cores ?? 0);
    expect(out.contracts?.length ?? 0).toBeGreaterThan(0);
    expect(out.reward.shardsEarned - base.cores).toBe(paid);
    expect(runLaneXp(out) - base.xp).toBe(
      (out.contracts?.length ?? 0) * ACCOUNT_XP.contract + (out.perfectWeek ? ACCOUNT_XP.perfectWeek : 0),
    );
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

  it('a run that fails an open contract by EXACTLY one constraint surfaces as a near-miss', () => {
    meta.reset();
    const board = activeContracts();
    // A leaky deep win: satisfies every win-shaped row EXCEPT its noLeaks/flawless terms.
    const leaky = makeResult(
      { wave: 20, kills: 400, won: true },
      { wave: 20, kills: 400, won: true, integrityLost: 6, bossKills: 8, towerBuilds: { ...makeResult({}).stats.towerBuilds, obelisk: 2 } },
    );
    const out = meta.finishRun(leaky);
    const flawlessRows = board.filter((c) => c.constraints.some((k) => k.kind === 'noLeaks'));
    for (const row of flawlessRows) {
      // only rows whose OTHER constraints the leaky run satisfied appear — assert shape on match
      const near = (out.contractNears ?? []).find((n) => n.id === row.id);
      if (near) expect(near.missed).toBe('Lose no integrity');
    }
    // near-misses never overlap completions
    const hitIds = new Set((out.contracts ?? []).map((c) => c.id));
    for (const n of out.contractNears ?? []) expect(hitIds.has(n.id)).toBe(false);
  });

  it('sweeping the whole weekly board fires PERFECT WEEK exactly once', () => {
    meta.reset();
    const board = activeContracts();
    const wk = contractWeekKey();
    let sawPerfect = 0;
    for (const c of board) {
      const out = meta.finishRun(runSatisfying(c));
      if (out.perfectWeek) {
        sawPerfect++;
        expect(out.perfectWeek.cores).toBe(PERFECT_WEEK.cores);
        // the sweep's run pays the bonus into the SAME reward lane
        expect(meta.get().contracts.perfectWeeks).toBe(1);
        expect(meta.get().contracts.lastPerfect).toBe(wk);
      }
    }
    expect(sawPerfect).toBe(1);
    expect(board.every((c) => meta.get().contracts.completed.includes(`${wk}:${c.id}`))).toBe(true);
    // the watermark blocks any re-fire this week
    const again = meta.finishRun(flawlessDeepRun());
    expect(again.perfectWeek).toBeUndefined();
    expect(meta.get().contracts.perfectWeeks).toBe(1);
  });
});

// Account Level (docs/ACCOUNT-LEVEL.md) — the evergreen-progression contracts:
//   • the curve is UNCAPPED, smooth (no spikes), monotonic, and overflow-safe at inhuman depths;
//   • every level pays something; rewards are deterministic; reward VALUE grows slower than the
//     XP requirement (high levels stay prestigious — farming levels never out-earns playing);
//   • milestones are infinite, flagged, and pay big (+ identity at the named tiers);
//   • the meta fold: a settled run gains XP, crosses levels, grants the generated rewards, and
//     reports the delta on the outcome (the Results/ceremony feed).

import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_TITLES, ACCOUNT_XP, MILESTONE_LEVELS, accountLevelReward, isMilestoneLevel, levelFromXp,
  levelProgress, monthKey, nextMilestone, totalXpForLevel, weekKey, xpForLevel,
} from './accountLevel';
import { meta } from '../state/meta';
import type { RunResult } from '../state/meta';
import type { RunStats } from './types';
import { HERO_ORDER, META_UPGRADES, TOWER_ORDER } from './config';
import { defaultLifetimeStats } from '../save/saveStore';

describe('the curve — uncapped, smooth, safe', () => {
  it('per-level requirement rises monotonically and smoothly (no spikes)', () => {
    for (let n = 1; n < 2000; n++) {
      expect(xpForLevel(n + 1)).toBeGreaterThan(xpForLevel(n));
      if (n >= 10) expect(xpForLevel(n + 1) / xpForLevel(n)).toBeLessThan(1.2); // spike-free
    }
  });

  it('levelFromXp inverts totalXpForLevel at any depth (no cap)', () => {
    for (const n of [1, 2, 7, 50, 137, 1000, 5000]) {
      const xp = totalXpForLevel(n);
      expect(levelFromXp(xp)).toBe(n);
      if (n > 1) expect(levelFromXp(xp - 1)).toBe(n - 1);
    }
  });

  it('stays far inside Number.MAX_SAFE_INTEGER at inhuman depths (overflow handling)', () => {
    const xp = totalXpForLevel(100_000);
    expect(Number.isSafeInteger(xp)).toBe(true);
    expect(xp).toBeLessThan(Number.MAX_SAFE_INTEGER / 1000);
    const p = levelProgress(xp);
    expect(p.level).toBe(100_000);
    expect(p.into).toBe(0);
  });

  it('progress view is exact: into < need, and adding `need - into` levels up', () => {
    const xp = totalXpForLevel(42) + 17;
    const p = levelProgress(xp);
    expect(p.level).toBe(42);
    expect(p.into).toBe(17);
    expect(levelFromXp(xp + (p.need - p.into))).toBe(43);
  });
});

describe('milestones — infinite and always ahead', () => {
  it('named tiers + every 500 beyond 1000, forever', () => {
    for (const m of MILESTONE_LEVELS) expect(isMilestoneLevel(m)).toBe(true);
    expect(isMilestoneLevel(1500)).toBe(true);
    expect(isMilestoneLevel(23_500)).toBe(true);
    expect(isMilestoneLevel(23_400)).toBe(false);
    expect(isMilestoneLevel(11)).toBe(false);
  });

  it('nextMilestone always exists and never regresses', () => {
    expect(nextMilestone(1)).toBe(10);
    expect(nextMilestone(11)).toBe(25);
    expect(nextMilestone(101)).toBe(250);
    expect(nextMilestone(1001)).toBe(1500);
    expect(nextMilestone(99_700)).toBe(100_000);
  });
});

describe('procedural rewards — deterministic, never empty, prestige-preserving', () => {
  it('is deterministic per level and never empty for levels 1..400', () => {
    for (let n = 1; n <= 400; n++) {
      const a = accountLevelReward(n);
      const b = accountLevelReward(n);
      expect(b).toEqual(a); // same level ⇒ same reward, every time
      const any = a.cores + a.essence + a.towerShards + a.heroShards + a.ichor +
        a.mats.mutagen + a.mats.scrap + a.mats.catalyst + a.containers.length;
      expect(any, `level ${n} paid nothing`).toBeGreaterThan(0);
      expect(a.cores).toBeGreaterThan(0); // the guaranteed floor
    }
  });

  it('banks a Bio-Container exactly every 5th level (plus milestone bonuses)', () => {
    for (let n = 1; n <= 200; n++) {
      const r = accountLevelReward(n);
      const periodic = n % 5 === 0 ? 1 : 0;
      const milestoneBonus = isMilestoneLevel(n) ? 1 : 0;
      expect(r.containers.length, `level ${n}`).toBe(periodic + milestoneBonus);
    }
  });

  it('milestones pay several times their neighbours and carry the named titles', () => {
    for (const m of MILESTONE_LEVELS.filter((x) => x <= 500)) {
      const at = accountLevelReward(m);
      const before = accountLevelReward(m - 1);
      expect(at.milestone).toBe(true);
      expect(at.cores).toBeGreaterThan(before.cores * 2);
    }
    for (const t of ACCOUNT_TITLES) {
      expect(accountLevelReward(t.level).titleId).toBe(t.id);
    }
  });

  it('reward value grows SLOWER than the XP requirement (grind never trivializes)', () => {
    // Average the deterministic core payouts over non-milestone windows; the requirement's
    // growth ratio must dominate the reward's at every doubling.
    const avgCores = (start: number): number => {
      let sum = 0, n = 0;
      for (let l = start; l < start + 10; l++) {
        if (isMilestoneLevel(l)) continue;
        sum += accountLevelReward(l).cores;
        n++;
      }
      return sum / n;
    };
    for (const base of [20, 60, 140]) {
      const rewardRatio = avgCores(base * 2) / avgCores(base);
      const xpRatio = xpForLevel(base * 2) / xpForLevel(base);
      expect(rewardRatio).toBeLessThan(xpRatio);
    }
  });
});

describe('period keys (leaderboard ledgers)', () => {
  it('week/month keys are stable UTC buckets', () => {
    const t = Date.UTC(2026, 6, 10, 12); // 2026-07-10 (a Friday)
    expect(monthKey(t)).toBe('2026-07');
    expect(weekKey(t)).toBe('2026-W28');
    expect(weekKey(Date.UTC(2026, 0, 1))).toMatch(/^\d{4}-W\d{2}$/);
  });
});

// ── The meta fold — a real settle advances the account and grants the crossed rewards ──

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

describe('meta integration — XP settles, levels cross, rewards land', () => {
  it('a first run pays its play-XP, levels the account, and grants the crossed rewards', () => {
    meta.reset();
    const before = meta.accountLevel();
    expect(before.level).toBe(1);
    const outcome = meta.finishRun(makeResult({ wave: 12, kills: 260, won: false }, { wave: 12, kills: 260 }));
    const runXp = 260 * ACCOUNT_XP.kill + 12 * ACCOUNT_XP.wave;
    expect(outcome.accountXp.gained).toBeGreaterThanOrEqual(runXp); // + any achievement XP
    const after = meta.accountLevel();
    expect(after.xp).toBe(outcome.accountXp.gained);
    expect(after.level).toBe(outcome.accountXp.to);
    expect(after.level).toBeGreaterThan(1); // a real first run is at least one level
    // Every crossed level's reward landed (cores are guaranteed on every level).
    expect(outcome.accountXp.levelUps.length).toBe(after.level - 1);
    for (const lu of outcome.accountXp.levelUps) expect(lu.reward.cores).toBeGreaterThan(0);
  });

  it('weekly/monthly ledgers accumulate under the current period keys', () => {
    meta.reset();
    meta.finishRun(makeResult({ wave: 5, kills: 60 }, { wave: 5, kills: 60 }));
    const v = meta.accountLevel();
    expect(v.weekXp).toBe(v.xp);
    expect(v.monthXp).toBe(v.xp);
  });

  it('acquisitions pay account XP (the buyUpgrade lane)', () => {
    meta.reset();
    meta.debugAddShards(100_000);
    const before = meta.accountLevel().xp;
    const bought = META_UPGRADES.some((u) => meta.buyUpgrade(u.id)); // first purchasable row (content-agnostic)
    expect(bought).toBe(true);
    expect(meta.accountLevel().xp - before).toBe(ACCOUNT_XP.acquisition);
  });
});

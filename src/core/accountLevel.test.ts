// Account Level (docs/ACCOUNT-LEVEL.md) — the evergreen-progression contracts:
//   • the curve is UNCAPPED, smooth (no spikes), monotonic, and overflow-safe at inhuman depths;
//   • every level pays something; rewards are deterministic; reward VALUE grows slower than the
//     XP requirement (high levels stay prestigious — farming levels never out-earns playing);
//   • milestones are infinite, flagged, and pay big (+ identity at the named tiers);
//   • the meta fold: a settled run gains XP, crosses levels, grants the generated rewards, and
//     reports the delta on the outcome (the Results/ceremony feed).

import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_REWARD_DEPTH, ACCOUNT_TITLES, ACCOUNT_XP, ACCOUNT_XP_DEPTH, MILESTONE_LEVELS, accountLevelReward, depthXpMult,
  isContainerLevel, isMilestoneLevel, levelFromXp, levelProgress, monthKey, nextMilestone, totalXpForLevel, weekKey, xpForLevel,
} from './accountLevel';
import { accountDepth, itemLevelForDepth } from './equipment';
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

  it('banks a Bio-Container every 5th level, the interval widening by 5 each 50 levels (plus milestone bonuses)', () => {
    // Depth XP (§depth) makes deep levels ~3× as frequent, so the periodic container spaces out to
    // keep containers/hour honest: every 5th to L50, every 10th to L100, every 15th to L150 …
    for (let n = 1; n <= 400; n++) {
      const r = accountLevelReward(n);
      const periodic = n % (5 * Math.ceil(n / 50)) === 0 ? 1 : 0;
      const milestoneBonus = isMilestoneLevel(n) ? 1 : 0;
      expect(isContainerLevel(n), `level ${n}`).toBe(periodic === 1);
      expect(r.containers.length, `level ${n}`).toBe(periodic + milestoneBonus);
    }
    // The early ladder is untouched, and the interval always lands on round levels.
    for (let n = 5; n <= 50; n += 5) expect(isContainerLevel(n)).toBe(true);
    expect([60, 70, 100, 105, 120, 150, 160, 200, 250, 500, 1000].every(isContainerLevel)).toBe(true);
    expect([55, 65, 110, 155, 170].some(isContainerLevel)).toBe(false);
  });

  it('levels 1–42 pay EXACTLY the pre-Depth-XP ladder (onboarding rewards untouched)', () => {
    // Pinned sums of the 2026-07 ladder for levels 1..42 — the re-weighting only starts past
    // ACCOUNT_REWARD_DEPTH.fromLevel.
    expect(ACCOUNT_REWARD_DEPTH.fromLevel).toBe(42);
    const t = { c: 0, e: 0, t: 0, h: 0, m: 0, i: 0, k: 0 };
    for (let n = 1; n <= 42; n++) {
      const r = accountLevelReward(n);
      t.c += r.cores; t.e += r.essence; t.t += r.towerShards; t.h += r.heroShards;
      t.m += r.mats.mutagen + r.mats.scrap + r.mats.catalyst; t.i += r.ichor; t.k += r.containers.length;
    }
    expect(t).toEqual({ c: 2381, e: 983, t: 125, h: 37, m: 16, i: 4, k: 10 });
  });

  it('deep levels pay smaller beats that never shrink to nothing (and creep back up)', () => {
    const avgCores = (start: number): number => {
      let sum = 0, n = 0;
      for (let l = start; l < start + 20; l++) {
        if (isMilestoneLevel(l)) continue;
        sum += accountLevelReward(l).cores;
        n++;
      }
      return sum / n;
    };
    // Smaller than the onboarding beat (the frequency carries the reward now) …
    expect(avgCores(100)).toBeLessThan(avgCores(20));
    // … but bounded below everywhere, and rising again deep (budget ∝ n^0.7 / ln n).
    for (const at of [60, 100, 200, 400, 1000, 5000]) expect(avgCores(at), `L${at}`).toBeGreaterThan(20);
    expect(avgCores(1000)).toBeGreaterThan(avgCores(140));
    expect(avgCores(5000)).toBeGreaterThan(avgCores(1000));
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

describe('depth XP — play XP scales with the account depth (§depth)', () => {
  it('is exactly ×1 through depth 30 (onboarding untouched), then rises smoothly and without cap', () => {
    expect(ACCOUNT_XP_DEPTH.from).toBe(30);
    for (const d of [0, 1, 12, 29.5, 30]) expect(depthXpMult(d)).toBe(1);
    let prev = 1;
    for (let d = 31; d <= 2000; d++) {
      const m = depthXpMult(d);
      expect(m).toBeGreaterThan(prev); // strictly monotonic past `from`
      expect(m / prev).toBeLessThan(1.05); // smooth: no single stage is a cliff (ratio → 1)
      prev = m;
    }
    expect(Number.isFinite(depthXpMult(1e6))).toBe(true);
  });

  it('hits its calibration anchors (1 + ((d − 30) / 25)^1.6)', () => {
    expect(depthXpMult(55)).toBeCloseTo(2, 6);
    expect(depthXpMult(80)).toBeCloseTo(1 + Math.pow(2, 1.6), 6); // ≈ 4.0
    expect(depthXpMult(105)).toBeCloseTo(1 + Math.pow(3, 1.6), 6); // ≈ 6.8
  });

  it('reads the SAME account depth as the gear chase (deepest stage, or Infinite best × weight)', () => {
    expect(accountDepth(0)).toBe(0);
    expect(accountDepth(60, 40)).toBe(60); // the campaign reads deeper
    expect(accountDepth(20, 160)).toBe(80); // the Infinite record reads deeper (× 0.5)
    // One definition: the gear chase's item level is a pure function of this depth.
    expect(itemLevelForDepth(20, 160)).toBe(itemLevelForDepth(80));
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

  it('a run at depth pays depthXpMult × its play XP and reports the multiplier (§depth)', () => {
    const settle = (stage: number) => {
      meta.reset();
      if (stage > 0) meta.debugSetCampaignStage(stage);
      const o = meta.finishRun(makeResult({ wave: 12, kills: 260, won: false }, { wave: 12, kills: 260 }));
      // Achievement + contract XP are flat folds (contract previews quote the table value).
      const flat = o.achievements.length * ACCOUNT_XP.achievement + (o.contracts?.length ?? 0) * ACCOUNT_XP.contract
        + (o.perfectWeek ? ACCOUNT_XP.perfectWeek : 0);
      return { gained: o.accountXp.gained - flat, mult: o.accountXp.depthMult };
    };
    const play = 260 * ACCOUNT_XP.kill + 12 * ACCOUNT_XP.wave;
    const shallow = settle(30);
    expect(shallow.gained).toBe(play); // ×1 at/below depth 30 — no multiplier reported
    expect(shallow.mult).toBeUndefined();
    const deep = settle(80);
    expect(deep.mult).toBeCloseTo(depthXpMult(80), 9);
    expect(deep.gained).toBe(Math.round(play * depthXpMult(80)));
    meta.reset();
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

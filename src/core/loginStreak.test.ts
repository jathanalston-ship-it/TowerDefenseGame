// DAILY BIO-CACHE core (docs/DAILY-LOGIN.md): the compounding curve's contracts (slight daily
// rise, uncapped, never explosive), the IV-budget fidelity of the procedural bundle, milestone
// containers, jackpot rarity, and the closed reward vocabulary the shared interpreter speaks.

import { describe, expect, it } from 'vitest';
import {
  LANE_VALUE, LOGIN, LOGIN_JACKPOT_IDS, loginBaseValue, loginTargetValue, milestoneContainer,
  rewardValue, rollLoginBundle, streakMult,
} from './loginStreak';
import { wardrobeItem } from './wardrobe';

/** Deterministic ISO day keys for sweeps (day 0 = an arbitrary fixed epoch). */
const key = (i: number): string => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);

describe('the compounding curve — slight daily rise, uncapped, never explosive', () => {
  it('day 1 is exactly ×1 and EVERY consecutive day strictly raises the multiplier', () => {
    expect(streakMult(1)).toBe(1);
    let prev = streakMult(1);
    for (let d = 2; d <= 3000; d++) {
      const m = streakMult(d);
      expect(m).toBeGreaterThan(prev);
      prev = m;
    }
  });

  it('never caps (still growing past a decade) but never explodes (a decade < ×4)', () => {
    expect(streakMult(10_000)).toBeGreaterThan(streakMult(3650));
    expect(streakMult(3650)).toBeLessThan(4);
    expect(streakMult(365)).toBeLessThan(2); // a full unbroken year is meaningful, not broken
  });

  it('base value grows with LIFETIME logins — gently (a year less than doubles day one)', () => {
    expect(loginBaseValue(0)).toBe(LOGIN.baseValue);
    expect(loginBaseValue(365)).toBeGreaterThan(loginBaseValue(30));
    expect(loginBaseValue(365)).toBeLessThan(2 * LOGIN.baseValue);
  });

  it('target value is monotonic in both lifetime and streak', () => {
    expect(loginTargetValue(100, 50)).toBeGreaterThan(loginTargetValue(0, 50));
    expect(loginTargetValue(100, 50)).toBeGreaterThan(loginTargetValue(100, 2));
  });
});

describe('milestone containers — the anticipation ladder', () => {
  it('pays the authored ladder, a legendary EVERY unbroken year, nothing off-milestone', () => {
    expect(milestoneContainer(7)).toBe('rare');
    expect(milestoneContainer(30)).toBe('epic');
    expect(milestoneContainer(100)).toBe('legendary');
    expect(milestoneContainer(365)).toBe('legendary');
    expect(milestoneContainer(730)).toBe('legendary');
    expect(milestoneContainer(6)).toBeNull();
    expect(milestoneContainer(0)).toBeNull();
  });
});

describe('the procedural bundle — deterministic, budget-true, vocabulary-closed', () => {
  it('is a PURE function of (key, lifetime, streak) — identical on re-roll', () => {
    const a = rollLoginBundle(key(3), 3, 4);
    const b = rollLoginBundle(key(3), 3, 4);
    expect(b).toEqual(a);
  });

  it('different days pay DIFFERENT bundles (variety is the point)', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 30; i++) for (const r of rollLoginBundle(key(i), i, i + 1).rewards) kinds.add(r.kind);
    expect(kinds.size).toBeGreaterThanOrEqual(5); // a month explores a real spread of lanes
  });

  it('every day the paid value tracks the IV budget (milestones ride ON TOP)', () => {
    let ratioSum = 0;
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const streak = i + 1;
      const b = rollLoginBundle(key(i), i, streak);
      expect(b.target).toBe(loginTargetValue(i, streak));
      const milestoneIV = b.milestone ? LANE_VALUE.container[b.milestone] : 0;
      const budgetPaid = b.value - milestoneIV;
      expect(budgetPaid).toBeGreaterThan(0);
      if (!b.milestone) {
        expect(Math.abs(budgetPaid - b.target) / b.target).toBeLessThanOrEqual(0.35);
        ratioSum += budgetPaid / b.target;
        n++;
      } else {
        expect(b.value).toBeGreaterThanOrEqual(b.target); // milestone days feel oversized by design
      }
    }
    expect(ratioSum / n).toBeGreaterThan(0.9); // no systematic under-pay …
    expect(ratioSum / n).toBeLessThan(1.2); // … and no systematic leak either
  });

  it('speaks ONLY interpreter kinds and never authors passive/stack/phenotype', () => {
    for (let i = 0; i < 400; i++) {
      const b = rollLoginBundle(key(i), i, i + 1);
      for (const r of b.rewards) {
        expect(['passive', 'stack', 'phenotype']).not.toContain(r.kind);
        expect(rewardValue(r)).toBeGreaterThanOrEqual(0);
      }
      expect(b.passXp).toBeLessThanOrEqual(LOGIN.passXpCap);
      expect(b.passXp).toBeGreaterThanOrEqual(0);
    }
  });

  it('milestone days carry their guaranteed container', () => {
    const day7 = rollLoginBundle(key(6), 6, 7);
    expect(day7.milestone).toBe('rare');
    expect(day7.rewards.some((r) => r.kind === 'container' && r.rarity === 'rare')).toBe(true);
    const day100 = rollLoginBundle(key(99), 99, 100);
    expect(day100.rewards.some((r) => r.kind === 'container' && r.rarity === 'legendary')).toBe(true);
  });

  it('the jackpot is EXTREMELY rare, drawn from real login-drop wardrobe rows', () => {
    let hits = 0;
    for (let i = 0; i < 3000; i++) {
      const b = rollLoginBundle(key(i), i, i + 1);
      if (b.jackpot) {
        hits++;
        const cosmetic = b.rewards.find((r) => r.kind === 'cosmetic');
        expect(cosmetic).toBeDefined();
        const id = (cosmetic as { id: string }).id;
        expect(LOGIN_JACKPOT_IDS).toContain(id);
        const def = wardrobeItem(id);
        expect(def).toBeDefined();
        expect(def!.source.kind).toBe('login-drop');
      }
    }
    expect(hits).toBeGreaterThanOrEqual(3000 / 500); // rare …
    expect(hits).toBeLessThanOrEqual(3000 / 80); // … but real
  });

  it('quantities are positive integers on every lane', () => {
    for (let i = 0; i < 200; i++) {
      for (const r of rollLoginBundle(key(i), i, i + 1).rewards) {
        const qty =
          r.kind === 'cores' || r.kind === 'geneEssence' || r.kind === 'ichor' || r.kind === 'rushStamina' ? r.qty
          : r.kind === 'towerShardsAll' || r.kind === 'heroShardsAll' ? r.qtyEach
          : r.kind === 'container' || r.kind === 'runCache' ? r.count
          : r.kind === 'mats' ? Math.min(...[r.mutagen, r.scrap, r.catalyst].filter((v): v is number => v !== undefined))
          : 1;
        expect(qty).toBeGreaterThan(0);
        expect(Number.isInteger(qty)).toBe(true);
      }
    }
  });
});

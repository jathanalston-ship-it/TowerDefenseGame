import { describe, it, expect } from 'vitest';
import { defaultSave, parseImport } from '../save/saveStore';
import {
  masteryLevel,
  masteryProgress,
  masteryReq,
  nextStarCost,
  starCost,
  towerProgress,
} from './meta';
import { MASTERY, STAR, TOWER_ORDER } from '../core/config';

describe('mastery curve (infinite, ever-slower requirements)', () => {
  it('starts at level 0 and the per-level requirement keeps growing', () => {
    expect(masteryLevel(0)).toBe(0);
    expect(masteryReq(1)).toBeGreaterThan(masteryReq(0));
    expect(masteryReq(10)).toBeGreaterThan(masteryReq(9));
  });

  it('resolves xp into level + remainder consistently', () => {
    const r0 = masteryReq(0);
    expect(masteryProgress(r0)).toMatchObject({ level: 1, into: 0 });
    expect(masteryProgress(r0 + 5)).toMatchObject({ level: 1, into: 5 });
    expect(masteryProgress(r0 + masteryReq(1))).toMatchObject({ level: 2, into: 0 });
  });

  it('level is monotonic in xp', () => {
    let prev = 0;
    for (let xp = 0; xp < 8000; xp += 200) {
      const lvl = masteryLevel(xp);
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });
});

describe('star cost', () => {
  it('grows geometrically and caps at maxTowerStars', () => {
    expect(starCost(0)).toBe(STAR.baseCost);
    expect(starCost(2)).toBe(Math.round(STAR.baseCost * STAR.costMult ** 2));
    const maxed = defaultSave();
    maxed.towerStars.needle = STAR.maxTowerStars;
    expect(nextStarCost(maxed, 'needle')).toBeNull();
    // towers ascend past the ★5 evolution band into the ★6-10 power tiers
    const five = defaultSave();
    five.towerStars.needle = 5;
    expect(nextStarCost(five, 'needle')).not.toBeNull();
    expect(nextStarCost(defaultSave(), 'needle')).toBe(STAR.baseCost);
  });
});

describe('towerProgress (stars + mastery → per-kind mults)', () => {
  it('is identity for a fresh save (base game unchanged)', () => {
    const p = towerProgress(defaultSave());
    for (const k of TOWER_ORDER) {
      expect(p[k].damageMult).toBe(1);
      expect(p[k].fireRateMult).toBe(1);
    }
  });

  it('stars and mastery both raise only the upgraded kind', () => {
    const save = defaultSave();
    save.towerStars.needle = 2;
    save.towerMasteryXp.needle = masteryReq(0) + masteryReq(1); // → mastery level 2
    const p = towerProgress(save);
    expect(p.needle.fireRateMult).toBeCloseTo(1 + STAR.fireRatePerStar * 2, 10);
    expect(p.needle.damageMult).toBeCloseTo(
      (1 + STAR.damagePerStar * 2) * (1 + MASTERY.damagePerLevel * 2),
      10,
    );
    expect(p.mortar.damageMult).toBe(1); // untouched kinds stay identity
  });
});

describe('save v1 → v2 backward compatibility', () => {
  it('an old save without progression fields loads with zeroed records', () => {
    const v1 = { shards: 50, upgrades: { lethality: 2 }, bestWave: 7, totalRuns: 3, lifetimeShards: 120, cardsSeen: 9 };
    const res = parseImport(JSON.stringify(v1));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.shards).toBe(50); // original data preserved
    expect(res.data.towerShards).toEqual(defaultSave().towerShards); // new fields filled
    expect(res.data.towerStars).toEqual(defaultSave().towerStars);
    expect(res.data.towerMasteryXp).toEqual(defaultSave().towerMasteryXp);
    expect(res.data.heroShards).toEqual(defaultSave().heroShards);
  });
});

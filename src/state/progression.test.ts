import { describe, it, expect } from 'vitest';
import { defaultSave, parseImport } from '../save/saveStore';
import {
  heroStarCost,
  masteryLevel,
  masteryProgress,
  masteryReq,
  nextHeroStarCost,
  nextStarCost,
  towerProgress,
  towerStarCost,
} from './meta';
import { HERO_ORDER, MASTERY, STAR, TOWER_ORDER } from '../core/config';

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

describe('star cost — separate tower (★10) and hero (★5) ladders', () => {
  it('tower stars: smooth doubling exponential, capped at maxTowerStars', () => {
    expect(towerStarCost(0)).toBe(STAR.towerBaseCost); // ★1 = 10
    expect(towerStarCost(2)).toBe(Math.round(STAR.towerBaseCost * STAR.towerCostMult ** 2)); // ★3 = 40
    // The documented curve (docs/SHARD-ECONOMY.md) — pin every step so a re-tune is a deliberate edit.
    const curve = Array.from({ length: STAR.maxTowerStars }, (_, s) => towerStarCost(s));
    expect(curve).toEqual([10, 20, 40, 80, 160, 320, 640, 1280, 2560, 5120]);
    expect(curve.reduce((a, b) => a + b, 0)).toBe(10230); // total Tower Shards ★0→★10

    const maxed = defaultSave();
    maxed.towerStars.needle = STAR.maxTowerStars;
    expect(nextStarCost(maxed, 'needle')).toBeNull();
    const five = defaultSave();
    five.towerStars.needle = 5; // towers ascend past the ★5 evolution band into the ★6-10 power tiers
    expect(nextStarCost(five, 'needle')).not.toBeNull();
    expect(nextStarCost(defaultSave(), 'needle')).toBe(STAR.towerBaseCost);
  });

  it('hero stars: a gentler, shorter ★5 ladder, capped at maxStars', () => {
    const curve = Array.from({ length: STAR.maxStars }, (_, s) => heroStarCost(s));
    expect(curve).toEqual([8, 14, 26, 47, 84]);
    expect(curve.reduce((a, b) => a + b, 0)).toBe(179); // total Hero Shards ★0→★5

    const hero = HERO_ORDER[0];
    const maxed = defaultSave();
    maxed.heroStars[hero] = STAR.maxStars;
    expect(nextHeroStarCost(maxed, hero)).toBeNull();
    expect(nextHeroStarCost(defaultSave(), hero)).toBe(STAR.heroBaseCost);
  });

  it('tower stars are the steeper, more demanding ladder', () => {
    // by the top of the hero ladder, the same tower step already costs far more
    expect(towerStarCost(4)).toBeGreaterThan(heroStarCost(4) * 1.5);
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

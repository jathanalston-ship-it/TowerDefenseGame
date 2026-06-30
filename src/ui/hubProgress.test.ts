// Hub nav progress rings — the 0..1 completion ratios the left rail renders as conic gauges.
// Pure derivation of the save, so it's unit-pinned (the visual seed can't be hand-forged past
// the save checksum). Adding a ring keeps these invariants: 0 on a fresh save, 1 when maxed.

import { describe, it, expect } from 'vitest';
import { navProgress } from './hubProgress';
import { defaultSave } from '../save/saveStore';
import { HERO_ORDER, META_UPGRADES, STAR, TOWER_ORDER } from '../core/config';

describe('navProgress', () => {
  it('is 0 on every ring for a fresh save', () => {
    const p = navProgress(defaultSave());
    expect(p.towers).toBe(0);
    expect(p.heroes).toBe(0);
    expect(p.evolution).toBe(0);
  });

  it('towers ring = total stars / (towers × maxTowerStars), reaching 1 when all maxed', () => {
    const all = defaultSave();
    for (const k of TOWER_ORDER) all.towerStars[k] = STAR.maxTowerStars;
    expect(navProgress(all).towers).toBe(1);

    const one = defaultSave();
    one.towerStars[TOWER_ORDER[0]] = STAR.maxTowerStars;
    expect(navProgress(one).towers).toBeCloseTo(1 / TOWER_ORDER.length, 6);
  });

  it('heroes ring tracks hero stars against STAR.maxStars', () => {
    const s = defaultSave();
    for (const k of HERO_ORDER) s.heroStars[k] = STAR.maxStars;
    expect(navProgress(s).heroes).toBe(1);
  });

  it('evolution ring tracks meta-upgrade levels, reaching 1 when fully bought', () => {
    const s = defaultSave();
    for (const u of META_UPGRADES) s.upgrades[u.id] = u.maxLevel;
    expect(navProgress(s).evolution).toBe(1);
  });

  it('clamps to [0,1] even if a value somehow exceeds its cap', () => {
    const s = defaultSave();
    for (const k of TOWER_ORDER) s.towerStars[k] = STAR.maxTowerStars * 5;
    expect(navProgress(s).towers).toBe(1);
  });
});

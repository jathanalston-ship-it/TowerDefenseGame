// Infestation map (docs/INFESTATION.md): runs feed the target (losses at half), lazy
// decay drains neglect, region passives scale with live fractions, fresh boards are ×1.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import type { RunResult } from './meta';
import { defaultLifetimeStats } from '../save/saveStore';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';
import {
  ALL_SECTORS, DECAY_PER_DAY, GAIN_CAP_PER_RUN, REGIONS, effectiveLevel, infestationEffects, runInfestGain,
} from '../core/infestation';
import type { RunStats } from '../core/types';

function run(wave: number, won: boolean): RunResult {
  const zero = { kills: 0, damage: 0, activeTime: 0 };
  const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
  const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
  const stats: RunStats = {
    kills: 10, wave, won, biomassEarned: 0, damageDealt: 100, integrityLost: won ? 0 : 100,
    killsByEnemy: defaultLifetimeStats().killsByEnemy,
    towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
    cardIds: [], heroId: HERO_ORDER[0],
  };
  return { wave, kills: 10, won, mastery, heroMastery, stats };
}

describe('infestation core math', () => {
  it('gains scale with waves, halve on losses, and cap per run', () => {
    expect(runInfestGain(10, true)).toBe(20);
    expect(runInfestGain(10, false)).toBe(10);
    expect(runInfestGain(99, true)).toBe(GAIN_CAP_PER_RUN);
    expect(runInfestGain(0, true)).toBe(0);
  });

  it('lazy decay drains a neglected sector at DECAY_PER_DAY', () => {
    const t0 = 1_700_000_000_000;
    const s = { level: 50, updatedAt: t0 };
    expect(effectiveLevel(s, t0)).toBe(50);
    expect(effectiveLevel(s, t0 + 5 * 86_400_000)).toBe(50 - 5 * DECAY_PER_DAY);
    expect(effectiveLevel(s, t0 + 400 * 86_400_000)).toBe(0); // floors at zero
  });

  it('a fresh board pays nothing; a fed region pays its scaled passive', () => {
    expect(infestationEffects({}, 0)).toEqual([]);
    const t0 = 1_700_000_000_000;
    const region = REGIONS[0];
    const sectors = Object.fromEntries(region.sectors.map((s) => [s.id, { level: 100, updatedAt: t0 }]));
    const fx = infestationEffects(sectors, t0);
    expect(fx).toHaveLength(1);
    expect(fx[0]).toEqual({ op: 'mul', field: region.bonus.field, value: region.bonus.max });
  });
});

describe('infestation × finishRun', () => {
  it('feeds the pinned sector on wins and half-feeds on losses', () => {
    meta.reset();
    const target = ALL_SECTORS[5].id;
    expect(meta.setInfestTarget(target)).toBe(true);
    meta.finishRun(run(10, true));
    const lvl1 = meta.infestationView().sectors[target];
    expect(Math.round(lvl1)).toBe(20);
    meta.finishRun(run(10, false));
    const lvl2 = meta.infestationView().sectors[target];
    expect(Math.round(lvl2)).toBe(30);
  });

  it('auto-spreads to the emptiest sector when nothing is pinned', () => {
    meta.reset();
    meta.finishRun(run(8, true)); // 16 points land somewhere (the emptiest = first empty)
    const view = meta.infestationView();
    const fed = Object.values(view.sectors).filter((v) => v > 0);
    expect(fed).toHaveLength(1);
    expect(Math.round(fed[0])).toBe(16);
  });

  it('rejects junk targets', () => {
    meta.reset();
    expect(meta.setInfestTarget('not_a_sector')).toBe(false);
    expect(meta.setInfestTarget(null)).toBe(true);
  });
});

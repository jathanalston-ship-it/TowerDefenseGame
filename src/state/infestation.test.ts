// Infestation map (docs/INFESTATION.md): runs feed the target (losses at half), lazy
// decay drains neglect, region passives scale with live fractions, fresh boards are ×1.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import type { RunResult } from './meta';
import { defaultLifetimeStats } from '../save/saveStore';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';
import {
  ALL_SECTORS, DECAY_PER_DAY, ENTRENCH_MULT, GAIN_CAP_PER_RUN, REGIONS, SATURATED_DECAY_MULT,
  effectiveLevel, feedInfestation, infestationEffects, resolveFeedTarget, runInfestGain, tierHoldDays, tierOf, zeroInDays,
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

  it('a fresh board pays nothing; a fed region pays its scaled passive; saturation ENTRENCHES it', () => {
    expect(infestationEffects({}, 0)).toEqual([]);
    const t0 = 1_700_000_000_000;
    const region = REGIONS[0];
    // Half-fed: the plain linear passive, no overdrive.
    const half = Object.fromEntries(region.sectors.map((s) => [s.id, { level: 50, updatedAt: t0 }]));
    const halfFx = infestationEffects(half, t0)[0];
    expect(halfFx.op).toBe('mul');
    if (halfFx.op === 'mul') expect(halfFx.value).toBeCloseTo(1 + (region.bonus.max - 1) * 0.5, 9);
    // Fully saturated: the bonus portion pays ×ENTRENCH_MULT (docs §entrenchment).
    const full = Object.fromEntries(region.sectors.map((s) => [s.id, { level: 100, updatedAt: t0 }]));
    const fx = infestationEffects(full, t0);
    expect(fx).toHaveLength(1);
    expect(fx[0]).toEqual({ op: 'mul', field: region.bonus.field, value: 1 + (region.bonus.max - 1) * ENTRENCH_MULT });
  });

  it('saturation halves decay; tiers name the ladder; forecasts count the days', () => {
    const t0 = 1_700_000_000_000;
    const sat = { level: 100, updatedAt: t0 };
    const mid = { level: 60, updatedAt: t0 };
    const day = 86_400_000;
    expect(effectiveLevel(sat, t0 + 10 * day)).toBe(100 - 10 * DECAY_PER_DAY * SATURATED_DECAY_MULT);
    expect(effectiveLevel(mid, t0 + 10 * day)).toBe(60 - 10 * DECAY_PER_DAY);
    expect(tierOf(0).name).toBe('Dormant');
    expect(tierOf(10).name).toBe('Foothold');
    expect(tierOf(50).name).toBe('Colony');
    expect(tierOf(80).name).toBe('Stronghold');
    expect(tierOf(100).name).toBe('Saturated');
    expect(tierOf(100).next).toBeNull();
    expect(zeroInDays(mid, t0)).toBeCloseTo(60 / DECAY_PER_DAY, 9);
    expect(zeroInDays(undefined, t0)).toBeNull();
    // A Stronghold at 80 drops out of its tier when it hits 70 → 10 points / 2 per day.
    expect(tierHoldDays({ level: 80, updatedAt: t0 }, t0)).toBeCloseTo(5, 9);
  });

  it('spillover pours overflow into the SAME region first, then anywhere — nothing wasted', () => {
    const t0 = 1_700_000_000_000;
    const region = REGIONS[0];
    const [a, b, c, d] = region.sectors;
    const sectors = {
      [a.id]: { level: 95, updatedAt: t0 },
      [b.id]: { level: 20, updatedAt: t0 },
      [c.id]: { level: 100, updatedAt: t0 }, // full — spillover must skip it
      [d.id]: { level: 100, updatedAt: t0 },
    };
    const r = feedInfestation(sectors, a.id, 30, t0);
    expect(r.fed).toEqual([{ id: a.id, amount: 5 }, { id: b.id, amount: 25 }]); // same-region, not-full
    expect(effectiveLevel(r.sectors[a.id], t0)).toBe(100);
    expect(effectiveLevel(r.sectors[b.id], t0)).toBe(45);
    // A fully saturated map discards the remainder without looping forever.
    const everything = Object.fromEntries(ALL_SECTORS.map((x) => [x.id, { level: 100, updatedAt: t0 }]));
    expect(feedInfestation(everything, a.id, 40, t0).fed).toEqual([]);
  });

  it('resolves pins: sector → itself, region → its emptiest, null/junk → emptiest anywhere', () => {
    const t0 = 1_700_000_000_000;
    const region = REGIONS[1];
    const sectors = {
      [region.sectors[2].id]: { level: 10, updatedAt: t0 },
      [REGIONS[0].sectors[0].id]: { level: 5, updatedAt: t0 },
    };
    expect(resolveFeedTarget(region.sectors[2].id, sectors, t0)).toBe(region.sectors[2].id);
    expect(resolveFeedTarget(region.id, sectors, t0)).toBe(region.sectors[0].id); // emptiest IN the region (0)
    // Emptiest anywhere: ALL_SECTORS[0] holds 5, so the first zero-level sector wins.
    expect(resolveFeedTarget(null, sectors, t0)).toBe(ALL_SECTORS[1].id);
    expect(resolveFeedTarget('junk', sectors, t0)).toBe(ALL_SECTORS[1].id);
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

  it('rejects junk targets but accepts REGION pins (feeding the region\'s emptiest)', () => {
    meta.reset();
    expect(meta.setInfestTarget('not_a_sector')).toBe(false);
    expect(meta.setInfestTarget(null)).toBe(true);
    const region = REGIONS[2];
    expect(meta.setInfestTarget(region.id)).toBe(true);
    meta.finishRun(run(10, true)); // 20 points land on the region's emptiest sector
    const view = meta.infestationView();
    const fedInRegion = region.sectors.filter((x) => view.sectors[x.id] > 0);
    expect(fedInRegion).toHaveLength(1);
    expect(Math.round(view.sectors[fedInRegion[0].id])).toBe(20);
    expect(view.feedsInto).toBeTruthy(); // the preview names the next destination
  });

  it('the view carries tiers, forecasts, and map totals', () => {
    meta.reset();
    meta.setInfestTarget(ALL_SECTORS[0].id);
    meta.finishRun(run(20, true)); // 40 points → Colony
    const v = meta.infestationView();
    const d = v.sectorDetails[ALL_SECTORS[0].id];
    expect(d.tier.name).toBe('Colony');
    expect(d.zeroInDays).toBeCloseTo(40 / DECAY_PER_DAY, 1);
    expect(v.completion).toBeGreaterThan(0);
    expect(v.saturatedCount).toBe(0);
  });
});

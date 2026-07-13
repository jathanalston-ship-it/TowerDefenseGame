import { describe, it, expect } from 'vitest';
import { nextGoals } from './nextGoal';
import { towerStarCost } from './meta';
import { defaultSave } from '../save/saveStore';

describe('Next-Goal engine (the anticipation spine)', () => {
  it('always returns at least one imminent goal (a screen is never a dead end)', () => {
    expect(nextGoals(defaultSave()).length).toBeGreaterThan(0);
  });

  it('surfaces a locked hero as a Release goal with correct progress + remaining', () => {
    const s = { ...defaultSave(), heroShards: { ...defaultSave().heroShards, shepherd: 42 } };
    const g = nextGoals(s).find((x) => x.id === 'release:shepherd');
    expect(g).toBeTruthy();
    expect(g!.kind).toBe('hero-release');
    expect(g!.progress).toBeCloseTo(42 / 60, 5); // Shepherd unlock cost is 60
    expect(g!.remaining).toBe('18 Apex Genome');
    expect(g!.nav).toBe('heroes');
  });

  it('does NOT surface an already-owned hero as a Release goal', () => {
    // Own every SHARD-claimable hero (milestone heroes never surface as Release goals).
    const s = { ...defaultSave(), heroUnlocked: ['ravager', 'shepherd', 'overseer', 'fovea'] as never };
    expect(nextGoals(s).some((x) => x.kind === 'hero-release')).toBe(false);
  });

  it('ranks closest-to-done first', () => {
    const s = { ...defaultSave(), heroShards: { ...defaultSave().heroShards, shepherd: 55, overseer: 5 } };
    const goals = nextGoals(s);
    for (let i = 1; i < goals.length; i++) expect(goals[i - 1].progress).toBeGreaterThanOrEqual(goals[i].progress);
    // Shepherd at 55/60 (0.92) should outrank Overseer at 5/100 (0.05).
    const shep = goals.findIndex((g) => g.id === 'release:shepherd');
    const over = goals.findIndex((g) => g.id === 'release:overseer');
    expect(shep).toBeLessThan(over);
  });

  it('surfaces a partially-funded Evolution (0 < progress < 1) for a strain', () => {
    const base = defaultSave();
    const firstTower = Object.keys(base.towerStars)[0];
    const partial = Math.max(1, Math.floor(towerStarCost(0) * 0.8)); // 80% of the way to Evolution 1
    const s = { ...base, campaign: { cleared: { standard: 12 }, bestTime: {} }, towerShards: { ...base.towerShards, [firstTower]: partial } };
    const evo = nextGoals(s).find((x) => x.id === `evo:tower:${firstTower}`);
    expect(evo).toBeTruthy();
    expect(evo!.kind).toBe('evolution');
    expect(evo!.progress).toBeGreaterThan(0);
    expect(evo!.progress).toBeLessThan(1);
  });
});

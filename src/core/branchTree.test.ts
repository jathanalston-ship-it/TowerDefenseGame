import { describe, it, expect } from 'vitest';
import { branchStatsView, branchTreeView } from './branchTree';
import { branchesFor } from './branches';
import { BRANCH_COSTS, TOWER_DEFS, TOWER_ORDER } from './config';

describe('branchTreeView (Mutation panel read-model)', () => {
  it('offers BOTH paths before commit — every tier-1 is the buyable "next"', () => {
    const tree = branchTreeView('needle', null, 0, 1000);
    expect(tree.lanes.length).toBe(branchesFor('needle').length); // generic over the authored set
    expect(tree.committedId).toBeNull();
    for (const lane of tree.lanes) {
      expect(lane.committed).toBe(false);
      expect(lane.lockedOut).toBe(false);
      expect(lane.owned).toBe(0);
      expect(lane.tiers[0].state).toBe('next'); // tier 1 is the lock purchase
      expect(lane.tiers.slice(1).every((t) => t.state === 'future')).toBe(true);
      expect(lane.next).toBe(lane.tiers[0]);
    }
  });

  it('reflects affordability with the sim rule (biomass >= cost)', () => {
    const rich = branchTreeView('needle', null, 0, 1000); // tier-1 needle costs 600
    const poor = branchTreeView('needle', null, 0, 100);
    expect(rich.lanes[0].tiers[0].affordable).toBe(true);
    expect(poor.lanes[0].tiers[0].affordable).toBe(false);
  });

  it('after commit: the chosen lane climbs, the other is fully LOCKED OUT', () => {
    const tree = branchTreeView('needle', 'needle_swarm', 2, 1_000_000);
    const swarm = tree.lanes.find((l) => l.branchId === 'needle_swarm')!;
    const rail = tree.lanes.find((l) => l.branchId === 'needle_rail')!;

    expect(swarm.committed).toBe(true);
    expect(swarm.owned).toBe(2);
    expect(swarm.tiers.map((t) => t.state)).toEqual(['owned', 'owned', 'next', 'future', 'future']);
    expect(swarm.next!.tier).toBe(3);

    expect(rail.lockedOut).toBe(true);
    expect(rail.tiers.every((t) => t.state === 'lockedout')).toBe(true);
    expect(rail.next).toBeNull(); // the closed path can never be bought
  });

  it('a maxed lane has no next tier', () => {
    const tree = branchTreeView('needle', 'needle_swarm', 5, 1_000_000);
    const swarm = tree.lanes.find((l) => l.branchId === 'needle_swarm')!;
    expect(swarm.tiers.every((t) => t.state === 'owned')).toBe(true);
    expect(swarm.next).toBeNull();
  });

  it('surfaces the per-tier Biomass cost ladder from config', () => {
    const tree = branchTreeView('needle', 'needle_swarm', 0, 0);
    const swarm = tree.lanes.find((l) => l.branchId === 'needle_swarm')!;
    expect(swarm.tiers.map((t) => t.cost)).toEqual([...BRANCH_COSTS.needle]);
  });

  it('is generic across the whole tower roster (no hardcoded branch/tier counts)', () => {
    for (const kind of TOWER_ORDER) {
      const tree = branchTreeView(kind, null, 0, 0);
      expect(tree.lanes.length).toBe(branchesFor(kind).length);
      for (const lane of tree.lanes) {
        const def = branchesFor(kind).find((b) => b.id === lane.branchId)!;
        expect(lane.tiers.length).toBe(def.tiers.length); // mirrors the data, whatever its length
      }
    }
  });
});

describe('branchStatsView (branch-folded Current Stats)', () => {
  it('is the base def profile when unbranched (kit identity)', () => {
    const def = TOWER_DEFS.needle;
    const s = branchStatsView('needle', null, 0);
    expect(s.range).toBe(Math.round(def.range));
    expect(s.shots).toBe(1);
    expect(s.dps).toBe(Math.round((def.damage / def.fireInterval) * 1));
  });

  it('folds tier mults: extra shots, faster rate, and higher damage raise DPS', () => {
    const base = branchStatsView('needle', null, 0);
    // needle_swarm T2: +2 needles (shots ×3), ×1.2 fire rate, ×1.1 damage from T1.
    const t2 = branchStatsView('needle', 'needle_swarm', 2);
    expect(t2.shots).toBe(3);
    expect(t2.rate!).toBeGreaterThan(base.rate!);
    expect(t2.dps!).toBeGreaterThan(base.dps!);
  });
});

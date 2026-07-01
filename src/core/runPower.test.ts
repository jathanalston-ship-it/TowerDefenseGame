// In-run Power Score coverage (docs/POWER-AUDIT.md) — every IN-RUN strength purchase must move
// the temporary Power bucket, pinned here after the reported bug: Tower Branch tiers raised
// strength without raising Power. The game's runtime validator (powerAuditWarnings) is the
// always-on tripwire; these tests prove it stays silent for every legitimate action.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { branchPowerEffects, BRANCH_TIER_POWER, effectsPower } from './power';
import { branchesFor } from './branches';
import { HERO_EVO_CATEGORIES } from './heroEvolution';
import { towerSlots } from './map';
import { TOWER_ORDER } from './config';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

function funded(seed = 7): Game {
  const g = new Game(seed, NO_META);
  g.debugAddBiomass(1_000_000);
  return g;
}

function placeFirst(g: Game, kind = TOWER_ORDER[0]): number {
  for (const s of towerSlots) if (g.placeTower(kind, s.x, s.y)) return g.towers[g.towers.length - 1].id;
  throw new Error('no slot');
}

const tempPower = (g: Game): number => effectsPower(g.powerEffects());

describe('branchPowerEffects — the scoring vehicle', () => {
  it('is exact at 0 tiers and linear per tier (BRANCH_TIER_POWER)', () => {
    expect(branchPowerEffects(0)).toEqual([]);
    expect(effectsPower(branchPowerEffects(1))).toBeGreaterThan(1);
    const three = branchPowerEffects(3)[0] as { value: number };
    expect(three.value).toBeCloseTo(1 + BRANCH_TIER_POWER * 3, 10);
  });
});

describe('every in-run strength purchase moves the temporary Power bucket', () => {
  it('Tower Branch tiers raise Power — the reported bug, fixed and pinned', () => {
    const g = funded();
    const kind = TOWER_ORDER[0];
    const id = placeFirst(g, kind);
    const branch = branchesFor(kind)[0];
    let prev = tempPower(g);
    for (let tier = 1; tier <= 5; tier++) {
      expect(g.buyBranchTier(id, branch.id)).toBe('ok');
      const now = tempPower(g);
      expect(now, `tier ${tier} must raise temp Power`).toBeGreaterThan(prev);
      prev = now;
    }
    // A SECOND branched tower stacks further (per-tier accounting, not per-tower flag).
    const id2 = placeFirst(g, kind);
    expect(g.buyBranchTier(id2, branch.id)).toBe('ok');
    expect(tempPower(g)).toBeGreaterThan(prev);
    expect(g.powerAuditWarnings).toEqual([]);
  });

  it('Hero Evolution levels raise Power (every category)', () => {
    const g = funded();
    let prev = tempPower(g);
    for (const cat of HERO_EVO_CATEGORIES) {
      expect(g.buyHeroEvolution(cat.id)).toBe(true);
      const now = tempPower(g);
      expect(now, `${cat.id} must raise temp Power`).toBeGreaterThan(prev);
      prev = now;
    }
    expect(g.powerAuditWarnings).toEqual([]);
  });

  it('the runtime validator stays silent across a mixed run (the always-on tripwire works)', () => {
    const g = funded();
    const id = placeFirst(g);
    g.buyBranchTier(id, branchesFor(TOWER_ORDER[0])[0].id);
    g.buyHeroEvolution(HERO_EVO_CATEGORIES[0].id);
    expect(g.powerAuditWarnings).toEqual([]);
  });
});

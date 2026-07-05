// Tower visual evolution (TOWER-BRANCHES.md §9). The renderer can't be pixel-asserted in jsdom,
// but the DATA contract can — and that contract IS the feature: every shipped branch has an
// evolution spec, and every tier 1..5 introduces a new organ so each upgrade visibly mutates.
// These assertions also future-proof: a new branch added to the sim with no visuals fails here.

import { describe, it, expect } from 'vitest';
import { branchRegistry } from '../core/branches';
import { BRANCH_EVOLUTION, evolutionGrowth, branchSkinColor, drawTowerEvolution } from './towerEvolution';
import type { Tower } from '../core/types';

// A recursive no-op Canvas2D stub (chained calls + property reads return the proxy).
function stubCtx(): CanvasRenderingContext2D {
  const proxy: unknown = new Proxy(function () { /* noop */ }, { get: () => proxy, set: () => true, apply: () => proxy });
  return proxy as CanvasRenderingContext2D;
}

function makeTower(branchId: string, tier: number): Tower {
  return { id: 1, kind: 'needle', x: 100, y: 100, slot: 0, cooldown: 0, overcharged: false, bornAt: 0, disabledUntil: 0, dampenedUntil: 0, dampenFrac: 0, branchId, tier, strain: 1, strainCd: 0, pulseCd: 0, mutatedAt: -100, movedAt: -100 };
}

const branchIds = branchRegistry.all().map((b) => b.id);

describe('tower visual evolution', () => {
  it('every shipped branch has an evolution spec (future-proof guard)', () => {
    expect(branchIds.length).toBeGreaterThan(0);
    for (const id of branchIds) expect(BRANCH_EVOLUTION[id], `${id} has no visual evolution`).toBeDefined();
  });

  it('every tier 1..5 introduces a NEW organ — so every upgrade visibly mutates', () => {
    for (const id of branchIds) {
      const evo = BRANCH_EVOLUTION[id];
      for (const part of evo.parts) expect(part.at >= 1 && part.at <= 5, `${id} part.at out of range`).toBe(true);
      for (let tier = 1; tier <= 5; tier++) {
        expect(evo.parts.some((p) => p.at === tier), `${id} tier ${tier} adds no new organ`).toBe(true);
      }
    }
  });

  it('body growth rises with each tier and is identity when unbranched', () => {
    expect(evolutionGrowth(null, 3)).toBe(1);
    expect(evolutionGrowth('needle_swarm', 0)).toBe(1);
    for (const id of branchIds) {
      let prev = 1;
      for (let tier = 1; tier <= 5; tier++) {
        const g = evolutionGrowth(id, tier);
        expect(g, `${id} t${tier} not larger than t${tier - 1}`).toBeGreaterThan(prev);
        prev = g;
      }
    }
    expect(evolutionGrowth('future_unspecced_branch', 5)).toBeGreaterThan(1); // future branch still grows
  });

  it('renders every branch at every tier without throwing (all organs execute)', () => {
    const ctx = stubCtx();
    for (const id of branchIds) {
      for (let tier = 1; tier <= 5; tier++) {
        expect(() => drawTowerEvolution(ctx, makeTower(id, tier), 1.23, 14, '#888888', 0.5), `${id} t${tier}`).not.toThrow();
      }
    }
    // the generic fallback path (a future branch with no spec) also composes cleanly
    expect(() => drawTowerEvolution(ctx, makeTower('future_unspecced_branch', 4), 1, 14, '#888', 0)).not.toThrow();
  });

  it('branchSkinColor maps known skins and defaults otherwise', () => {
    expect(branchSkinColor('needle_swarm')).toBe('#c8f04a');
    expect(branchSkinColor(undefined)).toBe('#ffffff');
    expect(branchSkinColor('unknown_skin')).toBe('#ffffff');
  });
});

// The Molt Chamber's decision numbers (docs/PROGRESSION-REDESIGN.md §molt-chamber): the
// view-model's before→after multiplier, next-cell forecasting, invested-cells ledger and the
// reset manifest counts — all derived, all consistent with the core math.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import { prestigeMult, shardsForCells, PRESTIGE } from '../core/prestige';
import { ascendantCost, ASCENDANT_NODES } from '../core/ascendant';

describe('prestigeView — the Molt Chamber decision numbers', () => {
  it('fresh account: ×1 now, ×1 after (no mint), zero invested, empty manifest', () => {
    meta.reset();
    const p = meta.prestigeView();
    expect(p.mult).toBe(1);
    expect(p.gain).toBe(0);
    expect(p.multAfter).toBe(1);
    expect(p.spentCells).toBe(0);
    expect(p.upgradeLevels).toBe(0);
    expect(p.mintProgress).toBe(0);
  });

  it('multAfter previews exactly prestigeMult(lifetime + gain); next-cell forecast inverts the mint', () => {
    meta.reset();
    const save = meta.get();
    meta.importText(JSON.stringify({
      ...save,
      campaign: { ...save.campaign, cleared: { standard: 17 } },
      prestige: { ...save.prestige, cycleShards: 9800 },
    }));
    const p = meta.prestigeView();
    expect(p.gain).toBe(14); // ⌊1.5·√98⌋, no Resonance owned
    expect(p.multAfter).toBeCloseTo(prestigeMult(0 + 14), 9);
    expect(p.multAfter).toBeGreaterThan(p.mult);
    expect(p.nextCellNeed).toBe(shardsForCells(15));
    const floor14 = shardsForCells(14);
    expect(p.nextCellProgress).toBeCloseTo((9800 - floor14) / (shardsForCells(15) - floor14), 6);
    expect(p.canMolt).toBe(true); // stage 17 ≥ req 10, mint 14 ≥ minCells 12
    expect(PRESTIGE.molt.minCells).toBeLessThanOrEqual(14);
  });

  it('spentCells sums the geometric price of every owned tree level', () => {
    meta.reset();
    const save = meta.get();
    // grant cells directly through the tree API path: seed prestige via import surface
    const def = ASCENDANT_NODES[0];
    const twoLevels = ascendantCost(def, 0) + ascendantCost(def, 1);
    meta.importText(JSON.stringify({
      ...save,
      prestige: { ...save.prestige, cells: 0, lifetimeCells: twoLevels, nodes: { [def.id]: 2 } },
    }));
    expect(meta.prestigeView().spentCells).toBe(twoLevels);
  });
});

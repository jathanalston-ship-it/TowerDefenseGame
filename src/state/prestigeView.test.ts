// The Molt Chamber's decision numbers (docs/PROGRESSION-REDESIGN.md §molt-chamber): the
// view-model's before→after multiplier, next-cell forecasting, invested-cells ledger and the
// reset manifest counts — all derived, all consistent with the core math.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import { imprintedUpgrades, moltImprint, prestigeMult, prestigeStageReq, shardsForCells, PRESTIGE } from '../core/prestige';
import { defaultSave, serializeExport } from '../save/saveStore';
import { META_UPGRADES } from '../core/config';
import { sumValues } from '../core/math';
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

// MOLT IMPRINT (docs/BALANCE_ARCHITECTURE.md §9.6): a Molt keeps ⌊level × moltImprint(molts)⌋ of
// every Genome upgrade, so the post-Molt Power trough stays bounded as the engine deepens.
describe('Molt Imprint — what a Molt keeps, previewed exactly', () => {
  // A deep engine: every capped upgrade at ~70% of its cap + the Runaway tier at 30 (gates are
  // purchase-time only, so imported levels apply as-is).
  const deepUpgrades = (): Record<string, number> => Object.fromEntries(META_UPGRADES.map((u) => [u.id, u.infinite ? 30 : Math.ceil(u.maxLevel * 0.7)]));
  const seed = (molts: number, upgrades: Record<string, number>): void => {
    const base = defaultSave();
    expect(meta.importText(serializeExport({
      ...base,
      shards: 1234,
      upgrades,
      campaign: { cleared: { standard: prestigeStageReq(molts) }, bestTime: {} },
      prestige: { ...base.prestige, molts, cells: 0, lifetimeCells: 25 * molts, cycleShards: 40000 },
    })).ok).toBe(true);
  };

  it('the FIRST Molt sheds every level — behaves exactly as before the Imprint', () => {
    seed(0, { lethality: 10, apex: 4 });
    const v = meta.prestigeView();
    expect(v.imprint).toBe(0);
    expect(v.upgradeLevels).toBe(14); // the manifest's "sheds" count
    expect(v.upgradeLevelsKept).toBe(0);
    expect(meta.molt()).toBe(true);
    expect(meta.get().upgrades).toEqual({});
  });

  it('a late Molt keeps the capped Imprint share — and the manifest counts match the outcome', () => {
    const up = deepUpgrades();
    const molts = Math.ceil(PRESTIGE.molt.imprintMax / PRESTIGE.molt.imprintPerMolt) + 10; // past the cap
    seed(molts, up);
    const v = meta.prestigeView();
    expect(v.imprint).toBe(PRESTIGE.molt.imprintMax);
    const kept = imprintedUpgrades(up, moltImprint(molts));
    expect(v.upgradeLevelsKept).toBe(sumValues(kept));
    expect(v.upgradeLevels + v.upgradeLevelsKept).toBe(sumValues(up));
    expect(meta.molt()).toBe(true);
    expect(meta.get().upgrades).toEqual(kept);
    expect(meta.get().upgrades.lethality).toBe(Math.round(7 * PRESTIGE.molt.imprintMax)); // 70% of 10, then the Imprint share
  });

  it('the Power preview after a Molt IS the outcome (Power honesty — what the chamber shows is what the sim gets)', () => {
    for (const molts of [0, 8, 60]) {
      seed(molts, deepUpgrades());
      const preview = meta.moltPowerPreview();
      expect(preview.before).toBe(meta.power().score);
      expect(meta.molt()).toBe(true);
      expect(meta.power().score).toBe(preview.after);
    }
  });

  it('bounds the trough STRUCTURALLY: even a fully-bought engine dips ≤ ×5 under the capped Imprint', () => {
    // Every capped upgrade at its cap + the Runaway tier at 40 — the deepest engine the current
    // catalog allows. Without the Imprint this Molt crashes Power by hundreds; with it capped, the
    // dip stays inside the §9.6 contract (≤ ×5), yet the Molt still costs Power (a real reset).
    const full = Object.fromEntries(META_UPGRADES.map((u) => [u.id, u.infinite ? 40 : u.maxLevel]));
    seed(Math.ceil(PRESTIGE.molt.imprintMax / PRESTIGE.molt.imprintPerMolt), full);
    const imprinted = meta.moltPowerPreview();
    seed(0, full); // same engine under the first-Molt rule (Imprint 0)
    const bare = meta.moltPowerPreview();
    expect(imprinted.before / imprinted.after).toBeGreaterThan(1);
    expect(imprinted.before / imprinted.after).toBeLessThanOrEqual(5);
    expect(bare.before / bare.after).toBeGreaterThan(100);
  });
});

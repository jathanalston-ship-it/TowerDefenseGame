import { describe, it, expect } from 'vitest';
import { defaultSave, serializeExport } from '../save/saveStore';
import { meta, metaModifiers, upgradeCost } from './meta';
import { META_UPGRADES, TOWER_ORDER } from '../core/config';
import { isLootRarity } from '../core/loot';
import { defaultPrestige } from '../core/prestige';

describe('metaModifiers (data-driven upgrades)', () => {
  it('is identity with no upgrades', () => {
    expect(metaModifiers(defaultSave())).toEqual({
      towerDamageMult: 1,
      biomassMult: 1,
      heroDamageMult: 1,
      integrityBonus: 0,
    });
  });

  it('applies an upgrade per its declared data', () => {
    const m = metaModifiers({ ...defaultSave(), upgrades: { lethality: 3 } });
    expect(m.towerDamageMult).toBeCloseTo(1.24, 10); // 1 + 0.08*3
    expect(m.biomassMult).toBe(1);
  });

  it('folds every upgrade generically from config (no hardcoded ids)', () => {
    const upgrades: Record<string, number> = {};
    for (const u of META_UPGRADES) upgrades[u.id] = 1;
    const m = metaModifiers({ ...defaultSave(), upgrades }) as unknown as Record<string, number>;
    for (const u of META_UPGRADES) {
      const base = u.effect.stat === 'integrityBonus' ? 0 : 1;
      expect(m[u.effect.stat]).toBeCloseTo(base + u.effect.perLevel, 10);
    }
  });

  it('upgradeCost grows geometrically', () => {
    const def = META_UPGRADES[0];
    expect(upgradeCost(def, 0)).toBe(def.baseCost);
    expect(upgradeCost(def, 2)).toBe(Math.round(def.baseCost * def.costMult ** 2));
  });

  it('folds the prestige P-bucket into tower + hero damage (×1 at zero cells)', () => {
    expect(metaModifiers(defaultSave()).towerDamageMult).toBe(1); // fresh = identity (golden-safe)
    const ascended = metaModifiers({ ...defaultSave(), prestige: { ...defaultPrestige(), lifetimeCells: 100 } });
    expect(ascended.towerDamageMult).toBeCloseTo(2.0, 10); // ×(1 + 0.1·√100)
    expect(ascended.heroDamageMult).toBeCloseTo(2.0, 10);
  });
});

describe('prestige MOLT (the ascension loop)', () => {
  it('mints cells, raises the multiplier, and resets the engine — keeping trophies', () => {
    // Seed a save mid-cycle (banked shards + core upgrades + a maxed tower star to keep).
    const seeded = {
      ...defaultSave(),
      shards: 500,
      upgrades: { lethality: 3 },
      towerStars: { ...defaultSave().towerStars, needle: 5 },
      prestige: { ...defaultPrestige(), cycleShards: 10000 },
    };
    const imported = meta.importText(serializeExport(seeded));
    expect(imported.ok).toBe(true);

    const before = meta.prestigeView();
    expect(before.canMolt).toBe(true);
    expect(before.gain).toBe(15); // 1.5·√(10000/100)

    expect(meta.molt()).toBe(true);

    const after = meta.prestigeView();
    expect(after.lifetimeCells).toBe(15);
    expect(after.cells).toBe(15);
    expect(after.molts).toBe(1);
    expect(after.cycleShards).toBe(0); // cycle reset
    expect(after.mult).toBeCloseTo(1 + 0.1 * Math.sqrt(15), 10);

    const save = meta.get();
    expect(save.shards).toBe(0); // engine reset …
    expect(save.upgrades).toEqual({}); // …
    expect(save.towerStars.needle).toBe(5); // … but the star trophy is kept

    expect(meta.molt()).toBe(false); // nothing left to mint this cycle
  });
});

describe('ascendant tree (spending cells)', () => {
  it('buys nodes, folds their bonuses, and keeps them across a Molt', () => {
    const seeded = { ...defaultSave(), prestige: { ...defaultPrestige(), cells: 20, cycleShards: 10000, nodes: {} } };
    expect(meta.importText(serializeExport(seeded)).ok).toBe(true);

    expect(meta.buyAscendantNode('greed')).toBe(true);
    expect(meta.ascendantNodes().nodes.find((n) => n.id === 'greed')!.level).toBe(1);
    expect(meta.ascendantNodes().cells).toBeLessThan(20); // cells were spent

    expect(meta.buyAscendantNode('metabolism')).toBe(true);
    expect(metaModifiers(meta.get()).biomassMult).toBeCloseTo(1.1, 10); // node folds into the run

    const before = meta.ascendantNodes();
    expect(meta.molt()).toBe(true);
    const after = meta.ascendantNodes();
    expect(after.nodes.find((n) => n.id === 'greed')!.level).toBe(1); // tree persists across Molt
    expect(after.cells).toBeGreaterThan(before.cells); // … and the Molt minted more cells
  });

  it('Ascendant Resonance compounds the Molt yield', () => {
    meta.importText(serializeExport({ ...defaultSave(), prestige: { ...defaultPrestige(), cycleShards: 10000 } }));
    const plain = meta.prestigeView().gain;
    meta.importText(serializeExport({ ...defaultSave(), prestige: { ...defaultPrestige(), cycleShards: 10000, nodes: { resonance: 5 } } }));
    expect(meta.prestigeView().gain).toBeGreaterThan(plain);
  });

  it('rejects an unaffordable or unknown node', () => {
    meta.importText(serializeExport({ ...defaultSave(), prestige: { ...defaultPrestige(), cells: 0 } }));
    expect(meta.buyAscendantNode('greed')).toBe(false); // no cells
    expect(meta.buyAscendantNode('nope')).toBe(false); // unknown id
  });
});

describe('loot queue integration (the finishRun banking seam)', () => {
  it('banking loot points awards boxes and grants their shards, keeping the queue valid', () => {
    meta.reset(); // known clean state (a fresh, pre-determined queue)
    const before = meta.get();
    const towerBefore = TOWER_ORDER.reduce((s, k) => s + before.towerShards[k], 0);
    const heroBefore = Object.values(before.heroShards).reduce((a, b) => a + b, 0);

    const out = meta.debugAddLootPoints(5000); // ≫ any front box cost → awards ≥ 1
    expect(out.awarded.length).toBeGreaterThan(0);

    const after = meta.get();
    const towerAfter = TOWER_ORDER.reduce((s, k) => s + after.towerShards[k], 0);
    const heroAfter = Object.values(after.heroShards).reduce((a, b) => a + b, 0);
    // every opened box grants shards (tower and/or hero) → net positive gain
    expect(towerAfter - towerBefore + (heroAfter - heroBefore)).toBeGreaterThan(0);
    // the queue stays full + valid after awarding (next box always pre-determined)
    expect(after.lootQueue.queue.length).toBeGreaterThanOrEqual(2);
    expect(after.lootQueue.queue.every(isLootRarity)).toBe(true);
  });
});

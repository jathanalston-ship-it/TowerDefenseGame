import { describe, it, expect } from 'vitest';
import { defaultSave } from '../save/saveStore';
import { meta, metaModifiers, upgradeCost } from './meta';
import { META_UPGRADES, TOWER_ORDER } from '../core/config';
import { isLootRarity } from '../core/loot';

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

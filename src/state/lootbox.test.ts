import { describe, it, expect } from 'vitest';
import { rollChest } from './lootbox';
import type { ChestDef } from '../core/config';
import { CHESTS, TOWER_ORDER } from '../core/config';

/** Deterministic rng from a fixed cycling list. */
function seqRng(vals: number[]): () => number {
  let i = 0;
  return () => vals[i++ % vals.length];
}

describe('rollChest (data-driven pools)', () => {
  it('produces exactly `rolls` reward items', () => {
    const r = rollChest(CHESTS.standard, Math.random);
    expect(r.items).toHaveLength(CHESTS.standard.rolls);
  });

  it('routes every pull to the only weighted pool and aggregates its total', () => {
    const def: ChestDef = {
      id: 't', name: 'T', rarity: 'standard', rolls: 4,
      pools: [{ weight: 1, rarity: 'common', spec: { pool: 'tower', range: [2, 2] } }],
    };
    const r = rollChest(def, seqRng([0]));
    expect(r.items.every((it) => it.type === 'tower')).toBe(true);
    let tower = 0;
    for (const k of TOWER_ORDER) tower += r.towerShards[k];
    expect(tower).toBe(8); // 4 rolls × 2
  });

  it('material pulls aggregate into the materials totals', () => {
    const def: ChestDef = {
      id: 'm', name: 'M', rarity: 'rich', rolls: 2,
      pools: [{ weight: 1, rarity: 'rare', spec: { pool: 'material', mats: ['scrap'], range: [3, 3] } }],
    };
    const r = rollChest(def, seqRng([0]));
    expect(r.materials.scrap).toBe(6);
    expect(r.items.every((it) => it.type === 'material')).toBe(true);
  });

  it('equipment pulls populate the equipment list (with their own rolled rarity)', () => {
    const def: ChestDef = {
      id: 'e', name: 'E', rarity: 'prime', rolls: 2, pools: [{ weight: 1, spec: { pool: 'equipment', wave: 12 } }],
    };
    const r = rollChest(def, Math.random);
    expect(r.equipment).toHaveLength(2);
    expect(r.items.every((it) => it.type === 'equipment')).toBe(true);
  });

  it('weights bias which pool a pull lands in', () => {
    const def: ChestDef = {
      id: 'w', name: 'W', rarity: 'rich', rolls: 3,
      pools: [
        { weight: 0, rarity: 'common', spec: { pool: 'tower', range: [1, 1] } },
        { weight: 1, rarity: 'rare', spec: { pool: 'hero', range: [1, 1] } },
      ],
    };
    const r = rollChest(def, seqRng([0.999, 0]));
    expect(r.items.every((it) => it.type === 'hero')).toBe(true);
  });

  it('topRarity reflects the best pull (drives the reveal ceremony)', () => {
    const def: ChestDef = {
      id: 'r', name: 'R', rarity: 'prime', rolls: 2,
      pools: [{ weight: 1, rarity: 'epic', spec: { pool: 'tower', range: [1, 1] } }],
    };
    expect(rollChest(def, seqRng([0])).topRarity).toBe('epic');
  });
});

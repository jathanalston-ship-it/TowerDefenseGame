import { describe, it, expect } from 'vitest';
import { rollChest, rollLoot } from './lootbox';
import { CHESTS, TOWER_ORDER } from '../core/config';
import { rarityRegistry } from '../core/loot';

/** Deterministic rng from a fixed cycling list (each roll consumes 3 values). */
function seqRng(vals: number[]): () => number {
  let i = 0;
  return () => vals[i++ % vals.length];
}

describe('rollChest', () => {
  const def = CHESTS.standard;

  it('produces exactly `rolls` reward items', () => {
    const r = rollChest(def, seqRng([0.5, 0.1, 0.1]));
    expect(r.items).toHaveLength(def.rolls);
  });

  it('aggregated totals match the revealed items', () => {
    const r = rollChest(def, Math.random);
    let tower = 0;
    for (const k of TOWER_ORDER) tower += r.towerShards[k];
    let hero = 0;
    for (const id of Object.keys(r.heroShards)) hero += r.heroShards[id];
    let itemsTower = 0;
    let itemsHero = 0;
    for (const it of r.items) {
      if (it.type === 'tower') itemsTower += it.amount;
      else itemsHero += it.amount;
    }
    expect(tower).toBe(itemsTower);
    expect(hero).toBe(itemsHero);
  });

  it('grants tower shards when the hero roll fails (rng ≥ chance)', () => {
    const r = rollChest(def, seqRng([0.9, 0, 0])); // 0.9 ≥ heroShardChance → tower path
    expect(r.items.every((it) => it.type === 'tower')).toBe(true);
  });

  it('grants hero shards when the hero roll succeeds', () => {
    const r = rollChest({ ...def, heroShardChance: 1 }, seqRng([0, 0, 0]));
    expect(r.items.every((it) => it.type === 'hero')).toBe(true);
    const heroTotal = Object.values(r.heroShards).reduce((a, b) => a + b, 0);
    expect(heroTotal).toBeGreaterThan(0);
  });
});

describe('rollLoot (rarity reward tables)', () => {
  it('rolls a rarity reward table into a ChestResult tagged with the rarity id', () => {
    const epic = rarityRegistry.require('epic');
    const r = rollLoot(epic, seqRng([0.9, 0, 0])); // ≥ heroShardChance → tower path
    expect(r.chestId).toBe('epic');
    expect(r.items).toHaveLength(epic.reward.rolls);
  });

  it('aggregated totals match the revealed items', () => {
    const r = rollLoot(rarityRegistry.require('rare'), Math.random);
    let tower = 0;
    for (const k of TOWER_ORDER) tower += r.towerShards[k];
    let hero = 0;
    for (const id of Object.keys(r.heroShards)) hero += r.heroShards[id];
    let itemsTower = 0;
    let itemsHero = 0;
    for (const it of r.items) {
      if (it.type === 'tower') itemsTower += it.amount;
      else itemsHero += it.amount;
    }
    expect(tower).toBe(itemsTower);
    expect(hero).toBe(itemsHero);
  });
});

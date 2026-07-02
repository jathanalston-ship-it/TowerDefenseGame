// Power Score INTEGRATION guarantee (docs/POWER-SCORE.md): no feature that changes player strength
// may exist without moving the Power Score. This is the automatic check that bites whenever new
// UPGRADE / STAR / ITEM content is added — each must strictly raise the account index, so a strength
// source can never silently escape it. (The FIELD-level contract is pinned by core/powerCoverage.test.)

import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import { META_UPGRADES, TOWER_ORDER, HERO_ORDER } from '../core/config';
import { ALL_ITEMS, rollItem } from '../core/equipment';
import type { EquipSlot } from '../core/equipment';
import type { SaveData } from '../save/saveStore';

const HALF = (): number => 0.5; // deterministic affix rolls

describe('Power Score integration — every strength source moves the index', () => {
  it('EVERY permanent upgrade raises Power (the auto-check for new upgrade content)', () => {
    meta.reset();
    for (const u of META_UPGRADES) {
      const before = meta.power().score;
      const after = meta.previewPower((s: SaveData) => ({
        ...s, upgrades: { ...s.upgrades, [u.id]: (s.upgrades[u.id] ?? 0) + 1 },
      })).score;
      expect(after, `upgrade "${u.id}" changes player strength but does NOT move Power Score — weight its field in core/power.ts`).toBeGreaterThan(before);
    }
  });

  it('EVERY tower and hero progression path raises Power (Stars → damage → index)', () => {
    meta.reset();
    for (const k of TOWER_ORDER) {
      const before = meta.power().score;
      const after = meta.previewPower((s: SaveData) => ({ ...s, towerStars: { ...s.towerStars, [k]: 9 } })).score;
      expect(after, `maxing tower ${k} Stars must raise Power`).toBeGreaterThan(before);
    }
    for (const k of HERO_ORDER) {
      const before = meta.power().score;
      const after = meta.previewPower((s: SaveData) => ({ ...s, heroStars: { ...s.heroStars, [k]: 5 } })).score;
      expect(after, `maxing hero ${k} Stars must raise Power`).toBeGreaterThan(before);
    }
  });

  it('equipping ANY item raises Power — even the weakest (Common) piece in every slot', () => {
    const firstOf: Partial<Record<EquipSlot, string>> = {};
    for (const d of ALL_ITEMS) if (!firstOf[d.slot]) firstOf[d.slot] = d.id;
    for (const slot of ['weapon', 'armor', 'relic'] as EquipSlot[]) {
      meta.reset();
      const def = ALL_ITEMS.find((i) => i.id === firstOf[slot])!;
      const item = rollItem(HALF, def, 'common'); // weakest rarity — must STILL register as power gained
      meta.grantItem(item);
      const hero = meta.selectedHero();
      const before = meta.power().score;
      meta.equip(hero, slot, item.uid);
      expect(meta.power().score, `equipping ${def.id} must raise Power`).toBeGreaterThan(before);
    }
  });

  it('Mastery XP, Adaptation picks, Prestige, and Ascendant nodes each raise Power', () => {
    meta.reset();
    const before = meta.power().score;
    const k = TOWER_ORDER[0];
    expect(meta.previewPower((s: SaveData) => ({ ...s, towerMasteryXp: { ...s.towerMasteryXp, [k]: 100_000 } })).score,
      'tower Mastery must raise Power').toBeGreaterThan(before);
    expect(meta.previewPower((s: SaveData) => ({ ...s, adaptation: { ...s.adaptation, [`tower:${k}`]: ['t.vir.1'] } })).score,
      'an Adaptation pick must raise Power').toBeGreaterThan(before);
    expect(meta.previewPower((s: SaveData) => ({ ...s, prestige: { ...s.prestige, lifetimeCells: 50 } })).score,
      'Prestige (minted Cells) must raise Power').toBeGreaterThan(before);
    expect(meta.previewPower((s: SaveData) => ({ ...s, prestige: { ...s.prestige, nodes: { ...s.prestige.nodes, potency: 3 } } })).score,
      'an Ascendant damage node must raise Power').toBeGreaterThan(before);
  });

  it('unlocking the 2nd hero slot raises Power (fielding an extra champion is strength)', () => {
    meta.reset();
    const at24 = meta.previewPower((s: SaveData) => ({ ...s, campaign: { cleared: { standard: 24 }, bestTime: {} } })).score;
    const at25 = meta.previewPower((s: SaveData) => ({ ...s, campaign: { cleared: { standard: 25 }, bestTime: {} } })).score;
    expect(at25, 'Hero Slot 2 (Campaign 25) must raise Power').toBeGreaterThan(at24);
  });

  it('Collection discovery and a Reforge rarity upgrade each raise Power', () => {
    meta.reset();
    const before = meta.power().score;
    expect(meta.previewPower((s: SaveData) => ({
      ...s, stats: { ...s.stats, killsByEnemy: { ...s.stats.killsByEnemy, runner: 10_000 } },
    })).score, 'codex discovery/mastery must raise Power (collection bucket)').toBeGreaterThan(before);
    // Reforge rarity upgrade: the SAME equipped item at a higher rarity must read as more Power.
    const def = ALL_ITEMS[0];
    const item = rollItem(HALF, def, 'common');
    meta.grantItem(item);
    meta.equip(meta.selectedHero(), def.slot, item.uid);
    const equippedCommon = meta.power().score;
    const upgraded = meta.previewPower((s: SaveData) => ({
      ...s,
      equipment: {
        ...s.equipment,
        inventory: s.equipment.inventory.map((i) => (i.uid === item.uid ? { ...i, rarity: 'rare' as const } : i)),
      },
    })).score;
    expect(upgraded, 'a Reforge rarity upgrade on an equipped item must raise Power').toBeGreaterThan(equippedCommon);
  });

  it('the account index only GROWS as progression stacks (monotonic across sources)', () => {
    meta.reset();
    const fresh = meta.power().score;
    const stacked = meta.previewPower((s: SaveData) => ({
      ...s,
      upgrades: Object.fromEntries(META_UPGRADES.map((u) => [u.id, 1])),
      towerStars: Object.fromEntries(TOWER_ORDER.map((k) => [k, 3])),
      heroStars: Object.fromEntries(HERO_ORDER.map((k) => [k, 2])),
    } as SaveData)).score;
    expect(stacked).toBeGreaterThan(fresh);
    expect(fresh).toBe(1000); // a fresh account still reads exactly POWER_BASE
  });
});

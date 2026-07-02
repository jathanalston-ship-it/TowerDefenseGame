import { describe, it, expect } from 'vitest';
import { buildReveal, itemPowerScore } from './vaultReveal';
import type { ChestResult, RewardItem } from './lootbox';
import { rollItem, itemsForSlot } from '../core/equipment';
import { TOWER_ORDER } from '../core/config';

// A tiny deterministic RNG so equipment rolls are stable across runs.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wrap raw pulls in the minimal ChestResult shape buildReveal reads (only `.items`). */
function chest(items: RewardItem[]): ChestResult {
  return { chestId: 'test', topRarity: 'common', items, towerShards: {} as never, heroShards: {}, materials: { mutagen: 0, scrap: 0, catalyst: 0 }, equipment: [] };
}

describe('vault reveal read-model (honest pulls + merged summary)', () => {
  const t0 = TOWER_ORDER[0];
  const t1 = TOWER_ORDER[1];

  it('pull list length ALWAYS equals the raw roll count (the pull-count bug fix)', () => {
    // 5 raw pulls, but only 2 distinct rewards (3× tower t0, 2× tower t1).
    const items: RewardItem[] = [
      { type: 'tower', rarity: 'common', kind: t0, amount: 3 },
      { type: 'tower', rarity: 'common', kind: t0, amount: 3 },
      { type: 'tower', rarity: 'common', kind: t0, amount: 3 },
      { type: 'tower', rarity: 'common', kind: t1, amount: 4 },
      { type: 'tower', rarity: 'common', kind: t1, amount: 4 },
    ];
    const m = buildReveal(chest(items));
    expect(m.count).toBe(5); // advertised
    expect(m.pulls).toHaveLength(5); // shown one-by-one — never collapsed
    // The SUMMARY is where duplicates merge: 2 rows, not 5.
    const towerRows = m.sections.find((s) => s.id === 'towerShards')!.rows;
    expect(towerRows).toHaveLength(2);
  });

  it('merges duplicate shard pulls into one row with a total + a count badge', () => {
    const items: RewardItem[] = [
      { type: 'tower', rarity: 'common', kind: t0, amount: 3 },
      { type: 'tower', rarity: 'rare', kind: t0, amount: 6 },
      { type: 'tower', rarity: 'common', kind: t0, amount: 9 },
    ];
    const m = buildReveal(chest(items));
    const row = m.sections.find((s) => s.id === 'towerShards')!.rows[0];
    expect(row.count).toBe(3); // "×3"
    expect(row.qty).toBe(18); // 3 + 6 + 9 merged total
    expect(row.amountLabel).toBe('+18 Strain Samples');
    expect(row.rarity).toBe('rare'); // best rarity among merged pulls wins the row styling
  });

  it('keeps hero shards and tower shards in separate categorized sections', () => {
    const items: RewardItem[] = [
      { type: 'tower', rarity: 'common', kind: t0, amount: 3 },
      { type: 'hero', rarity: 'common', id: 'ravager', amount: 2 },
    ];
    const m = buildReveal(chest(items));
    expect(m.sections.map((s) => s.id)).toEqual(['towerShards', 'heroShards']);
  });

  it('equipment never merges (each piece is unique) and contributes Power Score', () => {
    const weaponDef = itemsForSlot('weapon').find((d) => !d.exotic)!;
    const rng = mulberry32(42);
    const a = rollItem(rng, weaponDef, 'epic');
    const b = rollItem(rng, weaponDef, 'epic');
    const items: RewardItem[] = [
      { type: 'equipment', rarity: a.rarity, item: a },
      { type: 'equipment', rarity: b.rarity, item: b },
    ];
    const m = buildReveal(chest(items));
    const eq = m.sections.find((s) => s.id === 'equipment')!;
    expect(eq.rows).toHaveLength(2); // two distinct items — NOT merged
    expect(m.totalPower).toBeGreaterThan(0); // epic gear reads as a power gain
    expect(eq.power).toBe(itemPowerScore(a) + itemPowerScore(b));
    expect(m.totalPower).toBe(eq.power);
  });

  it('a crafting material renders with its own identity + rarity flare (Catalyst = legendary amber)', () => {
    const items: RewardItem[] = [
      { type: 'material', rarity: 'common', mat: 'scrap', amount: 3 },
      { type: 'material', rarity: 'legendary', mat: 'catalyst', amount: 1 }, // the rare, pity-protected drop
    ];
    const m = buildReveal(chest(items));
    const mats = m.sections.find((s) => s.id === 'materials')!;
    expect(mats.rows.map((r) => r.name).sort()).toEqual(['Catalyst', 'Scrap']);
    const cat = mats.rows.find((r) => r.name === 'Catalyst')!;
    expect(cat.rarity).toBe('legendary'); // drives the reveal ceremony flare
    expect(cat.color).toBe('#ff9d3c'); // its own amber accent, not a flat material color
    expect(cat.amountLabel).toBe('+1 Catalyst');
    expect(m.topRarity).toBe('legendary'); // a catalyst pull makes the whole crack feel legendary
  });

  it('first-discovery equipment carries isNew through the pull AND its summary row', () => {
    const weaponDef = itemsForSlot('weapon').find((d) => !d.exotic)!;
    const rng = mulberry32(7);
    const fresh = rollItem(rng, weaponDef, 'rare');
    const dupe = rollItem(rng, weaponDef, 'rare');
    const items: RewardItem[] = [
      { type: 'equipment', rarity: fresh.rarity, item: fresh, isNew: true }, // defId undiscovered at roll time
      { type: 'equipment', rarity: dupe.rarity, item: dupe }, // already-owned def → no badge
    ];
    const m = buildReveal(chest(items));
    expect(m.pulls[0].isNew).toBe(true);
    expect(m.pulls[1].isNew).toBeUndefined();
    const rows = m.sections.find((s) => s.id === 'equipment')!.rows;
    expect(rows.find((r) => r.key === `equip:${fresh.uid}`)!.isNew).toBe(true);
    expect(rows.find((r) => r.key === `equip:${dupe.uid}`)!.isNew).toBeUndefined();
  });

  it('topRarity reflects the best pull across the whole container', () => {
    const items: RewardItem[] = [
      { type: 'tower', rarity: 'common', kind: t0, amount: 1 },
      { type: 'tower', rarity: 'legendary', kind: t1, amount: 1 },
      { type: 'tower', rarity: 'rare', kind: t0, amount: 1 },
    ];
    expect(buildReveal(chest(items)).topRarity).toBe('legendary');
  });
});

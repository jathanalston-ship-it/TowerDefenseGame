// Content-integrity CI gate (SCALABILITY.md B8). Beyond per-def validation, this
// guards the failure modes that only appear at content scale:
//   • registry ⇄ source-map drift — a def added to the union-typed Record but never
//     registered (or vice versa). Until the B1 de-union migration lands, the two
//     content mechanisms must agree, or lookups silently disagree.
//   • dangling references — every id a def points at must resolve in its registry.
//   • a content census — accidental loss/duplication of content fails loudly here.

import { describe, expect, it } from 'vitest';
import {
  CHESTS,
  ENEMY_DEFS,
  HERO_DEFS,
  META_UPGRADES,
  TOWER_DEFS,
  chestRegistry,
  enemyRegistry,
  heroRegistry,
  towerRegistry,
  upgradeRegistry,
} from './config';
import { CARD_POOL, cardRegistry } from './cards';
import { validateContent } from './validate';

describe('content integrity (scale gate)', () => {
  it('all registered content passes its validators', () => {
    expect(validateContent()).toEqual([]);
  });

  // registry ids must exactly match their source collection (no drift)
  const sources: Array<[string, { ids(): string[]; size: number }, string[]]> = [
    ['tower', towerRegistry, Object.keys(TOWER_DEFS)],
    ['enemy', enemyRegistry, Object.keys(ENEMY_DEFS)],
    ['hero', heroRegistry, Object.keys(HERO_DEFS)],
    ['chest', chestRegistry, Object.keys(CHESTS)],
    ['card', cardRegistry, CARD_POOL.map((c) => c.id)],
    ['upgrade', upgradeRegistry, META_UPGRADES.map((u) => u.id)],
  ];
  for (const [name, reg, srcIds] of sources) {
    it(`${name} registry matches its source map (no drift, no dupes)`, () => {
      expect([...reg.ids()].sort()).toEqual([...srcIds].sort());
      expect(reg.size).toBe(new Set(srcIds).size); // ids are unique
    });
  }

  it('content census — guards accidental loss (raise as content is authored)', () => {
    expect(towerRegistry.size).toBeGreaterThanOrEqual(5);
    expect(enemyRegistry.size).toBeGreaterThanOrEqual(7);
    expect(heroRegistry.size).toBeGreaterThanOrEqual(3);
    expect(cardRegistry.size).toBeGreaterThanOrEqual(10);
  });
});

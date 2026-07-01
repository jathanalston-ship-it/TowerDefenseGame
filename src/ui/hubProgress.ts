// Per-nav progress rings (Hub) — a 0..1 completion ratio for the menus where "how far am I?"
// is meaningful, so the left rail doubles as a progression dashboard. Pure read of the save;
// adding a ring is one entry. Menus without a natural completion metric simply get no ring.

import type { SaveData } from '../save/saveStore';
import { HERO_ORDER, META_UPGRADES, STAR, TOWER_ORDER } from '../core/config';
import { cardRegistry } from '../core/cards';
import { geneLevel, geneMaxLevel } from '../core/geneCards';

function sumValues(obj: Record<string, number>): number {
  let n = 0;
  for (const k in obj) n += obj[k] ?? 0;
  return n;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Completion ratio per nav key (0..1). Keyed by NavKey; absent keys render no ring. */
export function navProgress(save: SaveData): Partial<Record<string, number>> {
  const towerMax = TOWER_ORDER.length * STAR.maxTowerStars;
  const heroMax = HERO_ORDER.length * STAR.maxStars;
  const upgradeMax = META_UPGRADES.reduce((a, u) => a + u.maxLevel, 0);
  const cards = cardRegistry.active();
  const geneMax = cards.reduce((a, c) => a + geneMaxLevel(c), 0);
  const geneNow = cards.reduce((a, c) => a + geneLevel(save.genes, c.id), 0);
  return {
    towers: towerMax > 0 ? clamp01(sumValues(save.towerStars) / towerMax) : 0,
    heroes: heroMax > 0 ? clamp01(sumValues(save.heroStars) / heroMax) : 0,
    evolution: upgradeMax > 0 ? clamp01(sumValues(save.upgrades) / upgradeMax) : 0,
    genes: geneMax > 0 ? clamp01(geneNow / geneMax) : 0,
  };
}

// Per-nav progress rings (Hub) — a 0..1 completion ratio for the menus where "how far am I?"
// is meaningful, so the left rail doubles as a progression dashboard. Pure read of the save;
// adding a ring is one entry. Menus without a natural completion metric simply get no ring.

import type { SaveData } from '../save/saveStore';
import { clamp01, sumValues } from '../core/math';
import { HERO_ORDER, META_UPGRADES, STAR, TOWER_ORDER } from '../core/config';
import { cardRegistry } from '../core/cards';
import { geneLevel, geneMaxLevel } from '../core/geneCards';
import { mulliganRegistry } from '../core/mulligan';
import { cosmeticRegistry } from '../core/cosmetics';
import { wardrobeRegistry } from '../core/wardrobe';
import { BP, levelOf } from '../core/battlePass';
import { allMissions } from '../core/quests';



/** Completion ratio per nav key (0..1). Keyed by NavKey; absent keys render no ring. */
export function navProgress(save: SaveData): Partial<Record<string, number>> {
  const towerMax = TOWER_ORDER.length * STAR.maxTowerStars;
  const heroMax = HERO_ORDER.length * STAR.maxStars;
  // Completion is a CAPPED-catalog notion — the Runaway (infinite) tier can never complete,
  // so it stays out of both sides of the evolution ring.
  const capped = META_UPGRADES.filter((u) => u.infinite !== true);
  const upgradeMax = capped.reduce((a, u) => a + u.maxLevel, 0);
  const upgradeNow = capped.reduce((a, u) => a + (save.upgrades[u.id] ?? 0), 0);
  const cards = cardRegistry.active();
  const geneMax = cards.reduce((a, c) => a + geneMaxLevel(c), 0);
  const geneNow = cards.reduce((a, c) => a + geneLevel(save.genes, c.id), 0);
  return {
    towers: towerMax > 0 ? clamp01(sumValues(save.towerStars) / towerMax) : 0,
    heroes: heroMax > 0 ? clamp01(sumValues(save.heroStars) / heroMax) : 0,
    evolution: upgradeMax > 0 ? clamp01(upgradeNow / upgradeMax) : 0,
    genes: geneMax > 0 ? clamp01(geneNow / geneMax) : 0,
    // Pieces sequenced / catalog — the Mulligan ring the other progression menus already wear.
    mulligans: mulliganRegistry.size > 0 ? clamp01(Object.keys(save.mulliganDex).length / mulliganRegistry.size) : 0,
    // The Wardrobe ring: everything collectible-cosmetic (Phenotypes + Wardrobe items) owned.
    phenotypes: clamp01((save.cosmetics.owned.length + save.wardrobe.owned.length) / Math.max(1, cosmeticRegistry.size + wardrobeRegistry.size)),
    // The season ring: pass level / 100 (docs/BATTLEPASS.md).
    season: clamp01(levelOf(save.battlePass.xp).level / BP.levels),
    // The Quest Board ring: lifetime missions accomplished / the full codex (docs/QUESTS.md).
    quests: clamp01(save.quests.missionsDone.length / Math.max(1, allMissions().length)),
  };
}

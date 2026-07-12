// BEST-PURCHASE ADVISOR (docs/POWER-SCORE.md §advisor) — "what's the best Power bang for my
// buck RIGHT NOW?" answered exactly. Every candidate purchase (gene card levels, Evolution HQ
// genome upgrades, tower stars) is scored by applying its save mutation HYPOTHETICALLY and
// diffing the real pure scorer (state/profile.ts powerBreakdown) — no heuristics, the same
// math the Power Score itself uses. Rankings are per-currency (value = Power per 1000 spent):
// cross-currency prices aren't comparable, so each surface gets its own champion.
//
// PURE over the save (no store writes); surfaces memoize per save revision. Extension point:
// a new upgradeable system adds ONE candidates() block returning {mutate, cost, ...} rows —
// the scorer, ranking and UI strip are shared.

import type { SaveData } from '../save/saveStore';
import { powerBreakdown } from './profile';
import { geneArchiveRows } from './geneArchive';
import { META_UPGRADES, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { isTowerUnlocked, nextStarCost, upgradeCost, upgradeLevel, upgradeUnlocked } from './meta';

export type PurchaseSurface = 'genes' | 'evolution' | 'towers';

export interface PurchaseCandidate {
  surface: PurchaseSurface;
  id: string; // the item to buy (card id / upgrade id / tower kind)
  label: string; // player-facing "what"
  buyLabel: string; // player-facing "for how much" (currency-aware)
  cost: number;
  affordable: boolean; // wallet covers it right now (gates already filtered out)
  powerDelta: number; // EXACT Power gained by this single purchase
  valuePer1k: number; // powerDelta per 1000 currency — the per-surface ranking key
}

/** Every legal next purchase on a surface, scored. Sorted best-value first. */
export function purchaseCandidates(save: SaveData, surface: PurchaseSurface): PurchaseCandidate[] {
  const base = powerBreakdown(save).score;
  const out: PurchaseCandidate[] = [];
  const score = (mutated: SaveData): number => Math.max(0, powerBreakdown(mutated).score - base);

  if (surface === 'genes') {
    for (const r of geneArchiveRows(save)) {
      // Buyable EVENTUALLY: owned, not maxed, campaign gate met (afford is a flag, not a filter —
      // the advisor also answers "what should I SAVE for").
      if (!r.owned || r.nextCost === null || !r.gateMet) continue;
      const delta = score({
        ...save,
        genes: { ...save.genes, [r.def.id]: { ...(save.genes[r.def.id] ?? { level: 0 }), level: r.level + 1 } },
      });
      out.push({
        surface, id: r.def.id, label: `${r.def.name} L${r.level + 1}`,
        buyLabel: `${r.nextCost} Essence`, cost: r.nextCost, affordable: r.canAfford,
        powerDelta: delta, valuePer1k: r.nextCost > 0 ? (delta / r.nextCost) * 1000 : 0,
      });
    }
  } else if (surface === 'evolution') {
    for (const def of META_UPGRADES) {
      if (!upgradeUnlocked(save, def)) continue;
      const level = upgradeLevel(save, def.id);
      if (level >= def.maxLevel) continue;
      const cost = upgradeCost(def, level);
      const delta = score({ ...save, upgrades: { ...save.upgrades, [def.id]: level + 1 } });
      out.push({
        surface, id: def.id, label: `${def.name} L${level + 1}`,
        buyLabel: `${cost} Cores`, cost, affordable: save.shards >= cost,
        powerDelta: delta, valuePer1k: cost > 0 ? (delta / cost) * 1000 : 0,
      });
    }
  } else {
    for (const k of TOWER_ORDER) {
      if (!isTowerUnlocked(save, k)) continue;
      const cost = nextStarCost(save, k); // null = maxed or campaign-capped
      if (cost === null) continue;
      const stars = save.towerStars[k] ?? 0;
      const delta = score({ ...save, towerStars: { ...save.towerStars, [k]: stars + 1 } });
      out.push({
        surface, id: k, label: `${TOWER_DEFS[k].name} ◈${stars + 1}`,
        buyLabel: `${cost} Strain Samples`, cost, affordable: (save.towerShards[k] ?? 0) >= cost,
        powerDelta: delta, valuePer1k: cost > 0 ? (delta / cost) * 1000 : 0,
      });
    }
  }

  // Best value first; ties (both zero-delta) break toward the cheaper commitment.
  return out.sort((a, b) => b.valuePer1k - a.valuePer1k || a.cost - b.cost);
}

/** The surface's headline: best value overall + best you can afford RIGHT NOW (often the same). */
export function bestPurchase(save: SaveData, surface: PurchaseSurface): {
  best: PurchaseCandidate | null;
  bestAffordable: PurchaseCandidate | null;
  ranked: PurchaseCandidate[];
} {
  const ranked = purchaseCandidates(save, surface).filter((c) => c.powerDelta > 0);
  return {
    best: ranked[0] ?? null,
    bestAffordable: ranked.find((c) => c.affordable) ?? null,
    ranked,
  };
}

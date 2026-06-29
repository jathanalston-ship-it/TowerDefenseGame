// Ascendant Tree — the spendable half of MOLT prestige (PROGRESSION.md §5.2). Ascendant
// Cells (minted by molting) buy permanent ECONOMY nodes that survive every future Molt —
// the canonical "re-climb faster each time" compounding loop. Nodes are capped + priced
// geometrically in cells; their effects fold into existing economy seams, so a node is pure
// data (mirrors META_UPGRADES). No DOM/sim/content imports.
//
// Golden invariant: no nodes bought ⇒ every bonus is ×1 ⇒ a fresh / un-prestiged account is
// byte-identical.

import { Registry } from './registry';
import { ACCOUNT_CURRENCY } from './currencies';

/** The economy levers a node can raise — each a multiplier that bases at ×1. */
export type AscendantStat = 'shardGainMult' | 'biomassMult' | 'lootGainMult' | 'cellGainMult';

export interface AscendantNodeDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  baseCost: number; // cells for level 0 → 1
  costMult: number; // geometric per-level growth
  effect: { stat: AscendantStat; perLevel: number };
}

/** The folded multipliers an owned tree contributes (all ×1 when nothing is bought). */
export interface AscendantBonuses {
  shardGainMult: number; // run-end Genome Cores
  biomassMult: number; // in-run biomass income
  lootGainMult: number; // loot-queue points banked
  cellGainMult: number; // cells minted on the next Molt (compounding)
}

export const ASCENDANT_NODES: AscendantNodeDef[] = [
  { id: 'greed', name: 'Ascendant Greed', desc: `+15% ${ACCOUNT_CURRENCY.name} earned per run, per level.`, maxLevel: 10, baseCost: 3, costMult: 1.7, effect: { stat: 'shardGainMult', perLevel: 0.15 } },
  { id: 'metabolism', name: 'Ascendant Metabolism', desc: '+10% in-run biomass income, per level.', maxLevel: 10, baseCost: 3, costMult: 1.7, effect: { stat: 'biomassMult', perLevel: 0.1 } },
  { id: 'harvest', name: 'Ascendant Harvest', desc: '+12% loot-meter progress per run, per level.', maxLevel: 8, baseCost: 4, costMult: 1.8, effect: { stat: 'lootGainMult', perLevel: 0.12 } },
  { id: 'resonance', name: 'Ascendant Resonance', desc: '+10% Ascendant Cells minted per Molt, per level (compounds).', maxLevel: 5, baseCost: 8, costMult: 2.2, effect: { stat: 'cellGainMult', perLevel: 0.1 } },
];

export const ascendantRegistry = new Registry<AscendantNodeDef>('ascendantNode', {
  idOf: (n) => n.id,
  validate: (n) => {
    const out: string[] = [];
    if (n.maxLevel <= 0) out.push('maxLevel must be > 0');
    if (n.baseCost <= 0) out.push('baseCost must be > 0');
    if (n.costMult < 1) out.push('costMult must be ≥ 1');
    return out;
  },
});
ascendantRegistry.registerAll(ASCENDANT_NODES);

/** Fold node levels into the economy multipliers (data-driven; mirrors metaModifiers). */
export function ascendantBonuses(levels: Record<string, number>): AscendantBonuses {
  const b: AscendantBonuses = { shardGainMult: 1, biomassMult: 1, lootGainMult: 1, cellGainMult: 1 };
  for (const n of ASCENDANT_NODES) {
    const lvl = levels[n.id] ?? 0;
    if (lvl > 0) b[n.effect.stat] += n.effect.perLevel * lvl;
  }
  return b;
}

/** Cell cost to buy the (level → level+1) step of a node. */
export function ascendantCost(def: AscendantNodeDef, level: number): number {
  return Math.ceil(def.baseCost * Math.pow(def.costMult, level));
}

/** Next step's cost, or null if maxed. */
export function nextAscendantCost(def: AscendantNodeDef, level: number): number | null {
  return level >= def.maxLevel ? null : ascendantCost(def, level);
}

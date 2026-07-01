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

/** The levers a node can raise — each a multiplier that bases at ×1 (docs/GENOME-CORE.md). The first
 *  four fold into economy seams; the rest are the deeper, more impactful account-wide buckets. */
export type AscendantStat =
  | 'shardGainMult' | 'biomassMult' | 'lootGainMult' | 'cellGainMult'
  | 'damageMult' // permanent GLOBAL damage (tower+hero) → metaModifiers; raises Power Score
  | 'masteryXpMult' // Mastery XP gained per run → finishRun
  | 'lootQualityMult' // loot-container rarity tilt → lootBiasFor
  | 'endlessBonusMult' // extra Infinite-mode cores → finishRun (endless only)
  | 'integrityMult' // permanent max Integrity → metaModifiers
  | 'coreGainMult'; // extra cores per run (a dedicated 2nd income lever) → finishRun

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
  damageMult: number; // permanent global damage (tower + hero)
  masteryXpMult: number; // Mastery XP per run
  lootQualityMult: number; // loot-container rarity tilt
  endlessBonusMult: number; // Infinite-mode core bonus
  integrityMult: number; // permanent max Integrity
  coreGainMult: number; // second core-income lever
}

export const ASCENDANT_NODES: AscendantNodeDef[] = [
  // ── Core economy (original) ──────────────────────────────────────────────────
  { id: 'greed', name: 'Ascendant Greed', desc: `+15% ${ACCOUNT_CURRENCY.name} earned per run, per level.`, maxLevel: 10, baseCost: 3, costMult: 1.7, effect: { stat: 'shardGainMult', perLevel: 0.15 } },
  { id: 'metabolism', name: 'Ascendant Metabolism', desc: '+10% in-run biomass income, per level.', maxLevel: 10, baseCost: 3, costMult: 1.7, effect: { stat: 'biomassMult', perLevel: 0.1 } },
  { id: 'harvest', name: 'Ascendant Harvest', desc: '+12% loot-meter progress per run, per level.', maxLevel: 8, baseCost: 4, costMult: 1.8, effect: { stat: 'lootGainMult', perLevel: 0.12 } },
  { id: 'resonance', name: 'Ascendant Resonance', desc: '+10% Ascendant Cells minted per Molt, per level (compounds).', maxLevel: 5, baseCost: 8, costMult: 2.2, effect: { stat: 'cellGainMult', perLevel: 0.1 } },
  // ── Deeper, more impactful levers (docs/GENOME-CORE.md) ──────────────────────
  { id: 'potency', name: 'Ascendant Potency', desc: '+5% permanent GLOBAL damage (tower + hero), per level.', maxLevel: 10, baseCost: 6, costMult: 1.9, effect: { stat: 'damageMult', perLevel: 0.05 } },
  { id: 'scholar', name: 'Ascendant Scholar', desc: '+12% Mastery XP earned per run, per level.', maxLevel: 8, baseCost: 5, costMult: 1.85, effect: { stat: 'masteryXpMult', perLevel: 0.12 } },
  { id: 'fortune', name: 'Ascendant Fortune', desc: '+8% loot-container quality per level (richer rarities).', maxLevel: 6, baseCost: 6, costMult: 2.0, effect: { stat: 'lootQualityMult', perLevel: 0.08 } },
  { id: 'infinity', name: 'Ascendant Infinity', desc: `+8% ${ACCOUNT_CURRENCY.name} from Infinite runs, per level.`, maxLevel: 8, baseCost: 5, costMult: 1.85, effect: { stat: 'endlessBonusMult', perLevel: 0.08 } },
  { id: 'vitality', name: 'Ascendant Vitality', desc: '+5% permanent max Integrity, per level.', maxLevel: 8, baseCost: 4, costMult: 1.8, effect: { stat: 'integrityMult', perLevel: 0.05 } },
  { id: 'opulence', name: 'Ascendant Opulence', desc: `+10% ${ACCOUNT_CURRENCY.name} earned per run, per level (stacks with Greed).`, maxLevel: 8, baseCost: 7, costMult: 1.95, effect: { stat: 'coreGainMult', perLevel: 0.1 } },
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
  const b: AscendantBonuses = {
    shardGainMult: 1, biomassMult: 1, lootGainMult: 1, cellGainMult: 1,
    damageMult: 1, masteryXpMult: 1, lootQualityMult: 1, endlessBonusMult: 1, integrityMult: 1, coreGainMult: 1,
  };
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

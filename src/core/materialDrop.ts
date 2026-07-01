// Crafting-material drops from Genetic Vault containers (docs/EQUIPMENT.md §Materials). A SECONDARY
// feeder beneath equipment: low chance, small stacks, and a RARE tier (`catalyst`) that is extremely
// uncommon but pity-protected — after `MATERIAL_DROP.rarePity` containers without one, the next
// material is a guaranteed catalyst. Quantity + rare-chance scale with the account Power Score,
// campaign progress, and the container's own rarity. Pure given its rng (META, not the sim) so it's
// unit-testable and deterministic in tests. Metadata (color/icon/tier) lives here so the reveal and
// any future crafting UI share ONE material identity source.

import { clamp } from './math';
import { MATERIAL_DROP } from './config';
import type { LootRarity, MaterialKind } from './config';
import { RARITY_ORDER } from './equipment';

export type MaterialTier = 'common' | 'rare';

/** Per-material identity: display name, tier (common feeder vs. rare catalyst), its own accent
 *  color + glyph (for the reveal), and the reveal rarity flare a drop of it carries. */
export const MATERIAL_META: Record<MaterialKind, { name: string; tier: MaterialTier; color: string; icon: string; rarity: LootRarity }> = {
  mutagen: { name: 'Mutagen', tier: 'common', color: '#7cf2b0', icon: '❖', rarity: 'common' },
  scrap: { name: 'Scrap', tier: 'common', color: '#c9b48a', icon: '⬡', rarity: 'common' },
  catalyst: { name: 'Catalyst', tier: 'rare', color: '#ff9d3c', icon: '✦', rarity: 'legendary' },
};

/** The rare (pity-protected) material — the one drop the player chases. */
export const RARE_MATERIAL: MaterialKind = 'catalyst';
const COMMON_MATERIALS: MaterialKind[] = ['mutagen', 'scrap'];

export interface MaterialDropParams {
  containerRarity: LootRarity; // the container's top rarity → richer containers give a touch more
  power: number; // account Power Score
  campaignStage: number; // furthest campaign progress
  pity: number; // containers opened since the last catalyst (persisted as save.matPity)
  rng: () => number;
}

export interface MaterialDropResult {
  drop: { mat: MaterialKind; amount: number; rarity: LootRarity } | null; // null ⇒ no material this container
  pity: number; // updated counter to persist (0 right after a catalyst)
}


/** The progression scale (≥1) that grows material quantity + rare odds with account strength. */
function progressionScale(power: number, stage: number, rarityIdx: number): number {
  return 1 + power / MATERIAL_DROP.powerScaleDiv + stage / MATERIAL_DROP.stageScaleDiv + rarityIdx * 0.05;
}

/**
 * Roll one container's crafting-material drop. Equipment (EQUIP_DROP_CHANCE) is rolled separately and
 * stays primary; this is the lower-chance material layer. Pity guarantees a catalyst on the (rarePity)th
 * dry container. Deterministic from `rng`.
 */
export function rollMaterialDrop(p: MaterialDropParams): MaterialDropResult {
  const M = MATERIAL_DROP;
  const rarityIdx = Math.max(0, RARITY_ORDER.indexOf(p.containerRarity));
  const scale = progressionScale(p.power, p.campaignStage, rarityIdx);

  // Pity: this container is the guaranteed-catalyst one once the counter would reach the threshold.
  const forced = p.pity + 1 >= M.rarePity;

  const dropChance = clamp(M.baseChance + M.chancePerRarity * rarityIdx, 0, M.chanceCap);
  if (!forced && p.rng() >= dropChance) return { drop: null, pity: p.pity + 1 }; // dry container

  // A material drops. Decide the rare (catalyst) tier — forced by pity, else an extremely-low roll.
  const rareChance = clamp(
    M.rareBaseChance + p.power / M.rarePowerDiv + p.campaignStage / M.rareStageDiv + M.rareChancePerRarity * rarityIdx,
    0,
    M.rareChanceCap,
  );
  const isRare = forced || p.rng() < rareChance;
  if (isRare) {
    const amount = scale >= M.rareHighScale ? 2 : 1; // catalyst stacks stay tiny
    return { drop: { mat: RARE_MATERIAL, amount, rarity: MATERIAL_META[RARE_MATERIAL].rarity }, pity: 0 };
  }

  // Common feeder material — a small, gently-scaling stack.
  const mat = COMMON_MATERIALS[Math.floor(p.rng() * COMMON_MATERIALS.length)];
  const [lo, hi] = M.commonRange;
  const base = lo + Math.floor(p.rng() * (hi - lo + 1));
  const amount = clamp(Math.round(base + (scale - 1) * M.commonBonusPerScale), 1, M.commonMax);
  const rarity: LootRarity = rarityIdx >= 3 ? 'rare' : 'common'; // legendary+ containers flare the stack
  return { drop: { mat, amount, rarity }, pity: p.pity + 1 };
}

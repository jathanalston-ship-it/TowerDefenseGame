// Mulligan Lab — the pure READ-MODEL behind the player equip screen (docs/MULLIGANS.md §UI). It
// turns a save into everything the UI paints (per-tower slots, owned modifiers, costs, affordability)
// so the React layer stays dumb. All MUTATIONS go through the meta store pipeline (equip / upgrade /
// ascend / unequip); this module never writes. Pure + testable headlessly.

import { TOWER_DEFS, TOWER_ORDER } from '../core/config';
import {
  MULLIGAN_RARITY, ascendCost, isMaxLevel, levelCap, mulliganRegistry, nextRarity,
  resolveMulligan, upgradeCost,
} from '../core/mulligan';
import type { MulliganRarity } from '../core/mulligan';
import type { TowerKind } from '../core/types';
import type { SaveData } from '../save/saveStore';

export interface SlotView {
  index: number;
  filled: boolean;
  id?: string;
  name?: string;
  rarity?: MulliganRarity;
  rarityColor?: string;
  level?: number;
  maxLevel?: number;
  maxed?: boolean;
  upgradeCost?: number; // Gene Overflow to +1 level (absent when maxed)
  canAfford?: boolean; // upgrade affordable now
  ascendable?: boolean; // maxed + a higher rarity exists + affordable
  ascendCost?: number | null;
}

export interface TowerMulliganView {
  kind: TowerKind;
  name: string;
  color: string;
  active: boolean; // all three slots filled
  power: number; // this organism's Power multiplier (≥1)
  slots: SlotView[];
}

export interface OwnedModifier {
  id: string;
  name: string;
  category: 'offensive' | 'utility' | 'biological';
  rarity: MulliganRarity; // best discovered rarity (equip ceiling)
  rarityColor: string;
  desc: string;
}

export interface MulliganLabView {
  overflow: number; // Gene Overflow balance
  discovered: number;
  total: number; // total modifiers in the registry
  towers: TowerMulliganView[];
  owned: OwnedModifier[]; // discovered modifiers, sorted by rarity then name
}

function slotView(save: SaveData, kind: TowerKind, index: number): SlotView {
  const slot = save.mulligans?.[kind]?.slots?.[index] ?? null;
  if (!slot) return { index, filled: false };
  const def = mulliganRegistry.get(slot.id);
  const maxed = isMaxLevel(slot);
  const cost = maxed ? undefined : upgradeCost(slot.rarity, slot.level);
  const asc = maxed ? ascendCost(slot.rarity) : null;
  return {
    index,
    filled: true,
    id: slot.id,
    name: def?.name ?? slot.id,
    rarity: slot.rarity,
    rarityColor: MULLIGAN_RARITY[slot.rarity].color,
    level: slot.level,
    maxLevel: levelCap(slot.rarity),
    maxed,
    upgradeCost: cost,
    canAfford: cost !== undefined && save.geneOverflow >= cost,
    ascendable: maxed && !!nextRarity(slot.rarity) && asc != null && save.geneOverflow >= asc,
    ascendCost: asc,
  };
}

/** The whole Lab view for a save. */
export function mulliganLabView(save: SaveData): MulliganLabView {
  const towers: TowerMulliganView[] = TOWER_ORDER.map((kind) => {
    const resolved = resolveMulligan(save.mulligans?.[kind]);
    return {
      kind,
      name: TOWER_DEFS[kind].name,
      color: TOWER_DEFS[kind].color,
      active: resolved.active,
      power: resolved.power,
      slots: [0, 1, 2].map((i) => slotView(save, kind, i)),
    };
  });
  const dex = save.mulliganDex ?? {};
  const owned: OwnedModifier[] = Object.entries(dex)
    .map(([id, rarity]) => {
      const def = mulliganRegistry.get(id);
      return def && { id, name: def.name, category: def.category, rarity, rarityColor: MULLIGAN_RARITY[rarity].color, desc: def.desc };
    })
    .filter((x): x is OwnedModifier => !!x)
    .sort((a, b) => MULLIGAN_RARITY[b.rarity].tier - MULLIGAN_RARITY[a.rarity].tier || a.name.localeCompare(b.name));
  return {
    overflow: save.geneOverflow ?? 0,
    discovered: owned.length,
    total: mulliganRegistry.size,
    towers,
    owned,
  };
}

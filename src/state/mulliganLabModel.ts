// Mulligan Lab — the pure READ-MODEL behind the player equip screen (docs/MULLIGANS.md §UI). It
// turns a save into everything the UI paints (per-tower slots, owned modifiers, costs, affordability)
// so the React layer stays dumb. All MUTATIONS go through the meta store pipeline (equip / upgrade /
// ascend / unequip); this module never writes. Pure + testable headlessly.

import { TOWER_DEFS, TOWER_ORDER } from '../core/config';
import {
  MULLIGAN_RARITY, ascendCost, dominantAxis, isMaxLevel, levelCap, mulliganRegistry, nextRarity,
  resolveMulligan, upgradeCost,
} from '../core/mulligan';
import type { MulliganAxis, MulliganRarity, ResolvedMulligan } from '../core/mulligan';
import type { TowerKind } from '../core/types';
import type { SaveData } from '../save/saveStore';

export interface SlotView {
  index: number;
  filled: boolean;
  id?: string;
  name?: string;
  desc?: string; // what the modifier does, in player words (shown on the slot card)
  category?: 'offensive' | 'utility' | 'biological';
  rarity?: MulliganRarity;
  rarityColor?: string;
  level?: number;
  maxLevel?: number;
  maxed?: boolean;
  upgradeCost?: number; // Gene Essence to +1 level (absent when maxed)
  canAfford?: boolean; // upgrade affordable now
  ascendable?: boolean; // maxed + a higher rarity exists + affordable
  ascendCost?: number | null;
  nextRarity?: MulliganRarity | null; // the rarity an ascend would reach (null at the apex)
}

export interface TowerMulliganView {
  kind: TowerKind;
  name: string;
  color: string;
  active: boolean; // all three slots filled
  filled: number; // slots holding a modifier (0..3) — the rail + dormancy copy read this
  power: number; // this organism's Power multiplier (≥1)
  dominant: MulliganAxis | ''; // the organism's identity axis ('' until active)
  packageLines: string[]; // the resolved stat package, display-ready ([] until active)
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
  essence: number; // Gene Essence balance (the unified gene currency — cards AND modifiers)
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
    desc: def?.desc,
    category: def?.category,
    rarity: slot.rarity,
    rarityColor: MULLIGAN_RARITY[slot.rarity].color,
    level: slot.level,
    maxLevel: levelCap(slot.rarity),
    maxed,
    upgradeCost: cost,
    canAfford: cost !== undefined && save.geneEssence >= cost,
    ascendable: maxed && !!nextRarity(slot.rarity) && asc != null && save.geneEssence >= asc,
    ascendCost: asc,
    nextRarity: nextRarity(slot.rarity),
  };
}

/** The resolved organism's stat package as display lines (mirrors the Inspector's format). */
function packageLines(r: ResolvedMulligan): string[] {
  if (!r.active) return [];
  const pct = (v: number): string => `+${Math.round((v - 1) * 100)}%`;
  return [
    r.damageMult > 1 && `${pct(r.damageMult)} damage`,
    r.fireRateMult > 1 && `${pct(r.fireRateMult)} fire rate`,
    r.rangeMult > 1 && `${pct(r.rangeMult)} range`,
    r.splashMult > 1 && `${pct(r.splashMult)} splash`,
    r.extraProjectiles > 0 && `+${r.extraProjectiles} projectile${r.extraProjectiles > 1 ? 's' : ''}`,
  ].filter((x): x is string => !!x);
}

/** The whole Lab view for a save. */
export function mulliganLabView(save: SaveData): MulliganLabView {
  const towers: TowerMulliganView[] = TOWER_ORDER.map((kind) => {
    const resolved = resolveMulligan(save.mulligans?.[kind]);
    const slots = [0, 1, 2].map((i) => slotView(save, kind, i));
    return {
      kind,
      name: TOWER_DEFS[kind].name,
      color: TOWER_DEFS[kind].color,
      active: resolved.active,
      filled: slots.filter((s) => s.filled).length,
      power: resolved.power,
      dominant: dominantAxis(resolved.profile),
      packageLines: packageLines(resolved),
      slots,
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
    essence: save.geneEssence ?? 0,
    discovered: owned.length,
    total: mulliganRegistry.size,
    towers,
    owned,
  };
}

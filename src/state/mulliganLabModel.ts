// Mulligan Lab — the pure READ-MODEL behind the player equip screen (docs/MULLIGANS.md §UI). It
// turns a save into everything the UI paints (per-tower slots, owned modifiers, costs, affordability)
// so the React layer stays dumb. All MUTATIONS go through the meta store pipeline (equip / upgrade /
// ascend / unequip); this module never writes. Pure + testable headlessly.

import { TOWER_DEFS, TOWER_ORDER } from '../core/config';
import {
  MULLIGAN_GATE_MEGAS, MULLIGAN_RARITY, ascendCost, dominantAxis, isMaxLevel, levelCap,
  modifierHost, mulliganRegistry, nextRarity, reforgeSlotCount, resolveMulligan, upgradeCost,
} from '../core/mulligan';
import { REFORGE_RARITY, reforgeCost, reforgeModById } from '../core/mulliganReforge';
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
  /** §reforge — the organism is permanently bound to this host (first wheel spin). */
  locked: boolean;
  /** §reforge — the wheel bay: usable slots (1–3 by combined graft rarity) + their state. */
  reforge: {
    usable: number;
    slots: { index: number; cost: number; affordable: boolean; mod: { id: string; name: string; desc: string; rarity: string; color: string } | null }[];
  };
}

export interface OwnedModifier {
  id: string;
  name: string;
  category: 'offensive' | 'utility' | 'biological';
  rarity: MulliganRarity; // best discovered rarity (equip ceiling)
  rarityColor: string;
  desc: string;
  /** §exclusivity — the tower currently wearing this piece (equipping elsewhere MOVES it). */
  host: TowerKind | null;
  hostName: string | null;
  /** The piece is grafted into a reforge-LOCKED organism — it can never move again. */
  bound: boolean;
}

export interface MulliganLabView {
  essence: number; // Gene Essence balance (the unified gene currency — cards AND modifiers)
  ichor: number; // the reforge wheel's fuel
  discovered: number;
  total: number; // total modifiers in the registry
  towers: TowerMulliganView[];
  owned: OwnedModifier[]; // discovered modifiers, sorted by rarity then name
  /** §gate — the pillar opens after MULLIGAN_GATE_MEGAS distinct Mega Boss kills. */
  unlocked: boolean;
  gate: { slain: number; needed: number };
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
    const st = save.mulligans?.[kind];
    const resolved = resolveMulligan(st);
    const slots = [0, 1, 2].map((i) => slotView(save, kind, i));
    const usable = reforgeSlotCount(st);
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
      locked: st?.locked === true,
      reforge: {
        usable,
        slots: Array.from({ length: usable }, (_, i) => {
          const id = st?.reforges?.[i] ?? null;
          const def = id ? reforgeModById(id) : undefined;
          const cost = reforgeCost(i);
          return {
            index: i, cost, affordable: (save.ichor ?? 0) >= cost,
            mod: def ? { id: def.id, name: def.name, desc: def.desc, rarity: REFORGE_RARITY[def.rarity].label, color: REFORGE_RARITY[def.rarity].color } : null,
          };
        }),
      },
    };
  });
  const dex = save.mulliganDex ?? {};
  const owned: OwnedModifier[] = Object.entries(dex)
    .map(([id, rarity]) => {
      const def = mulliganRegistry.get(id);
      if (!def) return null;
      const host = modifierHost(save.mulligans ?? {}, id) as TowerKind | null;
      return {
        id, name: def.name, category: def.category, rarity, rarityColor: MULLIGAN_RARITY[rarity].color, desc: def.desc,
        host, hostName: host ? TOWER_DEFS[host].name : null,
        bound: !!host && save.mulligans[host]?.locked === true,
      };
    })
    .filter((x): x is OwnedModifier => !!x)
    .sort((a, b) => MULLIGAN_RARITY[b.rarity].tier - MULLIGAN_RARITY[a.rarity].tier || a.name.localeCompare(b.name));
  const slainMegas = save.megaProgress?.slain?.length ?? 0;
  return {
    essence: save.geneEssence ?? 0,
    ichor: save.ichor ?? 0,
    discovered: owned.length,
    total: mulliganRegistry.size,
    towers,
    owned,
    unlocked: slainMegas >= MULLIGAN_GATE_MEGAS || owned.length > 0,
    gate: { slain: slainMegas, needed: MULLIGAN_GATE_MEGAS },
  };
}

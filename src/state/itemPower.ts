// Equipment Power Score — the single "how much stronger does this make me?" number for a piece of
// gear, plus the ▲/▼/= comparison against what a hero currently wears. Pure (no DOM/sim). Kept in
// its own module so both the Vault reveal and the Armory read it without an import cycle (it needs
// BOTH equipment.itemEffects and power.effectsPower, which can't host each other).

import { itemEffects, itemDef, emptyLoadout } from '../core/equipment';
import type { OwnedItem } from '../core/equipment';
import { effectsPower, itemRarityPower, POWER_BASE } from '../core/power';
import type { HeroKind } from '../core/types';
import type { SaveData } from '../save/saveStore';

/** An item's intrinsic Power Score contribution (points over a fresh account) — rarity/affix flat
 *  weight × its behavioral-effect offense multiplier. So even a pure-utility piece reads as "power". */
export function itemPowerScore(item: OwnedItem): number {
  const mult = itemRarityPower(item.rarity, item.affixes.length) * effectsPower(itemEffects(item));
  return Math.max(0, Math.round(POWER_BASE * (mult - 1)));
}

export type PowerVerdict = 'better' | 'worse' | 'same';

export interface PowerCompare {
  delta: number; // candidate power − currently-equipped power (Power Score points)
  verdict: PowerVerdict;
  candidate: number; // the item's own Power Score
  equipped: number; // the currently-equipped item's Power Score (0 if the slot is empty)
  equippedName: string | null; // what's worn in that slot now (null = empty)
}

/** Compare an item's Power Score to whatever `hero` currently wears in the SAME slot. An empty slot
 *  compares against 0 (so any item reads "better"). Comparing an item with itself reads "same". */
export function compareItemPower(save: SaveData, item: OwnedItem, hero: HeroKind): PowerCompare {
  const slot = itemDef(item.defId)?.slot;
  const loadout = save.equipment.loadouts[hero] ?? emptyLoadout();
  const equippedUid = slot ? loadout[slot] : undefined;
  const equipped = equippedUid && equippedUid !== item.uid
    ? save.equipment.inventory.find((i) => i.uid === equippedUid)
    : undefined;
  const candidate = itemPowerScore(item);
  const equippedPower = equipped ? itemPowerScore(equipped) : 0;
  const delta = candidate - equippedPower;
  return {
    delta,
    verdict: delta > 0 ? 'better' : delta < 0 ? 'worse' : 'same',
    candidate,
    equipped: equippedPower,
    equippedName: equipped ? (itemDef(equipped.defId)?.name ?? null) : null,
  };
}

// EQUIP ADVISOR (docs/POWER-SCORE.md §atlas) — "is there a better piece in the vault?" answered
// EXACTLY for every FIELDED hero. Candidates are UNEQUIPPED inventory items only (shuffling worn
// gear between heroes is a trade-off the player weighs, never an advisor claim); per (hero, slot)
// the top few by intrinsic itemPowerScore are exact-diffed through the real account scorer and
// the best strictly-positive swap survives. Equipping is FREE, so these picks compete for the
// Power Atlas headline against paid moves. Pure over SaveData; the Armory strip and the Atlas
// equipment row memoize per save revision.

import type { SaveData } from '../save/saveStore';
import type { EquipSlot, OwnedItem, Rarity } from '../core/equipment';
import { EQUIP_SLOTS, emptyLoadout, itemDef } from '../core/equipment';
import type { HeroKind } from '../core/types';
import { HERO_DEFS } from '../core/config';
import { fieldedLoadout } from './meta';
import { itemPowerScore } from './itemPower';
import { powerBreakdown } from './profile';

export interface EquipPick {
  hero: HeroKind;
  heroName: string;
  slot: EquipSlot;
  uid: string; // the inventory item to equip (meta.equip(hero, slot, uid) executes the pick)
  itemName: string;
  rarity: Rarity;
  replaces: string | null; // currently-worn item name (null ⇒ the slot is empty)
  powerDelta: number; // EXACT account Power gained by this single equip
}

/** Intrinsic-score prefilter width per (hero, slot): only the strongest few candidates are
 *  exact-diffed, keeping the sweep O(heroes × slots × 3) scorer calls. The prefilter ranks by
 *  itemPowerScore (rarity/affix/effect weight) — the DISPLAYED delta is always the exact diff. */
const PREFILTER = 3;

/** Every strictly-positive free gear upgrade across the fielded roster, best-gain first
 *  (one pick per hero × slot — the best candidate for that seat). */
export function equipUpgrades(save: SaveData, limit = 8): EquipPick[] {
  const worn = new Set<string>();
  for (const lo of Object.values(save.equipment.loadouts)) {
    if (lo) for (const s of EQUIP_SLOTS) { const u = lo[s]; if (u) worn.add(u); }
  }
  const bySlot = new Map<EquipSlot, OwnedItem[]>();
  for (const it of save.equipment.inventory) {
    if (worn.has(it.uid)) continue;
    const slot = itemDef(it.defId)?.slot;
    if (!slot) continue;
    const arr = bySlot.get(slot);
    if (arr) arr.push(it);
    else bySlot.set(slot, [it]);
  }
  for (const arr of bySlot.values()) arr.sort((a, b) => itemPowerScore(b) - itemPowerScore(a));

  const base = powerBreakdown(save).score;
  const out: EquipPick[] = [];
  for (const hero of fieldedLoadout(save)) {
    const lo = save.equipment.loadouts[hero] ?? emptyLoadout();
    for (const slot of EQUIP_SLOTS) {
      let best: EquipPick | null = null;
      for (const it of (bySlot.get(slot) ?? []).slice(0, PREFILTER)) {
        const after = powerBreakdown({
          ...save,
          equipment: { ...save.equipment, loadouts: { ...save.equipment.loadouts, [hero]: { ...lo, [slot]: it.uid } } },
        }).score;
        const delta = Math.max(0, Math.round(after - base));
        if (delta <= 0 || (best && delta <= best.powerDelta)) continue;
        const wornItem = lo[slot] ? save.equipment.inventory.find((x) => x.uid === lo[slot]) : undefined;
        best = {
          hero, heroName: HERO_DEFS[hero]?.name ?? hero, slot,
          uid: it.uid, itemName: itemDef(it.defId)?.name ?? 'item', rarity: it.rarity,
          replaces: wornItem ? itemDef(wornItem.defId)?.name ?? null : null,
          powerDelta: delta,
        };
      }
      if (best) out.push(best);
    }
  }
  out.sort((a, b) => b.powerDelta - a.powerDelta || a.heroName.localeCompare(b.heroName));
  return out.slice(0, limit);
}

/** The full free-upgrade PLAN: the advisor's picks applied ITERATIVELY (each step recomputed
 *  against the previous equip — exactly like clicking through the strip by hand), until no
 *  strictly-positive swap remains. Pure over SaveData; the caller executes each step via
 *  `meta.equip` so quest credit, events and Power toasts fire exactly as manual equips do. */
export function equipAllPlan(save: SaveData, guard = 24): EquipPick[] {
  const steps: EquipPick[] = [];
  let cur = save;
  for (let i = 0; i < guard; i++) {
    const [p] = equipUpgrades(cur, 1);
    if (!p) break;
    const lo = cur.equipment.loadouts[p.hero] ?? emptyLoadout();
    cur = { ...cur, equipment: { ...cur.equipment, loadouts: { ...cur.equipment.loadouts, [p.hero]: { ...lo, [p.slot]: p.uid } } } };
    steps.push(p);
  }
  return steps;
}

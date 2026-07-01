// REFORGE — the Diablo-style equipment improvement system (docs/REFORGE.md). Players IMPROVE
// existing gear through targeted operations instead of combining recipes. Every op here is a
// PURE, deterministic transform `(rng, item, …) → OwnedItem` (Salvage returns materials); the
// meta layer (state/meta.ts) charges materials and persists. No React/DOM, no sim coupling — the
// ops run on the meta RNG (Math.random), never the deterministic sim, so nothing touches golden.
//
// Extension is data: a new operation is a `REFORGE_OPS` row + a `REFORGE_COSTS` entry (+ the pure
// fn); a new affix or item is a data row in equipment.ts. Costs/magnitudes are all config.

import {
  RARITY_AFFIXES, RARITY_ORDER, affixKind, itemDef, maxTierForIlvl, rollAffixTier, rollAffixes,
} from './equipment';
import type { EquipSlot, OwnedItem, RolledAffix } from './equipment';

export { maxTierForIlvl } from './equipment'; // re-export: the ilvl → tier ceiling is a Reforge primitive

type Rng = () => number;

/** Crafting materials (mirrors the save `mats` bucket). */
export interface Mats {
  mutagen: number;
  scrap: number;
  catalyst: number;
}

// ── The seven operations ──────────────────────────────────────────────────────

export type ReforgeOp = 'enhance' | 'reroll' | 'reforge' | 'randomize' | 'upgrade' | 'lock' | 'salvage';

const slotOf = (item: OwnedItem): EquipSlot => itemDef(item.defId)?.slot ?? 'weapon';
const ceilOf = (item: OwnedItem): number => maxTierForIlvl(item.ilvl);
const carriedIds = (item: OwnedItem): string[] => item.affixes.map((a) => a.affixId);

/** ENHANCE — +1 tier to the LOWEST unlocked affix (capped by the ilvl ceiling). The steady,
 *  always-worthwhile, no-spike climb. Deterministic (no roll); returns the SAME item if nothing
 *  can be enhanced (all affixes locked or already at the ceiling) so callers skip the charge. */
export function enhance(_rng: Rng, item: OwnedItem): OwnedItem {
  const cap = ceilOf(item);
  let bestIdx = -1;
  for (let i = 0; i < item.affixes.length; i++) {
    const a = item.affixes[i];
    if (a.locked || a.tier >= cap) continue;
    if (bestIdx < 0 || a.tier < item.affixes[bestIdx].tier) bestIdx = i;
  }
  if (bestIdx < 0) return item; // nothing to enhance
  const affixes = item.affixes.slice();
  affixes[bestIdx] = { ...affixes[bestIdx], tier: affixes[bestIdx].tier + 1 };
  return { ...item, affixes };
}

/** REROLL — reroll the TIERS of unlocked affixes (keep their types; new magnitudes ≤ ceiling). */
export function reroll(rng: Rng, item: OwnedItem): OwnedItem {
  const cap = ceilOf(item);
  return { ...item, affixes: item.affixes.map((a) => (a.locked ? a : { ...a, tier: rollAffixTier(rng, cap) })) };
}

/** REFORGE — reroll ALL unlocked affixes to fresh TYPES + tiers (the big gamble). Locked affixes
 *  are preserved; fresh rolls avoid the kept types and respect the ilvl ceiling. */
export function reforge(rng: Rng, item: OwnedItem): OwnedItem {
  const kept = item.affixes.filter((a) => a.locked);
  const slots = RARITY_AFFIXES[item.rarity];
  const need = Math.max(0, slots - kept.length);
  const fresh = rollAffixes(rng, slotOf(item), need, ceilOf(item), kept.map((k) => k.affixId));
  return { ...item, affixes: [...kept, ...fresh].slice(0, slots) };
}

/** RANDOMIZE AFFIX — reroll ONE unlocked affix's TYPE (a fresh affix not already carried, at a
 *  random tier ≤ ceiling). The targeted swap. Returns the same item if the slot is empty/locked. */
export function randomizeAffix(rng: Rng, item: OwnedItem, affixIndex: number): OwnedItem {
  const target = item.affixes[affixIndex];
  if (!target || target.locked) return item;
  const fresh = rollAffixes(rng, slotOf(item), 1, ceilOf(item), carriedIds(item))[0];
  if (!fresh) return item; // pool exhausted (already carries every affix for the slot)
  const affixes = item.affixes.slice();
  affixes[affixIndex] = fresh;
  return { ...item, affixes };
}

/** UPGRADE — raise Rarity one tier → +1 affix slot (rolls a new affix ≤ ceiling). The deliberate,
 *  costlier step. Bounded at legendary; exotics (and legendaries) return null (already at cap). */
export function upgrade(rng: Rng, item: OwnedItem): OwnedItem | null {
  const idx = RARITY_ORDER.indexOf(item.rarity);
  if (idx < 0 || idx >= RARITY_ORDER.indexOf('legendary')) return null;
  const next = RARITY_ORDER[idx + 1];
  const need = Math.max(0, RARITY_AFFIXES[next] - item.affixes.length);
  const extra = rollAffixes(rng, slotOf(item), need, ceilOf(item), carriedIds(item));
  return { ...item, rarity: next, affixes: [...item.affixes, ...extra] };
}

/** LOCK AFFIX — toggle protection on one affix (shielded from Reforge / Reroll / Randomize). */
export function toggleAffixLock(item: OwnedItem, affixIndex: number): OwnedItem {
  const target = item.affixes[affixIndex];
  if (!target) return item;
  const affixes = item.affixes.slice();
  affixes[affixIndex] = { ...target, locked: !target.locked };
  return { ...item, affixes };
}

/** SALVAGE — the materials from destroying an item, scaled by rarity + ilvl. A pure superset of
 *  the historical formula (ilvl only ADDS scrap), so low-ilvl gear yields exactly as before. */
export function salvageValue(item: OwnedItem): Mats {
  const r = RARITY_ORDER.indexOf(item.rarity);
  return {
    mutagen: r >= 3 ? 1 : 0,
    scrap: 1 + r + Math.floor((item.ilvl ?? 1) / 10),
    catalyst: Math.max(0, r - 1),
  };
}

// ── Costs (data-driven; a re-tune is a data edit) ─────────────────────────────

interface CostRow {
  base: Mats;
  perRarity: Mats; // added × the rarity index (0 common … 4 exotic)
}
const M = (mutagen = 0, scrap = 0, catalyst = 0): Mats => ({ mutagen, scrap, catalyst });

/** Material cost per operation: `base + perRarity × rarityIndex`. Enhance is the cheap, steady
 *  sink; Upgrade (rarity) is the deliberate catalyst step; Lock/Salvage are free. */
export const REFORGE_COSTS: Record<ReforgeOp, CostRow> = {
  enhance:   { base: M(0, 3, 0), perRarity: M(0, 2, 0) },
  reroll:    { base: M(1, 2, 0), perRarity: M(0, 1, 0) },
  reforge:   { base: M(2, 4, 0), perRarity: M(1, 0, 0) },
  randomize: { base: M(1, 0, 0), perRarity: M(0, 2, 0) },
  upgrade:   { base: M(0, 0, 2), perRarity: M(0, 0, 2) },
  lock:      { base: M(0, 0, 0), perRarity: M(0, 0, 0) },
  salvage:   { base: M(0, 0, 0), perRarity: M(0, 0, 0) },
};

export function reforgeCost(op: ReforgeOp, item: OwnedItem): Mats {
  const c = REFORGE_COSTS[op];
  const r = Math.max(0, RARITY_ORDER.indexOf(item.rarity));
  return {
    mutagen: c.base.mutagen + c.perRarity.mutagen * r,
    scrap: c.base.scrap + c.perRarity.scrap * r,
    catalyst: c.base.catalyst + c.perRarity.catalyst * r,
  };
}

export function canAfford(have: Mats, cost: Mats): boolean {
  return have.mutagen >= cost.mutagen && have.scrap >= cost.scrap && have.catalyst >= cost.catalyst;
}
export function spend(have: Mats, cost: Mats): Mats {
  return { mutagen: have.mutagen - cost.mutagen, scrap: have.scrap - cost.scrap, catalyst: have.catalyst - cost.catalyst };
}

/** Whether an operation is even valid for an item (independent of affordability). Upgrade is
 *  capped at legendary; the rest need at least one unlocked affix to act on. */
export function opAvailable(op: ReforgeOp, item: OwnedItem): boolean {
  const unlocked = item.affixes.filter((a) => !a.locked).length;
  switch (op) {
    case 'upgrade': return RARITY_ORDER.indexOf(item.rarity) < RARITY_ORDER.indexOf('legendary');
    case 'salvage': return !item.locked;
    case 'lock': return item.affixes.length > 0;
    case 'enhance': return item.affixes.some((a) => !a.locked && a.tier < ceilOf(item));
    default: return unlocked > 0; // reroll / reforge / randomize
  }
}

// ── UI catalog + affix read-model ─────────────────────────────────────────────

export interface ReforgeOpDef {
  id: ReforgeOp;
  label: string;
  icon: string;
  blurb: string;
}
/** The whole-item operations shown in the Reforge bar (Lock/Randomize are per-affix, handled in
 *  the affix rows). Order = cheap-and-steady → bigger-and-rarer → destructive. */
export const REFORGE_OPS: ReforgeOpDef[] = [
  { id: 'enhance', label: 'Enhance', icon: '△', blurb: '+1 tier to the weakest affix — the steady climb.' },
  { id: 'reroll', label: 'Reroll', icon: '⟳', blurb: 'Reroll affix tiers (keep their types).' },
  { id: 'reforge', label: 'Reforge', icon: '✦', blurb: 'Reroll all unlocked affixes — fresh types + tiers.' },
  { id: 'upgrade', label: 'Upgrade', icon: '▲', blurb: 'Raise rarity — adds an affix slot.' },
  { id: 'salvage', label: 'Salvage', icon: '✕', blurb: 'Destroy the item for materials.' },
];

export interface AffixView {
  primary: RolledAffix | null; // the defining (highest-tier) affix
  prefixes: RolledAffix[]; // offense secondaries
  suffixes: RolledAffix[]; // utility secondaries
}
/** Split an item's affixes into Primary / Prefix / Suffix for the UI + ops. Primary = the
 *  highest-tier affix (its defining roll); the rest classify by `affixKind`. */
export function itemAffixView(item: OwnedItem): AffixView {
  if (item.affixes.length === 0) return { primary: null, prefixes: [], suffixes: [] };
  let primary = item.affixes[0];
  for (const a of item.affixes) if (a.tier > primary.tier) primary = a;
  const rest = item.affixes.filter((a) => a !== primary);
  return {
    primary,
    prefixes: rest.filter((a) => affixKind(a.affixId) === 'prefix'),
    suffixes: rest.filter((a) => affixKind(a.affixId) === 'suffix'),
  };
}

/** An item's "Power Score" — the single am-I-stronger number (rarity + affix tiers + ilvl). Thin
 *  re-export wrapper name so the Reforge UI reads from one place; delegates to `itemScore`. */
export { itemScore as powerScore } from './equipment';

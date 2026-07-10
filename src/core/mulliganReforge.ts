// MULLIGAN REFORGE (docs/MULLIGANS.md §reforge) — the endgame gamble layered on a finished
// organism. Once all three grafts are set, the player can REFORGE the organism with ICHOR:
// a bio-horror wheel spins and lands on a rarity-rolled mod (Common flat % rides → Legendary
// global passives). THE PRICE IS PERMANENCE: the first spin LOCKS the organism onto its host
// tower forever — no unequip, no re-slotting, no way back. Slots (1–3) derive from the
// combined rarity of the three grafted pieces, so richer organisms gamble deeper.
//
// Pure data + arithmetic. Type-only imports from mulligan.ts (no runtime cycle — the
// resolver imports THIS table one-way). Golden-safe: a fresh save has no reforges, and the
// resolver folds nothing until an organism is both ACTIVE and reforged.

import type { MulliganStats } from './mulligan';
import type { CardEffect } from './cards';

export type ReforgeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const REFORGE_RARITY_ORDER: ReforgeRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Rarity presentation + weights — colors mirror the global --r-* tokens (canvas wheel reads hex). */
export const REFORGE_RARITY: Record<ReforgeRarity, { label: string; color: string; weight: number; power: number }> = {
  common: { label: 'Common', color: '#9aa7b8', weight: 44, power: 0.03 },
  uncommon: { label: 'Uncommon', color: '#5fe08a', weight: 27, power: 0.05 },
  rare: { label: 'Rare', color: '#5ad1ff', weight: 17, power: 0.08 },
  epic: { label: 'Epic', color: '#c98bff', weight: 9, power: 0.12 },
  legendary: { label: 'Legendary', color: '#ffd24d', weight: 3, power: 0.18 },
};

export interface MulliganReforgeMod {
  id: string;
  name: string;
  desc: string; // player words — what the roll does
  rarity: ReforgeRarity;
  /** Tower-local ride-alongs — fold into the HOST tower's resolved kit (same channels). */
  stats?: MulliganStats;
  /** Account-wide passives (legendary tier) — fold into run effects like collection bonuses. */
  global?: CardEffect[];
}

/** The reforge wheel table — 3 mods per rarity. Commons are honest flat rides; epics reach
 *  ability territory (extra projectiles, deep pierce); legendaries are GLOBAL passives. */
export const REFORGE_MODS: MulliganReforgeMod[] = [
  // ── Common — single flat % rides ──
  { id: 'rf_keratin', name: 'Keratin Sheath', rarity: 'common', desc: '+6% damage on this tower.', stats: { damageMult: 1.06 } },
  { id: 'rf_twitch', name: 'Twitch Tuning', rarity: 'common', desc: '+6% fire rate on this tower.', stats: { fireRateMult: 1.06 } },
  { id: 'rf_stretch', name: 'Stretched Sinew', rarity: 'common', desc: '+7% range on this tower.', stats: { rangeMult: 1.07 } },
  // ── Uncommon — stronger single or gentle dual ──
  { id: 'rf_marrowfire', name: 'Marrowfire', rarity: 'uncommon', desc: '+10% damage on this tower.', stats: { damageMult: 1.1 } },
  { id: 'rf_ganglia', name: 'Braided Ganglia', rarity: 'uncommon', desc: '+7% fire rate, +4% range.', stats: { fireRateMult: 1.07, rangeMult: 1.04 } },
  { id: 'rf_bloom', name: 'Pressure Bloom', rarity: 'uncommon', desc: '+9% splash radius, +4% damage.', stats: { splashMult: 1.09, damageMult: 1.04 } },
  // ── Rare — meaningful duals ──
  { id: 'rf_predator', name: 'Predator Reflex', rarity: 'rare', desc: '+9% damage, +7% fire rate.', stats: { damageMult: 1.09, fireRateMult: 1.07 } },
  { id: 'rf_overwatch', name: 'Overwatch Stalk', rarity: 'rare', desc: '+12% range, +6% damage.', stats: { rangeMult: 1.12, damageMult: 1.06 } },
  { id: 'rf_shockfat', name: 'Shockfat Layers', rarity: 'rare', desc: '+14% splash radius, +5% fire rate.', stats: { splashMult: 1.14, fireRateMult: 1.05 } },
  // ── Epic — ability territory ──
  { id: 'rf_splitcast', name: 'Splitcast Womb', rarity: 'epic', desc: 'This tower fires ONE additional projectile.', stats: { extraProjectiles: 1 } },
  { id: 'rf_impaler', name: 'Impaler Rig', rarity: 'epic', desc: 'Shots pierce one extra host; +8% damage.', stats: { projectileMutators: ['pierce1'], damageMult: 1.08 } },
  { id: 'rf_frenzy', name: 'Frenzy Glands', rarity: 'epic', desc: '+14% fire rate, +8% damage.', stats: { fireRateMult: 1.14, damageMult: 1.08 } },
  // ── Legendary — GLOBAL passives (the whole hive feels this tower's ascension) ──
  { id: 'rf_overmind', name: 'Overmind Node', rarity: 'legendary', desc: 'GLOBAL: +4% damage for EVERY tower.', global: [{ op: 'mul', field: 'towerDamageMult', value: 1.04 }] },
  { id: 'rf_heartbeat', name: 'Second Heartbeat', rarity: 'legendary', desc: 'GLOBAL: +4% fire rate for EVERY tower.', global: [{ op: 'mul', field: 'towerFireRateMult', value: 1.04 }] },
  { id: 'rf_harvest', name: 'Harvest Doctrine', rarity: 'legendary', desc: 'GLOBAL: +6% biomass income all run.', global: [{ op: 'mul', field: 'biomassMult', value: 1.06 }] },
];

const BY_ID = new Map(REFORGE_MODS.map((m) => [m.id, m]));
export function reforgeModById(id: string): MulliganReforgeMod | undefined {
  return BY_ID.get(id);
}

/** Ichor price per wheel spin, by reforge slot index (deeper slots gamble bigger). */
export const REFORGE_COSTS = [40, 90, 160];
export function reforgeCost(slotIndex: number): number {
  return REFORGE_COSTS[Math.max(0, Math.min(REFORGE_COSTS.length - 1, slotIndex))];
}

/** Weighted rarity draw for a wheel spin (pure — the caller owns the RNG roll). */
export function rollReforgeRarity(roll: number): ReforgeRarity {
  const total = REFORGE_RARITY_ORDER.reduce((a, r) => a + REFORGE_RARITY[r].weight, 0);
  let acc = Math.max(0, Math.min(0.999999, roll)) * total;
  for (const r of REFORGE_RARITY_ORDER) { acc -= REFORGE_RARITY[r].weight; if (acc < 0) return r; }
  return 'common';
}

/** Pick the mod a spin lands on: rarity from roll A, uniform within the tier from roll B. */
export function rollReforgeMod(rarityRoll: number, pickRoll: number): MulliganReforgeMod {
  const rarity = rollReforgeRarity(rarityRoll);
  const pool = REFORGE_MODS.filter((m) => m.rarity === rarity);
  return pool[Math.max(0, Math.min(pool.length - 1, Math.floor(pickRoll * pool.length)))];
}

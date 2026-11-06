// CLASS BONDS (docs/CLASS-BONDS.md) — the set bonus of the six combat classes. Every tower and
// hero already belongs to one class (TowerDef/HeroDef.combatClass, display table core/combatClass.ts);
// field enough units of one class and its BOND wakes, for as long as they stay deployed:
//
//   2 units → Bond I · 4 units → Bond II · 6 units → Bond III
//
// Every DEPLOYED tower counts once (two Needle Spitters are two Kinetic units) and every FIELDED hero
// counts once. Each class's bond amplifies what that class is FOR (Kinetic impact, Viral cadence,
// Vital sustain…), and its strength grows with the account's BOND LEVEL for that class (0..maxLevel,
// bought with Genome Cores on the Class Bonds screen — the "improve the set bonus" lever).
//
// Pure data + pure math (no Game, no save): the sim reads `bondFx`, the UI reads the same tables, so
// what the screen promises is exactly what the run applies. A new class = one CLASS_BONDS row.

import type { CombatClass } from './types';
import { COMBAT_CLASS_ORDER } from './combatClass';

/** One tier's effect bundle (fractions; absent = 0). */
export interface BondTierFx {
  /** +damage for units OF THIS CLASS (towers and heroes). */
  dmg?: number;
  /** +fire rate for towers OF THIS CLASS. */
  rate?: number;
  /** +fire rate for EVERY tower (Resonant — amplification carries). */
  allRate?: number;
  /** Hive Core integrity mended at every wave clear (Vital — sustain). */
  coreMend?: number;
}

export interface ClassBondDef {
  cls: CombatClass;
  name: string;
  /** What the bond does, one line (the class's role, made stronger). */
  blurb: string;
  tiers: readonly [BondTierFx, BondTierFx, BondTierFx];
}

export const BOND = {
  /** Fielded units of a class that wake Bond I / II / III. */
  thresholds: [2, 4, 6] as const,
  /** Each bond level adds this fraction of the base effect (level 10 ⇒ ×1.8). */
  levelStep: 0.08,
  maxLevel: 10,
  /** Genome Core price of the NEXT level: baseCost × costMult^level. */
  baseCost: 150,
  costMult: 1.5,
  /** Account Power per bond level (the `meta` bucket — every permanent upgrade raises Power). */
  powerPerLevel: 0.0035,
  /** The campaign stage that reveals the bonds (FEATURES 'bonds' — the same gate turns them on in runs). */
  revealStage: 13,
} as const;

export const CLASS_BONDS: Record<CombatClass, ClassBondDef> = {
  Kinetic: { cls: 'Kinetic', name: 'Impact Bond', blurb: 'Kinetic units hit harder.',
    tiers: [{ dmg: 0.1 }, { dmg: 0.2 }, { dmg: 0.32 }] },
  Caustic: { cls: 'Caustic', name: 'Dissolution Bond', blurb: 'Caustic units hit harder and fire faster.',
    tiers: [{ dmg: 0.07, rate: 0.04 }, { dmg: 0.14, rate: 0.08 }, { dmg: 0.22, rate: 0.12 }] },
  Viral: { cls: 'Viral', name: 'Contagion Bond', blurb: 'Viral towers fire much faster — more infection, sooner.',
    tiers: [{ rate: 0.1 }, { rate: 0.2 }, { rate: 0.32 }] },
  Neural: { cls: 'Neural', name: 'Lattice Bond', blurb: 'Neural towers fire faster and hit harder.',
    tiers: [{ rate: 0.07, dmg: 0.04 }, { rate: 0.14, dmg: 0.08 }, { rate: 0.22, dmg: 0.12 }] },
  Vital: { cls: 'Vital', name: 'Sustain Bond', blurb: 'The Hive Core mends at every wave clear; Vital units hit harder.',
    tiers: [{ coreMend: 2, dmg: 0.05 }, { coreMend: 4, dmg: 0.1 }, { coreMend: 7, dmg: 0.15 }] },
  Resonant: { cls: 'Resonant', name: 'Chorus Bond', blurb: 'EVERY tower fires faster; Resonant units hit harder.',
    tiers: [{ allRate: 0.03, dmg: 0.05 }, { allRate: 0.06, dmg: 0.1 }, { allRate: 0.1, dmg: 0.15 }] },
};

export type BondTier = 0 | 1 | 2 | 3;
export type BondLevels = Partial<Record<CombatClass, number>>;

/** The bond tier a fielded-unit count wakes (0 = dormant). */
export function bondTier(count: number): BondTier {
  const [a, b, c] = BOND.thresholds;
  return count >= c ? 3 : count >= b ? 2 : count >= a ? 1 : 0;
}

/** Units still needed for the next tier, or null at Bond III. */
export function bondNext(count: number): number | null {
  for (const t of BOND.thresholds) if (count < t) return t;
  return null;
}

/** A bond level's strength multiplier over the base table (level 0 ⇒ ×1). */
export function bondLevelMult(level: number): number {
  return 1 + BOND.levelStep * Math.max(0, Math.min(BOND.maxLevel, Math.floor(level)));
}

/** One class's effect at a tier and level (zeros when dormant). */
export function bondTierFx(cls: CombatClass, tier: BondTier, level: number): Required<BondTierFx> {
  if (tier === 0) return { dmg: 0, rate: 0, allRate: 0, coreMend: 0 };
  const fx = CLASS_BONDS[cls].tiers[tier - 1];
  const m = bondLevelMult(level);
  return {
    dmg: (fx.dmg ?? 0) * m,
    rate: (fx.rate ?? 0) * m,
    allRate: (fx.allRate ?? 0) * m,
    coreMend: Math.round((fx.coreMend ?? 0) * m),
  };
}

/** The whole board's bonds, folded into the multipliers the sim applies. */
export interface BondFx {
  counts: Record<CombatClass, number>;
  tiers: Record<CombatClass, BondTier>;
  /** ×damage for units of each class (1 = no bond). */
  dmg: Record<CombatClass, number>;
  /** ×fire rate for towers of each class (1 = no bond). */
  rate: Record<CombatClass, number>;
  /** ×fire rate for every tower (Resonant). */
  allRate: number;
  /** Core integrity mended per wave clear (Vital). */
  coreMend: number;
}

const zeroRecord = <T>(v: T): Record<CombatClass, T> => Object.fromEntries(COMBAT_CLASS_ORDER.map((c) => [c, v])) as Record<CombatClass, T>;

/** Fold fielded-unit classes + the account's bond levels into the run's bond effects. */
export function bondFx(fielded: readonly CombatClass[], levels: BondLevels): BondFx {
  const counts = zeroRecord(0);
  for (const c of fielded) counts[c]++;
  const tiers = zeroRecord<BondTier>(0);
  const dmg = zeroRecord(1);
  const rate = zeroRecord(1);
  let allRate = 1;
  let coreMend = 0;
  for (const c of COMBAT_CLASS_ORDER) {
    const tier = bondTier(counts[c]);
    tiers[c] = tier;
    if (tier === 0) continue;
    const fx = bondTierFx(c, tier, levels[c] ?? 0);
    dmg[c] = 1 + fx.dmg;
    rate[c] = 1 + fx.rate;
    allRate *= 1 + fx.allRate;
    coreMend += fx.coreMend;
  }
  return { counts, tiers, dmg, rate, allRate, coreMend };
}

/** Genome Core price of raising a class's bond from `level` to `level + 1`. */
export function bondCost(level: number): number {
  return Math.round(BOND.baseCost * Math.pow(BOND.costMult, Math.max(0, level)));
}

/** Account Power from bond levels (×1 with none — POWER_BASE holds on a fresh account). */
export function classBondsPowerMult(levels: BondLevels | undefined): number {
  if (!levels) return 1;
  let n = 0;
  for (const c of COMBAT_CLASS_ORDER) n += Math.max(0, Math.min(BOND.maxLevel, Math.floor(levels[c] ?? 0)));
  return 1 + BOND.powerPerLevel * n;
}

/** One line per tier for the UI ("+20% damage · +8% fire rate · Core +4 per wave"). */
export function bondFxLine(fx: Required<BondTierFx>): string {
  const p = (v: number): string => `+${Math.round(v * 100)}%`;
  const parts: string[] = [];
  if (fx.dmg > 0) parts.push(`${p(fx.dmg)} damage`);
  if (fx.rate > 0) parts.push(`${p(fx.rate)} fire rate`);
  if (fx.allRate > 0) parts.push(`${p(fx.allRate)} fire rate for every tower`);
  if (fx.coreMend > 0) parts.push(`Core +${fx.coreMend} per wave`);
  return parts.join(' · ');
}

/** Save sanitizer (schema v58): known classes only, whole levels clamped to 0..BOND.maxLevel; anything
 *  else (absent on pre-v58 saves, junk) ⇒ {} — no bond levels. */
export function sanitizeClassBonds(raw: unknown): BondLevels {
  const out: BondLevels = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const c of COMBAT_CLASS_ORDER) {
    const v = Math.floor(Number((raw as Record<string, unknown>)[c]));
    if (Number.isFinite(v) && v > 0) out[c] = Math.min(BOND.maxLevel, v);
  }
  return out;
}

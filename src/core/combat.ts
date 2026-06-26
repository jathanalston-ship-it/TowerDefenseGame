// Pure combat-rules math — extracted from the Game god-class so the balance-critical
// formulas are unit-testable and reusable. No entity mutation and no Game state: the
// Game keeps the side-effects (hp, statuses, floats, particles, accrual); this module
// is only the arithmetic. Reads tunables from config (a core module, so the boundary
// holds).

import { STATUS } from './config';

/** Armor an enemy effectively has right now. `broken` = an armor-break window is
 * active (set by a Shred) → 0. Fracture shreds armor per stack; Corrosion shreds a
 * flat amount while active. Never negative. */
export function effectiveArmor(
  e: { baseArmor: number; fracture: number; corrosion: number },
  broken: boolean,
): number {
  if (broken) return 0;
  let a = e.baseArmor - e.fracture * STATUS.fractureArmorShred;
  if (e.corrosion > 0) a -= STATUS.corrosionArmorShred;
  return Math.max(0, a);
}

/** Final damage from a discrete hit: raw × incoming-vulnerability, minus armor,
 * floored at 1. `vulnMult` is the caller's composed multiplier (Fracture amp +
 * Disruption vulnerability + …) — see the Game's vulnMult(). */
export function damageAfter(raw: number, vulnMult: number, armor: number): number {
  return Math.max(1, raw * vulnMult - armor);
}

/** Fracture stack ceiling for a run (base cap + the run's bonus stacks). */
export function fractureCap(fractureBonusStacks: number): number {
  return STATUS.fractureMaxStacks + fractureBonusStacks;
}

/** The Shred reaction fires when Fracture and Corrosion coexist on a target. */
export function shredReady(fracture: number, corrosion: number): boolean {
  return fracture >= 1 && corrosion > 0;
}

/** True-damage burst a Shred deals (scales with the consumed Fracture stacks). */
export function shredBurst(fracture: number): number {
  return STATUS.shredBase + STATUS.shredPerStack * fracture;
}

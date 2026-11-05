// BOARD COVERAGE (docs/DIFFICULTY_DIRECTOR.md §6a v4) — what a fielded board ANSWERS, read off data.
// Every tower kind gets a coverage vector DERIVED from its TowerDef + derived ability kit (never a
// per-tower list — a new tower is graded by its numbers): REACH (range vs the lane), AREA (splash /
// aura / pool / chain), PIERCE (the share of a hit that survives a plated body, after the armor its
// own hits shred), BURST (per-hit damage — what breaks shields and out-paces healers) and CONTROL (a
// control status, a pull, or summoned bodies that block the lane). A board folds into a coverage
// PROFILE: the Strain-weighted mean of its towers' vectors, 0..1 per axis. The live probe
// (campaign.ts LIVE_PROBE_ROLES) reads the GAP on the axis that answers each enemy role — how far the
// board sits below the ROSTER's mean coverage there (the axes grade on different scales; the roster
// baseline makes them comparable). Pure; tables computed once from TOWER_ORDER; a board read
// allocates nothing.
//
// Known limit: base kits only — branch / Strain kits (resolved in the sim) are not folded in.

import { COVERAGE, TOWER_ABILITIES, TOWER_DEFS, TOWER_ORDER } from './config';
import type { TowerDef } from './config';
import type { AbilityComponent } from './ability';
import { STATUS_EFFECTS } from './status';
import type { StatusEffectDef } from './status';
import { damagesArea } from './conveyor';
import type { ProjectileBehavior, StatusType, TowerKind } from './types';

export type CoverageAxis = 'reach' | 'area' | 'pierce' | 'burst' | 'control';
export type CoverageVec = Readonly<Record<CoverageAxis, number>>;

/** Player-facing name of what an axis covers — the briefing's "your board lacks …". */
export const COVERAGE_AXIS_NAME: Readonly<Record<CoverageAxis, string>> = {
  reach: 'reach',
  area: 'area damage',
  pierce: 'armor pierce',
  burst: 'burst',
  control: 'slows',
};

/** The status a projectile's HIT applies by behavior — mirrors game.ts's projectile impact (a homing
 *  or arc hit adds a Fracture stack; a parasite hit infects). Behaviors absent here apply none. */
const ON_HIT_STATUS: Partial<Record<ProjectileBehavior, StatusType>> = { homing: 'Fracture', arc: 'Fracture', parasite: 'Infection' };

const clamp01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const statusDef = (k: StatusType): StatusEffectDef | undefined =>
  (STATUS_EFFECTS as Record<string, StatusEffectDef | undefined>)[k.charAt(0).toLowerCase() + k.slice(1)];

/** Every status the kit applies (component statuses + projectile on-hit statuses). */
function kitStatuses(kit: readonly AbilityComponent[]): StatusType[] {
  const out: StatusType[] = [];
  for (const c of kit) {
    if ((c.type === 'status' || c.type === 'aura' || c.type === 'explosion' || c.type === 'debuff') && c.status) out.push(c.status.kind);
    if (c.type === 'projectile') { const s = ON_HIT_STATUS[c.behavior]; if (s) out.push(s); }
  }
  return out;
}

/** The kit's largest single-hit damage (projectile / aura / chain / explosion / crit); the def's own
 *  damage for kinds the sim fires from stats (beams, traps). */
function hitDamage(def: TowerDef, kit: readonly AbilityComponent[]): number {
  let hit = 0;
  for (const c of kit) {
    if (c.type === 'projectile' || c.type === 'chain' || c.type === 'crit') hit = Math.max(hit, c.damage);
    else if ((c.type === 'aura' || c.type === 'explosion') && c.damage) hit = Math.max(hit, c.damage);
  }
  return hit > 0 ? hit : def.damage;
}

/** One tower kind's coverage vector, from its def + kit (pure; see the header for the axes). */
export function towerCoverage(def: TowerDef, kit: readonly AbilityComponent[]): CoverageVec {
  const hit = hitDamage(def, kit);
  let shred = 0;
  let ignoresArmor = false;
  let control = def.firing === 'summon';
  for (const k of kitStatuses(kit)) {
    const s = statusDef(k);
    if (!s) continue;
    shred = Math.max(shred, (s.armorShred ?? 0) * (s.stack === 'stack' ? s.maxStacks : 1)); // at full stacks
    if (s.ignoresArmor && (s.dps ?? 0) > 0) ignoresArmor = true;
    if (s.category === 'control') control = true;
  }
  for (const c of kit) if ((c.type === 'aura' && (c.pull ?? 0) > 0) || c.type === 'summon') control = true;
  const armor = Math.max(0, COVERAGE.armorRef - shred);
  return {
    reach: clamp01((def.range - COVERAGE.reachFrom) / (COVERAGE.reachFull - COVERAGE.reachFrom)),
    area: damagesArea(def, kit) || kit.some((c) => c.type === 'chain' && c.jumps >= 2) ? 1 : 0,
    pierce: ignoresArmor ? 1 : hit > 0 ? clamp01((hit - armor) / hit) : 0,
    burst: clamp01(hit / COVERAGE.burstFull),
    control: control ? 1 : 0,
  };
}

/** The roster's coverage table — derived once (a new tower joins by its data). */
export const TOWER_COVERAGE: Readonly<Record<TowerKind, CoverageVec>> = Object.fromEntries(
  TOWER_ORDER.map((k) => [k, towerCoverage(TOWER_DEFS[k], TOWER_ABILITIES[k])]),
) as Record<TowerKind, CoverageVec>;

/** The roster's MEAN coverage per axis — what a board drawn from the whole roster would field. The
 *  axes grade on different scales (area is all-or-nothing, burst is a ramp), so a board's GAP is read
 *  against this baseline, which makes the axes comparable without hand-tuned weights. */
export const ROSTER_COVERAGE: CoverageVec = (() => {
  const out: Record<CoverageAxis, number> = { reach: 0, area: 0, pierce: 0, burst: 0, control: 0 };
  for (const k of TOWER_ORDER) for (const a of Object.keys(out) as CoverageAxis[]) out[a] += TOWER_COVERAGE[k][a] / TOWER_ORDER.length;
  return out;
})();

/** The board's coverage on one axis: the Strain-weighted mean of its towers' vectors (a merged tower
 *  is the board's investment), 0 for an empty board. Allocation-free. */
export function boardCoverage(towers: readonly { kind: TowerKind; strain: number }[], axis: CoverageAxis): number {
  let sum = 0;
  let w = 0;
  for (const t of towers) {
    const wt = Math.max(1, t.strain);
    sum += wt * TOWER_COVERAGE[t.kind][axis];
    w += wt;
  }
  return w > 0 ? sum / w : 0;
}

/** The board's coverage GAP on one axis, 0..1: how far it sits BELOW the roster's mean coverage there
 *  (1 = covers none of it, 0 = at or above the roster's mean). Allocation-free. */
export function coverageGap(towers: readonly { kind: TowerKind; strain: number }[], axis: CoverageAxis): number {
  const base = ROSTER_COVERAGE[axis];
  return base > 0 ? clamp01(1 - boardCoverage(towers, axis) / base) : 0;
}

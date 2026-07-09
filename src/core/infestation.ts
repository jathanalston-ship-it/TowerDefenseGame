// INFESTATION MAP (docs/INFESTATION.md) — the persistent conquest meta. A hive-map of
// four REGIONS × four SECTORS; every finished run FEEDS infestation into a target sector
// (wave-scaled; losses feed at half), regions pay a passive account bonus scaled by how
// infested they are, and neglect DECAYS — the organism must be fed.
//
// TIME DISCIPLINE: decay is LAZY — sectors store {level, updatedAt} and every read
// resolves the effective level from wall-clock days elapsed. Nothing ticks, nothing runs
// offline, and every function takes `now` so tests never sleep. The SIM never reads any
// of this; bonuses fold into runs as ordinary run effects (like gear/trophies).

import type { CardEffect, RunModNumberKey } from './cards';

export interface SectorDef {
  id: string;
  name: string;
}

export interface RegionDef {
  id: string;
  name: string;
  blurb: string;
  accent: string; // hex for the board UI
  sectors: SectorDef[];
  /** The region's passive at FULL infestation (all four sectors at 100). */
  bonus: { field: RunModNumberKey; max: number; label: string };
}

export const REGIONS: RegionDef[] = [
  {
    id: 'fringe', name: 'Cordyceps Fringe', accent: '#7fe07a',
    blurb: 'The soft outskirts — every spore that lands here feeds the economy.',
    sectors: [
      { id: 'fringe_meadow', name: 'Sporefall Meadow' }, { id: 'fringe_mire', name: 'Rotwood Mire' },
      { id: 'fringe_terrace', name: 'Bloom Terraces' }, { id: 'fringe_delta', name: 'Mycel Delta' },
    ],
    bonus: { field: 'biomassMult', max: 1.08, label: 'Biomass' },
  },
  {
    id: 'reach', name: 'Calcified Reach', accent: '#9ecbff',
    blurb: 'Old bone-fields — infestation here hardens every strain the hive grows.',
    sectors: [
      { id: 'reach_spine', name: 'Spine Rows' }, { id: 'reach_quarry', name: 'Marrow Quarry' },
      { id: 'reach_cliffs', name: 'Chitin Cliffs' }, { id: 'reach_ossuary', name: 'The Ossuary' },
    ],
    bonus: { field: 'towerDamageMult', max: 1.06, label: 'Tower Damage' },
  },
  {
    id: 'basin', name: 'Neural Basin', accent: '#c98bff',
    blurb: 'A drowned cortex — champions who fight over it strike with borrowed instinct.',
    sectors: [
      { id: 'basin_synapse', name: 'Synapse Shallows' }, { id: 'basin_cortex', name: 'Cortex Deep' },
      { id: 'basin_stem', name: 'Stem Channels' }, { id: 'basin_dream', name: 'Dreaming Floor' },
    ],
    bonus: { field: 'heroDamageMult', max: 1.08, label: 'Hero Damage' },
  },
  {
    id: 'fields', name: 'Marrow Fields', accent: '#ffb84d',
    blurb: 'The fat of the land — a fed field pays its keeper in fire.',
    sectors: [
      { id: 'fields_granary', name: 'Red Granary' }, { id: 'fields_orchard', name: 'Vein Orchard' },
      { id: 'fields_silo', name: 'Silo Warrens' }, { id: 'fields_reservoir', name: 'Ichor Reservoir' },
    ],
    bonus: { field: 'towerFireRateMult', max: 1.05, label: 'Fire Rate' },
  },
];

export const SECTOR_CAP = 100; // full infestation per sector
export const DECAY_PER_DAY = 2; // points a neglected sector loses per real day
export const GAIN_PER_WAVE = 2; // infestation points per wave cleared (wins; losses half)
export const GAIN_CAP_PER_RUN = 40; // one run can't paint a sector alone

export const ALL_SECTORS: SectorDef[] = REGIONS.flatMap((r) => r.sectors);

export function regionOfSector(sectorId: string): RegionDef | undefined {
  return REGIONS.find((r) => r.sectors.some((s) => s.id === sectorId));
}

export interface SectorState {
  level: number; // stored level at updatedAt (0..SECTOR_CAP)
  updatedAt: number; // wall-clock ms of the last write
}

/** Resolve a sector's LIVE level: stored minus lazy decay for the days since last feed. */
export function effectiveLevel(s: SectorState | undefined, now: number): number {
  if (!s) return 0;
  const days = Math.max(0, (now - s.updatedAt) / 86_400_000);
  return Math.max(0, Math.min(SECTOR_CAP, s.level - days * DECAY_PER_DAY));
}

/** The infestation a finished run feeds its target (wins full rate, losses half). */
export function runInfestGain(wave: number, won: boolean): number {
  return Math.min(GAIN_CAP_PER_RUN, Math.max(0, Math.round(wave * GAIN_PER_WAVE * (won ? 1 : 0.5))));
}

/** A region's live completion fraction (0..1) from its sectors' effective levels. */
export function regionFraction(region: RegionDef, sectors: Record<string, SectorState | undefined>, now: number): number {
  const total = region.sectors.reduce((a, s) => a + effectiveLevel(sectors[s.id], now), 0);
  return total / (region.sectors.length * SECTOR_CAP);
}

/** Every region's passive, scaled by its live fraction — ×1 everywhere on a fresh save. */
export function infestationEffects(sectors: Record<string, SectorState | undefined>, now: number): CardEffect[] {
  const out: CardEffect[] = [];
  for (const r of REGIONS) {
    const frac = regionFraction(r, sectors, now);
    if (frac <= 0) continue;
    out.push({ op: 'mul', field: r.bonus.field, value: 1 + (r.bonus.max - 1) * frac });
  }
  return out;
}

// Lifetime-statistics accumulation + display model. `accumulateStats` is the SINGLE
// place that grows when a new tracked stat is added; the statistics screen renders
// the data-driven STAT_ROWS. Pure functions — no persistence here (that's meta.ts).

import { ENEMY_KINDS, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import type { LifetimeStats, MasteryCounts, RunStats, TowerKind } from '../core/types';

/** Fold one finished run's stats into the lifetime totals (pure, immutable).
 * `towerCombat` (the run's per-tower mastery accrual) deepens the per-tower ledger —
 * lifetime damage + best wave — without widening RunStats. */
export function accumulateStats(prev: LifetimeStats, run: RunStats, towerCombat?: MasteryCounts): LifetimeStats {
  const killsByEnemy = { ...prev.killsByEnemy };
  for (const k of ENEMY_KINDS) killsByEnemy[k] = (killsByEnemy[k] ?? 0) + (run.killsByEnemy[k] ?? 0);

  const towerUsage = { ...prev.towerUsage };
  for (const k of TOWER_ORDER) towerUsage[k] = (towerUsage[k] ?? 0) + (run.towerBuilds[k] ?? 0);

  const heroUsage = { ...prev.heroUsage };
  heroUsage[run.heroId] = (heroUsage[run.heroId] ?? 0) + 1;

  const uniqueCards = prev.uniqueCards.slice();
  const seen = new Set(uniqueCards);
  for (const id of run.cardIds) {
    if (!seen.has(id)) {
      seen.add(id);
      uniqueCards.push(id);
    }
  }

  const towerDamage = { ...prev.towerDamage };
  const towerBestWave = { ...prev.towerBestWave };
  if (towerCombat) {
    for (const k of TOWER_ORDER) {
      towerDamage[k] = (towerDamage[k] ?? 0) + Math.round(towerCombat[k].damage);
      // "Best wave with this tower" counts runs the kind actually fought in (was deployed).
      if (towerCombat[k].activeTime > 0) towerBestWave[k] = Math.max(towerBestWave[k] ?? 0, run.wave);
    }
  }

  return {
    lifetimeKills: prev.lifetimeKills + run.kills,
    highestWave: Math.max(prev.highestWave, run.wave),
    totalBiomass: prev.totalBiomass + Math.round(run.biomassEarned),
    totalDamage: prev.totalDamage + Math.round(run.damageDealt),
    runsCompleted: prev.runsCompleted + (run.won ? 1 : 0),
    runsFailed: prev.runsFailed + (run.won ? 0 : 1),
    cardsDrafted: prev.cardsDrafted + run.cardIds.length,
    uniqueCards,
    killsByEnemy,
    towerUsage,
    heroUsage,
    towerDamage,
    towerBestWave,
  };
}

/** The most-built tower kind (drives "favorite tower"), or null if nothing built yet. */
export function favoriteTower(stats: LifetimeStats): TowerKind | null {
  let best: TowerKind | null = null;
  let max = 0;
  for (const k of TOWER_ORDER) {
    if (stats.towerUsage[k] > max) {
      max = stats.towerUsage[k];
      best = k;
    }
  }
  return best;
}

export function favoriteTowerName(stats: LifetimeStats): string {
  const k = favoriteTower(stats);
  return k ? TOWER_DEFS[k].name : '—';
}

/** Data-driven rows for the statistics screen — add a row here to surface a new stat. */
export interface StatRow {
  label: string;
  value: (s: LifetimeStats) => string;
}

export const STAT_ROWS: StatRow[] = [
  { label: 'Lifetime kills', value: (s) => s.lifetimeKills.toLocaleString() },
  { label: 'Highest wave', value: (s) => String(s.highestWave) },
  { label: 'Total biomass', value: (s) => s.totalBiomass.toLocaleString() },
  { label: 'Damage dealt', value: (s) => s.totalDamage.toLocaleString() },
  { label: 'Runs completed', value: (s) => String(s.runsCompleted) },
  { label: 'Runs failed', value: (s) => String(s.runsFailed) },
  { label: 'Favorite tower', value: (s) => favoriteTowerName(s) },
  { label: 'Cards collected', value: (s) => String(s.uniqueCards.length) },
  { label: 'Cards drafted', value: (s) => s.cardsDrafted.toLocaleString() },
];

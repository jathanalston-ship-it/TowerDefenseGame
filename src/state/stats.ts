// Lifetime-statistics accumulation + display model. `accumulateStats` is the SINGLE
// place that grows when a new tracked stat is added; the statistics screen renders
// the data-driven STAT_ROWS. Pure functions — no persistence here (that's meta.ts).

import { ENEMY_KINDS, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import type { LifetimeStats, MasteryCounts, RunStats, TowerKind } from '../core/types';

/** Fold one finished run's stats into the lifetime totals (pure, immutable).
 * `towerCombat` (the run's per-tower mastery accrual) deepens the per-tower ledger —
 * lifetime damage + best wave — without widening RunStats. `extra` carries the run-level
 * bits that live on RunResult rather than RunStats (duration, doctrine — profile ledgers). */
export function accumulateStats(
  prev: LifetimeStats,
  run: RunStats,
  towerCombat?: MasteryCounts,
  extra?: { durationSec?: number; doctrine?: string; bossRush?: boolean },
): LifetimeStats {
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

  // Strain ledgers (docs/STRAIN.md §7): deepest-ever, lifetime evolutions, per-kind deepest.
  const towerBestStrain = { ...prev.towerBestStrain };
  for (const [k, v] of Object.entries(run.strainByKind ?? {})) {
    const kind = k as TowerKind;
    if ((v ?? 0) > (towerBestStrain[kind] ?? 0)) towerBestStrain[kind] = v as number;
  }

  // Profile ledgers (schema v22): duration, doctrine, and per-card draft counts.
  const doctrineRuns = { ...prev.doctrineRuns };
  if (extra?.doctrine && extra.doctrine !== 'none') doctrineRuns[extra.doctrine] = (doctrineRuns[extra.doctrine] ?? 0) + 1;
  const cardDrafts = { ...prev.cardDrafts };
  for (const id of run.cardIds) cardDrafts[id] = (cardDrafts[id] ?? 0) + 1;
  const dur = Math.max(0, Math.round(extra?.durationSec ?? 0));

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
    bestStrain: Math.max(prev.bestStrain, run.maxStrain ?? 1),
    strainsEvolved: prev.strainsEvolved + (run.strains ?? 0),
    towerBestStrain,
    playtimeSec: prev.playtimeSec + dur,
    longestRunSec: Math.max(prev.longestRunSec, dur),
    waveSum: prev.waveSum + run.wave,
    doctrineRuns,
    cardDrafts,
    // Boss Rush ledgers (docs/BOSS-RUSH.md): only a bossRush run advances them.
    rushRuns: prev.rushRuns + (extra?.bossRush ? 1 : 0),
    rushBossKills: prev.rushBossKills + (extra?.bossRush ? (run.bossKills ?? 0) : 0),
    rouletteSpores: prev.rouletteSpores, // advanced by meta.grantRouletteRewards, not by run settle
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
  { label: 'Deepest Strain', value: (s) => (s.bestStrain > 1 ? ['I', 'II', 'III', 'IV', 'V'][s.bestStrain - 1] : '—') },
  { label: 'Strain evolutions', value: (s) => s.strainsEvolved.toLocaleString() },
];

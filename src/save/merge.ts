// CONFLICT MERGE (docs/ACCOUNTS.md §conflicts) — the "merge where possible" option
// when two devices diverged. Deliberately CONSERVATIVE:
//
//   • The PRIMARY side (more lifetime playtime) contributes everything by default —
//     inventory, wallets, loadouts are never summed or duplicated across sides.
//   • PURE RECORDS are then folded in from the secondary: unions for id collections
//     (achievements, lore, titles, boss trophies), maxima for monotonic bests
//     (bestWave, rush records, lifetime stat counters, per-tower/hero mastery XP
//     and kills). Records can only grow; currencies can never dupe.
//
// The result flows through the normal sanitizer on import, so a merge can never
// produce an out-of-contract save.

import type { SaveData } from './saveStore';

const unionIds = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])];

const maxByKey = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = { ...a };
  for (const k of Object.keys(b)) out[k] = Math.max(out[k] ?? 0, b[k]);
  return out;
};

/** Order the two sides: primary = more lifetime playtime (ties → `a`). */
export function primarySide(a: SaveData, b: SaveData): { primary: SaveData; secondary: SaveData } {
  return (b.stats?.playtimeSec ?? 0) > (a.stats?.playtimeSec ?? 0)
    ? { primary: b, secondary: a }
    : { primary: a, secondary: b };
}

export function mergeSaves(a: SaveData, b: SaveData): SaveData {
  const { primary: p, secondary: s } = primarySide(a, b);
  const stats = { ...p.stats };
  // Lifetime stats are monotonic counters — take the field-wise max (never the sum:
  // both sides share history, summing would double-count it). Non-numeric stat
  // fields stay with the primary.
  for (const k of Object.keys(s.stats ?? {}) as (keyof typeof stats)[]) {
    const pv = stats[k];
    const sv = s.stats[k];
    if (typeof pv === 'number' && typeof sv === 'number') (stats as Record<string, unknown>)[k as string] = Math.max(pv, sv);
  }
  return {
    ...p,
    // records: maxima
    bestWave: Math.max(p.bestWave, s.bestWave),
    rushBestWave: Math.max(p.rushBestWave, s.rushBestWave),
    rushBestBoss: Math.max(p.rushBestBoss, s.rushBestBoss),
    totalRuns: Math.max(p.totalRuns, s.totalRuns),
    lifetimeShards: Math.max(p.lifetimeShards, s.lifetimeShards),
    lifetimeIchor: Math.max(p.lifetimeIchor, s.lifetimeIchor),
    // collections: unions (ids only — safe to combine, impossible to dupe value)
    achievements: unionIds(p.achievements, s.achievements),
    unlockedLore: unionIds(p.unlockedLore, s.unlockedLore),
    unlockedTitles: unionIds(p.unlockedTitles, s.unlockedTitles),
    bossesSlain: unionIds(p.bossesSlain, s.bossesSlain),
    // mastery ledgers: per-key maxima (XP/kills are monotonic per tower/hero)
    towerMasteryXp: maxByKey(p.towerMasteryXp as Record<string, number>, s.towerMasteryXp as Record<string, number>) as SaveData['towerMasteryXp'],
    heroMasteryXp: maxByKey(p.heroMasteryXp as Record<string, number>, s.heroMasteryXp as Record<string, number>) as SaveData['heroMasteryXp'],
    towerKills: maxByKey(p.towerKills as Record<string, number>, s.towerKills as Record<string, number>) as SaveData['towerKills'],
    heroKills: maxByKey(p.heroKills as Record<string, number>, s.heroKills as Record<string, number>) as SaveData['heroKills'],
    // Threat ladder (v55, docs/THREAT.md): the best cleared level per mode is a monotonic record.
    threat: maxByKey(p.threat ?? {}, s.threat ?? {}) as SaveData['threat'],
    stats,
  };
}

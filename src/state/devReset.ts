// Developer Reset (docs/DEV-RESET.md) — a DEV/testing-only catalog of save resets at every
// granularity, plus the pure transform that applies one. Each reset replaces whole, coherent
// slices with `defaultSave()` values, so the result is always a valid, complete, current-version
// SaveData (no orphaned references, no migration needed). The meta layer persists the result; the
// 'everything' scope additionally wipes backups + prefs (handled by the caller, not here).

import { defaultSave } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';

export interface DevResetDef {
  id: string;
  label: string;
  warning: string; // EXACTLY what will be erased (shown in the typed-confirm dialog)
  danger?: boolean; // the nuclear scopes — styled hotter
}

/** The catalog (data → the UI renders generically; a new scope is one row). Order = display order. */
export const DEV_RESETS: readonly DevResetDef[] = [
  { id: 'everything', label: 'Reset EVERYTHING', danger: true, warning: 'Erases the ENTIRE save, ALL backups, and every preference (audio, auto-gene, debug, auto-start). The game returns to a first-ever-launch state. This cannot be undone.' },
  { id: 'saveData', label: 'Reset Save Data', danger: true, warning: 'Erases the entire save — all progression, currency, equipment, achievements, statistics, and records. Backups and preferences are kept.' },
  { id: 'campaign', label: 'Reset Campaign', warning: 'Erases all Campaign progress — every cleared stage on every difficulty. Campaign restarts from Stage 1.' },
  { id: 'infinite', label: 'Reset Infinite Records', warning: 'Erases your best Infinite-mode depth record (Best Wave). Other progress is untouched.' },
  { id: 'currency', label: 'Reset Currency', warning: 'Erases your Genome Cores wallet (current + lifetime) and crafting materials (Mutagen, Scrap, Catalyst). Purchased upgrades are kept.' },
  { id: 'towers', label: 'Reset Tower Progress', warning: 'Erases all Tower progression — Stars, specialization forks, Strain Samples, and lifetime kills. Tower Mastery is kept (use Reset Mastery).' },
  { id: 'heroes', label: 'Reset Hero Progress', warning: 'Erases all Hero progression — Stars, Apex Genome, lifetime kills, favourite-equipment records, and the selected hero. Hero Mastery is kept (use Reset Mastery).' },
  { id: 'equipment', label: 'Reset Equipment', warning: 'Erases all owned equipment and the equipped loadout (weapon, armor, relic).' },
  { id: 'lootboxes', label: 'Reset Loot Boxes', warning: 'Erases the loot-box queue (and its pity progress) and every unopened bio-container in the Genetic Vault.' },
  { id: 'achievements', label: 'Reset Achievements', warning: 'Erases all unlocked achievements. They can be re-earned.' },
  { id: 'statistics', label: 'Reset Statistics', warning: 'Erases all lifetime statistics, the total-runs counter, and cards-seen. Records and progression are untouched.' },
  { id: 'mastery', label: 'Reset Mastery', warning: 'Erases all Tower and Hero Mastery XP and the identity it earned — unlocked titles (and the worn title) and codex lore.' },
  { id: 'ascension', label: 'Reset Ascension', warning: 'Erases all Prestige/Molt progress — Ascendant Cells, lifetime Cells, Molt count, and every Ascendant-Tree node.' },
] as const;

export function isDevResetId(id: string): boolean {
  return DEV_RESETS.some((r) => r.id === id);
}

/**
 * Apply a reset to a save, returning a NEW SaveData with the scope's slice(s) reset to defaults
 * and every other field carried unchanged. `everything`/`saveData` return a full fresh save (the
 * caller handles the extra storage wipe for `everything`). Unknown ids return the save unchanged.
 */
export function applyDevReset(save: SaveData, id: string): SaveData {
  const d = defaultSave();
  switch (id) {
    case 'everything':
    case 'saveData':
      return d;
    case 'campaign':
      return { ...save, campaign: d.campaign };
    case 'infinite':
      return { ...save, bestWave: d.bestWave };
    case 'currency':
      return { ...save, shards: d.shards, lifetimeShards: d.lifetimeShards, mats: d.mats };
    case 'towers':
      return { ...save, towerStars: d.towerStars, towerForks: d.towerForks, towerShards: d.towerShards, towerKills: d.towerKills };
    case 'heroes':
      return { ...save, heroStars: d.heroStars, heroShards: d.heroShards, heroKills: d.heroKills, heroFavEquip: d.heroFavEquip, selectedHero: d.selectedHero };
    case 'equipment':
      return { ...save, equipment: d.equipment }; // inventory + loadout together → no dangling uid
    case 'lootboxes':
      return { ...save, lootQueue: d.lootQueue, pendingContainers: d.pendingContainers };
    case 'achievements':
      return { ...save, achievements: d.achievements };
    case 'statistics':
      return { ...save, stats: d.stats, totalRuns: d.totalRuns, cardsSeen: d.cardsSeen };
    case 'mastery':
      return { ...save, towerMasteryXp: d.towerMasteryXp, heroMasteryXp: d.heroMasteryXp, unlockedTitles: d.unlockedTitles, equippedTitle: d.equippedTitle, unlockedLore: d.unlockedLore };
    case 'ascension':
      return { ...save, prestige: d.prestige };
    default:
      return save;
  }
}

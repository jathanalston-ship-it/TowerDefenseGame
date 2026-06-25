// Permanent (meta) progression: shards, capped upgrades, and run records.
// Persisted through SaveStore; exposed to React as a reactive store. Also fronts
// the save-management surface (export/import/backup) and debug seeding.

import { createStore } from './store';
import {
  SaveStore,
  defaultSave,
  parseImport,
  serializeExport,
} from '../save/saveStore';
import type { BackupMeta, ImportResult, SaveData } from '../save/saveStore';
import { downloadText, readTextFile } from '../save/saveFile';
import { ECON, META_UPGRADES } from '../core/config';
import type { UpgradeDef } from '../core/config';
import type { MetaModifiers } from '../core/types';

const saveStore = new SaveStore();
const store = createStore<SaveData>(saveStore.load());

function persist(next: SaveData): void {
  store.set(next);
  saveStore.save(next);
}

/** Permanent multipliers derived from upgrade levels (folded into a run at start). */
export function metaModifiers(save: SaveData): MetaModifiers {
  const lvl = (id: string): number => save.upgrades[id] ?? 0;
  return {
    towerDamageMult: 1 + 0.08 * lvl('lethality'),
    biomassMult: 1 + 0.1 * lvl('metabolism'),
    heroDamageMult: 1 + 0.1 * lvl('apex'),
    integrityBonus: 25 * lvl('nucleus'),
  };
}

export function upgradeLevel(save: SaveData, id: string): number {
  return save.upgrades[id] ?? 0;
}

export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.round(def.baseCost * Math.pow(def.costMult, level));
}

export function nextUpgradeCost(save: SaveData, def: UpgradeDef): number | null {
  const level = upgradeLevel(save, def.id);
  if (level >= def.maxLevel) return null;
  return upgradeCost(def, level);
}

export interface RunResult {
  wave: number;
  kills: number;
  won: boolean;
}

export interface RunReward {
  shardsEarned: number;
  newBest: boolean;
}

export const meta = {
  use: store.use,
  get: store.get,
  upgrades: META_UPGRADES,

  buyUpgrade(id: string): boolean {
    const save = store.get();
    const def = META_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const level = upgradeLevel(save, id);
    if (level >= def.maxLevel) return false;
    const cost = upgradeCost(def, level);
    if (save.shards < cost) return false;
    persist({
      ...save,
      shards: save.shards - cost,
      upgrades: { ...save.upgrades, [id]: level + 1 },
    });
    return true;
  },

  recordRun(result: RunResult): RunReward {
    const save = store.get();
    const shardsEarned = Math.floor(result.wave * ECON.shardsPerWave + result.kills * ECON.shardsPerKill);
    const newBest = result.wave > save.bestWave;
    persist({
      ...save,
      shards: save.shards + shardsEarned,
      lifetimeShards: save.lifetimeShards + shardsEarned,
      bestWave: Math.max(save.bestWave, result.wave),
      totalRuns: save.totalRuns + 1,
    });
    return { shardsEarned, newBest };
  },

  // ── Save management ──────────────────────────────────────────────────────

  exportToFile(): void {
    const date = new Date().toISOString().slice(0, 10);
    downloadText(`assimilate-save-${date}.json`, serializeExport(store.get()));
  },

  /** Validate + apply an imported save string. Backs up the current save first. */
  importText(text: string): ImportResult {
    const result = parseImport(text);
    if (!result.ok) return result;
    saveStore.backup(); // non-destructive: keep the pre-import state recoverable
    persist(result.data);
    return result;
  },

  async importFromFile(file: File): Promise<ImportResult> {
    try {
      return this.importText(await readTextFile(file));
    } catch {
      return { ok: false, error: 'Could not read the file.' };
    }
  },

  backupNow(): BackupMeta | null {
    return saveStore.backup();
  },

  listBackups(): BackupMeta[] {
    return saveStore.listBackups();
  },

  restoreBackup(id: string): boolean {
    const data = saveStore.restoreBackup(id);
    if (!data) return false;
    store.set(data);
    return true;
  },

  /** Wipe permanent progress — but back it up first so it's recoverable. */
  reset(): void {
    saveStore.backup();
    persist(defaultSave());
  },

  // ── Debug seeding (used by the debug panel; harmless no-ops otherwise) ────

  debugAddShards(n: number): void {
    const save = store.get();
    persist({ ...save, shards: Math.max(0, save.shards + n) });
  },

  debugSetUpgrade(id: string, level: number): void {
    const def = META_UPGRADES.find((u) => u.id === id);
    if (!def) return;
    const lvl = Math.max(0, Math.min(def.maxLevel, Math.floor(level)));
    persist({ ...store.get(), upgrades: { ...store.get().upgrades, [id]: lvl } });
  },

  debugMaxUpgrades(): void {
    const upgrades: Record<string, number> = {};
    for (const u of META_UPGRADES) upgrades[u.id] = u.maxLevel;
    persist({ ...store.get(), upgrades });
  },
};

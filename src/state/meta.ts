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
import {
  ECON,
  ALL_UPGRADES,
  META_UPGRADES,
  MASTERY_UPGRADES,
  EQUIPMENT_UPGRADES,
  PRESTIGE_UPGRADES,
  defaultMetaModifiers,
} from '../core/config';
import type { UpgradeDef } from '../core/config';
import type { MetaModifiers } from '../core/types';
import type { RunResult } from '../core/game';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_GROUPS,
  TOTAL_ENEMIES,
  TOTAL_BIOMES,
  TOTAL_CARDS,
  evaluateUnlocked,
  titleFor,
} from '../core/achievements';
import type { AchievementStats } from '../core/achievements';

const saveStore = new SaveStore();
const store = createStore<SaveData>(saveStore.load());

function persist(next: SaveData): void {
  store.set(next);
  saveStore.save(next);
}

/** Permanent multipliers derived from EVERY upgrade track (data-driven — each
 *  UpgradeDef folds itself in). New upgrades need no change here. */
export function metaModifiers(save: SaveData): MetaModifiers {
  const m = defaultMetaModifiers();
  for (const def of ALL_UPGRADES) {
    const level = save.upgrades[def.id] ?? 0;
    if (level > 0) def.apply(m, level);
  }
  return m;
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

export type { RunResult };

/** Currencies earned by a finished run (only the mode's own are non-zero). */
export interface RunReward {
  shards: number;
  essence: number;
  components: number;
  catalyst: number;
  newBest: boolean;
  newAchievements: string[]; // display names of achievements unlocked by THIS run
  newTitle: string | null; // a freshly-earned title to celebrate, else null
}

/** Build the achievement-check view from a (post-run) save. */
function statsFromSave(s: SaveData): AchievementStats {
  return {
    totalRuns: s.totalRuns,
    bestWave: s.bestWave,
    bestStage: s.bestStage,
    stagesCleared: s.stagesCleared,
    bestEndlessWave: s.bestEndlessWave,
    bestEndlessScore: s.bestEndlessScore,
    lifetimeShards: s.lifetimeShards,
    enemiesSeen: s.codex.enemies.length,
    biomesSeen: s.codex.biomes.length,
    cardsSeen: s.codex.cards.length,
  };
}

/** Union an existing id list with newly-seen ids, preserving order, deduped. */
function mergeIds(have: string[], add: readonly string[]): string[] {
  if (add.length === 0) return have;
  const set = new Set(have);
  let changed = false;
  for (const id of add) if (!set.has(id)) { set.add(id); changed = true; }
  return changed ? [...set] : have;
}

export const meta = {
  use: store.use,
  get: store.get,
  upgrades: ALL_UPGRADES,
  tracks: { core: META_UPGRADES, mastery: MASTERY_UPGRADES, equipment: EQUIPMENT_UPGRADES, prestige: PRESTIGE_UPGRADES },

  // Collection / motivation read-models for the Codex UI.
  achievementDefs: ACHIEVEMENTS,
  achievementGroups: ACHIEVEMENT_GROUPS,
  codexTotals: { enemies: TOTAL_ENEMIES, biomes: TOTAL_BIOMES, cards: TOTAL_CARDS },

  buyUpgrade(id: string): boolean {
    const save = store.get();
    const def = ALL_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const level = upgradeLevel(save, id);
    if (level >= def.maxLevel) return false;
    const cost = upgradeCost(def, level);
    if (save[def.currency] < cost) return false; // spend the upgrade's own currency
    persist({
      ...save,
      [def.currency]: save[def.currency] - cost,
      upgrades: { ...save.upgrades, [id]: level + 1 },
    });
    return true;
  },

  /**
   * Record a finished run. Each mode pays in DIFFERENT currencies toward DIFFERENT
   * sinks, so the modes pull toward different playstyles (see docs/ECONOMY.md §Implemented):
   *   • Stage   → Shards (power) + Components (gear); clearing advances the path.
   *   • Endless → Essence (mastery) + Catalyst (prestige) + leaderboard score.
   *   • Classic → Shards (the original baseline).
   */
  recordRun(result: RunResult): RunReward {
    const save = store.get();
    const next = { ...save };
    const reward: RunReward = { shards: 0, essence: 0, components: 0, catalyst: 0, newBest: false, newAchievements: [], newTitle: null };

    if (result.mode === 'endless') {
      reward.essence = Math.floor(result.wave * 3 * (1 + result.wave * 0.04) + result.kills * 0.15);
      reward.catalyst = Math.floor(result.wave / 10); // prestige currency: 1 per 10 waves
      reward.newBest = result.score > save.bestEndlessScore;
      next.essence = save.essence + reward.essence;
      next.catalyst = save.catalyst + reward.catalyst;
      next.bestEndlessScore = Math.max(save.bestEndlessScore, result.score);
      next.bestEndlessWave = Math.max(save.bestEndlessWave, result.wave);
    } else if (result.mode === 'stage') {
      const base = result.wave * 10 + result.kills * 0.5;
      const objMult = result.objectiveDone ? 1 + result.objectiveBonus : 1;
      const completion = result.won ? 1 : 0.4; // partial credit on a loss
      reward.shards = Math.floor(base * result.rewardMultiplier * objMult * completion);
      reward.components = Math.floor((result.stageNumber * 1.5 + (result.won ? 4 : 0)) * (result.objectiveDone ? 1.5 : 1));
      next.shards = save.shards + reward.shards;
      next.lifetimeShards = save.lifetimeShards + reward.shards;
      next.components = save.components + reward.components;
      if (result.won) {
        reward.newBest = result.stageNumber > save.bestStage;
        next.stagesCleared = save.stagesCleared + 1;
        next.bestStage = Math.max(save.bestStage, result.stageNumber);
      }
    } else {
      reward.shards = Math.floor(result.wave * ECON.shardsPerWave + result.kills * ECON.shardsPerKill);
      reward.newBest = result.wave > save.bestWave;
      next.shards = save.shards + reward.shards;
      next.lifetimeShards = save.lifetimeShards + reward.shards;
      next.bestWave = Math.max(save.bestWave, result.wave);
    }

    next.totalRuns = save.totalRuns + 1;

    // ── Codex discoveries (motivation layer — union this run's sightings) ──
    next.codex = {
      enemies: mergeIds(save.codex.enemies, result.enemiesSeen),
      biomes: mergeIds(save.codex.biomes, result.biome ? [result.biome] : []),
      cards: mergeIds(save.codex.cards, result.cardsSeen),
    };
    next.cardsSeen = next.codex.cards.length; // keep the legacy count in sync

    // ── Achievements + title (re-evaluated against the post-run save) ──
    const unlocked = evaluateUnlocked(statsFromSave(next));
    const had = new Set(save.achievements);
    const newly = unlocked.filter((id) => !had.has(id));
    next.achievements = unlocked;
    const title = titleFor(new Set(unlocked)) ?? '';
    if (title && title !== save.title) reward.newTitle = title;
    next.title = title;
    reward.newAchievements = newly
      .map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name)
      .filter((n): n is string => !!n);

    persist(next);
    return reward;
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
    persist({ ...save, shards: Math.max(0, save.shards + n), essence: Math.max(0, save.essence + n), components: Math.max(0, save.components + n), catalyst: Math.max(0, save.catalyst + n) });
  },

  debugSetUpgrade(id: string, level: number): void {
    const def = ALL_UPGRADES.find((u) => u.id === id);
    if (!def) return;
    const lvl = Math.max(0, Math.min(def.maxLevel, Math.floor(level)));
    persist({ ...store.get(), upgrades: { ...store.get().upgrades, [id]: lvl } });
  },

  debugMaxUpgrades(): void {
    const upgrades: Record<string, number> = {};
    for (const u of ALL_UPGRADES) upgrades[u.id] = u.maxLevel;
    persist({ ...store.get(), upgrades });
  },
};

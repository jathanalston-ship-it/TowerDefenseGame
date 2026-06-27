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
  lootMeterSize,
  lootBoxRarity,
  LOOT_RARITY,
  GENOME_SHARDS_PER_WAVE,
  starCost,
  starStatFor,
  applyStarUnlocks,
  TOWER_ORDER,
  AFFIX_POOL,
  affixDef,
  GEAR_SLOTS,
  GEAR_RARITY_AFFIXES,
  GEAR_DROP_CHANCE,
  GEAR_INVENTORY_CAP,
  GEAR_DISMANTLE_GENOME,
  applyGear,
  MASTERY,
  MASTERY_UNITS,
  masteryLevel,
  masteryXpForLevel,
  masteryStatFor,
  masteryDamageMult,
  applyHeroMastery,
} from '../core/config';
import type { AffixDef, MasteryUnit } from '../core/config';
import type { UpgradeDef, LootRarity, StarStat } from '../core/config';
import type { Currency, MetaModifiers, TowerKind, GearItem, GearSlot } from '../core/types';
import type { RunModifiers } from '../core/cards';
import type { RunFold } from '../core/game';
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

/** Contents revealed by opening a loot box. */
export interface LootReward {
  rarity: LootRarity;
  shards: number;
  essence: number;
  components: number;
  genomeShards: number;
  gear: GearItem | null; // a gear item dropped by this box (null = none this time)
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

// ── Gear rolling (meta layer — Math.random is fine here; never the sim) ───────
let gearSeq = 0;
/** A short, collision-resistant instance id for a freshly-rolled gear item. */
function gearId(): string {
  gearSeq = (gearSeq + 1) % 0xffffff;
  return `g${Date.now().toString(36)}${gearSeq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Roll one affix's magnitude: integers for wide/whole ranges, one decimal for the
 *  small fractional relics (e.g. Apex Cooldown / Kill) so the value reads cleanly. */
function rollAffixValue(def: AffixDef): number {
  const [lo, hi] = def.range;
  const raw = lo + Math.random() * (hi - lo);
  return hi - lo >= 2 ? Math.round(raw) : Math.round(raw * 10) / 10;
}

/** Roll a fresh gear item at a rarity: a random slot + that rarity's distinct affix
 *  count drawn from the slot's pool, each at a rolled magnitude. */
function rollGear(rarity: 'common' | 'rare' | 'epic'): GearItem {
  const slot = GEAR_SLOTS[Math.floor(Math.random() * GEAR_SLOTS.length)];
  const bag = AFFIX_POOL.filter((a) => a.slot === slot);
  const want = Math.min(GEAR_RARITY_AFFIXES[rarity], bag.length);
  const affixes = [];
  for (let i = 0; i < want && bag.length > 0; i++) {
    const j = Math.floor(Math.random() * bag.length);
    const def = bag.splice(j, 1)[0]; // distinct affixes (no repeats on one item)
    affixes.push({ id: def.id, value: rollAffixValue(def) });
  }
  return { id: gearId(), slot, rarity, affixes };
}

/** Human-readable lines for an item's affixes: a magnitude + label, or — for a
 *  behavioral unlock (flag) — the label alone (it has no meaningful number). */
export function gearAffixLines(item: GearItem): string[] {
  const out: string[] = [];
  for (const a of item.affixes) {
    const def = affixDef(a.id);
    if (!def) continue;
    out.push(def.flag ? def.label : `+${a.value}${def.pct ? '%' : ''} ${def.label}`);
  }
  return out;
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
    next.genomeShards = save.genomeShards + Math.floor(result.wave * GENOME_SHARDS_PER_WAVE); // Star trickle

    // ── Infinite Mastery XP — fielded towers + the hero each gain XP (never caps) ──
    const masteryGain: Record<string, number> = { ...save.mastery };
    const usageBase = result.wave * MASTERY.xpPerWave + result.kills * MASTERY.xpPerKill;
    for (const kind of TOWER_ORDER) {
      const built = result.towersByKind[kind] ?? 0;
      if (built <= 0) continue; // only a fielded kind earns mastery
      const lean = 1 + Math.min(built - 1, MASTERY.extraTowerCap) * MASTERY.xpPerExtraTower;
      masteryGain[kind] = (masteryGain[kind] ?? 0) + Math.round(usageBase * lean);
    }
    masteryGain.hero = (masteryGain.hero ?? 0) + Math.round(usageBase + result.apexUses * MASTERY.xpPerApex);
    next.mastery = masteryGain;

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

  /**
   * Fold loot-meter progress into the PERSISTENT meter. The meter never resets
   * across runs/modes; crossing its size awards one box and rolls the overflow into
   * the next (so progress is never lost). Live in-run folds pass `save=false` (cheap
   * in-memory updates for a smoothly-filling bar); wave/run-end checkpoints — and any
   * box award — write to storage. Returns the number of boxes awarded by this call.
   */
  addLootProgress(amount: number, save = true): number {
    if (amount <= 0 && !save) return 0;
    const s = store.get();
    let meter = s.lootMeter + Math.max(0, amount);
    let boxes = s.lootBoxes;
    let lifetime = s.lootBoxesLifetime;
    let awarded = 0;
    let size = lootMeterSize(lifetime);
    while (meter >= size) {
      meter -= size;
      boxes++;
      lifetime++;
      awarded++;
      size = lootMeterSize(lifetime); // the next meter (may scale with boxes earned)
    }
    const next = { ...s, lootMeter: meter, lootBoxes: boxes, lootBoxesLifetime: lifetime };
    if (save || awarded > 0) persist(next);
    else store.set(next); // in-memory only (no storage write) for live fills
    return awarded;
  },

  /** Rarity of the next box the meter is filling toward (drives the preview/accent). */
  nextLootRarity(): LootRarity {
    return lootBoxRarity(store.get().lootBoxesLifetime + 1);
  },

  /** Rarity of the oldest banked box — the next one `openLootBox` reveals (or null). */
  pendingLootRarity(): LootRarity | null {
    const s = store.get();
    if (s.lootBoxes <= 0) return null;
    return lootBoxRarity(s.lootBoxesLifetime - s.lootBoxes + 1);
  },

  /** Open the oldest banked loot box (FIFO) → a currency cache scaled by its rarity.
   *  Returns the reward, or null if no box is banked. (Loot is intentionally random;
   *  this is the meta layer, not the deterministic sim, so Math.random is fine.) */
  openLootBox(): LootReward | null {
    const s = store.get();
    if (s.lootBoxes <= 0) return null;
    const index = s.lootBoxesLifetime - s.lootBoxes + 1; // FIFO order
    const rarity = lootBoxRarity(index);
    const def = LOOT_RARITY[rarity];
    const roll = ([lo, hi]: [number, number]): number => (hi <= 0 ? 0 : lo + Math.floor(Math.random() * (hi - lo + 1)));
    const shards = roll(def.shards);
    const essence = roll(def.essence);
    const components = roll(def.components);
    const genomeShards = roll(def.genomeShards);
    // Gear drop — the loot→build chase. Chance scales with rarity; skipped when the
    // inventory is full (dismantle to make room), so a box never silently voids gear.
    const gear = s.gear.length < GEAR_INVENTORY_CAP && Math.random() < GEAR_DROP_CHANCE[rarity] ? rollGear(rarity) : null;
    persist({
      ...s,
      lootBoxes: s.lootBoxes - 1,
      shards: s.shards + shards,
      essence: s.essence + essence,
      components: s.components + components,
      genomeShards: s.genomeShards + genomeShards,
      gear: gear ? [...s.gear, gear] : s.gear,
    });
    return { rarity, shards, essence, components, genomeShards, gear };
  },

  // ── Tower Stars (per-unit progression) ───────────────────────────────────

  starLevel(kind: TowerKind): number {
    return store.get().stars[kind] ?? 0;
  },

  /** Genome-Shard cost of the next star, or null if maxed. */
  nextStarCost(kind: TowerKind): number | null {
    return starCost(kind, store.get().stars[kind] ?? 0);
  },

  /** Buy the next star for a tower (spends Genome Shards). Returns success. */
  buyStar(kind: TowerKind): boolean {
    const s = store.get();
    const level = s.stars[kind] ?? 0;
    const cost = starCost(kind, level);
    if (cost === null || s.genomeShards < cost) return false;
    persist({ ...s, genomeShards: s.genomeShards - cost, stars: { ...s.stars, [kind]: level + 1 } });
    return true;
  },

  /** The per-run permanent fold the Game applies: per-kind stats (Stars × Mastery) +
   *  an applier that layers Star unlocks, equipped Hero gear, AND hero Mastery. */
  runFold(): RunFold {
    const s = store.get();
    const stat = {} as Record<TowerKind, StarStat>;
    for (const kind of TOWER_ORDER) {
      const star = starStatFor(kind, s.stars[kind] ?? 0);
      const m = masteryStatFor(s.mastery[kind] ?? 0); // uncapped per-kind mastery
      stat[kind] = {
        damageMult: star.damageMult * m.damageMult,
        fireRateMult: star.fireRateMult * m.fireRateMult,
        rangeMult: star.rangeMult * m.rangeMult,
        splashMult: star.splashMult * m.splashMult,
      };
    }
    const worn = this.equippedItems(s.equipped, s.gear);
    return {
      stat,
      apply: (m: RunModifiers) => {
        for (const kind of TOWER_ORDER) applyStarUnlocks(kind, s.stars[kind] ?? 0, m);
        for (const item of worn) applyGear(item, m);
        applyHeroMastery(s.mastery.hero ?? 0, m); // hero's uncapped mastery
      },
    };
  },

  // ── Infinite Mastery (uncapped per-unit progression) ─────────────────────

  masteryUnits: MASTERY_UNITS,

  /** Cumulative mastery XP for a unit (tower kind or 'hero'). */
  masteryXp(unit: MasteryUnit): number {
    return store.get().mastery[unit] ?? 0;
  },

  /** Level + progress toward the next level, for the UI bar. */
  masteryProgress(unit: MasteryUnit): { level: number; xp: number; into: number; span: number; dmgPct: number; nextMilestone: number } {
    const xp = store.get().mastery[unit] ?? 0;
    const level = masteryLevel(xp);
    const lo = masteryXpForLevel(level);
    const hi = masteryXpForLevel(level + 1);
    return {
      level,
      xp,
      into: xp - lo,
      span: Math.max(1, hi - lo),
      dmgPct: Math.round((masteryDamageMult(level) - 1) * 1000) / 10, // +X.X% damage
      nextMilestone: (Math.floor(level / MASTERY.milestoneEvery) + 1) * MASTERY.milestoneEvery,
    };
  },

  // ── Hero gear (equipment loadout) ────────────────────────────────────────

  /** Resolve the equipped slot ids → live items (skips empty/dangling slots). */
  equippedItems(equipped: Record<GearSlot, string | null>, gear: GearItem[]): GearItem[] {
    const out: GearItem[] = [];
    for (const slot of GEAR_SLOTS) {
      const id = equipped[slot];
      if (!id) continue;
      const item = gear.find((g) => g.id === id);
      if (item) out.push(item);
    }
    return out;
  },

  /** Equip an owned item into its own slot (replacing whatever was there). */
  equipGear(id: string): boolean {
    const s = store.get();
    const item = s.gear.find((g) => g.id === id);
    if (!item) return false;
    if (s.equipped[item.slot] === id) return false; // already worn
    persist({ ...s, equipped: { ...s.equipped, [item.slot]: id } });
    return true;
  },

  /** Clear whatever occupies a slot. Returns false if the slot was already empty. */
  unequipSlot(slot: GearSlot): boolean {
    const s = store.get();
    if (s.equipped[slot] == null) return false;
    persist({ ...s, equipped: { ...s.equipped, [slot]: null } });
    return true;
  },

  /** Dismantle an owned item → Genome Shards (by rarity). Unequips it first if worn.
   *  Returns the shards refunded (0 if the id isn't owned). */
  dismantleGear(id: string): number {
    const s = store.get();
    const item = s.gear.find((g) => g.id === id);
    if (!item) return 0;
    const refund = GEAR_DISMANTLE_GENOME[item.rarity];
    const equipped = { ...s.equipped };
    for (const slot of GEAR_SLOTS) if (equipped[slot] === id) equipped[slot] = null;
    persist({
      ...s,
      gear: s.gear.filter((g) => g.id !== id),
      equipped,
      genomeShards: s.genomeShards + refund,
    });
    return refund;
  },

  /** Genome-Shard refund a given item would yield if dismantled (for the UI). */
  dismantleValue(item: GearItem): number {
    return GEAR_DISMANTLE_GENOME[item.rarity];
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

  /** Grant a single currency (the balancing panel's per-currency buttons). */
  debugGrantCurrency(currency: Currency, n: number): void {
    const save = store.get();
    persist({ ...save, [currency]: Math.max(0, save[currency] + n) });
  },

  /** Roll a gear item straight into the inventory (debug — skips the loot box). */
  debugGrantGear(rarity: 'common' | 'rare' | 'epic'): GearItem | null {
    const s = store.get();
    if (s.gear.length >= GEAR_INVENTORY_CAP) return null;
    const item = rollGear(rarity);
    persist({ ...s, gear: [...s.gear, item] });
    return item;
  },

  /** Grant mastery XP to a unit (debug — fast-forward the mastery curve). */
  debugGrantMastery(unit: MasteryUnit, xp: number): void {
    const s = store.get();
    persist({ ...s, mastery: { ...s.mastery, [unit]: Math.max(0, (s.mastery[unit] ?? 0) + xp) } });
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

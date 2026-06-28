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
  LOOT_BOX_TYPES,
  LOOT_BOX_ORDER,
  lootBoxType,
  GENOME_SHARDS_PER_WAVE,
  starCost,
  starStatFor,
  applyStarUnlocks,
  TOWER_ORDER,
  AFFIX_POOL,
  affixDef,
  GEAR_SLOTS,
  GEAR_RARITY_AFFIXES,
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
import type { UpgradeDef, LootRarity, LootBoxType, StarStat } from '../core/config';
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

/** Contents revealed by opening a single Bio-Container. */
export interface LootReward {
  boxId: string;
  label: string; // "Common Bio-Container"
  rarity: LootRarity;
  shards: number;
  essence: number;
  components: number;
  genomeShards: number;
  gear: GearItem | null; // a gear item dropped by this container (null = none this time)
}

/** Aggregated result of opening one or more Bio-Containers of a type (Open / Open ×N). */
export interface LootHaul {
  boxId: string;
  label: string;
  rarity: LootRarity;
  count: number; // containers opened
  shards: number;
  essence: number;
  components: number;
  genomeShards: number;
  gear: GearItem[]; // all gear items dropped across the haul
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
   * Fold meter progress into the PERSISTENT Bio-Container meter. The meter never resets
   * across runs/modes; each fill EARNS one typed container (by the earn cadence) into the
   * inventory — never auto-opened — and rolls the overflow into the next. Live in-run
   * folds pass `save=false` (cheap in-memory updates for a smoothly-filling bar);
   * wave/run-end checkpoints — and any earn — write to storage. Returns the containers
   * earned by THIS call as a per-type map (e.g. `{ common: 2, rare: 1 }`).
   */
  addLootProgress(amount: number, save = true): Record<string, number> {
    if (!Number.isFinite(amount)) amount = 0; // guard a NaN/Infinity delta (corrupt sync)
    if (amount <= 0 && !save) return {};
    const s = store.get();
    let meter = s.lootMeter + Math.max(0, amount);
    if (!Number.isFinite(meter)) meter = 0; // guard a corrupt stored meter
    let lifetime = s.lootBoxesLifetime;
    const boxes = { ...s.boxes };
    const earnedLifetime = { ...s.boxesEarned };
    const awarded: Record<string, number> = {};
    let size = lootMeterSize(lifetime);
    // Award one container per crossing. Hardened: `size > 0` can't loop forever, and the
    // iteration cap stops a corrupt/huge meter from freezing the tab (it's clamped below).
    for (let guard = 0; size > 0 && meter >= size && guard < 100000; guard++) {
      meter -= size;
      lifetime++;
      const id = lootBoxRarity(lifetime); // earn cadence → which container type (base id === rarity)
      boxes[id] = (boxes[id] ?? 0) + 1;
      earnedLifetime[id] = (earnedLifetime[id] ?? 0) + 1;
      awarded[id] = (awarded[id] ?? 0) + 1;
      size = lootMeterSize(lifetime);
    }
    // The meter must NEVER persist >= size (the bar would stick at max) or go non-finite.
    if (size > 0 && meter >= size) meter = size - 1;
    if (!(meter >= 0)) meter = 0; // also catches NaN (NaN >= 0 is false)
    const gotOne = Object.keys(awarded).length > 0;
    const next = { ...s, lootMeter: meter, lootBoxesLifetime: lifetime, boxes, boxesEarned: earnedLifetime };
    if (save || gotOne) persist(next);
    else store.set(next); // in-memory only (no storage write) for live fills
    return awarded;
  },

  /** Rarity of the next container the meter is filling toward (drives the preview/accent). */
  nextLootRarity(): LootRarity {
    return lootBoxRarity(store.get().lootBoxesLifetime + 1);
  },

  // ── Bio-Container inventory (the LOOT screen) ────────────────────────────

  /** Owned count of a container type. */
  boxCount(typeId: string): number {
    return store.get().boxes[typeId] ?? 0;
  },

  /** Total owned containers across all types. */
  totalBoxes(): number {
    return Object.values(store.get().boxes).reduce((a, b) => a + b, 0);
  },

  /** Per-type collection view (display order, rarest first) for the LOOT screen:
   *  the type def + owned / lifetime-earned / lifetime-opened / pity counters. */
  boxCollection(): { type: LootBoxType; owned: number; earned: number; opened: number; pity: number }[] {
    const s = store.get();
    return LOOT_BOX_ORDER.map((id) => LOOT_BOX_TYPES[id]).map((type) => ({
      type,
      owned: s.boxes[type.id] ?? 0,
      earned: s.boxesEarned[type.id] ?? 0,
      opened: s.boxesOpened[type.id] ?? 0,
      pity: s.pity[type.id] ?? 0,
    }));
  },

  /** Collection progress: how many container TYPES have ever been earned, of the total. */
  boxDiscovery(): { discovered: number; total: number; opened: number } {
    const s = store.get();
    const total = LOOT_BOX_ORDER.length;
    const discovered = LOOT_BOX_ORDER.filter((id) => (s.boxesEarned[id] ?? 0) > 0).length;
    const opened = Object.values(s.boxesOpened).reduce((a, b) => a + b, 0);
    return { discovered, total, opened };
  },

  /** Pity state for a type's meter (opens toward a guaranteed gear), or null if no pity. */
  boxPity(typeId: string): { value: number; every: number } | null {
    const type = lootBoxType(typeId);
    if (!type?.pity) return null;
    return { value: store.get().pity[typeId] ?? 0, every: type.pity.every };
  },

  /**
   * Open up to `n` containers of a type → roll each within its rarity bands, with a
   * pity-aware gear drop (a guaranteed item every `pity.every` opens). Gear that would
   * overflow the inventory cap converts to Genome Shards (never voided). One storage
   * write for the whole haul. Returns the aggregate, or null if none owned. (Loot is
   * intentionally random — meta layer, not the deterministic sim, so Math.random is fine.)
   */
  openBoxes(typeId: string, n = 1): LootHaul | null {
    const type = lootBoxType(typeId);
    const s = store.get();
    const have = s.boxes[typeId] ?? 0;
    const count = Math.min(Math.max(0, Math.floor(n)), have);
    if (!type || count <= 0) return null;
    const bands = LOOT_RARITY[type.rarity];
    const roll = ([lo, hi]: [number, number]): number => (hi <= 0 ? 0 : lo + Math.floor(Math.random() * (hi - lo + 1)));
    let shards = 0;
    let essence = 0;
    let components = 0;
    let genomeShards = 0;
    const gear: GearItem[] = [];
    let pity = s.pity[typeId] ?? 0;
    let owned = s.gear.length;
    for (let k = 0; k < count; k++) {
      shards += roll(bands.shards);
      essence += roll(bands.essence);
      components += roll(bands.components);
      genomeShards += roll(bands.genomeShards);
      pity++;
      let drop = false;
      if (type.pity && pity >= type.pity.every) { drop = true; pity = 0; } // pity guarantee
      else if (Math.random() < type.gearChance) drop = true;
      if (drop) {
        if (owned < GEAR_INVENTORY_CAP) { gear.push(rollGear(type.rarity)); owned++; }
        else genomeShards += GEAR_DISMANTLE_GENOME[type.rarity]; // inventory full → value, not void
      }
    }
    persist({
      ...s,
      boxes: { ...s.boxes, [typeId]: have - count },
      boxesOpened: { ...s.boxesOpened, [typeId]: (s.boxesOpened[typeId] ?? 0) + count },
      pity: { ...s.pity, [typeId]: pity },
      shards: s.shards + shards,
      essence: s.essence + essence,
      components: s.components + components,
      genomeShards: s.genomeShards + genomeShards,
      gear: gear.length ? [...s.gear, ...gear] : s.gear,
    });
    return { boxId: typeId, label: type.label, rarity: type.rarity, count, shards, essence, components, genomeShards, gear };
  },

  /** Open a single container of a type (the reveal animation). Null if none owned. */
  openBox(typeId: string): LootReward | null {
    const haul = this.openBoxes(typeId, 1);
    if (!haul) return null;
    return {
      boxId: haul.boxId, label: haul.label, rarity: haul.rarity,
      shards: haul.shards, essence: haul.essence, components: haul.components,
      genomeShards: haul.genomeShards, gear: haul.gear[0] ?? null,
    };
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

  /** Level + progress toward the next level, for the UI bar. `nextRateMilestone` is the
   *  level of the next rate-granting milestone, or null once the rate cap is reached
   *  (past the cap only the logarithmic damage keeps growing). */
  masteryProgress(unit: MasteryUnit): { level: number; xp: number; into: number; span: number; dmgPct: number; nextRateMilestone: number | null } {
    const xp = store.get().mastery[unit] ?? 0;
    const level = masteryLevel(xp);
    const lo = masteryXpForLevel(level);
    const hi = masteryXpForLevel(level + 1);
    const earned = Math.floor(level / MASTERY.milestoneEvery);
    return {
      level,
      xp,
      into: xp - lo,
      span: Math.max(1, hi - lo),
      dmgPct: Math.round((masteryDamageMult(level) - 1) * 1000) / 10, // +X.X% damage
      nextRateMilestone: earned < MASTERY.milestoneRateMax ? (earned + 1) * MASTERY.milestoneEvery : null,
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

  /** Grant Genome Shards — the Star currency (not one of the four Currency types, so
   *  it needs its own debug grant to exercise the Star panel + gear dismantle economy). */
  debugGrantGenome(n: number): void {
    const save = store.get();
    persist({ ...save, genomeShards: Math.max(0, save.genomeShards + n) });
  },

  /** Grant Bio-Containers straight into the inventory (debug — skips the meter). */
  debugGrantBox(typeId: string, n = 1): void {
    if (!lootBoxType(typeId)) return;
    const s = store.get();
    persist({
      ...s,
      boxes: { ...s.boxes, [typeId]: (s.boxes[typeId] ?? 0) + Math.max(0, n) },
      boxesEarned: { ...s.boxesEarned, [typeId]: (s.boxesEarned[typeId] ?? 0) + Math.max(0, n) },
    });
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

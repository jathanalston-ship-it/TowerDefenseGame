// Browser-local persistence + save management (ARCHITECTURE.md §15). Versioned +
// checksummed blob, a migration pipeline, rolling backups, JSON export/import, and
// non-destructive recovery (a corrupt save falls back to the newest valid backup,
// then to defaults — never crashing, never silently overwriting good data).
// Storage is injectable so the core is testable headlessly; the browser uses
// localStorage. No DOM/file APIs here (those live in saveFile.ts).

import { ENEMY_KINDS, HERO_ORDER, HERO_IDS, TOWER_ORDER, heroRegistry } from '../core/config';
import type { EnemyKind, HeroKind, LifetimeStats, TowerKind } from '../core/types';
import type { Loadout, OwnedItem } from '../core/equipment';
import { defaultLootQueue, sanitizeLootQueue } from '../core/lootQueue';
import type { LootQueueState } from '../core/lootQueue';
import type { PendingContainer } from '../state/lootbox';
import { defaultPrestige } from '../core/prestige';
import type { PrestigeState } from '../core/prestige';

export interface SaveData {
  shards: number;
  upgrades: Record<string, number>; // upgradeId -> level
  bestWave: number;
  totalRuns: number;
  lifetimeShards: number;
  cardsSeen: number;
  // ── Tower progression (per kind) — added in schema v2 ──
  towerShards: Record<TowerKind, number>; // shard currency, earned from chests
  towerStars: Record<TowerKind, number>; // star upgrade level (0 = base)
  towerForks: Record<TowerKind, Record<string, string>>; // per-tower star-fork picks (star → optionId)
  towerMasteryXp: Record<TowerKind, number>; // lifetime mastery XP (grows forever)
  towerKills: Record<TowerKind, number>; // lifetime kills per tower (schema v9) — Tower Lab
  heroShards: Record<string, number>; // per-hero shards (earned from chests)
  // ── Hero progression + roster (per kind) — added in schema v3 ──
  heroStars: Record<HeroKind, number>; // hero star level (0 = base)
  heroMasteryXp: Record<HeroKind, number>; // lifetime hero mastery XP (grows forever)
  selectedHero: HeroKind; // slot-1 hero (back-compat mirror of heroLoadout[0]); see meta.setSelectedHero
  // ── Hero Slot roster (HEROES.md) — the heroes fielded per slot; index i = slot i+1. Length grows
  //    with unlocked slots (heroSlotsUnlocked). Clamped to unlocked slots + distinct kinds at run
  //    start. Migrated from selectedHero for pre-slot saves. ──
  heroLoadout: HeroKind[];
  // ── Per-hero lifetime ownership stats (schema v9) — drive the Hero Lab detail page ──
  heroKills: Record<HeroKind, number>; // lifetime kills BY each hero (accrued for the fielded hero)
  heroFavEquip: Record<HeroKind, Record<string, number>>; // per-hero equip-usage counts (defId → runs); argmax = favorite
  // ── Lifetime statistics + achievements — added in schema v3 ──
  stats: LifetimeStats;
  achievements: string[]; // unlocked achievement ids
  // ── Hero equipment (schema v3; PER-HERO loadouts as of v12) ──
  // Each hero keeps its OWN weapon/armor/relic (HEROES.md hero slots). A uid is a single physical
  // item ⇒ it lives in at most one hero's loadout. Absent hero key ⇒ that hero has no gear equipped.
  equipment: { inventory: OwnedItem[]; loadouts: Partial<Record<HeroKind, Loadout>> };
  mats: { mutagen: number; scrap: number; catalyst: number }; // crafting / reroll currencies
  // ── Loot queue (schema v4) — pre-determined boxes + pity, filled by run progress ──
  lootQueue: LootQueueState;
  // ── Pending bio-containers (schema v8) — completed-but-UNOPENED containers (loot boxes +
  //    the run-end cache). Runs bank them here; the player cracks them in the Genetic Vault. ──
  pendingContainers: PendingContainer[];
  // ── Tower star-fork picks (schema v5) — per-run evolution choices, persisted ──
  // (towerForks is declared above with the other tower-progression records.)
  // ── Mastery identity (schema v6) — earned titles/lore + the worn title ──
  unlockedTitles: string[]; // reward ids of unlocked mastery titles
  equippedTitle: string | null; // the title shown on the player profile (null = none)
  unlockedLore: string[]; // reward ids of unlocked lore (codex)
  // ── Collection: framework-boss chassis archetypes ever slain (drives the Bestiary's boss
  //    codex). Recorded from the bossKilled event; additive (withDefaults fills [] for old saves). ──
  bossesSlain: string[];
  // ── Prestige (schema v7) — MOLT: Ascendant Cells + the permanent P-bucket multiplier ──
  prestige: PrestigeState;
  // ── Campaign progression (schema v10) — highest stage CLEARED per difficulty id (0 = none).
  //    Stage N is unlocked when N ≤ cleared[diff] + 1; cleared stages are replayable. Per-difficulty
  //    so new DifficultyDef variants get their own track for free (CAMPAIGN.md §7). ──
  campaign: { cleared: Record<string, number> };
}

export const CURRENT_VERSION = 12; // v11→v12: PER-HERO equipment loadouts — migrated from the shared loadout
const SAVE_KEY = 'assimilate.save';
const BAK_PREFIX = 'assimilate.save.bak.';
const BAK_INDEX = 'assimilate.save.baklist';
const MAX_BACKUPS = 8;

interface SaveBlob {
  schemaVersion: number;
  data: unknown;
  checksum: string;
}

export interface BackupMeta {
  id: string;
  at: string; // ISO timestamp
}

export type ImportResult = { ok: true; data: SaveData } | { ok: false; error: string };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function zeroByTower(): Record<TowerKind, number> {
  const r = {} as Record<TowerKind, number>;
  for (const k of TOWER_ORDER) r[k] = 0;
  return r;
}
function emptyForksByTower(): Record<TowerKind, Record<string, string>> {
  const r = {} as Record<TowerKind, Record<string, string>>;
  for (const k of TOWER_ORDER) r[k] = {};
  return r;
}
function zeroByHero(): Record<string, number> {
  const r: Record<string, number> = {};
  for (const id of HERO_IDS) r[id] = 0;
  return r;
}
function zeroByHeroKind(): Record<HeroKind, number> {
  const r = {} as Record<HeroKind, number>;
  for (const k of HERO_ORDER) r[k] = 0;
  return r;
}
function emptyFavByHero(): Record<HeroKind, Record<string, number>> {
  const r = {} as Record<HeroKind, Record<string, number>>;
  for (const k of HERO_ORDER) r[k] = {};
  return r;
}
function zeroByEnemy(): Record<EnemyKind, number> {
  const r = {} as Record<EnemyKind, number>;
  for (const k of ENEMY_KINDS) r[k] = 0;
  return r;
}

/** A zeroed lifetime-stats block — the v3 default and the merge base for old saves. */
export function defaultLifetimeStats(): LifetimeStats {
  return {
    lifetimeKills: 0,
    highestWave: 0,
    totalBiomass: 0,
    totalDamage: 0,
    runsCompleted: 0,
    runsFailed: 0,
    cardsDrafted: 0,
    uniqueCards: [],
    killsByEnemy: zeroByEnemy(),
    towerUsage: zeroByTower(),
    heroUsage: zeroByHero(),
  };
}

export function defaultSave(): SaveData {
  return {
    shards: 0,
    upgrades: {},
    bestWave: 0,
    totalRuns: 0,
    lifetimeShards: 0,
    cardsSeen: 0,
    towerShards: zeroByTower(),
    towerStars: zeroByTower(),
    towerForks: emptyForksByTower(),
    towerMasteryXp: zeroByTower(),
    towerKills: zeroByTower(),
    heroShards: zeroByHero(),
    heroStars: zeroByHeroKind(),
    heroMasteryXp: zeroByHeroKind(),
    selectedHero: 'ravager',
    heroLoadout: ['ravager'],
    heroKills: zeroByHeroKind(),
    heroFavEquip: emptyFavByHero(),
    stats: defaultLifetimeStats(),
    achievements: [],
    equipment: { inventory: [], loadouts: {} },
    mats: { mutagen: 0, scrap: 0, catalyst: 0 },
    lootQueue: defaultLootQueue(),
    pendingContainers: [],
    unlockedTitles: [],
    equippedTitle: null,
    unlockedLore: [],
    bossesSlain: [],
    prestige: defaultPrestige(),
    campaign: { cleared: {} },
  };
}

/**
 * Merge a validated (possibly older / partial) save onto a complete default —
 * filling any missing top-level field AND deep-merging the per-kind progression
 * records so every tower/hero key is present. This is the v1→v2 upgrade path:
 * a pre-progression save simply gains zeroed records.
 */
function withDefaults(data: SaveData): SaveData {
  const d = defaultSave();
  return {
    ...d,
    ...data,
    upgrades: { ...data.upgrades },
    towerShards: { ...d.towerShards, ...data.towerShards },
    towerStars: { ...d.towerStars, ...data.towerStars },
    // v4→v5: per-tower fork picks fill empty for a pre-v5 save (⇒ each fork defaults to its
    // first option). Shallow-merge keeps known towers' picks and defaults the rest.
    towerForks: { ...d.towerForks, ...(data.towerForks && typeof data.towerForks === 'object' ? data.towerForks : {}) },
    towerMasteryXp: { ...d.towerMasteryXp, ...data.towerMasteryXp },
    towerKills: { ...d.towerKills, ...data.towerKills }, // v8→v9: additive, zeroed for old saves
    heroShards: { ...d.heroShards, ...data.heroShards },
    heroStars: { ...d.heroStars, ...data.heroStars },
    heroMasteryXp: { ...d.heroMasteryXp, ...data.heroMasteryXp },
    // v8→v9: per-hero ownership stats. Zeroed/empty for a pre-v9 save (deep-filled per hero).
    heroKills: { ...d.heroKills, ...data.heroKills },
    heroFavEquip: { ...d.heroFavEquip, ...(data.heroFavEquip && typeof data.heroFavEquip === 'object' ? data.heroFavEquip : {}) },
    // Resolve the fielded hero through the registry (honors aliases for renamed ids)
    // and fall back to the default if it's unknown — a corrupt/removed id can't crash.
    selectedHero: (heroRegistry.resolve(data.selectedHero) as HeroKind | undefined) ?? d.selectedHero,
    // Hero Slot roster (HEROES.md): resolve each entry through the registry (honors aliases),
    // dedupe, and drop junk. A pre-slot save (no heroLoadout) seeds from the migrated selectedHero
    // so slot 1 carries over unchanged — additive, no data loss.
    heroLoadout: sanitizeLoadout(data.heroLoadout, (heroRegistry.resolve(data.selectedHero) as HeroKind | undefined) ?? d.selectedHero),
    stats: mergeStats(d.stats, data.stats),
    achievements: Array.isArray(data.achievements) ? data.achievements : d.achievements,
    equipment: {
      inventory: Array.isArray(data.equipment?.inventory) ? data.equipment.inventory : [],
      // v11→v12: PER-HERO loadouts. A pre-v12 save has one shared `loadout` → migrate it onto the
      // slot-1 hero (its selectedHero) so equipped gear carries over. Sanitized so a uid lives on
      // only ONE hero (a single physical item).
      loadouts: sanitizeLoadouts(data.equipment, (heroRegistry.resolve(data.selectedHero) as HeroKind | undefined) ?? d.selectedHero),
    },
    mats: { ...d.mats, ...data.mats },
    // v3→v4: a pre-v4 save has no queue — sanitize fills a fresh, pre-determined one;
    // an existing queue is validated (unknown rarities dropped, pity/depth rebuilt).
    lootQueue: sanitizeLootQueue(data.lootQueue),
    // v8: pending unopened containers. Empty for a pre-v8 save; coerce each entry (an early
    // v8 stored bare rarity strings → loot boxes) and cap against a hostile blob.
    pendingContainers: Array.isArray(data.pendingContainers)
      ? data.pendingContainers
          .map((x): PendingContainer | null => {
            if (typeof x === 'string') return { kind: 'loot', rarity: x }; // early-v8 string → loot box
            if (x && typeof x === 'object') {
              const o = x as { kind?: unknown; rarity?: unknown; chestId?: unknown };
              if (o.kind === 'loot' && typeof o.rarity === 'string') return { kind: 'loot', rarity: o.rarity };
              if (o.kind === 'cache' && typeof o.chestId === 'string') return { kind: 'cache', chestId: o.chestId };
            }
            return null;
          })
          .filter((c): c is PendingContainer => c !== null)
          .slice(0, 999)
      : [],
    // v5→v6: mastery identity. Empty for a pre-v6 save; arrays guarded against junk.
    unlockedTitles: Array.isArray(data.unlockedTitles) ? data.unlockedTitles : [],
    equippedTitle: typeof data.equippedTitle === 'string' ? data.equippedTitle : null,
    unlockedLore: Array.isArray(data.unlockedLore) ? data.unlockedLore : [],
    bossesSlain: Array.isArray(data.bossesSlain) ? data.bossesSlain : [],
    // v6→v7: prestige (MOLT). Zeroed for a pre-v7 save; each field guarded against junk.
    prestige: { ...d.prestige, ...sanitizePrestige(data.prestige) },
    // v9→v10: campaign progression. Empty for an old save; coerce the cleared map to finite ≥0 ints.
    campaign: { cleared: sanitizeCleared(data.campaign?.cleared) },
  };
}

/** Coerce loaded equipment into PER-HERO loadouts (v12). Resolves hero aliases and guarantees a uid
 *  is equipped on at most one hero. Migrates a legacy single `loadout` onto `slot1`. */
function sanitizeLoadouts(equip: unknown, slot1: HeroKind): Partial<Record<HeroKind, Loadout>> {
  const out: Partial<Record<HeroKind, Loadout>> = {};
  const used = new Set<string>(); // a physical item lives on only ONE hero
  const take = (raw: unknown): Loadout => {
    const l = (raw && typeof raw === 'object' ? raw : {}) as Partial<Loadout>;
    const pick = (v: unknown): string | null => (typeof v === 'string' && !used.has(v) ? (used.add(v), v) : null);
    return { weapon: pick(l.weapon), armor: pick(l.armor), relic: pick(l.relic) };
  };
  const e = equip as { loadouts?: Record<string, unknown>; loadout?: unknown } | undefined;
  if (e?.loadouts && typeof e.loadouts === 'object') {
    for (const [k, v] of Object.entries(e.loadouts)) {
      const kind = heroRegistry.resolve(k) as HeroKind | undefined;
      if (kind) out[kind] = take(v);
    }
  } else if (e?.loadout) {
    out[slot1] = take(e.loadout); // legacy single loadout → the slot-1 hero
  }
  return out;
}

/** Coerce a loaded hero-loadout array into known, DISTINCT hero kinds (aliases resolved).
 *  Empty / all-junk → the fallback (slot-1) hero, so a run always has at least one hero. */
function sanitizeLoadout(raw: unknown, fallback: HeroKind): HeroKind[] {
  const out: HeroKind[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const k = heroRegistry.resolve(typeof x === 'string' ? x : '') as HeroKind | undefined;
      if (k && !seen.has(k)) { out.push(k); seen.add(k); }
    }
  }
  if (out.length === 0) out.push(fallback);
  return out;
}

/** Coerce a loaded campaign `cleared` map into clean non-negative integers (drops junk). */
function sanitizeCleared(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
    }
  }
  return out;
}

/** Coerce a loaded prestige blob into clean non-negative numbers (drops junk fields). */
function sanitizePrestige(p: PrestigeState | undefined): Partial<PrestigeState> {
  if (!p || typeof p !== 'object') return {};
  const num = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : undefined);
  const out: Partial<PrestigeState> = {};
  if (num(p.cells) !== undefined) out.cells = p.cells;
  if (num(p.lifetimeCells) !== undefined) out.lifetimeCells = p.lifetimeCells;
  if (num(p.cycleShards) !== undefined) out.cycleShards = p.cycleShards;
  if (num(p.molts) !== undefined) out.molts = p.molts;
  // Ascendant Tree node levels: keep only finite non-negative integer levels.
  if (p.nodes && typeof p.nodes === 'object') {
    const nodes: Record<string, number> = {};
    for (const [k, v] of Object.entries(p.nodes)) if (num(v) !== undefined) nodes[k] = Math.floor(v as number);
    out.nodes = nodes;
  }
  return out;
}

/** Fill a (possibly absent / partial) stats block onto the zeroed default — the
 * v2→v3 upgrade path: a pre-stats save simply gains a zeroed stats block. */
function mergeStats(base: LifetimeStats, s: LifetimeStats | undefined): LifetimeStats {
  if (!s || typeof s !== 'object') return base;
  return {
    ...base,
    ...s,
    uniqueCards: Array.isArray(s.uniqueCards) ? s.uniqueCards : base.uniqueCards,
    killsByEnemy: { ...base.killsByEnemy, ...s.killsByEnemy },
    towerUsage: { ...base.towerUsage, ...s.towerUsage },
    heroUsage: { ...base.heroUsage, ...s.heroUsage },
  };
}

/** Small, stable, non-cryptographic hash (djb2) for integrity detection. */
function checksum(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function isSaveData(v: unknown): v is SaveData {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.shards === 'number' &&
    typeof o.upgrades === 'object' &&
    o.upgrades !== null &&
    typeof o.bestWave === 'number' &&
    typeof o.totalRuns === 'number' &&
    typeof o.lifetimeShards === 'number' &&
    typeof o.cardsSeen === 'number'
  );
}

/** Ordered migrations v(n) -> v(n+1). Append-only; never remove old steps. */
function migrate(_version: number, data: unknown): unknown {
  // v1→v2 (tower progression), v2→v3 (hero progression + roster, lifetime stats +
  // achievements), v3→v4 (loot queue), v4→v5 (tower star-fork picks), and v5→v6 (mastery
  // identity: titles/lore) — plus v8→v9 (per-tower lifetime kills) and v9→v10 (campaign progression) — are all additive: withDefaults() deep-fills the new records, the
  // selectedHero default, the stats block, the loot queue, the fork picks, the mastery
  // identity arrays, and the prestige block (v6→v7; v7→v8 adds the Ascendant Tree node map,
  // deep-filled by sanitizePrestige). v8→v9 adds per-hero kills + favorite-equipment, deep-filled
  // by withDefaults. Structural changes add steps here.
  return data;
}

function blobString(data: SaveData): string {
  const body = JSON.stringify(data);
  const blob: SaveBlob = { schemaVersion: CURRENT_VERSION, data, checksum: checksum(body) };
  return JSON.stringify(blob);
}

/** Parse a stored blob string into validated SaveData, or null if invalid/corrupt. */
function parseBlob(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const blob = JSON.parse(raw) as SaveBlob;
    if (typeof blob.schemaVersion !== 'number' || typeof blob.checksum !== 'string') return null;
    if (checksum(JSON.stringify(blob.data)) !== blob.checksum) return null; // tamper/corruption
    const migrated = migrate(blob.schemaVersion, blob.data);
    if (!isSaveData(migrated)) return null;
    return withDefaults(migrated);
  } catch {
    return null;
  }
}

// ── Export / import (pure; usable without a SaveStore, e.g. in tests) ────────

interface SaveExport {
  app: 'ASSIMILATE';
  kind: 'save-export';
  schemaVersion: number;
  exportedAt: string;
  data: SaveData;
  checksum: string;
}

export function serializeExport(data: SaveData): string {
  const exp: SaveExport = {
    app: 'ASSIMILATE',
    kind: 'save-export',
    schemaVersion: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
    checksum: checksum(JSON.stringify(data)),
  };
  return JSON.stringify(exp, null, 2);
}

/** Lenient import: accepts an export wrapper, a raw blob, or a bare SaveData object.
 * Hand-edited files are fine — the checksum is recomputed on save, not enforced here. */
export function parseImport(text: string): ImportResult {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }
  if (typeof obj !== 'object' || obj === null) return { ok: false, error: 'File is not a save object.' };
  const o = obj as Record<string, unknown>;
  const version = typeof o.schemaVersion === 'number' ? o.schemaVersion : CURRENT_VERSION;
  const raw = 'data' in o ? o.data : o; // wrapper/blob -> .data, else the object itself
  const migrated = migrate(version, raw);
  if (!isSaveData(migrated)) return { ok: false, error: 'File does not contain a recognizable save.' };
  return { ok: true, data: withDefaults(migrated) };
}

function memoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, val) => void m.set(k, val),
    removeItem: (k) => void m.delete(k),
  };
}

export class SaveStore {
  private storage: StorageLike;
  private bakSeq = 0;

  constructor(storage?: StorageLike) {
    this.storage =
      storage ??
      (typeof localStorage !== 'undefined' ? (localStorage as StorageLike) : memoryStorage());
  }

  private get(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  private set(key: string, value: string): void {
    try {
      this.storage.setItem(key, value);
    } catch {
      /* storage full/unavailable — fail soft */
    }
  }

  /** Load the main save; recover from the newest valid backup, else clean defaults. */
  load(): SaveData {
    const main = parseBlob(this.get(SAVE_KEY));
    if (main) return main;
    for (const b of this.listBackups()) {
      const recovered = parseBlob(this.get(BAK_PREFIX + b.id));
      if (recovered) return recovered;
    }
    return defaultSave();
  }

  save(data: SaveData): void {
    this.set(SAVE_KEY, blobString(data));
  }

  /** Snapshot the current main save into the rolling backup ring. */
  backup(): BackupMeta | null {
    const raw = this.get(SAVE_KEY);
    if (!raw) return null;
    const meta: BackupMeta = {
      id: `${Date.now().toString(36)}-${(this.bakSeq++).toString(36)}`,
      at: new Date().toISOString(),
    };
    this.set(BAK_PREFIX + meta.id, raw);
    const list = [meta, ...this.listBackups()].slice(0, MAX_BACKUPS);
    // prune dropped backups
    const kept = new Set(list.map((b) => b.id));
    for (const old of this.listBackups()) {
      if (!kept.has(old.id)) this.remove(BAK_PREFIX + old.id);
    }
    this.set(BAK_INDEX, JSON.stringify(list));
    return meta;
  }

  listBackups(): BackupMeta[] {
    try {
      const raw = this.get(BAK_INDEX);
      if (!raw) return [];
      const list = JSON.parse(raw) as BackupMeta[];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  restoreBackup(id: string): SaveData | null {
    const data = parseBlob(this.get(BAK_PREFIX + id));
    if (!data) return null;
    this.save(data);
    return data;
  }

  /** Wipe the main save (does NOT touch backups). */
  reset(): void {
    this.remove(SAVE_KEY);
  }

  /** Developer Reset "EVERYTHING" (docs/DEV-RESET.md §3): remove the main save, EVERY backup, and
   *  the backup index — a clean slate in this store's keyspace. (Prefs/flags are wiped by meta.) */
  wipeAll(): void {
    for (const b of this.listBackups()) this.remove(BAK_PREFIX + b.id);
    this.remove(BAK_INDEX);
    this.remove(SAVE_KEY);
  }

  private remove(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

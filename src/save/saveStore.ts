// Browser-local persistence + save management (ARCHITECTURE.md §15). Versioned +
// checksummed blob, a migration pipeline, rolling backups, JSON export/import, and
// layered non-destructive recovery: a corrupt save falls back to an automatic
// last-known-good snapshot, then the newest valid manual backup, then defaults —
// never crashing, never silently overwriting good data. Every load/import is
// range-normalized so out-of-bounds values can't reach progression, and writes
// are quota-aware (prune oldest backup + retry, then verify the round-trip).
// Storage is injectable so the core is testable headlessly; the browser uses
// localStorage. No DOM/file APIs here (those live in saveFile.ts).

export interface SaveData {
  shards: number;
  upgrades: Record<string, number>; // upgradeId -> level
  bestWave: number;
  totalRuns: number;
  lifetimeShards: number;
  cardsSeen: number;
  // mode progression (added later — backfilled to 0 for old saves by normalizeSave)
  stagesCleared: number;
  bestStage: number;
  bestEndlessScore: number;
  bestEndlessWave: number;
}

export const CURRENT_VERSION = 1;
const SAVE_KEY = 'assimilate.save';
const LAST_GOOD_KEY = 'assimilate.save.lastgood'; // one-deep automatic safety net
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

export function defaultSave(): SaveData {
  return {
    shards: 0, upgrades: {}, bestWave: 0, totalRuns: 0, lifetimeShards: 0, cardsSeen: 0,
    stagesCleared: 0, bestStage: 0, bestEndlessScore: 0, bestEndlessWave: 0,
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

// ── Sanitization ────────────────────────────────────────────────────────────
// A save that passes the type gate can still carry out-of-range values (a hand-
// edited file, a partial write, or JSON.parse turning "1e999" into Infinity).
// normalizeSave coerces every field to a finite, non-negative integer so bad
// data can never reach progression. It is a no-op for already-valid saves, so
// real player progress is never altered.
function nonNegInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function normalizeUpgrades(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      // Keep unknown ids (forward-compat) as long as the level is sane.
      if (typeof val === 'number' && Number.isFinite(val) && val > 0) out[k] = Math.floor(val);
    }
  }
  return out;
}

/** Build a clean SaveData from arbitrary (validated-shape) input — clamps ranges,
 *  drops junk keys, fills missing fields from defaults. */
export function normalizeSave(raw: unknown): SaveData {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    shards: nonNegInt(o.shards),
    upgrades: normalizeUpgrades(o.upgrades),
    bestWave: nonNegInt(o.bestWave),
    totalRuns: nonNegInt(o.totalRuns),
    lifetimeShards: nonNegInt(o.lifetimeShards),
    cardsSeen: nonNegInt(o.cardsSeen),
    stagesCleared: nonNegInt(o.stagesCleared),
    bestStage: nonNegInt(o.bestStage),
    bestEndlessScore: nonNegInt(o.bestEndlessScore),
    bestEndlessWave: nonNegInt(o.bestEndlessWave),
  };
}

/** Ordered migrations v(n) -> v(n+1). Append-only; never remove old steps. */
function migrate(_version: number, data: unknown): unknown {
  // No historical versions yet. Future shape changes add steps here, e.g.:
  //   if (v < 2) { data = toV2(data); v = 2; }
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
    return normalizeSave(migrated);
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
  return { ok: true, data: normalizeSave(migrated) };
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

  private set(key: string, value: string): boolean {
    try {
      this.storage.setItem(key, value);
      return true;
    } catch {
      // Likely a quota error — reclaim space by dropping the oldest backup and
      // retry once so the live save still lands rather than failing silently.
      if (this.pruneOldestBackup()) {
        try {
          this.storage.setItem(key, value);
          return true;
        } catch {
          /* still failing — fall through */
        }
      }
      return false;
    }
  }

  /** Drop the single oldest backup (best-effort) to free storage. */
  private pruneOldestBackup(): boolean {
    const list = this.listBackups(); // newest-first
    if (list.length === 0) return false;
    const oldest = list[list.length - 1];
    this.remove(BAK_PREFIX + oldest.id);
    try {
      this.storage.setItem(BAK_INDEX, JSON.stringify(list.slice(0, -1)));
    } catch {
      /* index update failed — the orphaned entry is already removed */
    }
    return true;
  }

  /** Load the main save; on corruption fall back to the automatic last-known-good,
   *  then the newest valid manual backup, then clean defaults — never throwing. */
  load(): SaveData {
    const main = parseBlob(this.get(SAVE_KEY));
    if (main) return main;
    const lastGood = parseBlob(this.get(LAST_GOOD_KEY));
    if (lastGood) return lastGood;
    for (const b of this.listBackups()) {
      const recovered = parseBlob(this.get(BAK_PREFIX + b.id));
      if (recovered) return recovered;
    }
    return defaultSave();
  }

  /** Persist the main save. Snapshots the prior valid save to the automatic
   *  last-known-good slot first, then writes and verifies the new blob round-trips.
   *  Returns false if the write could not be confirmed (e.g. storage full). */
  save(data: SaveData): boolean {
    const blob = blobString(data);
    const prev = this.get(SAVE_KEY);
    // Keep the previous good state recoverable before we overwrite it, so a single
    // bad write is survivable even when the player never made a manual backup.
    if (prev && prev !== blob && parseBlob(prev)) this.set(LAST_GOOD_KEY, prev);
    if (!this.set(SAVE_KEY, blob)) return false;
    return parseBlob(this.get(SAVE_KEY)) !== null; // confirm it wasn't truncated/garbled
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

  /** Wipe the main save and its automatic safety net (does NOT touch manual
   *  backups). Clearing last-known-good is required so the wipe can't be undone
   *  by an automatic recovery on the next load. */
  reset(): void {
    this.remove(SAVE_KEY);
    this.remove(LAST_GOOD_KEY);
  }

  private remove(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

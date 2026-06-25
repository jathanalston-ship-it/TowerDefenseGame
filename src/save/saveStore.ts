// Browser-local persistence (ARCHITECTURE.md §15). Versioned + checksummed blob,
// a migration pipeline, and non-destructive recovery (a corrupt/invalid save never
// overwrites a good one — it falls back to defaults). Storage is injectable so the
// core is testable headlessly; in the browser it uses localStorage.

export interface SaveData {
  shards: number;
  upgrades: Record<string, number>; // upgradeId -> level
  bestWave: number;
  totalRuns: number;
  lifetimeShards: number;
  cardsSeen: number;
}

export const CURRENT_VERSION = 1;
const SAVE_KEY = 'assimilate.save';

interface SaveBlob {
  schemaVersion: number;
  data: unknown;
  checksum: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function defaultSave(): SaveData {
  return {
    shards: 0,
    upgrades: {},
    bestWave: 0,
    totalRuns: 0,
    lifetimeShards: 0,
    cardsSeen: 0,
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
  // No historical versions yet. Future shape changes add steps here, e.g.:
  //   if (v < 2) { data = toV2(data); v = 2; }
  return data;
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

  constructor(storage?: StorageLike) {
    this.storage =
      storage ??
      (typeof localStorage !== 'undefined' ? (localStorage as StorageLike) : memoryStorage());
  }

  load(): SaveData {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(SAVE_KEY);
    } catch {
      return defaultSave();
    }
    if (!raw) return defaultSave();
    try {
      const blob = JSON.parse(raw) as SaveBlob;
      if (typeof blob.schemaVersion !== 'number' || typeof blob.checksum !== 'string') {
        return defaultSave();
      }
      const body = JSON.stringify(blob.data);
      if (checksum(body) !== blob.checksum) return defaultSave(); // corruption → recover
      const migrated = migrate(blob.schemaVersion, blob.data);
      if (!isSaveData(migrated)) return defaultSave();
      // fill any missing keys defensively
      return { ...defaultSave(), ...migrated };
    } catch {
      return defaultSave(); // never overwrite; just fall back
    }
  }

  save(data: SaveData): void {
    const body = JSON.stringify(data);
    const blob: SaveBlob = {
      schemaVersion: CURRENT_VERSION,
      data,
      checksum: checksum(body),
    };
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(blob));
    } catch {
      // storage full / unavailable — fail soft (game still playable this session)
    }
  }

  reset(): void {
    try {
      this.storage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }
}

import { describe, it, expect } from 'vitest';
import {
  SaveStore,
  defaultSave,
  normalizeSave,
  parseImport,
  serializeExport,
  fieldOp,
  getMigrationLog,
  clearMigrationLog,
  CURRENT_VERSION,
} from './saveStore';
import type { SaveData, StorageLike } from './saveStore';

function mem(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe('SaveStore', () => {
  it('round-trips data', () => {
    const store = new SaveStore(mem());
    const data: SaveData = { ...defaultSave(), shards: 123, bestWave: 7, upgrades: { lethality: 3 } };
    store.save(data);
    const loaded = store.load();
    expect(loaded.shards).toBe(123);
    expect(loaded.bestWave).toBe(7);
    expect(loaded.upgrades.lethality).toBe(3);
  });

  it('returns defaults when empty', () => {
    expect(new SaveStore(mem()).load()).toEqual(defaultSave());
  });

  it('recovers to defaults from invalid JSON without throwing', () => {
    const s = mem();
    s.map.set('assimilate.save', '{not valid json');
    expect(new SaveStore(s).load()).toEqual(defaultSave());
  });

  it('recovers from a tampered checksum by falling back (no valid backup -> defaults)', () => {
    const s = mem();
    const store = new SaveStore(s);
    store.save({ ...defaultSave(), shards: 50 });
    const raw = JSON.parse(s.map.get('assimilate.save')!);
    raw.data.shards = 999999; // tamper with the body, leave checksum stale
    s.map.set('assimilate.save', JSON.stringify(raw));
    expect(store.load()).toEqual(defaultSave());
  });
});

describe('save export / import', () => {
  it('round-trips through serializeExport -> parseImport', () => {
    const data: SaveData = { ...defaultSave(), shards: 321, bestWave: 9, upgrades: { apex: 4 } };
    const r = parseImport(serializeExport(data));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual(data);
  });

  it('accepts a bare, hand-edited SaveData object', () => {
    const r = parseImport(JSON.stringify({ ...defaultSave(), shards: 7 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.shards).toBe(7);
  });

  it('rejects garbage without throwing', () => {
    expect(parseImport('not json').ok).toBe(false);
    expect(parseImport('{"nope":true}').ok).toBe(false);
  });
});

describe('backups & corruption recovery', () => {
  it('backs up and restores a snapshot', () => {
    const store = new SaveStore(mem());
    store.save({ ...defaultSave(), shards: 100 });
    const b = store.backup();
    expect(b).not.toBeNull();
    store.save({ ...defaultSave(), shards: 0 }); // overwrite
    const restored = store.restoreBackup(b!.id);
    expect(restored?.shards).toBe(100);
    expect(store.load().shards).toBe(100);
  });

  it('recovers from a corrupt main save using the newest valid backup', () => {
    const s = mem();
    const store = new SaveStore(s);
    store.save({ ...defaultSave(), shards: 250 });
    store.backup(); // snapshot the good state
    s.map.set('assimilate.save', '{corrupt'); // main save goes bad
    expect(store.load().shards).toBe(250); // recovered from backup, not defaults
  });

  it('keeps backups capped', () => {
    const store = new SaveStore(mem());
    for (let i = 0; i < 12; i++) {
      store.save({ ...defaultSave(), shards: i });
      store.backup();
    }
    expect(store.listBackups().length).toBeLessThanOrEqual(8);
  });

  it('recovers a corrupt main from the automatic last-known-good (no manual backup)', () => {
    const s = mem();
    const store = new SaveStore(s);
    store.save({ ...defaultSave(), shards: 10 }); // first write: nothing to snapshot yet
    store.save({ ...defaultSave(), shards: 20 }); // prior (10) snapshotted to last-known-good
    s.map.set('assimilate.save', '{corrupt'); // main goes bad, no backup() ever called
    expect(store.load().shards).toBe(10); // recovered automatically, not reset to defaults
  });

  it('reset clears the safety net so the wipe is not auto-undone', () => {
    const s = mem();
    const store = new SaveStore(s);
    store.save({ ...defaultSave(), shards: 10 });
    store.save({ ...defaultSave(), shards: 20 }); // populates last-known-good
    store.reset();
    expect(store.load()).toEqual(defaultSave());
  });
});

describe('save normalization (resilience to bad data)', () => {
  it('clamps non-finite / negative / fractional values to non-negative ints', () => {
    const dirty = {
      shards: Infinity,
      bestWave: -3,
      totalRuns: 2.9,
      lifetimeShards: NaN,
      cardsSeen: 5,
      upgrades: { lethality: 4.7, bad: -1, junk: 'x' },
    };
    const n = normalizeSave(dirty as unknown);
    expect(n.shards).toBe(0); // Infinity -> 0
    expect(n.bestWave).toBe(0); // negative -> 0
    expect(n.totalRuns).toBe(2); // 2.9 -> 2
    expect(n.lifetimeShards).toBe(0); // NaN -> 0
    expect(n.cardsSeen).toBe(5);
    expect(n.upgrades.lethality).toBe(4); // 4.7 -> 4
    expect('bad' in n.upgrades).toBe(false); // negative dropped
    expect('junk' in n.upgrades).toBe(false); // non-number dropped
  });

  it('leaves a valid save unchanged (never alters real progression)', () => {
    const good: SaveData = { ...defaultSave(), shards: 123, bestWave: 7, upgrades: { lethality: 3 } };
    expect(normalizeSave(good)).toEqual(good);
  });

  it('loads a pre-stage-mode save and backfills the new mode fields', () => {
    // An old save predates stagesCleared/bestStage/bestEndless* — it must still
    // load (it passes the type gate) with the new fields defaulted to 0.
    const old = { shards: 42, upgrades: { lethality: 2 }, bestWave: 5, totalRuns: 3, lifetimeShards: 99, cardsSeen: 0 };
    const r = parseImport(JSON.stringify(old));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.shards).toBe(42);
      expect(r.data.bestWave).toBe(5);
      expect(r.data.stagesCleared).toBe(0);
      expect(r.data.bestStage).toBe(0);
      expect(r.data.bestEndlessScore).toBe(0);
      expect(r.data.bestEndlessWave).toBe(0);
    }
  });

  it('sanitizes out-of-range values injected via import', () => {
    // Negatives survive JSON (unlike Infinity/NaN, which become null and are
    // rejected by the type gate) — so they exercise import-time normalization.
    const r = parseImport(JSON.stringify({ ...defaultSave(), shards: -50, bestWave: 3.8 }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.shards).toBe(0); // negative clamped
      expect(r.data.bestWave).toBe(3); // fractional floored
    }
  });
});

describe('save version migration', () => {
  it('migrates an explicit v1 save up to current, preserving values + adding new fields', () => {
    clearMigrationLog();
    const v1 = { schemaVersion: 1, data: { shards: 42, upgrades: { lethality: 2 }, bestWave: 5, totalRuns: 3, lifetimeShards: 99, cardsSeen: 0 } };
    const r = parseImport(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.shards).toBe(42); // original value preserved
      expect(r.data.essence).toBe(0); // v2 additions, defaulted
      expect(r.data.catalyst).toBe(0);
      expect(r.data.codex).toEqual({ enemies: [], biomes: [], cards: [] });
      expect(r.data.achievements).toEqual([]);
      expect(r.data.title).toBe('');
    }
    const applied = getMigrationLog().find((e) => e.from === 1 && e.to === 2);
    expect(applied).toBeTruthy();
    expect(applied!.changes.length).toBeGreaterThan(0); // it actually added fields
  });

  it('migrates a v2 save up to v3, adding the loot-meter fields', () => {
    clearMigrationLog();
    const v2 = {
      schemaVersion: 2,
      data: {
        shards: 10, upgrades: {}, bestWave: 4, totalRuns: 2, lifetimeShards: 10, cardsSeen: 0,
        stagesCleared: 0, bestStage: 0, bestEndlessScore: 0, bestEndlessWave: 0,
        essence: 0, components: 0, catalyst: 0, codex: { enemies: [], biomes: [], cards: [] }, achievements: [], title: '',
      },
    };
    const r = parseImport(JSON.stringify(v2));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.bestWave).toBe(4); // preserved
      expect(r.data.lootMeter).toBe(0); // v3 additions
      expect(r.data.lootBoxes).toBe(0);
      expect(r.data.lootBoxesLifetime).toBe(0);
    }
    expect(getMigrationLog().some((e) => e.from === 2 && e.to === 3)).toBe(true);
  });

  it('does not re-run a migration on an already-current save', () => {
    clearMigrationLog();
    // serializeExport tags the blob with CURRENT_VERSION, so no step is newer.
    const r = parseImport(serializeExport(defaultSave()));
    expect(r.ok).toBe(true);
    expect(getMigrationLog().length).toBe(0); // nothing newer than current ran
  });

  it('field ops add / drop / rename declaratively and idempotently', () => {
    const d: Record<string, unknown> = { a: 1, old: 'x' };
    expect(fieldOp.add(d, 'b', 2)).toBe('+b');
    expect(d.b).toBe(2);
    expect(fieldOp.add(d, 'a', 99)).toBeNull(); // present → no-op
    expect(d.a).toBe(1); // value untouched
    expect(fieldOp.rename(d, 'old', 'new')).toBe('old→new');
    expect(d.new).toBe('x');
    expect('old' in d).toBe(false);
    expect(fieldOp.rename(d, 'old', 'new')).toBeNull(); // idempotent once renamed
    expect(fieldOp.drop(d, 'b')).toBe('-b');
    expect('b' in d).toBe(false);
    expect(fieldOp.drop(d, 'b')).toBeNull(); // already gone
  });

  it('writes new saves at the current schema version', () => {
    const s = mem();
    new SaveStore(s).save(defaultSave());
    const blob = JSON.parse(s.map.get('assimilate.save')!);
    expect(blob.schemaVersion).toBe(CURRENT_VERSION);
    expect(CURRENT_VERSION).toBe(4);
  });

  it('migrates a v3 save up to v4, adding the tower-star fields', () => {
    clearMigrationLog();
    const v3 = {
      schemaVersion: 3,
      data: {
        shards: 5, upgrades: {}, bestWave: 2, totalRuns: 1, lifetimeShards: 5, cardsSeen: 0,
        stagesCleared: 0, bestStage: 0, bestEndlessScore: 0, bestEndlessWave: 0,
        essence: 0, components: 0, catalyst: 0, codex: { enemies: [], biomes: [], cards: [] }, achievements: [], title: '',
        lootMeter: 0, lootBoxes: 0, lootBoxesLifetime: 0,
      },
    };
    const r = parseImport(JSON.stringify(v3));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.genomeShards).toBe(0);
      expect(r.data.stars).toEqual({});
    }
    expect(getMigrationLog().some((e) => e.from === 3 && e.to === 4)).toBe(true);
  });

  it('round-trips a current save through a stored blob unchanged (preserve current saves)', () => {
    const store = new SaveStore(mem());
    const data: SaveData = { ...defaultSave(), shards: 500, essence: 30, catalyst: 4, bestStage: 9, codex: { enemies: ['runner'], biomes: ['marsh'], cards: ['twin_fang'] }, achievements: ['first_run'], title: 'Defender' };
    store.save(data);
    expect(store.load()).toEqual(data); // no loss, no drift
  });
});

describe('quota-aware writes', () => {
  it('prunes the oldest backup on a quota error, then completes the write', () => {
    const map = new Map<string, string>();
    let freed = false;
    const s: StorageLike & { map: Map<string, string> } = {
      map,
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        if (!freed) throw new Error('QuotaExceededError'); // full until something is removed
        map.set(k, v);
      },
      removeItem: (k) => {
        map.delete(k);
        freed = true; // freeing space lets the retry succeed
      },
    };
    // Seed a backup index entry directly so there is an oldest backup to prune.
    map.set('assimilate.save.baklist', JSON.stringify([{ id: 'x', at: '2020-01-01' }]));

    const store = new SaveStore(s);
    expect(store.save({ ...defaultSave(), shards: 5 })).toBe(true);
    expect(store.listBackups().length).toBe(0); // oldest backup was dropped to free space
    expect(store.load().shards).toBe(5);
  });

  it('reports failure when a write fails and there is nothing to prune', () => {
    const s: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {},
    };
    expect(new SaveStore(s).save({ ...defaultSave(), shards: 1 })).toBe(false);
  });
});

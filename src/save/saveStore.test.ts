import { describe, it, expect } from 'vitest';
import { SaveStore, defaultSave, parseImport, serializeExport } from './saveStore';
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
});
